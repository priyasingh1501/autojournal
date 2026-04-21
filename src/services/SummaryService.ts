import { claudeProxy } from './AIProxy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { TranscriptEntry, DailySummary, DayMacros, WeekReview, WeekReviewDay } from '../types';
import { StorageService } from './StorageService';
import { generateSummaryImage } from './SummaryImageService';
import { extractJournalSignal } from './WisdomService';
import { parseSummaryOutput, parseMacrosBody } from './summaryParser';
import {
  buildGroupedIntentionContextBlock,
  getActiveIntentions,
} from './IntentionsService';
import { parseWeekReviewOutput as parseWeekReviewOutputPure } from './weekReviewParser';

export { parseWeekReviewOutput } from './weekReviewParser';

const MAX_PHOTOS = 8; // Claude handles up to ~20 but keep cost/latency reasonable

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mediaTypeFromUri(uri: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function readPhotoAsBase64(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

export async function generateDailySummary(
  transcripts: TranscriptEntry[],
  date: string,
): Promise<DailySummary> {
  if (transcripts.length === 0) {
    throw new Error('No entries recorded today.');
  }

  // Start jellyfish image generation in parallel with Claude — doesn't block summary
  const imagePromise = generateSummaryImage(date, '');

  // Sort chronologically
  const sorted = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);

  // Build the text log — label voice vs manual, add tone tags from emotion detection
  const photoEntries = sorted.filter(t => t.photoUri);

  const textLog = sorted
    .map(t => {
      const time = formatTime(t.timestamp);
      const label = t.kind === 'manual' ? '[Note]' : '[Voice]';
      const tone  = t.emotionTags?.length ? ` [Tone: ${t.emotionTags.join(', ')}]` : '';
      if (t.text.trim()) {
        return `${label}${tone} [${time}] ${t.text.trim()}`;
      } else if (t.photoUri) {
        return `[Photo] [${time}] (see attached image)`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  // Pull active intentions so the model can reference them when they appear
  // in the day's entries.
  const activeIntentions = await getActiveIntentions().catch(() => []);
  const intentionsBlock = buildGroupedIntentionContextBlock(activeIntentions);

  // Adaptive prompt — the classic seven-section insight + macros, plus a
  // prose reflection, an adaptive "what the day held" list, and an optional
  // mood arc. Voice is observational, never diagnostic.
  const basePrompt = `You are an intelligent personal journal assistant.
You receive a mix of voice transcripts, written notes, and photos from a person's day.
Your job is to produce TWO things, separated by the exact line ===MACROS===.

PART 1 — Daily personal insight (plain text only, no markdown):
Use EXACTLY these seven section headings, each on its own line, followed by 1–2 sentences:
  Emotional check-in:
  Meals:
  Movement:
  Meditation:
  Spending:
  Recurring thoughts:
  Learnings:

Rules:
- No markdown symbols (no *, no #). Plain text only.
- Be specific — reference actual things from the entries.
- Entries may include a [Tone: tag, tag] marker — emotional tone signals. Factor them into the Emotional check-in.
- For Meals: flag any unhealthy patterns (junk food, skipped meals, late-night eating). Say "Looks balanced" if nothing concerning.
- For Movement: call out if there was no workout or physical activity today. Mention what was done if there was.
- For Meditation: note any meditation, breathwork, mindfulness, or pranayama practice. Say "None logged today" if not mentioned.
- For Spending: give a short qualitative note — high/low/unusual. Say "No spending logged" if nothing mentioned.
- For Recurring thoughts: name actual themes or concerns that appear more than once, or say "None that stood out today."
- For Learnings: note anything the person read, studied, learned at work, a new skill practised, or a meaningful new observation. Say "Nothing specific logged today" if nothing stands out.
- Write in second person ("You...").

Then output exactly this line on its own:
===MACROS===

PART 2 — Meal macro estimates (single JSON object, no other text):
If any food or drink was mentioned today, estimate totals and output ONLY:
{"calories": <kcal number>, "protein": <grams number>, "carbs": <grams number>, "fat": <grams number>}
If no meals were mentioned at all, output: null

Then output exactly this line on its own:
===REFLECTION===

PART 3 — Prose reflection (plain text, 2–4 sentences, NO markdown):
Write a short paragraph that mirrors the shape of the day. Rules:
- 2 to 4 sentences. Hard cap at 4.
- Warm, specific, observational voice. Second person ("You...").
- Include at least one time-stamped phrase grounded in the entries, like
  "by evening...", "after the meeting...", "in the morning...".
- Reference concrete details from the entries — people, places, activities.
- FORBIDDEN: diagnostic language (e.g. "anxious", "depressed", "avoidant"),
  trait-level claims ("you are a person who..."), personality inference,
  advice, or generalisations that extend beyond this specific day.
- Tentative, not conclusive. You are describing, not analysing.

Then output exactly this line on its own:
===WHATHELD===

PART 4 — What the day held (adaptive, one line per category):
Output ONLY the categories that actually appeared in today's entries. Do NOT
use a fixed list. Do NOT output empty or placeholder categories. Each line:
  Label: single sentence describing what showed up under that label.
Good labels when present: "Work", "Mom" (or another named relationship),
"Movement", "Spending", "Mood throughout the day", "Meals", "Meditation",
"Sleep", a specific project name, etc. If a category wasn't present, omit it
entirely. Short labels, short sentences.

If the user has active INTENTIONS (listed at the top of this prompt) and one
of them was touched on in today's entries, weave that into the relevant line
naturally — e.g. "Mom: came up twice. You called her back this time." Do NOT
add a line for an intention that wasn't actually touched on today. Do NOT
turn this into a scoreboard; observe, don't score.

Then output exactly this line on its own:
===MOODARC===

PART 5 — Mood arc (three emotion words, or null):
If the entries span enough of the day to support it (roughly: at least one
entry in the morning, one in the afternoon, and one in the evening), output
EXACTLY three lines — one emotion word each:
  morning: <single word>
  afternoon: <single word>
  evening: <single word>
If the day doesn't have entries across those periods, output ONLY:
null`;

  const systemPrompt = intentionsBlock
    ? `${intentionsBlock}\n\n${basePrompt}`
    : basePrompt;

  // Build multimodal content
  const content: any[] = [];

  content.push({
    type: 'text',
    text: `Here are today's (${date}) journal entries:\n\n${textLog}`,
  });

  // Attach photos (up to MAX_PHOTOS, in chronological order)
  const photosToEmbed = photoEntries.slice(0, MAX_PHOTOS);
  if (photosToEmbed.length > 0) {
    content.push({
      type: 'text',
      text: `\nAttached photo${photosToEmbed.length !== 1 ? 's' : ''} (${photosToEmbed.length}):`,
    });

    for (const entry of photosToEmbed) {
      const base64 = await readPhotoAsBase64(entry.photoUri!);
      if (!base64) continue; // file missing — skip silently

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaTypeFromUri(entry.photoUri!),
          data: base64,
        },
      });
      // Brief caption so Claude knows when each photo was taken
      content.push({
        type: 'text',
        text: `↑ Photo taken at ${formatTime(entry.timestamp)}${entry.text.trim() ? ` — "${entry.text.trim()}"` : ''}`,
      });
    }

    if (photoEntries.length > MAX_PHOTOS) {
      content.push({
        type: 'text',
        text: `(${photoEntries.length - MAX_PHOTOS} additional photo${photoEntries.length - MAX_PHOTOS !== 1 ? 's' : ''} not shown)`,
      });
    }
  }

  content.push({
    type: 'text',
    text: 'Please create a thoughtful daily summary based on all the entries above.',
  });

  const response = await claudeProxy.messages.create({
    model: 'claude-sonnet-4-6',  // sonnet supports vision and is 75× cheaper than opus
    max_tokens: 2400,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const fullText = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const parsed = parseSummaryOutput(fullText);
  const insightText = parsed.insightText;

  // Parse structured macro estimates from Part 2
  let dailyMacros: DayMacros | undefined;
  if (parsed.macrosRaw !== undefined) {
    const macros = parseMacrosBody(parsed.macrosRaw);
    if (macros) {
      dailyMacros = { date, ...macros };
    }
  }

  // Collect image result — may already be done since it ran in parallel with Claude
  const imageUri = await imagePromise.catch(() => null);

  const summary: DailySummary = {
    date,
    summary: '',         // generated on demand when user expands "Full breakdown"
    insightText,
    transcriptCount: transcripts.length,
    createdAt: Date.now(),
    imageUri: imageUri ?? undefined,
    dailyMacros,
    reflection: parsed.reflection,
    whatTheDayHeld: parsed.whatTheDayHeld,
    moodArc: parsed.moodArc,
  };

  await StorageService.saveSummary(summary);

  // Extract journal signal for wisdom feed contextualisation — use insightText
  // since summary (full breakdown) is now generated lazily.
  await extractJournalSignal(insightText ?? '').catch(() => {});

  return summary;
}

/**
 * Generates the categorised markdown "Full Breakdown" for a given date on demand.
 * Fetches transcripts, calls Claude, persists the result back to storage, and returns
 * the markdown string. Throws on error so the caller can show feedback.
 */
export async function generateFullBreakdown(date: string): Promise<string> {
  const transcripts = await StorageService.getTranscriptsForDate(date);
  if (transcripts.length === 0) throw new Error('No entries for this date.');

  const sorted = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);
  const photoEntries = sorted.filter(t => t.photoUri);

  const textLog = sorted
    .map(t => {
      const time = formatTime(t.timestamp);
      const label = t.kind === 'manual' ? '[Note]' : '[Voice]';
      const tone  = t.emotionTags?.length ? ` [Tone: ${t.emotionTags.join(', ')}]` : '';
      return t.text.trim()
        ? `${label}${tone} [${time}] ${t.text.trim()}`
        : t.photoUri ? `[Photo] [${time}] (see attached image)` : null;
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are an intelligent personal journal assistant.
Produce a categorised daily summary in strict markdown:
1. Start with a single bold sentence overview — no header, just **overview text**.
2. Include only categories that have actual content. Use exactly these headers:

## Thoughts & Reflections
## Ideas & Plans
## Learnings
## Meals & Food
## Spends & Expenses
## Health & Fitness
## Meditation & Mindfulness
## Tasks & Decisions
## Highlights

Under each header, use short bullet points (- item). Be concise.
[Tone: tag] markers are emotional tone signals — factor them in.
Write in second person ("You..."). Warm and personal tone. Total length 150–400 words.
Return ONLY the markdown — no preamble, no extra lines.`;

  const content: any[] = [
    { type: 'text', text: `Here are the journal entries for ${date}:\n\n${textLog}` },
  ];

  // Attach photos (up to MAX_PHOTOS)
  for (const entry of photoEntries.slice(0, MAX_PHOTOS)) {
    const base64 = await readPhotoAsBase64(entry.photoUri!);
    if (!base64) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromUri(entry.photoUri!), data: base64 } });
    content.push({ type: 'text', text: `↑ Photo at ${formatTime(entry.timestamp)}${entry.text.trim() ? ` — "${entry.text.trim()}"` : ''}` });
  }
  content.push({ type: 'text', text: 'Please create the categorised daily summary.' });

  const response = await claudeProxy.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const breakdownText = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  // Persist so subsequent expansions are instant
  const existing = await StorageService.getSummaryForDate(date);
  if (existing) {
    await StorageService.saveSummary({ ...existing, summary: breakdownText });
  }

  return breakdownText;
}

// ── Week Review ─────────────────────────────────────────────────────────────

const WEEK_REVIEW_KEY_PREFIX = 'week_review_';
export const WEEK_REVIEW_NOT_ENOUGH = 'WEEK_REVIEW_NOT_ENOUGH';

/** Returns Monday-of-week for a given YYYY-MM-DD in local time. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDaysLocal(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export async function getCachedWeekReview(weekStart: string): Promise<WeekReview | null> {
  try {
    const raw = await AsyncStorage.getItem(WEEK_REVIEW_KEY_PREFIX + weekStart);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveWeekReview(review: WeekReview): Promise<void> {
  await AsyncStorage.setItem(
    WEEK_REVIEW_KEY_PREFIX + review.weekStart,
    JSON.stringify(review),
  );
}

/**
 * Generate a week review for the week starting `weekStart` (a Monday).
 * Looks at up to 7 days of stored DailySummary entries. Throws
 * WEEK_REVIEW_NOT_ENOUGH when fewer than 3 days have entries — too sparse
 * to produce an honest reflection.
 */
export async function generateWeekReview(weekStart: string): Promise<WeekReview> {
  const weekEnd = addDaysLocal(weekStart, 6);
  const dates: string[] = Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));

  const summaries = await StorageService.getSummariesForDateRange(dates);
  if (summaries.length < 3) throw new Error(WEEK_REVIEW_NOT_ENOUGH);

  const entryCount = summaries.reduce((n, s) => n + (s.transcriptCount ?? 0), 0);

  const daysBlock = summaries
    .map(s => {
      // Prefer the adaptive reflection if present, fall back to insightText.
      const body = (s.reflection ?? s.insightText ?? s.summary ?? '').trim();
      return `[${s.date}]\n${body}`;
    })
    .join('\n\n');

  const system = `You are reading a week of someone's private journal summaries and writing a short week review.

VOICE RULES (hard — same as the Day Summary):
- Warm, specific, observational. Tentative, never diagnostic.
- Second person ("you").
- Time-stamped phrasing grounded in the week — "early in the week...", "by Thursday...", "on the weekend...".
- FORBIDDEN: trait labels, personality inference, advice, or generalisations beyond this week.

OUTPUT FORMAT — exactly two sentinel sections, nothing else:

===WEEK_REFLECTION===
Prose. 4–6 sentences mirroring the shape of the week. Reference real things from the entries — people, places, activities. Hard cap 6 sentences.

===WEEK_DAYS===
Raw JSON array (no code fences, no trailing commas). One object per day that had entries. Skip days without entries.
[
  { "date": "YYYY-MM-DD", "oneLiner": "A single sentence naming what that day held." }
]

Each oneLiner must be one sentence, time-of-day specific when possible, under 120 chars.

Return ONLY the two sentinel sections.`;

  const user = `Week: ${weekStart} → ${weekEnd}
Days logged: ${summaries.length} of 7.

DAY SUMMARIES:

${daysBlock}

Please produce the week review now.`;

  const response = await claudeProxy.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const parsed = parseWeekReviewOutputPure(raw, dates);
  const review: WeekReview = {
    weekStart,
    weekEnd,
    reflection: parsed.reflection,
    days: parsed.days,
    generatedAt: Date.now(),
    entryCount,
  };

  await saveWeekReview(review);
  return review;
}
