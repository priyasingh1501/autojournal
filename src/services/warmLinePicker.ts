/**
 * Pure priority picker for the home-screen warm line.
 *
 * Split from WarmLineService so it can be unit-tested under plain tsx
 * without pulling in react-native (which comes along transitively via
 * StorageService / WellbeingService / AsyncStorage).
 */

import { DailySummary, PatternsReport } from '../types';

export type WarmLineTarget = 'reentry' | 'intention_nudge' | 'summary' | 'patterns' | 'none';

export interface WarmLine {
  text: string;
  tapTarget: WarmLineTarget;
}

export const REENTRY_LINE = 'Last time felt heavy. How are you today?';
export const FIRST_NOTE_LINE =
  "That's one thought down. Anything else sitting with you?";
export const FALLBACK: WarmLine = {
  text: "Welcome back. What's on your mind?",
  tapTarget: 'none',
};

// Quote variant for the first-note tier: build `"{first words}…" — want to say
// more?` from the most recent note. Returns null when the note is too short
// or contains nothing quotable, so the caller can fall back to FIRST_NOTE_LINE.
const QUOTE_WORD_COUNT = 6;
const QUOTE_MIN_WORDS  = 3;

export function quotedFirstNoteLine(noteText: string | null | undefined): string | null {
  if (!noteText) return null;
  const clean = noteText.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const words = clean.split(' ');
  if (words.length < QUOTE_MIN_WORDS) return null;
  const snippet = words.slice(0, QUOTE_WORD_COUNT).join(' ').replace(/[.,!?;:—–-]+$/, '');
  if (snippet.length < 10) return null;
  return `"${snippet}…" — want to say more?`;
}

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
  hasTodayFirstNote?: boolean;
  todayNoteCount?: number;
  lastNoteText?: string | null;
  yesterdaySummary: DailySummary | null;
  patternsReport: PatternsReport | null;
}): WarmLine {
  if (inputs.hasReentry) {
    return { text: REENTRY_LINE, tapTarget: 'reentry' };
  }

  // Acknowledge today's first capture before reaching back to yesterday —
  // keeps the home surface responsive to the most recent thing the user did.
  // Rotate between the static line and a quote of the last note so the warm
  // line doesn't go stale as the day's notes accumulate.
  if (inputs.hasTodayFirstNote) {
    const count = inputs.todayNoteCount ?? 1;
    const useQuote = count % 2 === 0;
    if (useQuote) {
      const quoted = quotedFirstNoteLine(inputs.lastNoteText);
      if (quoted) return { text: quoted, tapTarget: 'none' };
    }
    return { text: FIRST_NOTE_LINE, tapTarget: 'none' };
  }

  const y = inputs.yesterdaySummary;
  // Prefer the adaptive reflection field, fall back to the classic
  // insightText if only the older format is cached.
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
