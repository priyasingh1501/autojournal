/**
 * Pattern type → candidate minds for "Sit with this".
 *
 * The design brief suggested Companion / Jung / Munger / Rumi. Munger and
 * Rumi aren't in the current roster (see MINDS in MindService), so we map
 * the *spirit* of the brief onto the available minds:
 *   - Companion (null)          → emotional holding, non-persona
 *   - Carl Jung                 → identity, shadow, individuation
 *   - J. Krishnamurti           → choiceless awareness, direct seeing
 *   - Buddha                    → impermanence, holding what passes
 *   - Ramana Maharshi           → self-inquiry, "who is asking?"
 *   - Krishna                   → acting without attachment to outcome
 *   - Adi Shankaracharya        → what is real vs appearance
 *
 * Each pattern type surfaces 2–3 options; the user picks one.
 */

import { AcrossTimeType } from '../types';

export type MindCandidate = string | null; // null = Companion

export const PATTERN_MINDS: Record<AcrossTimeType, MindCandidate[]> = {
  // Loud themes → emotional noise. Companion holds it, Buddha reframes
  // through impermanence, Ramana points inward.
  whats_loud:          [null, 'buddha', 'ramana_maharshi'],

  // A question the writer keeps returning to → identity work.
  returning_question:  ['carl_jung', 'jiddu_krishnamurti', null],

  // A shift in thinking → vantage-point work.
  mind_moving:         ['carl_jung', 'jiddu_krishnamurti', 'adi_shankaracharya'],

  // Tentative "wondering about" → hold lightly; don't diagnose.
  wondering_about:     [null, 'ramana_maharshi', 'krishna'],

  // Something that's gone quiet → absence, release, acceptance.
  gone_quiet:          ['buddha', 'krishna', null],

  // What moves the writer toward and away → motivation, calling.
  whats_pulling_you:   ['krishna', 'buddha', null],

  // Stated values vs. actual behaviour → honest self-witnessing.
  stated_vs_actual:    ['jiddu_krishnamurti', 'carl_jung', null],

  // Recurring people in the archive → projection, mirroring, longing.
  recurring_cast:      ['carl_jung', 'rumi', null],

  // How the writer thinks on the page → awareness of mind's movement.
  thinking_texture:    ['jiddu_krishnamurti', 'adi_shankaracharya', null],

  // Early-stage observations — Companion is the right first voice.
  early_signal:        [null, 'ramana_maharshi', 'jiddu_krishnamurti'],
  first_impression:    [null, 'carl_jung', 'ramana_maharshi'],
  texture_early:       [null],

  // Self-referential language → identity work.
  self_language:       ['carl_jung', 'jiddu_krishnamurti', null],

  // Calcified narratives → witnessing, questioning fixed beliefs.
  repeating_story:     ['jiddu_krishnamurti', 'carl_jung', null],
};

export function mindsFor(type: AcrossTimeType): MindCandidate[] {
  return PATTERN_MINDS[type] ?? [null];
}
