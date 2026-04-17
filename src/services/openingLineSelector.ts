/**
 * Pure opening-line selection for ff_new_minds_system.
 *
 * The handcrafted openers in mindsConfigV2 are the product — this module
 * chooses the RIGHT one (distress / with-context / generic) and, when a
 * source context is present, signals that a light Haiku adaptation pass
 * should run next. We never let the model generate the opener wholesale.
 *
 * Pure: imports only types + the mind roster config (which itself is
 * pure — no AsyncStorage / Claude / RN in that path). Safe under tsx tests.
 */

import type { MindV2, WellbeingState } from '../types';

// ── Source context ──────────────────────────────────────────────────────────

export type SourceContextKind = 'pattern' | 'day' | 'short' | 'none';

export interface SourceContext {
  kind: Exclude<SourceContextKind, 'none'>;
  /** Pre-rendered description used by the Haiku adaptation pass. */
  description: string;
}

export interface PatternSource {
  body: string;
}
export interface DaySource {
  date: string;
  reflection?: string;
}
export interface ShortSource {
  title: string;
  author: string;
}

/**
 * Shape a pattern observation into a SourceContext. Callers pass in only
 * the fields we need (`body`) so we don't have to import the full
 * AcrossTimeObservation type here.
 */
export function patternSourceContext(p: PatternSource): SourceContext {
  return {
    kind: 'pattern',
    description: `The user tapped in from this pattern: ${p.body.trim()}`,
  };
}

export function daySourceContext(d: DaySource): SourceContext {
  const reflection = d.reflection?.trim();
  const reflectionPart = reflection
    ? `, which reflected on: ${reflection}`
    : '';
  return {
    kind: 'day',
    description: `The user tapped in from their summary of ${d.date}${reflectionPart}`,
  };
}

export function shortSourceContext(s: ShortSource): SourceContext {
  return {
    kind: 'short',
    description: `The user tapped in from this wisdom short: "${s.title.trim()}" by ${s.author.trim()}`,
  };
}

// ── Companion tenure mode ───────────────────────────────────────────────────

export type CompanionMode = 'gentle' | 'standard' | 'familiar';

export function tenureMode(tenureDays: number): CompanionMode {
  if (tenureDays < 30) return 'gentle';
  if (tenureDays >= 90) return 'familiar';
  return 'standard';
}

const COMPANION_MODE_DIRECTIVE: Record<CompanionMode, string> = {
  gentle:
    'VOICE MODE: gentle. This user is still early in their tenure (< 30 days). Lean soft. Questions should be gentle. Trust is still being earned — do not push.',
  standard:
    'VOICE MODE: standard.',
  familiar:
    'VOICE MODE: familiar. You know this user well (90+ days). You may — kindly, honestly — reflect back things they may be avoiding. You have earned the right to gently name what you see.',
};

export function companionModeDirective(mode: CompanionMode): string {
  return COMPANION_MODE_DIRECTIVE[mode];
}

// ── Opening selection ───────────────────────────────────────────────────────

export interface OpeningSelection {
  /** The handcrafted line we picked. Never model-generated. */
  line: string;
  /** Which pool it came from. */
  source: 'generic' | 'with_context' | 'distress';
  /** True when callers should run the Haiku adaptation pass next. */
  needsAdaptation: boolean;
  /** Companion-only voice mode for this conversation. */
  companionMode?: CompanionMode;
}

interface SelectionInput {
  mind: MindV2;
  sourceContext: SourceContext | null;
  wellbeingState: WellbeingState;
  tenureDays: number;
  /** Deterministic index picker — defaults to Math.random(). */
  pickIndex?: (n: number) => number;
}

function defaultPick(n: number): number {
  return Math.floor(Math.random() * n);
}

function pickLine(arr: readonly string[], pick: (n: number) => number): string {
  if (arr.length === 0) return '';
  const idx = Math.max(0, Math.min(arr.length - 1, pick(arr.length)));
  return arr[idx];
}

/**
 * Select the appropriate opening line for this (mind, context, wellbeing,
 * tenure) tuple. Pure.
 *
 * Rules:
 *   1. Companion + hard_stretch → openingLinesDistress (if present).
 *      needsAdaptation = false — distress openers are grounding, the
 *      handcrafted wording MUST NOT be altered.
 *   2. SourceContext present + mind has openingLinesWithContext →
 *      pick from that pool, needsAdaptation = true (caller will run Haiku).
 *   3. Otherwise → pick from openingLines, needsAdaptation = false.
 */
export function selectOpening(input: SelectionInput): OpeningSelection {
  const pick = input.pickIndex ?? defaultPick;
  const isCompanion = input.mind.id === 'companion';
  const companionMode = isCompanion ? tenureMode(input.tenureDays) : undefined;

  // Rule 1 — distress opener for Companion only.
  if (
    isCompanion &&
    input.wellbeingState === 'hard_stretch' &&
    input.mind.openingLinesDistress &&
    input.mind.openingLinesDistress.length > 0
  ) {
    return {
      line: pickLine(input.mind.openingLinesDistress, pick),
      source: 'distress',
      needsAdaptation: false,
      companionMode,
    };
  }

  // Rule 2 — context-aware opener when the user tapped in from something.
  if (
    input.sourceContext &&
    input.mind.openingLinesWithContext.length > 0
  ) {
    return {
      line: pickLine(input.mind.openingLinesWithContext, pick),
      source: 'with_context',
      needsAdaptation: true,
      companionMode,
    };
  }

  // Rule 3 — generic opener.
  return {
    line: pickLine(input.mind.openingLines, pick),
    source: 'generic',
    needsAdaptation: false,
    companionMode,
  };
}
