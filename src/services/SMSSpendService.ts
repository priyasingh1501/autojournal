/**
 * SMSSpendService — reads bank/UPI transaction SMS on Android and parses
 * debit transactions into categorised spend totals for the monthly insights.
 *
 * Android-only. Does nothing on iOS (returns empty array silently).
 * Requires READ_SMS permission granted at runtime.
 * Will NOT work in Expo Go (native module). Needs a production/EAS build.
 */

import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpendCategory, TranscriptEntry } from '../types';

// ── Category keyword map (Indian bank/UPI SMS) ────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': [
    'swiggy', 'zomato', 'dunzo', 'mcdonalds', 'mcdonald', 'kfc', 'dominos',
    'domino', 'pizza hut', 'pizza', 'burger king', 'subway', 'starbucks',
    'ccd', 'cafe coffee', 'chaayos', 'haldirams', 'barbeque nation',
    'restaurant', 'dineout', 'eatsure', 'rebel foods', 'faasos',
  ],
  'Groceries': [
    'bigbasket', 'big basket', 'blinkit', 'zepto', 'instamart',
    'jiomart', 'dmart', 'd-mart', 'more supermarket', 'star bazaar',
    'reliance fresh', 'nature basket', 'grocery', 'kirana', 'vegetables',
    'fruits', 'milk dairy',
  ],
  'Shopping': [
    'amazon', 'flipkart', 'myntra', 'meesho', 'nykaa', 'ajio',
    'snapdeal', 'tatacliq', 'tata cliq', 'croma', 'reliance digital',
    'vijay sales', 'sangeetha', 'shoppers stop', 'lifestyle', 'westside',
    'h&m', 'zara', 'uniqlo', 'max fashion',
  ],
  'Transport': [
    'ola', 'uber', 'rapido', 'yulu', 'bounce', 'irctc', 'makemytrip',
    'goibibo', 'cleartrip', 'easemytrip', 'redbus', 'abhibus',
    'petrol', 'fuel', 'hpcl', 'bpcl', 'iocl', 'hp petrol', 'bharat petroleum',
    'indian oil', 'metro card', 'bus pass', 'fastag',
  ],
  'Entertainment': [
    'netflix', 'hotstar', 'disney', 'prime video', 'spotify', 'youtube premium',
    'bookmyshow', 'pvr', 'inox', 'zee5', 'sonyliv', 'jio cinema',
    'mxplayer', 'apple music', 'wynk', 'gaana', 'game',
  ],
  'Health & Fitness': [
    'apollo', 'medplus', 'netmeds', 'pharmeasy', '1mg', 'tata 1mg',
    'practo', 'lybrate', 'thyrocare', 'dr lal', 'metropolis',
    'pharmacy', 'chemist', 'hospital', 'clinic', 'nursing home',
    'gym', 'fitness', 'cult fit', 'cultfit', 'fitternity', 'yoga',
  ],
  'Bills & Utilities': [
    'electricity', 'bescom', 'msedcl', 'tata power', 'adani electricity',
    'water bill', 'gas bill', 'broadband', 'airtel', 'jio', 'vi ',
    'bsnl', 'postpaid', 'prepaid recharge', 'recharge', 'dth',
    'tata sky', 'dish tv', 'hathway',
  ],
  'Education': [
    'udemy', 'coursera', 'byju', 'vedantu', 'unacademy', 'physicswallah',
    'pw ', 'skillshare', 'linkedin learning', 'tutoring', 'classes',
    'institute', 'school fees', 'college fees', 'exam fee',
  ],
  'Travel': [
    'oyo', 'treebo', 'fabhotel', 'zostel', 'airbnb', 'mmt hotel',
    'goibibo hotel', 'indigo', 'spicejet', 'air india', 'vistara',
    'akasa', 'go first', 'flight ticket', 'railway ticket',
  ],
};

// Senders known to send bank/transaction SMS
const BANK_SENDERS = [
  'hdfcbk', 'hdfcbank', 'hdfc', 'icicibk', 'icicibank', 'icici',
  'sbiinb', 'sbiupi', 'sbipsg', 'sbi', 'axisbk', 'axisbank', 'axis',
  'kotakbk', 'kotak', 'yesbank', 'idbibank', 'idbi', 'indusind',
  'paytm', 'phonepe', 'googlepay', 'gpay', 'bhim', 'upi',
  'amzpay', 'amazonpay', 'mobikwik', 'freecharge',
  'citi', 'citibank', 'sc ', 'stanc', 'standardchartered',
  'rbl', 'federal', 'idfcfirst', 'idfc',
];

// ── Amount extraction ─────────────────────────────────────────────────────────

const AMOUNT_PATTERNS = [
  /(?:rs\.?|inr\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr\.?|₹)/i,
  /(?:debited|spent|paid|deducted)\s+(?:by|for|at|via)?\s*(?:rs\.?|inr\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /amount\s*(?:of)?\s*(?:rs\.?|inr\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
];

function parseAmount(body: string): number | null {
  for (const re of AMOUNT_PATTERNS) {
    const m = body.match(re);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 10_000_000) return val;
    }
  }
  return null;
}

// ── Debit detection ───────────────────────────────────────────────────────────

const DEBIT_KEYWORDS  = ['debited', 'spent', 'paid', 'payment', 'deducted', 'withdrawn', 'purchase', 'transaction', 'used for', 'used at'];
const CREDIT_KEYWORDS = ['credited', 'received', 'refund', 'cashback', 'reversal', 'transferred to you'];

function isDebit(body: string): boolean {
  const lower = body.toLowerCase();
  const hasCredit = CREDIT_KEYWORDS.some(k => lower.includes(k));
  if (hasCredit) return false;
  return DEBIT_KEYWORDS.some(k => lower.includes(k));
}

function isFromBank(address: string): boolean {
  const lower = (address ?? '').toLowerCase().replace(/[-_\s]/g, '');
  return BANK_SENDERS.some(s => lower.includes(s.replace(/\s/g, '')));
}

// ── Categorise ────────────────────────────────────────────────────────────────

function categorise(body: string): string {
  const lower = body.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'Other';
}

// ── Level thresholds (₹/month — adjustable) ──────────────────────────────────

const LEVEL_THRESHOLDS: Record<string, { medium: number; high: number }> = {
  'Food & Dining':    { medium: 2_000,  high: 5_000  },
  'Groceries':        { medium: 3_000,  high: 7_000  },
  'Shopping':         { medium: 3_000,  high: 8_000  },
  'Transport':        { medium: 1_500,  high: 4_000  },
  'Entertainment':    { medium: 500,    high: 1_500  },
  'Health & Fitness': { medium: 1_000,  high: 3_000  },
  'Bills & Utilities':{ medium: 1_500,  high: 4_000  },
  'Education':        { medium: 1_000,  high: 5_000  },
  'Travel':           { medium: 3_000,  high: 10_000 },
  'Other':            { medium: 1_000,  high: 3_000  },
};

function levelFor(category: string, amount: number): 'low' | 'medium' | 'high' {
  const t = LEVEL_THRESHOLDS[category] ?? { medium: 1_500, high: 4_000 };
  if (amount >= t.high)   return 'high';
  if (amount >= t.medium) return 'medium';
  return 'low';
}

function formatAmount(amount: number): string {
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000)    return `₹${(amount / 1_000).toFixed(1)}k`;
  return `₹${Math.round(amount)}`;
}

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestSMSPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (already) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: 'Read SMS for Spend Tracking',
        message:
          'untangle reads your bank SMS to automatically track your monthly spending by category. ' +
          'Your messages are processed on-device and never sent anywhere.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'No thanks',
        buttonPositive: 'Allow',
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      Alert.alert(
        'SMS Permission Needed',
        'Enable SMS access in Settings to automatically track your spending from bank messages.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
    return false;
  } catch {
    return false;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SMSTransaction {
  amount: number;
  category: string;
  date: string; // YYYY-MM-DD
  body: string;
  merchant: string;
}

// Extract a short merchant/payee hint from SMS body
function extractMerchant(body: string): string {
  const lower = body.toLowerCase();
  // "paid to MERCHANT" / "at MERCHANT" / "to VPA merchant@upi"
  const patterns = [
    /paid\s+(?:to|at)\s+([A-Za-z0-9& ]{2,24})/i,
    /(?:to|at)\s+([A-Za-z0-9& ]{2,24})\s+(?:via|on|for)/i,
    /(?:transaction|txn|debit).*?(?:at|to)\s+([A-Za-z0-9& ]{2,24})/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[1].trim();
  }
  // Fall back to category keyword that matched
  for (const [, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
    }
  }
  return 'Bank debit';
}

/**
 * Returns individual debit transactions from the last `days` days, most recent first.
 * Max 30 results. Returns [] on iOS or if permission denied.
 */
export async function getRecentTransactions(days = 7): Promise<SMSTransaction[]> {
  if (Platform.OS !== 'android') return [];

  let SmsAndroid: any;
  try {
    SmsAndroid = require('react-native-get-sms-android').default;
  } catch {
    return [];
  }

  const granted = await requestSMSPermission();
  if (!granted) return [];

  const endMs   = Date.now();
  const startMs = endMs - days * 86_400_000;

  const messages: any[] = await new Promise((resolve) => {
    SmsAndroid.list(
      JSON.stringify({ box: 'inbox', minDate: startMs, maxDate: endMs, maxCount: 200 }),
      () => resolve([]),
      (_count: number, smsList: string) => {
        try { resolve(JSON.parse(smsList)); } catch { resolve([]); }
      },
    );
  });

  return messages
    .filter(msg => isFromBank(msg.address ?? '') && isDebit(msg.body ?? ''))
    .reduce<SMSTransaction[]>((acc, msg) => {
      const amount = parseAmount(msg.body ?? '');
      if (!amount) return acc;
      const dateMs = parseInt(msg.date ?? '0', 10);
      acc.push({
        amount,
        category: categorise(msg.body ?? ''),
        date: new Date(dateMs || Date.now()).toISOString().split('T')[0],
        body: msg.body ?? '',
        merchant: extractMerchant(msg.body ?? ''),
      });
      return acc;
    }, [])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

/**
 * Reads SMS from the given month and returns per-category spend totals.
 * Returns an empty array if on iOS, permission denied, or no bank SMS found.
 */
export async function getSMSSpendCategories(
  year: number,
  month: number, // 1-indexed
): Promise<SpendCategory[]> {
  if (Platform.OS !== 'android') return [];

  // Lazy-require so iOS bundle is not broken by missing native module
  let SmsAndroid: any;
  try {
    SmsAndroid = require('react-native-get-sms-android').default;
  } catch {
    return []; // not installed / not available
  }

  const granted = await requestSMSPermission();
  if (!granted) return [];

  // Month window in ms
  const startMs = new Date(year, month - 1, 1).getTime();
  const endMs   = new Date(year, month, 0, 23, 59, 59, 999).getTime(); // last day of month

  const messages: any[] = await new Promise((resolve, reject) => {
    SmsAndroid.list(
      JSON.stringify({
        box:    'inbox',
        minDate: startMs,
        maxDate: endMs,
        maxCount: 500,
      }),
      (fail: string) => reject(new Error(fail)),
      (_count: number, smsList: string) => {
        try { resolve(JSON.parse(smsList)); }
        catch { resolve([]); }
      },
    );
  }).catch(() => []) as any[];

  if (!messages.length) return [];

  // Filter debit bank SMS
  const debits = messages.filter(msg =>
    isFromBank(msg.address ?? '') && isDebit(msg.body ?? ''),
  );

  // Aggregate by category
  const totals: Record<string, { amount: number; count: number }> = {};

  for (const msg of debits) {
    const amount = parseAmount(msg.body ?? '');
    if (!amount) continue;
    const cat = categorise(msg.body ?? '');
    if (!totals[cat]) totals[cat] = { amount: 0, count: 0 };
    totals[cat].amount += amount;
    totals[cat].count  += 1;
  }

  // Convert to SpendCategory[], sorted by amount desc, skip tiny amounts
  return Object.entries(totals)
    .filter(([, v]) => v.amount >= 50)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .map(([name, { amount, count }]) => ({
      name,
      level:   levelFor(name, amount),
      summary: `${formatAmount(amount)} across ${count} transaction${count !== 1 ? 's' : ''}`,
      amount,
      count,
      source:  'sms' as const,
    }));
}

const SMS_SYNCED_KEY = 'sms_synced_ids';

/**
 * Reads recent bank SMS and saves each new debit transaction as a note
 * for the correct day, so it appears in the transcript list and gets
 * included in the daily summary. Skips transactions already saved.
 * Returns the number of new notes added.
 */
export async function syncSMSTransactionsToNotes(): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  let SmsAndroid: any;
  try {
    SmsAndroid = require('react-native-get-sms-android').default;
  } catch {
    return 0;
  }

  const granted = await requestSMSPermission();
  if (!granted) return 0;

  // Read last 30 days to catch anything missed
  const endMs   = Date.now();
  const startMs = endMs - 30 * 86_400_000;

  const messages: any[] = await new Promise((resolve) => {
    SmsAndroid.list(
      JSON.stringify({ box: 'inbox', minDate: startMs, maxDate: endMs, maxCount: 500 }),
      () => resolve([]),
      (_count: number, smsList: string) => {
        try { resolve(JSON.parse(smsList)); } catch { resolve([]); }
      },
    );
  });

  const debits = messages.filter(
    msg => isFromBank(msg.address ?? '') && isDebit(msg.body ?? ''),
  );

  // Load already-synced SMS IDs to avoid duplicate notes
  const syncedRaw = await AsyncStorage.getItem(SMS_SYNCED_KEY);
  const synced: Set<string> = new Set(syncedRaw ? JSON.parse(syncedRaw) : []);

  const TRANSCRIPTS_PREFIX = 'transcripts_';
  let added = 0;

  for (const msg of debits) {
    const msgId: string = msg._id?.toString() ?? `${msg.date}_${msg.address}`;
    if (synced.has(msgId)) continue;

    const amount = parseAmount(msg.body ?? '');
    if (!amount) continue;

    const category = categorise(msg.body ?? '');
    const merchant = extractMerchant(msg.body ?? '');
    const dateMs   = parseInt(msg.date ?? '0', 10) || Date.now();
    const date     = new Date(dateMs).toISOString().split('T')[0];

    const note: TranscriptEntry = {
      id:        `sms_${msgId}`,
      timestamp: dateMs,
      duration:  0,
      kind:      'manual',
      text:      `Spent ${formatAmount(amount)} at ${merchant} (${category})`,
    };

    const key = TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    const entries: TranscriptEntry[] = existing ? JSON.parse(existing) : [];

    // Skip if a note with this id already exists
    if (!entries.some(e => e.id === note.id)) {
      entries.push(note);
      await AsyncStorage.setItem(key, JSON.stringify(entries));
      added++;
    }

    synced.add(msgId);
  }

  await AsyncStorage.setItem(SMS_SYNCED_KEY, JSON.stringify([...synced]));
  return added;
}
