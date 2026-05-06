import { claudeProxy } from './AIProxy';
import {
  DailySummary, ConversationMessage,
  UserGoals, MonthlyData,
} from '../types';
import { getContextPromptForConversation, getUserContextV2 } from './UserContextService';
import { getMindV2 } from './mindsConfigV2';
import type { MindV2 } from '../types';
import {
  selectOpening,
  SourceContext,
  companionModeDirective,
} from './openingLineSelector';

// ── Intent types ──────────────────────────────────────────────────────────────

export type ConversationIntent =
  | 'emotional'
  | 'decision'
  | 'reflection'
  | 'problem_solving'
  | 'value_alignment'
  | 'life_optimisation';

export interface ConversationContext {
  goals?: UserGoals;
  monthlyData?: MonthlyData;
}

/**
 * Classify the user's opening message into one of the six intent categories.
 * Run once at the start of a session; cache the result for all subsequent turns.
 */
export async function detectIntent(userText: string): Promise<ConversationIntent> {
  try {
    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      system: `Classify the user's intent. Reply with ONLY one word from this list:
emotional | decision | reflection | problem_solving | value_alignment | life_optimisation

Rules:
- emotional: processing feelings, venting, grief, anxiety, relationship pain
- decision: choosing between options — buy/skip, which workout, what to eat, career move, financial choice
- reflection: understanding patterns, reviewing the past, making meaning of events
- problem_solving: stuck on something practical, needs clarity, a plan, or a way forward
- value_alignment: moral tension, integrity conflict, what's the right thing to do
- life_optimisation: fitness, nutrition, spending, habits, goals — how to improve or track`,
      messages: [{ role: 'user', content: userText }],
    });
    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()
      .toLowerCase() as ConversationIntent;
    const valid: ConversationIntent[] = [
      'emotional', 'decision', 'reflection',
      'problem_solving', 'value_alignment', 'life_optimisation',
    ];
    return valid.includes(raw) ? raw : 'reflection';
  } catch {
    return 'reflection';
  }
}

// Cache system prompts for the lifetime of the JS module — the prompt for a
// given mindId is stable within a conversation.
const _systemPromptCache = new Map<string, string>();

export async function getSystemPromptWithContext(mindId?: string | null, intent?: ConversationIntent): Promise<string> {
  const cacheKey = mindId ?? 'companion';
  const cached = _systemPromptCache.get(cacheKey);
  if (cached) return cached;

  // Every named mind owns its systemPrompt in mindsConfigV2. An unknown
  // `mindId` means stored conversation state is referencing a mind that no
  // longer exists (or was never added) — fail loudly rather than silently
  // dropping the user into a generic reflection prompt.
  const v2 = getMindV2(mindId);
  if (!v2) throw new Error(`[ConversationService] unknown mindId: ${mindId}`);
  let base = v2.systemPrompt;
  // `intent` is still plumbed through by ChatScreen/TalkScreen (they detect
  // it for analytics) but no longer routes the prompt now that every mind
  // carries its own monolithic system prompt.
  void intent;

  // Companion-only: inject the tenure-derived voice-mode directive. This
  // sits on top of the static tenure guidance already in Companion's
  // systemPrompt — it's an explicit marker for the current session so the
  // model doesn't have to interpret tenureDays itself.
  if (mindId === null || mindId === undefined || mindId === 'companion') {
    try {
      const ctx = await getUserContextV2();
      const mode = ctx.tenureDays < 30 ? 'gentle' : ctx.tenureDays >= 90 ? 'familiar' : 'standard';
      base = `${base}\n\n${companionModeDirective(mode)}`;
    } catch { /* defensive — skip the directive if context fails */ }
  }

  let result: string;
  try {
    const ctxBlock = await getContextPromptForConversation(mindId);
    result = ctxBlock ? base + ctxBlock : base;
  } catch {
    result = base;
  }
  _systemPromptCache.set(cacheKey, result);
  return result;
}

// ── Context block builder ─────────────────────────────────────────────────────

function buildContextBlock(
  summary: DailySummary,
  intent?: ConversationIntent,
  ctx?: ConversationContext,
): string {
  const lines: string[] = [
    `DAY: ${summary.date}`,
    `\nDAY SUMMARY:\n${summary.insightText ?? summary.summary}`,
    summary.insightText ? `\nDAY INSIGHTS:\n${summary.insightText}` : '',
  ];

  if (!ctx) return lines.filter(Boolean).join('\n');

  const { goals, monthlyData } = ctx;

  // Always include recent emotion patterns when available
  if (monthlyData?.emotionCounts?.length) {
    const top = monthlyData.emotionCounts.slice(0, 4);
    lines.push(
      '\nRECENT EMOTIONAL PATTERNS: ' +
        top.map(e => `${e.name} (${e.count}x, ${e.sentiment})`).join(', '),
    );
  }

  // Decision / life_optimisation / problem_solving: goals + actuals
  if (
    intent === 'decision' ||
    intent === 'life_optimisation' ||
    intent === 'problem_solving'
  ) {
    if (goals) {
      const goalLines: string[] = [];
      if (goals.monthlySpendBudget) goalLines.push(`spend budget ₹${goals.monthlySpendBudget}/month`);
      if (goals.dailyCalorieTarget) goalLines.push(`${goals.dailyCalorieTarget} kcal/day`);
      if (goals.dailyProteinTarget) goalLines.push(`${goals.dailyProteinTarget}g protein/day`);
      if (goals.strengthDaysPerWeek) goalLines.push(`strength ${goals.strengthDaysPerWeek}×/week`);
      if (goals.cardioDaysPerWeek) goalLines.push(`cardio ${goals.cardioDaysPerWeek}×/week`);
      if (goalLines.length) lines.push('\nUSER GOALS: ' + goalLines.join(', '));
    }
    if (monthlyData) {
      const actuals: string[] = [];
      if (monthlyData.movementDays) {
        const done = monthlyData.movementDays.filter(Boolean).length;
        actuals.push(`${done} movement days this month`);
      }
      if (monthlyData.spendCategories?.length) {
        actuals.push(
          'spending: ' +
            monthlyData.spendCategories
              .slice(0, 4)
              .map(c => `${c.name} (${c.level}${c.amount ? `, ₹${c.amount}` : ''})`)
              .join(', '),
        );
      }
      if (monthlyData.lastMealSummary) actuals.push(`recent meals: ${monthlyData.lastMealSummary}`);
      if (actuals.length) lines.push('\nACTUALS THIS MONTH: ' + actuals.join('; '));
    }
  }

  return lines.filter(Boolean).join('\n');
}

// ── Message builder ───────────────────────────────────────────────────────────

function buildMessages(
  summary: DailySummary,
  history: ConversationMessage[],
  userText: string,
  intent?: ConversationIntent,
  ctx?: ConversationContext,
): any[] {
  const contextBlock = buildContextBlock(summary, intent, ctx);

  return [
    {
      role: 'user',
      content: `Here is the context for today's reflection:\n\n${contextBlock}\n\nI'm ready to talk about my day.`,
    },
    { role: 'assistant', content: buildOpeningLine() },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
    { role: 'user' as const, content: userText },
  ];
}

// ── Exported conversation functions ───────────────────────────────────────────

export async function sendMessage(
  summary: DailySummary,
  history: ConversationMessage[],
  userText: string,
  apiKey?: string,
  mindId?: string | null,
  intent?: ConversationIntent,
  ctx?: ConversationContext,
): Promise<string> {
  const system = await getSystemPromptWithContext(mindId, intent);
  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 360,
    system,
    messages: buildMessages(summary, history, userText, intent, ctx),
  });

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  return text;
}

/**
 * Light Haiku pass that nudges a handcrafted opener to acknowledge the
 * source context the user just tapped in from. The returned string must
 * keep the voice of the original line — this is not a rewrite, it's a
 * tilt. Never exceeds ~30 words. One-shot, non-cached.
 */
async function adaptOpeningLine(
  originalLine: string,
  source: SourceContext | null | undefined,
  dayContent?: string,
): Promise<string> {
  if (!source && !dayContent) return originalLine;
  const system = `You are adapting a handcrafted opening line for a mind-conversation app. You will be given:
  1. The prewritten opening line (in the mind's voice)
  2. A short description of the context the user just tapped in from
  3. (Optional) The actual content of the user's day summary — use specific details from this to make the opening feel personal

Your job: adapt the opening line *slightly* so it acknowledges something real from the user's day — without changing its voice, its cadence, or its essential content. The handcrafted wording is the product. You are tilting it, not rewriting it.

Rules:
- Preserve the voice of the original line. If the line is spare, stay spare. If lyrical, stay lyrical.
- Draw on a specific detail, emotion, or theme from the day content — do NOT be generic.
- Do NOT restate or summarise the day back at the user. One implicit nod is enough.
- Length: stay within 10% of the original line's length. No longer.
- Return ONLY the adapted line. No preamble, no quotes, no explanation.`;

  const parts = [`Prewritten opening line: ${originalLine}`];
  if (source) parts.push(`Source context: ${source.description}`);
  if (dayContent) parts.push(`Day content:\n${dayContent}`);
  const userMsg = parts.join('\n\n');

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()
    .replace(/^["']|["']$/g, '');
  return text;
}

/**
 * Generate a day-specific opening in the mind's voice. Used when the user
 * taps "Get a new perspective" from a day summary — the model has read the
 * actual day content and opens with something specific from it.
 *
 * Falls back to the handcrafted line on failure so the conversation always
 * starts.
 */
async function generateDayAwareOpening(
  mind: MindV2,
  dayContent: string,
  fallbackLine: string,
): Promise<string> {
  const system = `You are ${mind.name}. A user has just tapped "Get a new perspective" from their day summary and opened a conversation with you.

Your voice and style:
${mind.systemPrompt.split('\n').slice(0, 8).join('\n')}

TASK
Read the day summary carefully. Look for:
- Conflict (with others or internal)
- Frustration, irritation, or anger
- Anxiety, worry, or stress
- Recurring thoughts or patterns the person keeps returning to
- Decisions being weighed or avoided
- Ideas or plans that surfaced but weren't fully followed
- Unresolved feelings — things named but not landed on
- Anything left unresolved or weighing on them

Then write an opening message that:
1. Acknowledges the most charged thing you noticed — name it directly but without clinical language. Stay in your voice.
2. Offers 2–3 specific threads from the day the person might want to explore — phrased as brief invitations, not a list. Weave them into the message naturally.
3. Ends with a single open question that lets them choose where to start.

Rules:
- Do NOT summarise the whole day. Pick what has the most charge.
- Stay in your characteristic voice and rhythm throughout.
- Length: 3–5 sentences total.
- Return ONLY the opening message. No preamble, no quotes.`;

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: `Day summary:\n${dayContent}` }],
  });
  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()
    .replace(/^["']|["']$/g, '');
  return text || fallbackLine;
}

/**
 * Generate a warm, context-aware opening line when the conversation starts.
 *
 * When coming from a day summary (journal tab), generates directly from the
 * day content so the opening is specific to what the user experienced.
 * All other surfaces use the handcrafted opener pool with an optional light
 * adaptation pass.
 */
export async function getOpeningMessage(
  summary: DailySummary,
  apiKey?: string,
  mindId?: string | null,
  sourceContext?: SourceContext | null,
): Promise<string> {
  void apiKey;
  const v2 = getMindV2(mindId);
  if (!v2) throw new Error(`[ConversationService] unknown mindId: ${mindId}`);
  const ctx = await getUserContextV2().catch(() => null);
  const wellbeing = ctx?.wellbeingState ?? 'regulated';
  const tenure    = ctx?.tenureDays    ?? 0;
  const pick = selectOpening({
    mind: v2,
    sourceContext: sourceContext ?? null,
    wellbeingState: wellbeing,
    tenureDays: tenure,
  });

  // Day summary path: generate directly from day content instead of tilting
  // a handcrafted line. Fallback to the picked line if generation fails.
  if (sourceContext?.kind === 'day') {
    const parts: string[] = [];

    const prose = summary.insightText ?? summary.summary ?? summary.reflection ?? '';
    if (prose) parts.push(prose.slice(0, 500));

    if (summary.moodArc) {
      const { morning, afternoon, evening } = summary.moodArc;
      const arc = [morning && `morning: ${morning}`, afternoon && `afternoon: ${afternoon}`, evening && `evening: ${evening}`]
        .filter(Boolean).join(' → ');
      if (arc) parts.push(`Mood arc — ${arc}`);
    }

    if (summary.whatTheDayHeld?.length) {
      const held = summary.whatTheDayHeld.map(r => `${r.label}: ${r.content}`).join('\n');
      parts.push(`What the day held:\n${held}`);
    }

    const dayContent = parts.join('\n\n');
    if (dayContent) {
      try {
        return await generateDayAwareOpening(v2, dayContent, pick.line);
      } catch {
        return pick.line;
      }
    }
  }

  if (!pick.needsAdaptation) return pick.line;
  try {
    const adapted = await adaptOpeningLine(pick.line, sourceContext);
    return adapted || pick.line;
  } catch {
    return pick.line;
  }
}

function buildOpeningLine(): string {
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
  const convoText = messages
    .map(m => `${m.role === 'user' ? 'You' : 'Companion'}: ${m.text}`)
    .join('\n');

  const contextBlock = buildContextBlock(summary);

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
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
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
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

// ── Distress-aware system prompt additions (call mode) ────────────────────────

const CALL_DISTRESS_ADDITIONS: Record<number, string> = {
  2: `\n\nCALL WELLBEING GUIDANCE: You're noticing the person may be carrying something heavy. At a natural pause — not interrupting, not immediately — gently name what you're sensing: "I'm noticing something — you sound a little heavy today. Is that right?" Keep it short and open. Give them full control of where it goes. If they redirect, follow them; don't hold the door open awkwardly. If they stay with it, slow down and ask: "Do you want to keep going, or just sit here for a minute?" — the option to just be heard without prompts matters.`,

  3: `\n\nCALL CRISIS GUIDANCE: Stop the journaling session. Do not continue reflection prompts. The person may be in acute distress. Your entire response must be: acknowledge what you heard with warmth, then ask exactly: "Are you safe right now?" — nothing else after that. One or two sentences maximum. Calm and steady. The conversation will pause until they respond.`,
};

/**
 * Fetch the full Claude response, then split into sentences.
 * React Native's fetch doesn't support SSE/streaming bodies, so we get
 * the complete text first and then break it up for parallel TTS synthesis.
 *
 * @param distressTier  Optional call-mode distress tier (2 or 3).
 *                      When set, distress-appropriate instructions are appended
 *                      to the system prompt for this turn only.
 */
export async function fetchSentences(
  summary: DailySummary,
  history: ConversationMessage[],
  userText: string,
  apiKey: string,
  mindId?: string | null,
  distressTier?: 2 | 3,
  intent?: ConversationIntent,
  ctx?: ConversationContext,
  prebuiltSystem?: string,
): Promise<string[]> {
  const baseSystem = prebuiltSystem ?? await getSystemPromptWithContext(mindId, intent);
  const system = distressTier
    ? baseSystem + (CALL_DISTRESS_ADDITIONS[distressTier] ?? '')
    : baseSystem;

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: distressTier === 3 ? 80 : 220,
    system,
    messages: buildMessages(summary, history, userText, intent, ctx),
  });

  const full = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  const { sentences, remaining } = extractSentences(full + ' '); // trailing space triggers final split
  if (remaining.trim().length >= 3) sentences.push(remaining.trim());
  return sentences.length > 0 ? sentences : [full];
}
