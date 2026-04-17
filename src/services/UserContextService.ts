/**
 * UserContextService — shared, derived view of who the user is right now.
 *
 * All six systems (journaling, summaries, insights, wisdom, AI chat,
 * notifications) read from their own stores independently. This service
 * synthesizes those stores into a single lightweight snapshot so every
 * system can act with shared memory — without coupling the stores together.
 *
 * Design rules:
 *   - Derived only. Never primary storage. Reads from existing stores, never writes to them.
 *   - Cheap. All sources are local AsyncStorage; no AI calls.
 *   - Resilient. Each source is read independently; one failure never breaks the rest.
 *   - Cached. Rebuilt once per app session (or explicitly invalidated after a new entry).
 *
 * Usage:
 *   const ctx = await UserContextService.get();
 *   const prompt = buildContextPrompt(ctx);  // injects into AI chat system prompt
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { getRecentDistressEvents, DistressTier } from './WellbeingService';
import { SHORTS_LIBRARY } from '../data/shortsLibrary';
import { FeatureFlagsService } from './FeatureFlagsService';
import { getActiveIntentions } from './IntentionsService';
import { getCachedReport } from './PatternsService';
import { getRecentMindConversations } from './ConversationHistoryService';
import {
  deriveWellbeingState,
  computeTenureDays,
  buildRecentDaysProse,
  renderContextV2,
  fitContextToBudget,
  INSTRUCTIONS,
} from './userContextBuilder';
import type {
  HowYouThinkAnalysis,
  WhatYouCareAboutAnalysis,
  WhoYouAreAnalysis,
  YourStoryAnalysis,
  UserContextV2,
} from '../types';

// ── Type ───────────────────────────────────────────────────────────────────────

export interface UserContext {
  // Emotional state — last 3 days of emotionTags, deduplicated, most-frequent first
  dominantEmotions: string[];

  // Wellbeing — most recent distress tier from the last 7 days (null = no events)
  currentTier: DistressTier | null;

  // Who You Are — personality snapshot
  enneagramTypes: number[];           // candidate type numbers e.g. [4, 5]
  enneagramCoreFear: string | null;
  enneagramCoreDesire: string | null;
  personalityNarrative: string | null; // 3–4 sentence portrait
  bigFiveHighlights: string[];         // top 2 standout trait observations

  // Your Story — arc + current chapter
  storyArcType: string | null;         // e.g. "Seeker", "Builder"
  currentChapterTitle: string | null;  // e.g. "The Clearing"
  currentChapterNarrative: string | null;
  topSelfLabel: string | null;         // most frequent self-label

  // How You Think — decision style + cognitive profile
  decisionStyle: string | null;
  topCognitiveDimension: string | null; // e.g. "Systems vs. Stories — leans systems"
  dominantBias: string | null;          // most frequent bias pattern

  // Thinking — most recent repeating loop the user is stuck in (null = none / stale)
  activeLoop: string | null;
  activeLoopTrigger: string | null;

  // Values — top values + divergence
  topValues: string[];                  // top 3 by frequency
  valuesDivergence: { stated: string; actual: string; observation: string } | null;

  // Motivation — core driver from values analysis
  motivationPulse: string | null;

  // Narrative — last wisdom short the user reflected on
  lastReflectedShortId: string | null;

  // Summary — dominant theme from the most recent daily summary (first 120 chars)
  recentSummarySnippet: string | null;

  // Meta
  builtAt: number;
}

const CACHE_KEY = 'user_context_cache';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours — rebuilt if stale

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function topN<T extends string>(arr: T[], n: number): T[] {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item);
}

// ── Build ──────────────────────────────────────────────────────────────────────

async function build(): Promise<UserContext> {
  const ctx: UserContext = {
    dominantEmotions: [],
    currentTier: null,
    enneagramTypes: [],
    enneagramCoreFear: null,
    enneagramCoreDesire: null,
    personalityNarrative: null,
    bigFiveHighlights: [],
    storyArcType: null,
    currentChapterTitle: null,
    currentChapterNarrative: null,
    topSelfLabel: null,
    decisionStyle: null,
    topCognitiveDimension: null,
    dominantBias: null,
    activeLoop: null,
    activeLoopTrigger: null,
    topValues: [],
    valuesDivergence: null,
    motivationPulse: null,
    lastReflectedShortId: null,
    recentSummarySnippet: null,
    builtAt: Date.now(),
  };

  // ── 1. Dominant emotions — last 3 days of transcript emotionTags ───────────
  try {
    const dates = [localDateString(0), localDateString(1), localDateString(2)];
    const transcriptArrays = await Promise.all(
      dates.map(d => StorageService.getTranscriptsForDate(d).catch(() => [])),
    );
    const allTags: string[] = transcriptArrays
      .flat()
      .flatMap(t => t.emotionTags ?? []);
    ctx.dominantEmotions = topN(allTags, 3);
  } catch { /* ignore */ }

  // ── 2. Current wellbeing tier — most severe in last 7 days ────────────────
  try {
    const events = await getRecentDistressEvents(7);
    if (events.length > 0) {
      ctx.currentTier = events.reduce(
        (max, e) => (e.tier > max ? e.tier : max),
        1 as DistressTier,
      );
    }
  } catch { /* ignore */ }

  // ── 3. Who You Are — personality, enneagram, Big Five (max 60-day staleness)
  try {
    const raw = await AsyncStorage.getItem('insightv2_who');
    if (raw) {
      const analysis: WhoYouAreAnalysis = JSON.parse(raw);
      const ageDays = (Date.now() - analysis.generatedAt) / 86_400_000;
      if (ageDays <= 60) {
        ctx.personalityNarrative = analysis.narrative ?? null;
        if (analysis.enneagram) {
          ctx.enneagramTypes    = analysis.enneagram.types ?? [];
          ctx.enneagramCoreFear  = analysis.enneagram.coreFear ?? null;
          ctx.enneagramCoreDesire= analysis.enneagram.coreDesire ?? null;
        }
        // Pick the 2 most extreme Big Five traits as highlights
        if (analysis.bigFiveNarratives) {
          const highlights = Object.values(analysis.bigFiveNarratives).slice(0, 2);
          ctx.bigFiveHighlights = highlights;
        }
      }
    }
  } catch { /* ignore */ }

  // ── 4. Your Story — arc, chapter, self-labels (max 30-day staleness) ────────
  try {
    const raw = await AsyncStorage.getItem('insightv2_story');
    if (raw) {
      const analysis: YourStoryAnalysis = JSON.parse(raw);
      const ageDays = (Date.now() - analysis.generatedAt) / 86_400_000;
      if (ageDays <= 30) {
        ctx.storyArcType              = analysis.arcPattern?.type ?? null;
        ctx.currentChapterTitle       = analysis.currentChapter?.title ?? null;
        ctx.currentChapterNarrative   = analysis.currentChapter?.narrative ?? null;
        // Most frequent self-label
        if (analysis.selfLabels?.length) {
          const sorted = [...analysis.selfLabels].sort((a, b) => b.frequency - a.frequency);
          ctx.topSelfLabel = sorted[0].label;
        }
      }
    }
  } catch { /* ignore */ }

  // ── 5. How You Think — decision style, cognitive dims, biases, loops ─────────
  try {
    const raw = await AsyncStorage.getItem('insightv2_thinking');
    if (raw) {
      const analysis: HowYouThinkAnalysis = JSON.parse(raw);
      const ageDays = (Date.now() - analysis.generatedAt) / 86_400_000;
      if (ageDays <= 30) {
        if (analysis.repeatingLoops?.length) {
          ctx.activeLoop        = analysis.repeatingLoops[0].name;
          ctx.activeLoopTrigger = analysis.repeatingLoops[0].triggerPattern ?? null;
        }
        if (analysis.decisionStyle?.primaryStyle) {
          ctx.decisionStyle = analysis.decisionStyle.primaryStyle;
        }
        // Most extreme cognitive dimension (furthest from 50)
        if (analysis.dimensions?.length) {
          const extreme = [...analysis.dimensions].sort(
            (a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50),
          )[0];
          const pole = extreme.score < 50 ? extreme.leftLabel : extreme.rightLabel;
          ctx.topCognitiveDimension = `${extreme.name} — leans ${pole.toLowerCase()}`;
        }
        // Most dominant bias
        if (analysis.biasPatterns?.length) {
          const dominant = analysis.biasPatterns.find(b => b.frequency === 'dominant')
            ?? analysis.biasPatterns.find(b => b.frequency === 'frequent')
            ?? analysis.biasPatterns[0];
          ctx.dominantBias = dominant.name;
        }
      }
    }
  } catch { /* ignore */ }

  // ── 6. Values — top values list + divergence (max 14-day staleness) ──────────
  try {
    const raw = await AsyncStorage.getItem('insightv2_values');
    if (raw) {
      const analysis: WhatYouCareAboutAnalysis = JSON.parse(raw);
      const ageDays = (Date.now() - analysis.generatedAt) / 86_400_000;
      if (ageDays <= 14) {
        if (analysis.values?.length) {
          ctx.topValues = [...analysis.values]
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 3)
            .map(v => v.topic);
        }
        if (analysis.divergence?.length) {
          ctx.valuesDivergence = analysis.divergence[0];
        }
        if (analysis.motivationPulse) {
          ctx.motivationPulse = analysis.motivationPulse;
        }
      }
    }
  } catch { /* ignore */ }

  // ── 7. Last reflected wisdom short ────────────────────────────────────────
  try {
    const raw = await AsyncStorage.getItem('wisdom_last_reflected');
    if (raw) ctx.lastReflectedShortId = raw;
  } catch { /* ignore */ }

  // ── 8. Recent summary snippet ─────────────────────────────────────────────
  try {
    const summaryDates = await StorageService.getSummaryDates();
    if (summaryDates.length > 0) {
      const latest = await StorageService.getSummaryForDate(summaryDates[0]);
      if (latest) {
        ctx.recentSummarySnippet = (latest.insightText ?? latest.summary ?? '').slice(0, 160);
      }
    }
  } catch { /* ignore */ }

  return ctx;
}

// ── Cache ──────────────────────────────────────────────────────────────────────

let _memCache: UserContext | null = null;

export const UserContextService = {
  /**
   * Get the current UserContext. Returns cached value if fresh enough (< 4 h).
   * Pass `force = true` to rebuild immediately (e.g. right after a new entry is saved).
   */
  async get(force = false): Promise<UserContext> {
    // In-memory cache first (same session)
    if (!force && _memCache && (Date.now() - _memCache.builtAt) < CACHE_TTL) {
      return _memCache;
    }

    // Persisted cache (survives app restart within TTL)
    if (!force) {
      try {
        const json = await AsyncStorage.getItem(CACHE_KEY);
        if (json) {
          const cached: UserContext = JSON.parse(json);
          if ((Date.now() - cached.builtAt) < CACHE_TTL) {
            _memCache = cached;
            return cached;
          }
        }
      } catch { /* ignore */ }
    }

    // Rebuild
    const fresh = await build();
    _memCache = fresh;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
    return fresh;
  },

  /**
   * Invalidate the cache — call after a new transcript entry is saved so the
   * next get() reflects the updated emotional state.
   */
  invalidate(): void {
    _memCache = null;
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  },
};

// ── Prompt renderer ────────────────────────────────────────────────────────────

/**
 * Render UserContext as a compact block for injection into AI system prompts.
 * Returns an empty string if there's nothing meaningful to add.
 */
export function buildUserContextPrompt(ctx: UserContext): string {
  const lines: string[] = [];

  // ── Who they are ────────────────────────────────────────────────────────────
  if (ctx.personalityNarrative) {
    lines.push(`Personality: ${ctx.personalityNarrative}`);
  }
  if (ctx.enneagramTypes.length > 0) {
    const typeStr = ctx.enneagramTypes.join('/');
    const fear    = ctx.enneagramCoreFear   ? ` | core fear: ${ctx.enneagramCoreFear}`    : '';
    const desire  = ctx.enneagramCoreDesire ? ` | core desire: ${ctx.enneagramCoreDesire}` : '';
    lines.push(`Enneagram type ${typeStr}${fear}${desire}`);
  }
  if (ctx.bigFiveHighlights.length > 0) {
    lines.push(`Personality highlights: ${ctx.bigFiveHighlights.join(' · ')}`);
  }

  // ── Their story ─────────────────────────────────────────────────────────────
  if (ctx.storyArcType) {
    lines.push(`Life arc pattern: ${ctx.storyArcType}`);
  }
  if (ctx.currentChapterTitle && ctx.currentChapterNarrative) {
    lines.push(`Current life chapter — "${ctx.currentChapterTitle}": ${ctx.currentChapterNarrative}`);
  }
  if (ctx.topSelfLabel) {
    lines.push(`Recurring self-narrative: "${ctx.topSelfLabel}"`);
  }

  // ── How they think ──────────────────────────────────────────────────────────
  if (ctx.decisionStyle) {
    lines.push(`Decision-making style: ${ctx.decisionStyle}`);
  }
  if (ctx.topCognitiveDimension) {
    lines.push(`Cognitive profile: ${ctx.topCognitiveDimension}`);
  }
  if (ctx.dominantBias) {
    lines.push(`Notable thinking bias: ${ctx.dominantBias}`);
  }
  if (ctx.activeLoop) {
    lines.push(
      `Recurring thinking loop: "${ctx.activeLoop}"${ctx.activeLoopTrigger ? ` — triggered by: ${ctx.activeLoopTrigger}` : ''}`,
    );
  }

  // ── What they value ─────────────────────────────────────────────────────────
  if (ctx.topValues.length > 0) {
    lines.push(`Core values: ${ctx.topValues.join(', ')}`);
  }
  if (ctx.valuesDivergence) {
    lines.push(
      `Values gap: says "${ctx.valuesDivergence.stated}" but lives "${ctx.valuesDivergence.actual}" — ${ctx.valuesDivergence.observation}`,
    );
  }
  if (ctx.motivationPulse) {
    lines.push(`Core motivation driver: ${ctx.motivationPulse}`);
  }

  // ── Emotional state ─────────────────────────────────────────────────────────
  if (ctx.dominantEmotions.length > 0) {
    lines.push(`Recent emotional state: ${ctx.dominantEmotions.join(', ')}`);
  }
  if (ctx.currentTier && ctx.currentTier >= 2) {
    lines.push(
      ctx.currentTier === 3
        ? 'Note: this person has been in significant distress recently. Hold space carefully.'
        : 'Note: this person has been carrying something heavy lately.',
    );
  }

  // ── Recent context ──────────────────────────────────────────────────────────
  if (ctx.lastReflectedShortId) {
    const short = SHORTS_LIBRARY.find(s => s.id === ctx.lastReflectedShortId);
    if (short) {
      lines.push(`Recently reflected on: "${short.title}" (${short.source_author})`);
    }
  }
  if (ctx.recentSummarySnippet) {
    lines.push(`Recent journal context: ${ctx.recentSummarySnippet}`);
  }

  if (lines.length === 0) return '';
  return `\n\nUSER CONTEXT (from their journal — use to personalise responses, never to label or diagnose):\n${lines.map(l => `- ${l}`).join('\n')}`;
}

// ── V2: ff_new_minds_system ─────────────────────────────────────────────────
//
// Replacement context built from newer systems (Patterns + Intentions +
// Day Summary reflections + conversation history), rendered with the
// "use context implicitly" instruction. Classification-era fields
// (Big Five, Enneagram, Arc, character narrative) are intentionally NOT
// sent to Claude here — they remain in local storage for flag-off callers
// but are excluded from the V2 payload per the spec.

const V2_CACHE_KEY = 'user_context_v2_cache';
const V2_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours — tighter than legacy because newer systems update more often

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
      // newest-first to match dates order
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
 * Fetch the V2 context (new-minds-system). Cached in-memory + AsyncStorage
 * for TTL; `force = true` rebuilds immediately.
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

/** Invalidate both legacy and V2 caches. */
export function invalidateUserContext(): void {
  _memCacheV2 = null;
  UserContextService.invalidate();
  AsyncStorage.removeItem(V2_CACHE_KEY).catch(() => {});
}

/**
 * Render the V2 context block for injection into a Claude system prompt.
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
 * Flag-routed entry point used by ConversationService. When
 * ff_new_minds_system is ON, returns the V2 block (with the implicit-context
 * instruction baked in). Otherwise returns the legacy classification-era
 * block.
 */
export async function getContextPromptForConversation(mindId?: string | null): Promise<string> {
  const useV2 = await FeatureFlagsService.getFlag('ff_new_minds_system').catch(() => false);
  if (useV2) {
    const ctx = await getUserContextV2();
    let block = buildUserContextPromptV2(ctx);
    if (mindId === null || mindId === undefined || mindId === 'companion') {
      block += '\n' + COMPANION_CONTINUITY_INSTRUCTION;
    }
    return block;
  }
  // Legacy path — unchanged behaviour.
  const ctx = await UserContextService.get();
  return buildUserContextPrompt(ctx);
}
