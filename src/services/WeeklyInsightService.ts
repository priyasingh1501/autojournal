import Anthropic from '@anthropic-ai/sdk';
import { DailySummary, WeeklyInsight } from '../types';
import { StorageService } from './StorageService';

// ─── ISO week helpers ────────────────────────────────────────────────────────

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0); // noon to avoid DST edge cases
  // Shift to the nearest Thursday (ISO weeks are Thursday-anchored)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = d.getFullYear();
  const weekNum = Math.ceil(
    ((d.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000 + 1) / 7,
  );
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekDateRange(ref: Date): {
  weekStart: string;
  weekEnd: string;
  dates: string[];
} {
  const dayOfWeek = ref.getDay() || 7; // Sunday=7 in ISO
  const monday = new Date(ref);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(ref.getDate() - dayOfWeek + 1);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return { weekStart: dates[0], weekEnd: dates[6], dates };
}

// ─── Stats collector ─────────────────────────────────────────────────────────

async function collectWeekStats(dates: string[]): Promise<{
  totalEntries: number;
  daysActive: number;
}> {
  const allEntries = await Promise.all(
    dates.map(d => StorageService.getTranscriptsForDate(d)),
  );
  let totalEntries = 0;
  let daysActive = 0;
  for (const entries of allEntries) {
    if (entries.length > 0) daysActive++;
    totalEntries += entries.length;
  }
  return { totalEntries, daysActive };
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a caring personal journal assistant helping someone understand their week at a glance.
You have access to their daily journal summaries. Analyse them and produce a structured weekly check-in followed by structured data.
Tone: honest, warm, direct — like a trusted friend who notices patterns and gently calls them out.

PART 1 — Text sections (plain text, no markdown):
Use EXACTLY these six section headings, each on its own line, followed by one or two sentences:
  Emotional check-in:
  Meals:
  Movement:
  Spending:
  Recurring thoughts:
  Learnings:
Rules:
- No markdown symbols (no *, no #, no —). Plain text only.
- Each section 1–2 sentences. Be specific — reference actual events, not generic advice.
- Meals: flag unhealthy patterns (junk, skipped meals, late-night). Say "Looks balanced" if fine.
- Movement: call out days with no physical activity. If every day had movement, say so.
- Spending: qualitative summary — high/low/unusual categories if mentioned.
- Recurring thoughts: name actual themes or concerns that appeared more than once.
- Learnings: surface things read, studied, learned at work, new skills, or new observations. Say "Nothing specific logged" if absent.
- Do not begin Emotional check-in with the word "This".

Then output exactly this line on its own:
===DATA===

PART 2 — Structured data (valid JSON only, no other text):
{
  "moodScore": <integer 1–5, where 1=very hard week, 3=neutral, 5=great week>,
  "movementDays": [<bool Mon>, <bool Tue>, <bool Wed>, <bool Thu>, <bool Fri>, <bool Sat>, <bool Sun>],
  "mealQuality": <"good" | "mixed" | "poor">,
  "spendLevel": <"none" | "low" | "medium" | "high">,
  "learningCount": <integer, number of distinct things learned>,
  "spendDays": [<"none"|"low"|"medium"|"high" for Mon>, <Tue>, <Wed>, <Thu>, <Fri>, <Sat>, <Sun>],
  "mealDays": [<"good"|"mixed"|"poor"|"none" for Mon>, <Tue>, <Wed>, <Thu>, <Fri>, <Sat>, <Sun>]
}
Rules for spendDays: "none" = no spending mentioned, "low" = small/routine spend, "medium" = notable purchase, "high" = large or impulsive spend. Use "none" for days with no journal entry.
Rules for mealDays: "good" = healthy balanced meals, "mixed" = some healthy some not, "poor" = junk/skipped/late-night. Use "none" for days with no food mention.`;

function buildPrompt(
  summaries: DailySummary[],
  weekStart: string,
  weekEnd: string,
): string {
  const dayLines = summaries
    .map(s => `--- ${s.date} ---\n${s.summary}`)
    .join('\n\n');

  return `Here are my journal summaries from this week (${weekStart} to ${weekEnd}).

${dayLines}

Using the five sections defined in your instructions (Emotional check-in, Meals, Movement, Spending, Recurring thoughts), write my weekly check-in.
Write in second person ("You..."). Be specific — reference actual things mentioned in the summaries.
Flag unhealthy meals, flag days without any physical activity, surface recurring topics or worries.
Plain text only, no markdown.`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';

export async function generateWeeklyInsight(
  forceRefresh = false,
): Promise<WeeklyInsight> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }

  const now = new Date();
  const weekKey = getISOWeekKey(now);
  const { weekStart, weekEnd, dates } = getWeekDateRange(now);

  // Return cache if available and not force-refreshing
  if (!forceRefresh) {
    const cached = await StorageService.getWeeklyInsight(weekKey);
    if (cached) return cached;
  }

  // Need at least 1 day of summaries
  const summaries = await StorageService.getSummariesForDateRange(dates);
  if (summaries.length < 1) throw new Error(NOT_ENOUGH_DATA);

  const stats = await collectWeekStats(dates);
  const prompt = buildPrompt(summaries, weekStart, weekEnd);

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  const DATA_SENTINEL = '===DATA===';
  const sentinelIdx = fullText.indexOf(DATA_SENTINEL);
  const insightText = sentinelIdx !== -1
    ? fullText.slice(0, sentinelIdx).trim()
    : fullText;

  let weeklyData: import('../types').WeeklyData | undefined;
  if (sentinelIdx !== -1) {
    try {
      const jsonStr = fullText.slice(sentinelIdx + DATA_SENTINEL.length).trim();
      weeklyData = JSON.parse(jsonStr);
    } catch {
      // malformed JSON — proceed without structured data
    }
  }

  const insight: WeeklyInsight = {
    weekKey,
    weekStart,
    weekEnd,
    insightText,
    weeklyData,
    daysActive: stats.daysActive,
    totalEntries: stats.totalEntries,
    daysSummarised: summaries.length,
    generatedAt: Date.now(),
  };

  await StorageService.saveWeeklyInsight(insight);
  return insight;
}
