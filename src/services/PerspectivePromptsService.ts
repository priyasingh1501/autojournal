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

import { DeviceEventEmitter } from 'react-native';
import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import { effectiveDateStr } from './dayRollover';
import {
  DailySummary,
  PerspectivePrompt,
  PerspectivePromptCategory,
  TranscriptEntry,
} from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_ENTRY_CHARS       = 60;  // skip trivially short entries ("had coffee")
const MAX_PROMPTS_PER_ENTRY = 2;
const MAX_PROMPTS_PER_SUMMARY = 3; // summaries cover a full day — allow one more
const TOPIC_MAX_CHARS       = 48;  // keep chips readable

const VALID_CATEGORIES: Set<PerspectivePromptCategory> = new Set([
  'decision', 'conflict', 'loaded_emotion',
  'question', 'avoidance', 'values_tension',
  'pattern', 'connection', 'direction',
  'body', 'win',
]);

// ── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are reading a single journal entry and picking out topics the user might benefit from talking through with another perspective.

Return between 0 and 2 prompts. Pull a topic if it falls cleanly into one of these categories:

- "decision": user is weighing options and hasn't committed
  e.g. "torn between staying and applying to the open role"
- "conflict": active friction with a person, OR internal tug-of-war between parts of themselves
  e.g. "the fight with mum on Sunday — still replaying it"
- "loaded_emotion": a strong feeling (any tone — anxious, ashamed, proud, relieved, grieving, in love) tied to a SPECIFIC topic, not a free-floating mood
  e.g. "the dread before standup", "the relief after the call"
- "question": user explicitly wondering, no answer has landed; can be curious or anxious in tone
  e.g. "wondering whether my work actually matters to anyone"
- "avoidance": named something they want or need to do but keep deferring
  e.g. "still haven't booked the dentist"
- "values_tension": a stated value clashes with the described action
  e.g. "said I'd protect mornings; spent another one doomscrolling"
- "pattern": user notices a recurring shape in their own behavior, feelings, or interactions — "I keep doing X every time Y"
  e.g. "I always go quiet around Sam"
- "connection": missing someone, drifting from someone, wanting closeness; NOT active conflict
  e.g. "haven't talked to Maya in months and it's starting to bother me"
- "direction": orientation question bigger than any single decision — what game am I playing, where am I going, who am I becoming
  e.g. "not sure I want the life this career is pointing me toward"
- "body": somatic signal worth attending to — sleep, energy, persistent pain, appetite, a felt sense
  e.g. "the tension in my chest hasn't gone away in weeks"
- "win": something genuinely good worth metabolizing — a breakthrough, a moment of pride, gratitude with weight, an honest exchange. NOT a flat positive update.
  e.g. "had the conversation with dad I'd been avoiding for a year and it went well"

Each prompt is an object with:
- "topic": 3–8 word phrase the user would recognise as the thing, lowercase, no trailing punctuation (e.g. "whether to quit the job", "the fight with sam", "the talk with dad")
- "category": one of the 11 strings above
- "why": ONE sentence in the user's voice explaining what's worth examining (e.g. "keeps circling whether the new role is the right move")

Skip if:
- The entry is purely factual ("had coffee, went to the gym")
- The mention is casual with no weight behind it
- The user has already resolved the topic within the same entry
- A "win" reads as a flat update with no resonance ("did the laundry")

Return ONLY a JSON object of this exact shape — no preamble, no fences:
  { "prompts": [ { "topic": "...", "category": "...", "why": "..." }, ... ] }

Return { "prompts": [] } if nothing in the entry has enough weight to be worth a conversation.`;

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
    // Notify UI components so they reload without relying on a fixed timeout.
    DeviceEventEmitter.emit('perspectivePromptsUpdated', { date });
  } catch {
    // Non-fatal — extraction must never break entry save.
  }
}

// ── Summary-level extraction ─────────────────────────────────────────────────

const SUMMARY_EXTRACTION_SYSTEM = `You are reading a synthesised daily reflection written by an AI after reviewing a full day of journal entries. Extract topics the user might benefit from talking through.

Return between 0 and 3 prompts. Because this text is already synthesised, only pull topics with genuine unresolved weight — patterns, tensions, and direction questions are especially worth surfacing here.

Use the same 11 categories as individual entries:
- "decision": weighing options, hasn't committed
- "conflict": interpersonal friction or internal tug-of-war
- "loaded_emotion": strong feeling tied to a specific topic (not a free-floating mood)
- "question": explicit wondering, no answer has landed
- "avoidance": named something they keep deferring
- "values_tension": a stated value clashes with a described action
- "pattern": recurring shape in behavior, feelings, or interactions noticed across the day
- "connection": missing / drifting from someone; not active conflict
- "direction": orientation question bigger than a single decision — where am I going, who am I becoming
- "body": somatic signal worth attending to
- "win": something genuinely good worth metabolizing — NOT a flat positive update

Each prompt:
- "topic": 3–8 word phrase the user would recognise, lowercase, no trailing punctuation
- "category": one of the 11 strings above
- "why": ONE sentence in the user's voice explaining what's worth examining

Skip anything that reads as a closed observation. Prefer unresolved things.

Return ONLY a JSON object — no preamble, no fences:
  { "prompts": [ { "topic": "...", "category": "...", "why": "..." }, ... ] }

Return { "prompts": [] } if nothing has enough unresolved weight.`;

/**
 * Fire-and-forget extraction from a daily summary's reflection + insightText.
 * Persists results back onto the DailySummary in StorageService.
 * Never throws — must not affect the caller.
 */
export async function extractPromptsFromSummary(
  summary: DailySummary,
  date: string,
): Promise<void> {
  try {
    if (summary.perspectivePrompts !== undefined) return; // already extracted

    const text = [summary.reflection, summary.insightText].filter(Boolean).join('\n\n');
    if (!text || text.trim().length < MIN_ENTRY_CHARS) return;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: SUMMARY_EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: text }],
    });
    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const parsed = parseExtractionResponse(raw).slice(0, MAX_PROMPTS_PER_SUMMARY);
    const prompts: PerspectivePrompt[] = parsed.map(p => ({ ...p, source: 'summary' as const }));

    await StorageService.saveSummary({ ...summary, perspectivePrompts: prompts });
    DeviceEventEmitter.emit('perspectivePromptsUpdated', { date });
  } catch {
    // Non-fatal.
  }
}

// ── Aggregation for Home carousel ────────────────────────────────────────────

export interface ResolvedPerspectivePrompt extends PerspectivePrompt {
  /** ID of the source entry, or `summary-{date}` for summary-derived prompts. */
  entryId: string;
  /** YYYY-MM-DD this prompt belongs to (rollover-aware). */
  date: string;
  /** Timestamp used for "newest first" ordering. */
  entryTimestamp: number;
  /** Source text — entry transcript or summary reflection — for the chat opener. */
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
    const [entries, summary] = await Promise.all([
      StorageService.getTranscriptsForDate(date),
      StorageService.getSummaryForDate(date),
    ]);

    const all: ResolvedPerspectivePrompt[] = [];

    for (const e of entries) {
      if (!e.perspectivePrompts || e.perspectivePrompts.length === 0) continue;
      for (const p of e.perspectivePrompts) {
        all.push({ ...p, entryId: e.id, date, entryTimestamp: e.timestamp, entryText: e.text });
      }
    }

    if (summary?.perspectivePrompts?.length) {
      for (const p of summary.perspectivePrompts) {
        all.push({
          ...p,
          entryId: `summary-${date}`,
          date,
          entryTimestamp: summary.createdAt,
          entryText: summary.reflection ?? '',
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
        summary: await StorageService.getSummaryForDate(d),
      })),
    );

    const all: ResolvedPerspectivePrompt[] = [];
    for (const b of buckets) {
      for (const e of b.entries) {
        if (!e.perspectivePrompts || e.perspectivePrompts.length === 0) continue;
        for (const p of e.perspectivePrompts) {
          all.push({ ...p, entryId: e.id, date: b.date, entryTimestamp: e.timestamp, entryText: e.text });
        }
      }
      if (b.summary?.perspectivePrompts?.length) {
        for (const p of b.summary.perspectivePrompts) {
          all.push({
            ...p,
            entryId: `summary-${b.date}`,
            date: b.date,
            entryTimestamp: b.summary.createdAt,
            entryText: b.summary.reflection ?? '',
          });
        }
      }
    }

    // Newest first — summary prompts sort after the entries they synthesise
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
