/**
 * WisdomService — Matching, ranking, and reflect prompt generation.
 *
 * Phase 1 (MVP):
 *   • Client-side scoring against the static library — no API call required.
 *   • Reflect prompt generation (Job 4) — one Claude Haiku call, user-triggered.
 *
 * Phase 2 additions (not yet implemented):
 *   • Job 1: extractJournalSignal() — post-entry signal extraction via Claude Haiku.
 *   • Job 3: rankWithClaude() — server-side semantic ranking for richer matching.
 *
 * Feed composition: 70% acute (journal-matched) · 20% dispositional · 10% stretch.
 * Total feed size: 5 shorts per session.
 */

import Anthropic from '@anthropic-ai/sdk';
import { WisdomShort, JournalSignal, FeedSelection } from '../types';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import { StorageService } from './StorageService';

// ── Scoring ────────────────────────────────────────────────────────────────────

interface ScoredShort {
  short: WisdomShort;
  score: number;
}

/**
 * Score a short against a journal signal.
 * Higher = more relevant.
 */
function scoreShort(short: WisdomShort, signal: JournalSignal): number {
  let score = 0;

  for (const e of signal.emotional_states) {
    if (short.emotional_states.includes(e)) score += 3;
  }
  for (const c of signal.cognitive_patterns) {
    if (short.cognitive_patterns.includes(c)) score += 2;
  }
  for (const t of signal.themes) {
    if (short.themes.includes(t)) score += 2;
  }
  for (const v of signal.values_in_tension) {
    if (short.values.includes(v)) score += 1;
  }
  for (const n of signal.enneagram_hints) {
    if (short.enneagram_resonance.includes(n)) score += 1;
  }

  // Depth preference bonus
  if (short.depth === signal.depth_preference) score += 1;

  return score;
}

/**
 * Score a short as "dispositional" — general match regardless of acute signal.
 * Uses a lighter-weight heuristic based on themes only.
 */
function scoreDispositional(short: WisdomShort, seenIds: Set<string>): number {
  // Prefer unseen, prefer 'entry' depth for dispositional
  let score = seenIds.has(short.id) ? 0 : 2;
  if (short.depth === 'entry') score += 1;
  return score;
}

// ── Feed selection ─────────────────────────────────────────────────────────────

/**
 * Build a 5-short feed from the library.
 *
 * Composition:
 *   • 3 acute   (70%) — highest signal match, filtered by depth pref if set
 *   • 1 dispositional (20%) — different author/theme from acute picks
 *   • 1 stretch (10%) — lowest signal match (challenges the user a bit)
 *
 * When no journal signal is available, falls back to a well-distributed random
 * selection across authors.
 */
export function buildFeed(
  signal: JournalSignal | null,
  savedIds: Set<string>,
  seenIds: Set<string>,
  emotionFilter?: string,
): FeedSelection {
  let pool = [...SHORTS_LIBRARY];

  // Apply emotion filter if provided
  if (emotionFilter) {
    const filtered = pool.filter(s => s.emotional_states.includes(emotionFilter));
    if (filtered.length >= 3) pool = filtered;
  }

  if (!signal) {
    // No signal — distribute across authors, prefer unseen
    return buildFallbackFeed(pool, seenIds);
  }

  const scored: ScoredShort[] = pool.map(s => ({ short: s, score: scoreShort(s, signal) }));
  scored.sort((a, b) => b.score - a.score);

  const usedIds = new Set<string>();

  // Acute: top 3 scorers
  const acute: WisdomShort[] = [];
  for (const { short } of scored) {
    if (acute.length >= 3) break;
    if (usedIds.has(short.id)) continue;
    acute.push(short);
    usedIds.add(short.id);
  }

  // Dispositional: different author than any acute pick, prefer unseen
  const acuteAuthors = new Set(acute.map(s => s.source_author));
  const dispositionalCandidates = pool
    .filter(s => !usedIds.has(s.id) && !acuteAuthors.has(s.source_author))
    .map(s => ({ short: s, score: scoreDispositional(s, seenIds) }))
    .sort((a, b) => b.score - a.score);

  const dispositional: WisdomShort[] = [];
  if (dispositionalCandidates.length > 0) {
    dispositional.push(dispositionalCandidates[0].short);
    usedIds.add(dispositionalCandidates[0].short.id);
  }

  // Stretch: lowest scorer among remaining (not already picked)
  const stretch: WisdomShort[] = [];
  const remaining = scored.filter(({ short }) => !usedIds.has(short.id));
  if (remaining.length > 0) {
    stretch.push(remaining[remaining.length - 1].short);
  }

  return { acute, dispositional, stretch };
}

/**
 * Fallback feed when no journal signal is available.
 * Distributes across 3–4 different authors, prefers unseen shorts.
 */
function buildFallbackFeed(pool: WisdomShort[], seenIds: Set<string>): FeedSelection {
  // Shuffle pool, prefer unseen
  const unseen = pool.filter(s => !seenIds.has(s.id));
  const seen = pool.filter(s => seenIds.has(s.id));
  const ordered = [...unseen, ...seen];

  // Pick 5 across different authors
  const picked: WisdomShort[] = [];
  const usedAuthors = new Set<string>();
  for (const s of ordered) {
    if (picked.length >= 5) break;
    if (!usedAuthors.has(s.source_author) || usedAuthors.size >= 4) {
      picked.push(s);
      usedAuthors.add(s.source_author);
    }
  }
  // Fill remainder if needed
  for (const s of ordered) {
    if (picked.length >= 5) break;
    if (!picked.includes(s)) picked.push(s);
  }

  return {
    acute: picked.slice(0, 3),
    dispositional: picked.slice(3, 4),
    stretch: picked.slice(4, 5),
  };
}

/**
 * Flatten a FeedSelection into an ordered array: acute → dispositional → stretch.
 * Deduplicates in case of overlap.
 */
export function flattenFeed(feed: FeedSelection): WisdomShort[] {
  const seen = new Set<string>();
  const result: WisdomShort[] = [];
  for (const s of [...feed.acute, ...feed.dispositional, ...feed.stretch]) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      result.push(s);
    }
  }
  return result;
}

// ── Job 1: Journal signal extraction (Phase 2 — available but not auto-called) ──

/**
 * Extract a structured signal from the day's journal summary.
 * Targets <2 s (Claude Haiku). Returns null on failure or missing API key.
 *
 * Called post-entry in Phase 2; for Phase 1 the feed uses the stored signal
 * from the last time this ran (or falls back to no-signal mode).
 */
export async function extractJournalSignal(
  summaryText: string,
): Promise<JournalSignal | null> {
  try {
    const settings = await StorageService.getSettings();
    const apiKey = settings?.anthropicApiKey?.trim();
    if (!apiKey || !summaryText.trim()) return null;

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: `Extract a structured signal from this journal summary for content matching.
Return ONLY valid JSON:
{
  "emotional_states": [array of 1-4 strings, lowercase, e.g. "anxious", "restless", "unfulfilled"],
  "cognitive_patterns": [array of 1-3 strings, e.g. "rumination", "all-or-nothing", "perfectionism"],
  "themes": [array of 1-4 strings, e.g. "relationships", "work", "identity", "control"],
  "values_in_tension": [array of 0-2 strings, e.g. "freedom", "security"],
  "enneagram_hints": [array of 0-2 numbers 1-9],
  "depth_preference": "entry" | "mid" | "deep"
}
depth_preference: "entry" if surface venting/stress, "deep" if existential/identity, else "mid".`,
      messages: [{ role: 'user', content: `Journal summary:\n"""\n${summaryText.slice(0, 1500)}\n"""` }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as JournalSignal;
    await StorageService.saveJournalSignal(parsed);
    return parsed;
  } catch {
    return null;
  }
}

// ── Job 4: Reflect prompt generation ──────────────────────────────────────────

/**
 * Generate a single reflect prompt (≤20 words) seeded from a wisdom short.
 * User-triggered. Returns null on failure.
 */
export async function generateReflectPrompt(
  short: WisdomShort,
  journalContext?: string,
): Promise<string | null> {
  try {
    const settings = await StorageService.getSettings();
    const apiKey = settings?.anthropicApiKey?.trim();
    if (!apiKey) return null;

    const client = new Anthropic({ apiKey });

    const context = journalContext
      ? `\n\nToday's journal context:\n${journalContext.slice(0, 400)}`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system:
        'Generate a single journaling reflection prompt under 20 words. It must arise naturally from the wisdom short provided. Phrase it as an open question directed at the reader. Return only the question — no quotes, no labels.',
      messages: [
        {
          role: 'user',
          content: `Wisdom short:\nTitle: "${short.title}"\nPullquote: "${short.pullquote}"${context}\n\nGenerate the reflect prompt:`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
    return text || null;
  } catch {
    return null;
  }
}
