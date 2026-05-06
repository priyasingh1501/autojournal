/**
 * Pure parsers + types for handoff detection.
 *
 * Kept in a module that imports ONLY types so tsx tests can exercise the
 * parsing logic without pulling in react-native / claudeProxy transitively.
 */

import type { SourceContext } from './openingLineSelector';

const ALLOWED_MIND_IDS: ReadonlySet<string> = new Set([
  'ramana_maharshi',
  'krishna',
  'jiddu_krishnamurti',
  'adi_shankaracharya',
  'buddha',
  'rumi',
  'carl_jung',
  'charlie_munger',
]);

export interface HandoffDecision {
  shouldHandoff: boolean;
  mindId: string | null;
  reason: string | null;
}

/**
 * Parse Haiku's detection output. Defensive against code fences, trailing
 * prose, unknown mind ids, and "shouldHandoff: true without mindId" shapes.
 * Malformed → {shouldHandoff:false}, never throws.
 */
export function parseHandoffDecision(raw: string): HandoffDecision {
  const noop: HandoffDecision = { shouldHandoff: false, mindId: null, reason: null };
  if (!raw) return noop;

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s === -1 || e <= s) return noop;

  let obj: any;
  try {
    obj = JSON.parse(stripped.slice(s, e + 1));
  } catch {
    return noop;
  }
  if (!obj || typeof obj !== 'object') return noop;

  const should = obj.shouldHandoff === true;
  if (!should) return noop;

  const mindId = typeof obj.mindId === 'string' ? obj.mindId : null;
  if (!mindId || !ALLOWED_MIND_IDS.has(mindId)) return noop;

  const reason = typeof obj.reason === 'string' && obj.reason.trim().length > 0
    ? obj.reason.trim()
    : null;

  return { shouldHandoff: true, mindId, reason };
}

export interface TransferSummary {
  summary: string;
  distillation: string;
}

export function parseTransferSummary(raw: string): TransferSummary | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s === -1 || e <= s) return null;

  try {
    const obj = JSON.parse(stripped.slice(s, e + 1));
    if (!obj || typeof obj !== 'object') return null;
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const distillation = typeof obj.distillation === 'string' ? obj.distillation.trim() : '';
    if (!summary || !distillation) return null;
    return { summary, distillation };
  } catch {
    return null;
  }
}

export function buildHandoffSourceContext(transfer: TransferSummary): SourceContext {
  return {
    kind: 'day', // reused kind — description text carries the real shape
    description:
      `Companion has brought this user to you. Here is the shape of their conversation so far: ${transfer.summary} ` +
      `The user's question has become: ${transfer.distillation}`,
  };
}
