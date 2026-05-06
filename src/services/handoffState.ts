/**
 * Pure state machine for Companion → specialist handoff offers.
 *
 * Keeps all rule logic out of ChatScreen so it's testable in isolation:
 *   - Offers only start from turn 3 onward.
 *   - At most one offer per 4-turn window.
 *   - Declined minds are suppressed for the rest of the conversation.
 *   - Only Companion sessions are eligible — specialists never detect.
 *   - Distress (wellbeingState === 'hard_stretch') suppresses all offers.
 *
 * No side effects. Callers apply the returned next-state to their refs.
 */

import type { WellbeingState } from '../types';

export type HandoffDeclineReason = 'stay' | 'not_yet';

export interface HandoffState {
  /** Number of completed user+assistant exchanges. */
  turnCount: number;
  /** Turn at which the last offer was made. -1 = never. */
  lastOfferTurn: number;
  /** Mind ids the user declined this session — never re-offer. */
  declinedMindIds: ReadonlySet<string>;
  /** The live offer awaiting a user response. */
  activeOffer: { mindId: string; reason: string } | null;
}

export const INITIAL_HANDOFF_STATE: HandoffState = {
  turnCount: 0,
  lastOfferTurn: -1,
  declinedMindIds: new Set<string>(),
  activeOffer: null,
};

export interface EligibilityInputs {
  state: HandoffState;
  isCompanion: boolean;
  wellbeingState: WellbeingState;
}

/**
 * Can this Companion session offer a handoff *right now*?
 *
 * Must be Companion, must have completed >= 3 turns, wellbeing not in
 * hard_stretch, no offer currently active, cooldown passed.
 */
export function canOfferHandoff({ state, isCompanion, wellbeingState }: EligibilityInputs): boolean {
  if (!isCompanion) return false;
  if (wellbeingState === 'hard_stretch') return false;
  if (state.activeOffer) return false;
  if (state.turnCount < 3) return false;
  // 4-turn cooldown: last offer was at lastOfferTurn, so the next eligible
  // turn is lastOfferTurn + 4. Initial value -1 → eligible at turn 3.
  if (state.turnCount - state.lastOfferTurn < 4) return false;
  return true;
}

/** Incremented on each user+assistant exchange. */
export function advanceTurn(state: HandoffState): HandoffState {
  return { ...state, turnCount: state.turnCount + 1 };
}

/** Called when a detection run returns a handoff suggestion. */
export function applyDetectedOffer(
  state: HandoffState,
  offer: { mindId: string; reason: string },
): HandoffState {
  // Re-check: if this mind was already declined, drop the offer silently.
  if (state.declinedMindIds.has(offer.mindId)) return state;
  return {
    ...state,
    activeOffer: offer,
    lastOfferTurn: state.turnCount,
  };
}

/** User tapped "Stay with you" — no suppression, just clear the offer. */
export function recordStay(state: HandoffState): HandoffState {
  return { ...state, activeOffer: null };
}

/** User tapped "Not yet" — clear AND add to declined set for this session. */
export function recordNotYet(state: HandoffState): HandoffState {
  if (!state.activeOffer) return state;
  const next = new Set(state.declinedMindIds);
  next.add(state.activeOffer.mindId);
  return { ...state, activeOffer: null, declinedMindIds: next };
}

/** User tapped "Meet X" — clear the offer; conversation transition happens elsewhere. */
export function recordAccept(state: HandoffState): HandoffState {
  return { ...state, activeOffer: null };
}
