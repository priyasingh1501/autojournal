import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { StorageService } from './StorageService';
import { generateDailySummary } from './SummaryService';

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

// ─── Schedule nightly silent trigger at 23:59 ───────────────────────────────
// This fires the generation process. A separate "ready" notification is sent
// once the summary has actually been created.

export async function scheduleNightlyNotification(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NIGHTLY_NOTIFICATION_ID);
  } catch {}

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: NIGHTLY_NOTIFICATION_ID,
    content: {
      title: 'untangle',
      body: 'Generating your daily summary…',
      data: { action: 'generate-summary' },
      // Keep silent — the "ready" notification will appear once done
      sound: false,
      ...(Platform.OS === 'android' && { channelId: NOTIFICATION_CHANNEL }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 23,
      minute: 59,
    },
  });
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
 * Silently generates a summary for `date` if:
 *   - an Anthropic API key is configured
 *   - there are entries for that date
 *   - no summary exists yet
 * Returns the new summary or null if nothing was generated.
 */
export async function generateIfNeeded(date: string): Promise<boolean> {
  try {
    const settings = await StorageService.getSettings();
    if (!settings?.anthropicApiKey) return false;

    const existing = await StorageService.getSummaryForDate(date);
    if (existing) return false; // already done

    const transcripts = await StorageService.getTranscriptsForDate(date);
    if (transcripts.length === 0) return false;

    await generateDailySummary(transcripts, date);

    // Generation succeeded — notify the user that their summary is ready
    await sendSummaryReadyNotification(date);
    return true;
  } catch {
    return false;
  }
}

/**
 * Called on every app launch / foreground resume.
 * - Auto-generates today's summary if it's 23:55 or later
 * - Auto-generates yesterday's summary if the app wasn't open at midnight
 */
export async function checkAndAutoGenerate(): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 86_400_000).toISOString().split('T')[0];

  const hour = now.getHours();
  const minute = now.getMinutes();
  const isNearMidnight = hour === 23 && minute >= 55;

  // Near midnight → generate today's
  if (isNearMidnight) {
    generateIfNeeded(todayStr); // fire-and-forget, no await so it doesn't block UI
  }

  // Always try yesterday in case the app was closed at 11:59 PM
  generateIfNeeded(yesterdayStr);
}
