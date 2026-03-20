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

const SYSTEM_PROMPT = `You are a thoughtful personal journal assistant helping someone reflect on their week.
You have access to their daily journal summaries.
Your role is to synthesise patterns across multiple days into a warm, insightful weekly reflection written directly to the person.
Tone: warm, empathetic, observational — like a wise friend reviewing their week with them.
Format: flowing prose only. No markdown, no headers, no bullet points, no bold text. 2–3 paragraphs.`;

function buildPrompt(
  summaries: DailySummary[],
  stats: { totalEntries: number; daysActive: number },
  weekStart: string,
  weekEnd: string,
): string {
  const dayLines = summaries
    .map(s => `--- ${s.date} (${s.transcriptCount} entries) ---\n${s.summary}`)
    .join('\n\n');

  return `Here are my journal summaries from this week (${weekStart} to ${weekEnd}).
I was active on ${stats.daysActive} out of 7 days and recorded ${stats.totalEntries} total entries.

${dayLines}

Based on these summaries, write a warm, personal weekly reflection about how I've been doing.
Write in second person ("You..."). Around 120 words across 2–3 flowing paragraphs.
Surface patterns across days: mood trends, recurring topics, habits around meals, fitness, or spending, emotional themes, any positive momentum or tension.
Do not use markdown, headers, or bullets — flowing prose only.
Do not begin with the words "This week".`;
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

  // Need at least 2 days of summaries to find meaningful patterns
  const summaries = await StorageService.getSummariesForDateRange(dates);
  if (summaries.length < 2) throw new Error(NOT_ENOUGH_DATA);

  const stats = await collectWeekStats(dates);
  const prompt = buildPrompt(summaries, stats, weekStart, weekEnd);

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const insightText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();

  const insight: WeeklyInsight = {
    weekKey,
    weekStart,
    weekEnd,
    insightText,
    daysActive: stats.daysActive,
    totalEntries: stats.totalEntries,
    daysSummarised: summaries.length,
    generatedAt: Date.now(),
  };

  await StorageService.saveWeeklyInsight(insight);
  return insight;
}
