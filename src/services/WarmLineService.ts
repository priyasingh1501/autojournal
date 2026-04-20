/**
 * WarmLineService — the single sentence shown at the top of SimpleHomeScreen.
 *
 * Priority (highest → lowest):
 *   1. Pending wellbeing re-entry (live, never cached)
 *   2. First sentence of yesterday's Day Summary reflection / insightText
 *   3. A Patterns observation: `wondering_about`, else `returning_question`
 *   4. Generic fallback
 *
 * (2) / (3) / (4) are cached under `warm_line_cache` keyed by the local
 * date — opening the app repeatedly during the same day doesn't recompute or
 * reshuffle. Reentry is checked first on every call, so if it appears
 * mid-day it overrides the cached line for the rest of today.
 *
 * The priority reducer lives in warmLinePicker.ts so it can be tested
 * without react-native in the graph.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { getPendingReentry } from './WellbeingService';
import { getCachedReport } from './PatternsService';
import { getPendingSuggestion } from './IntentionsService';
import { claudeProxy } from './AIProxy';
import type { Intention } from '../types';
import {
  pickWarmLine,
  WarmLine,
  WarmLineTarget,
  REENTRY_LINE,
} from './warmLinePicker';

export type { WarmLine, WarmLineTarget } from './warmLinePicker';

const CACHE_KEY = 'warm_line_cache';

function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CachedEntry {
  date: string;
  text: string;
  tapTarget: WarmLineTarget;
}

async function readCache(): Promise<CachedEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(entry: CachedEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* non-fatal — next call will just recompute */ }
}

/**
 * Resolve the warm line for "right now". Reentry is live; (2)/(3)/(4) are
 * cached per local date.
 */
export async function getWarmLine(): Promise<WarmLine> {
  // 1. Reentry — always live, bypasses cache
  const reentry = await getPendingReentry().catch(() => null);
  if (reentry) return { text: REENTRY_LINE, tapTarget: 'reentry' };

  // 1.5. Pending detected intention — also live (not cached), so accept/dismiss
  // clears it immediately from the home screen without a cache-bust.
  const pendingIntention = await getPendingSuggestion().catch(() => null);
  if (pendingIntention) {
    return pickWarmLine({
      hasReentry: false,
      pendingIntention,
      yesterdaySummary: null,
      patternsReport: null,
    });
  }

  // 2. Same-day cache hit
  const today = localDateStr();
  const cached = await readCache();
  if (cached?.date === today) {
    return { text: cached.text, tapTarget: cached.tapTarget };
  }

  // 3. Compute
  const yesterdayStr = localDateStr(new Date(Date.now() - 86_400_000));
  const [yesterdaySummary, patternsReport] = await Promise.all([
    StorageService.getSummaryForDate(yesterdayStr).catch(() => null),
    getCachedReport().catch(() => null),
  ]);

  const line = pickWarmLine({
    hasReentry: false,
    pendingIntention: null,
    yesterdaySummary,
    patternsReport,
  });

  await writeCache({ date: today, text: line.text, tapTarget: line.tapTarget });
  return line;
}

const INTENTION_TONE_GUIDANCE: Partial<Record<string, string>> = {
  health:        'gentle, embodied, non-judgmental',
  relationships: 'warm, curious, about the other person',
  work:          'grounded, practical, not motivational',
  mind:          'quiet, inward, spacious',
  creative:      'alive, playful, inviting',
  spiritual:     'still, open, non-prescriptive',
  financial:     'matter-of-fact, calm, non-anxious',
  other:         'warm and open',
};

/**
 * Generate a category-aware warm line for an active intention using Haiku.
 * The prompt uses tone guidance so health intentions read differently from
 * work or creative ones. Never throws — returns null on failure.
 */
export async function generateIntentionWarmLine(
  intention: Intention,
): Promise<WarmLine | null> {
  try {
    const category  = intention.category ?? 'other';
    const toneHint  = INTENTION_TONE_GUIDANCE[category] ?? INTENTION_TONE_GUIDANCE.other!;
    const prompt =
      `Write a single warm conversational line (max 12 words) prompting ` +
      `a user to reflect on this intention: ${intention.text}. ` +
      `Category: ${category}. ` +
      `Tone guidance by category:\n` +
      Object.entries(INTENTION_TONE_GUIDANCE)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n') +
      `\nTone to use for this intention: ${toneHint}. ` +
      `Sound like a caring friend. Don't use the words ` +
      `'intention', 'goal', 'track', 'habit', or 'reminder'.`;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 40,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, ''); // strip surrounding quotes the model sometimes adds

    if (!text || text.length < 4) return null;
    return { text, tapTarget: 'intention_nudge' as WarmLineTarget };
  } catch {
    return null;
  }
}

/** Force a recompute on the next call (e.g. after a manual regenerate). */
export async function invalidateWarmLine(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch { /* non-fatal */ }
}
