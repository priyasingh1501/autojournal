/**
 * IntentionsService — user goals replacing the fixed tracker carousel.
 *
 * Responsibilities:
 *   • CRUD for Intentions (AsyncStorage-backed) with full lifecycle management
 *   • On-read migration of legacy stored intentions to the expanded schema
 *   • Lazy Haiku enrichment of shortLabel and category on create/first-read
 *   • Fading detection — surfaces intentions that have gone quiet
 *   • Lightweight keyword-based mention tracking (called by BatchTranscriptionService)
 *   • Lightweight Haiku-powered detection from journal entries, throttled
 *     to at most one unprompted suggestion per week
 *   • Dismiss-blocklist with a 30-day TTL
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import {
  Intention,
  IntentionCadence,
  IntentionCategory,
  IntentionSource,
  IntentionStatus,
  SuggestedIntention,
  TranscriptEntry,
} from '../types';
import {
  parseDetectionResponse,
  normalizeIntentionText,
  isDuplicateIntention,
} from './intentionsDetect';

// ── Storage keys ─────────────────────────────────────────────────────────────
const INTENTIONS_KEY         = 'intentions';
const PENDING_SUGGESTION_KEY = 'intention_pending_suggestion';
const LAST_SUGGESTED_AT_KEY  = 'intentions_last_suggested_at';
const DISMISSED_KEY          = 'intentions_dismissed';

const SUGGEST_COOLDOWN_MS = 7 * 86_400_000;
const DISMISS_TTL_MS      = 30 * 86_400_000;
const DAY_MS              = 86_400_000;

// ── Dismissed blocklist ──────────────────────────────────────────────────────
interface Dismissed { norm: string; at: number; }

async function readDismissed(): Promise<Dismissed[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const list: Dismissed[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - DISMISS_TTL_MS;
    return list.filter(d => d.at >= cutoff);
  } catch {
    return [];
  }
}

async function addDismissed(text: string): Promise<void> {
  const current = await readDismissed();
  current.push({ norm: normalizeIntentionText(text), at: Date.now() });
  const capped = current.length > 200 ? current.slice(-200) : current;
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(capped));
}

// ── Schema helpers ────────────────────────────────────────────────────────────

function deriveFallbackShortLabel(text: string): string {
  return text.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
}

/** ISO-8601 week key, e.g. "2026-W16". Monday-based, UTC. */
function getWeekKey(ts: number): string {
  const d = new Date(ts);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Keep at most 12 most-recent weeks to bound storage growth. */
function pruneWeeklyCounts(
  counts: Array<{ weekKey: string; count: number }>,
): Array<{ weekKey: string; count: number }> {
  if (counts.length <= 12) return counts;
  return [...counts].sort((a, b) => b.weekKey.localeCompare(a.weekKey)).slice(0, 12);
}

/**
 * Migrate a raw stored object to the current Intention shape.
 * Safe to call on already-migrated objects (idempotent).
 */
function migrateIntention(raw: any): Intention {
  const hasStatus = typeof raw.status === 'string';
  const status: IntentionStatus = hasStatus
    ? raw.status
    : (raw.active === false ? 'released' : 'active');

  return {
    id:                   raw.id,
    text:                 raw.text,
    shortLabel:           raw.shortLabel ?? deriveFallbackShortLabel(raw.text),
    source:               raw.source,
    createdAt:            raw.createdAt,
    declaredInEntryId:    raw.declaredInEntryId,
    cadence:              raw.cadence ?? null,
    status,
    statusChangedAt:      raw.statusChangedAt ?? raw.createdAt,
    statusNote:           raw.statusNote,
    lastMentionedAt:      raw.lastMentionedAt ?? null,
    lastMentionedEntryId: raw.lastMentionedEntryId,
    fadingPromptSentAt:   raw.fadingPromptSentAt,
    fadingPromptResponse: raw.fadingPromptResponse,
    category:             raw.category,
    whyText:              raw.whyText,
    mentionCount:         raw.mentionCount ?? 0,
    weeklyMentionCounts:  raw.weeklyMentionCounts ?? [],
    targetCadence:        raw.targetCadence,
    nudgeEnabled:         raw.nudgeEnabled ?? true,
    nudgeSnoozedUntil:    raw.nudgeSnoozedUntil,
    active:               status === 'active',
  };
}

// ── Haiku enrichment ──────────────────────────────────────────────────────────

async function generateShortLabel(text: string): Promise<string> {
  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `Generate a 1-3 word label for this intention: ${text}. Return only the label, lowercase, no punctuation.`,
    }],
  });
  const label = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '');
  return label || deriveFallbackShortLabel(text);
}

const VALID_CATEGORIES: IntentionCategory[] = [
  'health', 'relationships', 'work', 'mind',
  'creative', 'spiritual', 'financial', 'other',
];

async function inferCategory(text: string): Promise<IntentionCategory | undefined> {
  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 15,
    messages: [{
      role: 'user',
      content: `Classify this intention into one of these categories: health, relationships, work, mind, creative, spiritual, financial, other. Intention: ${text}. Return only the category word.`,
    }],
  });
  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim()
    .toLowerCase() as IntentionCategory;
  return VALID_CATEGORIES.includes(raw) ? raw : undefined;
}

/**
 * Background enrichment for a newly created intention (fire-and-forget).
 * Reads directly from storage to avoid re-migrating; saves only changed fields.
 */
async function enrichSingleIntention(
  id: string,
  text: string,
  needsLabel: boolean,
  needsCategory: boolean,
): Promise<void> {
  const [shortLabel, category] = await Promise.all([
    needsLabel    ? generateShortLabel(text).catch(() => null) : Promise.resolve(null),
    needsCategory ? inferCategory(text).catch(() => null)      : Promise.resolve(null),
  ]);
  if (!shortLabel && !category) return;

  const raw = await AsyncStorage.getItem(INTENTIONS_KEY);
  const stored: any[] = raw ? JSON.parse(raw) : [];
  const idx = stored.findIndex((i: any) => i.id === id);
  if (idx === -1) return;
  if (shortLabel) stored[idx].shortLabel = shortLabel;
  if (category)   stored[idx].category   = category;
  await AsyncStorage.setItem(INTENTIONS_KEY, JSON.stringify(stored));
}

/**
 * Background enrichment for legacy stored intentions missing shortLabel/category.
 * Processes serially (one Haiku call at a time) to avoid spiking API usage.
 */
async function enrichMissingFields(ids: string[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INTENTIONS_KEY);
    const stored: any[] = raw ? JSON.parse(raw) : [];
    let changed = false;

    for (const item of stored) {
      if (!ids.includes(item.id)) continue;
      if (!item.shortLabel) {
        item.shortLabel = await generateShortLabel(item.text).catch(
          () => deriveFallbackShortLabel(item.text),
        );
        changed = true;
      }
      if (!item.category) {
        const cat = await inferCategory(item.text).catch(() => undefined);
        if (cat) { item.category = cat; changed = true; }
      }
    }

    if (changed) {
      // Re-read to avoid clobbering concurrent writes, then merge enriched fields.
      const latest = await AsyncStorage.getItem(INTENTIONS_KEY);
      const current: any[] = latest ? JSON.parse(latest) : [];
      const enrichedById = Object.fromEntries(stored.map(i => [i.id, i]));
      const merged = current.map(i => enrichedById[i.id] ?? i);
      await AsyncStorage.setItem(INTENTIONS_KEY, JSON.stringify(merged));
    }
  } catch { /* enrichment is best-effort */ }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getAllIntentions(): Promise<Intention[]> {
  try {
    const raw = await AsyncStorage.getItem(INTENTIONS_KEY);
    const stored: any[] = raw ? JSON.parse(raw) : [];
    const needsEnrichment: string[] = [];

    const migrated = stored.map(item => {
      if (!item.shortLabel || !item.category) needsEnrichment.push(item.id);
      return migrateIntention(item);
    });

    if (needsEnrichment.length > 0) {
      enrichMissingFields(needsEnrichment).catch(() => {});
    }

    return migrated;
  } catch {
    return [];
  }
}

/** Returns intentions where status === 'active'. */
export async function getActive(): Promise<Intention[]> {
  return (await getAllIntentions()).filter(i => i.status === 'active');
}

/** Alias kept for call-sites that predate the status model. */
export async function getActiveIntentions(): Promise<Intention[]> {
  return getActive();
}

async function saveAllIntentions(list: Intention[]): Promise<void> {
  await AsyncStorage.setItem(INTENTIONS_KEY, JSON.stringify(list));
}

export async function addIntention(input: {
  text: string;
  source: IntentionSource;
  cadence?: IntentionCadence;
  declaredInEntryId?: string;
  shortLabel?: string;
  category?: IntentionCategory;
}): Promise<Intention> {
  const all = await getAllIntentions();
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error('Intention text cannot be empty.');
  if (isDuplicateIntention(trimmed, all.filter(i => i.status === 'active').map(i => i.text))) {
    throw new Error('You already have an intention like that.');
  }

  const now = Date.now();
  const intention: Intention = {
    id:                  `int_${now}_${Math.random().toString(36).slice(2, 8)}`,
    text:                trimmed,
    shortLabel:          input.shortLabel ?? deriveFallbackShortLabel(trimmed),
    source:              input.source,
    createdAt:           now,
    cadence:             input.cadence ?? null,
    declaredInEntryId:   input.declaredInEntryId,
    status:              'active',
    statusChangedAt:     now,
    lastMentionedAt:     null,
    mentionCount:        0,
    weeklyMentionCounts: [],
    nudgeEnabled:        true,
    active:              true,
    ...(input.category ? { category: input.category } : {}),
  };
  all.push(intention);
  await saveAllIntentions(all);

  // Fire-and-forget Haiku enrichment for shortLabel / category.
  const needsLabel    = !input.shortLabel;
  const needsCategory = !input.category;
  if (needsLabel || needsCategory) {
    enrichSingleIntention(intention.id, trimmed, needsLabel, needsCategory).catch(() => {});
  }

  return intention;
}

export async function updateIntention(id: string, patch: Partial<Intention>): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === id);
  if (idx === -1) return;
  const current = all[idx];

  // Disallow patching immutable identity fields.
  const { id: _1, createdAt: _2, source: _3, ...mutable } = patch as any;

  // Keep active ↔ status in sync when either is patched explicitly.
  if (mutable.status !== undefined && mutable.active === undefined) {
    mutable.active = mutable.status === 'active';
    if (mutable.statusChangedAt === undefined) mutable.statusChangedAt = Date.now();
  } else if (mutable.active !== undefined && mutable.status === undefined) {
    mutable.status = mutable.active ? 'active' : 'paused';
    mutable.statusChangedAt = Date.now();
  }

  all[idx] = { ...current, ...mutable };
  await saveAllIntentions(all);
}

/** Toggle active state. Maps to status 'active' / 'paused' going forward. */
export async function setActive(id: string, active: boolean): Promise<void> {
  return updateIntention(id, {
    active,
    status:          active ? 'active' : 'paused',
    statusChangedAt: Date.now(),
  });
}

export async function deleteIntention(id: string): Promise<void> {
  const all = await getAllIntentions();
  await saveAllIntentions(all.filter(i => i.id !== id));
}

// ── Lifecycle methods ─────────────────────────────────────────────────────────

export async function markCompleted(intentionId: string, note?: string): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === intentionId);
  if (idx === -1) return;
  const now = Date.now();
  all[idx] = {
    ...all[idx],
    status:          'completed',
    statusChangedAt: now,
    active:          false,
    ...(note ? { statusNote: note } : {}),
  };
  await saveAllIntentions(all);
}

export async function markReleased(intentionId: string, note?: string): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === intentionId);
  if (idx === -1) return;
  const now = Date.now();
  all[idx] = {
    ...all[idx],
    status:          'released',
    statusChangedAt: now,
    active:          false,
    ...(note ? { statusNote: note } : {}),
  };
  await saveAllIntentions(all);
}

// ── Mention tracking ──────────────────────────────────────────────────────────

/**
 * Record that an intention was mentioned in a journal entry.
 * Updates lastMentionedAt, increments mentionCount, and updates the
 * rolling 12-week weeklyMentionCounts array.
 */
export async function recordMention(
  intentionId: string,
  entryId: string,
  timestamp: number,
): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === intentionId);
  if (idx === -1) return;

  const i = all[idx];
  const weekKey = getWeekKey(timestamp);
  const counts = [...(i.weeklyMentionCounts ?? [])];
  const weekIdx = counts.findIndex(w => w.weekKey === weekKey);
  if (weekIdx === -1) {
    counts.push({ weekKey, count: 1 });
  } else {
    counts[weekIdx] = { weekKey, count: counts[weekIdx].count + 1 };
  }

  all[idx] = {
    ...i,
    lastMentionedAt:      timestamp,
    lastMentionedEntryId: entryId,
    mentionCount:         (i.mentionCount ?? 0) + 1,
    weeklyMentionCounts:  pruneWeeklyCounts(counts),
  };
  await saveAllIntentions(all);
}

// ── Fading logic ──────────────────────────────────────────────────────────────

const FADING_THRESHOLDS_MS: Partial<Record<string, number>> = {
  daily:  14 * DAY_MS,
  weekly: 21 * DAY_MS,
  loose:  30 * DAY_MS,
};
const FADING_PROMPT_COOLDOWN_MS = 14 * DAY_MS;

/**
 * Returns active intentions that have gone quiet past their cadence threshold
 * and are ready for a fading prompt (haven't been prompted in the last 14 days).
 */
export async function getFading(): Promise<Intention[]> {
  const actives = await getActive();
  const now = Date.now();

  return actives.filter(i => {
    if (!i.lastMentionedAt || !i.cadence) return false;
    const threshold = FADING_THRESHOLDS_MS[i.cadence];
    if (!threshold) return false;
    if (now - i.lastMentionedAt <= threshold) return false;
    return !i.fadingPromptSentAt || now - i.fadingPromptSentAt > FADING_PROMPT_COOLDOWN_MS;
  });
}

/**
 * Record the user's response to a fading prompt.
 * - 'release' → status = 'released'
 * - 'pause'   → status = 'paused'
 * - 'keep'    → status unchanged
 * - 'snooze'  → status unchanged, nudgeSnoozedUntil set to now + 14 days
 */
export async function respondToFadingPrompt(
  intentionId: string,
  response: 'keep' | 'release' | 'pause' | 'snooze',
): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === intentionId);
  if (idx === -1) return;

  const now = Date.now();
  const patch: Partial<Intention> = {
    fadingPromptResponse: response,
    fadingPromptSentAt:   now,
  };

  if (response === 'release') {
    patch.status          = 'released';
    patch.statusChangedAt = now;
    patch.active          = false;
  } else if (response === 'pause') {
    patch.status          = 'paused';
    patch.statusChangedAt = now;
    patch.active          = false;
  } else if (response === 'snooze') {
    patch.nudgeSnoozedUntil = now + 14 * DAY_MS;
  }

  all[idx] = { ...all[idx], ...patch };
  await saveAllIntentions(all);
}

export async function snoozeNudge(intentionId: string, days: number): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === intentionId);
  if (idx === -1) return;
  all[idx] = { ...all[idx], nudgeSnoozedUntil: Date.now() + days * DAY_MS };
  await saveAllIntentions(all);
}

// ── Patterns query ────────────────────────────────────────────────────────────

/** Returns active + completed + released intentions for Patterns analysis. */
export async function getForPatterns(): Promise<Intention[]> {
  const all = await getAllIntentions();
  return all.filter(i =>
    i.status === 'active' || i.status === 'completed' || i.status === 'released',
  );
}

// ── Pending suggestion ────────────────────────────────────────────────────────

export async function getPendingSuggestion(): Promise<SuggestedIntention | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SUGGESTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setPendingSuggestion(s: SuggestedIntention | null): Promise<void> {
  if (s) {
    await AsyncStorage.setItem(PENDING_SUGGESTION_KEY, JSON.stringify(s));
  } else {
    await AsyncStorage.removeItem(PENDING_SUGGESTION_KEY);
  }
}

export async function acceptSuggestion(s: SuggestedIntention): Promise<Intention> {
  const created = await addIntention({
    text:              s.text,
    source:            'detected',
    cadence:           null,
    declaredInEntryId: s.sourceEntryId,
  });
  await setPendingSuggestion(null);
  return created;
}

export async function dismissSuggestion(s: SuggestedIntention): Promise<void> {
  await addDismissed(s.text);
  await setPendingSuggestion(null);
}

// ── Detection ─────────────────────────────────────────────────────────────────

const DETECTION_SYSTEM = `You are reading a single journal entry. Decide: does it contain something that sounds like a goal the user is trying to live toward?

Good examples (return as short phrases):
  - "stop doom-scrolling before bed"
  - "call mom weekly"
  - "meditate in the mornings"
  - "not eating sugar this month"

Bad examples (these are NOT goals — return null):
  - Descriptions of what happened today
  - General reflections about feelings
  - One-off observations
  - Complaints without a forward-looking "want to" / "trying to" / "should" framing

Return ONLY a single JSON object (no preamble, no fences, no prose):
  { "intention": "<3-8 word imperative phrase>" }       // if a clear goal was stated
  { "intention": null }                                  // otherwise

Prefer null when uncertain. False positives are worse than misses here.`;

/**
 * Fire-and-forget detection hook. Safe to call after every entry save —
 * short-circuits on flag-off, pending suggestion, or weekly cooldown.
 */
export async function detectAndSuggestIntention(entry: TranscriptEntry): Promise<void> {
  try {
    if (!entry.text || entry.text.trim().length < 40) return;
    if (await getPendingSuggestion()) return;

    const lastStr = await AsyncStorage.getItem(LAST_SUGGESTED_AT_KEY);
    const last = lastStr ? parseInt(lastStr, 10) : 0;
    if (Date.now() - last < SUGGEST_COOLDOWN_MS) return;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system: DETECTION_SYSTEM,
      messages: [{ role: 'user', content: entry.text }],
    });
    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const candidate = parseDetectionResponse(raw);
    if (!candidate) return;

    const active = await getActive();
    if (isDuplicateIntention(candidate, active.map(i => i.text))) return;
    const dismissed = await readDismissed();
    if (dismissed.some(d => d.norm === normalizeIntentionText(candidate))) return;

    const suggestion: SuggestedIntention = {
      id:           `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text:         candidate,
      detectedAt:   Date.now(),
      sourceEntryId: entry.id,
    };
    await setPendingSuggestion(suggestion);
    await AsyncStorage.setItem(LAST_SUGGESTED_AT_KEY, String(Date.now()));
  } catch {
    // Non-fatal — detection must never break entry save.
  }
}

// ── Prompt integration helper ─────────────────────────────────────────────────

/**
 * Build a category-grouped block for Day Summary prompts.
 * Groups active intentions by category so the model can reference them naturally.
 * Falls back to the flat format when no intentions have categories set.
 */
export function buildGroupedIntentionContextBlock(intentions: Intention[]): string {
  const actives = intentions.filter(i => i.status === 'active').slice(0, 10);
  if (actives.length === 0) return '';

  const hasCats = actives.some(i => i.category);
  if (!hasCats) return buildIntentionContextBlock(intentions);

  const grouped: Partial<Record<string, string[]>> = {};
  for (const i of actives) {
    const key = i.category ?? 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(i.text);
  }

  const lines = Object.entries(grouped).map(
    ([cat, texts]) => `${cat}: ${texts!.join(', ')}`,
  );

  return [
    'Active intentions mentioned today, grouped by category:',
    '',
    ...lines,
  ].join('\n');
}

/**
 * Build a short block to inject into Day Summary / Patterns prompts.
 * Empty when the user has no active intentions.
 */
export function buildIntentionContextBlock(intentions: Intention[]): string {
  if (intentions.length === 0) return '';
  const lines = intentions
    .filter(i => i.status === 'active')
    .slice(0, 10)
    .map(i => `  - "${i.text}"${i.cadence ? ` (${i.cadence})` : ''}`);
  if (lines.length === 0) return '';
  return [
    "ACTIVE INTENTIONS (the user's declared goals — reference them ONLY when the entries touch on them; do not force-fit):",
    ...lines,
  ].join('\n');
}
