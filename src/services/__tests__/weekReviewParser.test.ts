/**
 * Tests for the week-review parser.
 *
 * Run with: npx tsx src/services/__tests__/weekReviewParser.test.ts
 */

import assert from 'node:assert/strict';
import { parseWeekReviewOutput } from '../weekReviewParser';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

const WEEK = [
  '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16',
  '2026-04-17', '2026-04-18', '2026-04-19',
];

test('parses a well-formed week-review response', () => {
  const raw = `
===WEEK_REFLECTION===
Early in the week you kept returning to the sprint review. By Thursday the mood softened — the call with Priya landed. The weekend stretched into quiet without any real plan.
===WEEK_DAYS===
[
  { "date": "2026-04-13", "oneLiner": "Monday opened with review prep and a tight afternoon." },
  { "date": "2026-04-16", "oneLiner": "A longer call with Priya shifted the week's tone." },
  { "date": "2026-04-18", "oneLiner": "Saturday was low-stakes — walked, cooked, read." }
]
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.ok(out.reflection.startsWith('Early in the week'));
  assert.equal(out.days.length, 3);
  assert.equal(out.days[0].date, '2026-04-13');
  assert.ok(out.days[1].oneLiner.includes('Priya'));
});

test('drops days outside the provided week', () => {
  const raw = `
===WEEK_DAYS===
[
  { "date": "2026-04-13", "oneLiner": "in-week" },
  { "date": "2026-04-01", "oneLiner": "out-of-week, should drop" }
]
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].date, '2026-04-13');
});

test('de-duplicates days with the same date', () => {
  const raw = `
===WEEK_DAYS===
[
  { "date": "2026-04-13", "oneLiner": "first" },
  { "date": "2026-04-13", "oneLiner": "duplicate" }
]
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].oneLiner, 'first');
});

test('missing WEEK_DAYS → empty days array, reflection still parsed', () => {
  const raw = `
===WEEK_REFLECTION===
Short week. Just the reflection.
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.ok(out.reflection.startsWith('Short week'));
  assert.deepEqual(out.days, []);
});

test('missing WEEK_REFLECTION → empty reflection, days still parsed', () => {
  const raw = `
===WEEK_DAYS===
[{ "date": "2026-04-15", "oneLiner": "only days" }]
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.reflection, '');
  assert.equal(out.days[0].date, '2026-04-15');
});

test('tolerates code fences around the JSON array', () => {
  const raw = `
===WEEK_DAYS===
\`\`\`json
[{ "date": "2026-04-13", "oneLiner": "fenced" }]
\`\`\`
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.days[0].oneLiner, 'fenced');
});

test('malformed JSON under WEEK_DAYS is dropped silently', () => {
  const raw = `
===WEEK_REFLECTION===
ok
===WEEK_DAYS===
[not json
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.reflection, 'ok');
  assert.deepEqual(out.days, []);
});

test('rejects entries missing date or oneLiner', () => {
  const raw = `
===WEEK_DAYS===
[
  { "date": "2026-04-13" },
  { "oneLiner": "no date" },
  { "date": "2026-04-14", "oneLiner": "" },
  { "date": "2026-04-15", "oneLiner": "valid" }
]
`;
  const out = parseWeekReviewOutput(raw, WEEK);
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].date, '2026-04-15');
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
