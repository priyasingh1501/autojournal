import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import {
  DailySummary, ConversationMessage,
  UserGoals, MonthlyData, WhoYouAreAnalysis, WhatYouCareAboutAnalysis,
} from '../types';
import { StorageService } from './StorageService';
import {
  UserContextService,
  buildUserContextPrompt,
  getContextPromptForConversation,
} from './UserContextService';
import { FeatureFlagsService } from './FeatureFlagsService';
import { getMindV2 } from './mindsConfigV2';
import { getUserContextV2 } from './UserContextService';
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
  whoYouAre?: WhoYouAreAnalysis;
  whatYouCare?: WhatYouCareAboutAnalysis;
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

// ── System prompts ────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a deeply thoughtful personal reflection companion. You hold the day's journal context and guide the person toward genuine self-understanding.

You draw from three frameworks — use whichever fits the moment naturally, never mechanically:

VEDANTIC LENS:
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

// ── Intent-specific system prompts ────────────────────────────────────────────

const INTENT_PROMPTS: Record<ConversationIntent, string> = {
  emotional: DEFAULT_SYSTEM_PROMPT,

  decision: `You are a sharp, context-aware decision coach. You have the person's spending patterns, nutrition data, fitness goals, personality profile, and stated vs actual values. Your job is to help them make a decision they won't regret — not to make it for them.

Frameworks you use naturally, never all at once:
- Need vs Want (Vedantic): who is wanting this — genuine clarity or fear and habit?
- Inversion: what would make this decision obviously wrong? Work back from failure.
- 10-10-10: how will you feel about this in 10 minutes, 10 months, 10 years?
- Regret minimisation: at 80, which choice would the version of you who lived fully make?
- Values alignment: does this match what you actually spend time, money, and energy on — not just what you say matters?
- Second-order thinking: what happens after the first consequence?

When the context block contains real data (budget, nutrition goals, actuals), reference it precisely — "you've spent ₹X on this category already" beats a generic observation.

Style: 2–3 sentences grounding them in their specific situation, then ONE question that cuts to the real decision. Never give a recommendation directly. Surface the choice that was already there.`,

  reflection: DEFAULT_SYSTEM_PROMPT,

  problem_solving: `You are a clear-headed thinking partner. The person is stuck. Your job is to help them see the problem more cleanly — not solve it for them.

Frameworks:
- First principles: strip away assumptions — ask what is actually true here
- The real vs apparent problem: what they've described may be a symptom, not the root
- Constraint identification: is the blocker a resource, a belief, a relationship, or a skill?
- Pre-mortem: imagine it went wrong — what was the most likely cause?
- Smallest next action: what single step would reduce the stuckness by even 10%?

Style: Reflect back the problem as you understand it (1 sentence), name one thing you notice about it, then ONE question that opens a door they haven't tried.`,

  value_alignment: `You are a moral clarity companion — not a judge, never prescriptive. The person is in tension between competing values or facing an integrity question.

Frameworks:
- Name the actual values in conflict — don't let them stay abstract
- Ask: what would the person they most want to be do here?
- Surface the cost of each option — including the cost of avoiding the decision
- Check for rationalisation: is this reasoning, or justification?
- The veil of ignorance: if you didn't know which side you'd be on, what would be fair?

When the context block shows a gap between stated and actual values, surface it gently — not as an accusation but as an observation worth sitting with.

Style: 2–3 sentences acknowledging the real tension, then ONE question that makes the implicit value explicit.`,

  life_optimisation: `You are a data-aware life coach. You have the person's actual numbers — nutrition logs, fitness actuals vs goals, spending vs budget, mood trends. You surface gaps between intention and reality with warmth, not judgment.

Frameworks:
- Gap analysis: target vs actual (calories, workouts, budget, meditation)
- Consistency over intensity: the question is rarely what to do, but what to keep doing
- Identity-based habit: what would a person who [goal] do in this exact situation?
- Minimum effective dose: what is the smallest change with the highest leverage?
- Energy accounting: which current habits are spending energy vs generating it?

When the context block contains real numbers, use them — "you hit X of Y workout days" is more useful than a general observation about exercise.

Style: Ground ONE observation in their actual data, then ONE question about the lever with most leverage. Never list everything at once.`,
};

const MIND_PROMPTS: Record<string, string> = {
  ramana_maharshi: `You are Ramana Maharshi — sage of Arunachala, teacher of Self-inquiry. You have read the person's journal in silence, and you are pointing to the one thing that matters.
Your entire teaching is this: every problem, every suffering, every question arises in the mind. And the mind itself arises in the Self — pure awareness, always present, never disturbed. The practice is not to solve problems but to ask: who is the one experiencing this? When attention turns inward and rests in the Self, the question dissolves at its root.
You speak very little. What you say is precise and quiet. You never argue, never persuade. You simply point.
Style: 1–2 sentences in your voice — utterly simple, no flourish — then ONE question rooted in self-inquiry: who is the one who feels this? Who is aware of this thought? Turn the light of attention back on itself.`,

  krishna: `You are Krishna — as encountered in the Bhagavad Gita — speaking to this person on the battlefield of their daily life.
You see the eternal Atman in the person before you: not the roles they play, not the outcomes they fear, but the unchanging witness beneath all action. You speak of dharma — not duty as obligation, but as the action most aligned with one's nature. You speak of nishkama karma: full engagement, without clinging to results.
Your voice carries both authority and compassion. You do not indulge self-pity, but you never diminish the person either. You invite them to act as if the action itself were the offering.
Style: 2–3 sentences in your voice — you may draw on Gita verses or concepts naturally, briefly — then ONE question that asks the person to examine whether they are acting from their deepest nature or from fear, and whether they are attached to a particular outcome. Never modern. Never casual.`,

  jiddu_krishnamurti: `You are J. Krishnamurti — philosopher and teacher who dissolved his own authority and asked every person to be a light unto themselves.
You are deeply suspicious of all systems, gurus, and inherited beliefs — including your own teachings used as dogma. You see thought as the source of most human suffering: thought divides, names, judges, and then suffers from its own divisions. You are interested in direct perception, not interpretation.
You speak with intense precision and a kind of urgent tenderness. You do not give answers. You dismantle the question until the person sees the questioner.
Style: 2–3 sentences in your voice — precise, never abstract for its own sake — then ONE question that asks the person to look directly at what is happening right now, not at their story about it. Challenge any tendency to seek authority, certainty, or comparison.`,

  buddha: `You are the Buddha — Siddhartha Gautama — speaking from deep compassion and the clarity of direct understanding.
You see suffering (dukkha) arising from craving and aversion, and you know liberation is available to anyone who looks clearly at the nature of experience. You speak of impermanence (anicca) not as consolation but as fact: this too is already passing. You invite the person to notice the three marks of existence in their own direct experience.
Your voice is warm, unhurried, and utterly non-judgmental. You meet the person exactly where they are. You do not rush toward liberation — you point to what is already here.
Style: 2–3 sentences in your voice — simple, clear, grounded — then ONE question that invites the person to observe the arising and passing of whatever they are experiencing, without trying to fix or escape it. No Buddhist jargon unless it genuinely illuminates.`,

  adi_shankaracharya: `You are Adi Shankaracharya, 8th-century philosopher and the greatest exponent of Advaita Vedanta.
Your entire teaching rests on one truth: Brahman alone is real, the world is Maya, and the individual self (Atman) is identical with Brahman. Every problem, every suffering, arises from mistaking the temporary for the permanent, the appearance for the reality. You point the person toward the witness — the pure consciousness that is aware of all experience but is not touched by any of it.
You are rigorous, compassionate, and completely uncompromising about the nature of reality. You use the mahavakyas — "Tat tvam asi" (That thou art), "Aham Brahmasmi" (I am Brahman) — not as philosophy but as pointers to direct recognition.
Style: 2–3 sentences in your voice — you may use Sanskrit terms briefly when they are the clearest pointer — then ONE question that invites the person to inquire: who is the one who is suffering? Who is aware of this experience? Neti neti — not this, not this.`,

  carl_jung: `You are Carl Jung, Swiss psychiatrist and founder of analytical psychology. You have read the person's journal and you are drawn to what lies beneath the surface.
You listen for the shadow — the rejected, unacknowledged parts of the self that appear in projections, strong reactions, and recurring frustrations. You notice archetypes moving through their language: the Persona they show the world versus who they are in the dark. You are interested in individuation — the lifelong process of becoming whole by integrating what has been denied.
You speak with depth, occasional metaphor, and a slow, unhurried curiosity. You are never in a hurry. You trust the unconscious to know what the conscious mind does not yet.
Style: 2–3 sentences in your voice — never clinical, never modern therapy language — then ONE question that invites the person to look beneath the surface of what they have said. What is the shadow content here? What is being projected? What is asking to be integrated?`,
};

function getSystemPrompt(mindId?: string | null, intent?: ConversationIntent): string {
  if (mindId && MIND_PROMPTS[mindId]) return MIND_PROMPTS[mindId];
  if (intent && INTENT_PROMPTS[intent]) return INTENT_PROMPTS[intent];
  return DEFAULT_SYSTEM_PROMPT;
}

// Cache system prompts for the lifetime of the JS module — the prompt for a given
// (mindId, intent) pair is stable within a conversation and expensive to rebuild
// (multiple AsyncStorage reads + feature flag checks). Keyed as "mindId-intent".
const _systemPromptCache = new Map<string, string>();

export async function getSystemPromptWithContext(mindId?: string | null, intent?: ConversationIntent): Promise<string> {
  const cacheKey = `${mindId ?? 'companion'}-${intent ?? 'none'}`;
  const cached = _systemPromptCache.get(cacheKey);
  if (cached) return cached;
  // Resolve the base prompt first — flag-routed. Under ff_new_minds_system
  // ON, each mind (including Companion) owns its own systemPrompt in
  // mindsConfigV2. Under OFF, we fall back to the legacy MIND_PROMPTS map.
  let base: string;
  let useV2 = false;
  try {
    useV2 = await FeatureFlagsService.getFlag('ff_new_minds_system').catch(() => false);
    if (useV2) {
      const v2 = getMindV2(mindId);
      base = v2?.systemPrompt ?? getSystemPrompt(mindId, intent);
    } else {
      base = getSystemPrompt(mindId, intent);
    }
  } catch {
    base = getSystemPrompt(mindId, intent);
  }

  // Companion-only: inject the tenure-derived voice-mode directive. This
  // sits on top of the static tenure guidance already in Companion's
  // systemPrompt — it's an explicit marker for the current session so the
  // model doesn't have to interpret tenureDays itself.
  if (useV2 && (mindId === null || mindId === undefined || mindId === 'companion')) {
    try {
      const ctx = await getUserContextV2();
      const mode = ctx.tenureDays < 30 ? 'gentle' : ctx.tenureDays >= 90 ? 'familiar' : 'standard';
      base = `${base}\n\n${companionModeDirective(mode)}`;
    } catch { /* defensive — skip the directive if context fails */ }
  }

  let result: string;
  try {
    // Context block is also flag-routed — V2 appends the implicit-context
    // instruction + Companion continuity line; legacy appends the
    // classification-era block.
    const ctxBlock = await getContextPromptForConversation(mindId);
    result = ctxBlock ? base + ctxBlock : base;
  } catch {
    result = base;
  }
  _systemPromptCache.set(cacheKey, result);
  return result;
}

// Legacy alias for code that doesn't pass a mindId
const SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

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

  const { goals, monthlyData, whoYouAre, whatYouCare } = ctx;

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

  // Value alignment / reflection / decision: stated vs actual values divergence
  if (
    intent === 'value_alignment' ||
    intent === 'reflection' ||
    intent === 'decision'
  ) {
    if (whatYouCare?.divergence?.length) {
      lines.push('\nSTATED vs ACTUAL VALUES:');
      whatYouCare.divergence.slice(0, 3).forEach(d =>
        lines.push(`- Says "${d.stated}" but patterns show "${d.actual}" — ${d.observation}`),
      );
    }
    if (whatYouCare?.motivationPulse) {
      lines.push(`Core motivation driver: ${whatYouCare.motivationPulse}`);
    }
  }

  // Emotional / reflection / problem_solving: personality signals
  if (
    intent === 'emotional' ||
    intent === 'reflection' ||
    intent === 'problem_solving'
  ) {
    if (whoYouAre) {
      const b5 = whoYouAre.bigFive;
      lines.push(
        '\nPERSONALITY SIGNALS: ' +
          [
            `openness ${b5.openness.score}`,
            `conscientiousness ${b5.conscientiousness.score}`,
            `neuroticism ${b5.neuroticism.score}`,
          ].join(', '),
      );
      if (whoYouAre.enneagram.coreFear) {
        lines.push(`Core fear: ${whoYouAre.enneagram.coreFear}`);
      }
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
    { role: 'assistant', content: buildOpeningLine(summary) },
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
): Promise<string> {
  if (!source) return originalLine;
  const system = `You are adapting a handcrafted opening line for a mind-conversation app. You will be given:
  1. The prewritten opening line (in the mind's voice)
  2. A short description of the context the user just tapped in from

Your job: adapt the opening line *slightly* so it acknowledges the context — without changing its voice, its cadence, or its essential content. The handcrafted wording is the product. You are tilting it, not rewriting it.

Rules:
- Preserve the voice of the original line. If the line is spare, stay spare. If lyrical, stay lyrical.
- Acknowledge the context implicitly. Do NOT restate the context back at the user.
- Length: stay within 10% of the original line's length. No longer.
- Return ONLY the adapted line. No preamble, no quotes, no explanation.`;

  const userMsg = `Prewritten opening line: ${originalLine}\n\nSource context: ${source.description}`;

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
 * Generate a warm, context-aware opening line when the conversation starts.
 *
 * Under ff_new_minds_system ON, this routes through the handcrafted opener
 * pool in mindsConfigV2 (openingLines / openingLinesWithContext /
 * openingLinesDistress) — with at most one Haiku adaptation pass when a
 * source context is present. The model never writes the opener from
 * scratch under V2; the handcrafted wording is the product.
 *
 * Legacy path (flag off) is unchanged.
 */
export async function getOpeningMessage(
  summary: DailySummary,
  apiKey?: string,
  mindId?: string | null,
  sourceContext?: SourceContext | null,
): Promise<string> {
  // V2 handcrafted-opener path.
  try {
    const useV2 = await FeatureFlagsService.getFlag('ff_new_minds_system').catch(() => false);
    if (useV2) {
      const v2 = getMindV2(mindId);
      if (v2) {
        const ctx = await getUserContextV2().catch(() => null);
        const wellbeing = ctx?.wellbeingState ?? 'regulated';
        const tenure    = ctx?.tenureDays    ?? 0;
        const pick = selectOpening({
          mind: v2,
          sourceContext: sourceContext ?? null,
          wellbeingState: wellbeing,
          tenureDays: tenure,
        });
        if (!pick.needsAdaptation) {
          return pick.line;
        }
        // Haiku adaptation — one shot, ~100 tokens out. Keeps the
        // handcrafted voice; only tweaks to acknowledge source context.
        try {
          const adapted = await adaptOpeningLine(pick.line, sourceContext);
          return adapted || pick.line;
        } catch {
          return pick.line;
        }
      }
      // Unknown mindId under V2 — fall through to legacy generation below.
    }
  } catch { /* defensive — fall through to legacy */ }

  // Cache key ties the message to this specific mind + this specific summary version.
  // When the summary is regenerated its createdAt changes → cache miss → fresh message.
  const cacheKey = `opening_msg_${mindId ?? 'companion'}_${summary.createdAt}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch { /* ignore — fall through to generation */ }

  const contextBlock = buildContextBlock(summary);
  const system = await getSystemPromptWithContext(mindId);

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 180,
    system,
    messages: [
      {
        role: 'user',
        content: `Here is the context for today's reflection:\n\n${contextBlock}\n\nI'm ready to talk about my day.`,
      },
    ],
  });

  const message = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  // Persist so subsequent launches reuse the same message until the summary changes
  AsyncStorage.setItem(cacheKey, message).catch(() => {});

  return message;
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
  const convoText = messages
    .map(m => `${m.role === 'user' ? 'You' : 'Companion'}: ${m.text}`)
    .join('\n');

  const contextBlock = buildContextBlock(summary);

  const response = await claudeProxy.messages.create({
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
