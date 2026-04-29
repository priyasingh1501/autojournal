/**
 * AnalyticsService — thin wrapper around PostHog.
 *
 * Usage:
 *   Analytics.track('recording_completed', { duration_ms: 4200 });
 *   Analytics.identify(userId);
 *   Analytics.reset();
 *
 * Replace POSTHOG_API_KEY with your project key from posthog.com → Project Settings → API Keys.
 */

import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = 'phc_CwxC4JQYRrB73nmmJvYbrXscwTyvyTawkuz235egRuEE'; // replace with your key
const POSTHOG_HOST    = 'https://us.i.posthog.com';

let _client: PostHog | null = null;

export function initAnalytics(): void {
  if (_client) return;
  try {
    _client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 20,      // batch events before sending to reduce network overhead
      flushInterval: 30_000,
    });
    _client.ready().catch(e => {
      console.warn('[PostHog] ready() error:', e);
    });
  } catch (e) {
    console.warn('[PostHog] Init failed:', e);
  }
}

function client(): PostHog | null {
  return _client;
}

// ── Identity ──────────────────────────────────────────────────────────────────

export function analyticsIdentify(userId: string, traits?: Record<string, any>): void {
  client()?.identify(userId, traits);
}

export function analyticsReset(): void {
  client()?.reset();
}

// ── Screen tracking ───────────────────────────────────────────────────────────

export function analyticsScreen(screenName: string): void {
  client()?.screen(screenName);
}

// ── Event tracking ────────────────────────────────────────────────────────────

/**
 * Strongly-typed event props catalog for the redesign (Phases 1–6).
 *
 * Events listed here REQUIRE their declared property shape — future phases
 * can't drift from this catalog without a type error. Events not in this map
 * fall through to the loose `AnalyticsEvent` overload below.
 */
export interface AnalyticsEventProps {
  patterns_tab_viewed: undefined;
  patterns_section_viewed: { section: string };
  patterns_observation_dismissed: { section: string; reason: 'not_quite' | 'too_soft' };
  patterns_more_expanded: undefined;
  patterns_regenerated: { entry_count: number };
  day_summary_prose_viewed: undefined;
  day_summary_breakdown_expanded: undefined;
  week_review_opened: undefined;
  letter_opened: { half: 'H1' | 'H2'; year: number };
  intention_declared: { source: 'manual' | 'detected' };
  intention_mentioned: { intention_id: string; day: string };
  sit_with_this_opened: { source: 'patterns' | 'day_summary'; mind_id: string };
  curation_rule_fired: { rule: string; specialists: string[]; source_surface: string; pattern_type?: string };
  handoff_offered: { from: string; to: string };
  handoff_accepted: { to: string };
  handoff_declined: { to: string; reason: 'stay' | 'not_yet' };
  // Onboarding funnel
  onboarding_step_viewed: { step: number };
  onboarding_completed: undefined;
  // Compose modal
  compose_modal_opened: { is_edit: boolean };
  compose_modal_dismissed: { saved: boolean };
  // Wellbeing distress modal
  wellbeing_modal_shown: { tier: number };
  wellbeing_modal_responded: { tier: number; action: 'continue' | 'dismiss' | 'false_positive' };
  // Mind picker
  mind_selected: { mind_id: string; source: string };
  // Failures (soft, non-crashing — not captured by Sentry)
  wisdom_image_failed: { short_id: string; reason: string };
  transcription_failed: { reason: string };
  call_connect_failed: { mind_id: string; reason: string };
  // App updates (Android only)
  app_update_prompt_shown: undefined;
  app_update_installed: undefined;
  // PIN lock
  pin_setup_completed: undefined;
  pin_unlocked: { method: 'pin' | 'biometric' };
  // Wisdom feed engagement
  wisdom_short_viewed: { short_id: string; position: number; dwell_ms_previous: number };
  wisdom_session_ended: { shorts_viewed: number; max_position: number; total_dwell_ms: number };
}

export type RedesignEvent = keyof AnalyticsEventProps;

// Typed overload: redesign events must pass their declared props (or no props
// if the event's value is `undefined`).
export function track<E extends RedesignEvent>(
  event: E,
  ...args: AnalyticsEventProps[E] extends undefined
    ? [properties?: undefined]
    : [properties: AnalyticsEventProps[E]]
): void;
// Loose overload: existing events keep their prior `Record<string, any>` shape.
export function track(event: AnalyticsEvent, properties?: Record<string, any>): void;
export function track(event: string, properties?: Record<string, any>): void {
  client()?.capture(event, properties);
}

// ── Typed event names ─────────────────────────────────────────────────────────

export type AnalyticsEvent =
  // Auth
  | 'user_signed_up'
  | 'user_signed_in'
  | 'user_signed_out'
  // Journaling
  | 'recording_started'
  | 'recording_completed'
  | 'manual_note_created'
  // Summaries
  | 'summary_viewed'
  | 'summary_generated'
  | 'summary_shared'
  // AI conversations
  | 'talk_session_started'
  | 'talk_session_ended'
  | 'chat_session_started'
  | 'chat_session_ended'
  // Wisdom
  | 'wisdom_short_saved'
  | 'wisdom_short_unsaved'
  | 'wisdom_short_shared'
  | 'wisdom_short_reflected'
  | 'wisdom_stance_surfaced'  // stance × loopState × placement
  | 'mood_selected'
  // Subscription
  | 'paywall_shown'
  | 'subscription_purchased'
  // Redesign (Phases 1–6) — see AnalyticsEventProps for required props
  | RedesignEvent;
