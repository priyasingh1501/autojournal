/**
 * PatternsService — observational, archive-grounded replacement for the
 * Insights tab. Behind ff_patterns_tab (not wired into UI yet).
 *
 * Contract:
 *   • thisMonth is populated for any archive >= 1 day.
 *   • acrossTime sections fade in as the archive matures; thresholds live in
 *     patternsParser.ts so they can be tested independently.
 *   • Output is parsed with the pure parsePatternsOutput(), which enforces
 *     the "2–3 evidence excerpts per observation" spec and drops malformed
 *     items rather than surfacing them.
 *
 * Does NOT share code with InsightV2Service — this is a parallel stack so
 * the old tab keeps working while we build the new one.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import { DailySummary, PatternsReport, TranscriptEntry } from '../types';
import {
  allowedAcrossTimeTypes,
  parsePatternsOutput,
  windowLabelFor,
} from './patternsParser';
import { getDismissed, isDismissed, DismissedObservation } from './patternsDismiss';
import {
  buildIntentionContextBlock,
  getActiveIntentions,
  intentionsEnabled,
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
  dates: string[];            // all summary dates, newest-first
  summaries: DailySummary[];  // parallel to dates
}

async function inspectArchive(): Promise<ArchiveStats> {
  const dates     = await StorageService.getSummaryDates();
  const summaries = await StorageService.getSummariesForDateRange(dates);

  const entryCount = summaries.reduce((n, s) => n + (s.transcriptCount ?? 0), 0);

  let archiveDays = 0;
  if (dates.length > 0) {
    const oldest = dates[dates.length - 1];
    const oldestTs = new Date(oldest + 'T00:00:00').getTime();
    archiveDays = Math.max(1, Math.floor((Date.now() - oldestTs) / 86_400_000));
  }

  return { archiveDays, entryCount, dates, summaries };
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
): string {
  const blocklist = dismissed.length === 0
    ? ''
    : [
        '\nPREVIOUSLY DISMISSED OBSERVATIONS (the user marked these as "not quite" or "too soft" — do NOT reproduce them; pick a genuinely different angle, or omit a section entirely rather than re-serve a rejected observation):',
        ...dismissed.slice(-40).map(d => `  - [${d.type}] "${d.title}" (reason: ${d.reason})`),
      ].join('\n');
  const sectionCatalog = [
    'whats_loud: A theme that has shown up often, recently. Title like "What\'s been loud lately".',
    'returning_question: A question the writer keeps circling back to across weeks. Title like "A question you keep returning to".',
    'mind_moving: A way their thinking has shifted — a stance, framing, or emphasis that has moved. Title like "How your mind has been moving".',
    'wondering_about: A tentative observation about something the writer seems to be wondering about, offered as a question rather than a claim. DISMISSIBLE. Title like "Something you might be wondering about".',
    'gone_quiet: A topic or concern that used to be loud and has recently dropped off. Title like "Something that\'s gone quiet".',
    'whats_pulling_you: (threshold: 30+ days) Recurring patterns of what the writer moves toward — excitement, aspiration, new challenges — and what they consistently avoid or resist. 2-4 sentences covering 2-3 toward-patterns and 1-2 away-patterns. No labels or type claims — only what is directly observable in the entries. Do NOT say "you are X"; say "you move toward / you tend to avoid". Title like "What moves you toward and away".',
    'stated_vs_actual: (threshold: 45+ days) SPARSE AND TENTATIVE. Surface only 1-2 specific divergences where something the writer explicitly stated as a value or intention is clearly contradicted by what actually appears in the entries. Both sides MUST be grounded in direct quotes or unambiguous paraphrase — never infer this without strong textual support on both sides. Maximum 2 divergences in the body. Voice: evidenced and observational, never accusatory. "I noticed" not "you are." DISMISSIBLE. Title like "Something worth noticing".',
    'recurring_cast: (threshold: 30+ days) Specific people or roles that appear repeatedly across entries, plus HOW they tend to appear — as support, friction, aspiration, obligation. 2-4 people/roles, each 1-2 sentences. Names are fine if the writer used them; roles ("your manager", "a close friend") are fine too. Title like "People who keep showing up".',
    'thinking_texture: (threshold: 45+ days) How the writer processes things in writing — do they analyse or narrate? Do they resolve thoughts within one entry or across entries? Do they use cause-effect or associative language? Do they zoom in on detail or out to systems? If both voice and typed entries exist, note any difference in texture. 3-4 sentences, pure observation, no labels ("not: you\'re a systems thinker"). Title like "How you tend to think on the page".',
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
  "type": "<one of: whats_loud | returning_question | mind_moving | wondering_about | gone_quiet | whats_pulling_you | stated_vs_actual | recurring_cast | thinking_texture>",
  "title": "<short observational title>",
  "body": "<2–4 sentences of prose observation, time-stamped>",
  "evidence": [
    { "excerpt": "<EXACT quote pulled verbatim from an entry — not a paraphrase>", "date": "YYYY-MM-DD" },
    { "excerpt": "...", "date": "YYYY-MM-DD" }
  ],
  "window": "<human-readable window label>"
}

EVIDENCE RULES (hard):
- Every observation MUST include 2–3 evidence items.
- Each "excerpt" MUST be a verbatim fragment from the entries provided — not summarised, not invented.
- Each "date" MUST match the bracketed [YYYY-MM-DD] header on the entry the excerpt came from.
- If you can't produce 2 real evidence excerpts for an observation, OMIT that observation.

SECTION CATALOG:
  - ${sectionCatalog}

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
 * Throws NOT_ENOUGH_DATA if the archive is empty (thisMonth needs something
 * to observe, even day-3).
 */
export async function generate(): Promise<GenerateResult> {
  const stats = await inspectArchive();
  if (stats.summaries.length === 0) {
    throw new Error(NOT_ENOUGH_DATA);
  }

  const allowed    = allowedAcrossTimeTypes(stats.archiveDays, stats.entryCount);
  const dismissed  = await getDismissed();
  const intentionsOn = await intentionsEnabled();
  const activeIntentions = intentionsOn ? await getActiveIntentions().catch(() => []) : [];
  const intentionsBlock = buildIntentionContextBlock(activeIntentions);
  const system     = buildSystemPrompt(allowed, dismissed, intentionsBlock);
  const { thisMonthText, archiveText } = await buildContext(stats);

  const userContent = [
    thisMonthText,
    archiveText,
    `\nArchive stats: ${stats.archiveDays} days, ${stats.entryCount} entries logged.`,
    `\nPlease produce the two-section report now.`,
  ].filter(Boolean).join('\n\n');

  const response = await claudeProxy.messages.create({
    // Opus for the first pass per the plan; we'll revisit cost after we see
    // real output quality.
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

  // Compute emotional arc on-device from emotionTags — no Claude call needed.
  const monthCutoff = Date.now() - 30 * 86_400_000;
  const thisMonthSummaries = stats.summaries.filter(
    s => new Date(s.date + 'T12:00:00').getTime() >= monthCutoff,
  );
  report.thisMonth.emotionalArc = await computeEmotionalArc(thisMonthSummaries);

  // Backfill window labels when the model omitted them (coerceString falls
  // through to the default in parser, but double-check here too).
  // Also filter out any observation that slipped through the prompt-level
  // blocklist — defense in depth against a model that ignores the rule.
  report.acrossTime = report.acrossTime
    .filter(o => !isDismissed(dismissed, o.type, o.title))
    .map(o => ({ ...o, window: o.window || windowLabelFor(o.type) }));

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
