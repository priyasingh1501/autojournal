import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { StorageService } from './StorageService';
import { generateDailySummary } from './SummaryService';
import { effectiveTodayStr, effectiveDateStr } from './dayRollover';

const NOTIFICATION_CHANNEL = 'daily-summary';
const NIGHTLY_NOTIFICATION_ID = 'nightly-summary-trigger';
const READY_NOTIFICATION_ID = 'summary-ready';

// ─── Permissions ────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Android notification channel ───────────────────────────────────────────

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
      name: 'Daily Summary',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }
}

// ─── Nightly notification removed ───────────────────────────────────────────
// The 11:59 PM notification claimed to be "Generating your daily summary…" but
// JS never runs when the app is closed — so it was misleading. The morning
// app-open (checkAndAutoGenerate → generateIfNeeded yesterday, regenerate=true)
// is now the reliable end-of-day finisher. No nightly notification needed.

export async function scheduleNightlyNotification(): Promise<void> {
  // Cancel any previously scheduled nightly notification so old builds don't
  // keep showing the misleading "Generating…" message.
  try {
    await Notifications.cancelScheduledNotificationAsync(NIGHTLY_NOTIFICATION_ID);
  } catch {}
}

// ─── Send "summary ready" notification ──────────────────────────────────────

async function sendSummaryReadyNotification(date: string): Promise<void> {
  try {
    const label = date === new Date().toISOString().split('T')[0] ? "Today's" : date;
    await Notifications.scheduleNotificationAsync({
      identifier: READY_NOTIFICATION_ID,
      content: {
        title: 'Daily Summary',
        body: `${label} summary is ready. See how your day went.`,
        data: { action: 'view-summary' },
        ...(Platform.OS === 'android' && { channelId: NOTIFICATION_CHANNEL }),
      },
      trigger: null, // fire immediately
    });
  } catch {
    // Best-effort — don't let notification failure block the caller
  }
}

// ─── Auto-generate logic ─────────────────────────────────────────────────────

/**
 * Silently generates (or regenerates) a summary for `date`.
 *
 * - Normal mode (regenerate=false): only runs if no summary exists yet.
 *   Used for first-entry generation throughout the day.
 *
 * - Regenerate mode (regenerate=true): runs even if a summary already exists,
 *   but only if there are entries newer than the existing summary (stale).
 *   Used for the end-of-day nightly trigger.
 *
 * Returns true if a summary was created/updated.
 */
export async function generateIfNeeded(date: string, regenerate = false): Promise<boolean> {
  try {
    const transcripts = await StorageService.getTranscriptsForDate(date);
    if (transcripts.length === 0) return false;

    const existing = await StorageService.getSummaryForDate(date);

    if (!regenerate) {
      // First-entry mode: skip if a summary already exists
      if (existing) return false;
    } else {
      // End-of-day mode: skip if summary is already up-to-date (no stale entries)
      if (existing) {
        const summaryCreatedAt = existing.createdAt ?? 0;
        const hasStale = transcripts.some(t => t.timestamp > summaryCreatedAt);
        if (!hasStale) return false;
      }
    }

    await generateDailySummary(transcripts, date);

    // Only notify for today's first-ever summary — not for background catch-up of
    // old dates (regenerate=true path) or for regenerations of existing summaries.
    const todayStr = new Date().toISOString().split('T')[0];
    if (!existing && !regenerate && date === todayStr) {
      await sendSummaryReadyNotification(date);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Called on every app launch / foreground resume.
 * - Near midnight (23:55+): regenerates today's summary to fold in all stale entries
 * - Always: generates/regenerates yesterday's summary if missing OR stale.
 *   Using regenerate=true here is the key catch-up for the nightly notification path:
 *   if the app was closed at 11:59 PM the JS listener never ran, so the first
 *   time the user opens the app the next day we finish the job here.
 *   generateIfNeeded with regenerate=true only hits the API when entries exist
 *   that are newer than the existing summary — safe to call on every app open.
 */
export async function checkAndAutoGenerate(): Promise<void> {
  const now = new Date();
  const todayStr = effectiveTodayStr();
  // Compute yesterday using local calendar date (noon avoids 3am rollover ambiguity)
  const localYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
  const yesterdayStr = effectiveDateStr(localYesterday.getTime());

  const hour = now.getHours();
  const minute = now.getMinutes();
  const isNearMidnight = hour === 23 && minute >= 55;

  // Near midnight → regenerate today's to include all entries recorded during the day
  if (isNearMidnight) {
    generateIfNeeded(todayStr, true); // fire-and-forget
  }

  // Yesterday: generate if missing, or regenerate if stale (entries newer than summary).
  // regenerate=true is safe — it no-ops when the summary is already up to date.
  generateIfNeeded(yesterdayStr, true);
}
