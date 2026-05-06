/**
 * Tests for the handoff state machine + detector parser.
 * Run with: npx tsx src/services/__tests__/handoff.test.ts
 */

import assert from 'node:assert/strict';
import {
  INITIAL_HANDOFF_STATE,
  canOfferHandoff,
  advanceTurn,
  applyDetectedOffer,
  recordStay,
  recordNotYet,
  recordAccept,
  HandoffState,
} from '../handoffState';
import { parseHandoffDecision, parseTransferSummary } from '../handoffParsers';

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });

function atTurn(n: number, patch: Partial<HandoffState> = {}): HandoffState {
  return { ...INITIAL_HANDOFF_STATE, turnCount: n, ...patch };
}

// ── canOfferHandoff ────────────────────────────────────────────────────────

test('not eligible before turn 3', () => {
  for (const t of [0, 1, 2]) {
    assert.equal(
      canOfferHandoff({ state: atTurn(t), isCompanion: true, wellbeingState: 'regulated' }),
      false,
    );
  }
});

test('eligible at turn 3 for Companion in regulated state', () => {
  assert.equal(
    canOfferHandoff({ state: atTurn(3), isCompanion: true, wellbeingState: 'regulated' }),
    true,
  );
});

test('specialists are never eligible', () => {
  assert.equal(
    canOfferHandoff({ state: atTurn(10), isCompanion: false, wellbeingState: 'regulated' }),
    false,
  );
});

test('hard_stretch suppresses all offers', () => {
  assert.equal(
    canOfferHandoff({ state: atTurn(10), isCompanion: true, wellbeingState: 'hard_stretch' }),
    false,
  );
});

test('tender state is still eligible', () => {
  assert.equal(
    canOfferHandoff({ state: atTurn(5), isCompanion: true, wellbeingState: 'tender' }),
    true,
  );
});

test('cooldown: not eligible within 4 turns of last offer', () => {
  const s = atTurn(5, { lastOfferTurn: 3 });  // only 2 turns since last offer
  assert.equal(canOfferHandoff({ state: s, isCompanion: true, wellbeingState: 'regulated' }), false);
});

test('cooldown: eligible exactly 4 turns after last offer', () => {
  const s = atTurn(7, { lastOfferTurn: 3 });  // 4 turns since last offer
  assert.equal(canOfferHandoff({ state: s, isCompanion: true, wellbeingState: 'regulated' }), true);
});

test('active offer blocks further eligibility', () => {
  const s = atTurn(10, { activeOffer: { mindId: 'buddha', reason: '...' } });
  assert.equal(canOfferHandoff({ state: s, isCompanion: true, wellbeingState: 'regulated' }), false);
});

// ── State transitions ──────────────────────────────────────────────────────

test('advanceTurn increments turnCount immutably', () => {
  const a = INITIAL_HANDOFF_STATE;
  const b = advanceTurn(a);
  assert.equal(a.turnCount, 0);
  assert.equal(b.turnCount, 1);
  assert.notEqual(a, b);
});

test('applyDetectedOffer sets activeOffer and lastOfferTurn', () => {
  const next = applyDetectedOffer(atTurn(5), { mindId: 'ramana_maharshi', reason: 'r' });
  assert.equal(next.activeOffer?.mindId, 'ramana_maharshi');
  assert.equal(next.lastOfferTurn, 5);
});

test('applyDetectedOffer is a no-op when the mind was already declined', () => {
  const s = atTurn(5, { declinedMindIds: new Set(['rumi']) });
  const next = applyDetectedOffer(s, { mindId: 'rumi', reason: 'r' });
  assert.equal(next, s, 'same reference → silent drop');
});

test('recordStay clears the offer without adding to declined', () => {
  const s = atTurn(5, { activeOffer: { mindId: 'buddha', reason: 'r' } });
  const next = recordStay(s);
  assert.equal(next.activeOffer, null);
  assert.equal(next.declinedMindIds.has('buddha'), false);
});

test('recordNotYet clears offer AND adds to declined set', () => {
  const s = atTurn(5, { activeOffer: { mindId: 'buddha', reason: 'r' } });
  const next = recordNotYet(s);
  assert.equal(next.activeOffer, null);
  assert.equal(next.declinedMindIds.has('buddha'), true);
});

test('recordAccept clears the offer', () => {
  const s = atTurn(5, { activeOffer: { mindId: 'rumi', reason: 'r' } });
  const next = recordAccept(s);
  assert.equal(next.activeOffer, null);
});

test('full arc: offer at turn 3, decline with "not_yet", no re-offer at turn 7+', () => {
  let s: HandoffState = INITIAL_HANDOFF_STATE;
  // advance through 3 turns
  s = advanceTurn(s); s = advanceTurn(s); s = advanceTurn(s);
  assert.equal(s.turnCount, 3);
  s = applyDetectedOffer(s, { mindId: 'ramana_maharshi', reason: 'r' });
  assert.equal(s.activeOffer?.mindId, 'ramana_maharshi');
  s = recordNotYet(s);
  // Try re-offering the same mind 10 turns later
  s = advanceTurn(s); s = advanceTurn(s); s = advanceTurn(s); s = advanceTurn(s);
  s = advanceTurn(s); s = advanceTurn(s); s = advanceTurn(s);
  const s2 = applyDetectedOffer(s, { mindId: 'ramana_maharshi', reason: 'r' });
  assert.equal(s2, s, 'same mind re-suggested is suppressed for the whole session');
});

// ── parseHandoffDecision ───────────────────────────────────────────────────

test('parser: valid shouldHandoff=true with known mindId', () => {
  const out = parseHandoffDecision(
    '{"shouldHandoff": true, "mindId": "ramana_maharshi", "reason": "identity question"}',
  );
  assert.equal(out.shouldHandoff, true);
  assert.equal(out.mindId, 'ramana_maharshi');
  assert.equal(out.reason, 'identity question');
});

test('parser: shouldHandoff=false returns noop', () => {
  const out = parseHandoffDecision('{"shouldHandoff": false, "mindId": null, "reason": null}');
  assert.equal(out.shouldHandoff, false);
  assert.equal(out.mindId, null);
});

test('parser: unknown mindId is rejected', () => {
  const out = parseHandoffDecision(
    '{"shouldHandoff": true, "mindId": "socrates", "reason": "r"}',
  );
  assert.equal(out.shouldHandoff, false);
});

test('parser: shouldHandoff=true without mindId is rejected', () => {
  const out = parseHandoffDecision('{"shouldHandoff": true, "mindId": null, "reason": "r"}');
  assert.equal(out.shouldHandoff, false);
});

test('parser: tolerates code fences', () => {
  const out = parseHandoffDecision(
    '```json\n{"shouldHandoff": true, "mindId": "rumi", "reason": "longing"}\n```',
  );
  assert.equal(out.shouldHandoff, true);
  assert.equal(out.mindId, 'rumi');
});

test('parser: malformed JSON returns noop without throwing', () => {
  assert.equal(parseHandoffDecision('{not json').shouldHandoff, false);
  assert.equal(parseHandoffDecision('').shouldHandoff, false);
  assert.equal(parseHandoffDecision('no braces').shouldHandoff, false);
});

// ── parseTransferSummary ──────────────────────────────────────────────────

test('parseTransferSummary: valid payload', () => {
  const out = parseTransferSummary(
    '{"summary": "A quiet circling of work worries.", "distillation": "Am I in the right role?"}',
  );
  assert.equal(out?.summary, 'A quiet circling of work worries.');
  assert.equal(out?.distillation, 'Am I in the right role?');
});

test('parseTransferSummary: missing fields → null', () => {
  assert.equal(parseTransferSummary('{"summary": "only"}'), null);
  assert.equal(parseTransferSummary('{"distillation": "only"}'), null);
});

test('parseTransferSummary: empty strings rejected', () => {
  assert.equal(parseTransferSummary('{"summary": "", "distillation": "q"}'), null);
});

test('parseTransferSummary: malformed → null', () => {
  assert.equal(parseTransferSummary('nope'), null);
});

// ── Runner ────────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  FAIL  ${name}`); console.error(err); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed > 0) process.exit(1);
