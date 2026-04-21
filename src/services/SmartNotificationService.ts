/**
 * SmartNotificationService — One personalized notification per day.
 *
 * Priority queue (highest wins):
 *   1. Wellbeing follow-up  — pending re-entry check-in (tier 2/3)
 *   2. Emotional follow-up  — yesterday's summary had anxious/stressed/sad/overwhelmed tags
 *   5. Tracker nudge        — enabled tracker with no mention in today's entries
 *   6. Wisdom short         — matched to emotional state from last summary
 *   7. Generic fallback     — simple evening reflection
 *
 * Scheduling:
 *   - Call scheduleSmartNotifications() on app foreground each day.
 *   - Cancels any previously scheduled "smart" notification before scheduling the new one.
 *   - Default time: 7:30 PM local; can be overridden via AppSettings.notificationTime.
 *   - If the scheduled time has already passed today, schedules for tomorrow.
 *
 * Deep-link payloads:
 *   - Wisdom short: { type: 'wisdom_short', shortId: string }
 *   - Others: { type: string }
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import {
  getPendingReentry,
  isWellbeingEnabled,
} from './WellbeingService';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import type { WisdomShort } from '../types';

// ── Constants ──────────────────────────────────────────────────────────────────

const SCHEDULED_ID_KEY = 'smart_notification_scheduled_id';
const LAST_SCHEDULED_KEY = 'smart_notification_last_date';
const DEFAULT_NOTIFICATION_HOUR = 19;
const DEFAULT_NOTIFICATION_MINUTE = 30;

// Emotion tags (from BatchTranscriptionService EMOTION_SET) that warrant follow-up
const DISTRESS_EMOTIONS = new Set(['anxious', 'stressed', 'sad', 'overwhelmed', 'lonely', 'frustrated']);

// Maps emotion tags → wisdom short emotional_states for matching
const EMOTION_TO_SIGNAL: Record<string, string[]> = {
  anxious:     ['anxious', 'restless', 'worried'],
  stressed:    ['overwhelmed', 'anxious', 'restless'],
  sad:         ['hopeless', 'grieving', 'numb'],
  overwhelmed: ['overwhelmed', 'anxious', 'scattered'],
  lonely:      ['lonely', 'isolated', 'disconnected'],
  frustrated:  ['angry', 'resentful', 'frustrated'],
  hopeful:     ['curious', 'seeking', 'open'],
  grateful:    ['content', 'reflective', 'open'],
  excited:     ['curious', 'seeking', 'restless'],
  calm:        ['content', 'reflective', 'open'],
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotificationCandidate {
  priority: number;
  title: string;
  body: string;
  data: Record<string, string>;
}

// ── Notification channel setup (Android) ──────────────────────────────────────

export async function configureNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync('smart-daily', {
    name: 'Daily Reflections',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8B5CF6',
  });
}

// ── Permission request ─────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Cancel previous scheduled notification ────────────────────────────────────

async function cancelPreviousSmartNotification(): Promise<void> {
  const id = await AsyncStorage.getItem(SCHEDULED_ID_KEY);
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired or cancelled — ignore
    }
    await AsyncStorage.removeItem(SCHEDULED_ID_KEY);
  }
}

// ── Build notification candidates ─────────────────────────────────────────────

async function buildCandidates(): Promise<NotificationCandidate[]> {
  const candidates: NotificationCandidate[] = [];

  // ── 1. Wellbeing follow-up ────────────────────────────────────────────────
  try {
    const wellbeingEnabled = await isWellbeingEnabled();
    if (wellbeingEnabled) {
      const pending = await getPendingReentry();
      if (pending) {
        const message = pending.tier === 3
          ? 'Checking in — how are you feeling today? You can always talk it through.'
          : 'How are you doing since yesterday? A quick voice note can help you process.';
        candidates.push({
          priority: 1,
          title: 'How are you feeling today?',
          body: message,
          data: { type: 'wellbeing_reentry', tier: String(pending.tier) },
        });
      }
    }
  } catch { /* never block on wellbeing errors */ }

  // ── 1.5. Week review ready (Sunday evening only) ──────────────────────────
  // Only fires when today is Sunday AND the user logged at least 3 days in
  // the current week. The payload routes to the Journal tab with the Week
  // view pre-selected.
  try {
    const now = new Date();
    if (now.getDay() === 0) {
      // This week's Monday (local) — matches mondayOf() in SummaryService.
      const monday = new Date(now);
      const dow = now.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      monday.setDate(now.getDate() + diff);
      const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

      const weekDates: string[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });

      // Count days with at least one entry — cheap check via transcript dates.
      const allTranscriptDates = await StorageService.getTranscriptDates();
      const loggedDays = weekDates.filter(d => allTranscriptDates.includes(d)).length;

      if (loggedDays >= 3) {
        candidates.push({
          priority: 1.5,
          title: 'Your week is ready to look back on',
          body: 'Seven days of notes. Tap to see what the week held.',
          data: { type: 'week_review_ready', weekStart },
        });
      }
    }
  } catch { /* ignore */ }

  // ── 2. Emotional follow-up from yesterday's summary ───────────────────────
  try {
    const _yd = new Date(); _yd.setDate(_yd.getDate() - 1);
    const yesterday = `${_yd.getFullYear()}-${String(_yd.getMonth() + 1).padStart(2, '0')}-${String(_yd.getDate()).padStart(2, '0')}`;
    const summary = await StorageService.getSummaryForDate(yesterday);
    if (summary) {
      const transcripts = await StorageService.getTranscriptsForDate(yesterday);
      const tags: string[] = transcripts.flatMap(t => t.emotionTags ?? []);
      const distressTags = tags.filter(t => DISTRESS_EMOTIONS.has(t));
      if (distressTags.length > 0) {
        const tag = distressTags[0];
        const messages: Record<string, { title: string; body: string }> = {
          anxious:     { title: 'How are you sitting with it?', body: 'Yesterday felt anxious. A moment to check in — has anything shifted?' },
          stressed:    { title: 'Breathing a little easier today?', body: 'Yesterday had some stress in it. How\'s today starting?' },
          sad:         { title: 'Still with you?', body: 'Yesterday felt heavy. You don\'t have to carry it alone — tap to voice it out.' },
          overwhelmed: { title: 'One thing at a time', body: 'Yesterday felt like a lot. Even 30 seconds of reflection can help ground you.' },
          lonely:      { title: 'A moment with yourself', body: 'Yesterday had a quiet ache to it. Your journal is always here.' },
          frustrated:  { title: 'How\'s the tension today?', body: 'Yesterday felt frustrating. Sometimes naming it again helps it move.' },
        };
        const msg = messages[tag] ?? { title: 'How are you today?', body: 'Yesterday had some weight to it. How are you feeling now?' };
        candidates.push({
          priority: 2,
          title: msg.title,
          body: msg.body,
          data: { type: 'emotional_followup', emotion: tag },
        });
      }
    }
  } catch { /* ignore */ }

  // ── 5. Tracker nudge ─────────────────────────────────────────────────────
  try {
    const settings = await StorageService.getSettings();
    const trackers = settings?.enabledTrackers ?? [];
    if (trackers.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const todayTranscripts = await StorageService.getTranscriptsForDate(today);
      const todayText = todayTranscripts.map(t => t.text.toLowerCase()).join(' ');

      const trackerConfig: Record<string, { keywords: string[]; title: string; body: string }> = {
        meals:      { keywords: ['eat', 'ate', 'lunch', 'dinner', 'breakfast', 'food', 'meal'], title: 'Log your meals today?', body: 'Tap to voice a quick food note before the day ends.' },
        workout:    { keywords: ['workout', 'gym', 'run', 'exercise', 'walk', 'yoga', 'training'], title: 'Did you move today?', body: 'A quick note about your workout helps track consistency.' },
        meditation: { keywords: ['meditat', 'breath', 'mindful', 'calm', 'centered', 'practice'], title: 'Meditate today?', body: 'Even a 2-minute session counts — did you make space for stillness?' },
        spending:   { keywords: ['spent', 'bought', 'paid', 'purchase', 'expense', 'cost', 'money'], title: 'Any spending today?', body: 'Quick voice note on today\'s expenses — takes 10 seconds.' },
      };

      for (const tracker of trackers) {
        const cfg = trackerConfig[tracker];
        if (!cfg) continue;
        const mentioned = cfg.keywords.some(kw => todayText.includes(kw));
        if (!mentioned) {
          candidates.push({
            priority: 5,
            title: cfg.title,
            body: cfg.body,
            data: { type: 'tracker_nudge', tracker },
          });
          break; // one tracker nudge per day
        }
      }
    }
  } catch { /* ignore */ }

  // ── 6. Wisdom short matched to emotional state ────────────────────────────
  try {
    const _yd2 = new Date(); _yd2.setDate(_yd2.getDate() - 1);
    const yesterday = `${_yd2.getFullYear()}-${String(_yd2.getMonth() + 1).padStart(2, '0')}-${String(_yd2.getDate()).padStart(2, '0')}`;
    const transcripts = await StorageService.getTranscriptsForDate(yesterday);
    const tags: string[] = transcripts.flatMap(t => t.emotionTags ?? []);

    const targetSignals = tags.flatMap(t => EMOTION_TO_SIGNAL[t] ?? []);
    const uniqueSignals = [...new Set(targetSignals)];

    let matched: WisdomShort | null = null;

    if (uniqueSignals.length > 0) {
      // Score shorts by overlap with emotional signals
      const scored = SHORTS_LIBRARY.map(s => {
        const overlap = s.emotional_states.filter(e => uniqueSignals.includes(e)).length;
        return { short: s, score: overlap };
      }).filter(s => s.score > 0);

      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score);
        matched = scored[0].short;
      }
    }

    // Fallback: pick a deterministic short if no signal match
    if (!matched && SHORTS_LIBRARY.length > 0) {
      const _d = new Date();
      const seed = _d.getFullYear() * 10000 + (_d.getMonth() + 1) * 100 + _d.getDate();
      matched = SHORTS_LIBRARY[seed % SHORTS_LIBRARY.length] ?? null;
    }

    if (matched) {
      candidates.push({
        priority: 6,
        title: matched.title,
        body: `${matched.short.slice(0, 100)}…`,
        data: { type: 'wisdom_short', shortId: matched.id },
      });
    }
  } catch { /* ignore */ }

  // ── 7. Generic fallback ───────────────────────────────────────────────────
  const fallbackMessages = [
    { title: 'How was your day?', body: 'Take 30 seconds to voice it — even the quiet days are worth capturing.' },
    { title: 'Evening check-in', body: 'What\'s one thing on your mind right now? Tap the mic and let it out.' },
    { title: 'Before you wind down', body: 'A quick voice note now makes tomorrow\'s you grateful.' },
    { title: 'One moment for yourself', body: 'Your journal is waiting. Even a single thought counts.' },
  ];
  const dayIndex = new Date().getDay();
  const fallback = fallbackMessages[dayIndex % fallbackMessages.length];
  candidates.push({
    priority: 7,
    title: fallback.title,
    body: fallback.body,
    data: { type: 'generic_reflection' },
  });

  return candidates;
}

// ── Main scheduling function ───────────────────────────────────────────────────

/**
 * Schedule a single smart notification for today (or tomorrow if time has passed).
 * Safe to call on every foreground — skips if already scheduled for today.
 *
 * @param notificationTimeOverride  Optional "HH:MM" string (from settings). Defaults to 19:30.
 */
export async function scheduleSmartNotifications(
  notificationTimeOverride?: string,
): Promise<void> {
  try {
    // ── Check permission ────────────────────────────────────────────────────
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // ── Skip if already scheduled today (use local date, not UTC) ──────────
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
    const lastScheduled = await AsyncStorage.getItem(LAST_SCHEDULED_KEY);
    if (lastScheduled === today) return;

    // ── Cancel previous ─────────────────────────────────────────────────────
    await cancelPreviousSmartNotification();

    // ── Build candidates and pick highest priority ─────────────────────────
    const candidates = await buildCandidates();
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.priority - b.priority);
    const chosen = candidates[0];

    // ── Determine fire time ─────────────────────────────────────────────────
    let hour = DEFAULT_NOTIFICATION_HOUR;
    let minute = DEFAULT_NOTIFICATION_MINUTE;

    if (notificationTimeOverride) {
      const parts = notificationTimeOverride.split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1] ?? '0', 10);
      if (!isNaN(h) && !isNaN(m)) {
        hour = h;
        minute = m;
      }
    }

    const now = new Date();
    const fireDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
    );

    // If time has already passed today, schedule for tomorrow
    if (fireDate <= now) {
      fireDate.setDate(fireDate.getDate() + 1);
    }

    // ── Schedule ────────────────────────────────────────────────────────────
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: chosen.title,
        body: chosen.body,
        data: chosen.data,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });

    await AsyncStorage.setItem(SCHEDULED_ID_KEY, notificationId);
    await AsyncStorage.setItem(LAST_SCHEDULED_KEY, today);
  } catch (err) {
    console.warn('[SmartNotification] scheduling failed:', err);
  }
}

/**
 * Cancel all smart notifications — call when user disables notifications in settings.
 */
export async function cancelSmartNotifications(): Promise<void> {
  await cancelPreviousSmartNotification();
  await AsyncStorage.removeItem(LAST_SCHEDULED_KEY);
}
