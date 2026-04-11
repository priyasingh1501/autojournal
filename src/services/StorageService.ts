import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TranscriptEntry, DailySummary, AppSettings, PendingClip, MonthlyInsight,
  EmotionAnalysis, ThoughtPatternAnalysis, PersonalityAnalysis, GrowthTipsAnalysis,
  UserGoals, ExpenseEntry,
  WhoYouAreAnalysis, WhatYouCareAboutAnalysis, HowYouThinkAnalysis, YourStoryAnalysis,
  EnneagramResponse, SavedShort, JournalSignal, WisdomShort,
} from '../types';
// API keys are now server-side (Supabase Edge Functions via AIProxy) — not needed in app

const KEYS = {
  TRANSCRIPTS_PREFIX: 'transcripts_',
  SUMMARIES_PREFIX: 'summaries_',
  SETTINGS: 'app_settings',
  PENDING_CLIPS: 'pending_clips',
  WEEKLY_INSIGHTS_PREFIX: 'weekly_insight_',
  MONTHLY_INSIGHTS_PREFIX: 'monthly_insight_',
  EMOTION_ANALYSIS_PREFIX: 'insight_emotions_',
  PATTERN_ANALYSIS_PREFIX: 'insight_patterns_',
  PERSONALITY_ANALYSIS: 'insight_personality',
  GROWTH_TIPS_ANALYSIS: 'insight_growthtips',
  USER_GOALS: 'user_goals',
  // V2 insights
  WHO_YOU_ARE: 'insightv2_who',
  WHAT_YOU_CARE: 'insightv2_values',
  HOW_YOU_THINK: 'insightv2_thinking',
  YOUR_STORY:    'insightv2_story',
  ENNEAGRAM_RESP:'insightv2_enneagram_response',
  ARC_HISTORY:    'insightv2_arc_history',
  EXPENSE_PREFIX: 'expenses_',
  APP_PIN: 'app_pin_hash',
  WISDOM_SAVED: 'wisdom_saved_shorts',
  WISDOM_SEEN: 'wisdom_seen_shorts',
  WISDOM_SIGNAL: 'wisdom_journal_signal',
  PUBLISHER_MODE: 'publisher_mode',
  CUSTOM_SHORTS: 'wisdom_custom_shorts',
};

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * djb2-based hash with a fixed salt — sufficient for local PIN storage.
 * The PIN never leaves the device; this protects against casual inspection
 * of the AsyncStorage file on a rooted device.
 */
function _hashPin(rawPin: string): string {
  const salted = `untangle_pin_v1_${rawPin}`;
  let h = 5381;
  for (let i = 0; i < salted.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = ((h << 5) + h + salted.charCodeAt(i)) | 0;
  }
  // >>> 0 converts to unsigned 32-bit so we never get a leading '-'
  // eslint-disable-next-line no-bitwise
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const StorageService = {
  // Settings
  async getSettings(): Promise<AppSettings | null> {
    const json = await AsyncStorage.getItem(KEYS.SETTINGS);
    const stored: AppSettings | null = json ? JSON.parse(json) : null;
    // Keys are server-side (AIProxy/Edge Functions) — return stored settings as-is
    const base: AppSettings = stored ?? ({} as AppSettings);
    return base;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Transcripts
  async getTodayTranscripts(): Promise<TranscriptEntry[]> {
    const key = KEYS.TRANSCRIPTS_PREFIX + todayKey();
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  },

  async getTranscriptsForDate(date: string): Promise<TranscriptEntry[]> {
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  },

  async addTranscript(entry: TranscriptEntry): Promise<void> {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    const entries: TranscriptEntry[] = existing ? JSON.parse(existing) : [];
    entries.push(entry);
    await AsyncStorage.setItem(key, JSON.stringify(entries));
  },

  async deleteTranscript(id: string, date: string): Promise<void> {
    return this.deleteTranscripts([id], date);
  },

  async updateTranscript(entry: TranscriptEntry, date: string): Promise<void> {
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    if (!existing) return;
    const entries: TranscriptEntry[] = JSON.parse(existing);
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx !== -1) {
      entries[idx] = entry;
      await AsyncStorage.setItem(key, JSON.stringify(entries));
    }
  },

  // Atomic bulk delete — single read/filter/write per date key, avoids race conditions
  async deleteTranscripts(ids: string[], date: string): Promise<void> {
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    if (!existing) return;
    const idSet = new Set(ids);
    const entries: TranscriptEntry[] = JSON.parse(existing);
    const filtered = entries.filter(e => !idSet.has(e.id));
    if (filtered.length === 0) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    }
  },

  async getTranscriptDates(): Promise<string[]> {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys
      .filter(k => k.startsWith(KEYS.TRANSCRIPTS_PREFIX))
      .map(k => k.replace(KEYS.TRANSCRIPTS_PREFIX, ''))
      .sort()
      .reverse();
  },

  // Pending clips (saved locally, not yet transcribed)
  async getPendingClips(): Promise<PendingClip[]> {
    const json = await AsyncStorage.getItem(KEYS.PENDING_CLIPS);
    return json ? JSON.parse(json) : [];
  },

  async addPendingClip(clip: PendingClip): Promise<void> {
    const clips = await this.getPendingClips();
    clips.push(clip);
    await AsyncStorage.setItem(KEYS.PENDING_CLIPS, JSON.stringify(clips));
  },

  async removePendingClip(id: string): Promise<void> {
    return this.removeManyPendingClips([id]);
  },

  // Atomic bulk remove — single read/filter/write
  async removeManyPendingClips(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const clips = await this.getPendingClips();
    const filtered = clips.filter(c => !idSet.has(c.id));
    await AsyncStorage.setItem(KEYS.PENDING_CLIPS, JSON.stringify(filtered));
  },

  async clearPendingClips(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PENDING_CLIPS);
  },

  // Summaries
  async getTodaySummary(): Promise<DailySummary | null> {
    const key = KEYS.SUMMARIES_PREFIX + todayKey();
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : null;
  },

  async getSummaryForDate(date: string): Promise<DailySummary | null> {
    const key = KEYS.SUMMARIES_PREFIX + date;
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : null;
  },

  async saveSummary(summary: DailySummary): Promise<void> {
    const key = KEYS.SUMMARIES_PREFIX + summary.date;
    await AsyncStorage.setItem(key, JSON.stringify(summary));
  },

  async getSummariesForDateRange(dates: string[]): Promise<DailySummary[]> {
    const results = await Promise.all(dates.map(d => this.getSummaryForDate(d)));
    return results.filter(Boolean) as DailySummary[];
  },

  async getLegacyInsight(weekKey: string): Promise<MonthlyInsight | null> {
    const json = await AsyncStorage.getItem(KEYS.WEEKLY_INSIGHTS_PREFIX + weekKey);
    return json ? JSON.parse(json) : null;
  },

  async saveLegacyInsight(insight: MonthlyInsight): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.WEEKLY_INSIGHTS_PREFIX + insight.weekKey,
      JSON.stringify(insight),
    );
  },

  async getMonthlyInsight(monthKey: string): Promise<MonthlyInsight | null> {
    const json = await AsyncStorage.getItem(KEYS.MONTHLY_INSIGHTS_PREFIX + monthKey);
    return json ? JSON.parse(json) : null;
  },

  async saveMonthlyInsight(insight: MonthlyInsight): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.MONTHLY_INSIGHTS_PREFIX + insight.weekKey,
      JSON.stringify(insight),
    );
  },

  async getSummaryDates(): Promise<string[]> {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys
      .filter(k => k.startsWith(KEYS.SUMMARIES_PREFIX))
      .map(k => k.replace(KEYS.SUMMARIES_PREFIX, ''))
      .sort()
      .reverse();
  },

  // ── Insight analyses ────────────────────────────────────────────────────────

  async getEmotionAnalysis(windowTag: string): Promise<EmotionAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.EMOTION_ANALYSIS_PREFIX + windowTag);
    return json ? JSON.parse(json) : null;
  },
  async saveEmotionAnalysis(analysis: EmotionAnalysis, windowTag: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.EMOTION_ANALYSIS_PREFIX + windowTag, JSON.stringify(analysis));
  },

  async getThoughtPatternAnalysis(windowTag: string): Promise<ThoughtPatternAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.PATTERN_ANALYSIS_PREFIX + windowTag);
    return json ? JSON.parse(json) : null;
  },
  async saveThoughtPatternAnalysis(analysis: ThoughtPatternAnalysis, windowTag: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PATTERN_ANALYSIS_PREFIX + windowTag, JSON.stringify(analysis));
  },

  async getPersonalityAnalysis(): Promise<PersonalityAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.PERSONALITY_ANALYSIS);
    return json ? JSON.parse(json) : null;
  },
  async savePersonalityAnalysis(analysis: PersonalityAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.PERSONALITY_ANALYSIS, JSON.stringify(analysis));
  },

  async getGrowthTipsAnalysis(): Promise<GrowthTipsAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.GROWTH_TIPS_ANALYSIS);
    return json ? JSON.parse(json) : null;
  },
  async saveGrowthTipsAnalysis(analysis: GrowthTipsAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.GROWTH_TIPS_ANALYSIS, JSON.stringify(analysis));
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  async getGoals(): Promise<UserGoals | null> {
    const json = await AsyncStorage.getItem(KEYS.USER_GOALS);
    return json ? JSON.parse(json) : null;
  },
  async saveGoals(goals: UserGoals): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify(goals));
  },

  // ── Insights V2 ────────────────────────────────────────────────────────────
  async getWhoYouAre(): Promise<WhoYouAreAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.WHO_YOU_ARE);
    return json ? JSON.parse(json) : null;
  },
  async saveWhoYouAre(a: WhoYouAreAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.WHO_YOU_ARE, JSON.stringify(a));
  },

  async getWhatYouCare(): Promise<WhatYouCareAboutAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.WHAT_YOU_CARE);
    return json ? JSON.parse(json) : null;
  },
  async saveWhatYouCare(a: WhatYouCareAboutAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.WHAT_YOU_CARE, JSON.stringify(a));
  },

  async getHowYouThink(): Promise<HowYouThinkAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.HOW_YOU_THINK);
    return json ? JSON.parse(json) : null;
  },
  async saveHowYouThink(a: HowYouThinkAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.HOW_YOU_THINK, JSON.stringify(a));
  },

  async getYourStory(): Promise<YourStoryAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.YOUR_STORY);
    return json ? JSON.parse(json) : null;
  },
  async saveYourStory(a: YourStoryAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.YOUR_STORY, JSON.stringify(a));
  },

  async getEnneagramResponse(): Promise<EnneagramResponse | null> {
    const json = await AsyncStorage.getItem(KEYS.ENNEAGRAM_RESP);
    return json ? JSON.parse(json) : null;
  },
  async saveEnneagramResponse(r: EnneagramResponse): Promise<void> {
    await AsyncStorage.setItem(KEYS.ENNEAGRAM_RESP, JSON.stringify(r));
  },

  async getArcHistory(): Promise<Array<{ type: string; dateRange: string }>> {
    const json = await AsyncStorage.getItem(KEYS.ARC_HISTORY);
    return json ? JSON.parse(json) : [];
  },
  async saveArcHistory(history: Array<{ type: string; dateRange: string }>): Promise<void> {
    await AsyncStorage.setItem(KEYS.ARC_HISTORY, JSON.stringify(history));
  },

  // ── Tracked expenses (extracted from voice/manual notes) ────────────────────

  async addExpenses(entries: ExpenseEntry[]): Promise<void> {
    if (entries.length === 0) return;
    // Group by month so we do one read/write per month (usually just one)
    const byMonth = new Map<string, ExpenseEntry[]>();
    for (const e of entries) {
      const m = e.date.slice(0, 7); // YYYY-MM
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(e);
    }
    for (const [monthKey, batch] of byMonth) {
      const key = KEYS.EXPENSE_PREFIX + monthKey;
      const existing: ExpenseEntry[] = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
      // Deduplicate: skip entries whose sourceTranscriptId already has a record this month
      const seenTranscripts = new Set(existing.map(e => e.sourceTranscriptId));
      const fresh = batch.filter(e => !seenTranscripts.has(e.sourceTranscriptId));
      if (fresh.length === 0) continue;
      await AsyncStorage.setItem(key, JSON.stringify([...existing, ...fresh]));
    }
  },

  async getExpensesForMonth(yearMonth: string): Promise<ExpenseEntry[]> {
    const key = KEYS.EXPENSE_PREFIX + yearMonth;
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  },

  // ── App lock PIN ────────────────────────────────────────────────────────────

  /** Returns true if a PIN has been set. */
  async hasPinSet(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.APP_PIN);
    return val !== null && val.length > 0;
  },

  /** Hash + save a raw 4-digit PIN. */
  async savePin(rawPin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.APP_PIN, _hashPin(rawPin));
  },

  /** Returns true if the raw PIN matches the stored hash. */
  async verifyPin(rawPin: string): Promise<boolean> {
    const stored = await AsyncStorage.getItem(KEYS.APP_PIN);
    if (!stored) return false;
    return _hashPin(rawPin) === stored;
  },

  /** Remove the stored PIN (disables app lock). */
  async removePin(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.APP_PIN);
  },

  // ── Wisdom Shorts ───────────────────────────────────────────────────────────

  async getSavedShorts(): Promise<SavedShort[]> {
    const json = await AsyncStorage.getItem(KEYS.WISDOM_SAVED);
    return json ? JSON.parse(json) : [];
  },

  async saveShort(shortId: string): Promise<void> {
    const saved = await this.getSavedShorts();
    if (saved.some(s => s.shortId === shortId)) return;
    saved.push({ shortId, savedAt: Date.now() });
    await AsyncStorage.setItem(KEYS.WISDOM_SAVED, JSON.stringify(saved));
  },

  async unsaveShort(shortId: string): Promise<void> {
    const saved = await this.getSavedShorts();
    const filtered = saved.filter(s => s.shortId !== shortId);
    await AsyncStorage.setItem(KEYS.WISDOM_SAVED, JSON.stringify(filtered));
  },

  /** Returns IDs seen in the last 30 days. Shorts seen longer ago re-surface as fresh. */
  async getSeenShortIds(): Promise<string[]> {
    const json = await AsyncStorage.getItem(KEYS.WISDOM_SEEN);
    if (!json) return [];
    const raw: Array<string | { id: string; seenAt: number }> = JSON.parse(json);

    // Migrate legacy string entries to object form so they expire naturally via the
    // 30-day cutoff rather than reappearing as if never seen.
    const migrated: Array<{ id: string; seenAt: number }> = raw.map(e =>
      typeof e === 'string' ? { id: e, seenAt: 0 } : e,
    );

    // Write back if any migration happened
    if (raw.some(e => typeof e === 'string')) {
      const capped = migrated.length > 400 ? migrated.slice(-400) : migrated;
      await AsyncStorage.setItem(KEYS.WISDOM_SEEN, JSON.stringify(capped)).catch(() => {});
    }

    const cutoff = Date.now() - 30 * 86_400_000; // 30 days
    return migrated
      .filter(e => e.seenAt > cutoff)
      .map(e => e.id);
  },

  async markShortSeen(shortId: string): Promise<void> {
    const json = await AsyncStorage.getItem(KEYS.WISDOM_SEEN);
    const raw: Array<{ id: string; seenAt: number }> = json
      ? (JSON.parse(json) as Array<string | { id: string; seenAt: number }>).map(e =>
          typeof e === 'string' ? { id: e, seenAt: 0 } : e,
        )
      : [];
    const idx = raw.findIndex(e => e.id === shortId);
    const entry = { id: shortId, seenAt: Date.now() };
    if (idx >= 0) {
      raw[idx] = entry; // refresh seenAt so the 30-day clock resets
    } else {
      raw.push(entry);
    }
    // Keep last 400 entries (enough headroom for a 500-short library)
    const capped = raw.length > 400 ? raw.slice(-400) : raw;
    await AsyncStorage.setItem(KEYS.WISDOM_SEEN, JSON.stringify(capped));
  },

  async getJournalSignal(): Promise<JournalSignal | null> {
    const json = await AsyncStorage.getItem(KEYS.WISDOM_SIGNAL);
    return json ? JSON.parse(json) : null;
  },

  async saveJournalSignal(signal: JournalSignal): Promise<void> {
    await AsyncStorage.setItem(KEYS.WISDOM_SIGNAL, JSON.stringify(signal));
  },

  // ── Publisher mode ──────────────────────────────────────────────────────────

  async isPublisherMode(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.PUBLISHER_MODE);
    return val === 'true';
  },

  async setPublisherMode(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.PUBLISHER_MODE, enabled ? 'true' : 'false');
  },

  // ── Custom Wisdom Shorts ────────────────────────────────────────────────────

  async getCustomShorts(): Promise<WisdomShort[]> {
    const json = await AsyncStorage.getItem(KEYS.CUSTOM_SHORTS);
    return json ? JSON.parse(json) : [];
  },

  async saveCustomShort(short: WisdomShort): Promise<void> {
    const existing = await this.getCustomShorts();
    const idx = existing.findIndex(s => s.id === short.id);
    if (idx >= 0) {
      existing[idx] = short; // update
    } else {
      existing.push(short);  // insert
    }
    await AsyncStorage.setItem(KEYS.CUSTOM_SHORTS, JSON.stringify(existing));
  },

  async deleteCustomShort(id: string): Promise<void> {
    const existing = await this.getCustomShorts();
    const filtered = existing.filter(s => s.id !== id);
    await AsyncStorage.setItem(KEYS.CUSTOM_SHORTS, JSON.stringify(filtered));
  },
};
