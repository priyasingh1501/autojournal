/**
 * IntentionsService — user goals replacing the fixed tracker carousel.
 *
 * Responsibilities:
 *   • CRUD for active/inactive Intentions (AsyncStorage-backed)
 *   • Lightweight Haiku-powered detection from journal entries, throttled
 *     to at most one unprompted suggestion per week
 *   • Dismiss-blocklist with a 30-day TTL so the same text doesn't
 *     re-surface after the user says "not right now"
 *   • Starter-pack migration — offers existing tracker settings as
 *     pre-configured intentions on first use of the flag
 *
 * Everything here is a no-op when ff_intentions is off (guarded by
 * intentionsEnabled()), so the hook call-sites don't need to know about
 * the flag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import { FeatureFlagsService } from './FeatureFlagsService';
import { StorageService } from './StorageService';
import {
  Intention,
  IntentionCadence,
  IntentionSource,
  SuggestedIntention,
  TranscriptEntry,
  AppSettings,
} from '../types';
import {
  parseDetectionResponse,
  normalizeIntentionText,
  isDuplicateIntention,
} from './intentionsDetect';

// ── Storage keys ─────────────────────────────────────────────────────────────
const INTENTIONS_KEY        = 'intentions';
const PENDING_SUGGESTION_KEY = 'intention_pending_suggestion';
const LAST_SUGGESTED_AT_KEY  = 'intentions_last_suggested_at';
const DISMISSED_KEY          = 'intentions_dismissed';
const STARTER_DONE_KEY       = 'intentions_starter_migration_done';

const SUGGEST_COOLDOWN_MS   = 7 * 86_400_000;   // at most one auto-suggest per week
const DISMISS_TTL_MS        = 30 * 86_400_000;  // dismissed text won't resurface for 30 days

// ── Flag helper ──────────────────────────────────────────────────────────────
export async function intentionsEnabled(): Promise<boolean> {
  return FeatureFlagsService.getFlag('ff_intentions').catch(() => false);
}

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

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function getAllIntentions(): Promise<Intention[]> {
  try {
    const raw = await AsyncStorage.getItem(INTENTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getActiveIntentions(): Promise<Intention[]> {
  return (await getAllIntentions()).filter(i => i.active);
}

async function saveAllIntentions(list: Intention[]): Promise<void> {
  await AsyncStorage.setItem(INTENTIONS_KEY, JSON.stringify(list));
}

export async function addIntention(input: {
  text: string;
  source: IntentionSource;
  cadence?: IntentionCadence;
  declaredInEntryId?: string;
}): Promise<Intention> {
  const all = await getAllIntentions();
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error('Intention text cannot be empty.');
  if (isDuplicateIntention(trimmed, all.filter(i => i.active).map(i => i.text))) {
    throw new Error('You already have an intention like that.');
  }

  const intention: Intention = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    source: input.source,
    createdAt: Date.now(),
    cadence: input.cadence ?? null,
    active: true,
    declaredInEntryId: input.declaredInEntryId,
  };
  all.push(intention);
  await saveAllIntentions(all);
  return intention;
}

export async function updateIntention(id: string, patch: Partial<Intention>): Promise<void> {
  const all = await getAllIntentions();
  const idx = all.findIndex(i => i.id === id);
  if (idx === -1) return;
  // Disallow patching id/createdAt/source — these are immutable.
  const safe: Partial<Intention> = {
    text:    patch.text?.trim() ?? all[idx].text,
    cadence: patch.cadence === undefined ? all[idx].cadence : patch.cadence,
    active:  patch.active === undefined ? all[idx].active : patch.active,
  };
  all[idx] = { ...all[idx], ...safe };
  await saveAllIntentions(all);
}

export async function setActive(id: string, active: boolean): Promise<void> {
  return updateIntention(id, { active });
}

export async function deleteIntention(id: string): Promise<void> {
  const all = await getAllIntentions();
  await saveAllIntentions(all.filter(i => i.id !== id));
}

// ── Pending suggestion ───────────────────────────────────────────────────────

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
    text: s.text,
    source: 'detected',
    cadence: null,
    declaredInEntryId: s.sourceEntryId,
  });
  await setPendingSuggestion(null);
  return created;
}

export async function dismissSuggestion(s: SuggestedIntention): Promise<void> {
  await addDismissed(s.text);
  await setPendingSuggestion(null);
}

// ── Detection ────────────────────────────────────────────────────────────────

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
    if (!(await intentionsEnabled())) return;
    if (!entry.text || entry.text.trim().length < 40) return; // too short to carry a goal
    if (await getPendingSuggestion()) return;                 // one pending at a time

    // Weekly cooldown — prevents nagging on chatty days.
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

    // Dedupe against active intentions and recent dismissals.
    const active = await getActiveIntentions();
    if (isDuplicateIntention(candidate, active.map(i => i.text))) return;
    const dismissed = await readDismissed();
    if (dismissed.some(d => d.norm === normalizeIntentionText(candidate))) return;

    const suggestion: SuggestedIntention = {
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: candidate,
      detectedAt: Date.now(),
      sourceEntryId: entry.id,
    };
    await setPendingSuggestion(suggestion);
    await AsyncStorage.setItem(LAST_SUGGESTED_AT_KEY, String(Date.now()));
  } catch {
    // Non-fatal — detection is best-effort and must never break entry save.
  }
}

// ── Starter pack migration ───────────────────────────────────────────────────

/**
 * Convert the user's existing tracker toggles to pre-configured intentions.
 * Runs at most once per install (gated by STARTER_DONE_KEY). Callers can
 * re-run explicitly by passing `{ force: true }` (used by the "restore
 * starter pack" button in IntentionsScreen).
 */
export interface StarterPackResult {
  created: Intention[];
  alreadyDone: boolean;
}

const STARTER_TEMPLATES: Record<string, { text: string; cadence: IntentionCadence }> = {
  meals:      { text: 'Eat balanced meals',          cadence: 'daily'  },
  workout:    { text: 'Move my body most days',      cadence: 'daily'  },
  meditation: { text: 'Meditate in the mornings',    cadence: 'daily'  },
  spending:   { text: 'Stay mindful of my spending', cadence: 'weekly' },
};

export async function runStarterPackMigration(opts: { force?: boolean } = {}): Promise<StarterPackResult> {
  const done = await AsyncStorage.getItem(STARTER_DONE_KEY);
  if (done === '1' && !opts.force) {
    return { created: [], alreadyDone: true };
  }

  const settings: AppSettings | null = await StorageService.getSettings();
  const enabled = settings?.enabledTrackers ?? [];
  const active  = (await getActiveIntentions()).map(i => i.text);

  const created: Intention[] = [];
  for (const key of enabled) {
    const tpl = STARTER_TEMPLATES[key];
    if (!tpl) continue;
    if (isDuplicateIntention(tpl.text, active)) continue;
    try {
      const intention = await addIntention({
        text:    tpl.text,
        source:  'starter_pack',
        cadence: tpl.cadence,
      });
      created.push(intention);
    } catch { /* duplicate from another template — skip */ }
  }

  await AsyncStorage.setItem(STARTER_DONE_KEY, '1');
  return { created, alreadyDone: false };
}

export async function isStarterPackDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(STARTER_DONE_KEY)) === '1';
}

// ── Prompt integration helper ────────────────────────────────────────────────

/**
 * Build a short block to inject into Day Summary / Patterns prompts.
 * Empty when the user has no active intentions (so prompts stay unchanged
 * for users who haven't declared anything).
 */
export function buildIntentionContextBlock(intentions: Intention[]): string {
  if (intentions.length === 0) return '';
  const lines = intentions
    .filter(i => i.active)
    .slice(0, 10) // keep prompt bounded
    .map(i => `  - "${i.text}"${i.cadence ? ` (${i.cadence})` : ''}`);
  if (lines.length === 0) return '';
  return [
    'ACTIVE INTENTIONS (the user\'s declared goals — reference them ONLY when the entries touch on them; do not force-fit):',
    ...lines,
  ].join('\n');
}
