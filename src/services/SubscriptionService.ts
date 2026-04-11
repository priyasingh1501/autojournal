/**
 * SubscriptionService — manages free trial, usage gates, and Pro subscription state.
 *
 * Pricing:
 *   - 14-day free trial of everything on first install
 *   - Free tier after trial: 3 AI summaries/week, 1 insight generate per tab (soft gate), 1 conversation session
 *   - Pro: $8.99/month or $59.99/year (unlimited everything)
 *
 * Soft gate: the first use of each Pro feature is always free so users experience the value
 * before hitting the paywall on any subsequent use.
 *
 * RevenueCat product IDs (create these in App Store Connect + Google Play Console):
 *   Monthly: 'untangle_pro_monthly'   → $8.99/month
 *   Annual:  'untangle_pro_annual'    → $59.99/year
 * RevenueCat entitlement ID: 'pro'
 * RevenueCat offering ID: 'default'
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

export type InsightTab = 'you' | 'values' | 'thinking' | 'story';
export type ProPlan = 'monthly' | 'annual';

const TRIAL_DAYS = 14;
const FREE_SUMMARIES_PER_WEEK = 3;

const KEYS = {
  INSTALL_DATE:        'sub_install_date',
  IS_SUBSCRIBED:       'sub_is_subscribed',
  SUMMARIES_USAGE:     'sub_summaries_usage',      // JSON: { weekKey: string, count: number }
  INSIGHTS_GENERATED:  'sub_insights_generated',   // JSON: { you: bool, values: bool, thinking: bool, story: bool }
  CONVERSATION_USED:   'sub_conversation_used',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/** ISO date string for the Sunday that starts the current week. */
function currentWeekKey(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

async function getOrSetInstallDate(): Promise<Date> {
  let stored = await AsyncStorage.getItem(KEYS.INSTALL_DATE);
  if (!stored) {
    stored = new Date().toISOString();
    await AsyncStorage.setItem(KEYS.INSTALL_DATE, stored);
  }
  return new Date(stored);
}

// ── Trial & subscription status ───────────────────────────────────────────────

async function isInTrial(): Promise<boolean> {
  const install = await getOrSetInstallDate();
  const daysDiff = (Date.now() - install.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff < TRIAL_DAYS;
}

async function isSubscribed(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch {
    // Falls back to local flag when RevenueCat is unreachable (no network, Expo Go, etc.)
    return (await AsyncStorage.getItem(KEYS.IS_SUBSCRIBED)) === 'true';
  }
}

/** Returns true when the user has unrestricted access (trial or active subscription). */
async function hasPro(): Promise<boolean> {
  return (await isInTrial()) || (await isSubscribed());
}

/** Days left in the free trial (0 if expired or subscribed). */
async function getTrialDaysRemaining(): Promise<number> {
  if (await isSubscribed()) return 0;
  const install = await getOrSetInstallDate();
  const daysDiff = (Date.now() - install.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - daysDiff));
}

// ── AI Summaries gate ─────────────────────────────────────────────────────────

async function getSummaryUsage(): Promise<{ weekKey: string; count: number }> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SUMMARIES_USAGE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { weekKey: currentWeekKey(), count: 0 };
}

async function getWeeklySummaryCount(): Promise<number> {
  const usage = await getSummaryUsage();
  if (usage.weekKey !== currentWeekKey()) return 0;
  return usage.count;
}

async function canGenerateSummary(): Promise<boolean> {
  if (await hasPro()) return true;
  const usage = await getSummaryUsage();
  if (usage.weekKey !== currentWeekKey()) return true; // new week resets the count
  return usage.count < FREE_SUMMARIES_PER_WEEK;
}

async function recordSummaryGenerated(): Promise<void> {
  const usage = await getSummaryUsage();
  const weekKey = currentWeekKey();
  await AsyncStorage.setItem(
    KEYS.SUMMARIES_USAGE,
    JSON.stringify({
      weekKey,
      count: usage.weekKey === weekKey ? usage.count + 1 : 1,
    }),
  );
}

// ── Insights gate ─────────────────────────────────────────────────────────────

async function getInsightsGenerated(): Promise<Record<InsightTab, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.INSIGHTS_GENERATED);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { you: false, values: false, thinking: false, story: false };
}

/**
 * First generate per tab is always free (soft gate).
 * Any regeneration (tab already generated once) requires Pro.
 */
async function canGenerateInsight(tab: InsightTab): Promise<boolean> {
  if (await hasPro()) return true;
  const generated = await getInsightsGenerated();
  return !generated[tab];
}

async function recordInsightGenerated(tab: InsightTab): Promise<void> {
  const generated = await getInsightsGenerated();
  generated[tab] = true;
  await AsyncStorage.setItem(KEYS.INSIGHTS_GENERATED, JSON.stringify(generated));
}

// ── Conversation gate ─────────────────────────────────────────────────────────

/** First conversation session (Call or Chat) is free. Subsequent sessions require Pro. */
async function canUseConversation(): Promise<boolean> {
  if (await hasPro()) return true;
  return (await AsyncStorage.getItem(KEYS.CONVERSATION_USED)) !== 'true';
}

async function recordConversationUsed(): Promise<void> {
  await AsyncStorage.setItem(KEYS.CONVERSATION_USED, 'true');
}

// ── Purchase ──────────────────────────────────────────────────────────────────

async function purchasePro(plan: ProPlan): Promise<boolean> {
  let offerings;
  try {
    offerings = await Purchases.getOfferings();
  } catch {
    throw new Error('In-app purchases are not available in this environment.');
  }
  const current = offerings.current;
  if (!current) throw new Error('No offerings available. Please try again later.');

  let pkg: PurchasesPackage | null = null;
  if (plan === 'annual') {
    pkg = current.annual ?? current.availablePackages.find(p => p.identifier.includes('annual')) ?? null;
  } else {
    pkg = current.monthly ?? current.availablePackages.find(p => p.identifier.includes('monthly')) ?? null;
  }
  if (!pkg) throw new Error('Selected plan is not available. Please try again later.');

  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const active = customerInfo.entitlements.active['pro'] !== undefined;
  await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, active ? 'true' : 'false');
  return active;
}

async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const active = customerInfo.entitlements.active['pro'] !== undefined;
    await AsyncStorage.setItem(KEYS.IS_SUBSCRIBED, active ? 'true' : 'false');
    return active;
  } catch {
    throw new Error('In-app purchases are not available in this environment.');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const SubscriptionService = {
  isInTrial,
  isSubscribed,
  hasPro,
  getTrialDaysRemaining,

  canGenerateSummary,
  recordSummaryGenerated,
  getWeeklySummaryCount,

  canGenerateInsight,
  recordInsightGenerated,

  canUseConversation,
  recordConversationUsed,

  purchasePro,
  restorePurchases,

  TRIAL_DAYS,
  FREE_SUMMARIES_PER_WEEK,
};
