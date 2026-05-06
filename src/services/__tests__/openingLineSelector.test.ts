/**
 * Tests for the pure opening-line selector.
 * Run with: npx tsx src/services/__tests__/openingLineSelector.test.ts
 */

import assert from 'node:assert/strict';
import {
  selectOpening,
  tenureMode,
  companionModeDirective,
  patternSourceContext,
  daySourceContext,
  shortSourceContext,
} from '../openingLineSelector';
import type { MindV2 } from '../../types';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

// ── Fixtures — minimal mind configs, no native assets needed ────────────────

function mind(partial: Partial<MindV2> & Pick<MindV2, 'id'>): MindV2 {
  return {
    name: partial.name ?? partial.id,
    era: '',
    tradition: '',
    philosophy: '',
    accent: 'rgba(0,0,0,1)',
    symbol: '✦',
    teaser: '',
    openingLines: partial.openingLines ?? ['generic opener'],
    openingLinesWithContext: partial.openingLinesWithContext ?? ['contextual opener'],
    openingLinesDistress: partial.openingLinesDistress,
    systemPrompt: '',
    ...partial,
  } as MindV2;
}

const ALWAYS_FIRST = (_n: number) => 0;

// ── tenureMode ──────────────────────────────────────────────────────────────

test('tenureMode: <30 days → gentle', () => {
  assert.equal(tenureMode(0), 'gentle');
  assert.equal(tenureMode(29), 'gentle');
});
test('tenureMode: 30–89 days → standard', () => {
  assert.equal(tenureMode(30), 'standard');
  assert.equal(tenureMode(89), 'standard');
});
test('tenureMode: >=90 days → familiar', () => {
  assert.equal(tenureMode(90), 'familiar');
  assert.equal(tenureMode(365), 'familiar');
});

test('companionModeDirective mentions its mode', () => {
  assert.ok(companionModeDirective('gentle').toLowerCase().includes('gentle'));
  assert.ok(companionModeDirective('familiar').toLowerCase().includes('familiar'));
  assert.ok(companionModeDirective('standard').toLowerCase().includes('standard'));
});

// ── Source-context builders ─────────────────────────────────────────────────

test('patternSourceContext wraps the pattern body', () => {
  const ctx = patternSourceContext({ body: '  You keep circling the sprint review.  ' });
  assert.equal(ctx.kind, 'pattern');
  assert.ok(ctx.description.includes('You keep circling'));
  assert.ok(!ctx.description.includes('  '), 'trims the body');
});

test('daySourceContext includes date and reflection when present', () => {
  const ctx = daySourceContext({ date: '2026-04-18', reflection: 'A quiet Friday.' });
  assert.equal(ctx.kind, 'day');
  assert.ok(ctx.description.includes('2026-04-18'));
  assert.ok(ctx.description.includes('A quiet Friday.'));
});

test('daySourceContext works without reflection', () => {
  const ctx = daySourceContext({ date: '2026-04-18' });
  assert.ok(ctx.description.includes('2026-04-18'));
  assert.ok(!ctx.description.includes('reflected on'));
});

test('shortSourceContext includes title and author', () => {
  const ctx = shortSourceContext({ title: 'On Letting Go', author: 'Rumi' });
  assert.ok(ctx.description.includes('On Letting Go'));
  assert.ok(ctx.description.includes('Rumi'));
});

// ── selectOpening — rule ordering ───────────────────────────────────────────

test('distress rule fires for Companion in hard_stretch', () => {
  const companion = mind({
    id: 'companion',
    openingLinesDistress: ['take a breath with me'],
  });
  const s = selectOpening({
    mind: companion,
    sourceContext: null,
    wellbeingState: 'hard_stretch',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'distress');
  assert.equal(s.line, 'take a breath with me');
  assert.equal(s.needsAdaptation, false, 'distress openers MUST NOT be adapted');
  assert.equal(s.companionMode, 'gentle');
});

test('distress rule does NOT fire for specialists', () => {
  const specialist = mind({ id: 'buddha' });
  const s = selectOpening({
    mind: specialist,
    sourceContext: null,
    wellbeingState: 'hard_stretch',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'generic');
  assert.equal(s.companionMode, undefined, 'companionMode is Companion-only');
});

test('distress rule falls through when Companion has no distress openers', () => {
  const companion = mind({ id: 'companion' /* no openingLinesDistress */ });
  const s = selectOpening({
    mind: companion,
    sourceContext: null,
    wellbeingState: 'hard_stretch',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'generic', 'falls through to generic pool');
});

test('sourceContext present → openingLinesWithContext + needsAdaptation=true', () => {
  const buddha = mind({
    id: 'buddha',
    openingLinesWithContext: ['context-aware opener'],
  });
  const s = selectOpening({
    mind: buddha,
    sourceContext: { kind: 'pattern', description: '...' },
    wellbeingState: 'regulated',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'with_context');
  assert.equal(s.line, 'context-aware opener');
  assert.equal(s.needsAdaptation, true);
});

test('no sourceContext → generic pool + needsAdaptation=false', () => {
  const krishna = mind({
    id: 'krishna',
    openingLines: ['Arjuna, speak.'],
  });
  const s = selectOpening({
    mind: krishna,
    sourceContext: null,
    wellbeingState: 'regulated',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'generic');
  assert.equal(s.line, 'Arjuna, speak.');
  assert.equal(s.needsAdaptation, false);
});

test('Companion gets companionMode even on generic openers', () => {
  const companion = mind({ id: 'companion' });
  const gentle = selectOpening({
    mind: companion, sourceContext: null, wellbeingState: 'regulated',
    tenureDays: 5, pickIndex: ALWAYS_FIRST,
  });
  const standard = selectOpening({
    mind: companion, sourceContext: null, wellbeingState: 'regulated',
    tenureDays: 50, pickIndex: ALWAYS_FIRST,
  });
  const familiar = selectOpening({
    mind: companion, sourceContext: null, wellbeingState: 'regulated',
    tenureDays: 200, pickIndex: ALWAYS_FIRST,
  });
  assert.equal(gentle.companionMode,   'gentle');
  assert.equal(standard.companionMode, 'standard');
  assert.equal(familiar.companionMode, 'familiar');
});

test('distress beats sourceContext for Companion (grounding comes first)', () => {
  const companion = mind({
    id: 'companion',
    openingLinesDistress: ['ground yourself first'],
  });
  const s = selectOpening({
    mind: companion,
    sourceContext: { kind: 'pattern', description: '...' }, // ignored
    wellbeingState: 'hard_stretch',
    tenureDays: 10,
    pickIndex: ALWAYS_FIRST,
  });
  assert.equal(s.source, 'distress');
  assert.equal(s.needsAdaptation, false);
});

test('deterministic pickIndex selects the matching item', () => {
  const buddha = mind({
    id: 'buddha',
    openingLines: ['first', 'second', 'third'],
  });
  const pickSecond = selectOpening({
    mind: buddha, sourceContext: null, wellbeingState: 'regulated',
    tenureDays: 10, pickIndex: () => 1,
  });
  assert.equal(pickSecond.line, 'second');
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
