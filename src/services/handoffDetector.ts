/**
 * Handoff detection + transfer-summary generation for Companion sessions.
 *
 * Two one-shot Haiku calls:
 *   1. detectHandoff(messages)  → should Companion pass the baton?
 *   2. generateTransferSummary(messages) → 2-3 sentence handoff context
 *      the receiving specialist will see as SourceContext.
 *
 * Response parsing lives in handoffParsers.ts so it can be tested without
 * pulling in react-native via AIProxy.
 */

import { claudeProxy } from './AIProxy';
import type { ConversationMessage } from '../types';
import {
  parseHandoffDecision,
  parseTransferSummary,
  buildHandoffSourceContext,
  HandoffDecision,
  TransferSummary,
} from './handoffParsers';

export {
  parseHandoffDecision,
  parseTransferSummary,
  buildHandoffSourceContext,
} from './handoffParsers';
export type { HandoffDecision, TransferSummary } from './handoffParsers';

// ── Detection call ───────────────────────────────────────────────────────────

const DETECTION_SYSTEM = `You are assessing a conversation between a user and Companion, a warm reflective voice in a journaling app. Based on the conversation so far, determine if one of the following specialist minds would serve the user better at this point:

ramana_maharshi: for identity / self-inquiry questions ("who am I in this?")
krishna: for decisions about what one is called to do
jiddu_krishnamurti: for conditioning, inherited beliefs, stuck thought patterns
adi_shankaracharya: for philosophical / structural clarity questions
buddha: for craving, attachment, the roots of wanting
rumi: for grief, longing, love, sitting in ache
carl_jung: for unconscious material, dreams, symbolic patterns, shadow work
charlie_munger: for clear-cut decision problems needing mental models

Output JSON only:
{
  "shouldHandoff": boolean,
  "mindId": string | null,
  "reason": string | null
}

Only suggest a handoff if the conversation has clearly revealed a shape that the specialist would meet substantially better than Companion. Uncertainty means no handoff. Default to staying with Companion.`;

function transcriptOf(messages: readonly ConversationMessage[], maxTurns: number): string {
  return messages
    .slice(-maxTurns)
    .map(m => `${m.role === 'user' ? 'You' : 'Companion'}: ${m.text.trim()}`)
    .filter(l => l.length > 4)
    .join('\n')
    .slice(0, 4000);
}

/**
 * Run the detection pass. Returns null (no handoff) on API errors, malformed
 * responses, or a genuine no-handoff decision — callers don't need to
 * distinguish since both outcomes mean "do nothing".
 */
export async function detectHandoff(
  messages: readonly ConversationMessage[],
): Promise<HandoffDecision | null> {
  try {
    const transcript = transcriptOf(messages, 6);
    if (transcript.length < 40) return null;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 140,
      system: DETECTION_SYSTEM,
      messages: [{ role: 'user', content: `Conversation so far:\n\n${transcript}` }],
    });

    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const decision = parseHandoffDecision(raw);
    return decision.shouldHandoff ? decision : null;
  } catch {
    return null;
  }
}

// ── Transfer summary ─────────────────────────────────────────────────────────

const TRANSFER_SYSTEM = `You are summarizing a Companion chat session so a specialist mind can step in with continuity. Output exactly one JSON object:

{
  "summary": "2–3 sentences describing what the conversation has been about. Warm, observational. No clinical language. No personality labels.",
  "distillation": "A single sentence naming the question that has emerged underneath the conversation."
}

Return ONLY the JSON — no preamble, no fences.`;

export async function generateTransferSummary(
  messages: readonly ConversationMessage[],
): Promise<TransferSummary | null> {
  try {
    const transcript = transcriptOf(messages, 8);
    if (transcript.length < 40) return null;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      system: TRANSFER_SYSTEM,
      messages: [{ role: 'user', content: `Conversation:\n\n${transcript}` }],
    });

    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    return parseTransferSummary(raw);
  } catch {
    return null;
  }
}
