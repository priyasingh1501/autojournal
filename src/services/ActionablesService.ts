/**
 * ActionablesService
 *
 * Analyzes the last 7 days of journal entries and generates:
 *   - One suggested goal (something worth pursuing based on patterns)
 *   - One concrete next action (a small, doable step for today/this week)
 *   - One reflection question (something worth sitting with)
 *
 * Design:
 *   - Cached for 12 hours or until explicitly invalidated (new entry saved)
 *   - Requires at least 3 entries across at least 2 days before generating
 *   - Returns null if not enough data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';

export interface Actionables {
  goal: string;       // "Start a 10-minute morning walk routine"
  action: string;     // "Block 20 min tomorrow to write down what 'enough' means to you"
  question: string;   // "What would you do differently if you weren't afraid of being judged?"
  generatedAt: number;
}

const CACHE_KEY = 'actionables_cache';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

let _memCache: Actionables | null = null;

function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function buildActionables(): Promise<Actionables | null> {
  // Gather last 7 days of entries
  const dates = Array.from({ length: 7 }, (_, i) => localDateString(i));
  const transcriptArrays = await Promise.all(
    dates.map(d => StorageService.getTranscriptsForDate(d).catch(() => [])),
  );

  const allEntries = transcriptArrays.flat().filter(t => t.text.trim().length > 10);
  const activeDays = transcriptArrays.filter(arr => arr.some(t => t.text.trim().length > 10)).length;

  // Need at least 3 entries across 2+ days
  if (allEntries.length < 3 || activeDays < 2) return null;

  // Build a compact summary for Claude — keep tokens lean
  const entryLog = allEntries
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20) // cap at 20 most recent
    .map(t => `- ${t.text.trim().slice(0, 200)}`)
    .join('\n');

  // Also pull the most recent daily summary if available
  let summarySnippet = '';
  try {
    const summaryDates = await StorageService.getSummaryDates();
    if (summaryDates.length > 0) {
      const latest = await StorageService.getSummaryForDate(summaryDates[0]);
      if (latest) summarySnippet = (latest.insightText ?? latest.summary ?? '').slice(0, 400);
    }
  } catch { /* ignore */ }

  const contextBlock = summarySnippet
    ? `Recent summary:\n${summarySnippet}\n\nIndividual entries:\n${entryLog}`
    : `Journal entries (last 7 days):\n${entryLog}`;

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system:
      'You are a thoughtful life coach analyzing someone\'s private journal. ' +
      'Return ONLY a valid JSON object — no explanation, no markdown fences.',
    messages: [
      {
        role: 'user',
        content:
          `Based on these journal entries, generate one goal, one action, and one question.\n\n` +
          `${contextBlock}\n\n` +
          `Return exactly:\n` +
          `{\n` +
          `  "goal": "A clear, specific goal worth pursuing based on what this person cares about (max 12 words)",\n` +
          `  "action": "One small, concrete action they can take this week (max 15 words, starts with a verb)",\n` +
          `  "question": "A single open question that would be genuinely useful for them to sit with (max 20 words)"\n` +
          `}\n\n` +
          `Rules:\n` +
          `- goal: grounded in their actual patterns, not generic advice\n` +
          `- action: specific and achievable, not vague ("journal more" is bad; "Write for 5 minutes before bed tonight" is good)\n` +
          `- question: curious and non-judgmental, designed to open up thinking\n` +
          `- Return ONLY the JSON.`,
      },
    ],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  const parsed = JSON.parse(match[0]) as Partial<Actionables>;
  if (!parsed.goal || !parsed.action || !parsed.question) return null;

  return {
    goal: parsed.goal.trim(),
    action: parsed.action.trim(),
    question: parsed.question.trim(),
    generatedAt: Date.now(),
  };
}

export const ActionablesService = {
  async get(force = false): Promise<Actionables | null> {
    // In-memory cache
    if (!force && _memCache && (Date.now() - _memCache.generatedAt) < CACHE_TTL) {
      return _memCache;
    }

    // Persisted cache
    if (!force) {
      try {
        const json = await AsyncStorage.getItem(CACHE_KEY);
        if (json) {
          const cached: Actionables = JSON.parse(json);
          if ((Date.now() - cached.generatedAt) < CACHE_TTL) {
            _memCache = cached;
            return cached;
          }
        }
      } catch { /* ignore */ }
    }

    // Build fresh
    try {
      const fresh = await buildActionables();
      if (fresh) {
        _memCache = fresh;
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
      }
      return fresh;
    } catch {
      return null;
    }
  },

  invalidate(): void {
    _memCache = null;
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  },
};
