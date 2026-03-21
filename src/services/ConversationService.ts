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
): Promise<string> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  // Build context block (injected as first user turn so Claude always has it)
  const contextBlock = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ].filter(Boolean).join('\n');

  // Build messages array for Claude
  // First turn seeds the context; subsequent turns are real conversation
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Here is the context for today's reflection:\n\n${contextBlock}\n\nI'm ready to talk about my day.`,
    },
    {
      role: 'assistant',
      content: buildOpeningLine(summary),
    },
    // Append real conversation history
    ...history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    })),
    // Current user message
    { role: 'user' as const, content: userText },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  return text;
}

/** Generate a warm, context-aware opening line when the conversation starts */
export async function getOpeningMessage(summary: DailySummary): Promise<string> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  const contextBlock = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ].filter(Boolean).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 150,
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
  // Fallback used only if getOpeningMessage isn't called first
  return "I've read through your day. What's sitting with you the most right now?";
}
