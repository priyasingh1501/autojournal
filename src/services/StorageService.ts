import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranscriptEntry, DailySummary, AppSettings, PendingClip } from '../types';

const KEYS = {
  TRANSCRIPTS_PREFIX: 'transcripts_',
  SUMMARIES_PREFIX: 'summaries_',
  SETTINGS: 'app_settings',
  PENDING_CLIPS: 'pending_clips',
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
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    if (!existing) return;
    const entries: TranscriptEntry[] = JSON.parse(existing);
    const filtered = entries.filter(e => e.id !== id);
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
    const clips = await this.getPendingClips();
    const filtered = clips.filter(c => c.id !== id);
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

  async getSummaryDates(): Promise<string[]> {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys
      .filter(k => k.startsWith(KEYS.SUMMARIES_PREFIX))
      .map(k => k.replace(KEYS.SUMMARIES_PREFIX, ''))
      .sort()
      .reverse();
  },
};
