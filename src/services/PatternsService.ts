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
import { AcrossTimeObservation, DailySummary, PatternsReport, TranscriptEntry, VoiceMode } from '../types';
import {
  allowedAcrossTimeTypes,
  parsePatternsOutput,
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
 * Returns null if fewer than 2 weeks have tagged entries.
 * week 1 = most recent 7 days, week 4 = days 22-28 ago.
 */
async function computeEmotionalArc(
  thisMonthSummaries: DailySummary[],
): Promise<Array<EmotionalArcWeek> | null> {
  const today = Date.now();
  // bucket[0] = last 7 days (week 1 in display), bucket[3] = days 22-28 (week 4)
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
  for (let i = 0; i < 4; i++) {
    const bucket = buckets[i];
    if (bucket.size === 0) continue;
    let top = '';
    let topData = { count: 0, note: '' };
    for (const [tag, data] of bucket) {
      if (data.count > topData.count) { top = tag; topData = data; }
    }
    weeks.push({ week: i + 1, dominantEmotion: top, note: topData.note });
  }

  // Reverse so week 1 = earliest in the month (calendar order)
  weeks.reverse();
  for (let i = 0; i < weeks.length; i++) weeks[i].week = i + 1;

  return weeks.length >= 2 ? weeks : null;
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

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  allowedTypes: readonly string[],
  dismissed: DismissedObservation[],
  intentionsBlock: string,
  voiceMode: VoiceMode,
): string {
  const blocklist = dismissed.length === 0
    ? ''
    : [
        '\nPREVIOUSLY DISMISSED OBSERVATIONS (the user marked these as "not quite" or "too soft" — do NOT reproduce them; pick a genuinely different angle, or omit a section entirely rather than re-serve a rejected observation):',
        ...dismissed.slice(-40).map(d => `  - [${d.type}] "${d.title}" (reason: ${d.reason})`),
      ].join('\n');
  const voiceCalibration = voiceMode === 'provisional'
    ? `VOICE CALIBRATION — PROVISIONAL (fewer than 8 entries): You have very limited data. Be explicitly tentative. Open observations with phrases like "even this early...", "in just your first few entries...", "something that's already showing up...". Never make confident declarations. Always acknowledge you are working from a small window.`
    : voiceMode === 'emerging'
    ? `VOICE CALIBRATION — EMERGING (8–20 entries): You have enough data to see patterns forming but not fully confirm them. Use language like "starting to notice...", "a pattern that seems to be forming...", "coming up more than once...". Be confident the observation exists while being honest it is still early.`
    : `VOICE CALIBRATION — ESTABLISHED (20+ entries): You have substantial data. Use declarative observations. The patterns are real. Speak with appropriate confidence while maintaining an observational rather than diagnostic voice. Avoid hedging that would weaken observations you have strong evidence for.`;

  const sectionCatalog = [
    'early_signal: (appears from entry 3) Explicitly tentative first observation about what is already showing up, even with limited data. Open with phrases like "even this early...", "in just your first few entries...". Never make confident claims — acknowledge the small window. Title like "Something already showing up".',
    'first_impression: (appears only when entryCount is between 3 and 8) The app\'s first read on what this person seems to be about, based on their earliest entries. One paragraph, explicitly provisional. Title like "A first read on you".',
    'whats_loud: A theme that has shown up often, recently. Title like "What\'s been loud lately".',
    'returning_question: A question the writer keeps circling back to across entries. Title like "A question you keep returning to".',
    'mind_moving: A way their thinking has shifted — a stance, framing, or emphasis that has moved. Title like "How your mind has been moving".',
    'wondering_about: A tentative observation about something the writer seems to be wondering about, offered as a question rather than a claim. DISMISSIBLE. Title like "Something you might be wondering about".',
    'gone_quiet: A topic or concern that used to be loud and has recently dropped off. Title like "Something that\'s gone quiet".',
    'whats_pulling_you: Recurring patterns of what the writer moves toward — excitement, aspiration, new challenges — and what they consistently avoid or resist. 2-4 sentences covering 2-3 toward-patterns and 1-2 away-patterns. No labels or type claims — only what is directly observable in the entries. Do NOT say "you are X"; say "you move toward / you tend to avoid". Title like "What moves you toward and away".',
    'stated_vs_actual: SPARSE AND TENTATIVE. Surface only 1-2 specific divergences where something the writer explicitly stated as a value or intention is clearly contradicted by what actually appears in the entries. Both sides MUST be grounded in direct quotes or unambiguous paraphrase — never infer this without strong textual support on both sides. Maximum 2 divergences in the body. Voice: evidenced and observational, never accusatory. "I noticed" not "you are." DISMISSIBLE. Title like "Something worth noticing".',
    'recurring_cast: Specific people or roles that appear repeatedly across entries, plus HOW they tend to appear — as support, friction, aspiration, obligation. 2-4 people/roles, each 1-2 sentences. Names are fine if the writer used them; roles ("your manager", "a close friend") are fine too. Title like "People who keep showing up".',
    'thinking_texture: How the writer processes things in writing — do they analyse or narrate? Do they resolve thoughts within one entry or across entries? Do they use cause-effect or associative language? Do they zoom in on detail or out to systems? If both voice and typed entries exist, note any difference in texture. 3-4 sentences, pure observation, no labels ("not: you\'re a systems thinker"). Title like "How you tend to think on the page".',
    'self_language: (threshold: 8+ entries) Scan for verbatim self-referential phrases the writer uses to describe themselves: "I\'m the kind of person who", "I always", "I never", "I tend to", "I\'m bad at", "I\'m good at", "I\'m someone who", "I can\'t", "I don\'t". Extract 3-6 of the most distinctive phrases verbatim — do NOT paraphrase or interpret. Format the body as one phrase per line, nothing else. No interpretation, no preamble, no explanation. Evidence array must be empty — the phrases ARE the content. Title like "Words you use about yourself". The card will display these phrases exactly as written.',
    'repeating_story: (threshold: 12+ entries) Identify narrative conclusions the user has already reached and keeps restating as fact. These are NOT open questions (unlike returning_question) — they are calcified beliefs: "things always go wrong when...", "I\'m someone who never...", "it always ends up that...", "people like me don\'t...". Body: state the distilled pattern in one phrase, then note how many entries it appeared in and in what contexts. Max 2 repeating stories per generation. Include 1 verbatim evidence excerpt. Voice: purely observational — "you\'ve said something like this X times" not "you believe that...". DISMISSIBLE. Title like "A story you keep telling".',
  ].join('\n  - ');

  const allowedList = allowedTypes.length === 0
    ? 'NONE. Return an empty array.'
    : allowedTypes.join(', ');

  return `You are reading someone's private journal archive. Your task is to produce an observational "Patterns" report — NOT a personality assessment.

VOICE RULES (hard):
- Tentative, observational, specific. Describe what's present, don't diagnose.
- Time-stamp observations ("over the last three weeks...", "in early March...", "since Feb 20...").
- FORBIDDEN: classification language, trait labels, type labels, Big Five / Enneagram / MBTI references, "you are a [noun]" claims, clinical-sounding adjectives ("anxious personality", "avoidant", etc.).
- Write in second person ("you").
- No advice, no prescriptions, no "you should".

OUTPUT FORMAT — two sentinel-separated sections, nothing else:

===THIS_MONTH===
A single JSON object (raw JSON, no code fences, no trailing commas):
{
  "reflection": "<3–5 sentence prose about the month so far. Warm, specific, time-stamped.>",
  "whatsLoud": ["<short phrase>", "<short phrase>", "<short phrase>"],  // 1–3 items, naming what's been loud this month
  "intentionsProgress": null  // see rules below — null when no active intentions are provided
}

If ACTIVE INTENTIONS are listed at the top of this prompt, populate intentionsProgress
with one short status per intention — an observational one-sentence note about what
showed up this month, e.g. "You called her three times; once this past weekend was the
longest call." If NO active intentions were provided, intentionsProgress MUST be null.
Do NOT fabricate intentions the user didn't declare. Do NOT score or grade — observe.

===ACROSS_TIME===
A single JSON array of observation objects. ONLY include observations of the following types (the archive is not yet mature enough for others):
  TYPES ALLOWED THIS RUN: ${allowedList}

Each observation object:
{
  "type": "<one of: early_signal | first_impression | whats_loud | returning_question | mind_moving | wondering_about | gone_quiet | whats_pulling_you | stated_vs_actual | recurring_cast | thinking_texture | self_language | repeating_story>",
  "title": "<short observational title>",
  "body": "<2–4 sentences of prose observation, time-stamped>",
  "evidence": [
    { "excerpt": "<EXACT quote pulled verbatim from an entry — not a paraphrase>", "date": "YYYY-MM-DD" },
    { "excerpt": "...", "date": "YYYY-MM-DD" }
  ],
  "window": "<human-readable window label>"
}

EVIDENCE RULES (hard):
- For self_language: evidence array MUST be empty [] — the phrases in the body are the content.
- For early_signal, first_impression, repeating_story: include at least 1 evidence item.
- For all other types: include 2–3 evidence items.
- Each "excerpt" MUST be a verbatim fragment from the entries provided — not summarised, not invented.
- Each "date" MUST match the bracketed [YYYY-MM-DD] header on the entry the excerpt came from.
- If you can't produce the required evidence for an observation, OMIT that observation.

SECTION CATALOG:
  - ${sectionCatalog}

${voiceCalibration}

Return ONLY the two sentinel sections and their JSON — no preamble, no explanation, no code fences around the sentinel blocks.${intentionsBlock ? `\n\n${intentionsBlock}` : ''}${blocklist}`;
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
  const system     = buildSystemPrompt(allowed, dismissed, intentionsBlock, voiceMode);
  const { thisMonthText, archiveText } = await buildContext(stats);

  const userContent = [
    thisMonthText,
    archiveText,
    `\nArchive stats: ${stats.archiveDays} days, ${stats.entryCount} entries logged.`,
    `\nPlease produce the two-section report now.`,
  ].filter(Boolean).join('\n\n');

  const response = await claudeProxy.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const report = parsePatternsOutput(raw, {
    generatedAt: Date.now(),
    archiveDays: stats.archiveDays,
    entryCount:  stats.entryCount,
  });

  report.voiceMode = voiceMode;

  // Compute emotional arc on-device from emotionTags — no Claude call needed.
  const monthCutoff = Date.now() - 30 * 86_400_000;
  const thisMonthSummaries = stats.summaries.filter(
    s => new Date(s.date + 'T12:00:00').getTime() >= monthCutoff,
  );
  report.thisMonth.emotionalArc = await computeEmotionalArc(thisMonthSummaries);

  // Inject texture_early (on-device, entry 1+) at the front of acrossTime.
  const textureEarly = computeTextureEarly(stats.allTranscripts);

  // Backfill window labels; filter prompt-level blocklist bypasses.
  report.acrossTime = report.acrossTime
    .filter(o => !isDismissed(dismissed, o.type, o.title))
    .map(o => ({ ...o, window: o.window || windowLabelFor(o.type) }));

  // Prepend texture_early so it's always available to the curator.
  if (textureEarly) {
    report.acrossTime = [textureEarly, ...report.acrossTime];
  }

  const usage = {
    inputTokens:  (response as any)?.usage?.input_tokens  ?? 0,
    outputTokens: (response as any)?.usage?.output_tokens ?? 0,
  };
  // Cost tracking — keep lightweight so we can spot runaway prompts.
  console.log(
    `[PatternsService] generated: archiveDays=${stats.archiveDays} entries=${stats.entryCount} ` +
    `tokens_in=${usage.inputTokens} tokens_out=${usage.outputTokens} acrossTime=${report.acrossTime.length}`,
  );

  await saveReport(report);
  return { report, usage };
}
