/**
 * Tests for the pure curation reducer.
 * Run with: npx tsx src/services/__tests__/mindCuration.test.ts
 */

import assert from 'node:assert/strict';
import { curate, CurationContext } from '../mindCuration';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

const NOW = 1_700_000_000_000;

function baseCtx(over: Partial<CurationContext> = {}): CurationContext {
  return {
    sourceSurface: 'home',
    sourceContent: undefined,
    wellbeingState: 'regulated',
    dominantEmotions: [],
    dominantThemes: [],
    activeIntentions: [],
    tenureDays: 10,
    ...over,
  };
}

function ids(result: ReturnType<typeof curate>): string[] {
  return result.specialists.map(s => s.id);
}

// ── Rule 1 — acute distress ─────────────────────────────────────────────────

test('acute distress suppresses specialists and hides "See all minds"', () => {
  const r = curate(baseCtx({ wellbeingState: 'hard_stretch' }), NOW);
  assert.equal(r.matchedRuleId, 'acute_distress');
  assert.equal(r.specialists.length, 0);
  assert.equal(r.showSeeAllMinds, false);
  assert.ok(r.companion.copy.toLowerCase().includes('ready'));
});

test('acute distress overrides a would-be theme match', () => {
  const r = curate(
    baseCtx({ wellbeingState: 'hard_stretch', dominantThemes: ['decision'] }),
    NOW,
  );
  // Rule 1 fires, not Rule 3.
  assert.equal(r.matchedRuleId, 'acute_distress');
  assert.equal(r.specialists.length, 0);
});

// ── Rule 2 — from pattern ────────────────────────────────────────────────────

test('returning_question pattern → Krishnamurti + Ramana', () => {
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'returning_question' } },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'ramana_maharshi']);
});

test('wondering_about pattern → Jung + Ramana', () => {
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'wondering_about' } },
  }), NOW);
  assert.deepEqual(ids(r), ['carl_jung', 'ramana_maharshi']);
});

test('gone_quiet pattern → Jung + Rumi', () => {
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'gone_quiet' } },
  }), NOW);
  assert.deepEqual(ids(r), ['carl_jung', 'rumi']);
});

test('mind_moving pattern → Krishnamurti + Shankaracharya', () => {
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'mind_moving' } },
  }), NOW);
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'adi_shankaracharya']);
});

test('whats_loud pattern deliberately falls through to theme-based rules', () => {
  // With no themes set, rule 13 (default) should end up matching.
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'whats_loud' } },
  }), NOW);
  assert.notEqual(r.matchedRuleId, 'from_pattern');
  assert.equal(r.matchedRuleId, 'default');
});

test('whats_loud + decision theme falls through and matches Rule 3', () => {
  const r = curate(baseCtx({
    sourceContent: { type: 'pattern', data: { type: 'whats_loud' } },
    dominantThemes: ['decision'],
  }), NOW);
  assert.equal(r.matchedRuleId, 'decision');
  assert.deepEqual(ids(r), ['krishna', 'charlie_munger']);
});

// ── Rule 2b — from_pattern_type (explicit patternType field) ─────────────────

test('rule 2b: returning_question via patternType → Krishnamurti + Ramana', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'returning_question' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'ramana_maharshi']);
});

test('rule 2b: wondering_about via patternType → Jung + Ramana', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'wondering_about' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['carl_jung', 'ramana_maharshi']);
});

test('rule 2b: gone_quiet via patternType → Jung + Rumi', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'gone_quiet' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['carl_jung', 'rumi']);
});

test('rule 2b: mind_moving via patternType → Krishnamurti + Shankaracharya', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'mind_moving' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'adi_shankaracharya']);
});

test('rule 2b: whats_pulling_you via patternType → Krishna + Buddha', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'whats_pulling_you' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['krishna', 'buddha']);
});

test('rule 2b: stated_vs_actual via patternType → Krishnamurti + Jung', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'stated_vs_actual' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'carl_jung']);
});

test('rule 2b: recurring_cast via patternType → Jung + Rumi', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'recurring_cast' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['carl_jung', 'rumi']);
});

test('rule 2b: thinking_texture via patternType → Krishnamurti + Shankaracharya', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'thinking_texture' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'from_pattern_type');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'adi_shankaracharya']);
});

test('rule 2b: whats_loud via patternType falls through to default', () => {
  const r = curate(baseCtx({
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'whats_loud' },
  }), NOW);
  assert.notEqual(r.matchedRuleId, 'from_pattern_type');
  assert.equal(r.matchedRuleId, 'default');
});

test('rule 2b: acute distress overrides rule 2b', () => {
  const r = curate(baseCtx({
    wellbeingState: 'hard_stretch',
    sourceSurface: 'patterns',
    sourceContent: { type: 'pattern', data: {}, patternType: 'stated_vs_actual' },
  }), NOW);
  assert.equal(r.matchedRuleId, 'acute_distress');
});

test('rule 2b requires sourceSurface === patterns (non-patterns surface falls through to rule 2)', () => {
  // Same patternType but from a different surface — rule 2b must NOT fire
  const r = curate(baseCtx({
    sourceSurface: 'home',
    sourceContent: { type: 'pattern', data: { type: 'stated_vs_actual' }, patternType: 'stated_vs_actual' },
  }), NOW);
  // from_pattern_type should not fire for non-patterns surface;
  // rule 2 (from_pattern) may fire instead since data.type is also set
  assert.notEqual(r.matchedRuleId, 'from_pattern_type');
});

// ── Rules 3–12 — theme / emotion triggers ───────────────────────────────────

test('Rule 3 decision → Krishna + Munger', () => {
  const r = curate(baseCtx({ dominantThemes: ['decision'] }), NOW);
  assert.equal(r.matchedRuleId, 'decision');
  assert.deepEqual(ids(r), ['krishna', 'charlie_munger']);
});

test('Rule 4 existential (identity) → Ramana + Krishnamurti', () => {
  const r = curate(baseCtx({ dominantThemes: ['identity'] }), NOW);
  assert.equal(r.matchedRuleId, 'existential');
  assert.deepEqual(ids(r), ['ramana_maharshi', 'jiddu_krishnamurti']);
});

test('Rule 5 grief/longing when regulated → Rumi + Buddha', () => {
  const r = curate(baseCtx({ dominantEmotions: ['sad'] }), NOW);
  assert.equal(r.matchedRuleId, 'grief_loss_longing');
  assert.deepEqual(ids(r), ['rumi', 'buddha']);
});

test('Rule 5 does NOT fire in hard_stretch (Rule 1 wins)', () => {
  const r = curate(baseCtx({
    wellbeingState: 'hard_stretch',
    dominantEmotions: ['sad'],
  }), NOW);
  assert.equal(r.matchedRuleId, 'acute_distress');
});

test('Rule 6 recurring → Krishnamurti + Jung', () => {
  const r = curate(baseCtx({ dominantThemes: ['recurring'] }), NOW);
  assert.equal(r.matchedRuleId, 'recurring_loops');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'carl_jung']);
});

test('Rule 7 confusion → Jung + Ramana', () => {
  const r = curate(baseCtx({ dominantThemes: ['confusion'] }), NOW);
  assert.equal(r.matchedRuleId, 'self_understanding');
  assert.deepEqual(ids(r), ['carl_jung', 'ramana_maharshi']);
});

test('Rule 8 conditioning → Krishnamurti + Shankaracharya', () => {
  const r = curate(baseCtx({ dominantThemes: ['conditioning'] }), NOW);
  assert.equal(r.matchedRuleId, 'conditioning');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'adi_shankaracharya']);
});

test('Rule 9 craving → Buddha + Krishna', () => {
  const r = curate(baseCtx({ dominantThemes: ['craving'] }), NOW);
  assert.equal(r.matchedRuleId, 'craving');
  assert.deepEqual(ids(r), ['buddha', 'krishna']);
});

test('Rule 10 philosophical → Shankaracharya + Ramana', () => {
  const r = curate(baseCtx({ dominantThemes: ['philosophy'] }), NOW);
  assert.equal(r.matchedRuleId, 'philosophical');
  assert.deepEqual(ids(r), ['adi_shankaracharya', 'ramana_maharshi']);
});

test('Rule 11 interpersonal → Jung + Rumi', () => {
  const r = curate(baseCtx({ dominantThemes: ['relationship'] }), NOW);
  assert.equal(r.matchedRuleId, 'interpersonal');
  assert.deepEqual(ids(r), ['carl_jung', 'rumi']);
});

test('Rule 12 work + anxious → Krishnamurti + Krishna', () => {
  const r = curate(baseCtx({
    dominantThemes: ['work'],
    dominantEmotions: ['anxious'],
  }), NOW);
  assert.equal(r.matchedRuleId, 'work_anxiety');
  assert.deepEqual(ids(r), ['jiddu_krishnamurti', 'krishna']);
});

test('work alone (no anxious emotion) does NOT fire Rule 12', () => {
  const r = curate(baseCtx({ dominantThemes: ['work'] }), NOW);
  assert.notEqual(r.matchedRuleId, 'work_anxiety');
});

// ── Rule 13 — default with rotating slot ─────────────────────────────────────

test('default rule always matches when nothing else does', () => {
  const r = curate(baseCtx(), NOW);
  assert.equal(r.matchedRuleId, 'default');
  assert.equal(r.specialists.length, 2);
  assert.equal(r.specialists[0].id, 'ramana_maharshi');
  assert.ok(['jiddu_krishnamurti', 'carl_jung', 'rumi'].includes(r.specialists[1].id));
});

test('rotating slot is deterministic for the same week, varies by week', () => {
  const weekMs = 7 * 86_400_000;
  const r0 = curate(baseCtx(), 0 * weekMs);
  const r1 = curate(baseCtx(), 1 * weekMs);
  const r2 = curate(baseCtx(), 2 * weekMs);
  const r3 = curate(baseCtx(), 3 * weekMs); // same as week 0 — rotation of 3

  assert.equal(r0.specialists[1].id, r3.specialists[1].id, 'wraps at 3 weeks');
  const picks = new Set([r0.specialists[1].id, r1.specialists[1].id, r2.specialists[1].id]);
  assert.equal(picks.size, 3, 'three distinct rotating picks across three weeks');
});

// ── Rule-ordering invariants ────────────────────────────────────────────────

test('ordering: acute distress > pattern > decision > default', () => {
  // Stack every possible trigger and confirm rule 1 still wins.
  const r = curate(baseCtx({
    wellbeingState: 'hard_stretch',
    sourceContent: { type: 'pattern', data: { type: 'returning_question' } },
    dominantThemes: ['decision', 'recurring'],
    dominantEmotions: ['sad'],
  }), NOW);
  assert.equal(r.matchedRuleId, 'acute_distress');
});

test('showSeeAllMinds is true for every non-acute rule', () => {
  const cases: Array<[string, Partial<CurationContext>]> = [
    ['default', {}],
    ['decision', { dominantThemes: ['decision'] }],
    ['pattern',  { sourceContent: { type: 'pattern', data: { type: 'gone_quiet' } } }],
  ];
  for (const [label, ctx] of cases) {
    const r = curate(baseCtx(ctx), NOW);
    assert.equal(r.showSeeAllMinds, true, `${label} should show See all minds`);
  }
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
