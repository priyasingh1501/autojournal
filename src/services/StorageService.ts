import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TranscriptEntry, DailySummary, AppSettings, PendingClip, WeeklyInsight,
  EmotionAnalysis, ThoughtPatternAnalysis, PersonalityAnalysis, GrowthTipsAnalysis,
  UserGoals,
  WhoYouAreAnalysis, WhatYouCareAboutAnalysis, HowYouThinkAnalysis, YourStoryAnalysis,
  EnneagramResponse,
} from '../types';

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
  ARC_HISTORY:   'insightv2_arc_history',
};

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export const StorageService = {
  // Settings
  async getSettings(): Promise<AppSettings | null> {
    const json = await AsyncStorage.getItem(KEYS.SETTINGS);
    return json ? JSON.parse(json) : null;
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

  async getWeeklyInsight(weekKey: string): Promise<WeeklyInsight | null> {
    const json = await AsyncStorage.getItem(KEYS.WEEKLY_INSIGHTS_PREFIX + weekKey);
    return json ? JSON.parse(json) : null;
  },

  async saveWeeklyInsight(insight: WeeklyInsight): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.WEEKLY_INSIGHTS_PREFIX + insight.weekKey,
      JSON.stringify(insight),
    );
  },

  async getMonthlyInsight(monthKey: string): Promise<WeeklyInsight | null> {
    const json = await AsyncStorage.getItem(KEYS.MONTHLY_INSIGHTS_PREFIX + monthKey);
    return json ? JSON.parse(json) : null;
  },

  async saveMonthlyInsight(insight: WeeklyInsight): Promise<void> {
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
};
