/**
 * WisdomService — Matching, ranking, and reflect prompt generation.
 *
 * Feed refresh model:
 *   • Daily rotation  — date-seeded deterministic shuffle; same order all day, new order tomorrow.
 *   • Mood signal     — user picks a mood on the screen; maps to a JournalSignal and re-ranks.
 *   • Journal signal  — extracted post-entry (Phase 2); overrides mood if fresher.
 */

import Anthropic from '@anthropic-ai/sdk';
import { WisdomShort, JournalSignal, FeedSelection } from '../types';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import { StorageService } from './StorageService';

// ── Mood definitions ───────────────────────────────────────────────────────────

export interface Mood {
  id: string;
  label: string;
  emoji: string;
  signal: JournalSignal;
}

export const MOODS: Mood[] = [
  {
    id: 'heavy',
    label: 'Heavy',
    emoji: '🌧️',
    signal: {
      emotional_states: ['hopeless', 'stuck', 'numb', 'grieving'],
      cognitive_patterns: ['rumination', 'all-or-nothing', 'learned-helplessness'],
      themes: ['suffering', 'meaning', 'resilience'],
      values_in_tension: ['meaning', 'freedom'],
      enneagram_hints: [4, 9],
      depth_preference: 'mid',
    },
  },
  {
    id: 'scattered',
    label: 'Scattered',
    emoji: '🌀',
    signal: {
      emotional_states: ['overwhelmed', 'anxious', 'restless', 'distracted'],
      cognitive_patterns: ['over-analysis', 'future-orientation', 'catastrophising'],
      themes: ['stress', 'clarity', 'presence'],
      values_in_tension: ['clarity', 'peace'],
      enneagram_hints: [6, 7],
      depth_preference: 'entry',
    },
  },
  {
    id: 'frustrated',
    label: 'Frustrated',
    emoji: '🔥',
    signal: {
      emotional_states: ['angry', 'resentful', 'frustrated', 'conflicted'],
      cognitive_patterns: ['should-statements', 'personalisation', 'all-or-nothing'],
      themes: ['control', 'expectations', 'relationships'],
      values_in_tension: ['fairness', 'integrity'],
      enneagram_hints: [1, 8],
      depth_preference: 'entry',
    },
  },
  {
    id: 'comparing',
    label: 'Comparing',
    emoji: '⚖️',
    signal: {
      emotional_states: ['comparing', 'insecure', 'envious', 'approval-seeking'],
      cognitive_patterns: ['comparison', 'approval-seeking', 'social-evaluation'],
      themes: ['comparison', 'identity', 'status', 'self-worth'],
      values_in_tension: ['authenticity', 'self-worth'],
      enneagram_hints: [2, 3, 4],
      depth_preference: 'mid',
    },
  },
  {
    id: 'disconnected',
    label: 'Numb',
    emoji: '🫥',
    signal: {
      emotional_states: ['disconnected', 'numb', 'purposeless', 'empty'],
      cognitive_patterns: ['avoidance', 'emotional-suppression', 'withdrawal'],
      themes: ['meaning', 'identity', 'solitude', 'presence'],
      values_in_tension: ['meaning', 'connection'],
      enneagram_hints: [5, 9],
      depth_preference: 'deep',
    },
  },
  {
    id: 'lonely',
    label: 'Lonely',
    emoji: '🌑',
    signal: {
      emotional_states: ['lonely', 'isolated', 'disconnected', 'longing'],
      cognitive_patterns: ['withdrawal', 'personalisation', 'avoidance'],
      themes: ['loneliness', 'connection', 'belonging', 'relationships'],
      values_in_tension: ['connection', 'belonging'],
      enneagram_hints: [2, 4, 5],
      depth_preference: 'mid',
    },
  },
  {
    id: 'seeking',
    label: 'Seeking',
    emoji: '🔭',
    signal: {
      emotional_states: ['curious', 'seeking', 'purposeless', 'existential'],
      cognitive_patterns: ['over-analysis', 'philosophical'],
      themes: ['meaning', 'identity', 'growth', 'existence'],
      values_in_tension: ['meaning', 'truth'],
      enneagram_hints: [4, 5, 7],
      depth_preference: 'deep',
    },
  },
  {
    id: 'calm',
    label: 'Calm',
    emoji: '🌊',
    signal: {
      emotional_states: ['content', 'reflective', 'curious', 'open'],
      cognitive_patterns: ['reflective', 'analytical'],
      themes: ['presence', 'wisdom', 'growth', 'consciousness'],
      values_in_tension: [],
      enneagram_hints: [],
      depth_preference: 'deep',
    },
  },
];

// ── Date-seeded shuffle ────────────────────────────────────────────────────────

/**
 * Deterministic seeded PRNG (mulberry32).
 * Same seed → same sequence every time; different date → different sequence.
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from today's date so the shuffle changes daily but is stable within a day. */
function todaySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Fisher-Yates shuffle using a seeded PRNG. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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
 * Build the full feed from the library (all shorts, ranked).
 *
 * When a signal exists (mood picker or journal):
 *   • Shorts scored by relevance, sorted high → low.
 *   • Ties broken by today's date seed so the order is fresh each day.
 *
 * When no signal: daily seeded shuffle, interleaved by author, unseen first.
 */
export function buildFeed(
  signal: JournalSignal | null,
  savedIds: Set<string>,
  seenIds: Set<string>,
  emotionFilter?: string,
  library?: WisdomShort[],
): FeedSelection {
  let pool = library ? [...library] : [...SHORTS_LIBRARY];

  if (emotionFilter) {
    const filtered = pool.filter(s => s.emotional_states.includes(emotionFilter));
    if (filtered.length > 0) pool = filtered;
  }

  if (!signal) {
    return buildFallbackFeed(pool, seenIds);
  }

  // Score + stable-sort (ties broken by seeded shuffle position)
  const seed = todaySeed();
  const shuffled = seededShuffle(pool, seed);
  const scored: ScoredShort[] = shuffled.map(s => ({ short: s, score: scoreShort(s, signal) }));
  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  const acuteCutoff        = Math.ceil(total * 0.7);
  const dispositionalCutoff = Math.ceil(total * 0.9);

  return {
    acute:        scored.slice(0, acuteCutoff).map(s => s.short),
    dispositional: scored.slice(acuteCutoff, dispositionalCutoff).map(s => s.short),
    stretch:      scored.slice(dispositionalCutoff).map(s => s.short),
  };
}

/**
 * Fallback feed — no signal.
 * Daily seeded shuffle keeps the order consistent within a day but fresh tomorrow.
 * Unseen shorts float to the top; author-interleaved to avoid source clustering.
 */
function buildFallbackFeed(pool: WisdomShort[], seenIds: Set<string>): FeedSelection {
  const seed   = todaySeed();
  const unseen = seededShuffle(pool.filter(s => !seenIds.has(s.id)), seed);
  const seen   = seededShuffle(pool.filter(s =>  seenIds.has(s.id)), seed + 1);
  const ordered = interleaveByAuthor([...unseen, ...seen]);

  const total = ordered.length;
  const acuteCutoff        = Math.ceil(total * 0.7);
  const dispositionalCutoff = Math.ceil(total * 0.9);

  return {
    acute:        ordered.slice(0, acuteCutoff),
    dispositional: ordered.slice(acuteCutoff, dispositionalCutoff),
    stretch:      ordered.slice(dispositionalCutoff),
  };
}

/** Round-robin across authors to avoid source clustering in the feed. */
function interleaveByAuthor(shorts: WisdomShort[]): WisdomShort[] {
  const byAuthor = new Map<string, WisdomShort[]>();
  for (const s of shorts) {
    if (!byAuthor.has(s.source_author)) byAuthor.set(s.source_author, []);
    byAuthor.get(s.source_author)!.push(s);
  }
  const buckets = Array.from(byAuthor.values());
  const result: WisdomShort[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const bucket of buckets) {
      if (bucket.length > 0) {
        result.push(bucket.shift()!);
        added = true;
      }
    }
  }
  return result;
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
