/**
 * Parser tests for the adaptive day-summary Claude output format.
 *
 * Run with: npx tsx src/services/__tests__/summaryParser.test.ts
 *
 * The project has no jest setup; these use node:assert so they stay runnable
 * with just the existing `tsx` dev-dependency. Exits with code 1 on failure.
 */

import assert from 'node:assert/strict';
import { parseSummaryOutput, parseMacrosBody } from '../summaryParser';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

// ── Parser: new-structure output ──────────────────────────────────────────────

test('parses a full new-structure response end-to-end', () => {
  const sample = [
    'Emotional check-in: Steady morning, tense afternoon.',
    'Meals: Skipped lunch.',
    '===MACROS===',
    '{"calories": 1200, "protein": 60, "carbs": 140, "fat": 40}',
    '===REFLECTION===',
    'You started the morning at the desk and stayed there through the sprint review. After the meeting with Priya, the energy dropped. By evening you stepped outside for a short run.',
    '===WHATHELD===',
    'Work: Two back-to-back reviews and a long doc revision.',
    'Movement: A brief evening run around the block.',
    '===MOODARC===',
    'morning: focused',
    'afternoon: drained',
    'evening: calm',
  ].join('\n');

  const out = parseSummaryOutput(sample);

  assert.ok(out.insightText.includes('Emotional check-in'), 'insightText preserved');
  assert.ok(!out.insightText.includes('==='), 'insightText stops before first sentinel');
  assert.ok(out.macrosRaw?.includes('"calories": 1200'), 'macrosRaw captured');
  assert.ok(out.reflection?.startsWith('You started'), 'reflection captured');
  assert.ok(out.reflection?.includes('By evening'), 'reflection keeps time-stamp');

  assert.deepEqual(out.whatTheDayHeld, [
    { label: 'Work', content: 'Two back-to-back reviews and a long doc revision.' },
    { label: 'Movement', content: 'A brief evening run around the block.' },
  ]);

  assert.deepEqual(out.moodArc, {
    morning: 'focused',
    afternoon: 'drained',
    evening: 'calm',
  });
});

test('whatTheDayHeld only contains categories present in output (no empty sections)', () => {
  // Acceptance scenario: 8 work entries + one run → only Work and Movement appear.
  const sample = [
    'Emotional check-in: Focused.',
    '===MACROS===',
    'null',
    '===REFLECTION===',
    'You spent most of the day heads-down on the ingest pipeline. After standup you shipped the retry fix. By evening you got out for a short run.',
    '===WHATHELD===',
    'Work: Most of the day was the ingest pipeline and the retry fix.',
    'Movement: A short evening run.',
    '===MOODARC===',
    'null',
  ].join('\n');

  const out = parseSummaryOutput(sample);
  assert.equal(out.whatTheDayHeld?.length, 2);
  const labels = out.whatTheDayHeld?.map(x => x.label);
  assert.deepEqual(labels, ['Work', 'Movement']);
  assert.equal(out.moodArc, null, 'moodArc is null when output says null');
});

test('moodArc is null when only some slots are populated', () => {
  const sample = [
    'Emotional check-in: Quiet.',
    '===MOODARC===',
    'morning: calm',
    'afternoon: calm',
    // evening missing
  ].join('\n');

  const out = parseSummaryOutput(sample);
  assert.equal(out.moodArc, null);
});

test('missing sentinels are handled gracefully — legacy output still parses', () => {
  const legacy = [
    'Emotional check-in: Fine.',
    'Meals: Balanced.',
    '===MACROS===',
    '{"calories": 1800, "protein": 90, "carbs": 200, "fat": 60}',
  ].join('\n');

  const out = parseSummaryOutput(legacy);
  assert.ok(out.insightText.includes('Emotional check-in'));
  assert.ok(out.macrosRaw?.includes('1800'));
  assert.equal(out.reflection, undefined, 'reflection absent when sentinel missing');
  assert.equal(out.whatTheDayHeld, undefined);
  assert.equal(out.moodArc, undefined);
});

test('handles output with no sentinels at all', () => {
  const out = parseSummaryOutput('Just a paragraph with no sentinels.');
  assert.equal(out.insightText, 'Just a paragraph with no sentinels.');
  assert.equal(out.macrosRaw, undefined);
  assert.equal(out.reflection, undefined);
});

test('sentinels in unexpected order still split correctly', () => {
  // If the model emits MOODARC before WHATHELD, each section still gets the
  // text between its sentinel and the next one in textual order.
  const sample = [
    'insight here',
    '===REFLECTION===',
    'Brief prose.',
    '===MOODARC===',
    'morning: calm',
    'afternoon: busy',
    'evening: tired',
    '===WHATHELD===',
    'Work: Shipped the fix.',
  ].join('\n');

  const out = parseSummaryOutput(sample);
  assert.equal(out.reflection, 'Brief prose.');
  assert.deepEqual(out.moodArc, { morning: 'calm', afternoon: 'busy', evening: 'tired' });
  assert.deepEqual(out.whatTheDayHeld, [{ label: 'Work', content: 'Shipped the fix.' }]);
});

test('whatTheDayHeld skips malformed lines without a colon', () => {
  const sample = [
    '===WHATHELD===',
    'Work: Doc revision.',
    'bare line without a colon',
    'Movement: Evening walk.',
  ].join('\n');

  const out = parseSummaryOutput(sample);
  assert.deepEqual(out.whatTheDayHeld, [
    { label: 'Work', content: 'Doc revision.' },
    { label: 'Movement', content: 'Evening walk.' },
  ]);
});

// ── parseMacrosBody ───────────────────────────────────────────────────────────

test('parseMacrosBody returns null for the literal "null" body', () => {
  assert.equal(parseMacrosBody('null'), null);
  assert.equal(parseMacrosBody('  null  '), null);
});

test('parseMacrosBody extracts numbers and leaves missing keys as null', () => {
  const m = parseMacrosBody('{"calories": 1800, "protein": 90}');
  assert.deepEqual(m, { calories: 1800, protein: 90, carbs: null, fat: null });
});

test('parseMacrosBody returns null for malformed JSON', () => {
  assert.equal(parseMacrosBody('{not json'), null);
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
