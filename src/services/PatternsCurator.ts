/**
 * PatternsCurator — deterministic, on-device ranker for PatternsReport.
 *
 * Selects which 3-5 observations to surface by default and which go behind
 * the "More patterns" expander. No LLM calls — same inputs always produce
 * the same output.
 */

import { AcrossTimeObservation, PatternsReport } from '../types';
import { fingerprintFor } from './patternsDismiss';

export interface CurationResult {
  surfaced: AcrossTimeObservation[];
  additional: AcrossTimeObservation[];
}

/** Minimal intention shape needed by the curator. Full Intention objects satisfy this. */
export interface CurationIntention {
  text: string;
  category?: string;
  weeklyMentionCounts: Array<{ weekKey: string; count: number }>;
}

/** Returns the ISO-8601 week key for a given timestamp ("2026-W16"). */
function weekKeyFor(ts: number): string {
  const d = new Date(ts);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Finds the intention category with the highest total mention count in the
 * last 30 days across all supplied intentions. Returns null when no
 * categorised intentions have any recent mentions.
 */
function mostActiveCategoryIn30Days(intentions: CurationIntention[]): string | null {
  const cutoffWeekKey = weekKeyFor(Date.now() - 30 * 86_400_000);
  const totals: Record<string, number> = {};
  for (const i of intentions) {
    if (!i.category) continue;
    const recent = i.weeklyMentionCounts.filter(w => w.weekKey >= cutoffWeekKey);
    const sum = recent.reduce((n, w) => n + w.count, 0);
    totals[i.category] = (totals[i.category] ?? 0) + sum;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [cat, count] of Object.entries(totals)) {
    if (count > bestCount) { best = cat; bestCount = count; }
  }
  return best;
}

/**
 * Score and split acrossTime observations into surfaced (3-5) and additional.
 *
 * Scoring:
 *   +4 — early_signal / first_impression / texture_early when entryCount < 10
 *   +3 — type not seen in previous report (it's new)
 *   +3 — type is stated_vs_actual (highest-signal observation)
 *   +2 — body references an active intention (relevance)
 *   +2 — type not in previous report (rotation bonus)
 *   +1 — highest evidence count among all observations
 *   -10 — dismissed OR first_impression when entryCount > 8 (removed from view)
 *
 * @param report           The freshly generated (or cached) report.
 * @param previousReport   The report immediately before this one, or null.
 * @param dismissedFps     Fingerprints of user-dismissed observations.
 * @param activeIntentions Active intentions; full Intention objects are accepted.
 */
export function curate(
  report: PatternsReport,
  previousReport: PatternsReport | null,
  dismissedFps: string[],
  activeIntentions: CurationIntention[],
): CurationResult {
  const all = report.acrossTime;
  if (all.length === 0) return { surfaced: [], additional: [] };

  const entryCount = report.entryCount;
  const dismissedSet = new Set(dismissedFps);
  const prevTypes = new Set(previousReport?.acrossTime.map(o => o.type) ?? []);
  const maxEvidence = all.reduce((m, o) => Math.max(m, o.evidence.length), 0);
  const lowerIntentions = activeIntentions
    .map(i => i.text.toLowerCase().trim())
    .filter(t => t.length > 3);

  // Most active category this month — used for the category-alignment +1 bonus.
  const topCategory = mostActiveCategoryIn30Days(activeIntentions);
  const topCategoryTexts = topCategory
    ? activeIntentions
        .filter(i => i.category === topCategory)
        .map(i => i.text.toLowerCase().trim())
        .filter(t => t.length > 3)
    : [];

  const EARLY_TYPES = new Set(['early_signal', 'first_impression', 'texture_early']);

  const scored = all.map(obs => {
    const fp = fingerprintFor(obs.type, obs.title);
    if (dismissedSet.has(fp)) return { obs, score: -10 };

    // first_impression is removed from view once the user has > 8 entries
    if (obs.type === 'first_impression' && entryCount > 8) return { obs, score: -10 };

    let score = 0;
    const bodyLower = obs.body.toLowerCase();

    // +4 — early types surface first for new users
    if (EARLY_TYPES.has(obs.type) && entryCount < 10) score += 4;

    // +3 — repeating_story is high-value whenever it appears
    if (obs.type === 'repeating_story') score += 3;

    // +2 — self_language is high-value for newer users (8–15 entries)
    if (obs.type === 'self_language' && entryCount >= 8 && entryCount <= 15) score += 2;

    // +3 — type not seen in previous report
    if (!prevTypes.has(obs.type)) score += 3;

    // +3 — stated_vs_actual is the highest-signal section
    if (obs.type === 'stated_vs_actual') score += 3;

    // +2 — body references an active intention
    if (lowerIntentions.some(t => bodyLower.includes(t))) score += 2;

    // +2 — type not in previous report (rotation bonus — stacks with new-type bonus)
    if (!prevTypes.has(obs.type)) score += 2;

    // +1 — highest evidence count
    if (obs.evidence.length === maxEvidence && maxEvidence > 2) score += 1;

    // +1 — references an intention in the user's most active category this month
    if (topCategoryTexts.length > 0 && topCategoryTexts.some(t => bodyLower.includes(t))) score += 1;

    return { obs, score };
  });

  // Sort descending; suppressed items (score -10) fall to the end
  scored.sort((a, b) => b.score - a.score);

  // Track fingerprints that should be hidden entirely (score < 0, not just dismissed)
  const suppressedFps = new Set<string>(dismissedFps);
  for (const { obs, score } of scored) {
    if (score < 0) suppressedFps.add(fingerprintFor(obs.type, obs.title));
  }

  // Build surfaced: top 3-5, no suppressed, max 1 stated_vs_actual
  const surfaced: AcrossTimeObservation[] = [];
  let statedVsActualCount = 0;

  for (const { obs, score } of scored) {
    if (score < 0) break;
    if (surfaced.length >= 5) break;
    if (obs.type === 'stated_vs_actual') {
      if (statedVsActualCount >= 1) continue;
      statedVsActualCount++;
    }
    surfaced.push(obs);
  }

  // additional: everything not surfaced and not suppressed, in original report order
  const surfacedFps = new Set(surfaced.map(o => fingerprintFor(o.type, o.title)));
  const additional = all.filter(o => {
    const fp = fingerprintFor(o.type, o.title);
    return !surfacedFps.has(fp) && !suppressedFps.has(fp);
  });

  return { surfaced, additional };
}
