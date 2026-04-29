/**
 * DayCloseScheduler — schedules the 23:59 "day-close" notification. When
 * the notification fires:
 *   • Foreground: App.tsx's notification-received listener calls
 *     generateIfNeeded(today, regenerate=true) so the summary produces now.
 *   • Background/closed: the user sees the notification; tapping deep-links
 *     into the Journal tab, and AutoSummaryService.checkAndAutoGenerate
 *     (already wired on app foreground) finishes the job when they open the app.
 *
 * We schedule the next night's notification each time `ensureScheduled()`
 * is called (on app ready + on every foreground). Existing scheduled
 * notifications are cancelled before rescheduling so we never pile up.
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CHANNEL = 'daily-summary';             // existing channel from AutoSummaryService
const SCHEDULED_ID_KEY = 'day_close_notif_id';
const LAST_SCHEDULED_KEY = 'day_close_notif_last_target';

const TARGET_HOUR   = 23;
const TARGET_MINUTE = 59;

// Module-level lock prevents two concurrent foreground events (mount + AppState
// 'active') from both passing the LAST_SCHEDULED_KEY guard before either has
// written, which would otherwise schedule two day-close notifications.
let scheduleInFlight: Promise<void> | null = null;

function pad(n: number): string { return String(n).padStart(2, '0'); }

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date/time of the next 23:59 (today's if still upcoming, else tomorrow's). */
function nextFireDate(now: Date = new Date()): Date {
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), TARGET_HOUR, TARGET_MINUTE, 0, 0);
  if (fire.getTime() <= now.getTime()) {
    fire.setDate(fire.getDate() + 1);
  }
  return fire;
}

async function cancelExisting(): Promise<void> {
  const id = await AsyncStorage.getItem(SCHEDULED_ID_KEY);
  if (id) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* already fired */ }
    await AsyncStorage.removeItem(SCHEDULED_ID_KEY);
  }

  // Defensive sweep: cancel any orphaned summary_ready notifications whose
  // IDs we no longer track (storage cleared, reinstall, race during a previous
  // schedule call). Without this, the OS scheduler can hold a duplicate that
  // fires alongside the freshly scheduled one.
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const req of all) {
      const t = (req.content?.data as any)?.type as string | undefined;
      if (t === 'summary_ready') {
        try { await Notifications.cancelScheduledNotificationAsync(req.identifier); } catch {}
      }
    }
  } catch { /* best-effort */ }
}

/**
 * Ensure a 23:59 notification is scheduled for the next upcoming night.
 * Safe to call repeatedly — no-ops when a notification is already scheduled
 * for the same target date.
 */
export async function ensureDayCloseNotificationScheduled(): Promise<void> {
  // Coalesce concurrent calls onto the same in-flight promise to prevent
  // double-scheduling when mount and AppState 'active' fire near-simultaneously.
  if (scheduleInFlight) return scheduleInFlight;
  scheduleInFlight = (async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const fire = nextFireDate();
    const targetDate = localDateStr(fire);

    const lastTarget = await AsyncStorage.getItem(LAST_SCHEDULED_KEY);
    if (lastTarget === targetDate) return; // already scheduled for this night

    await cancelExisting();

    // The notification's data.date records which calendar date's summary
    // should be generated. Under the 3am rollover, this is the "day" the
    // user just finished — which is always `fire.date - 0 days` because
    // we fire at 23:59 (still before the rollover).
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your day is ready to look back on',
        body: 'I pulled your notes together — open when you have a minute.',
        data: { type: 'summary_ready', action: 'view-summary', date: targetDate },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      },
    });

    await AsyncStorage.setItem(SCHEDULED_ID_KEY, notifId);
    await AsyncStorage.setItem(LAST_SCHEDULED_KEY, targetDate);
  } catch {
    // Best-effort — the catch-up on next app open covers missed schedules.
  }
  })();
  try {
    await scheduleInFlight;
  } finally {
    scheduleInFlight = null;
  }
}

/** Cancel any pending day-close notification. Called when the flag flips off. */
export async function cancelDayCloseNotification(): Promise<void> {
  try {
    await cancelExisting();
    await AsyncStorage.removeItem(LAST_SCHEDULED_KEY);
  } catch { /* best-effort */ }
}
