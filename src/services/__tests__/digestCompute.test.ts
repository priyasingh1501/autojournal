/**
 * Tests for the pure digest computation.
 * Run with: npx tsx src/services/__tests__/digestCompute.test.ts
 */

import assert from 'node:assert/strict';
import { computeDigest, intentionKeywords, intentionTouchesEntry } from '../digestCompute';
import { Intention, TranscriptEntry } from '../../types';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

function makeEntry(partial: Partial<TranscriptEntry>): TranscriptEntry {
  return {
    id: partial.id ?? `e_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: partial.timestamp ?? new Date(2026, 3, 18, 12, 0).getTime(),
    text: partial.text ?? '',
    duration: partial.duration ?? 0,
    kind: partial.kind ?? 'voice',
    emotionTags: partial.emotionTags,
  };
}

function makeIntention(partial: Partial<Intention>): Intention {
  const status = partial.status ?? (partial.active === false ? 'paused' : 'active');
  return {
    id:                  partial.id ?? `int_${Math.random().toString(36).slice(2, 6)}`,
    text:                partial.text ?? 'call mom weekly',
    shortLabel:          partial.shortLabel ?? 'call mom',
    source:              partial.source ?? 'manual',
    createdAt:           partial.createdAt ?? 0,
    cadence:             partial.cadence ?? null,
    status,
    statusChangedAt:     partial.statusChangedAt ?? 0,
    lastMentionedAt:     partial.lastMentionedAt ?? null,
    mentionCount:        partial.mentionCount ?? 0,
    weeklyMentionCounts: partial.weeklyMentionCounts ?? [],
    nudgeEnabled:        partial.nudgeEnabled ?? true,
    active:              status === 'active',
  };
}

const TS = (h: number, m = 0) => new Date(2026, 3, 18, h, m, 0).getTime();

// ── entryCount + hour buckets ────────────────────────────────────────────────

test('entryCount matches the number of entries', () => {
  const entries = [
    makeEntry({ timestamp: TS(9) }),
    makeEntry({ timestamp: TS(10) }),
    makeEntry({ timestamp: TS(14) }),
  ];
  const d = computeDigest('2026-04-18', entries, [], 1_700_000_000_000);
  assert.equal(d.entryCount, 3);
});

test('hour buckets are always 24 and count per hour correctly', () => {
  const entries = [
    makeEntry({ timestamp: TS(9) }),
    makeEntry({ timestamp: TS(9, 30) }),
    makeEntry({ timestamp: TS(14) }),
  ];
  const d = computeDigest('2026-04-18', entries, []);
  assert.equal(d.entriesByHour.length, 24);
  assert.equal(d.entriesByHour[9].count, 2);
  assert.equal(d.entriesByHour[14].count, 1);
  assert.equal(d.entriesByHour[0].count, 0);
  assert.equal(d.entriesByHour[23].count, 0);
});

// ── dominantEmotions ─────────────────────────────────────────────────────────

test('dominantEmotions returns top 3 by frequency', () => {
  const entries = [
    makeEntry({ emotionTags: ['anxious', 'hopeful'] }),
    makeEntry({ emotionTags: ['anxious', 'calm'] }),
    makeEntry({ emotionTags: ['anxious'] }),
    makeEntry({ emotionTags: ['hopeful'] }),
    makeEntry({ emotionTags: ['calm'] }),
    makeEntry({ emotionTags: ['tired'] }),
  ];
  const d = computeDigest('2026-04-18', entries, []);
  assert.equal(d.dominantEmotions.length, 3);
  assert.equal(d.dominantEmotions[0], 'anxious');
  // "hopeful" and "calm" tie at 2 — both allowed; "tired" (count 1) excluded
  assert.ok(d.dominantEmotions.includes('hopeful') || d.dominantEmotions.includes('calm'));
  assert.ok(!d.dominantEmotions.includes('tired'));
});

test('no emotion tags → empty dominantEmotions', () => {
  const entries = [makeEntry({ text: 'plain entry' })];
  const d = computeDigest('2026-04-18', entries, []);
  assert.deepEqual(d.dominantEmotions, []);
});

// ── intention keyword matching ───────────────────────────────────────────────

test('intentionKeywords strips stopwords and short tokens', () => {
  // Stopwords ("the", "before", "with"...) and tokens under 4 chars ("mom",
  // "bed") are excluded by design — so only the content-bearing tokens
  // survive.
  const kws = intentionKeywords('Call mom weekly before bed');
  assert.ok(kws.includes('call'),   'call is a keyword');
  assert.ok(kws.includes('weekly'), 'weekly is a keyword');
  assert.ok(!kws.includes('the'),   'the is a stopword');
  assert.ok(!kws.includes('before'),'before is a stopword in our list');
  assert.ok(!kws.includes('mom'),   '3-char tokens excluded');
  assert.ok(!kws.includes('bed'),   '3-char tokens excluded');
});

test('intentionTouchesEntry matches when a keyword appears in entry text', () => {
  const intent = makeIntention({ text: 'stop doom-scrolling before bed' });
  assert.equal(
    intentionTouchesEntry(intent, 'I caught myself scrolling again tonight'),
    true,
    'scrolling matches keyword',
  );
  assert.equal(
    intentionTouchesEntry(intent, 'had a good dinner with Priya'),
    false,
    'no keyword overlap',
  );
});

test('intentionsMentioned collects IDs for touched intentions', () => {
  const ints = [
    makeIntention({ id: 'i1', text: 'stop doom-scrolling before bed' }),
    makeIntention({ id: 'i2', text: 'call mom weekly' }),
    makeIntention({ id: 'i3', text: 'meditate in the mornings' }),
  ];
  const entries = [
    makeEntry({ text: 'called mom, it was a good chat' }),       // i2 touched via "call"... wait "called"
    makeEntry({ text: 'I kept scrolling late into the night' }),  // i1 touched via "scrolling"
    // "meditate" intention never referenced
  ];
  const d = computeDigest('2026-04-18', entries, ints);
  // Note: 'called' contains 'call' substring so matches i2; 'scrolling' matches i1.
  assert.ok(d.intentionsMentioned.includes('i1'), 'i1 (scrolling) should be touched');
  assert.ok(d.intentionsMentioned.includes('i2'), 'i2 (call) should be touched via "called"');
  assert.ok(!d.intentionsMentioned.includes('i3'), 'i3 (meditate) not touched');
});

test('empty entries → empty digest with still-valid 24 buckets', () => {
  const d = computeDigest('2026-04-18', [], []);
  assert.equal(d.entryCount, 0);
  assert.equal(d.entriesByHour.length, 24);
  assert.deepEqual(d.dominantEmotions, []);
  assert.deepEqual(d.intentionsMentioned, []);
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
