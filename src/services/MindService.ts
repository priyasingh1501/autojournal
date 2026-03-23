import Anthropic from '@anthropic-ai/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mind, MindPerspective } from '../types';
import { StorageService } from './StorageService';

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';
const CACHE_TTL = 86_400_000; // 24 hours per mind
const MIN_SUMMARIES = 2;
const SENTINEL = '===JSON===';

// ── Roster of minds ───────────────────────────────────────────────────────────

export const MINDS: Mind[] = [
  {
    id: 'krishna',
    name: 'Krishna',
    era: 'Bhagavad Gita · Ancient',
    philosophy: 'Nishkama karma — act fully, without attachment to the fruit',
    accent: 'rgba(167, 139, 250, 0.90)',
    symbol: '🪈',
  },
  {
    id: 'buddha',
    name: 'The Buddha',
    era: 'Siddhartha Gautama · c. 5th century BCE',
    philosophy: 'The Middle Path — suffering, impermanence, and liberation',
    accent: 'rgba(110, 231, 183, 0.90)',
    symbol: '☸️',
  },
  {
    id: 'jiddu_krishnamurti',
    name: 'J. Krishnamurti',
    era: 'Indian Philosopher · 1895–1986',
    philosophy: 'Freedom from the known — thought, conditioning, choiceless awareness',
    accent: 'rgba(147, 197, 253, 0.90)',
    symbol: '👁',
  },
  {
    id: 'naval_ravikant',
    name: 'Naval Ravikant',
    era: 'Entrepreneur & Philosopher · Contemporary',
    philosophy: 'Wealth, freedom, and the specific knowledge that sets you apart',
    accent: 'rgba(94, 234, 212, 0.90)',
    symbol: '🧭',
  },
  {
    id: 'carl_jung',
    name: 'Carl Jung',
    era: 'Swiss Psychiatrist · 1875–1961',
    philosophy: 'Depth psychology — shadow, archetypes, individuation',
    accent: 'rgba(196, 181, 253, 0.90)',
    symbol: '🔮',
  },
  {
    id: 'osho',
    name: 'Osho',
    era: 'Mystic & Teacher · 1931–1990',
    philosophy: 'Meditation, rebellion, and the celebration of being alive',
    accent: 'rgba(244, 114, 182, 0.90)',
    symbol: '🌀',
  },
  {
    id: 'acharya_prashant',
    name: 'Acharya Prashant',
    era: 'Vedantic Teacher · Contemporary',
    philosophy: 'Vedanta & ego — seeing through conditioning to what is real',
    accent: 'rgba(251, 146, 60, 0.90)',
    symbol: '🔥',
  },
  {
    id: 'adi_shankaracharya',
    name: 'Adi Shankaracharya',
    era: 'Advaita Vedanta · 8th century CE',
    philosophy: 'Advaita — you are not the body-mind, you are pure consciousness',
    accent: 'rgba(251, 191, 36, 0.90)',
    symbol: '🕉',
  },
];

// ── Storage ───────────────────────────────────────────────────────────────────

function cacheKey(mindId: string) {
  return `mind_perspective_${mindId}`;
}

async function getCached(mindId: string): Promise<MindPerspective | null> {
  const json = await AsyncStorage.getItem(cacheKey(mindId));
  return json ? JSON.parse(json) : null;
}

async function setCached(p: MindPerspective): Promise<void> {
  await AsyncStorage.setItem(cacheKey(p.mindId), JSON.stringify(p));
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildSystemPrompt(mind: Mind): string {
  return `You are ${mind.name} (${mind.era}).
Your philosophy: ${mind.philosophy}.

You are reading someone's private journal entries. Your task is to find 2-4 specific passages that catch your attention — moments that resonate with themes from your life and thought, contradictions you would gently question, or insights you would want to illuminate.

Output a 1-2 sentence framing statement in your authentic voice (not modern self-help language), then output EXACTLY this line by itself:
===JSON===
Then output ONLY a raw JSON object — no markdown, no code fences, no backticks, no extra text:
{
  "framing": "<1-2 sentences in your voice — why you find these entries interesting>",
  "highlights": [
    {
      "passage": "<exact quote or close paraphrase from the entry — keep it short, under 40 words>",
      "comment": "<your perspective on this passage, in your authentic voice, 2-3 sentences>",
      "date": "<YYYY-MM-DD of the entry this came from>"
    }
  ]
}

Rules:
- Write entirely in ${mind.name}'s authentic voice — use their characteristic style, concepts, and references
- Do not use modern self-help language or clichés
- The passage must be something actually present in the entries — do not invent quotes
- Your comments should be genuinely insightful, not flattering or generic
- The JSON must be valid. No trailing commas. No code fences.`;
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const idx = raw.indexOf(SENTINEL);
  let candidate = (idx !== -1 ? raw.slice(idx + SENTINEL.length) : raw).trim();
  candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) candidate = candidate.slice(start, end + 1);
  return candidate;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateMindPerspective(
  mindId: string,
  forceRefresh = false,
): Promise<MindPerspective> {
  const mind = MINDS.find(m => m.id === mindId);
  if (!mind) throw new Error(`Unknown mind: ${mindId}`);

  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) throw new Error('Anthropic API key not configured. Go to Settings.');

  if (!forceRefresh) {
    const cached = await getCached(mindId);
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL) return cached;
  }

  // Gather last 14 days of summaries
  const allDates = await StorageService.getSummaryDates();
  const recent   = allDates.slice(0, 14);
  const summaries = await StorageService.getSummariesForDateRange(recent);
  if (summaries.length < MIN_SUMMARIES) throw new Error(NOT_ENOUGH_DATA);

  // Use insightText when available (denser), fall back to summary
  const contextText = summaries
    .map(s => `[${s.date}]\n${s.insightText ?? s.summary}`)
    .join('\n\n');

  const client = new Anthropic({ apiKey: settings.anthropicApiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 900,
    system: buildSystemPrompt(mind),
    messages: [{
      role: 'user',
      content: `Here are my journal entries:\n\n${contextText}\n\nPlease share your perspective on what you notice in these entries.`,
    }],
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  const jsonStr = extractJson(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Could not parse ${mind.name}'s response. Raw: ${jsonStr.slice(0, 200)}`);
  }

  const perspective: MindPerspective = {
    mindId,
    framing: parsed.framing ?? '',
    highlights: parsed.highlights ?? [],
    generatedAt: Date.now(),
    entryWindowDays: summaries.length,
  };

  await setCached(perspective);
  return perspective;
}
