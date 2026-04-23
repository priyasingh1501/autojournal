/**
 * PatternsService — observational, archive-grounded insight generation for
 * the Patterns tab.
 *
 * Contract:
 *   • thisMonth is populated for any archive >= 1 day.
 *   • acrossTime sections fade in as the archive matures; thresholds live in
 *     patternsParser.ts so they can be tested independently.
 *   • Output is parsed with the pure parsePatternsOutput(), which enforces
 *     the "2–3 evidence excerpts per observation" spec and drops malformed
 *     items rather than surfacing them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import { AcrossTimeObservation, DailySummary, Intention, PatternsReport, TranscriptEntry, VoiceMode } from '../types';
import {
  allowedAcrossTimeTypes,
  parseMindMovesJson,
  parseSingleObservationJson,
  parseStatedVsActualJson,
  parseThisMonthJson,
  parseWhatPullsYouJson,
  parseWhoShowsUpJson,
  windowLabelFor,
} from './patternsParser';
import { getDismissed, isDismissed, DismissedObservation } from './patternsDismiss';
import {
  buildIntentionContextBlock,
  getActiveIntentions,
} from './IntentionsService';

const CACHE_KEY   = 'patterns_report';
const HISTORY_KEY = 'patterns_report_history';
const HISTORY_CAP = 10;

export const NOT_ENOUGH_DATA = 'NOT_ENOUGH_DATA';

// ── Storage helpers ───────────────────────────────────────────────────────────

export async function getCachedReport(): Promise<PatternsReport | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function getReportHistory(): Promise<PatternsReport[]> {
  try {
    const json = await AsyncStorage.getItem(HISTORY_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

async function saveReport(report: PatternsReport): Promise<void> {
  // Push the *previous* cached report into history before overwriting, so
  // history captures the sequence of reports even if the user regenerates
  // multiple times in a day.
  const previous = await getCachedReport();
  if (previous) {
    const history = await getReportHistory();
    history.push(previous);
    // Keep only the last N — oldest entries drop off the front.
    const capped = history.length > HISTORY_CAP ? history.slice(-HISTORY_CAP) : history;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
  }
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(report));
}

// ── Archive introspection ─────────────────────────────────────────────────────

interface ArchiveStats {
  archiveDays: number;
  entryCount: number;
  dates: string[];             // all summary dates, newest-first
  summaries: DailySummary[];   // parallel to dates
  allTranscripts: TranscriptEntry[]; // raw entries across all dates, newest-first
}

async function inspectArchive(): Promise<ArchiveStats> {
  const dates     = await StorageService.getSummaryDates();
  const summaries = await StorageService.getSummariesForDateRange(dates);

  // Read raw transcripts — covers unsummarized entries (e.g. today before daily summary runs)
  const transcriptDates = await StorageService.getTranscriptDates();
  const allTranscripts: TranscriptEntry[] = [];
  for (const d of transcriptDates) {
    const entries = await StorageService.getTranscriptsForDate(d);
    allTranscripts.push(...entries);
  }

  const summaryEntryCount = summaries.reduce((n, s) => n + (s.transcriptCount ?? 0), 0);
  const entryCount = Math.max(summaryEntryCount, allTranscripts.length);

  // archiveDays from whichever source is oldest
  let archiveDays = 0;
  const allDatesSorted = [...new Set([...transcriptDates, ...dates])].sort();
  if (allDatesSorted.length > 0) {
    const oldest = allDatesSorted[0];
    const oldestTs = new Date(oldest + 'T00:00:00').getTime();
    archiveDays = Math.max(1, Math.floor((Date.now() - oldestTs) / 86_400_000));
  }

  return { archiveDays, entryCount, dates, summaries, allTranscripts };
}

// ── Emotional arc (on-device, no Claude) ─────────────────────────────────────

type EmotionalArcWeek = { week: number; dominantEmotion: string; note: string };

/**
 * Compute a 4-week emotional arc from this month's entry emotionTags.
 * Returns null if no week has tagged entries.
 *
 * Display week numbers follow calendar order (oldest → newest):
 *   W1 = 22–28 days ago   (bucket index 3)
 *   W2 = 15–21 days ago   (bucket index 2)
 *   W3 = 8–14 days ago    (bucket index 1)
 *   W4 = 0–7 days ago     (bucket index 0, most recent)
 *
 * Empty buckets are omitted, but surviving weeks keep their real calendar
 * position — so a gap in data shows up as a gap in the card, not a sequential
 * renumber that lies about when the emotion occurred.
 */
async function computeEmotionalArc(
  thisMonthSummaries: DailySummary[],
): Promise<Array<EmotionalArcWeek> | null> {
  const today = Date.now();
  const buckets: Array<Map<string, { count: number; note: string }>> = [
    new Map(), new Map(), new Map(), new Map(),
  ];

  for (const s of thisMonthSummaries) {
    const ts = new Date(s.date + 'T12:00:00').getTime();
    const daysAgo = (today - ts) / 86_400_000;
    const bucketIdx = Math.min(3, Math.max(0, Math.floor(daysAgo / 7)));
    const entries: TranscriptEntry[] = await StorageService.getTranscriptsForDate(s.date);
    for (const e of entries) {
      if (!e.emotionTags || e.emotionTags.length === 0) continue;
      for (const tag of e.emotionTags) {
        const existing = buckets[bucketIdx].get(tag);
        if (!existing) {
          buckets[bucketIdx].set(tag, { count: 1, note: e.text.trim().slice(0, 120) });
        } else {
          existing.count++;
        }
      }
    }
  }

  const weeks: EmotionalArcWeek[] = [];
  // Walk from oldest bucket to newest so W1..W4 come out in calendar order.
  for (let i = 3; i >= 0; i--) {
    const bucket = buckets[i];
    if (bucket.size === 0) continue;
    let top = '';
    let topData = { count: 0, note: '' };
    for (const [tag, data] of bucket) {
      if (data.count > topData.count) { top = tag; topData = data; }
    }
    weeks.push({ week: 4 - i, dominantEmotion: top, note: topData.note });
  }

  return weeks.length >= 1 ? weeks : null;
}

// ── Voice mode + early observations (on-device, no Claude) ───────────────────

export function deriveVoiceMode(entryCount: number): VoiceMode {
  if (entryCount < 8)  return 'provisional';
  if (entryCount <= 20) return 'emerging';
  return 'established';
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

function hourToTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5  && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeTextureEarly(entries: TranscriptEntry[]): AcrossTimeObservation | null {
  if (entries.length === 0) return null;

  const todCounts: Record<TimeOfDay, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const e of entries) {
    todCounts[hourToTimeOfDay(new Date(e.timestamp).getHours())]++;
  }
  const modalTOD = (Object.entries(todCounts) as [TimeOfDay, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const counts = entries.map(e => wordCount(e.text));
  const avgWords = Math.round(counts.reduce((s, n) => s + n, 0) / counts.length);

  const voiceEntries = entries.filter(e => !e.kind || e.kind === 'voice');
  const typedEntries = entries.filter(e => e.kind === 'manual');

  const lines: string[] = [];
  lines.push(`Most entries so far come in the ${modalTOD}.`);

  if (avgWords < 30) {
    lines.push(`They tend to be brief — around ${avgWords} words each.`);
  } else if (avgWords > 100) {
    lines.push(`Entries tend to run longer — around ${avgWords} words each.`);
  } else {
    lines.push(`Entries average around ${avgWords} words.`);
  }

  if (voiceEntries.length > 0 && typedEntries.length > 0) {
    const voiceAvg = Math.round(voiceEntries.map(e => wordCount(e.text)).reduce((s, n) => s + n, 0) / voiceEntries.length);
    const typedAvg = Math.round(typedEntries.map(e => wordCount(e.text)).reduce((s, n) => s + n, 0) / typedEntries.length);
    const ratio = `${voiceEntries.length} voice, ${typedEntries.length} typed`;
    if (voiceAvg > typedAvg * 1.3) {
      lines.push(`You're using both voice and text (${ratio}) — voice entries tend to run longer.`);
    } else if (typedAvg > voiceAvg * 1.3) {
      lines.push(`You're using both voice and text (${ratio}) — typed entries tend to run longer.`);
    } else {
      lines.push(`You're mixing voice and typed entries (${ratio}).`);
    }
  }

  return {
    type: 'texture_early',
    title: "How you're showing up so far",
    body: lines.join(' '),
    evidence: [],
    window: 'so far',
    dismissible: false,
  };
}

// ── Context building ──────────────────────────────────────────────────────────

function clip(s: string, max = 500): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

interface BuiltContext {
  thisMonthText: string;
  archiveText: string;
}

/**
 * Build the prompt's user content. Two sections:
 *   • This month (last 30 days) — summary + a small sample of raw entries so
 *     Claude can quote real text in `whatsLoud`.
 *   • Archive — older summaries, for acrossTime observations. One sampled
 *     entry per week provides quotable material without exploding the prompt.
 */
async function buildContext(stats: ArchiveStats): Promise<BuiltContext> {
  const today = Date.now();
  const monthCutoff = today - 30 * 86_400_000;

  // When no summaries exist yet, build context directly from raw transcript entries.
  if (stats.summaries.length === 0 && stats.allTranscripts.length > 0) {
    const sorted = [...stats.allTranscripts].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
    const entryBlocks = sorted.map(
      e => `[${new Date(e.timestamp).toISOString().slice(0, 10)}] "${clip(e.text, 400)}"`,
    );
    const thisMonthText = [
      `# This month (${stats.allTranscripts.length} entr${stats.allTranscripts.length === 1 ? 'y' : 'ies'} so far — no daily summaries yet)`,
      `## All entries so far`,
      entryBlocks.join('\n\n'),
    ].join('\n');
    return { thisMonthText, archiveText: '' };
  }

  const thisMonthSummaries = stats.summaries.filter(
    s => new Date(s.date + 'T12:00:00').getTime() >= monthCutoff,
  );
  const olderSummaries = stats.summaries.filter(
    s => new Date(s.date + 'T12:00:00').getTime() < monthCutoff,
  );

  // Pull 2 sampled entries per recent week for quotable material.
  const thisMonthEntryBlocks: string[] = [];
  const weekBuckets = new Map<number, string[]>();
  for (const s of thisMonthSummaries) {
    const ts = new Date(s.date + 'T12:00:00').getTime();
    const weekIdx = Math.floor((today - ts) / (7 * 86_400_000));
    if (!weekBuckets.has(weekIdx)) weekBuckets.set(weekIdx, []);
    if (weekBuckets.get(weekIdx)!.length >= 2) continue;
    const entries: TranscriptEntry[] = await StorageService.getTranscriptsForDate(s.date);
    const pick = entries.find(e => e.text.trim().length > 40);
    if (pick) {
      weekBuckets.get(weekIdx)!.push(`[${s.date}] "${clip(pick.text, 400)}"`);
    }
  }
  for (const [, blocks] of weekBuckets) thisMonthEntryBlocks.push(...blocks);

  const thisMonthText = [
    `# This month (last 30 days, ${thisMonthSummaries.length} days logged)`,
    thisMonthSummaries
      .map(s => `[${s.date}]\n${s.insightText ?? s.summary ?? ''}`)
      .join('\n\n'),
    thisMonthEntryBlocks.length > 0
      ? `\n## Sampled raw entries (real quotable text)\n${thisMonthEntryBlocks.join('\n\n')}`
      : '',
  ].join('\n').trim();

  // For the archive, one sampled entry per month keeps token count bounded.
  const archiveEntryBlocks: string[] = [];
  const monthsSeen = new Set<string>();
  for (const s of olderSummaries) {
    const monthKey = s.date.slice(0, 7);
    if (monthsSeen.has(monthKey)) continue;
    monthsSeen.add(monthKey);
    const entries: TranscriptEntry[] = await StorageService.getTranscriptsForDate(s.date);
    const pick = entries.find(e => e.text.trim().length > 40);
    if (pick) {
      archiveEntryBlocks.push(`[${s.date}] "${clip(pick.text, 400)}"`);
    }
  }

  const archiveText = olderSummaries.length === 0
    ? ''
    : [
        `# Archive (older than 30 days, ${olderSummaries.length} days logged)`,
        olderSummaries
          .map(s => `[${s.date}]\n${s.insightText ?? s.summary ?? ''}`)
          .join('\n\n'),
        archiveEntryBlocks.length > 0
          ? `\n## Sampled raw entries across the archive\n${archiveEntryBlocks.join('\n\n')}`
          : '',
      ].join('\n').trim();

  return { thisMonthText, archiveText };
}

// ── Prompts ───────────────────────────────────────────────────────────────────
// Each major card on the Patterns screen has its own focused prompt. They run
// in parallel so total latency stays close to a single call while each prompt
// can enforce its own voice, recurrence bar, and output shape.

function buildWhoShowsUpSystemPrompt(): string {
  return `You are reading someone's private journal archive and producing the "Who shows up" card — a breakdown of specific people or roles that appear repeatedly across the entries.

VOICE RULES (hard):
- Observational, specific, never diagnostic.
- Use second person ("you"). No advice, no prescriptions.
- FORBIDDEN: personality labels, clinical language, "you are a [noun]" claims about the user OR about the people in their life.

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "People who keep showing up",
  "window": "last 60 days",
  "body":   "<1–2 sentence overview of the cast as a fallback>",
  "people": [
    {
      "name":       "<verbatim name the writer used (e.g. 'Priya'), OR a role if they didn't name them (e.g. 'your manager', 'a close friend')>",
      "role":       "<one of: support | friction | aspiration | obligation>",
      "appearance": "<ONE observational sentence: how and when they tend to appear>",
      "mentions":   <integer: how many DISTINCT entries reference this person>,
      "evidence": [
        { "excerpt": "<EXACT quote from an entry that names this person — verbatim>", "date": "YYYY-MM-DD" },
        { "excerpt": "<EXACT quote from a DIFFERENT entry that names this person>", "date": "YYYY-MM-DD" }
      ]
    }
  ]
}

RECURRENCE BAR (hard — entries that don't meet it MUST be omitted, not softened):
- A person qualifies ONLY if they appear in at least 3 DISTINCT entries.
- Each qualifying person MUST have at least 2 evidence excerpts, each a verbatim quote
  from a different entry, each quote containing the person's name or referent.
- Each excerpt's "date" MUST match the bracketed [YYYY-MM-DD] on the entry it came from.
- If no one meets this bar, return an empty people array. Do NOT pad.

ROLE DEFINITIONS:
- support:    the person tends to ease, steady, or comfort the writer.
- friction:   the person tends to create tension, conflict, or strain.
- aspiration: the person reflects something the writer wants to grow toward.
- obligation: the person the writer writes about from a sense of duty or weight.
If a person fits multiple roles, pick the dominant one across their appearances.

Do NOT cap the number of people. Include every person who clears the bar.
Do NOT fabricate quotes. If you can't find a verbatim excerpt, omit that person.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildFirstImpressionSystemPrompt(voiceMode: VoiceMode): string {
  return `You are reading someone's earliest journal entries (between 3 and 8 entries total) and producing the "First read" card — the app's explicitly provisional first impression of what the writer seems to be about.

VOICE RULES (hard):
- Explicitly tentative. Open with phrases like "even this early...", "in just your first few entries...", "a first read, with the caveat that...".
- Never make confident claims. Always acknowledge the small window.
- Use second person ("you"). No trait labels, no personality typing, no advice.

VOICE CALIBRATION: ${voiceMode === 'provisional' ? 'You have very limited data — be explicitly tentative.' : voiceMode === 'emerging' ? 'You have enough data to see patterns forming but not confirm them.' : 'You have substantial data but this is still a first-impression card — keep it provisional by design.'}

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "A first read on you",
  "window": "first impression",
  "body":   "<one paragraph (3–5 sentences) — explicitly provisional first impression based on the earliest entries>",
  "evidence": [
    { "excerpt": "<EXACT verbatim quote from an early entry>", "date": "YYYY-MM-DD" }
  ]
}

HARD BAR (return {"body":"","evidence":[]} if not met):
- At least 1 verbatim evidence quote.
- Each quote's "date" MUST match the bracketed [YYYY-MM-DD] header.
- Do NOT fabricate quotes or impressions beyond what the entries actually show.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildWonderingAboutSystemPrompt(voiceMode: VoiceMode): string {
  return `You are reading someone's private journal archive and producing the "Something you might be wondering about" card — a tentative observation about a question or uncertainty the writer seems to be circling, offered as a question rather than a claim.

VOICE RULES (hard):
- Tentative, observational. Frame as a question the writer seems to be asking themselves, not a conclusion you've reached.
- Use second person ("you"). No advice, no prescriptions, no diagnosis.
- FORBIDDEN: trait labels, personality claims, "you are X". Use "it seems like you might be wondering", "a question that keeps surfacing", "something unresolved".

VOICE CALIBRATION: ${voiceMode === 'provisional' ? 'Very tentative — acknowledge the small window.' : voiceMode === 'emerging' ? 'Starting to notice patterns but acknowledge they are still forming.' : 'Observations can be confident the pattern exists, while the question itself remains open.'}

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "Something you might be wondering about",
  "window": "last 90 days",
  "body":   "<2–4 sentences describing the question the writer seems to be circling, time-stamped>",
  "evidence": [
    { "excerpt": "<EXACT verbatim quote>", "date": "YYYY-MM-DD" },
    { "excerpt": "<EXACT verbatim quote from a DIFFERENT entry>", "date": "YYYY-MM-DD" }
  ]
}

HARD BAR (return {"body":"","evidence":[]} if not met):
- At least 2 verbatim evidence quotes from different entries.
- Each quote's "date" MUST match the bracketed [YYYY-MM-DD] header.
- If the entries don't genuinely show the writer circling a question, omit rather than invent one.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildGoneQuietSystemPrompt(voiceMode: VoiceMode): string {
  return `You are reading someone's private journal archive and producing the "Something that's gone quiet" card — a topic or concern that used to be loud in earlier entries and has recently dropped off.

VOICE RULES (hard):
- Observational, never diagnostic. Describe the change, don't interpret why.
- Use second person ("you"). No advice.
- Time-stamp both halves: when it was loud and when it went quiet.

VOICE CALIBRATION: ${voiceMode === 'provisional' ? 'Too early for this observation — return empty.' : voiceMode === 'emerging' ? 'Acknowledge patterns are still forming.' : 'You have enough data for a confident comparison between earlier and recent entries.'}

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "Something that's gone quiet",
  "window": "last 60 days",
  "body":   "<2–4 sentences: what was loud, when it was loud, and when it dropped off>",
  "evidence": [
    { "excerpt": "<EXACT verbatim quote from an earlier entry where the topic was loud>", "date": "YYYY-MM-DD" },
    { "excerpt": "<EXACT verbatim quote from another earlier entry>", "date": "YYYY-MM-DD" }
  ]
}

HARD BAR (return {"body":"","evidence":[]} if not met):
- At least 2 verbatim quotes from when the topic WAS loud (not from the silent period).
- Each quote's "date" MUST match the bracketed [YYYY-MM-DD] header.
- The topic MUST have had a real presence earlier (3+ entries) and genuinely dropped off in the last 2-3 weeks.
- If no topic clearly went quiet, return empty — do not fabricate decline.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildMindMovesSystemPrompt(): string {
  return `You are reading someone's private journal archive and producing the "How your mind moves" card — a single observation that combines two things: (1) HOW the writer processes things on the page (their thinking texture), and (2) HOW their thinking has SHIFTED — stances, framings, or emphases that have moved over time.

VOICE RULES (hard):
- Observational, never diagnostic. No trait labels, no "you're a systems thinker", no MBTI/Big Five language.
- Use second person ("you"). No advice, no prescriptions.
- Specific examples beat abstract claims.

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "How your mind moves",
  "window": "last 60 days",
  "body":   "<3–5 sentences. First, describe the texture of your thinking (analyse vs narrate, resolve in one entry vs across entries, cause-effect vs associative, zoomed-in detail vs zoomed-out systems, voice vs typed differences if both exist). Then, describe ONE concrete shift you can see — a stance, framing, or emphasis that has moved. Time-stamp both halves when possible.>",
  "evidence": [
    { "excerpt": "<EXACT verbatim quote illustrating the texture>", "date": "YYYY-MM-DD" },
    { "excerpt": "<EXACT verbatim quote illustrating the shift — from earlier>", "date": "YYYY-MM-DD" },
    { "excerpt": "<EXACT verbatim quote illustrating where the shift landed — from more recent entry>", "date": "YYYY-MM-DD" }
  ]
}

HARD BAR (return {"body":"","evidence":[]} if not met):
- Both halves must be grounded: at least one quote supporting the texture claim, and two quotes (earlier + later) supporting the shift.
- Each quote's "date" MUST match the bracketed [YYYY-MM-DD] header on the entry.
- If you can't find a real shift, only write the texture half and include 2 texture quotes. Don't fabricate movement.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildStatedVsActualSystemPrompt(): string {
  return `You are reading someone's private journal archive and producing the "A gap worth noticing" card — one or two specific divergences between something the writer EXPLICITLY stated as a value or intention and what ACTUALLY appears in their entries.

VOICE RULES (hard):
- Observational and evidenced, never accusatory or diagnostic.
- Use "I noticed", "You named… around the same time entries mentioned…" — NEVER "you are X", "you don't really care about", "you're avoiding".
- Use second person ("you"). No advice, no prescriptions.
- Tentative language: "seems to", "appears", "often" — leave room for the writer to disagree.

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "Something worth noticing",
  "window": "last 60 days",
  "body":   "<2–4 sentences describing ONE gap: what you named as a value/intention on what date, and what the entries since then show. If you surface a second gap, separate with a paragraph break in the body.>",
  "stated": [
    { "excerpt": "<EXACT verbatim quote where the writer named the value or intention>", "date": "YYYY-MM-DD" }
  ],
  "actual": [
    { "excerpt": "<EXACT verbatim quote showing the divergent behavior>", "date": "YYYY-MM-DD" },
    { "excerpt": "<EXACT verbatim quote from a DIFFERENT entry>", "date": "YYYY-MM-DD" }
  ]
}

HARD BAR (omit the whole observation if any of these fail):
- The "stated" side MUST be a direct quote where the writer explicitly named the value/intention. Not inferred.
- The "actual" side MUST have ≥2 verbatim quotes from DIFFERENT entries showing the divergence.
- Each quote's "date" MUST match the bracketed [YYYY-MM-DD] on the entry it came from.
- Maximum 2 gaps total. Prefer 1 strong gap over 2 weak ones.
- If you can't find a stated-value quote AND ≥2 behavior quotes to contradict it, return: {"body": "", "stated": [], "actual": []}. Do NOT fabricate. Do NOT infer values the writer didn't name.

Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildWhatPullsYouSystemPrompt(): string {
  return `You are reading someone's private journal archive and producing the "What moves you toward and away" card.

VOICE RULES (hard):
- Observational, specific, never diagnostic.
- Use second person ("you"). No advice, no prescriptions.
- FORBIDDEN: personality labels, trait claims, "you are X". Say "you move toward / you tend to avoid".

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "title":  "What moves you toward and away",
  "window": "last 60 days",
  "toward": [
    {
      "theme":    "<short phrase or fragment naming what you move toward>",
      "detail":   "<ONE observational sentence describing the pull, time-stamped when relevant>",
      "mentions": <integer: how many DISTINCT entries show this pull>,
      "evidence": [
        { "excerpt": "<EXACT verbatim quote from an entry>", "date": "YYYY-MM-DD" },
        { "excerpt": "<EXACT verbatim quote from a DIFFERENT entry>", "date": "YYYY-MM-DD" }
      ]
    }
  ],
  "away": [
    {
      "theme":    "<short phrase naming what you avoid or resist>",
      "detail":   "<ONE observational sentence describing the avoidance>",
      "mentions": <integer>,
      "evidence": [
        { "excerpt": "<verbatim quote>", "date": "YYYY-MM-DD" },
        { "excerpt": "<verbatim quote from different entry>", "date": "YYYY-MM-DD" }
      ]
    }
  ]
}

RECURRENCE BAR (hard):
- Each item in "toward" or "away" MUST appear in at least 3 DISTINCT entries.
- Each item MUST include at least 2 verbatim evidence excerpts from DIFFERENT entries.
- Each excerpt's "date" MUST match the bracketed [YYYY-MM-DD] on the entry.
- Omit items that can't clear the bar. Do NOT pad either list.
- If nothing recurs, return empty arrays.

Do NOT cap either list. Include every toward- or away-pattern that clears the bar.
Return ONLY the JSON object — no explanation, no code fences.`;
}

function buildThisMonthSystemPrompt(
  activeIntentions: Intention[],
  intentionsBlock: string,
): string {
  const intentionsSpec = activeIntentions.length === 0
    ? `The user has NO active intentions. Return "intentionsProgress": null. Do NOT fabricate intentions.`
    : [
        `The user has ${activeIntentions.length} active intention(s), listed at the top of this prompt.`,
        `Return ONE entry in "intentionsProgress" for EACH active intention — never skip one.`,
        `Each note should be one honest observational sentence:`,
        `  - If the entries show the intention coming up, describe what you saw (e.g. "You wrote about running three times, all before noon.").`,
        `  - If the entries don't touch on it this month, say so plainly (e.g. "Didn't come up in your entries this month.").`,
        `Do NOT score, grade, or encourage. Observe only.`,
        `The "intention" field MUST match the active intention text verbatim.`,
      ].join('\n');

  return `You are reading a month of someone's private journal entries and producing the "This Month" card.

VOICE RULES (hard):
- Tentative, observational, specific. Describe what's present, don't diagnose.
- Time-stamp when relevant ("in the last week...", "since mid-month...").
- FORBIDDEN: trait labels, personality claims, clinical language, "you are a [noun]", advice, prescriptions.
- Write in second person ("you").

OUTPUT FORMAT — a single raw JSON object, no code fences, no preamble:
{
  "reflection": "<3–5 sentences of prose summarising the month so far — specific and time-stamped>",
  "whatsLoud": ["<full-sentence theme>", "<full-sentence theme>", ...],
  "intentionsProgress": null | [ { "intention": "<verbatim intention text>", "note": "<one-line observational note>" }, ... ]
}

RECURRING THEMES RULES (for "whatsLoud"):
- The goal is to tell the user where their focus has been repeatedly across the month —
  topics, concerns, or areas of life their attention keeps returning to.
- Each theme MUST be a full observational sentence, not a label or short phrase.
  Example: "Your health has been rough throughout the month and your attention has kept coming back to it."
  Example: "Work deadlines have dominated — they showed up in most entries from the last three weeks."
- Each theme MUST be genuinely recurring: appears in at least 3 entries AND across at least 2 different weeks of the month.
- Do NOT include one-off incidents, single-week preoccupations, or themes you can't support with repeated appearances.
- Do NOT cap the list artificially — include every theme that meets the recurrence bar.
  If only one theme truly recurs, return one. If five recur, return five. If none do, return [].
- Order themes by how much of the month's attention they took up, loudest first.

INTENTIONS RULES:
${intentionsSpec}

Return ONLY the JSON object — no explanation, no code fences.${intentionsBlock ? `\n\n${intentionsBlock}` : ''}`;
}


// ── Generate ──────────────────────────────────────────────────────────────────

export interface GenerateResult {
  report: PatternsReport;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Generate a fresh PatternsReport from the archive.
 *
 * Throws NOT_ENOUGH_DATA only if there are zero transcript entries.
 * From entry 1: texture_early is computed on-device without a Claude call.
 * From entry 3: first_impression and early_signal are Claude-generated.
 */
/**
 * Count how many times an intention was mentioned in journal entries during
 * the last 4 completed+current weeks. Uses the on-device rolling
 * weeklyMentionCounts tracked by IntentionsService.recordMention.
 */
function countMentionsLastFourWeeks(intention: Intention): number {
  const counts = intention.weeklyMentionCounts ?? [];
  if (counts.length === 0) return 0;
  // Week keys are ISO-8601 ("YYYY-Www"). Lexicographic sort puts newest last.
  const sorted = [...counts].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  const recent = sorted.slice(-4);
  return recent.reduce((n, w) => n + w.count, 0);
}

export async function generate(): Promise<GenerateResult> {
  const stats = await inspectArchive();
  if (stats.entryCount === 0) {
    throw new Error(NOT_ENOUGH_DATA);
  }

  const voiceMode  = deriveVoiceMode(stats.entryCount);
  const allowed    = allowedAcrossTimeTypes(stats.archiveDays, stats.entryCount);
  const dismissed  = await getDismissed();
  const activeIntentions = await getActiveIntentions().catch(() => []);
  const intentionsBlock = buildIntentionContextBlock(activeIntentions);
  const { thisMonthText, archiveText } = await buildContext(stats);

  const thisMonthUser = [
    thisMonthText,
    `\nArchive stats: ${stats.archiveDays} days, ${stats.entryCount} entries logged.`,
    `\nProduce the This Month JSON object now.`,
  ].filter(Boolean).join('\n\n');

  const fullArchiveUser = [
    thisMonthText,
    archiveText,
    `\nArchive stats: ${stats.archiveDays} days, ${stats.entryCount} entries logged.`,
  ].filter(Boolean).join('\n\n');

  const makeCall = (system: string, user: string, maxTokens: number) =>
    claudeProxy.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { timeoutMs: 90_000 },
    );

  // Only fire a per-card call if the archive is mature enough for that type.
  // `allowed` comes from allowedAcrossTimeTypes() and already encodes the
  // entry-count + archive-day thresholds.
  const allowedSet = new Set(allowed);
  const nullResponse = Promise.resolve(null as any);
  const maybe = <T>(cond: boolean, call: () => Promise<T>) =>
    cond ? call() : (nullResponse as Promise<T | null>);

  const [
    thisMonthRes,
    whoShowsUpRes,
    whatPullsYouRes,
    mindMovesRes,
    statedVsActualRes,
    firstImpressionRes,
    wonderingAboutRes,
    goneQuietRes,
  ] = await Promise.all([
    makeCall(buildThisMonthSystemPrompt(activeIntentions, intentionsBlock), thisMonthUser, 800),
    maybe(allowedSet.has('recurring_cast'),
      () => makeCall(buildWhoShowsUpSystemPrompt(), `${fullArchiveUser}\n\nProduce the Who Shows Up JSON object now.`, 1600)),
    maybe(allowedSet.has('whats_pulling_you'),
      () => makeCall(buildWhatPullsYouSystemPrompt(), `${fullArchiveUser}\n\nProduce the What Pulls You JSON object now.`, 1600)),
    maybe(allowedSet.has('mind_moving') || allowedSet.has('thinking_texture'),
      () => makeCall(buildMindMovesSystemPrompt(), `${fullArchiveUser}\n\nProduce the How Your Mind Moves JSON object now.`, 700)),
    maybe(allowedSet.has('stated_vs_actual'),
      () => makeCall(buildStatedVsActualSystemPrompt(), `${fullArchiveUser}\n\nProduce the A Gap Worth Noticing JSON object now.`, 700)),
    maybe(allowedSet.has('first_impression'),
      () => makeCall(buildFirstImpressionSystemPrompt(voiceMode), `${fullArchiveUser}\n\nProduce the First Read JSON object now.`, 500)),
    maybe(allowedSet.has('wondering_about'),
      () => makeCall(buildWonderingAboutSystemPrompt(voiceMode), `${fullArchiveUser}\n\nProduce the Wondering About JSON object now.`, 600)),
    maybe(allowedSet.has('gone_quiet'),
      () => makeCall(buildGoneQuietSystemPrompt(voiceMode), `${fullArchiveUser}\n\nProduce the Gone Quiet JSON object now.`, 600)),
  ]);

  const extractText = (res: any) =>
    res ? res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') : '';

  const parsedThisMonth = parseThisMonthJson(extractText(thisMonthRes));
  const whoShowsUp      = whoShowsUpRes     ? parseWhoShowsUpJson(extractText(whoShowsUpRes))         : null;
  const whatPullsYou    = whatPullsYouRes   ? parseWhatPullsYouJson(extractText(whatPullsYouRes))     : null;
  const mindMoves       = mindMovesRes      ? parseMindMovesJson(extractText(mindMovesRes))           : null;
  const statedVsActual  = statedVsActualRes ? parseStatedVsActualJson(extractText(statedVsActualRes)) : null;
  const firstImpression = firstImpressionRes
    ? parseSingleObservationJson(extractText(firstImpressionRes), 'first_impression')
    : null;
  const wonderingAbout  = wonderingAboutRes
    ? parseSingleObservationJson(extractText(wonderingAboutRes), 'wondering_about')
    : null;
  const goneQuiet       = goneQuietRes
    ? parseSingleObservationJson(extractText(goneQuietRes), 'gone_quiet')
    : null;

  // Join LLM intention notes with on-device mention counts so every active
  // intention has a row, even ones the model skipped.
  let intentionsProgress: PatternsReport['thisMonth']['intentionsProgress'] = null;
  if (activeIntentions.length > 0) {
    const noteByIntention = new Map<string, string>();
    for (const n of parsedThisMonth.intentionNotes ?? []) {
      noteByIntention.set(n.intention.toLowerCase().trim(), n.note);
    }
    intentionsProgress = activeIntentions.map(i => ({
      intention: i.text,
      note:      noteByIntention.get(i.text.toLowerCase().trim()) ?? '',
      mentions:  countMentionsLastFourWeeks(i),
    }));
  }

  // Compute emotional arc on-device from emotionTags — no Claude call needed.
  const monthCutoff = Date.now() - 30 * 86_400_000;
  const thisMonthSummaries = stats.summaries.filter(
    s => new Date(s.date + 'T12:00:00').getTime() >= monthCutoff,
  );
  const emotionalArc = await computeEmotionalArc(thisMonthSummaries);

  // Merge every per-card output into one acrossTime array in display order.
  const merged: AcrossTimeObservation[] = [];
  if (firstImpression) merged.push(firstImpression);
  if (whoShowsUp)      merged.push(whoShowsUp);
  if (whatPullsYou)    merged.push(whatPullsYou);
  if (mindMoves)       merged.push(mindMoves);
  if (statedVsActual)  merged.push(statedVsActual);
  if (wonderingAbout)  merged.push(wonderingAbout);
  if (goneQuiet)       merged.push(goneQuiet);
  const fullAcrossTime = merged
    .filter(o => !isDismissed(dismissed, o.type, o.title))
    .map(o => ({ ...o, window: o.window || windowLabelFor(o.type) }));

  const report: PatternsReport = {
    generatedAt: Date.now(),
    archiveDays: stats.archiveDays,
    entryCount:  stats.entryCount,
    voiceMode,
    thisMonth: {
      reflection:         parsedThisMonth.reflection,
      whatsLoud:          parsedThisMonth.whatsLoud,
      intentionsProgress,
      emotionalArc,
    },
    acrossTime: fullAcrossTime,
  };

  const sumUsage = (field: 'input_tokens' | 'output_tokens') =>
    [
      thisMonthRes, whoShowsUpRes, whatPullsYouRes, mindMovesRes,
      statedVsActualRes, firstImpressionRes, wonderingAboutRes, goneQuietRes,
    ].reduce((n, r) => n + ((r as any)?.usage?.[field] ?? 0), 0);
  const usage = {
    inputTokens:  sumUsage('input_tokens'),
    outputTokens: sumUsage('output_tokens'),
  };
  console.log(
    `[PatternsService] generated: archiveDays=${stats.archiveDays} entries=${stats.entryCount} ` +
    `tokens_in=${usage.inputTokens} tokens_out=${usage.outputTokens} acrossTime=${fullAcrossTime.length}`,
  );

  await saveReport(report);
  return { report, usage };
}
