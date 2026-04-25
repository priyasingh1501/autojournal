/**
 * PerspectivePromptsService — extracts "worth talking about" prompts from
 * individual journal entries using Claude Haiku.
 *
 * Each prompt is a topic the user could usefully get a second perspective on:
 * a decision they're weighing, a conflict that hasn't resolved, a loaded
 * emotion tied to something concrete, an unresolved question, something
 * they're avoiding, or a tension between stated values and actions.
 *
 * Called fire-and-forget after every entry save. The prompts are persisted
 * back onto the TranscriptEntry via StorageService.updateTranscript so they
 * survive app restarts and can be aggregated for the Home carousel without
 * re-running the model.
 */

import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import { effectiveDateStr } from './dayRollover';
import {
  PerspectivePrompt,
  PerspectivePromptCategory,
  TranscriptEntry,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_ENTRY_CHARS   = 60;   // skip trivially short entries ("had coffee")
const MAX_PROMPTS_PER_ENTRY = 2;
const TOPIC_MAX_CHARS   = 48;   // keep chips readable

const VALID_CATEGORIES: Set<PerspectivePromptCategory> = new Set([
  'decision', 'conflict', 'loaded_emotion',
  'question', 'avoidance', 'values_tension',
]);

// ── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are reading a single journal entry and picking out topics the user might want a second perspective on.

Return between 0 and 2 prompts. Prefer 0 when nothing stands out — false positives are worse than misses. Only pull a topic if it falls cleanly into one of these categories:

- "decision": user is weighing options and hasn't committed ("should I", "thinking about whether", "torn between")
- "conflict": interpersonal friction or internal tension ("we argued", "can't get over what they said")
- "loaded_emotion": a strong negative feeling (anxious, ashamed, angry, lonely, overwhelmed) tied to a SPECIFIC topic — not a free-floating mood
- "question": user explicitly wondering, no answer landed ("don't know why", "can't figure out", "what if")
- "avoidance": named something they want to do but keep deferring ("keep putting off", "still haven't")
- "values_tension": a stated value clashes with described action ("said I'd prioritise X, spent the day on Y")

Each prompt is an object with:
- "topic": 3–8 word phrase the user would recognise as the thing, lowercase, no trailing punctuation (e.g. "whether to quit the job", "the fight with Sam")
- "category": one of the 6 strings above
- "why": ONE sentence in the user's voice explaining what's unresolved (e.g. "keeps circling whether the new role is the right move")

Return ONLY a JSON object of this exact shape — no preamble, no fences:
  { "prompts": [ { "topic": "...", "category": "...", "why": "..." }, ... ] }

Return { "prompts": [] } when the entry is purely factual, a gratitude note, or otherwise doesn't contain a topic matching the categories above.`;

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseExtractionResponse(raw: string): PerspectivePrompt[] {
  if (!raw) return [];
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let obj: any;
  try {
    obj = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!obj || typeof obj !== 'object') return [];
  const arr = obj.prompts;
  if (!Array.isArray(arr)) return [];

  const out: PerspectivePrompt[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
    const category = typeof item.category === 'string' ? item.category.trim() : '';
    const why = typeof item.why === 'string' ? item.why.trim() : undefined;
    if (!topic || topic.length > TOPIC_MAX_CHARS) continue;
    if (!VALID_CATEGORIES.has(category as PerspectivePromptCategory)) continue;
    out.push({
      topic: topic.toLowerCase(),
      category: category as PerspectivePromptCategory,
      ...(why && why.length > 0 && why.length <= 200 ? { why } : {}),
    });
    if (out.length >= MAX_PROMPTS_PER_ENTRY) break;
  }
  return out;
}

// ── Entry-level extraction ───────────────────────────────────────────────────

/**
 * Fire-and-forget extraction for a single entry. Updates the entry in
 * StorageService with `perspectivePrompts` when the model finds any.
 * Never throws — extraction failures must not affect entry save.
 */
export async function extractPromptsForEntry(entry: TranscriptEntry): Promise<void> {
  try {
    if (!entry.text || entry.text.trim().length < MIN_ENTRY_CHARS) return;
    if (entry.perspectivePrompts !== undefined) return; // already extracted

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: entry.text }],
    });
    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const prompts = parseExtractionResponse(raw);

    // Persist even when the array is empty — the presence of the field marks
    // this entry as "already processed" so we don't re-extract on next save.
    const date = effectiveDateStr(entry.timestamp);
    const updated: TranscriptEntry = { ...entry, perspectivePrompts: prompts };
    await StorageService.updateTranscript(updated, date);
  } catch {
    // Non-fatal — extraction must never break entry save.
  }
}

// ── Aggregation for Home carousel ────────────────────────────────────────────

export interface ResolvedPerspectivePrompt extends PerspectivePrompt {
  /** ID of the entry this prompt was extracted from. */
  entryId: string;
  /** YYYY-MM-DD this entry belongs to (rollover-aware). */
  date: string;
  /** Timestamp of the source entry — used for "newest first" ordering. */
  entryTimestamp: number;
  /** Raw entry text — useful for the chat opener to quote the moment. */
  entryText: string;
}

/** Normalised topic key for cross-entry deduplication. */
function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pulls perspective prompts from entries on a single date, newest first,
 * deduplicated by normalised topic. Used by the Day Digest view.
 */
export async function getPromptsForDate(
  date: string,
  cap = 6,
): Promise<ResolvedPerspectivePrompt[]> {
  try {
    const entries = await StorageService.getTranscriptsForDate(date);

    const all: ResolvedPerspectivePrompt[] = [];
    for (const e of entries) {
      if (!e.perspectivePrompts || e.perspectivePrompts.length === 0) continue;
      for (const p of e.perspectivePrompts) {
        all.push({
          ...p,
          entryId: e.id,
          date,
          entryTimestamp: e.timestamp,
          entryText: e.text,
        });
      }
    }

    all.sort((a, b) => b.entryTimestamp - a.entryTimestamp);

    const seen = new Set<string>();
    const deduped: ResolvedPerspectivePrompt[] = [];
    for (const p of all) {
      const key = normalizeTopic(p.topic);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
      if (deduped.length >= cap) break;
    }
    return deduped;
  } catch {
    return [];
  }
}

/**
 * Pulls perspective prompts from entries in the last `lookbackDays` days,
 * newest first, deduplicated by normalised topic. Used by the Home carousel.
 */
export async function getRecentPerspectivePrompts(
  lookbackDays = 3,
  cap = 8,
): Promise<ResolvedPerspectivePrompt[]> {
  try {
    const dates = await StorageService.getTranscriptDates();
    const windowDates = dates.slice(0, lookbackDays);

    const buckets = await Promise.all(
      windowDates.map(async (d) => ({
        date: d,
        entries: await StorageService.getTranscriptsForDate(d),
      })),
    );

    const all: ResolvedPerspectivePrompt[] = [];
    for (const b of buckets) {
      for (const e of b.entries) {
        if (!e.perspectivePrompts || e.perspectivePrompts.length === 0) continue;
        for (const p of e.perspectivePrompts) {
          all.push({
            ...p,
            entryId: e.id,
            date: b.date,
            entryTimestamp: e.timestamp,
            entryText: e.text,
          });
        }
      }
    }

    // Newest entry first, then by category stability within the same timestamp
    all.sort((a, b) => b.entryTimestamp - a.entryTimestamp);

    // Dedup by normalised topic — first occurrence (newest) wins
    const seen = new Set<string>();
    const deduped: ResolvedPerspectivePrompt[] = [];
    for (const p of all) {
      const key = normalizeTopic(p.topic);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
      if (deduped.length >= cap) break;
    }
    return deduped;
  } catch {
    return [];
  }
}
