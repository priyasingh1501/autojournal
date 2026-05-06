/**
 * Pure parser for the week-review Claude output.
 *
 * Lives in its own module so it can be unit-tested under plain tsx without
 * pulling in expo / AsyncStorage / AIProxy (which SummaryService transitively
 * imports). Matches the summaryParser / patternsParser split pattern.
 *
 * Sentinels:
 *   ===WEEK_REFLECTION===   → prose (4–6 sentences)
 *   ===WEEK_DAYS===         → JSON array of { date, oneLiner }
 *
 * Missing sentinels → empty fields rather than throw. Malformed JSON under
 * a sentinel is dropped silently — the caller can surface a regenerate CTA.
 */

import { WeekReviewDay } from '../types';

const REFL = '===WEEK_REFLECTION===';
const DAYS = '===WEEK_DAYS===';

export interface ParsedWeekReview {
  reflection: string;
  days: WeekReviewDay[];
}

/**
 * @param raw   Raw text from the Claude response.
 * @param dates The 7 YYYY-MM-DD dates that belong to this week — any `date`
 *              in the model output that falls outside this set is dropped.
 */
export function parseWeekReviewOutput(raw: string, dates: string[]): ParsedWeekReview {
  const iRefl = raw.indexOf(REFL);
  const iDays = raw.indexOf(DAYS);

  let reflection = '';
  if (iRefl !== -1) {
    const end = iDays !== -1 && iDays > iRefl ? iDays : raw.length;
    reflection = raw.slice(iRefl + REFL.length, end).trim();
  }

  const days: WeekReviewDay[] = [];
  if (iDays !== -1) {
    let body = raw.slice(iDays + DAYS.length).trim();
    body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const s = body.indexOf('[');
    const e = body.lastIndexOf(']');
    if (s !== -1 && e > s) {
      try {
        const arr = JSON.parse(body.slice(s, e + 1));
        if (Array.isArray(arr)) {
          const seen = new Set<string>();
          const allowed = new Set(dates);
          for (const x of arr) {
            if (!x || typeof x !== 'object') continue;
            const d = typeof (x as any).date === 'string' ? (x as any).date : '';
            const o = typeof (x as any).oneLiner === 'string' ? (x as any).oneLiner.trim() : '';
            if (!d || !o) continue;
            if (!allowed.has(d)) continue; // drop dates outside this week
            if (seen.has(d)) continue;     // drop duplicates
            seen.add(d);
            days.push({ date: d, oneLiner: o });
          }
        }
      } catch { /* drop */ }
    }
  }

  return { reflection, days };
}
