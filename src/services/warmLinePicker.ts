/**
 * Pure priority picker for the home-screen warm line.
 *
 * Split from WarmLineService so it can be unit-tested under plain tsx
 * without pulling in react-native (which comes along transitively via
 * StorageService / WellbeingService / AsyncStorage).
 */

import { DailySummary, PatternsReport, SuggestedIntention } from '../types';

export type WarmLineTarget = 'reentry' | 'intention_suggest' | 'intention_nudge' | 'summary' | 'patterns' | 'none';

export interface WarmLine {
  text: string;
  tapTarget: WarmLineTarget;
}

export const REENTRY_LINE = 'Last time felt heavy. How are you today?';
export const FALLBACK: WarmLine = {
  text: "Welcome back. What's on your mind?",
  tapTarget: 'none',
};

export function firstSentence(s: string | undefined | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Strip section header prefix like "Emotional check-in: " or "Meals: "
  const stripped = trimmed.replace(/^[A-Z][^:]{0,40}:\s+/, '');
  // First sentence = up to the first terminator; strip the terminator for
  // cleaner UI display.
  const match = stripped.match(/^([^.!?]+)([.!?]|$)/);
  const first = (match?.[1] ?? stripped).trim();
  // Very short fragments (e.g. "Ok.") don't read as warm — fall through.
  if (first.length < 12) return null;
  // Cap length so a run-on sentence doesn't dominate the screen.
  return first.length > 140 ? first.slice(0, 137).trimEnd() + '…' : first;
}

/**
 * All async lookups are done by the caller; this is a pure reducer over the
 * already-fetched state so it can be tested without mocks.
 */
export function pickWarmLine(inputs: {
  hasReentry: boolean;
  pendingIntention?: SuggestedIntention | null;
  yesterdaySummary: DailySummary | null;
  patternsReport: PatternsReport | null;
}): WarmLine {
  if (inputs.hasReentry) {
    return { text: REENTRY_LINE, tapTarget: 'reentry' };
  }

  // A pending detected intention comes before the summary line — this is a
  // one-time prompt that needs a yes/no, not a quiet reflection.
  if (inputs.pendingIntention) {
    return {
      text: `I noticed something that sounds like a goal: "${inputs.pendingIntention.text}". Want to track it?`,
      tapTarget: 'intention_suggest',
    };
  }

  const y = inputs.yesterdaySummary;
  // Prefer the adaptive reflection field (ff_new_day_summary), fall back to
  // the legacy insightText if only the old format exists.
  const summaryLine = firstSentence(y?.reflection) ?? firstSentence(y?.insightText);
  if (summaryLine) {
    return { text: summaryLine, tapTarget: 'summary' };
  }

  // Prefer the more tentative wondering_about over returning_question.
  const obs =
    inputs.patternsReport?.acrossTime.find(o => o.type === 'wondering_about') ??
    inputs.patternsReport?.acrossTime.find(o => o.type === 'returning_question');
  if (obs) {
    return { text: obs.title, tapTarget: 'patterns' };
  }

  return FALLBACK;
}
