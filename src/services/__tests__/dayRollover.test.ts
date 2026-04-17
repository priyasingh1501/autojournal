/**
 * Tests for the 3am day-rollover helper.
 * Run with: npx tsx src/services/__tests__/dayRollover.test.ts
 */

import assert from 'node:assert/strict';
import { effectiveDateStr } from '../dayRollover';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

function tsOn(year: number, month1: number, day: number, hour: number, min = 0): number {
  return new Date(year, month1 - 1, day, hour, min, 0, 0).getTime();
}

test('01:30 rolls back to the previous calendar day', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 1, 30)), '2026-04-17');
});

test('00:00 exactly rolls back to the previous day', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 0, 0)), '2026-04-17');
});

test('02:59 still rolls back', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 2, 59)), '2026-04-17');
});

test('03:00 exactly stays on the same calendar day (rollover is exclusive)', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 3, 0)), '2026-04-18');
});

test('noon / evening stay on the same day', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 12, 0)), '2026-04-18');
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 22, 30)), '2026-04-18');
});

test('late night before midnight stays on the same day', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 23, 59)), '2026-04-18');
});

test('month boundary rolls correctly (May 1 01:30 → April 30)', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 5, 1, 1, 30)), '2026-04-30');
});

test('year boundary rolls correctly (Jan 1 02:00 → Dec 31)', () => {
  assert.equal(effectiveDateStr(tsOn(2027, 1, 1, 2, 0)), '2026-12-31');
});

test('custom rolloverHour=4 still works as a pure function', () => {
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 3, 30), 4), '2026-04-17');
  assert.equal(effectiveDateStr(tsOn(2026, 4, 18, 4, 0),  4), '2026-04-18');
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
