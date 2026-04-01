import Anthropic from '@anthropic-ai/sdk';
import { DailySummary, MonthlyInsight } from '../types';
import { StorageService } from './StorageService';
// SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
// import { getSMSSpendCategories } from './SMSSpendService';

// ─── Month helpers ────────────────────────────────────────────────────────────

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDateRange(ref: Date): {
  monthKey: string;
  monthStart: string;
  monthEnd: string;
  dates: string[];         // day-1 … today
  totalDaysInMonth: number;
} {
  const year  = ref.getFullYear();
  const month = ref.getMonth();          // 0-indexed
  const today = ref.getDate();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const pad = (n: number) => String(n).padStart(2, '0');
  const monthKey   = `${year}-${pad(month + 1)}`;
  const monthStart = `${year}-${pad(month + 1)}-01`;
  const monthEnd   = `${year}-${pad(month + 1)}-${pad(totalDaysInMonth)}`;

  const dates: string[] = [];
  for (let d = 1; d <= today; d++) {
    dates.push(`${year}-${pad(month + 1)}-${pad(d)}`);
  }

  return { monthKey, monthStart, monthEnd, dates, totalDaysInMonth };
}

// ─── Stats collector ─────────────────────────────────────────────────────────

async function collectMonthStats(dates: string[]): Promise<{
  totalEntries: number;
  daysActive: number;
}> {
  const allEntries = await Promise.all(
    dates.map(d => StorageService.getTranscriptsForDate(d)),
  );
  let totalEntries = 0;
  let daysActive   = 0;
  for (const entries of allEntries) {
    if (entries.length > 0) daysActive++;
    totalEntries += entries.length;
  }
  return { totalEntries, daysActive };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a caring personal journal assistant helping someone understand their month at a glance.
You have access to their daily journal summaries. Analyse them and produce a structured monthly check-in followed by structured data.
Tone: honest, warm, direct — like a trusted friend who notices patterns and gently calls them out.

PART 1 — Text sections (plain text, no markdown):
Use EXACTLY these seven section headings, each on its own line, followed by one or two sentences:
  Emotional check-in:
  Meals:
  Movement:
  Meditation:
  Spending:
  Recurring thoughts:
  Learnings:
Rules:
- No markdown symbols (no *, no #, no —). Plain text only.
- Each section 1–2 sentences. Be specific — reference actual events from the entries.
- Meals: flag unhealthy patterns (junk, skipped meals, late-night). Say "Looks balanced" if fine.
- Movement: call out stretches with no physical activity. If consistent, say so.
- Meditation: note any meditation, breathwork, mindfulness, or pranayama practice this month. Say "None logged this month" if not mentioned.
- Spending: summarise total spend pattern and notable categories.
- Recurring thoughts: name actual themes or concerns that appeared more than once.
- Learnings: surface things read, studied, learned at work, new skills. Say "Nothing specific logged" if absent.
- Do not begin Emotional check-in with the word "This".

Then output exactly this line on its own:
===DATA===

PART 2 — Structured data (valid JSON only, no other text, no markdown, no code fences):
{
  "moodScore": <integer 1–5, where 1=very hard month, 3=neutral, 5=great month>,
  "movementDays": [<bool for day-1>, <bool for day-2>, ..., <bool for today — one entry per day of month so far>],
  "mealQuality": <"good" | "mixed" | "poor">,
  "spendLevel": <"none" | "low" | "medium" | "high">,
  "learningCount": <integer, number of distinct things learned>,
  "mealDays": [<"good"|"mixed"|"poor"|null for day-1>, ..., <day-N>],
  "lastMealDate": "<YYYY-MM-DD of the most recent day meals were mentioned, or null>",
  "lastMealSummary": "<1–2 sentences describing what was eaten on that last meal day — be specific, or null if no meal data>",
  "mealMacrosByDay": [
    { "date": "<YYYY-MM-DD>", "calories": <estimated kcal as integer or null>, "protein": <grams as integer or null>, "carbs": <grams as integer or null>, "fat": <grams as integer or null>, "mealSummary": "<1 sentence describing what was eaten>" }
  ],
  "meditationDays": [<bool for day-1>, <bool for day-2>, ..., <bool for today — one entry per day of month so far>],
  "emotionCounts": [
    { "name": "<emotion name, lowercase>", "count": <integer — number of entries where this emotion was present>, "sentiment": "<positive|neutral|negative>" }
  ],
  "recurringTopics": [
    { "word": "<topic or short phrase>", "count": <integer — number of entries this topic appeared in> }
  ],
  "spendCategories": [
    { "name": "<category>", "level": "<low|medium|high>", "summary": "<one brief sentence>" }
  ]
}
Rules for movementDays: length must match the number of days elapsed so far this month. true = any physical activity mentioned.
Rules for meditationDays: same length as movementDays. true = any meditation, breathwork, mindfulness, or pranayama mentioned that day.
Rules for mealDays: one entry per day elapsed (same length as movementDays). "good" = healthy, balanced eating (if calorie/protein goals known, roughly on target); "mixed" = partially healthy, one off meal, or unclear; "poor" = junk food, skipped meals, clearly off-target, or bingeing; null = meals not mentioned at all that day.
Rules for lastMealDate and lastMealSummary: find the most recent day where meals were actually described. Extract 1–2 specific sentences about what was eaten (e.g. "Had oats for breakfast and grilled chicken for lunch. Ended with a late-night snack."). Set both to null if meals are never mentioned.
Rules for mealMacrosByDay: include only days where meals were actually described (max 10 most recent days). For each day estimate calories/protein/carbs/fat from what was mentioned — use reasonable estimates if exact numbers not stated (e.g. "grilled chicken breast" ≈ 165 kcal, 31g protein). Set a macro to null only if there is truly no basis to estimate it. Keep mealSummary to one concise sentence.
Rules for emotionCounts: list 4–8 distinct emotions actually detected across the entries. Count = number of separate daily entries where the emotion is clearly present. Sort by count descending. Use single lowercase words or short phrases (e.g. "anxiety", "gratitude", "frustration", "excitement", "calm", "loneliness"). Sentiment: positive = feels good, negative = feels difficult, neutral = neither.
Rules for recurringTopics: list 8–16 topics, themes, or concerns that appeared across entries. Use short lowercase words or 2-word phrases (e.g. "self-doubt", "work stress", "family", "project"). Count = number of distinct daily entries where the topic appears. Sort by count descending.
Rules for spendCategories: include only categories actually mentioned in the entries. Use these names when applicable: "Food & Dining", "Shopping", "Transport", "Entertainment", "Health & Fitness", "Bills & Utilities", "Travel", "Other". Skip a category if it was not mentioned at all. Maximum 6 categories.`;

function buildPrompt(summaries: DailySummary[], monthStart: string, monthEnd: string): string {
  const dayLines = summaries
    .map(s => `--- ${s.date} ---\n${s.summary}`)
    .join('\n\n');

  return `Here are my journal summaries from this month (${monthStart} to ${monthEnd}).

${dayLines}

Write my monthly check-in using the six sections defined in your instructions.
Write in second person ("You..."). Be specific — reference actual things mentioned in the entries.
Flag unhealthy meals, movement gaps, and spending patterns. Surface recurring topics.
Plain text only, no markdown.`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';

export async function generateMonthlyInsight(
  forceRefresh = false,
): Promise<MonthlyInsight> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }

  const now = new Date();
  const { monthKey, monthStart, monthEnd, dates, totalDaysInMonth } = getMonthDateRange(now);

  // Return cache if available and not force-refreshing
  if (!forceRefresh) {
    const cached = await StorageService.getMonthlyInsight(monthKey);
    if (cached) return cached;
  }

  // Need at least 1 day of summaries
  const summaries = await StorageService.getSummariesForDateRange(dates);
  if (summaries.length < 1) throw new Error(NOT_ENOUGH_DATA);

  const stats  = await collectMonthStats(dates);
  const prompt = buildPrompt(summaries, monthStart, monthEnd);

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const fullText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  const DATA_SENTINEL = '===DATA===';
  const sentinelIdx   = fullText.indexOf(DATA_SENTINEL);
  const insightText   = sentinelIdx !== -1
    ? fullText.slice(0, sentinelIdx).trim()
    : fullText;

  let monthlyData: import('../types').MonthlyData | undefined;
  if (sentinelIdx !== -1) {
    try {
      let jsonStr = fullText.slice(sentinelIdx + DATA_SENTINEL.length).trim();
      // Strip code fences if present
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      monthlyData = JSON.parse(jsonStr);
    } catch {
      // malformed JSON — proceed without structured data
    }
  }

  // SMS spend tracking disabled — READ_SMS permission not grantable on non-rooted devices
  // const now2 = new Date();
  // const smsCategories = await getSMSSpendCategories(now2.getFullYear(), now2.getMonth() + 1);
  // if (smsCategories.length > 0 && monthlyData) {
  //   monthlyData.spendCategories = smsCategories;
  // }

  const insight: MonthlyInsight = {
    weekKey:        monthKey,      // reused field — now stores month key e.g. "2026-03"
    weekStart:      monthStart,
    weekEnd:        monthEnd,
    insightText,
    weeklyData:     monthlyData,
    daysActive:     stats.daysActive,
    totalEntries:   stats.totalEntries,
    daysSummarised: summaries.length,
    generatedAt:    Date.now(),
  };

  await StorageService.saveMonthlyInsight(insight);
  return insight;
}
