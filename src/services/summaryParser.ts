/**
 * Pure parser for Claude's day-summary output.
 *
 * The model emits sentinel-separated sections:
 *   <insight text>
 *   ===MACROS===
 *   { ... }                          (or `null`)
 *   ===REFLECTION===                 (ff_new_day_summary only)
 *   <2–4 sentence prose>
 *   ===WHATHELD===                   (ff_new_day_summary only)
 *   Label: one-sentence content
 *   Label: ...
 *   ===MOODARC===                    (ff_new_day_summary only)
 *   morning: word
 *   afternoon: word
 *   evening: word                    (or the single token `null`)
 *
 * Missing sentinels are treated as missing fields, not errors — callers
 * should fall back to legacy behavior when a field comes back undefined.
 *
 * No imports from React Native / Expo / AsyncStorage so this module is
 * directly testable under plain Node + tsx.
 */

export interface ParsedSummary {
  insightText: string;
  macrosRaw?: string;
  reflection?: string;
  whatTheDayHeld?: Array<{ label: string; content: string }>;
  moodArc?: { morning: string; afternoon: string; evening: string } | null;
}

// Order matters: `insightText` is everything before the FIRST sentinel.
const SENTINELS = ['===MACROS===', '===REFLECTION===', '===WHATHELD===', '===MOODARC==='] as const;
type Sentinel = typeof SENTINELS[number];

/**
 * Split the raw model output into `{ insightText, <sentinel>: body }`.
 * Each section body is the text between its sentinel and the next sentinel
 * (in textual order in the output), trimmed.
 */
function splitSections(full: string): { insightText: string } & Partial<Record<Sentinel, string>> {
  const hits = SENTINELS
    .map(s => ({ sentinel: s, index: full.indexOf(s) }))
    .filter(h => h.index !== -1)
    .sort((a, b) => a.index - b.index);

  const result: { insightText: string } & Partial<Record<Sentinel, string>> = {
    insightText: (hits.length > 0 ? full.slice(0, hits[0].index) : full).trim(),
  };

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i].sentinel.length;
    const end = i + 1 < hits.length ? hits[i + 1].index : full.length;
    result[hits[i].sentinel] = full.slice(start, end).trim();
  }

  return result;
}

function parseWhatHeld(body: string): Array<{ label: string; content: string }> {
  const out: Array<{ label: string; content: string }> = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue; // skip lines without "Label: content"
    const label = line.slice(0, colonIdx).trim();
    const content = line.slice(colonIdx + 1).trim();
    if (label && content) out.push({ label, content });
  }
  return out;
}

function parseMoodArc(body: string): ParsedSummary['moodArc'] {
  const trimmed = body.trim();
  if (!trimmed || /^null$/i.test(trimmed)) return null;

  const pick = (key: string): string | undefined => {
    const m = trimmed.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'im'));
    return m?.[1].trim();
  };
  const morning = pick('morning');
  const afternoon = pick('afternoon');
  const evening = pick('evening');

  // Only return an arc when all three slots are populated — otherwise the
  // screen should treat the arc as missing.
  if (!morning || !afternoon || !evening) return null;
  return { morning, afternoon, evening };
}

/**
 * Parse raw Claude output into structured fields. Safe against missing
 * sentinels — any field whose sentinel is absent is simply omitted.
 */
export function parseSummaryOutput(full: string): ParsedSummary {
  const sections = splitSections(full);
  const parsed: ParsedSummary = { insightText: sections.insightText };

  if (sections['===MACROS==='] !== undefined) {
    parsed.macrosRaw = sections['===MACROS==='];
  }
  if (sections['===REFLECTION==='] !== undefined) {
    parsed.reflection = sections['===REFLECTION==='];
  }
  if (sections['===WHATHELD==='] !== undefined) {
    const held = parseWhatHeld(sections['===WHATHELD===']);
    if (held.length > 0) parsed.whatTheDayHeld = held;
  }
  if (sections['===MOODARC==='] !== undefined) {
    parsed.moodArc = parseMoodArc(sections['===MOODARC===']);
  }

  return parsed;
}

/**
 * Extract a {calories, protein, carbs, fat} object from a macros-section body.
 * Returns null if the body is literally `null` or has no parseable JSON object.
 */
export function parseMacrosBody(body: string): {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
} | null {
  const trimmed = body.trim();
  if (!trimmed || /^null$/i.test(trimmed)) return null;
  const jsonStr = trimmed.match(/\{[\s\S]*?\}/)?.[0];
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      calories: parsed.calories ?? null,
      protein:  parsed.protein  ?? null,
      carbs:    parsed.carbs    ?? null,
      fat:      parsed.fat      ?? null,
    };
  } catch {
    return null;
  }
}
