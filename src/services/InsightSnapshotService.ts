/**
 * InsightSnapshotService — local history of every insight regeneration.
 *
 * Every time an insight tab regenerates, the full analysis is appended to a
 * local AsyncStorage list. Nothing is ever sent to the cloud — raw entries
 * and derived insights both stay on device.
 *
 * Keys:
 *   insightv2_who_history      → WhoYouAreAnalysis[]
 *   insightv2_values_history   → WhatYouCareAboutAnalysis[]
 *   insightv2_thinking_history → HowYouThinkAnalysis[]
 *   insightv2_story_history    → YourStoryAnalysis[]
 *
 * Design rules:
 *  - Append-only. Every generation adds a new entry — history is never overwritten.
 *  - Capped at 200 per tab (~1 MB max). Oldest entries are dropped when exceeded.
 *  - Fire-and-forget. Never throws — a storage failure must not block the UI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  WhoYouAreAnalysis,
  WhatYouCareAboutAnalysis,
  HowYouThinkAnalysis,
  YourStoryAnalysis,
} from '../types';

export type InsightTab = 'who' | 'values' | 'thinking' | 'story';
export type InsightAnalysis =
  | WhoYouAreAnalysis
  | WhatYouCareAboutAnalysis
  | HowYouThinkAnalysis
  | YourStoryAnalysis;

const HISTORY_KEYS: Record<InsightTab, string> = {
  who:      'insightv2_who_history',
  values:   'insightv2_values_history',
  thinking: 'insightv2_thinking_history',
  story:    'insightv2_story_history',
};

// ── Save ───────────────────────────────────────────────────────────────────────

/**
 * Append a new snapshot to the local history for this tab.
 * Called right after the current-state AsyncStorage save. Never throws.
 */
export async function saveInsightSnapshot(
  tab: InsightTab,
  analysis: InsightAnalysis,
): Promise<void> {
  try {
    const key = HISTORY_KEYS[tab];
    const existing = await AsyncStorage.getItem(key);
    const history: InsightAnalysis[] = existing ? JSON.parse(existing) : [];
    history.push(analysis);
    // Cap at 200 entries (oldest dropped) to prevent unbounded AsyncStorage growth
    const capped = history.length > 200 ? history.slice(-200) : history;
    await AsyncStorage.setItem(key, JSON.stringify(capped));
  } catch (err) {
    console.warn('[InsightSnapshot] local save error:', err);
  }
}

// ── Query ──────────────────────────────────────────────────────────────────────

/**
 * Return the full local history for a tab, oldest first.
 * Returns [] on any error.
 */
export async function getInsightHistory(tab: InsightTab): Promise<InsightAnalysis[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEYS[tab]);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[InsightSnapshot] local read error:', err);
    return [];
  }
}

/**
 * Return histories for all four tabs — used for the monthly review screen.
 * Returns an empty record on any error.
 */
export async function getAllInsightHistory(): Promise<Record<InsightTab, InsightAnalysis[]>> {
  const [who, values, thinking, story] = await Promise.all([
    getInsightHistory('who'),
    getInsightHistory('values'),
    getInsightHistory('thinking'),
    getInsightHistory('story'),
  ]);
  return { who, values, thinking, story };
}
