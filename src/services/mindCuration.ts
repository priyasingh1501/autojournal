/**
 * MindCurationService — chooses which minds to surface when the user taps
 * "new perspective" from any surface. This module is a pure reducer over a
 * CurationContext and therefore directly testable under tsx.
 *
 * Design notes:
 *   - Rules are evaluated in order; the first matching rule wins.
 *   - Acute distress (Rule 1) is declared first so it always overrides.
 *   - Rule 2 ("from a specific Pattern") deliberately falls through when
 *     the pattern subtype is `whats_loud` — the spec routes that case to
 *     the theme-based rules below.
 *   - Rule 13 includes a rotating slot seeded by week number so repeat
 *     users don't see the same default pair forever; the seed is passed in
 *     so tests stay deterministic.
 *
 * This file imports ONLY types. Do not import MINDS_V2 or anything that
 * pulls in require() of native assets — it breaks tsx test execution.
 */

import type { AcrossTimeType } from '../types';

// ── Public types ─────────────────────────────────────────────────────────────

export interface CurationContextSourceContent {
  type: 'pattern' | 'day' | 'short' | 'intention' | 'prompt';
  data: any;
  patternType?: AcrossTimeType; // explicit type for pattern observations
}

export interface CurationContext {
  sourceSurface: 'home' | 'day_summary' | 'patterns' | 'wisdom_short' | 'other';
  sourceContent?: CurationContextSourceContent;
  wellbeingState: 'regulated' | 'tender' | 'hard_stretch';
  dominantEmotions: string[];
  dominantThemes: string[];
  activeIntentions: string[];
  tenureDays: number;
  intentionCategory?: string; // category of the intention being discussed (Rule 2c)
}

export interface CurationSpecialist {
  id: string;
  displayName: string;
  copy: string;
}

export interface CurationResult {
  companion: {
    id: 'companion';
    displayName: 'Companion';
    copy: string;
  };
  specialists: CurationSpecialist[]; // 0–2 items
  showSeeAllMinds: boolean;
  matchedRuleId: string;             // for analytics
}

// ── Display name registry (pure — no asset requires) ────────────────────────

export const MIND_DISPLAY_NAMES: Record<string, string> = {
  companion:          'Companion',
  ramana_maharshi:    'Ramana Maharshi',
  krishna:            'Krishna',
  jiddu_krishnamurti: 'J. Krishnamurti',
  adi_shankaracharya: 'Adi Shankaracharya',
  buddha:             'Buddha',
  rumi:               'Rumi',
  carl_jung:          'Carl Jung',
  charlie_munger:     'Charlie Munger',
};

function displayNameOf(id: string): string {
  return MIND_DISPLAY_NAMES[id] ?? id;
}

// ── Copy constants ──────────────────────────────────────────────────────────

const COMPANION_DEFAULT_COPY = 'Warm. Will meet you where you are.';
const COMPANION_ACUTE_COPY   = 'Companion can sit with this. The other minds are here when you\'re ready.';

// ── Rule shape ──────────────────────────────────────────────────────────────

interface RuleOutput {
  companionCopyOverride?: string;
  specialists: Array<{ id: string; copy: string }>;
  showSeeAllMinds?: boolean;
}

interface CurationRule {
  id: string;
  trigger: (ctx: CurationContext) => boolean;
  output: (ctx: CurationContext, now: number) => RuleOutput;
}

// ── Helpers used by triggers ────────────────────────────────────────────────

function anyOf(haystack: readonly string[], needles: readonly string[]): boolean {
  const set = new Set(haystack.map(s => s.toLowerCase()));
  return needles.some(n => set.has(n.toLowerCase()));
}

function patternSubtype(ctx: CurationContext): AcrossTimeType | null {
  const c = ctx.sourceContent;
  if (!c || c.type !== 'pattern') return null;
  const t = c.data?.type;
  const known: readonly AcrossTimeType[] = [
    'whats_loud', 'returning_question', 'mind_moving', 'wondering_about', 'gone_quiet',
  ];
  return (known as readonly string[]).includes(t) ? (t as AcrossTimeType) : null;
}

// Reads the explicit patternType field (preferred over data.type when set).
function explicitPatternType(ctx: CurationContext): AcrossTimeType | null {
  return ctx.sourceContent?.patternType ?? null;
}

// ── Category → specialist mapping (Rule 2c) ──────────────────────────────────

const INTENTION_CATEGORY_SPECIALISTS: Partial<Record<string, Array<{ id: string; copy: string }>>> = {
  health: [
    { id: 'buddha',             copy: 'for what the body is telling you' },
    { id: 'krishna',            copy: 'for acting without attachment to the result' },
  ],
  relationships: [
    { id: 'carl_jung',          copy: 'for what this relationship reflects in you' },
    { id: 'rumi',               copy: 'for the love or longing underneath' },
  ],
  work: [
    { id: 'krishna',            copy: "for what you're called to do here" },
    { id: 'charlie_munger',     copy: 'for thinking it through clearly' },
  ],
  mind: [
    { id: 'ramana_maharshi',    copy: 'for who is watching the mind' },
    { id: 'jiddu_krishnamurti', copy: 'for seeing what the mind is doing' },
  ],
  creative: [
    { id: 'rumi',               copy: 'for the longing that wants to make something' },
    { id: 'carl_jung',          copy: "for what's trying to come through you" },
  ],
  spiritual: [
    { id: 'ramana_maharshi',    copy: 'for the direct experience' },
    { id: 'adi_shankaracharya', copy: 'for the structure beneath it' },
  ],
  financial: [
    { id: 'charlie_munger',     copy: 'for thinking it through clearly' },
    { id: 'krishna',            copy: 'for acting without being owned by the outcome' },
  ],
  // 'other' intentionally omitted — falls through to theme-based rules
};

// ── Rules ───────────────────────────────────────────────────────────────────
// Evaluated top-to-bottom; first match wins.

export const RULES: readonly CurationRule[] = [
  // Rule 1 — Acute distress
  {
    id: 'acute_distress',
    trigger: ctx => ctx.wellbeingState === 'hard_stretch',
    output: () => ({
      companionCopyOverride: COMPANION_ACUTE_COPY,
      specialists: [],
      showSeeAllMinds: false,
    }),
  },

  // Rule 2b — Tapped from a Patterns observation with an explicit patternType.
  // Fires before rule 2 when patternType is set on sourceContent. whats_loud
  // falls through so theme-based rules can match (same behaviour as rule 2).
  {
    id: 'from_pattern_type',
    trigger: ctx => {
      const pt = explicitPatternType(ctx);
      return ctx.sourceSurface === 'patterns' && pt !== null && pt !== 'whats_loud';
    },
    output: ctx => {
      switch (explicitPatternType(ctx)) {
        case 'returning_question':
          return { specialists: [
            { id: 'jiddu_krishnamurti', copy: 'for why this keeps returning' },
            { id: 'ramana_maharshi',    copy: 'for who is the one asking' },
          ]};
        case 'wondering_about':
          return { specialists: [
            { id: 'carl_jung',       copy: 'for what might be beneath it' },
            { id: 'ramana_maharshi', copy: 'for who is noticing' },
          ]};
        case 'gone_quiet':
          return { specialists: [
            { id: 'carl_jung', copy: 'for what the silence might mean' },
            { id: 'rumi',      copy: "for what's asking to be felt" },
          ]};
        case 'mind_moving':
          return { specialists: [
            { id: 'jiddu_krishnamurti', copy: "for what's shifting in how you see" },
            { id: 'adi_shankaracharya', copy: 'for the structure beneath the shift' },
          ]};
        case 'whats_pulling_you':
          return { specialists: [
            { id: 'krishna', copy: "for what you're called toward" },
            { id: 'buddha',  copy: 'for what the pull is rooted in' },
          ]};
        case 'stated_vs_actual':
          return { specialists: [
            { id: 'jiddu_krishnamurti', copy: 'for the gap between what you say and what you live' },
            { id: 'carl_jung',          copy: 'for the shadow in the difference' },
          ]};
        case 'recurring_cast':
          return { specialists: [
            { id: 'carl_jung', copy: 'for what these people are showing you about yourself' },
            { id: 'rumi',      copy: 'for the love or longing underneath' },
          ]};
        case 'thinking_texture':
          return { specialists: [
            { id: 'jiddu_krishnamurti', copy: 'for seeing how the mind moves' },
            { id: 'adi_shankaracharya', copy: 'for the awareness watching it' },
          ]};
        default:
          return { specialists: [] }; // yields — unrecognised type falls through
      }
    },
  },

  // Rule 2c — Tapped from an intention with a known category.
  // Fires when sourceContent.type === 'intention' and intentionCategory is set.
  // 'other' category falls through so theme-based rules can match.
  {
    id: 'from_intention_category',
    trigger: ctx => {
      const cat = ctx.intentionCategory;
      return (
        ctx.sourceContent?.type === 'intention' &&
        !!cat &&
        cat !== 'other' &&
        !!INTENTION_CATEGORY_SPECIALISTS[cat]
      );
    },
    output: ctx => ({
      specialists: INTENTION_CATEGORY_SPECIALISTS[ctx.intentionCategory!] ?? [],
    }),
  },

  // Rule 2 — Tapped in from a specific Patterns observation.
  // Trigger only fires for subtypes the spec handles here; `whats_loud`
  // deliberately falls through so theme-based rules can match.
  {
    id: 'from_pattern',
    trigger: ctx => {
      const sub = patternSubtype(ctx);
      return sub !== null && sub !== 'whats_loud';
    },
    output: ctx => {
      const sub = patternSubtype(ctx);
      switch (sub) {
        case 'returning_question':
          return {
            specialists: [
              { id: 'jiddu_krishnamurti', copy: 'for looking at why the question keeps coming back' },
              { id: 'ramana_maharshi',    copy: 'for the one who keeps asking it' },
            ],
          };
        case 'wondering_about':
          return {
            specialists: [
              { id: 'carl_jung',       copy: 'for what this wondering might be pointing at' },
              { id: 'ramana_maharshi', copy: 'for the one doing the wondering' },
            ],
          };
        case 'gone_quiet':
          return {
            specialists: [
              { id: 'carl_jung', copy: 'for what the quieting might mean' },
              { id: 'rumi',      copy: 'for sitting with the absence, not rushing past it' },
            ],
          };
        case 'mind_moving':
          return {
            specialists: [
              { id: 'jiddu_krishnamurti', copy: 'for watching the shift happen directly' },
              { id: 'adi_shankaracharya', copy: 'for the scaffolding of what moved' },
            ],
          };
        default:
          return { specialists: [] };
      }
    },
  },

  // Rule 3 — Decision / choice paralysis
  {
    id: 'decision',
    trigger: ctx => anyOf(ctx.dominantThemes, ['decision', 'choice', 'choices', 'decisions']),
    output: () => ({
      specialists: [
        { id: 'krishna',        copy: "for the question of what you're called to do" },
        { id: 'charlie_munger', copy: 'for thinking it through clearly' },
      ],
    }),
  },

  // Rule 4 — Existential questioning
  {
    id: 'existential',
    trigger: ctx => anyOf(ctx.dominantThemes, ['identity', 'meaning', 'purpose']),
    output: () => ({
      specialists: [
        { id: 'ramana_maharshi',    copy: 'for the one who is asking' },
        { id: 'jiddu_krishnamurti', copy: "for seeing past what you've been told" },
      ],
    }),
  },

  // Rule 5 — Grief / loss / longing (only when not in hard stretch; Rule 1 owns that)
  {
    id: 'grief_loss_longing',
    trigger: ctx =>
      ctx.wellbeingState !== 'hard_stretch' &&
      anyOf(ctx.dominantEmotions, ['sad', 'lonely', 'longing', 'grieving']),
    output: () => ({
      specialists: [
        { id: 'rumi',   copy: 'for sitting in the ache, not past it' },
        { id: 'buddha', copy: 'for what the ache is holding onto' },
      ],
    }),
  },

  // Rule 6 — Stuck in loops / recurring thoughts
  {
    id: 'recurring_loops',
    trigger: ctx => anyOf(ctx.dominantThemes, ['recurring', 'loop', 'loops', 'rumination']),
    output: () => ({
      specialists: [
        { id: 'jiddu_krishnamurti', copy: 'for why this thought keeps coming back' },
        { id: 'carl_jung',          copy: 'for what it might be trying to tell you' },
      ],
    }),
  },

  // Rule 7 — Something feels off / self-understanding
  {
    id: 'self_understanding',
    trigger: ctx => anyOf(ctx.dominantThemes, ['confusion', 'self-understanding', 'self_understanding']),
    output: () => ({
      specialists: [
        { id: 'carl_jung',       copy: 'for what might be beneath the surface' },
        { id: 'ramana_maharshi', copy: 'for who is noticing it' },
      ],
    }),
  },

  // Rule 8 — Stuck belief / conditioning
  {
    id: 'conditioning',
    trigger: ctx => anyOf(ctx.dominantThemes, ['belief', 'beliefs', 'conditioning', 'should', 'shoulds']),
    output: () => ({
      specialists: [
        { id: 'jiddu_krishnamurti', copy: "for freeing yourself from what you've been given" },
        { id: 'adi_shankaracharya', copy: "for seeing what's real beneath what's assumed" },
      ],
    }),
  },

  // Rule 9 — Craving / wanting
  {
    id: 'craving',
    trigger: ctx => anyOf(ctx.dominantThemes, ['desire', 'craving', 'wanting', 'want']),
    output: () => ({
      specialists: [
        { id: 'buddha',  copy: 'for what the wanting is really about' },
        { id: 'krishna', copy: 'for acting without being owned by the outcome' },
      ],
    }),
  },

  // Rule 10 — Philosophical / clarity questions
  {
    id: 'philosophical',
    trigger: ctx => anyOf(ctx.dominantThemes, ['philosophy', 'philosophical', 'clarity']),
    output: () => ({
      specialists: [
        { id: 'adi_shankaracharya', copy: 'for the structure of it' },
        { id: 'ramana_maharshi',    copy: 'for the direct experience of it' },
      ],
    }),
  },

  // Rule 11 — Interpersonal / relationships
  {
    id: 'interpersonal',
    trigger: ctx => anyOf(ctx.dominantThemes, ['relationship', 'relationships', 'conflict', 'misunderstood']),
    output: () => ({
      specialists: [
        { id: 'carl_jung', copy: 'for what this relationship is showing you about yourself' },
        { id: 'rumi',      copy: 'for the love underneath the frustration' },
      ],
    }),
  },

  // Rule 12 — Achievement / productivity anxiety
  {
    id: 'work_anxiety',
    trigger: ctx =>
      anyOf(ctx.dominantThemes, ['work', 'productivity', 'career']) &&
      anyOf(ctx.dominantEmotions, ['anxious', 'inadequate', 'stressed', 'overwhelmed']),
    output: () => ({
      specialists: [
        { id: 'jiddu_krishnamurti', copy: "for the self that's measuring" },
        { id: 'krishna',            copy: 'for work without the weight of result' },
      ],
    }),
  },

  // Rule 13 — Default (nothing else matched). Rotates the second slot by week
  // so regular users see fresh pairings over time.
  {
    id: 'default',
    trigger: () => true,
    output: (_ctx, now) => {
      const weekNumber = Math.floor(now / (7 * 86_400_000));
      const rotating: Array<{ id: string; copy: string }> = [
        { id: 'jiddu_krishnamurti', copy: 'for looking directly at what is' },
        { id: 'carl_jung',          copy: 'for what lies beneath the surface' },
        { id: 'rumi',               copy: 'for the feeling itself' },
      ];
      const pick = rotating[weekNumber % rotating.length];
      return {
        specialists: [
          { id: 'ramana_maharshi', copy: 'for going a layer deeper' },
          pick,
        ],
      };
    },
  },
];

// ── Public entry point ──────────────────────────────────────────────────────

export function curate(ctx: CurationContext, now: number = Date.now()): CurationResult {
  for (const rule of RULES) {
    if (!rule.trigger(ctx)) continue;
    const out = rule.output(ctx, now);

    // Skip rules whose output is "no specialists AND no copy override" — that
    // case means the rule intentionally yields. (Rule 2 with an unrecognised
    // subtype, for example.)
    const isEmpty = out.specialists.length === 0 && !out.companionCopyOverride;
    if (isEmpty) continue;

    return {
      companion: {
        id: 'companion',
        displayName: 'Companion',
        copy: out.companionCopyOverride ?? COMPANION_DEFAULT_COPY,
      },
      specialists: out.specialists.slice(0, 2).map(s => ({
        id: s.id,
        displayName: displayNameOf(s.id),
        copy: s.copy,
      })),
      showSeeAllMinds: out.showSeeAllMinds ?? true,
      matchedRuleId: rule.id,
    };
  }

  // Unreachable — rule 13's trigger always returns true — but typed for safety.
  return {
    companion: { id: 'companion', displayName: 'Companion', copy: COMPANION_DEFAULT_COPY },
    specialists: [],
    showSeeAllMinds: true,
    matchedRuleId: 'none',
  };
}
