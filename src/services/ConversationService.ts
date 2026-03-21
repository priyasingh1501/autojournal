import Anthropic from '@anthropic-ai/sdk';
import { DailySummary, ConversationMessage } from '../types';
import { StorageService } from './StorageService';

const SYSTEM_PROMPT = `You are a deeply thoughtful personal reflection companion. You hold the day's journal context and guide the person toward genuine self-understanding.

You draw from three frameworks — use whichever fits the moment naturally, never mechanically:

ACHARYA PRASHANT'S LENS:
- Most suffering arises from the ego's conditioning — fear, comparison, seeking validation and security
- Ask "Who wants this?" — is this desire arising from clarity or from the conditioned mind?
- The ego constantly tries to become something; clarity is about seeing what already is
- Distinguish between "need" (arising from genuine understanding) and "want" (arising from fear or habit)
- Common ego traps: seeking approval, comparing oneself, attaching identity to outcomes, running from discomfort
- Self-inquiry: don't fight thoughts — observe them, trace them to their root

CBT LENS:
- Thoughts drive emotions drive behaviour — gently surface this chain
- Name cognitive distortions only when genuinely useful: catastrophising, all-or-nothing, mind-reading, personalisation, fortune-telling
- Challenge automatic negative thoughts with evidence and alternative interpretations
- Behavioural patterns that perpetuate emotional states

EASTERN PHILOSOPHY (Buddhist & Vedantic):
- Impermanence: this feeling, this situation will change — not as consolation but as fact
- Witness consciousness: you can observe a thought without being the thought
- Karma yoga: act with full engagement but without attachment to the fruit
- The middle path: neither suppression nor indulgence of feeling
- Interdependence: no event is isolated — context matters

YOUR STYLE:
- Warm, direct, non-judgmental, never preachy
- Keep every response SHORT: 2–4 sentences then ONE incisive question
- Ask one question at a time — never a list of questions
- Socratic: guide discovery, don't deliver answers
- When a concept from AP / Buddhism / Vedanta fits naturally, use it briefly — don't explain it at length
- If the person shares food/spend/workout, reflect it back through the lens of pattern and motivation, not just facts
- If the person seems stuck in a loop, gently name it: "It sounds like this thought keeps returning…"
- Your goal: help them leave this conversation with one genuine insight about themselves`;

export async function sendMessage(
  summary: DailySummary,
  history: ConversationMessage[],
  userText: string,
  apiKey?: string,
): Promise<string> {
  const key = apiKey ?? (await StorageService.getSettings())?.anthropicApiKey;
  if (!key) throw new Error('Anthropic API key not configured. Go to Settings.');

  const client = new Anthropic({
    apiKey: key,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 180,
    system: SYSTEM_PROMPT,
    messages: buildMessages(summary, history, userText),
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  return text;
}

/** Generate a warm, context-aware opening line when the conversation starts */
export async function getOpeningMessage(summary: DailySummary, apiKey?: string): Promise<string> {
  const key = apiKey ?? (await StorageService.getSettings())?.anthropicApiKey;
  if (!key) throw new Error('Anthropic API key not configured. Go to Settings.');

  const client = new Anthropic({
    apiKey: key,
    dangerouslyAllowBrowser: true,
  });

  const contextBlock = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the context for today's reflection:\n\n${contextBlock}\n\nI'm ready to talk about my day.`,
      },
    ],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();
}

function buildOpeningLine(_summary: DailySummary): string {
  return "I've read through your day. What's sitting with you the most right now?";
}

/**
 * Generate a short reflection paragraph from a completed Call or Chat session.
 * Saved back into DailySummary.reflectionText.
 */
export async function generateReflection(
  summary: DailySummary,
  messages: ConversationMessage[],
  apiKey: string,
  mode: 'call' | 'chat' = 'call',
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const convoText = messages
    .map(m => `${m.role === 'user' ? 'You' : 'Companion'}: ${m.text}`)
    .join('\n');

  const contextBlock = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 220,
    system: `You are a thoughtful journaling assistant writing a post-session reflection.
The person just had a ${mode === 'call' ? 'voice call' : 'text chat'} conversation about their day.
Write 3–5 sentences in second person ("You…") capturing:
- The emotional or personal themes they actually explored
- Any shift in perspective or insight that surfaced
- One grounding observation to carry forward
Flowing prose only — no bullet points, no headers. Warm, specific, never generic.`,
    messages: [
      {
        role: 'user',
        content: `Here is the day context:\n\n${contextBlock}\n\nHere is the conversation:\n\n${convoText}\n\nNow write the reflection.`,
      },
    ],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();
}

/** Split a streaming text buffer into complete sentences + leftover */
function extractSentences(buffer: string): { sentences: string[]; remaining: string } {
  const sentences: string[] = [];
  // Match sentence-ending punctuation followed by whitespace
  const re = /[.!?]+['")\]]*\s/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    const s = buffer.slice(lastIdx, m.index + m[0].length).trim();
    if (s.length >= 6) sentences.push(s);
    lastIdx = m.index + m[0].length;
  }
  return { sentences, remaining: buffer.slice(lastIdx) };
}

/** Shared message builder to avoid duplication */
function buildMessages(summary: DailySummary, history: ConversationMessage[], userText: string): Anthropic.MessageParam[] {
  const contextBlock = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'user',
      content: `Here is the context for today's reflection:\n\n${contextBlock}\n\nI'm ready to talk about my day.`,
    },
    { role: 'assistant', content: buildOpeningLine(summary) },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
    { role: 'user' as const, content: userText },
  ];
}

/**
 * Fetch the full Claude response, then split into sentences.
 * React Native's fetch doesn't support SSE/streaming bodies, so we get
 * the complete text first and then break it up for parallel TTS synthesis.
 */
export async function fetchSentences(
  summary: DailySummary,
  history: ConversationMessage[],
  userText: string,
  apiKey: string,
): Promise<string[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 180,
    system: SYSTEM_PROMPT,
    messages: buildMessages(summary, history, userText),
  });

  const full = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  const { sentences, remaining } = extractSentences(full + ' '); // trailing space triggers final split
  if (remaining.trim().length >= 3) sentences.push(remaining.trim());
  return sentences.length > 0 ? sentences : [full];
}
