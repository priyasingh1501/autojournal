/**
 * UserContextService — shared, derived view of who the user is right now.
 *
 * All systems (journaling, summaries, patterns, wisdom, AI chat,
 * notifications) read from their own stores independently. This service
 * synthesizes those stores into a single lightweight snapshot so every
 * system can act with shared memory — without coupling the stores together.
 *
 * Design rules:
 *   - Derived only. Never primary storage. Reads from existing stores, never writes to them.
 *   - Cheap. All sources are local AsyncStorage; no AI calls.
 *   - Resilient. Each source is read independently; one failure never breaks the rest.
 *   - Cached. Rebuilt once per app session (or explicitly invalidated after a new entry).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { getRecentDistressEvents } from './WellbeingService';
import { getActiveIntentions } from './IntentionsService';
import { getCachedReport } from './PatternsService';
import { getRecentMindConversations } from './ConversationHistoryService';
import {
  deriveWellbeingState,
  computeTenureDays,
  buildRecentDaysProse,
  fitContextToBudget,
  INSTRUCTIONS,
} from './userContextBuilder';
import type { UserContextV2 } from '../types';

// ── Build ──────────────────────────────────────────────────────────────────────

const V2_CACHE_KEY = 'user_context_v2_cache';
const V2_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

let _memCacheV2: UserContextV2 | null = null;

async function buildV2(): Promise<UserContextV2> {
  const now = Date.now();

  // recentDays — last 3 Day Summaries' reflection field
  let recentDays = '';
  try {
    const dates = await StorageService.getSummaryDates();
    const last3 = dates.slice(0, 3);
    const summaries = await StorageService.getSummariesForDateRange(last3);
    const reflections = summaries
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(s => ({
        date: s.date,
        reflection: (s.reflection ?? s.insightText ?? s.summary ?? '').trim(),
      }));
    recentDays = buildRecentDaysProse(reflections, 3);
  } catch { /* ignore */ }

  // activeIntentions — cap at 5
  let activeIntentions: UserContextV2['activeIntentions'] = [];
  try {
    const actives = await getActiveIntentions();
    activeIntentions = actives.slice(0, 5).map(i => ({ id: i.id, text: i.text }));
  } catch { /* ignore */ }

  // currentPatterns — top 2–3 acrossTime observations from the latest report
  let currentPatterns: UserContextV2['currentPatterns'] = [];
  try {
    const report = await getCachedReport();
    if (report) {
      currentPatterns = report.acrossTime.slice(0, 3).map(o => ({ type: o.type, body: o.body }));
    }
  } catch { /* ignore */ }

  // wellbeingState — derived from distress events in last 14 days
  let wellbeingState: UserContextV2['wellbeingState'] = 'regulated';
  try {
    const events = await getRecentDistressEvents(14);
    wellbeingState = deriveWellbeingState(
      events.map(e => ({ timestamp: e.timestamp, tier: e.tier })),
      now,
    );
  } catch { /* defaults to regulated */ }

  // recentMinds — last 30 days, distinct per mind, shape pre-cached
  let recentMinds: UserContextV2['recentMinds'] = [];
  try {
    recentMinds = await getRecentMindConversations(30, 5);
  } catch { /* ignore */ }

  // tenureDays — days since first entry
  let tenureDays = 0;
  try {
    const allDates = await StorageService.getTranscriptDates();
    if (allDates.length > 0) {
      const oldest = allDates[allDates.length - 1];
      const firstTs = new Date(oldest + 'T12:00:00').getTime();
      tenureDays = computeTenureDays(firstTs, now);
    }
  } catch { /* ignore */ }

  return {
    recentDays,
    activeIntentions,
    currentPatterns,
    wellbeingState,
    recentMinds,
    tenureDays,
    builtAt: now,
  };
}

/**
 * Fetch the user context. Cached in-memory + AsyncStorage for TTL;
 * `force = true` rebuilds immediately.
 */
export async function getUserContextV2(force = false): Promise<UserContextV2> {
  if (!force && _memCacheV2 && (Date.now() - _memCacheV2.builtAt) < V2_CACHE_TTL) {
    return _memCacheV2;
  }
  if (!force) {
    try {
      const raw = await AsyncStorage.getItem(V2_CACHE_KEY);
      if (raw) {
        const cached: UserContextV2 = JSON.parse(raw);
        if ((Date.now() - cached.builtAt) < V2_CACHE_TTL) {
          _memCacheV2 = cached;
          return cached;
        }
      }
    } catch { /* ignore */ }
  }
  const fresh = await buildV2();
  _memCacheV2 = fresh;
  AsyncStorage.setItem(V2_CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
  return fresh;
}

/**
 * Invalidate the cache — call after a new transcript entry is saved so the
 * next read reflects the updated state.
 */
export function invalidateUserContext(): void {
  _memCacheV2 = null;
  AsyncStorage.removeItem(V2_CACHE_KEY).catch(() => {});
}

/**
 * Legacy-compatible object wrapper. BatchTranscription and other callers
 * still use `UserContextService.invalidate()` — keep that surface.
 */
export const UserContextService = {
  invalidate: invalidateUserContext,
};

// ── Prompt renderer ────────────────────────────────────────────────────────────

/**
 * Render the context block for injection into a Claude system prompt.
 * Enforces the 400-token budget via fitContextToBudget — an over-long
 * context is trimmed rather than silently bloating spend.
 */
export function buildUserContextPromptV2(ctx: UserContextV2): string {
  const { rendered } = fitContextToBudget(ctx, 400);
  return rendered;
}

/**
 * The extra continuity-aware instruction Companion (the null-persona mind)
 * gets on top of the shared implicit-context rule.
 */
export const COMPANION_CONTINUITY_INSTRUCTION = INSTRUCTIONS.companionContinuity;

/**
 * Entry point used by ConversationService — returns the rendered context
 * block with Companion continuity line appended when appropriate.
 */
export async function getContextPromptForConversation(mindId?: string | null): Promise<string> {
  const ctx = await getUserContextV2();
  let block = buildUserContextPromptV2(ctx);
  if (mindId === null || mindId === undefined || mindId === 'companion') {
    block += '\n' + COMPANION_CONTINUITY_INSTRUCTION;
  }
  return block;
}
