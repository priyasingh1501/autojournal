/**
 * Tests for the warm-line priority picker.
 *
 * Run with: npx tsx src/services/__tests__/warmLinePicker.test.ts
 *
 * Only the pure picker is tested — the async getWarmLine() wraps it with
 * AsyncStorage + service lookups which would need mocks to exercise.
 */

import assert from 'node:assert/strict';
import { pickWarmLine } from '../warmLinePicker';
import { DailySummary, PatternsReport } from '../../types';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

function makeSummary(fields: Partial<DailySummary>): DailySummary {
  return {
    date: '2026-04-16',
    summary: '',
    transcriptCount: 0,
    createdAt: 0,
    ...fields,
  };
}

function makeReport(acrossTime: PatternsReport['acrossTime']): PatternsReport {
  return {
    generatedAt: 0,
    archiveDays: 90,
    entryCount: 50,
    thisMonth: { reflection: '', whatsLoud: [], intentionsProgress: null, emotionalArc: null },
    acrossTime,
  };
}

// ── Priority 1: reentry ───────────────────────────────────────────────────────

test('reentry wins over everything else', () => {
  const out = pickWarmLine({
    hasReentry: true,
    yesterdaySummary: makeSummary({ reflection: 'You had a long, grounded morning.' }),
    patternsReport: makeReport([{
      type: 'wondering_about',
      title: 'A quieter question',
      body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
      window: 'last 60 days', dismissible: true,
    }]),
  });
  assert.equal(out.tapTarget, 'reentry');
  assert.ok(/heavy/i.test(out.text), 'reentry line mentions heaviness');
});

// ── Priority 1.5: pending intention ──────────────────────────────────────────

test('pending intention wins over summary and patterns but not reentry', () => {
  const out = pickWarmLine({
    hasReentry: false,
    pendingIntention: {
      id: 'sug_1',
      text: 'stop doom-scrolling before bed',
      detectedAt: 0,
      sourceEntryId: 'e_1',
    },
    yesterdaySummary: makeSummary({ reflection: 'You had a quiet day.' }),
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'intention_suggest');
  assert.ok(out.text.includes('stop doom-scrolling'), 'warm line quotes the suggestion text');
});

test('reentry still beats a pending intention', () => {
  const out = pickWarmLine({
    hasReentry: true,
    pendingIntention: {
      id: 'sug_1',
      text: 'stop doom-scrolling before bed',
      detectedAt: 0,
      sourceEntryId: 'e_1',
    },
    yesterdaySummary: null,
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'reentry');
});

// ── Priority 2: yesterday's summary ──────────────────────────────────────────

test('yesterday reflection first sentence wins when no reentry', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: makeSummary({
      reflection: 'You started slow and softened by evening. The call with Priya landed well.',
    }),
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'summary');
  assert.equal(out.text, 'You started slow and softened by evening');
});

test('falls back to insightText when reflection absent', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: makeSummary({
      insightText:
        'Emotional check-in: You were measured through most of the day. Meals: Looks balanced.',
    }),
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'summary');
  assert.ok(out.text.startsWith('You were measured'), 'strips section header from insightText');
});

test('very short reflection fragments fall through to next priority', () => {
  // "Ok." is too short to be warm; picker should continue to patterns.
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: makeSummary({ reflection: 'Ok.' }),
    patternsReport: makeReport([{
      type: 'returning_question',
      title: 'A question you keep returning to',
      body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
      window: 'last 45 days', dismissible: false,
    }]),
  });
  assert.equal(out.tapTarget, 'patterns');
});

test('long reflections are truncated with an ellipsis', () => {
  const long = 'You had a day that kept unfolding in directions you did not expect and by the evening nothing had finished, every thread still pulling, no resolution, only more to sit with and carry forward';
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: makeSummary({ reflection: long }),
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'summary');
  assert.ok(out.text.endsWith('…'));
  assert.ok(out.text.length <= 140);
});

// ── Priority 3: patterns observation ─────────────────────────────────────────

test('wondering_about is chosen before returning_question', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: null,
    patternsReport: makeReport([
      {
        type: 'returning_question',
        title: 'Question title',
        body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
        window: 'last 45 days', dismissible: false,
      },
      {
        type: 'wondering_about',
        title: 'Wondering title',
        body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
        window: 'last 60 days', dismissible: true,
      },
    ]),
  });
  assert.equal(out.tapTarget, 'patterns');
  assert.equal(out.text, 'Wondering title');
});

test('returning_question is used when wondering_about is absent', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: null,
    patternsReport: makeReport([{
      type: 'returning_question',
      title: 'A question you keep returning to',
      body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
      window: 'last 45 days', dismissible: false,
    }]),
  });
  assert.equal(out.tapTarget, 'patterns');
  assert.equal(out.text, 'A question you keep returning to');
});

test('other pattern types (whats_loud etc.) are NOT used for the warm line', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: null,
    patternsReport: makeReport([{
      type: 'whats_loud',
      title: "What's been loud lately",
      body: 'x', evidence: [{ excerpt: 'a', date: '2026-01-01' }, { excerpt: 'b', date: '2026-01-02' }],
      window: 'last 30 days', dismissible: false,
    }]),
  });
  assert.equal(out.tapTarget, 'none', 'whats_loud should not be used as a warm line source');
});

// ── Priority 4: fallback ─────────────────────────────────────────────────────

test('generic fallback when everything is empty', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: null,
    patternsReport: null,
  });
  assert.equal(out.tapTarget, 'none');
  assert.ok(out.text.toLowerCase().includes('welcome'), 'fallback is a warm welcome');
});

test('fallback when patterns report exists but has no usable observations', () => {
  const out = pickWarmLine({
    hasReentry: false,
    yesterdaySummary: null,
    patternsReport: makeReport([]),
  });
  assert.equal(out.tapTarget, 'none');
});

// ── Runner ────────────────────────────────────────────────────────────────────

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
