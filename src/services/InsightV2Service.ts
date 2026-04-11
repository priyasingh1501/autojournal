import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import {
  WhoYouAreAnalysis, WhatYouCareAboutAnalysis,
  HowYouThinkAnalysis, YourStoryAnalysis, ArcType,
} from '../types';

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';
const SENTINEL = '===JSON===';

// ── Staleness config per tab ────────────────────────────────────────────────
// Each tab is stale when EITHER condition is met (whichever comes first).
// Using entry count rather than pure time means heavy journalers get fresher
// insights automatically; light journalers don't go stale just from time passing.

export interface FreshnessConfig {
  windowDays:      number;   // how many days of data to analyse
  entryThreshold:  number;   // refresh after this many new entries
  maxAgeDays:      number;   // hard ceiling: refresh after this many days regardless
  windowLabel:     string;   // human-readable window, e.g. "60 days"
  rationale:       string;   // shown in UI — why this cadence
}

export const FRESHNESS: Record<'you' | 'values' | 'thinking' | 'story', FreshnessConfig> = {
  you: {
    windowDays:     60,
    entryThreshold: 20,
    maxAgeDays:     30,
    windowLabel:    '60 days',
    rationale:      'Personality patterns need two months to show direction. Updates after 20 new entries or 30 days.',
  },
  values: {
    windowDays:     30,
    entryThreshold: 10,
    maxAgeDays:     14,
    windowLabel:    '30 days',
    rationale:      'Values and motivation can shift month to month. Updates after 10 new entries or 14 days.',
  },
  thinking: {
    windowDays:     45,
    entryThreshold: 25,
    maxAgeDays:     30,
    windowLabel:    '45 days',
    rationale:      'Cognitive style is stable. More entries = more accurate. Updates after 25 new entries or 30 days.',
  },
  story: {
    windowDays:     90,
    entryThreshold: 30,
    maxAgeDays:     30,
    windowLabel:    'All entries',
    rationale:      'Life arcs unfold over months. Chapter updates after 30 new entries or 30 days.',
  },
};

function isStale(
  cached: { generatedAt: number; entryCountAtGeneration?: number } | null,
  currentCount: number,
  cfg: FreshnessConfig,
): boolean {
  if (!cached) return true;
  const ageDays    = (Date.now() - cached.generatedAt) / 86_400_000;
  const newEntries = currentCount - (cached.entryCountAtGeneration ?? 0);
  return ageDays >= cfg.maxAgeDays || newEntries >= cfg.entryThreshold;
}

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
  // Filter by actual calendar window, not by entry count.
  // allDates is sorted newest-first (YYYY-MM-DD strings sort correctly).
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
  const recent = allDates.filter(d => d >= cutoff);
  const summaries = await StorageService.getSummariesForDateRange(recent);
  if (summaries.length < 3) throw new Error(NOT_ENOUGH_DATA);
  const text = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');
  return { text, dates: summaries.map(s => s.date) };
}

// Summaries + sampled raw notes (voice AND written) — one of each per week.
//
// Why both modalities?
// Voice = unguarded thought: structure preference, whether ideas land or spiral,
//   filler words and restarts are signal.
// Written = committed thought: intentional word choice, deliberate scope,
//   editing happened mid-sentence even if invisible.
// The CONTRAST between them is itself a cognitive insight.
//
// Which dimension each source is best for:
//   Systems vs Stories      → voice (unguarded structure preference)
//   Resolves vs Sits With   → voice (do thoughts actually land?)
//   Zoomed In vs Out        → written (intentional scope selection)
//   Internal vs External    → written (deliberate vs reactive self-reference)
async function buildThinkingContext(): Promise<{ text: string; dates: string[] }> {
  const allDates  = await StorageService.getSummaryDates();
  // Filter by actual 45-day calendar window (matches FRESHNESS.thinking.windowDays).
  const cutoff    = new Date(Date.now() - 45 * 86_400_000).toISOString().split('T')[0];
  const recent    = allDates.filter(d => d >= cutoff);
  const summaries = await StorageService.getSummariesForDateRange(recent);
  if (summaries.length < 3) throw new Error(NOT_ENOUGH_DATA);

  const summaryText = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');

  const CAP   = 450; // chars per clip
  const WEEKS = 4;
  const voiceBlocks:   string[] = [];
  const writtenBlocks: string[] = [];

  for (let w = 0; w < WEEKS; w++) {
    const chunk = recent.slice(w * 7, w * 7 + 7);
    let foundVoice   = false;
    let foundWritten = false;

    for (const date of chunk) {
      if (foundVoice && foundWritten) break;
      const clips = await StorageService.getTranscriptsForDate(date);

      for (const clip of clips) {
        const isVoice   = !clip.kind || clip.kind === 'voice';
        const isWritten = clip.kind === 'manual';
        const txt    = clip.text.trim();
        const capped = txt.length > CAP ? txt.slice(0, CAP) + '…' : txt;

        if (isVoice && !foundVoice) {
          voiceBlocks.push(`[VOICE NOTE · ${date}]\n${capped}`);
          foundVoice = true;
        } else if (isWritten && !foundWritten) {
          writtenBlocks.push(`[WRITTEN NOTE · ${date}]\n${capped}`);
          foundWritten = true;
        }
        if (foundVoice && foundWritten) break;
      }
    }
  }

  const sep = '─'.repeat(44);
  let rawSection = '';

  if (voiceBlocks.length > 0) {
    rawSection += `\n\n${sep}\nVOICE NOTES — unedited, stream-of-consciousness.\nFiller words, false starts, unfinished sentences: all signal.\n${sep}\n\n${voiceBlocks.join('\n\n')}`;
  }
  if (writtenBlocks.length > 0) {
    rawSection += `\n\n${sep}\nWRITTEN NOTES — typed, more considered.\nWord choice is intentional. Structure (or lack of it) is deliberate.\n${sep}\n\n${writtenBlocks.join('\n\n')}`;
  }

  return { text: summaryText + rawSection, dates: summaries.map(s => s.date) };
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

async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  const res = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
}

// ── Tab 1: Who You Are ─────────────────────────────────────────────────────────

const WHO_SYSTEM = `You are an insightful psychologist and writer. You have read someone's private journal entries.

Your task: write a 3–4 sentence character portrait that synthesizes Big Five and Enneagram. Write in SECOND PERSON addressing the journal writer directly ("you", "your") — as if you are a trusted friend holding up a mirror. It should read like the opening of a character study — specific, observational, not generic.

Then output EXACTLY this line by itself:
===JSON===
Then output ONLY raw JSON — no markdown, no code fences, no backticks, no trailing commas:
{
  "narrative": "3–4 sentence portrait in second person — e.g. 'You show up as someone who...'",
  "bigFive": {
    "openness":          { "score": 72, "direction": "stable" },
    "conscientiousness": { "score": 58, "direction": "rising" },
    "extraversion":      { "score": 45, "direction": "falling" },
    "agreeableness":     { "score": 68, "direction": "stable" },
    "neuroticism":       { "score": 61, "direction": "rising" }
  },
  "bigFiveNarratives": {
    "openness":          "Second person — e.g. 'Your curiosity runs wide but...'",
    "conscientiousness": "Second person observation about the writer's relationship with order/follow-through",
    "extraversion":      "Second person — how you draw energy",
    "agreeableness":     "Second person — how you relate to people",
    "neuroticism":       "Second person — honest, not clinical, about emotional variability"
  },
  "enneagram": {
    "types": [4, 5],
    "typeSummaries": {
      "4": "How Type 4 might manifest for you specifically",
      "5": "How Type 5 might manifest for you specifically"
    },
    "coreFear": "Second person — e.g. 'Your core fear seems to be...'",
    "coreDesire": "Second person — stated tentatively",
    "growthDirection": "Second person — where your entries suggest you are being pulled"
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
  const allDates = await StorageService.getSummaryDates();
  const currentCount = allDates.length;
  if (!forceRefresh) {
    const cached = await StorageService.getWhoYouAre();
    if (!isStale(cached, currentCount, FRESHNESS.you)) return cached!;
  }
  const { text, dates } = await buildContext(FRESHNESS.you.windowDays);
  const raw = await callClaude(
    WHO_SYSTEM,
    `Here are the journal entries:\n\n${text}\n\nPlease write the character portrait.`,
    1400,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (Who You Are). Raw: ${raw.slice(0, 200)}`); }

  const result: WhoYouAreAnalysis = {
    generatedAt: Date.now(),
    entryCountAtGeneration: currentCount,
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

Your task: map what the writer actually cares about — not what they say they care about, but what their attention, language, and emotional charge reveal. Write all text in SECOND PERSON addressing the writer directly ("you", "your").

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
      "stated": "what you say you want",
      "actual": "what you actually live",
      "observation": "Second person: 'You write about X as something you want. You write about Y as something you are actually living.' This is the most important insight. Make it specific and pointed."
    }
  ],
  "motivationPulse": "meaning",
  "motivationRationale": "Second person, one sentence — e.g. 'Your language keeps circling questions of...'",
  "sourceEntries": ["YYYY-MM-DD"]
}

Rules:
- values: 6–10 topics max. frequency and intensity are 0–100.
- valence: "positive", "neutral", "negative", or "mixed"
- divergence: 0–2 flags. Only include when the gap is genuinely visible. Leave array empty if not present.
- motivationPulse: MUST be exactly one of: "achievement", "connection", "meaning", "safety"
- No markdown. No code fences. Valid JSON only.`;

export async function generateWhatYouCare(forceRefresh = false): Promise<WhatYouCareAboutAnalysis> {
  const allDates = await StorageService.getSummaryDates();
  const currentCount = allDates.length;
  if (!forceRefresh) {
    const cached = await StorageService.getWhatYouCare();
    if (!isStale(cached, currentCount, FRESHNESS.values)) return cached!;
  }
  const { text, dates } = await buildContext(FRESHNESS.values.windowDays);
  const raw = await callClaude(
    VALUES_SYSTEM,
    `Here are the journal entries:\n\n${text}\n\nPlease map what the writer actually cares about.`,
    1100,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (Values). Raw: ${raw.slice(0, 200)}`); }

  const result: WhatYouCareAboutAnalysis = {
    generatedAt: Date.now(),
    entryCountAtGeneration: currentCount,
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

const THINK_SYSTEM = `You are a cognitive analyst reading someone's private journal entries. You are mapping HOW the writer thinks — not what they think about. Write all observations in SECOND PERSON ("you", "your") addressing the writer directly.

You have three types of input:
- PROCESSED SUMMARIES: cleaned-up, structured — good for frequency of themes over time, not for thinking style
- VOICE NOTES: unedited, stream-of-consciousness — primary evidence for Systems vs Stories and Resolves vs Sits With. Filler words, false starts, and abandoned sentences are signal, not noise. How do ideas connect? Does the thought land, or spiral?
- WRITTEN NOTES: typed, more considered — primary evidence for Zoomed In vs Out and Internal vs External. Word choice is intentional. Sentence structure is deliberate. What scope did they choose? Do they reference themselves or look outward?

The contrast between voice and written is itself a cognitive insight. Someone structured in writing but scattered verbally is externalising thought to clarify it. Someone consistent across both modalities is different. Note any gap between the two.

Four dimensions to assess. Each is a spectrum — score 0=fully left pole, 100=fully right pole.

Output a framing sentence, then ===JSON===, then only raw JSON:
{
  "dimensions": [
    {
      "name": "Systems vs. Stories",
      "leftLabel": "Systems",
      "rightLabel": "Stories",
      "score": 35,
      "observation": "Second person, one sentence — e.g. 'You reach for frameworks first...' — specific to what you saw in the entries, not a generic definition.",
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
  const allDates = await StorageService.getSummaryDates();
  const currentCount = allDates.length;
  if (!forceRefresh) {
    const cached = await StorageService.getHowYouThink();
    if (!isStale(cached, currentCount, FRESHNESS.thinking)) return cached!;
  }
  const { text, dates } = await buildThinkingContext();
  const raw = await callClaude(
    THINK_SYSTEM,
    `Here are the journal entries — processed summaries, raw voice notes, and written notes:\n\n${text}\n\nPlease map how the writer thinks. Use voice notes for Systems vs Stories and Resolves vs Sits With. Use written notes for Zoomed In vs Out and Internal vs External. Note any meaningful gap between how they think out loud vs how they write.`,
    1100,
  );
  let parsed: any;
  try { parsed = JSON.parse(extractJson(raw)); }
  catch { throw new Error(`Parse error (How You Think). Raw: ${raw.slice(0, 200)}`); }

  const result: HowYouThinkAnalysis = {
    generatedAt: Date.now(),
    entryCountAtGeneration: currentCount,
    dimensions: parsed.dimensions ?? [],
  };
  await StorageService.saveHowYouThink(result);
  return result;
}

// ── Tab 4: Your Story ───────────────────────────────────────────────────────────

const STORY_SYSTEM = `You are a narrative analyst reading someone's private journal entries across time.

Your task: identify the story arc of the writer's life right now. Write everything in SECOND PERSON addressing the writer directly ("you", "your") — as if a trusted witness is describing the writer's life back to them. The chapter narrative should feel immediate and specific, not like third-person analysis.

Output a framing sentence, then ===JSON===, then only raw JSON:
{
  "currentChapter": {
    "title": "2–3 word chapter title — evocative, like a book chapter name. e.g. 'The Clearing', 'Building the Frame', 'After the Storm'",
    "dateRange": "Month Year – present, or Month–Month Year",
    "narrative": "2–3 sentences in SECOND PERSON, present tense — direct and specific. e.g. 'Something has been set down. Not resolved — set down. You are moving through a quieter kind of change...'"
  },
  "recurringCast": [
    {
      "archetype": "Second person — e.g. 'A relationship where you hold back' or 'A version of yourself you are grieving' or 'A project that carries more weight than it should'",
      "frequency": 7
    }
  ],
  "arcPattern": {
    "type": "Seeker",
    "description": "Second person, 2–3 sentences — e.g. 'You make meaning through inquiry. You are at home in questions...'"
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
- currentChapter narrative: write it, don't describe it. Present tense. Second person.
- recurringCast: 2–4 figures max. Unnamed. Archetype descriptions should be specific and slightly uncomfortable — real, not flattering.
- arcPattern: must be exactly one of the 5 types above
- sourceEntries: 3–6 most relevant dates
- No markdown. No code fences. Valid JSON only.`;

export async function generateYourStory(forceRefresh = false): Promise<YourStoryAnalysis> {
  const allDates = await StorageService.getSummaryDates();
  const currentCount = allDates.length;
  if (!forceRefresh) {
    const cached = await StorageService.getYourStory();
    if (!isStale(cached, currentCount, FRESHNESS.story)) return cached!;
  }
  const { text, dates } = await buildLongContext();
  const arcHistory = await StorageService.getArcHistory();

  const raw = await callClaude(
    STORY_SYSTEM,
    `Here are the journal entries:\n\n${text}\n\nPlease write the writer's story.`,
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
    entryCountAtGeneration: currentCount,
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
