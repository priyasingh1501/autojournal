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
} from '../types';

// ── Thresholds ────────────────────────────────────────────────────────────────

export interface ThresholdRule {
  type: AcrossTimeType;
  minDays: number;
  /** Optional extra guard — e.g. gone_quiet needs a previously-loud topic. */
  extraGuard?: (ctx: { archiveDays: number; entryCount: number }) => boolean;
}

export const THRESHOLDS: ThresholdRule[] = [
  { type: 'whats_loud',         minDays: 14 },
  { type: 'returning_question', minDays: 45 },
  { type: 'mind_moving',        minDays: 45 },
  { type: 'wondering_about',    minDays: 60 },
  // gone_quiet also needs evidence of a previously-loud topic that has
  // dropped off — the prompt is responsible for the topic-level check; we
  // just gate the calendar window here.
  { type: 'gone_quiet',         minDays: 60 },
  { type: 'whats_pulling_you',  minDays: 30 },
  { type: 'stated_vs_actual',   minDays: 45 },
  { type: 'recurring_cast',     minDays: 30 },
  { type: 'thinking_texture',   minDays: 45 },
];

/** Returns the acrossTime types the archive is mature enough to request. */
export function allowedAcrossTimeTypes(archiveDays: number, entryCount: number): AcrossTimeType[] {
  return THRESHOLDS
    .filter(r => archiveDays >= r.minDays && (!r.extraGuard || r.extraGuard({ archiveDays, entryCount })))
    .map(r => r.type);
}

/** Human-readable window label for a given type. */
export function windowLabelFor(type: AcrossTimeType): string {
  switch (type) {
    case 'whats_loud':         return 'last 30 days';
    case 'returning_question': return 'last 45 days';
    case 'mind_moving':        return 'last 45 days';
    case 'wondering_about':    return 'last 60 days';
    case 'gone_quiet':         return 'last 60 days';
    case 'whats_pulling_you':  return 'last 30 days';
    case 'stated_vs_actual':   return 'last 45 days';
    case 'recurring_cast':     return 'last 30 days';
    case 'thinking_texture':   return 'last 45 days';
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

const TYPE_SET: ReadonlySet<AcrossTimeType> = new Set<AcrossTimeType>([
  'whats_loud', 'returning_question', 'mind_moving', 'wondering_about', 'gone_quiet',
  'whats_pulling_you', 'stated_vs_actual', 'recurring_cast', 'thinking_texture',
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
          const statedVsActualCount = { n: 0 };
          for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const type = (item as any).type as AcrossTimeType;
            if (!TYPE_SET.has(type)) continue;
            // stated_vs_actual: truth-bomb-adjacent — cap at 2 items max
            if (type === 'stated_vs_actual') {
              if (statedVsActualCount.n >= 2) continue;
              statedVsActualCount.n++;
            }
            const evidence = coerceEvidence((item as any).evidence);
            // Spec: each observation MUST have 2–3 evidence excerpts.
            if (evidence.length < 2) continue;
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
