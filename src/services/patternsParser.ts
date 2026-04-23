/**
 * Pure parser + threshold helpers for PatternsService.
 *
 * Separated from PatternsService so the structural logic can be unit-tested
 * under tsx without pulling in AsyncStorage / AIProxy / expo modules.
 */

import {
  AcrossTimeObservation,
  AcrossTimeType,
  PatternsEvidence,
  PatternsReport,
  PullItem,
  RecurringCastPerson,
  RecurringCastRole,
} from '../types';

// ── Thresholds ────────────────────────────────────────────────────────────────

export interface ThresholdRule {
  type: AcrossTimeType;
  minEntries: number;
  maxEntries?: number;
  // Only gone_quiet keeps a day requirement — the concept is meaningless without elapsed time.
  minDays?: number;
}

export const THRESHOLDS: ThresholdRule[] = [
  { type: 'texture_early',      minEntries: 1 },
  { type: 'first_impression',   minEntries: 3,  maxEntries: 8 },
  { type: 'whats_pulling_you',  minEntries: 7 },
  { type: 'recurring_cast',     minEntries: 10 },
  { type: 'thinking_texture',   minEntries: 10 },
  { type: 'mind_moving',        minEntries: 10 },
  { type: 'wondering_about',    minEntries: 12 },
  { type: 'stated_vs_actual',   minEntries: 15 },
  { type: 'gone_quiet',         minEntries: 20, minDays: 21 },
];

/**
 * Returns the acrossTime types the archive is mature enough to request from Claude.
 * texture_early is excluded — it is computed on-device without a Claude call.
 */
export function allowedAcrossTimeTypes(archiveDays: number, entryCount: number): AcrossTimeType[] {
  return THRESHOLDS
    .filter(r => {
      if (r.type === 'texture_early') return false; // on-device only
      if (entryCount < r.minEntries) return false;
      if (r.maxEntries !== undefined && entryCount > r.maxEntries) return false;
      if (r.minDays !== undefined && archiveDays < r.minDays) return false;
      return true;
    })
    .map(r => r.type);
}

/** Human-readable window label for a given type. */
export function windowLabelFor(type: AcrossTimeType): string {
  switch (type) {
    case 'texture_early':      return 'so far';
    case 'first_impression':   return 'first impression';
    case 'early_signal':       return 'early signal';
    case 'self_language':      return 'your words';
    case 'repeating_story':    return 'repeating story';
    case 'whats_loud':         return 'last 30 days';
    case 'returning_question': return 'last 60 days';
    case 'mind_moving':        return 'last 60 days';
    case 'wondering_about':    return 'last 90 days';
    case 'gone_quiet':         return 'last 60 days';
    case 'whats_pulling_you':  return 'last 30 days';
    case 'stated_vs_actual':   return 'last 60 days';
    case 'recurring_cast':     return 'last 60 days';
    case 'thinking_texture':   return 'last 60 days';
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

const SENTINELS = ['===THIS_MONTH===', '===ACROSS_TIME==='] as const;
type Sentinel = typeof SENTINELS[number];

function splitSections(full: string): Partial<Record<Sentinel, string>> {
  const hits = SENTINELS
    .map(s => ({ sentinel: s, index: full.indexOf(s) }))
    .filter(h => h.index !== -1)
    .sort((a, b) => a.index - b.index);

  const out: Partial<Record<Sentinel, string>> = {};
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i].sentinel.length;
    const end = i + 1 < hits.length ? hits[i + 1].index : full.length;
    out[hits[i].sentinel] = full.slice(start, end).trim();
  }
  return out;
}

/** Extract the first JSON object/array from a string, skipping fences. */
function extractJson(raw: string): string | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const firstObj = stripped.indexOf('{');
  const firstArr = stripped.indexOf('[');
  const start = [firstObj, firstArr].filter(i => i !== -1).sort((a, b) => a - b)[0];
  if (start === undefined) return null;

  const open = stripped[start];
  const close = open === '{' ? '}' : ']';
  const end = stripped.lastIndexOf(close);
  if (end <= start) return null;

  return stripped.slice(start, end + 1);
}

function coerceString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function coerceEvidence(v: unknown): PatternsEvidence[] {
  if (!Array.isArray(v)) return [];
  const out: PatternsEvidence[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object') continue;
    const excerpt = coerceString((e as any).excerpt);
    const date    = coerceString((e as any).date);
    if (excerpt && date) out.push({ excerpt, date });
  }
  return out;
}

const CAST_ROLES: ReadonlySet<RecurringCastRole> = new Set<RecurringCastRole>([
  'support', 'friction', 'aspiration', 'obligation',
]);

function coerceRecurringCastPeople(v: unknown): RecurringCastPerson[] {
  if (!Array.isArray(v)) return [];
  const out: RecurringCastPerson[] = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') continue;
    const name       = coerceString((p as any).name).trim();
    const appearance = coerceString((p as any).appearance).trim();
    const rawRole    = coerceString((p as any).role).toLowerCase().trim() as RecurringCastRole;
    const mentionsRaw = (p as any).mentions;
    const mentions = typeof mentionsRaw === 'number' && Number.isFinite(mentionsRaw)
      ? Math.max(0, Math.floor(mentionsRaw))
      : 0;
    const evidence = coerceEvidence((p as any).evidence);
    if (!name || !appearance) continue;
    // Hard recurrence bar: ≥3 mentions AND ≥2 quotes naming them.
    if (mentions < 3) continue;
    if (evidence.length < 2) continue;
    const role: RecurringCastRole = CAST_ROLES.has(rawRole) ? rawRole : 'support';
    out.push({ name, role, appearance, mentions, evidence });
  }
  return out;
}

// texture_early is excluded — it's injected on-device, never from Claude output.
const TYPE_SET: ReadonlySet<AcrossTimeType> = new Set<AcrossTimeType>([
  'mind_moving', 'wondering_about', 'gone_quiet',
  'whats_pulling_you', 'stated_vs_actual', 'recurring_cast', 'thinking_texture',
  'first_impression',
]);

/**
 * Types handled by their own dedicated per-card prompts. They MUST NOT appear
 * in the general Across Time array — their parser returns null-safe objects
 * that are merged in separately by PatternsService.
 */
const DEDICATED_PROMPT_TYPES: ReadonlySet<AcrossTimeType> = new Set<AcrossTimeType>([
  'recurring_cast', 'whats_pulling_you', 'stated_vs_actual', 'mind_moving', 'thinking_texture',
]);

const DISMISSIBLE_TYPES: ReadonlySet<AcrossTimeType> = new Set<AcrossTimeType>([
  'wondering_about', 'stated_vs_actual',
]);

/**
 * Parse Claude's raw patterns output.
 *
 * - Missing sentinels → missing fields (empty acrossTime / default thisMonth).
 * - Malformed JSON under a sentinel → that section is dropped, not thrown.
 * - Observations are filtered to those with a known type AND 2–3 evidence items,
 *   as required by the spec. Models that emit 1 or 4+ evidence items are
 *   trimmed/dropped rather than surfaced to the UI in a malformed state.
 */
export function parsePatternsOutput(
  raw: string,
  meta: { generatedAt: number; archiveDays: number; entryCount: number },
): PatternsReport {
  const sections = splitSections(raw);

  // thisMonth (always present — default to empty fields if the model skipped it)
  let reflection = '';
  let whatsLoud: string[] = [];
  let intentionsProgress: PatternsReport['thisMonth']['intentionsProgress'] = null;

  const tmBody = sections['===THIS_MONTH==='];
  if (tmBody) {
    const json = extractJson(tmBody);
    if (json) {
      try {
        const obj = JSON.parse(json);
        if (obj && typeof obj === 'object') {
          reflection = coerceString(obj.reflection);
          whatsLoud  = coerceStringArray(obj.whatsLoud).slice(0, 3);
          if (Array.isArray(obj.intentionsProgress)) {
            const ip = obj.intentionsProgress
              .filter((x: any) => x && typeof x === 'object')
              .map((x: any) => ({
                intention: coerceString(x.intention),
                note:      coerceString(x.note),
              }))
              .filter((x: any) => x.intention && x.note);
            intentionsProgress = ip.length > 0 ? ip : null;
          }
        }
      } catch { /* drop */ }
    }
  }

  // acrossTime
  const acrossTime: AcrossTimeObservation[] = [];
  const atBody = sections['===ACROSS_TIME==='];
  if (atBody) {
    const json = extractJson(atBody);
    if (json) {
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr)) {
          const typeCaps: Partial<Record<AcrossTimeType, { max: number; n: number }>> = {
            stated_vs_actual: { max: 2, n: 0 },
            repeating_story:  { max: 2, n: 0 },
          };
          for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const type = (item as any).type as AcrossTimeType;
            if (!TYPE_SET.has(type)) continue;
            // Apply per-type caps
            const cap = typeCaps[type];
            if (cap) {
              if (cap.n >= cap.max) continue;
              cap.n++;
            }
            const evidence = coerceEvidence((item as any).evidence);
            // self_language: no evidence required (phrases are the body).
            // early_signal, first_impression, repeating_story: allow 1 excerpt.
            // All other types: require 2–3.
            const minEvidence =
              type === 'self_language' ? 0
              : (type === 'early_signal' || type === 'first_impression' || type === 'repeating_story') ? 1
              : 2;
            if (evidence.length < minEvidence) continue;
            const trimmedEvidence = evidence.slice(0, 3);
            const title = coerceString((item as any).title);
            const body  = coerceString((item as any).body);
            if (!title || !body) continue;
            acrossTime.push({
              type,
              title,
              body,
              evidence: trimmedEvidence,
              window: coerceString((item as any).window, windowLabelFor(type)),
              dismissible: DISMISSIBLE_TYPES.has(type),
            });
          }
        }
      } catch { /* drop */ }
    }
  }

  return {
    generatedAt: meta.generatedAt,
    archiveDays: meta.archiveDays,
    entryCount:  meta.entryCount,
    thisMonth: { reflection, whatsLoud, intentionsProgress, emotionalArc: null },
    acrossTime,
  };
}

// ── New per-call parsers ──────────────────────────────────────────────────────
// These accept the raw body of a single focused LLM call (no sentinels), so
// This Month and Across Time can be generated from separate, narrower prompts.

export interface ParsedThisMonth {
  reflection: string;
  whatsLoud: string[];
  /** Per-intention notes without the on-device mention count — the service joins. */
  intentionNotes: Array<{ intention: string; note: string }> | null;
}

export function parseThisMonthJson(raw: string): ParsedThisMonth {
  const empty: ParsedThisMonth = { reflection: '', whatsLoud: [], intentionNotes: null };
  const json = extractJson(raw);
  if (!json) return empty;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return empty;
    const reflection = coerceString((obj as any).reflection);
    const whatsLoud  = coerceStringArray((obj as any).whatsLoud);
    let intentionNotes: ParsedThisMonth['intentionNotes'] = null;
    if (Array.isArray((obj as any).intentionsProgress)) {
      const ip = (obj as any).intentionsProgress
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => ({
          intention: coerceString(x.intention),
          note:      coerceString(x.note),
        }))
        .filter((x: any) => x.intention && x.note);
      intentionNotes = ip.length > 0 ? ip : null;
    }
    return { reflection, whatsLoud, intentionNotes };
  } catch {
    return empty;
  }
}

function coercePullItems(v: unknown): PullItem[] {
  if (!Array.isArray(v)) return [];
  const out: PullItem[] = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') continue;
    const theme  = coerceString((p as any).theme).trim();
    const detail = coerceString((p as any).detail).trim();
    const mentionsRaw = (p as any).mentions;
    const mentions = typeof mentionsRaw === 'number' && Number.isFinite(mentionsRaw)
      ? Math.max(0, Math.floor(mentionsRaw))
      : 0;
    const evidence = coerceEvidence((p as any).evidence);
    if (!theme || !detail) continue;
    if (mentions < 3) continue;
    if (evidence.length < 2) continue;
    out.push({ theme, detail, mentions, evidence });
  }
  return out;
}

/**
 * Parse the dedicated "What pulls you" prompt — one JSON object with
 * `toward` and `away` arrays. Returns a single AcrossTimeObservation
 * with those attached, or null if neither side has any item clearing
 * the recurrence bar.
 */
export function parseWhatPullsYouJson(raw: string): AcrossTimeObservation | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const toward = coercePullItems((obj as any).toward);
    const away   = coercePullItems((obj as any).away);
    if (toward.length === 0 && away.length === 0) return null;
    const title = coerceString((obj as any).title, 'What moves you toward and away');
    const body  = coerceString((obj as any).body, '');
    return {
      type: 'whats_pulling_you',
      title,
      body,
      evidence: [],
      window: coerceString((obj as any).window, windowLabelFor('whats_pulling_you')),
      dismissible: false,
      toward,
      away,
    };
  } catch {
    return null;
  }
}

/**
 * Shared parser for the three long-tail single-observation prompts
 * (first_impression, wondering_about, gone_quiet). Each prompt returns
 * an object with title, window, body, evidence[].
 *
 * Each type has its own minimum evidence bar:
 *   - first_impression: ≥1 quote
 *   - wondering_about:   ≥2 quotes
 *   - gone_quiet:        ≥2 quotes
 */
export function parseSingleObservationJson(
  raw: string,
  type: Extract<AcrossTimeType, 'first_impression' | 'wondering_about' | 'gone_quiet'>,
): AcrossTimeObservation | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const body = coerceString((obj as any).body).trim();
    const evidence = coerceEvidence((obj as any).evidence);
    const minEvidence = type === 'first_impression' ? 1 : 2;
    if (!body || evidence.length < minEvidence) return null;
    return {
      type,
      title: coerceString((obj as any).title, defaultTitleFor(type)),
      body,
      evidence: evidence.slice(0, 3),
      window: coerceString((obj as any).window, windowLabelFor(type)),
      dismissible: DISMISSIBLE_TYPES.has(type),
    };
  } catch {
    return null;
  }
}

function defaultTitleFor(type: AcrossTimeType): string {
  switch (type) {
    case 'first_impression': return 'A first read on you';
    case 'wondering_about':  return 'Something you might be wondering about';
    case 'gone_quiet':       return "Something that's gone quiet";
    default:                 return '';
  }
}

/**
 * Parse the dedicated "How your mind moves" prompt — one JSON object
 * that merges thinking texture + one concrete shift into a single
 * observation. Returns null if the required evidence isn't present.
 */
export function parseMindMovesJson(raw: string): AcrossTimeObservation | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const body = coerceString((obj as any).body).trim();
    const evidence = coerceEvidence((obj as any).evidence);
    if (!body || evidence.length < 2) return null;
    return {
      type: 'mind_moving',
      title: coerceString((obj as any).title, 'How your mind moves'),
      body,
      evidence: evidence.slice(0, 3),
      window: coerceString((obj as any).window, windowLabelFor('mind_moving')),
      dismissible: false,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the dedicated "A gap worth noticing" prompt — one JSON object
 * with stated/actual evidence arrays. Returns null if either side is
 * missing its required quotes.
 */
export function parseStatedVsActualJson(raw: string): AcrossTimeObservation | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const body   = coerceString((obj as any).body).trim();
    const stated = coerceEvidence((obj as any).stated);
    const actual = coerceEvidence((obj as any).actual);
    // Hard bar: ≥1 stated quote AND ≥2 actual quotes AND non-empty body.
    if (!body || stated.length < 1 || actual.length < 2) return null;
    // Combine for the AcrossTimeObservation evidence field (stated first, then actual).
    const evidence = [...stated, ...actual].slice(0, 4);
    return {
      type: 'stated_vs_actual',
      title: coerceString((obj as any).title, 'Something worth noticing'),
      body,
      evidence,
      window: coerceString((obj as any).window, windowLabelFor('stated_vs_actual')),
      dismissible: true,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the dedicated "Who shows up" prompt — one JSON object with a
 * `people` array. Returns a single AcrossTimeObservation with people
 * attached, or null if no person cleared the recurrence bar.
 */
export function parseWhoShowsUpJson(raw: string): AcrossTimeObservation | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const people = coerceRecurringCastPeople((obj as any).people);
    if (people.length === 0) return null;
    const title = coerceString((obj as any).title, 'People who keep showing up');
    const body  = coerceString((obj as any).body, '');
    return {
      type: 'recurring_cast',
      title,
      body,
      evidence: [],
      window: coerceString((obj as any).window, windowLabelFor('recurring_cast')),
      dismissible: false,
      people,
    };
  } catch {
    return null;
  }
}

export function parseAcrossTimeJson(raw: string): AcrossTimeObservation[] {
  const json = extractJson(raw);
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    const out: AcrossTimeObservation[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const type = (item as any).type as AcrossTimeType;
      if (!TYPE_SET.has(type)) continue;
      // These types have their own dedicated prompts — ignore stray output here.
      if (DEDICATED_PROMPT_TYPES.has(type)) continue;
      const evidence = coerceEvidence((item as any).evidence);
      const minEvidence = type === 'first_impression' ? 1 : 2;
      if (evidence.length < minEvidence) continue;
      const title = coerceString((item as any).title);
      const body  = coerceString((item as any).body);
      if (!title || !body) continue;
      out.push({
        type,
        title,
        body,
        evidence: evidence.slice(0, 3),
        window: coerceString((item as any).window, windowLabelFor(type)),
        dismissible: DISMISSIBLE_TYPES.has(type),
      });
    }
    return out;
  } catch {
    return [];
  }
}
