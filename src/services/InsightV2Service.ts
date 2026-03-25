import Anthropic from '@anthropic-ai/sdk';
import { StorageService } from './StorageService';
import {
  WhoYouAreAnalysis, WhatYouCareAboutAnalysis,
  HowYouThinkAnalysis, YourStoryAnalysis, ArcType,
} from '../types';

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';
const SENTINEL = '===JSON===';

// Cache TTLs
const TTL_WHO   = 48 * 3_600_000;  // 48h
const TTL_VALUES = 24 * 3_600_000; // 24h
const TTL_THINK  = 7 * 86_400_000; // 7 days
const TTL_STORY  = 7 * 86_400_000; // 7 days

// ── JSON extraction ────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const idx = raw.indexOf(SENTINEL);
  let c = (idx !== -1 ? raw.slice(idx + SENTINEL.length) : raw).trim();
  c = c.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) c = c.slice(s, e + 1);
  return c;
}

// ── Build journal context ───────────────────────────────────────────────────

async function buildContext(days: number): Promise<{ text: string; dates: string[] }> {
  const allDates = await StorageService.getSummaryDates();
  const recent = allDates.slice(0, days);
  const summaries = await StorageService.getSummariesForDateRange(recent);
  if (summaries.length < 3) throw new Error(NOT_ENOUGH_DATA);
  const text = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');
  return { text, dates: summaries.map(s => s.date) };
}

async function buildLongContext(): Promise<{ text: string; dates: string[] }> {
  const allDates = await StorageService.getSummaryDates();
  const summaries = await StorageService.getSummariesForDateRange(allDates);
  if (summaries.length < 3) throw new Error(NOT_ENOUGH_DATA);
  const text = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');
  return { text, dates: summaries.map(s => s.date) };
}

async function callClaude(system: string, user: string, apiKey: string, maxTokens = 1200): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('').trim();
}

// ── Tab 1: Who You Are ─────────────────────────────────────────────────────────

const WHO_SYSTEM = `You are an insightful psychologist and writer. You have read someone's private journal entries.

Your task: write a 3–4 sentence character portrait that synthesizes Big Five and Enneagram. Write in FIRST PERSON as the journal writer ("I", "my", "me") — as if the insight is the person's own realisation about themselves. It should read like the opening of a character study — specific, observational, not generic.

Then output EXACTLY this line by itself:
===JSON===
Then output ONLY raw JSON — no markdown, no code fences, no backticks, no trailing commas:
{
  "narrative": "3–4 sentence portrait in first person — e.g. 'I show up as someone who...'",
  "bigFive": {
    "openness":          { "score": 72, "direction": "stable" },
    "conscientiousness": { "score": 58, "direction": "rising" },
    "extraversion":      { "score": 45, "direction": "falling" },
    "agreeableness":     { "score": 68, "direction": "stable" },
    "neuroticism":       { "score": 61, "direction": "rising" }
  },
  "bigFiveNarratives": {
    "openness":          "First person — e.g. 'My curiosity runs wide but...'",
    "conscientiousness": "First person observation about the writer's relationship with order/follow-through",
    "extraversion":      "First person — how I draw energy",
    "agreeableness":     "First person — how I relate to people",
    "neuroticism":       "First person — honest, not clinical, about emotional variability"
  },
  "enneagram": {
    "types": [4, 5],
    "typeSummaries": {
      "4": "How Type 4 might manifest for me specifically",
      "5": "How Type 5 might manifest for me specifically"
    },
    "coreFear": "First person — e.g. 'My core fear seems to be...'",
    "coreDesire": "First person — stated tentatively",
    "growthDirection": "First person — where my entries suggest I am being pulled"
  },
  "sourceEntries": ["YYYY-MM-DD"]
}

Rules:
- Big Five scores: 0=opposite pole, 100=high trait
- Direction: compare recent vs earlier entries — "rising", "stable", "falling"
- Enneagram: hypothesis only — 1 or 2 types, never more
- narratives must be observations, not textbook definitions
- sourceEntries: list the 3–6 most relevant entry dates
- No markdown. No code fences. Valid JSON only.`;

export async function generateWhoYouAre(forceRefresh = false): Promise<WhoYouAreAnalysis> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) throw new Error('Anthropic API key not configured.');
  if (!forceRefresh) {
    const cached = await StorageService.getWhoYouAre();
    if (cached && Date.now() - cached.generatedAt < TTL_WHO) return cached;
  }
  const { text, dates } = await buildContext(30);
  const raw = await callClaude(
    WHO_SYSTEM,
    `Here are my journal entries:\n\n${text}\n\nPlease write my character portrait.`,
    settings.anthropicApiKey,
    1400,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (Who You Are). Raw: ${raw.slice(0, 200)}`); }

  const result: WhoYouAreAnalysis = {
    generatedAt: Date.now(),
    narrative: parsed.narrative ?? '',
    bigFive: parsed.bigFive ?? {},
    bigFiveNarratives: parsed.bigFiveNarratives ?? {},
    enneagram: parsed.enneagram ?? { types: [], typeSummaries: {}, coreFear: '', coreDesire: '', growthDirection: '' },
    sourceEntries: parsed.sourceEntries ?? dates.slice(0, 6),
  };
  await StorageService.saveWhoYouAre(result);
  return result;
}

// ── Tab 2: What You Care About ─────────────────────────────────────────────────

const VALUES_SYSTEM = `You are a perceptive analyst reading someone's private journal entries.

Your task: map what the writer actually cares about — not what they say they care about, but what their attention, language, and emotional charge reveal. Write all text in FIRST PERSON ("I", "my", "me") as if the insight is the person's own realisation.

Output a framing sentence, then ===JSON===, then only raw JSON:
{
  "values": [
    {
      "topic": "short topic label (2–4 words max)",
      "frequency": 75,
      "intensity": 90,
      "valence": "positive"
    }
  ],
  "divergence": [
    {
      "stated": "what I say I want",
      "actual": "what I actually live",
      "observation": "First person: 'I write about X as something I want. I write about Y as something I'm actually living.' This is the most important insight. Make it specific and pointed."
    }
  ],
  "motivationPulse": "meaning",
  "motivationRationale": "First person, one sentence — e.g. 'My language keeps circling questions of...'",
  "sourceEntries": ["YYYY-MM-DD"]
}

Rules:
- values: 6–10 topics max. frequency and intensity are 0–100.
- valence: "positive", "neutral", "negative", or "mixed"
- divergence: 0–2 flags. Only include when the gap is genuinely visible. Leave array empty if not present.
- motivationPulse: MUST be exactly one of: "achievement", "connection", "meaning", "safety"
- No markdown. No code fences. Valid JSON only.`;

export async function generateWhatYouCare(forceRefresh = false): Promise<WhatYouCareAboutAnalysis> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) throw new Error('Anthropic API key not configured.');
  if (!forceRefresh) {
    const cached = await StorageService.getWhatYouCare();
    if (cached && Date.now() - cached.generatedAt < TTL_VALUES) return cached;
  }
  const { text, dates } = await buildContext(30);
  const raw = await callClaude(
    VALUES_SYSTEM,
    `Here are my journal entries:\n\n${text}\n\nPlease map what I actually care about.`,
    settings.anthropicApiKey,
    1100,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (Values). Raw: ${raw.slice(0, 200)}`); }

  const result: WhatYouCareAboutAnalysis = {
    generatedAt: Date.now(),
    values: parsed.values ?? [],
    divergence: parsed.divergence ?? [],
    motivationPulse: parsed.motivationPulse ?? 'meaning',
    motivationRationale: parsed.motivationRationale ?? '',
    sourceEntries: parsed.sourceEntries ?? dates.slice(0, 6),
  };
  await StorageService.saveWhatYouCare(result);
  return result;
}

// ── Tab 3: How You Think ────────────────────────────────────────────────────────

const THINK_SYSTEM = `You are a cognitive analyst reading someone's private journal entries. You are mapping how the writer thinks, not what they think about. Write all observations in FIRST PERSON ("I", "my") as if the writer is seeing this about themselves.

Four dimensions to assess. Each is a spectrum — score 0=fully left pole, 100=fully right pole.

Output a framing sentence, then ===JSON===, then only raw JSON:
{
  "dimensions": [
    {
      "name": "Systems vs. Stories",
      "leftLabel": "Systems",
      "rightLabel": "Stories",
      "score": 35,
      "observation": "First person, one sentence — e.g. 'I reach for frameworks first...' — specific to what you saw in the entries, not a generic definition.",
      "sourceEntries": ["YYYY-MM-DD"]
    },
    {
      "name": "Zoomed In vs. Zoomed Out",
      "leftLabel": "Zoomed In",
      "rightLabel": "Zoomed Out",
      "score": 72,
      "observation": "One sentence — specific to this person",
      "sourceEntries": ["YYYY-MM-DD"]
    },
    {
      "name": "Resolves vs. Sits With",
      "leftLabel": "Resolves",
      "rightLabel": "Sits With",
      "score": 68,
      "observation": "One sentence — specific to this person",
      "sourceEntries": ["YYYY-MM-DD"]
    },
    {
      "name": "Internal vs. External Reference",
      "leftLabel": "Internal",
      "rightLabel": "External",
      "score": 28,
      "observation": "One sentence — specific to this person",
      "sourceEntries": ["YYYY-MM-DD"]
    }
  ]
}

Dimension meanings:
- Systems vs Stories: do they explain through structure/frameworks (left) or narrative/metaphor (right)?
- Zoomed In vs Out: detail-focused (left) or altitude/big-picture (right)?
- Resolves vs Sits With: closes loops, seeks answers (left) or stays in questions, tolerates ambiguity (right)?
- Internal vs External: trusts own read, self-referential (left) or looks for external signals, others' opinions (right)?

Rules:
- observations must be specific to THIS person's entries, not generic definitions of the pole
- include 1–3 sourceEntries per dimension (the entries that most clearly showed this)
- No markdown. No code fences. Valid JSON only.`;

export async function generateHowYouThink(forceRefresh = false): Promise<HowYouThinkAnalysis> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) throw new Error('Anthropic API key not configured.');
  if (!forceRefresh) {
    const cached = await StorageService.getHowYouThink();
    if (cached && Date.now() - cached.generatedAt < TTL_THINK) return cached;
  }
  const { text, dates } = await buildContext(30);
  const raw = await callClaude(
    THINK_SYSTEM,
    `Here are my journal entries:\n\n${text}\n\nPlease map how I think.`,
    settings.anthropicApiKey,
    1000,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (How You Think). Raw: ${raw.slice(0, 200)}`); }

  const result: HowYouThinkAnalysis = {
    generatedAt: Date.now(),
    dimensions: parsed.dimensions ?? [],
  };
  await StorageService.saveHowYouThink(result);
  return result;
}

// ── Tab 4: Your Story ───────────────────────────────────────────────────────────

const STORY_SYSTEM = `You are a narrative analyst reading someone's private journal entries across time.

Your task: identify the story arc of the writer's life right now. Write everything in FIRST PERSON ("I", "my", "me") — as if the writer is narrating their own life. The chapter narrative especially should feel like the opening of a memoir, not a third-person analysis.

Output a framing sentence, then ===JSON===, then only raw JSON:
{
  "currentChapter": {
    "title": "2–3 word chapter title — evocative, like a book chapter name. e.g. 'The Clearing', 'Building the Frame', 'After the Storm'",
    "dateRange": "Month Year – present, or Month–Month Year",
    "narrative": "2–3 sentences in FIRST PERSON, present tense — like the opening of a memoir. e.g. 'Something has been set down. Not resolved — set down...'"
  },
  "recurringCast": [
    {
      "archetype": "First person — e.g. 'A relationship where I hold back' or 'A version of myself I am grieving' or 'A project that carries more weight than it should'",
      "frequency": 7
    }
  ],
  "arcPattern": {
    "type": "Seeker",
    "description": "First person, 2–3 sentences — e.g. 'I make meaning through inquiry. I am at home in questions...'"
  },
  "sourceEntries": ["YYYY-MM-DD"]
}

Arc types (pick exactly one):
- Seeker: makes meaning through inquiry, at home in questions, journey is toward better questions not answers
- Builder: makes meaning through creation and accumulation, measures progress through what is constructed
- Witness: makes meaning through presence and observation, value is in seeing clearly, not necessarily changing
- Transformer: makes meaning through change and shedding, identity is defined by what has been left behind
- Returner: makes meaning through cycles and return, wisdom lives in what keeps coming back

Rules:
- currentChapter narrative: write it, don't describe it. Present tense. Like a novel.
- recurringCast: 2–4 figures max. Unnamed. Archetype descriptions should be specific and slightly uncomfortable — real, not flattering.
- arcPattern: must be exactly one of the 5 types above
- sourceEntries: 3–6 most relevant dates
- No markdown. No code fences. Valid JSON only.`;

export async function generateYourStory(forceRefresh = false): Promise<YourStoryAnalysis> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) throw new Error('Anthropic API key not configured.');
  if (!forceRefresh) {
    const cached = await StorageService.getYourStory();
    if (cached && Date.now() - cached.generatedAt < TTL_STORY) return cached;
  }
  const { text, dates } = await buildLongContext();
  const arcHistory = await StorageService.getArcHistory();

  const raw = await callClaude(
    STORY_SYSTEM,
    `Here are my journal entries:\n\n${text}\n\nPlease write my story.`,
    settings.anthropicApiKey,
    1200,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (Your Story). Raw: ${raw.slice(0, 200)}`); }

  // Maintain arc history — append if type changed
  const newType = parsed.arcPattern?.type as ArcType;
  const lastArc = arcHistory[arcHistory.length - 1];
  const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (!lastArc || lastArc.type !== newType) {
    if (lastArc) lastArc.dateRange = lastArc.dateRange.replace(/–.*/, `– ${today}`);
    arcHistory.push({ type: newType, dateRange: `${today} – present` });
    await StorageService.saveArcHistory(arcHistory.slice(-6)); // keep last 6
  }

  const result: YourStoryAnalysis = {
    generatedAt: Date.now(),
    currentChapter: parsed.currentChapter ?? { title: '', dateRange: '', narrative: '' },
    recurringCast: parsed.recurringCast ?? [],
    arcPattern: {
      type: newType ?? 'Seeker',
      description: parsed.arcPattern?.description ?? '',
      history: arcHistory,
    },
    sourceEntries: parsed.sourceEntries ?? dates.slice(0, 6),
  };
  await StorageService.saveYourStory(result);
  return result;
}
