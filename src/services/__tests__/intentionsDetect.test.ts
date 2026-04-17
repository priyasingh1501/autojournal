/**
 * Tests for intention detection parsing + dedupe helpers.
 *
 * Run with: npx tsx src/services/__tests__/intentionsDetect.test.ts
 *
 * The pure helpers (no AsyncStorage, no Claude) are the only thing we can
 * cover deterministically; the service-level throttle and flag-gate are
 * behavioural and belong in integration/manual testing.
 */

import assert from 'node:assert/strict';
import {
  parseDetectionResponse,
  normalizeIntentionText,
  isDuplicateIntention,
} from '../intentionsDetect';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

// ── Detection response parsing ───────────────────────────────────────────────

test('parses a valid detected intention', () => {
  const out = parseDetectionResponse('{"intention": "stop doom-scrolling before bed"}');
  assert.equal(out, 'stop doom-scrolling before bed');
});

test('returns null for explicit null intention', () => {
  const out = parseDetectionResponse('{"intention": null}');
  assert.equal(out, null);
});

test('returns null for empty string', () => {
  assert.equal(parseDetectionResponse('{"intention": ""}'), null);
});

test('rejects "none"-ish strings even though they are technically non-null', () => {
  assert.equal(parseDetectionResponse('{"intention": "none"}'), null);
  assert.equal(parseDetectionResponse('{"intention": "N/A"}'), null);
  assert.equal(parseDetectionResponse('{"intention": "nothing"}'), null);
});

test('rejects over-long paraphrases (model ignored "3-8 word" instruction)', () => {
  const longSentence = 'The user seems to want to stop scrolling and read a book instead which is something they have been thinking about for a while and now want to act on';
  const out = parseDetectionResponse(`{"intention": "${longSentence}"}`);
  assert.equal(out, null, 'should reject paraphrased-sentence responses over 120 chars');
});

test('tolerates surrounding code fences', () => {
  const out = parseDetectionResponse('```json\n{"intention": "call mom weekly"}\n```');
  assert.equal(out, 'call mom weekly');
});

test('returns null for malformed JSON', () => {
  assert.equal(parseDetectionResponse('{not: json}'), null);
  assert.equal(parseDetectionResponse(''), null);
  assert.equal(parseDetectionResponse('no braces here'), null);
});

test('returns null when the intention field is missing', () => {
  assert.equal(parseDetectionResponse('{"other": "call mom"}'), null);
});

test('returns null when the intention field is a non-string', () => {
  assert.equal(parseDetectionResponse('{"intention": 42}'), null);
  assert.equal(parseDetectionResponse('{"intention": ["call mom"]}'), null);
});

// ── Normalization ─────────────────────────────────────────────────────────────

test('normalization is punctuation- and case-insensitive', () => {
  assert.equal(
    normalizeIntentionText('  Stop Doom-Scrolling, before bed!  '),
    normalizeIntentionText('stop doom scrolling before bed'),
  );
});

test('normalization collapses whitespace', () => {
  assert.equal(normalizeIntentionText('call   mom    weekly'), 'call mom weekly');
});

// ── Dedupe ────────────────────────────────────────────────────────────────────

test('isDuplicateIntention catches case/punctuation variants', () => {
  const existing = ['Call mom weekly'];
  assert.equal(isDuplicateIntention('call Mom weekly!', existing), true);
  assert.equal(isDuplicateIntention('Call  mom   weekly', existing), true);
});

test('isDuplicateIntention returns false for genuinely new text', () => {
  const existing = ['Call mom weekly', 'Meditate in the mornings'];
  assert.equal(isDuplicateIntention('Stop doom-scrolling before bed', existing), false);
});

test('isDuplicateIntention treats empty/whitespace as duplicate (blocks empty save)', () => {
  assert.equal(isDuplicateIntention('   ', ['anything']), true);
  assert.equal(isDuplicateIntention('', []), true);
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
