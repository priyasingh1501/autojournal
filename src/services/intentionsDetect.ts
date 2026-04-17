/**
 * Pure helpers for intention detection — parsing Claude's JSON response and
 * normalizing text for dedup/blocklist checks. Split from IntentionsService
 * so it's testable under plain tsx (no AsyncStorage / Claude imports).
 */

/** Parse Claude Haiku's detection response. Expects `{"intention": "..." | null}`. */
export function parseDetectionResponse(raw: string): string | null {
  if (!raw) return null;
  // Strip code fences if the model wrapped the JSON.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s === -1 || e <= s) return null;

  let obj: any;
  try {
    obj = JSON.parse(stripped.slice(s, e + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const v = obj.intention;
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;

  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  // Guard against trivial no-signal words — sometimes the model emits
  // "none" / "n/a" instead of null even with explicit instructions.
  if (/^(none|n\/a|no|null|nothing)$/i.test(trimmed)) return null;
  // Guard against the model accidentally returning a full sentence with
  // punctuation that suggests a paraphrased summary rather than a goal phrase.
  if (trimmed.length > 120) return null;

  return trimmed;
}

/** Normalize intention text for dedup / dismiss-blocklist comparison. */
export function normalizeIntentionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns true if `candidate` is functionally the same as any of `existing`. */
export function isDuplicateIntention(candidate: string, existing: string[]): boolean {
  const c = normalizeIntentionText(candidate);
  if (!c) return true;
  for (const e of existing) {
    if (normalizeIntentionText(e) === c) return true;
  }
  return false;
}
