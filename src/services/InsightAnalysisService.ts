import { claudeProxy } from './AIProxy';
import {
  EmotionAnalysis, EmotionEntry,
  ThoughtPatternAnalysis,
  PersonalityAnalysis,
  GrowthTipsAnalysis,
} from '../types';
import { StorageService } from './StorageService';

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';

const SENTINEL = '===JSON===';
const CACHE_24H  = 86_400_000;
const CACHE_7D   = 604_800_000;
const MIN_SUMMARIES = 3;

// Fixed emotion → colour palette (never delegated to Claude)
const EMOTION_COLORS: Record<string, string> = {
  joy:         'rgba(110, 231, 183, 0.90)',
  happiness:   'rgba(110, 231, 183, 0.90)',
  excitement:  'rgba(110, 231, 183, 0.80)',
  gratitude:   'rgba(110, 231, 183, 0.70)',
  calm:        'rgba(152, 212, 250, 0.85)',
  peace:       'rgba(152, 212, 250, 0.75)',
  contentment: 'rgba(152, 212, 250, 0.70)',
  anxiety:     'rgba(196, 181, 253, 0.90)',
  stress:      'rgba(196, 181, 253, 0.85)',
  worry:       'rgba(196, 181, 253, 0.75)',
  fear:        'rgba(196, 181, 253, 0.70)',
  sadness:     'rgba(147, 197, 253, 0.80)',
  loneliness:  'rgba(147, 197, 253, 0.70)',
  frustration: 'rgba(251, 191,  36, 0.90)',
  anger:       'rgba(252, 165, 165, 0.90)',
  irritation:  'rgba(252, 165, 165, 0.75)',
  overwhelm:   'rgba(251, 191,  36, 0.80)',
};
const DEFAULT_EMOTION_COLOR = 'rgba(152, 212, 250, 0.60)';

function emotionColor(name: string): string {
  return EMOTION_COLORS[name.toLowerCase()] ?? DEFAULT_EMOTION_COLOR;
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildContext(windowDays: number): Promise<{
  contextText: string;
  dates: string[];
  windowDays: number;
}> {
  const allDates = await StorageService.getSummaryDates();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const filtered = allDates.filter(d => d >= cutoffStr);
  const summaries = await StorageService.getSummariesForDateRange(filtered);

  if (summaries.length < MIN_SUMMARIES) throw new Error(NOT_ENOUGH_DATA);

  const contextText = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');

  return { contextText, dates: summaries.map(s => s.date), windowDays };
}


function extractJson(raw: string): string {
  // Grab everything after the sentinel (or use the full string as fallback)
  const idx = raw.indexOf(SENTINEL);
  let candidate = (idx !== -1 ? raw.slice(idx + SENTINEL.length) : raw).trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // Extract the outermost JSON object { ... } to discard any trailing prose
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  return candidate;
}

// ── 1. Emotion Analysis ───────────────────────────────────────────────────────

const EMOTION_SYSTEM = `You are an empathetic journal analyst helping a person understand the emotions behind their thoughts.
Analyse the journal entries and detect recurring emotions the person has experienced.

Output a 2-3 sentence narrative paragraph, then output EXACTLY this line by itself:
===JSON===
Then output ONLY a raw JSON object — no markdown, no code fences, no backticks, no extra text:
{
  "narrative": "<2-3 sentence warm, personal summary>",
  "emotions": [
    { "name": "<single emotion word, lowercase>", "intensity": "<low|medium|high>", "dates": ["YYYY-MM-DD",...] }
  ]
}

Rules:
- Detect 5-10 distinct emotions. Use single emotion words: joy, anxiety, frustration, excitement, calm, sadness, gratitude, overwhelm, etc.
- Intensity: high = appears frequently or described strongly, medium = moderate, low = fleeting mentions
- dates: list every date that emotion was observed in the entries
- Sort emotions by number of dates descending
- Narrative: warm, second-person ("You've been..."), specific to what's in the entries
- No generic platitudes
- The JSON must be valid. No trailing commas. No code fences.`;

export async function generateEmotionAnalysis(
  windowDays: 30 | 90 | 180 = 30,
  forceRefresh = false,
): Promise<EmotionAnalysis> {
  const settings = await StorageService.getSettings();

  const tag = `${windowDays}d`;

  if (!forceRefresh) {
    const cached = await StorageService.getEmotionAnalysis(tag);
    if (cached && Date.now() - cached.generatedAt < CACHE_24H) return cached;
  }

  const { contextText, windowDays: actualDays } = await buildContext(windowDays);

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    system: EMOTION_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here are my journal entries from the last ${windowDays} days:\n\n${contextText}\n\nAnalyse the emotions present across these entries.`,
    }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  const jsonStr = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Could not parse emotions response. Raw: ${jsonStr.slice(0, 200)}`);
  }

  const emotions: EmotionEntry[] = (parsed.emotions ?? []).map((e: any) => ({
    name: e.name,
    intensity: e.intensity,
    occurrences: (e.dates ?? []).length,
    dates: e.dates ?? [],
    color: emotionColor(e.name),
  }));

  const analysis: EmotionAnalysis = {
    generatedAt: Date.now(),
    windowDays: actualDays,
    emotions,
    narrative: parsed.narrative ?? raw.split(SENTINEL)[0].trim(),
  };

  await StorageService.saveEmotionAnalysis(analysis, tag);
  return analysis;
}

// ── 2. Thought Pattern Analysis ───────────────────────────────────────────────

const PATTERN_SYSTEM = `You are a thoughtful journal analyst helping a person discover their top thought patterns.
Analyse the journal entries and identify the most significant recurring themes and topics.

Output a 2-3 sentence narrative paragraph, then output EXACTLY this line by itself:
===JSON===
Then output ONLY a raw JSON object — no markdown, no code fences, no backticks, no extra text:
{
  "narrative": "<2-3 sentence summary>",
  "themes": [
    {
      "theme": "<short 2-4 word label>",
      "frequency": <number of days this appeared>,
      "trend": "<rising|stable|falling>",
      "dates": ["YYYY-MM-DD",...],
      "excerpt": "<one short, specific quote or paraphrase from the entries>"
    }
  ]
}

Rules:
- Identify 6-8 distinct themes. Be specific: "Work deadline pressure" not just "Work"
- trend: compare how often the theme appears in the first half vs second half of the date range. rising = more recent, falling = more past, stable = evenly distributed
- excerpt: a direct, specific phrase or observation from the entries — not a generic description
- Sort by frequency descending
- Narrative: warm, second-person, specific to their patterns
- The JSON must be valid. No trailing commas. No comments.`;

export async function generateThoughtPatternAnalysis(
  windowDays: 30 | 90 | 180 = 30,
  forceRefresh = false,
): Promise<ThoughtPatternAnalysis> {
  const settings = await StorageService.getSettings();

  const tag = `${windowDays}d`;

  if (!forceRefresh) {
    const cached = await StorageService.getThoughtPatternAnalysis(tag);
    if (cached && Date.now() - cached.generatedAt < CACHE_24H) return cached;
  }

  const { contextText, windowDays: actualDays } = await buildContext(windowDays);

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 900,
    system: PATTERN_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here are my journal entries from the last ${windowDays} days:\n\n${contextText}\n\nIdentify my top recurring thought patterns and themes.`,
    }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  const jsonStr = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Could not parse thought patterns response. Raw: ${jsonStr.slice(0, 200)}`);
  }

  const analysis: ThoughtPatternAnalysis = {
    generatedAt: Date.now(),
    windowDays: actualDays,
    themes: parsed.themes ?? [],
    narrative: parsed.narrative ?? '',
  };

  await StorageService.saveThoughtPatternAnalysis(analysis, tag);
  return analysis;
}

// ── 3. Personality Analysis ───────────────────────────────────────────────────

const PERSONALITY_SYSTEM = `You are a thoughtful personality analyst using the Big Five personality model.
Analyse the full journal history to build a personality portrait. Base scores on observable patterns in how the person thinks, relates, and engages with the world — not clinical assessment.

Output a 3-4 sentence narrative paragraph, then output EXACTLY this line by itself:
===JSON===
Then output ONLY a raw JSON object — no markdown, no code fences, no backticks, no extra text:
{
  "narrative": "<3-4 sentence overall portrait>",
  "scores": {
    "openness": <0-100>,
    "conscientiousness": <0-100>,
    "extraversion": <0-100>,
    "agreeableness": <0-100>,
    "neuroticism": <0-100>
  },
  "traitNarratives": {
    "openness": "<one sentence>",
    "conscientiousness": "<one sentence>",
    "extraversion": "<one sentence>",
    "agreeableness": "<one sentence>",
    "neuroticism": "<one sentence>"
  }
}

Trait scoring guidance (50 = neutral):
- Openness: curiosity, creativity, exploring new ideas, varied interests
- Conscientiousness: planning, self-discipline, goal-focus, follow-through
- Extraversion: social energy, seeking stimulation, enthusiasm, expressiveness
- Agreeableness: empathy, cooperation, care for others, conflict avoidance
- Neuroticism: emotional reactivity, worry, stress sensitivity, mood variability

Write in warm, second-person prose. Be specific — reference actual patterns from the journal.
This is a reflective portrait, not a clinical label.
The JSON must be valid. No trailing commas. No code fences.`;

export async function generatePersonalityAnalysis(forceRefresh = false): Promise<PersonalityAnalysis> {
  const settings = await StorageService.getSettings();

  if (!forceRefresh) {
    const cached = await StorageService.getPersonalityAnalysis();
    if (cached && Date.now() - cached.generatedAt < CACHE_7D) return cached;
  }

  // Use all available summaries for maximum accuracy
  const allDates = await StorageService.getSummaryDates();
  const summaries = await StorageService.getSummariesForDateRange(allDates);
  if (summaries.length < MIN_SUMMARIES) throw new Error(NOT_ENOUGH_DATA);

  const contextText = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');


  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    system: PERSONALITY_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here is my complete journal history (${summaries.length} days):\n\n${contextText}\n\nBuild my Big Five personality portrait from these entries.`,
    }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  const jsonStr = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Could not parse personality response. Raw: ${jsonStr.slice(0, 200)}`);
  }

  const analysis: PersonalityAnalysis = {
    generatedAt: Date.now(),
    windowDays: summaries.length,
    scores: parsed.scores,
    narrative: parsed.narrative ?? '',
    traitNarratives: parsed.traitNarratives ?? {},
  };

  await StorageService.savePersonalityAnalysis(analysis);
  return analysis;
}

// ── 4. Growth Tips ────────────────────────────────────────────────────────────

const GROWTH_TIPS_SYSTEM = `You are a personal growth coach who gives tailored, specific advice based on a person's journal patterns.
You will receive a summary of their emotional patterns, recurring thought themes, and personality traits.
Generate exactly 5 growth tips that are directly tied to what you observe — no generic advice.

Output a 2-sentence framing paragraph, then output EXACTLY this line by itself:
===JSON===
Then output ONLY a raw JSON object — no markdown, no code fences, no backticks, no extra text:
{
  "narrative": "<2-sentence intro tying tips to observed patterns>",
  "tips": [
    {
      "id": "tip_1",
      "title": "<short, specific headline — 5-8 words>",
      "body": "<2-3 sentences of concrete, actionable guidance tied to their specific patterns>",
      "category": "<emotion|habits|relationships|mindset|productivity>"
    }
  ]
}

Rules:
- Each tip must reference something specific observed in their data
- Tips must span at least 3 different categories
- Actionable: tell them exactly what to do, not just what to think about
- Warm, encouraging tone — like a coach who knows them well
- The JSON must be valid. No trailing commas. No code fences.`;

export async function generateGrowthTips(forceRefresh = false): Promise<GrowthTipsAnalysis> {
  const settings = await StorageService.getSettings();

  if (!forceRefresh) {
    const cached = await StorageService.getGrowthTipsAnalysis();
    if (cached && Date.now() - cached.generatedAt < CACHE_7D) return cached;
  }

  // Build context from cached analyses + recent summaries as fallback
  const contextParts: string[] = [];

  const emotions = await StorageService.getEmotionAnalysis('30d');
  if (emotions) {
    const top = emotions.emotions.slice(0, 5).map(e => `${e.name} (${e.intensity}, ${e.occurrences} days)`).join(', ');
    contextParts.push(`Dominant emotions (last 30 days): ${top}\n${emotions.narrative}`);
  }

  const patterns = await StorageService.getThoughtPatternAnalysis('30d');
  if (patterns) {
    const top = patterns.themes.slice(0, 5).map(t => `"${t.theme}" (${t.frequency} days, ${t.trend})`).join('; ');
    contextParts.push(`Top thought patterns: ${top}\n${patterns.narrative}`);
  }

  const personality = await StorageService.getPersonalityAnalysis();
  if (personality) {
    const { scores } = personality;
    contextParts.push(
      `Personality (Big Five): Openness ${scores.openness}, Conscientiousness ${scores.conscientiousness}, Extraversion ${scores.extraversion}, Agreeableness ${scores.agreeableness}, Neuroticism ${scores.neuroticism}\n${personality.narrative}`,
    );
  }

  // Fallback: use recent insightTexts directly if no cache
  if (contextParts.length === 0) {
    const allDates = await StorageService.getSummaryDates();
    const recent = allDates.slice(0, 14);
    const summaries = await StorageService.getSummariesForDateRange(recent);
    if (summaries.length < MIN_SUMMARIES) throw new Error(NOT_ENOUGH_DATA);
    contextParts.push(summaries.map(s => `[${s.date}]\n${s.insightText ?? s.summary}`).join('\n\n'));
  }


  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 900,
    system: GROWTH_TIPS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Here is a summary of my journal patterns:\n\n${contextParts.join('\n\n---\n\n')}\n\nGenerate 5 personalised growth tips based on these patterns.`,
    }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
  const jsonStr = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Could not parse growth tips response. Raw: ${jsonStr.slice(0, 200)}`);
  }

  const analysis: GrowthTipsAnalysis = {
    generatedAt: Date.now(),
    windowDays: 30,
    tips: parsed.tips ?? [],
    narrative: parsed.narrative ?? '',
  };

  await StorageService.saveGrowthTipsAnalysis(analysis);
  return analysis;
}
