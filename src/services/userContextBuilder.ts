/**
 * Pure helpers for the rewritten UserContext (ff_new_minds_system).
 *
 * Kept in a separate module from UserContextService so the structural logic
 * (wellbeing derivation, tenure math, rendering, token-budget fitting) can
 * be unit-tested under plain tsx without AsyncStorage / Claude / RN
 * transitively in the graph.
 */

import type {
  UserContextV2,
  WellbeingState,
  UserContextRecentMind,
} from '../types';

// ── Wellbeing derivation ─────────────────────────────────────────────────────

interface DistressEventLite {
  timestamp: number;
  tier: 1 | 2 | 3;
}

/**
 * Pure derivation of `wellbeingState` from recent distress events.
 *
 *   tier 3 within the last 7 days     → 'hard_stretch'
 *   tier 2 within the last 14 days    → 'tender'
 *   otherwise (incl. no events at all) → 'regulated'
 */
export function deriveWellbeingState(
  events: DistressEventLite[],
  now: number = Date.now(),
): WellbeingState {
  const sevenDayCutoff  = now - 7  * 86_400_000;
  const fourteenDayCut  = now - 14 * 86_400_000;
  let hasTier3InWeek    = false;
  let hasTier2InFortnight = false;
  for (const e of events) {
    if (e.tier === 3 && e.timestamp >= sevenDayCutoff) hasTier3InWeek = true;
    if (e.tier === 2 && e.timestamp >= fourteenDayCut) hasTier2InFortnight = true;
  }
  if (hasTier3InWeek) return 'hard_stretch';
  if (hasTier2InFortnight) return 'tender';
  return 'regulated';
}

// ── Tenure ───────────────────────────────────────────────────────────────────

/**
 * Whole days between `firstEntryTimestamp` and `now`. Returns 0 when there
 * is no first entry yet (a fresh install) rather than a negative/misleading
 * value.
 */
export function computeTenureDays(
  firstEntryTimestamp: number | null,
  now: number = Date.now(),
): number {
  if (!firstEntryTimestamp) return 0;
  const diff = now - firstEntryTimestamp;
  if (diff <= 0) return 0;
  return Math.floor(diff / 86_400_000);
}

// ── Recent-days prose ────────────────────────────────────────────────────────

/**
 * Concatenate the last N reflection strings with compact date markers.
 * Input: ordered newest-first `{ date, reflection }` tuples.
 */
export function buildRecentDaysProse(
  entries: Array<{ date: string; reflection: string }>,
  limit = 3,
): string {
  const kept = entries
    .filter(e => e.reflection && e.reflection.trim().length > 0)
    .slice(0, limit);
  if (kept.length === 0) return '';
  return kept.map(e => `[${e.date}] ${e.reflection.trim()}`).join(' ');
}

// ── Rendering for Claude system prompt ───────────────────────────────────────

const USE_CONTEXT_IMPLICITLY_INSTRUCTION = `
You have context about this user — their recent days, active intentions, current patterns, wellbeing state, and minds they've spoken with recently. Use this context to deepen your responses, not to demonstrate your memory. Reference it implicitly — let the user feel seen, not surveilled. Do not list what you know. Do not itemize their history. Draw on context only when it illuminates this moment's conversation.`;

const COMPANION_CONTINUITY_INSTRUCTION = `
You are the continuous voice of this app. Unlike the specialist minds, you may occasionally reference prior conversations explicitly — but briefly, and only when it serves the present moment.`;

export const INSTRUCTIONS = {
  implicitContext: USE_CONTEXT_IMPLICITLY_INSTRUCTION,
  companionContinuity: COMPANION_CONTINUITY_INSTRUCTION,
};

function intentionsLine(ctx: UserContextV2): string | null {
  if (ctx.activeIntentions.length === 0) return null;
  return `Active intentions: ${ctx.activeIntentions.map(i => `"${i.text}"`).join(' · ')}`;
}

function patternsLine(ctx: UserContextV2): string | null {
  if (ctx.currentPatterns.length === 0) return null;
  return ctx.currentPatterns
    .map(p => `Pattern (${p.type}): ${p.body}`)
    .join('\n');
}

function mindsLine(minds: UserContextRecentMind[]): string | null {
  if (minds.length === 0) return null;
  return 'Recent conversations: ' +
    minds.map(m => `${m.mindId} — ${m.conversationShape}`).join(' · ');
}

function wellbeingLine(state: WellbeingState): string {
  switch (state) {
    case 'hard_stretch': return 'Wellbeing state: hard stretch. Hold space carefully — recent entries have been heavy.';
    case 'tender':       return 'Wellbeing state: tender. Something heavy has surfaced recently.';
    case 'regulated':    return 'Wellbeing state: regulated.';
  }
}

/**
 * Render a compact context block for injection into Claude system prompts.
 * Returns '' when there's essentially nothing to share (fresh install).
 */
export function renderContextV2(ctx: UserContextV2): string {
  const hasAnything =
    ctx.recentDays.length > 0 ||
    ctx.activeIntentions.length > 0 ||
    ctx.currentPatterns.length > 0 ||
    ctx.recentMinds.length > 0;

  if (!hasAnything) {
    // Still emit the "use context implicitly" instruction; even knowing
    // tenureDays=0 / wellbeing=regulated shapes the response subtly.
    return [
      USE_CONTEXT_IMPLICITLY_INSTRUCTION,
      `\nUSER CONTEXT:\n- Tenure: fresh install.\n- ${wellbeingLine(ctx.wellbeingState)}`,
    ].join('\n');
  }

  const parts: string[] = [];
  if (ctx.recentDays) parts.push(`Recent days: ${ctx.recentDays}`);
  const il = intentionsLine(ctx);   if (il) parts.push(il);
  const pl = patternsLine(ctx);     if (pl) parts.push(pl);
  parts.push(wellbeingLine(ctx.wellbeingState));
  const ml = mindsLine(ctx.recentMinds); if (ml) parts.push(ml);
  parts.push(`Tenure: ${ctx.tenureDays} day${ctx.tenureDays === 1 ? '' : 's'} of journaling.`);

  return [
    USE_CONTEXT_IMPLICITLY_INSTRUCTION,
    `\nUSER CONTEXT:\n${parts.map(p => `- ${p}`).join('\n')}`,
  ].join('\n');
}

// ── Token-budget fitting ─────────────────────────────────────────────────────

/** Rough token estimate — 4 chars per token is a decent English heuristic. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/**
 * Fit a context block under `maxTokens` by progressively trimming. Order of
 * reductions:
 *   1. recentDays: 3 sentences → 2 → 1 → ''
 *   2. currentPatterns body trimmed to 120 chars each
 *   3. recentMinds: 5 → 3 → 0
 *   4. Hard truncate the final string at the budget.
 */
export function fitContextToBudget(
  ctx: UserContextV2,
  maxTokens = 400,
): { context: UserContextV2; rendered: string; tokens: number } {
  let working: UserContextV2 = { ...ctx };

  const steps: Array<() => void> = [
    () => {
      // Pass 1: trim recentDays prose by sentence count (approximated by "[date] ").
      // The prose is already concatenated reflections; easy way is to drop trailing
      // day blocks one at a time.
      const blocks = working.recentDays.split(/(?=\[\d{4}-\d{2}-\d{2}\])/g).filter(Boolean);
      if (blocks.length >= 3) {
        working = { ...working, recentDays: blocks.slice(0, 2).join(' ').trim() };
      }
    },
    () => {
      const blocks = working.recentDays.split(/(?=\[\d{4}-\d{2}-\d{2}\])/g).filter(Boolean);
      if (blocks.length >= 2) {
        working = { ...working, recentDays: blocks.slice(0, 1).join(' ').trim() };
      }
    },
    () => {
      // Pass 3: truncate pattern bodies.
      working = {
        ...working,
        currentPatterns: working.currentPatterns.map(p =>
          p.body.length > 120 ? { ...p, body: p.body.slice(0, 117).trimEnd() + '…' } : p,
        ),
      };
    },
    () => {
      // Pass 4: cap recentMinds to 3.
      working = { ...working, recentMinds: working.recentMinds.slice(0, 3) };
    },
    () => {
      working = { ...working, recentDays: '' };
    },
    () => {
      working = { ...working, recentMinds: [] };
    },
  ];

  let rendered = renderContextV2(working);
  let tokens   = estimateTokens(rendered);

  for (const step of steps) {
    if (tokens <= maxTokens) break;
    step();
    rendered = renderContextV2(working);
    tokens   = estimateTokens(rendered);
  }

  // Final hard stop — the instruction block alone is ~90 tokens, so if we
  // still blow the budget, cut the USER CONTEXT portion character-wise.
  if (tokens > maxTokens) {
    const maxChars = maxTokens * 4;
    rendered = rendered.slice(0, maxChars);
    tokens   = estimateTokens(rendered);
  }

  return { context: working, rendered, tokens };
}
