/**
 * Tests for the PatternsService parser + threshold helpers.
 *
 * Run with: npx tsx src/services/__tests__/patternsParser.test.ts
 *
 * The parser is the only structural contract we can test without hitting
 * Claude. These tests assert the *structure* of the report — per the task's
 * "assert on structure (not content)" guidance — and the threshold gating.
 */

import assert from 'node:assert/strict';
import {
  parsePatternsOutput,
  allowedAcrossTimeTypes,
  windowLabelFor,
  THRESHOLDS,
} from '../patternsParser';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

const META = { generatedAt: 1_700_000_000_000, archiveDays: 90, entryCount: 200 };

// ── Thresholds ────────────────────────────────────────────────────────────────

test('allowedAcrossTimeTypes returns [] for 0 entries', () => {
  assert.deepEqual(allowedAcrossTimeTypes(0, 0), []);
  assert.deepEqual(allowedAcrossTimeTypes(30, 0), []);
});

test('allowedAcrossTimeTypes returns [] for 1-2 entries (Claude types need 3+)', () => {
  assert.deepEqual(allowedAcrossTimeTypes(0, 1), []);
  assert.deepEqual(allowedAcrossTimeTypes(10, 2), []);
});

test('early_signal + first_impression appear at 3 entries', () => {
  const t = allowedAcrossTimeTypes(0, 3);
  assert.ok(t.includes('early_signal'), 'missing early_signal');
  assert.ok(t.includes('first_impression'), 'missing first_impression');
  assert.ok(!t.includes('whats_loud'), 'whats_loud should not appear at 3 entries');
});

test('first_impression disappears after 8 entries', () => {
  const t = allowedAcrossTimeTypes(0, 9);
  assert.ok(!t.includes('first_impression'), 'first_impression should disappear after 8 entries');
  assert.ok(t.includes('early_signal'));
});

test('whats_loud fades in at 5 entries', () => {
  const t = allowedAcrossTimeTypes(0, 5);
  assert.ok(t.includes('whats_loud'));
  assert.ok(!t.includes('returning_question'));
});

test('returning_question + mind_moving fade in at 8-10 entries', () => {
  const t = allowedAcrossTimeTypes(0, 10);
  assert.ok(t.includes('returning_question'));
  assert.ok(t.includes('mind_moving'));
  assert.ok(!t.includes('wondering_about'));
});

test('wondering_about fades in at 12 entries', () => {
  const t = allowedAcrossTimeTypes(0, 12);
  assert.ok(t.includes('wondering_about'));
});

test('self_language fades in at 8 entries', () => {
  assert.ok(!allowedAcrossTimeTypes(0, 7).includes('self_language'), 'self_language needs 8 entries');
  assert.ok(allowedAcrossTimeTypes(0, 8).includes('self_language'));
});

test('repeating_story fades in at 12 entries', () => {
  assert.ok(!allowedAcrossTimeTypes(0, 11).includes('repeating_story'), 'repeating_story needs 12 entries');
  assert.ok(allowedAcrossTimeTypes(0, 12).includes('repeating_story'));
});

test('gone_quiet requires both 20 entries AND 21 days', () => {
  // Enough entries but not enough days
  assert.ok(!allowedAcrossTimeTypes(10, 20).includes('gone_quiet'), 'gone_quiet needs 21 days');
  // Enough days but not enough entries
  assert.ok(!allowedAcrossTimeTypes(30, 19).includes('gone_quiet'), 'gone_quiet needs 20 entries');
  // Both satisfied
  assert.ok(allowedAcrossTimeTypes(21, 20).includes('gone_quiet'), 'gone_quiet should appear');
});

test('every threshold type has a window label', () => {
  for (const rule of THRESHOLDS) {
    assert.ok(windowLabelFor(rule.type).length > 0, `missing window label for ${rule.type}`);
  }
});

// ── Parser: well-formed output ────────────────────────────────────────────────

test('parses a well-formed report end-to-end', () => {
  const raw = `
===THIS_MONTH===
{
  "reflection": "Over the last three weeks the notes keep circling work and sleep. By late March the evening entries softened.",
  "whatsLoud": ["the sprint review", "sleep drift", "the call with Mom"],
  "intentionsProgress": null
}
===ACROSS_TIME===
[
  {
    "type": "whats_loud",
    "title": "What's been loud lately",
    "body": "Across the last three weeks, work reviews keep surfacing. The phrasing has shifted from dread to grinding acceptance.",
    "evidence": [
      { "excerpt": "another review I have not prepared for", "date": "2026-03-02" },
      { "excerpt": "review went fine but I am exhausted", "date": "2026-03-11" }
    ],
    "window": "last 30 days"
  },
  {
    "type": "wondering_about",
    "title": "Something you might be wondering about",
    "body": "You keep noting that the reviews feel worse than they need to. A quieter question underneath: whether the prep itself is the ritual.",
    "evidence": [
      { "excerpt": "I could have prepped but I did not", "date": "2026-02-18" },
      { "excerpt": "maybe the stress is the prep I keep skipping", "date": "2026-03-06" },
      { "excerpt": "why does every review feel ambushed", "date": "2026-03-15" }
    ],
    "window": "last 60 days"
  }
]
`;

  const out = parsePatternsOutput(raw, META);

  assert.equal(out.generatedAt, META.generatedAt);
  assert.equal(out.archiveDays, META.archiveDays);
  assert.equal(out.entryCount,  META.entryCount);

  assert.ok(out.thisMonth.reflection.startsWith('Over the last'));
  assert.equal(out.thisMonth.whatsLoud.length, 3);
  assert.equal(out.thisMonth.intentionsProgress, null);

  assert.equal(out.acrossTime.length, 2);
  const [loud, wondering] = out.acrossTime;
  assert.equal(loud.type, 'whats_loud');
  assert.equal(loud.dismissible, false);
  assert.equal(loud.evidence.length, 2);
  assert.equal(wondering.type, 'wondering_about');
  assert.equal(wondering.dismissible, true, 'wondering_about must be dismissible');
  assert.equal(wondering.evidence.length, 3);
});

test('drops observations with fewer than 2 evidence items', () => {
  const raw = `
===ACROSS_TIME===
[
  {
    "type": "whats_loud",
    "title": "Only one quote",
    "body": "Not enough evidence.",
    "evidence": [{ "excerpt": "solo", "date": "2026-03-01" }],
    "window": "last 30 days"
  },
  {
    "type": "whats_loud",
    "title": "Two quotes",
    "body": "Enough.",
    "evidence": [
      { "excerpt": "one", "date": "2026-03-01" },
      { "excerpt": "two", "date": "2026-03-05" }
    ],
    "window": "last 30 days"
  }
]
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.acrossTime.length, 1);
  assert.equal(out.acrossTime[0].title, 'Two quotes');
});

test('trims evidence arrays longer than 3 items to 3', () => {
  const raw = `
===ACROSS_TIME===
[
  {
    "type": "returning_question",
    "title": "Too many",
    "body": "Four evidence items.",
    "evidence": [
      { "excerpt": "a", "date": "2026-01-01" },
      { "excerpt": "b", "date": "2026-01-02" },
      { "excerpt": "c", "date": "2026-01-03" },
      { "excerpt": "d", "date": "2026-01-04" }
    ],
    "window": "last 45 days"
  }
]
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.acrossTime[0].evidence.length, 3);
});

test('drops observations with unknown types', () => {
  const raw = `
===ACROSS_TIME===
[
  {
    "type": "personality_trait",
    "title": "Forbidden classification",
    "body": "Should be dropped.",
    "evidence": [
      { "excerpt": "x", "date": "2026-01-01" },
      { "excerpt": "y", "date": "2026-01-02" }
    ],
    "window": "last 30 days"
  }
]
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.acrossTime.length, 0);
});

// ── Parser: robustness ────────────────────────────────────────────────────────

test('missing ACROSS_TIME sentinel yields empty acrossTime, not an error', () => {
  const raw = `
===THIS_MONTH===
{ "reflection": "Short month.", "whatsLoud": ["work"], "intentionsProgress": null }
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.thisMonth.whatsLoud[0], 'work');
  assert.deepEqual(out.acrossTime, []);
});

test('missing THIS_MONTH sentinel yields empty thisMonth fields', () => {
  const raw = `
===ACROSS_TIME===
[]
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.thisMonth.reflection, '');
  assert.deepEqual(out.thisMonth.whatsLoud, []);
  assert.equal(out.thisMonth.intentionsProgress, null);
});

test('tolerates code fences around JSON bodies', () => {
  const raw = `
===THIS_MONTH===
\`\`\`json
{ "reflection": "ok", "whatsLoud": ["a"], "intentionsProgress": null }
\`\`\`
===ACROSS_TIME===
\`\`\`
[]
\`\`\`
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.thisMonth.reflection, 'ok');
  assert.deepEqual(out.acrossTime, []);
});

test('drops malformed JSON under a sentinel without throwing', () => {
  const raw = `
===THIS_MONTH===
{ this is not valid json
===ACROSS_TIME===
[not valid either
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.thisMonth.reflection, '');
  assert.deepEqual(out.acrossTime, []);
});

test('clamps whatsLoud to at most 3 entries', () => {
  const raw = `
===THIS_MONTH===
{ "reflection": "r", "whatsLoud": ["a", "b", "c", "d", "e"], "intentionsProgress": null }
`;
  const out = parsePatternsOutput(raw, META);
  assert.equal(out.thisMonth.whatsLoud.length, 3);
});

test('populates thisMonth even when archive is very young', () => {
  // Simulating the "day 3" case: thisMonth must still parse cleanly.
  const raw = `
===THIS_MONTH===
{ "reflection": "Just three days in. The entries are short.", "whatsLoud": ["the move"], "intentionsProgress": null }
===ACROSS_TIME===
[]
`;
  const out = parsePatternsOutput(raw, { ...META, archiveDays: 3, entryCount: 6 });
  assert.ok(out.thisMonth.reflection.length > 0);
  assert.equal(out.thisMonth.whatsLoud[0], 'the move');
  assert.deepEqual(out.acrossTime, []);
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
