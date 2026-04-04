/**
 * ExpenseService — real-time expense extraction from journal transcripts + receipt photos.
 *
 * Flow:
 *   1. Text-only note  → keyword guard → Claude Haiku extracts amounts/categories
 *   2. Note with photo → Claude Vision (opus) reads the receipt/screenshot directly,
 *      then falls back to text extraction if no photo amounts found
 *
 * Always call fire-and-forget — never throws.
 * Deduplication via sourceTranscriptId in StorageService.addExpenses().
 */

import { claudeProxy } from './AIProxy';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageService } from './StorageService';
import { ExpenseEntry } from '../types';

// ── Categories ────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Shopping',
  'Health & Wellness',
  'Entertainment',
  'Bills & Utilities',
  'Subscriptions',
  'Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// ── Keyword guard — skip API call if text has no spending signals ─────────────

const EXPENSE_PATTERN =
  /[₹$£€]|\b(spent|spend|paid|pay|bought|buy|ordered|order|cost|costs|costing|charged|charge|fee|bill|receipt|purchase|expense|rupees?|rs\.?|inr|bucks?|grand)\b/i;

export function mayContainExpense(text: string): boolean {
  return EXPENSE_PATTERN.test(text);
}

// ── MIME type from URI ────────────────────────────────────────────────────────

function getMimeType(uri: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png')                      return 'image/png';
  if (ext === 'webp')                     return 'image/webp';
  if (ext === 'gif')                      return 'image/gif';
  return 'image/jpeg'; // default for jpg / heic / heif / unknown
}

// ── Shared response parser ────────────────────────────────────────────────────

function parseExpenses(
  raw: string,
  date: string,
  transcriptId: string,
): ExpenseEntry[] {
  const start = raw.indexOf('[');
  const end   = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: Array<{ amount: unknown; category: unknown; description: unknown }>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return [];

  const now = Date.now();
  return parsed
    .filter(e => typeof e.amount === 'number' && (e.amount as number) > 0)
    .map((e, i) => ({
      id:                 `exp_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      amount:             e.amount as number,
      currency:           'INR',
      category:           EXPENSE_CATEGORIES.includes(e.category as ExpenseCategory)
                            ? (e.category as string)
                            : 'Other',
      description:        typeof e.description === 'string' ? e.description.slice(0, 80) : '',
      date,
      timestamp:          now,
      sourceTranscriptId: transcriptId,
    }));
}

// ── Vision extraction (receipt / UPI screenshot) ──────────────────────────────

async function extractFromPhoto(
  photoUri: string,
  date: string,
  transcriptId: string,
): Promise<ExpenseEntry[]> {
  try {
    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mimeType = getMimeType(photoUri);
    const categoryList = EXPENSE_CATEGORIES.map(c => `"${c}"`).join(', ');

    const response = await claudeProxy.messages.create({
      model: 'claude-opus-4-5', // opus-4-5 supports vision
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: `This is a receipt, bill, or payment screenshot. Extract all expense line items visible.
Return ONLY a JSON array — no explanation, no markdown.

Each object must have:
- "amount": number (total amount in ₹ — use the grand total if it's a receipt, individual item if multiple separate bills)
- "category": one of ${categoryList}
- "description": string (merchant name or item, 3–6 words)

Rules:
- For a single receipt with a grand total, return ONE entry with the total
- For a payment confirmation (e.g. UPI, Google Pay), return ONE entry with the paid amount
- If the image is not a bill/receipt/payment screen, return []
- Do NOT invent amounts not visible in the image

JSON array only:`,
            },
          ],
        },
      ],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return parseExpenses(raw, date, transcriptId);
  } catch {
    return [];
  }
}

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractFromText(
  text: string,
  date: string,
  transcriptId: string,
): Promise<ExpenseEntry[]> {
  if (!mayContainExpense(text)) return [];

  const categoryList = EXPENSE_CATEGORIES.map(c => `"${c}"`).join(', ');

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `Extract all expense/spending mentions from this journal entry. Return ONLY a JSON array — no explanation, no markdown.

Each object must have:
- "amount": number (the rupee/currency amount as a plain number)
- "category": one of ${categoryList}
- "description": string (3–6 words describing what was bought/paid for)

Rules:
- Only include items with a specific numeric amount (skip vague mentions like "spent a lot")
- If no currency symbol but context is clear (e.g. "pizza for 450"), assume ₹
- Do NOT invent items not explicitly mentioned
- Return [] if nothing qualifies

Journal entry:
"""
${text.slice(0, 2000)}
"""

JSON array only:`,
      },
    ],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  return parseExpenses(raw, date, transcriptId);
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extracts expense entries from a transcript (and optional photo) and saves them.
 * Designed to be called fire-and-forget — never throws.
 *
 * @param text           Transcript text
 * @param date           YYYY-MM-DD date of the entry
 * @param transcriptId   Source ID for deduplication
 * @param photoUri       Optional local file URI of an attached receipt/screenshot
 */
export async function extractAndSaveExpenses(
  text: string,
  date: string,
  transcriptId: string,
  photoUri?: string,
): Promise<void> {
  // Skip entirely if no photo and no expense keywords in text
  if (!photoUri && !mayContainExpense(text)) return;

  try {
    const entries: ExpenseEntry[] = [];

    // 1. Vision OCR if a photo is attached
    if (photoUri) {
      const photoEntries = await extractFromPhoto(photoUri, date, transcriptId + '_photo');
      entries.push(...photoEntries);
    }

    // 2. Text extraction (always runs if text has keywords — catches spoken mentions
    //    even when a receipt photo is also present)
    if (mayContainExpense(text)) {
      const textEntries = await extractFromText(text, date, transcriptId);
      entries.push(...textEntries);
    }

    if (entries.length > 0) {
      await StorageService.addExpenses(entries);
    }
  } catch {
    // Fire-and-forget — never crash the main transcription flow
  }
}

// ── Aggregation helpers used by the UI ───────────────────────────────────────

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
  entries: ExpenseEntry[];
}

/** Group expenses by category, sorted by total descending */
export function groupByCategory(expenses: ExpenseEntry[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    if (!map.has(e.category)) {
      map.set(e.category, { category: e.category, total: 0, count: 0, entries: [] });
    }
    const g = map.get(e.category)!;
    g.total += e.amount;
    g.count += 1;
    g.entries.push(e);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/** Format a rupee amount compactly */
export function formatINR(amount: number): string {
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000)   return `₹${(amount / 1_000).toFixed(1)}k`;
  return `₹${Math.round(amount)}`;
}
