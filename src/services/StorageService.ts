import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  TranscriptEntry, DailySummary, AppSettings, PendingClip, MonthlyInsight,
  EmotionAnalysis, ThoughtPatternAnalysis, PersonalityAnalysis, GrowthTipsAnalysis,
  UserGoals, ExpenseEntry,
  SavedShort, JournalSignal, WisdomShort,
} from '../types';
import { effectiveDateStr } from './dayRollover';
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
  // NOTE: `insightv2_*` keys are deprecated (InsightV2Service was removed in
  // the post-redesign cleanup). We no longer read or write them from app
  // code, so any data stored under them on existing installs will remain
  // untouched until the user clears app data.
  EXPENSE_PREFIX: 'expenses_',
  APP_PIN_LEGACY: 'app_pin_hash',       // pre-SecureStore djb2 hash, migrated on first verify
  APP_PIN_ATTEMPTS: 'app_pin_attempts', // JSON: { count: number, lockoutUntilMs: number }
  WISDOM_SAVED: 'wisdom_saved_shorts',
  WISDOM_SEEN: 'wisdom_seen_shorts',
  WISDOM_SEEN_MIGRATED: 'wisdom_seen_migrated',
  WISDOM_SIGNAL: 'wisdom_journal_signal',
  PUBLISHER_MODE: 'publisher_mode',
  CUSTOM_SHORTS: 'wisdom_custom_shorts',
};

// Stored in iOS Keychain / Android Keystore via expo-secure-store — not
// readable by other apps and not present in AsyncStorage exports.
const SECURE_KEYS = {
  PIN_HASH: 'untangle_pin_hash_v2',
  PIN_SALT: 'untangle_pin_salt_v2',
};

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Returns a YYYY-MM-DD string in the device's local timezone. */
function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayKey(): string {
  return localDateStr();
}

/**
 * Legacy djb2 hash. Retained ONLY to verify PINs from pre-v2 installs so we
 * can transparently migrate them to SecureStore + SHA-256 on the next
 * successful unlock. Never used to set new PINs.
 */
function _legacyHashPin(rawPin: string): string {
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

/** SHA-256 hex of (salt + pin). Salt is per-install random, kept in SecureStore. */
async function _hashPinV2(rawPin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}|${rawPin}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}

/** Cryptographically random per-install salt (32 bytes hex). */
async function _generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the stored salt, generating + persisting one on first call. */
async function _getOrCreateSalt(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SECURE_KEYS.PIN_SALT);
  if (existing) return existing;
  const fresh = await _generateSalt();
  await SecureStore.setItemAsync(SECURE_KEYS.PIN_SALT, fresh);
  return fresh;
}

export const StorageService = {
  // Settings
  async getSettings(): Promise<AppSettings | null> {
    const json = await AsyncStorage.getItem(KEYS.SETTINGS);
    const stored: AppSettings | null = safeParse<AppSettings | null>(json, null);
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
    return safeParse<TranscriptEntry[]>(json, []);
  },

  async getTranscriptsForDate(date: string): Promise<TranscriptEntry[]> {
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const json = await AsyncStorage.getItem(key);
    return safeParse<TranscriptEntry[]>(json, []);
  },

  async addTranscript(
    entry: TranscriptEntry,
    opts?: { storageDate?: string },
  ): Promise<void> {
    // All entries bucket under the 3am-rollover "effective" date by default,
    // so a 01:30 entry lands in yesterday's slot — matches how the day-close
    // summary treats late-night recordings. Callers can override with
    // storageDate (e.g. edit flows that move an entry to a user-picked date).
    const date = opts?.storageDate ?? effectiveDateStr(entry.timestamp);
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    const entries: TranscriptEntry[] = safeParse<TranscriptEntry[]>(existing, []);
    entries.push(entry);
    await AsyncStorage.setItem(key, JSON.stringify(entries));
    DeviceEventEmitter.emit('transcriptAdded', { date });
  },

  async deleteTranscript(id: string, date: string): Promise<void> {
    return this.deleteTranscripts([id], date);
  },

  async updateTranscript(entry: TranscriptEntry, date: string): Promise<void> {
    const key = KEYS.TRANSCRIPTS_PREFIX + date;
    const existing = await AsyncStorage.getItem(key);
    if (!existing) return;
    const entries: TranscriptEntry[] = safeParse<TranscriptEntry[]>(existing, []);
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
    const entries: TranscriptEntry[] = safeParse<TranscriptEntry[]>(existing, []);
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
    return safeParse<PendingClip[]>(json, []);
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

  // Atomic apply of one transcription batch's outcome:
  //   - removedIds: clips done for good (success, missing file, exceeded retries)
  //   - retriedIds: clips that failed this attempt and should keep their slot
  //                 in the queue with an incremented failureCount
  // Reads the live list inside the same call so a clip added by a concurrent
  // recording during the batch isn't overwritten.
  async applyPendingClipResults(args: {
    removedIds: string[];
    retriedIds: string[];
  }): Promise<void> {
    const removed = new Set(args.removedIds);
    const retried = new Set(args.retriedIds);
    const clips = await this.getPendingClips();
    const next = clips
      .filter(c => !removed.has(c.id))
      .map(c => retried.has(c.id)
        ? { ...c, failureCount: (c.failureCount ?? 0) + 1 }
        : c);
    await AsyncStorage.setItem(KEYS.PENDING_CLIPS, JSON.stringify(next));
  },

  async clearPendingClips(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PENDING_CLIPS);
  },

  // Summaries
  async getTodaySummary(): Promise<DailySummary | null> {
    const key = KEYS.SUMMARIES_PREFIX + todayKey();
    const json = await AsyncStorage.getItem(key);
    return safeParse<DailySummary | null>(json, null);
  },

  async getSummaryForDate(date: string): Promise<DailySummary | null> {
    const key = KEYS.SUMMARIES_PREFIX + date;
    const json = await AsyncStorage.getItem(key);
    return safeParse<DailySummary | null>(json, null);
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
    return safeParse<MonthlyInsight | null>(json, null);
  },

  async saveLegacyInsight(insight: MonthlyInsight): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.WEEKLY_INSIGHTS_PREFIX + insight.weekKey,
      JSON.stringify(insight),
    );
  },

  async getMonthlyInsight(monthKey: string): Promise<MonthlyInsight | null> {
    const json = await AsyncStorage.getItem(KEYS.MONTHLY_INSIGHTS_PREFIX + monthKey);
    return safeParse<MonthlyInsight | null>(json, null);
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
    return safeParse<EmotionAnalysis | null>(json, null);
  },
  async saveEmotionAnalysis(analysis: EmotionAnalysis, windowTag: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.EMOTION_ANALYSIS_PREFIX + windowTag, JSON.stringify(analysis));
  },

  async getThoughtPatternAnalysis(windowTag: string): Promise<ThoughtPatternAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.PATTERN_ANALYSIS_PREFIX + windowTag);
    return safeParse<ThoughtPatternAnalysis | null>(json, null);
  },
  async saveThoughtPatternAnalysis(analysis: ThoughtPatternAnalysis, windowTag: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PATTERN_ANALYSIS_PREFIX + windowTag, JSON.stringify(analysis));
  },

  async getPersonalityAnalysis(): Promise<PersonalityAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.PERSONALITY_ANALYSIS);
    return safeParse<PersonalityAnalysis | null>(json, null);
  },
  async savePersonalityAnalysis(analysis: PersonalityAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.PERSONALITY_ANALYSIS, JSON.stringify(analysis));
  },

  async getGrowthTipsAnalysis(): Promise<GrowthTipsAnalysis | null> {
    const json = await AsyncStorage.getItem(KEYS.GROWTH_TIPS_ANALYSIS);
    return safeParse<GrowthTipsAnalysis | null>(json, null);
  },
  async saveGrowthTipsAnalysis(analysis: GrowthTipsAnalysis): Promise<void> {
    await AsyncStorage.setItem(KEYS.GROWTH_TIPS_ANALYSIS, JSON.stringify(analysis));
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  async getGoals(): Promise<UserGoals | null> {
    const json = await AsyncStorage.getItem(KEYS.USER_GOALS);
    return safeParse<UserGoals | null>(json, null);
  },
  async saveGoals(goals: UserGoals): Promise<void> {
    await AsyncStorage.setItem(KEYS.USER_GOALS, JSON.stringify(goals));
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
      const existing: ExpenseEntry[] = safeParse<ExpenseEntry[]>(await AsyncStorage.getItem(key), []);
      // Two-layer deduplication:
      //  1. Transcript-level: if this transcript was already fully processed, skip all its entries
      //  2. Entry-level: if an entry with the same amount + date + category already exists
      //     (catches photo-vs-text double-counts and re-processing with new transcript IDs)
      const seenTranscripts = new Set(existing.map(e => e.sourceTranscriptId));
      const existingKeys = new Set(existing.map(e => `${Math.round(e.amount)}_${e.date}_${e.category}`));
      const fresh = batch.filter(e => {
        if (seenTranscripts.has(e.sourceTranscriptId)) return false;
        const key = `${Math.round(e.amount)}_${e.date}_${e.category}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key); // prevent within-batch duplicates too
        return true;
      });
      if (fresh.length === 0) continue;
      await AsyncStorage.setItem(key, JSON.stringify([...existing, ...fresh]));
    }
  },

  async getExpensesForMonth(yearMonth: string): Promise<ExpenseEntry[]> {
    const key = KEYS.EXPENSE_PREFIX + yearMonth;
    const json = await AsyncStorage.getItem(key);
    return safeParse<ExpenseEntry[]>(json, []);
  },

  // ── App lock PIN ────────────────────────────────────────────────────────────
  // PIN hash + per-install salt live in iOS Keychain / Android Keystore via
  // expo-secure-store. AsyncStorage may still hold a legacy djb2 hash from
  // pre-v2 installs; that gets transparently migrated to SecureStore the next
  // time the user successfully enters their PIN.

  /** Returns true if a PIN has been set (either v2 or pre-v2). */
  async hasPinSet(): Promise<boolean> {
    const v2 = await SecureStore.getItemAsync(SECURE_KEYS.PIN_HASH);
    if (v2 && v2.length > 0) return true;
    const legacy = await AsyncStorage.getItem(KEYS.APP_PIN_LEGACY);
    return legacy !== null && legacy.length > 0;
  },

  /** Hash + save a raw 4-digit PIN. */
  async savePin(rawPin: string): Promise<void> {
    const salt = await _getOrCreateSalt();
    const hash = await _hashPinV2(rawPin, salt);
    await SecureStore.setItemAsync(SECURE_KEYS.PIN_HASH, hash);
    // Drop any legacy hash so future verifications go through the v2 path.
    await AsyncStorage.removeItem(KEYS.APP_PIN_LEGACY);
  },

  /** Returns true if the raw PIN matches the stored hash. */
  async verifyPin(rawPin: string): Promise<boolean> {
    const v2Hash = await SecureStore.getItemAsync(SECURE_KEYS.PIN_HASH);
    if (v2Hash) {
      const salt = await _getOrCreateSalt();
      const candidate = await _hashPinV2(rawPin, salt);
      const ok = candidate === v2Hash;
      if (ok) {
        await AsyncStorage.removeItem(KEYS.APP_PIN_ATTEMPTS);
      }
      return ok;
    }

    // Fallback: legacy djb2 in AsyncStorage. On match, transparently migrate
    // to SecureStore + SHA-256 so the next verification uses v2.
    const legacy = await AsyncStorage.getItem(KEYS.APP_PIN_LEGACY);
    if (!legacy) return false;
    const ok = _legacyHashPin(rawPin) === legacy;
    if (ok) {
      try {
        const salt = await _getOrCreateSalt();
        const hash = await _hashPinV2(rawPin, salt);
        await SecureStore.setItemAsync(SECURE_KEYS.PIN_HASH, hash);
        await AsyncStorage.removeItem(KEYS.APP_PIN_LEGACY);
      } catch {
        // If migration fails (SecureStore unavailable), keep legacy hash so
        // the user isn't locked out — verification still works via fallback.
      }
      await AsyncStorage.removeItem(KEYS.APP_PIN_ATTEMPTS);
    }
    return ok;
  },

  /** Remove the stored PIN (disables app lock). */
  async removePin(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_KEYS.PIN_HASH).catch(() => {}),
      SecureStore.deleteItemAsync(SECURE_KEYS.PIN_SALT).catch(() => {}),
      AsyncStorage.multiRemove([KEYS.APP_PIN_LEGACY, KEYS.APP_PIN_ATTEMPTS]),
    ]);
  },

  // ── PIN lockout (brute-force protection) ──────────────────────────────────
  // Lockout schedule (milliseconds), indexed by attempt count.
  // First four wrong PINs are free; from the fifth onward we ramp.
  // Persisted across app kill so force-quit can't reset the counter.

  /**
   * Returns the current lockout state. `lockoutUntilMs === 0` means not locked.
   */
  async getPinLockoutState(): Promise<{ count: number; lockoutUntilMs: number }> {
    const raw = await AsyncStorage.getItem(KEYS.APP_PIN_ATTEMPTS);
    if (!raw) return { count: 0, lockoutUntilMs: 0 };
    try {
      const parsed = JSON.parse(raw);
      return {
        count: typeof parsed.count === 'number' ? parsed.count : 0,
        lockoutUntilMs: typeof parsed.lockoutUntilMs === 'number' ? parsed.lockoutUntilMs : 0,
      };
    } catch {
      return { count: 0, lockoutUntilMs: 0 };
    }
  },

  /**
   * Record a failed PIN attempt. Returns the new state, including a
   * `lockoutUntilMs` timestamp when the user should be allowed to try again.
   */
  async recordFailedPinAttempt(): Promise<{ count: number; lockoutUntilMs: number }> {
    const current = await this.getPinLockoutState();
    const count = current.count + 1;
    // Exponential backoff after the 4th wrong attempt.
    // 5→30s, 6→1m, 7→5m, 8→15m, 9+→1h.
    const lockoutMs = (() => {
      if (count < 5) return 0;
      if (count === 5) return 30_000;
      if (count === 6) return 60_000;
      if (count === 7) return 5 * 60_000;
      if (count === 8) return 15 * 60_000;
      return 60 * 60_000;
    })();
    const lockoutUntilMs = lockoutMs > 0 ? Date.now() + lockoutMs : 0;
    const next = { count, lockoutUntilMs };
    await AsyncStorage.setItem(KEYS.APP_PIN_ATTEMPTS, JSON.stringify(next));
    return next;
  },

  // ── Wisdom Shorts ───────────────────────────────────────────────────────────

  async getSavedShorts(): Promise<SavedShort[]> {
    const json = await AsyncStorage.getItem(KEYS.WISDOM_SAVED);
    return safeParse<SavedShort[]>(json, []);
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

    // One-time migration: convert legacy string entries to object form.
    // We gate on a separate flag so this write only happens once, not on every read.
    const hasLegacy = raw.some(e => typeof e === 'string');
    const migrated: Array<{ id: string; seenAt: number }> = raw.map(e =>
      typeof e === 'string' ? { id: e, seenAt: 0 } : e,
    );
    if (hasLegacy) {
      const alreadyMigrated = await AsyncStorage.getItem(KEYS.WISDOM_SEEN_MIGRATED);
      if (!alreadyMigrated) {
        const capped = migrated.length > 400 ? migrated.slice(-400) : migrated;
        AsyncStorage.setItem(KEYS.WISDOM_SEEN, JSON.stringify(capped)).catch(() => {});
        AsyncStorage.setItem(KEYS.WISDOM_SEEN_MIGRATED, '1').catch(() => {});
      }
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
    return safeParse<JournalSignal | null>(json, null);
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
    return safeParse<WisdomShort[]>(json, []);
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

  // ── Sign-out cleanup ────────────────────────────────────────────────────────
  /**
   * Wipes every AsyncStorage key that belongs to the previously signed-in user.
   * Preserves Supabase-managed auth tokens (`sb-*`) and the device-level
   * onboarding flag — everything else is user data and must not survive a
   * different account signing in on the same device.
   *
   * Allowlist keys to keep, not the other way round, so any new per-user key
   * added later is cleared by default.
   */
  async clearAllUserData(): Promise<void> {
    const PRESERVE_KEYS = new Set<string>(['onboarding_complete']);
    const PRESERVE_PREFIXES = ['sb-']; // Supabase auth tokens
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter(
      k => !PRESERVE_KEYS.has(k) && !PRESERVE_PREFIXES.some(p => k.startsWith(p)),
    );
    await Promise.all([
      toRemove.length > 0 ? AsyncStorage.multiRemove(toRemove) : Promise.resolve(),
      // SecureStore is outside AsyncStorage — must be cleared explicitly,
      // otherwise the prior user's PIN hash + salt persist for the next user.
      SecureStore.deleteItemAsync(SECURE_KEYS.PIN_HASH).catch(() => {}),
      SecureStore.deleteItemAsync(SECURE_KEYS.PIN_SALT).catch(() => {}),
    ]);
  },
};
