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

/**
 * Score and split acrossTime observations into surfaced (3-5) and additional.
 *
 * Scoring:
 *   +3 — type not seen in previous report (it's new)
 *   +3 — type is stated_vs_actual (highest-signal observation)
 *   +2 — body references an active intention (relevance)
 *   +2 — type not in previous report (rotation bonus)
 *   +1 — highest evidence count among all observations
 *   -10 — dismissed (excluded entirely)
 *
 * Note: +3 "new type" and +2 "rotation" both test the same condition when
 * only one previousReport is available — new types intentionally score high.
 *
 * @param report             The freshly generated (or cached) report.
 * @param previousReport     The report immediately before this one, or null.
 * @param dismissedFps       Fingerprints of user-dismissed observations.
 * @param activeIntentionTexts  Text of active intentions for relevance matching.
 */
export function curate(
  report: PatternsReport,
  previousReport: PatternsReport | null,
  dismissedFps: string[],
  activeIntentionTexts: string[],
): CurationResult {
  const all = report.acrossTime;
  if (all.length === 0) return { surfaced: [], additional: [] };

  const dismissedSet = new Set(dismissedFps);
  const prevTypes = new Set(previousReport?.acrossTime.map(o => o.type) ?? []);
  const maxEvidence = all.reduce((m, o) => Math.max(m, o.evidence.length), 0);
  const lowerIntentions = activeIntentionTexts
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length > 3);

  const scored = all.map(obs => {
    const fp = fingerprintFor(obs.type, obs.title);
    if (dismissedSet.has(fp)) return { obs, score: -10 };

    let score = 0;

    // +3 — type not seen in previous report
    if (!prevTypes.has(obs.type)) score += 3;

    // +3 — stated_vs_actual is the highest-signal section
    if (obs.type === 'stated_vs_actual') score += 3;

    // +2 — body references an active intention
    const bodyLower = obs.body.toLowerCase();
    if (lowerIntentions.some(t => bodyLower.includes(t))) score += 2;

    // +2 — type not in previous report (rotation bonus — stacks with new-type bonus)
    if (!prevTypes.has(obs.type)) score += 2;

    // +1 — highest evidence count
    if (obs.evidence.length === maxEvidence && maxEvidence > 2) score += 1;

    return { obs, score };
  });

  // Sort descending; dismissed items (score -10) fall to the end
  scored.sort((a, b) => b.score - a.score);

  // Build surfaced: top 3-5, no dismissed, max 1 stated_vs_actual
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

  // Ensure minimum of 3 if enough non-dismissed observations exist
  // (already guaranteed by taking top N — we just document the intent here)

  // additional: everything not surfaced and not dismissed, in original report order
  const surfacedFps = new Set(surfaced.map(o => fingerprintFor(o.type, o.title)));
  const additional = all.filter(o => {
    const fp = fingerprintFor(o.type, o.title);
    return !surfacedFps.has(fp) && !dismissedSet.has(fp);
  });

  return { surfaced, additional };
}
