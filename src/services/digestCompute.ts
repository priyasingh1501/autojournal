/**
 * Pure digest compute for ff_day_close_model.
 *
 * No AsyncStorage, no Claude, no React Native — kept pure so tests and the
 * cache layer share the exact same logic. `DigestService` wraps this with
 * persistence + invalidation.
 *
 * The digest is factual, not reflective: counts, hour buckets, dominant
 * emotions by frequency, and which of the user's active intentions were
 * referenced by today's entries (pure keyword match — no model call).
 */

import { DayDigest, Intention, TranscriptEntry } from '../types';

// Words we skip when deriving "touch" keywords from an intention's text —
// matching "the" or "to" would false-positive most entries.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'be', 'before', 'but', 'by', 'for', 'from', 'i',
  'if', 'in', 'is', 'it', 'my', 'no', 'not', 'of', 'on', 'or', 'so', 'the',
  'then', 'to', 'up', 'was', 'we', 'when', 'will', 'with', 'you', 'your',
  'more', 'less', 'some', 'any', 'do', 'don', 't', 's',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Content tokens from an intention's text — len >= 4, not a stopword. */
export function intentionKeywords(intentionText: string): string[] {
  const out: string[] = [];
  for (const tok of tokenize(intentionText)) {
    if (tok.length < 4) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return Array.from(new Set(out));
}

/** True if any keyword from the intention appears in entry text. */
export function intentionTouchesEntry(
  intention: Intention,
  entryText: string,
): boolean {
  const keywords = intentionKeywords(intention.text);
  if (keywords.length === 0) return false;
  const haystack = ' ' + entryText.toLowerCase() + ' ';
  for (const kw of keywords) {
    if (haystack.includes(kw)) return true;
  }
  return false;
}

function hourOf(tsMs: number): number {
  return new Date(tsMs).getHours();
}

/**
 * Compute a DayDigest from entries + active intentions for the given date.
 * Pure — does not read or write storage. `computedAt` defaults to `now`.
 */
export function computeDigest(
  date: string,
  entries: TranscriptEntry[],
  activeIntentions: Intention[],
  now: number = Date.now(),
): DayDigest {
  // Hour buckets — always 24 entries so the UI can render a stable row.
  const buckets: number[] = new Array(24).fill(0);
  for (const e of entries) {
    const h = hourOf(e.timestamp);
    if (h >= 0 && h < 24) buckets[h]++;
  }

  // Dominant emotions — flatten tags, count, top 3.
  const emotionCounts = new Map<string, number>();
  for (const e of entries) {
    for (const tag of e.emotionTags ?? []) {
      emotionCounts.set(tag, (emotionCounts.get(tag) ?? 0) + 1);
    }
  }
  const dominantEmotions = Array.from(emotionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  // Intentions touched — set of intention IDs whose keywords appeared in ANY entry.
  const touched = new Set<string>();
  for (const intent of activeIntentions) {
    for (const e of entries) {
      if (!e.text) continue;
      if (intentionTouchesEntry(intent, e.text)) {
        touched.add(intent.id);
        break;
      }
    }
  }

  return {
    date,
    entryCount: entries.length,
    entriesByHour: buckets.map((count, hour) => ({ hour, count })),
    dominantEmotions,
    intentionsMentioned: Array.from(touched),
    computedAt: now,
  };
}
