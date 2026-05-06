/**
 * Tests for the pure UserContext V2 builder helpers.
 * Run with: npx tsx src/services/__tests__/userContextBuilder.test.ts
 */

import assert from 'node:assert/strict';
import {
  deriveWellbeingState,
  computeTenureDays,
  buildRecentDaysProse,
  renderContextV2,
  fitContextToBudget,
  estimateTokens,
  INSTRUCTIONS,
} from '../userContextBuilder';
import type { UserContextV2 } from '../../types';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

const NOW = 1_700_000_000_000;
const day = 86_400_000;

// ── deriveWellbeingState ─────────────────────────────────────────────────────

test('no events → regulated', () => {
  assert.equal(deriveWellbeingState([], NOW), 'regulated');
});

test('tier 3 within the last 7 days → hard_stretch', () => {
  assert.equal(
    deriveWellbeingState([{ timestamp: NOW - 3 * day, tier: 3 }], NOW),
    'hard_stretch',
  );
});

test('tier 3 at exactly 7 days ago still counts', () => {
  assert.equal(
    deriveWellbeingState([{ timestamp: NOW - 7 * day, tier: 3 }], NOW),
    'hard_stretch',
  );
});

test('tier 3 older than 7 days does NOT upgrade to hard_stretch', () => {
  assert.equal(
    deriveWellbeingState([{ timestamp: NOW - 10 * day, tier: 3 }], NOW),
    'regulated',
  );
});

test('tier 2 within 14 days → tender', () => {
  assert.equal(
    deriveWellbeingState([{ timestamp: NOW - 10 * day, tier: 2 }], NOW),
    'tender',
  );
});

test('tier 3 within 7 days beats older tier 2 → hard_stretch', () => {
  assert.equal(
    deriveWellbeingState(
      [{ timestamp: NOW - 2 * day, tier: 3 }, { timestamp: NOW - 12 * day, tier: 2 }],
      NOW,
    ),
    'hard_stretch',
  );
});

test('tier 1 events never change state → regulated', () => {
  assert.equal(
    deriveWellbeingState(
      [{ timestamp: NOW - 1 * day, tier: 1 }, { timestamp: NOW - 2 * day, tier: 1 }],
      NOW,
    ),
    'regulated',
  );
});

test('tier 2 older than 14 days → still regulated', () => {
  assert.equal(
    deriveWellbeingState([{ timestamp: NOW - 20 * day, tier: 2 }], NOW),
    'regulated',
  );
});

// ── computeTenureDays ────────────────────────────────────────────────────────

test('null first-entry → 0 tenure days', () => {
  assert.equal(computeTenureDays(null, NOW), 0);
});

test('first entry 5 days ago → tenure = 5', () => {
  assert.equal(computeTenureDays(NOW - 5 * day, NOW), 5);
});

test('first entry "in the future" guards against negative values', () => {
  assert.equal(computeTenureDays(NOW + 1000, NOW), 0);
});

test('partial day is floored', () => {
  // 1.8 days ago → should be 1 day tenure
  assert.equal(computeTenureDays(NOW - Math.floor(1.8 * day), NOW), 1);
});

// ── buildRecentDaysProse ─────────────────────────────────────────────────────

test('concatenates up to 3 non-empty reflections with date markers', () => {
  const prose = buildRecentDaysProse([
    { date: '2026-04-18', reflection: 'Quiet Friday.' },
    { date: '2026-04-17', reflection: 'Long call with Priya.' },
    { date: '2026-04-16', reflection: 'Back-to-back reviews.' },
    { date: '2026-04-15', reflection: 'Trimmed — past limit.' },
  ]);
  assert.ok(prose.startsWith('[2026-04-18]'));
  assert.ok(prose.includes('[2026-04-17]'));
  assert.ok(prose.includes('[2026-04-16]'));
  assert.ok(!prose.includes('[2026-04-15]'), 'respects limit of 3');
});

test('skips empty reflections', () => {
  const prose = buildRecentDaysProse([
    { date: '2026-04-18', reflection: '' },
    { date: '2026-04-17', reflection: 'Something real.' },
  ]);
  assert.ok(!prose.includes('2026-04-18'));
  assert.ok(prose.includes('2026-04-17'));
});

test('returns empty string when no reflections available', () => {
  assert.equal(buildRecentDaysProse([]), '');
});

// ── renderContextV2 ──────────────────────────────────────────────────────────

function sampleContext(overrides: Partial<UserContextV2> = {}): UserContextV2 {
  return {
    recentDays: '[2026-04-18] Quiet Friday. [2026-04-17] Longer call with Priya.',
    activeIntentions: [
      { id: 'i1', text: 'Call mom weekly' },
      { id: 'i2', text: 'Stop doom-scrolling before bed' },
    ],
    currentPatterns: [
      { type: 'whats_loud', body: 'Work reviews have shown up across three weeks.' },
      { type: 'returning_question', body: 'The question of whether to switch teams keeps re-surfacing.' },
    ],
    wellbeingState: 'regulated',
    recentMinds: [
      { mindId: 'companion', lastTalkedAt: NOW - day, conversationShape: 'Sitting with work decision.' },
    ],
    tenureDays: 45,
    builtAt: NOW,
    ...overrides,
  };
}

test('renders a block containing the implicit-context instruction', () => {
  const out = renderContextV2(sampleContext());
  assert.ok(out.includes('Use this context to deepen your responses'));
  assert.ok(out.includes('USER CONTEXT:'));
  assert.ok(out.includes('Call mom weekly'));
  assert.ok(out.includes('Tenure: 45 days'));
});

test('empty context still emits the instruction + fresh-install fallback', () => {
  const ctx = sampleContext({
    recentDays: '',
    activeIntentions: [],
    currentPatterns: [],
    recentMinds: [],
    tenureDays: 0,
  });
  const out = renderContextV2(ctx);
  assert.ok(out.includes('Use this context to deepen your responses'));
  assert.ok(out.includes('fresh install'));
});

test('exposes the Companion continuity instruction', () => {
  assert.ok(INSTRUCTIONS.companionContinuity.includes('continuous voice'));
  assert.ok(INSTRUCTIONS.companionContinuity.includes('prior conversations'));
});

// ── fitContextToBudget ───────────────────────────────────────────────────────

test('under-budget context is returned as-is', () => {
  const ctx = sampleContext();
  const { rendered, tokens } = fitContextToBudget(ctx, 400);
  assert.ok(tokens <= 400);
  // recentDays should still contain both day markers
  assert.ok(rendered.includes('[2026-04-18]'));
  assert.ok(rendered.includes('[2026-04-17]'));
});

test('oversized context stays under the 400-token budget after trimming', () => {
  // Stuff the context with bloat across multiple fields.
  const bloated: UserContextV2 = {
    recentDays: [
      '[2026-04-18] ' + 'word '.repeat(80),
      '[2026-04-17] ' + 'word '.repeat(80),
      '[2026-04-16] ' + 'word '.repeat(80),
    ].join(' '),
    activeIntentions: Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      text: `Long intention text number ${i} that goes on a while`,
    })),
    currentPatterns: Array.from({ length: 3 }, (_, i) => ({
      type: 'whats_loud',
      body: 'This is a long observation. '.repeat(20),
    })),
    wellbeingState: 'tender',
    recentMinds: Array.from({ length: 5 }, (_, i) => ({
      mindId: `m${i}`,
      lastTalkedAt: NOW - i * day,
      conversationShape: 'A long-winded one-line summary that is genuinely one line '.repeat(2),
    })),
    tenureDays: 200,
    builtAt: NOW,
  };
  const { rendered, tokens } = fitContextToBudget(bloated, 400);
  assert.ok(tokens <= 400, `tokens should be ≤400, got ${tokens}`);
  // After trimming, the implicit-context instruction MUST still be present —
  // it's the whole reason the block exists.
  assert.ok(rendered.includes('Use this context to deepen your responses'));
});

test('estimateTokens grows with length', () => {
  assert.ok(estimateTokens('hello') < estimateTokens('hello world hello world'));
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
