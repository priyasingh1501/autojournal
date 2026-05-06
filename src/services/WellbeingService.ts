/**
 * WellbeingService — Distress detection and longitudinal tracking.
 *
 * Two-signal model:
 *   1. In-session:    Claude classifies the current entry into a distress tier.
 *   2. Longitudinal:  Recent distress event history is fed as context, so a
 *                     single bad day looks different from a multi-week drift.
 *
 * Tiers:
 *   Tier 1 (0–39)  — Normal emotional range. No special handling.
 *   Tier 2 (40–69) — Sustained low state. Warm check-in, no alarm.
 *   Tier 3 (70–100)— Acute crisis. Pause + resources.
 *
 * The service is always called fire-and-forget; it never throws.
 * Returns null if wellbeing check-ins are disabled or API key is missing.
 */

import { claudeProxy } from './AIProxy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { TranscriptEntry } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DistressTier = 1 | 2 | 3;

export interface WellbeingAnalysis {
  tier: DistressTier;
  score: number; // 0–100
}

export interface DistressEvent {
  date: string;          // YYYY-MM-DD
  timestamp: number;
  tier: DistressTier;
  score: number;
  transcriptId: string;
}

export interface ReentryPending {
  tier: DistressTier;
  date: string;          // date of the event that triggered this
}

// ── Storage keys ───────────────────────────────────────────────────────────────

const ENABLED_KEY  = 'wellbeing_enabled';
const EVENTS_KEY   = 'wellbeing_events';
const REENTRY_KEY  = 'wellbeing_reentry';
const LOG_KEY      = 'wellbeing_log';
const FP_KEY       = 'wellbeing_false_positives'; // array of unix timestamps

// ── Logging ────────────────────────────────────────────────────────────────────

export interface WellbeingLogEntry {
  timestamp: number;
  date: string;
  tier: DistressTier;
  score: number;
  source: 'entry' | 'call';
  transcriptId?: string;
  tier3Confirmed?: boolean; // Sonnet agreed with Haiku's Tier 3 call
}

async function appendLog(entry: WellbeingLogEntry): Promise<void> {
  try {
    const json = await AsyncStorage.getItem(LOG_KEY);
    let log: WellbeingLogEntry[] = json ? JSON.parse(json) : [];
    log.push(entry);
    if (log.length > 200) log = log.slice(-200);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch { /* never throw from logging */ }
}

export async function getWellbeingLog(): Promise<WellbeingLogEntry[]> {
  const json = await AsyncStorage.getItem(LOG_KEY);
  return json ? JSON.parse(json) : [];
}

// ── Settings ───────────────────────────────────────────────────────────────────

export async function isWellbeingEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(ENABLED_KEY);
  return val !== 'false'; // default = enabled
}

export async function setWellbeingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

// ── Event history ──────────────────────────────────────────────────────────────

export async function getRecentDistressEvents(days = 14): Promise<DistressEvent[]> {
  const json = await AsyncStorage.getItem(EVENTS_KEY);
  const all: DistressEvent[] = json ? JSON.parse(json) : [];
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
  return all.filter(e => e.date >= cutoff);
}

async function saveDistressEvent(event: DistressEvent): Promise<void> {
  const json = await AsyncStorage.getItem(EVENTS_KEY);
  let all: DistressEvent[] = json ? JSON.parse(json) : [];
  all.push(event);
  // Cap at 90 events (≈3 months of daily journaling)
  if (all.length > 90) all = all.slice(-90);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(all));
}

// ── False-positive feedback & per-user threshold calibration ──────────────────

/**
 * Record that the user dismissed a wellbeing alert as a false positive
 * ("I was just venting"). Used to calibrate the Tier 2 threshold upward
 * so that repeat false positives become progressively less likely.
 */
export async function recordFalsePositive(): Promise<void> {
  try {
    const json = await AsyncStorage.getItem(FP_KEY);
    let timestamps: number[] = json ? JSON.parse(json) : [];
    timestamps.push(Date.now());
    // Keep only last 30 days to avoid unbounded growth
    const cutoff = Date.now() - 30 * 86_400_000;
    timestamps = timestamps.filter(t => t > cutoff);
    await AsyncStorage.setItem(FP_KEY, JSON.stringify(timestamps));
  } catch { /* never throw */ }
}

async function getRecentFalsePositiveCount(days = 14): Promise<number> {
  const json = await AsyncStorage.getItem(FP_KEY);
  const timestamps: number[] = json ? JSON.parse(json) : [];
  const cutoff = Date.now() - days * 86_400_000;
  return timestamps.filter(t => t > cutoff).length;
}

async function getLastFalsePositiveTimestamp(): Promise<number | null> {
  const json = await AsyncStorage.getItem(FP_KEY);
  const timestamps: number[] = json ? JSON.parse(json) : [];
  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

// ── Re-entry check-in ──────────────────────────────────────────────────────────

export async function getPendingReentry(): Promise<ReentryPending | null> {
  const json = await AsyncStorage.getItem(REENTRY_KEY);
  return json ? JSON.parse(json) : null;
}

export async function clearPendingReentry(): Promise<void> {
  await AsyncStorage.removeItem(REENTRY_KEY);
}

export async function queueReentry(tier: DistressTier, date: string): Promise<void> {
  await AsyncStorage.setItem(REENTRY_KEY, JSON.stringify({ tier, date }));
}

// ── Main analysis function ─────────────────────────────────────────────────────

/**
 * Lightweight in-call distress check. Called after each user turn during a voice call.
 * Uses the full accumulated user speech as context so distress that builds across the
 * call is caught even if any individual utterance seems mild.
 *
 * @param allUserTexts  All user utterances so far in the call, in order.
 * @param turnCount     How many turns have been exchanged (used for context calibration).
 * @returns             DistressTier (1, 2 or 3), or null if check-ins are disabled.
 */
export async function analyzeCallTurn(
  allUserTexts: string[],
  turnCount: number,
): Promise<DistressTier | null> {
  try {
    if (allUserTexts.length === 0) return null;

    const enabled = await isWellbeingEnabled();
    if (!enabled) return null;

    const fullText = allUserTexts.join('\n');
    // Don't check on the first turn — too little signal
    if (fullText.trim().split(/\s+/).length < 10) return 1;

    const avgLength = allUserTexts.reduce((s, t) => s + t.trim().split(/\s+/).length, 0)
      / allUserTexts.length;
    const driftingShort = turnCount >= 3 && avgLength < 6; // very short replies = withdrawal proxy

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system: `You are assessing emotional distress during a voice journaling call. The text below is everything the person has said so far in the call, in order. Classify the overall distress tier:
• Tier 1: Normal range — frustration, sadness, venting, stress. DEFAULT.
• Tier 2: Sustained low state — hopelessness, withdrawal, loss of meaning, self-efficacy collapse.
• Tier 3: Acute crisis — suicidal/self-harm language, wanting to disappear, immediate danger.
Be conservative. When in doubt, choose Tier 1.
${driftingShort ? 'NOTE: The person\'s responses have become unusually brief — possible withdrawal signal.' : ''}
Return ONLY: {"tier":1} or {"tier":2} or {"tier":3}`,
      messages: [{
        role: 'user',
        content: `Call transcript so far:\n"""\n${fullText.slice(0, 2000)}\n"""`,
      }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return 1;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const tier = ([1, 2, 3] as const).includes(parsed.tier) ? parsed.tier as DistressTier : 1;

    appendLog({
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      tier,
      score: 0, // call turns don't return a score
      source: 'call',
    });

    return tier;
  } catch {
    return null;
  }
}

/**
 * Lightweight single-turn crisis scan. Runs on every user turn independently
 * of analyzeCallTurn — no lock, no accumulation. Only fires on unambiguous
 * crisis language so false-positive rate stays near zero.
 *
 * @param latestText  The most recent user utterance only (not accumulated).
 * @returns           true if explicit crisis signals are present, false otherwise.
 */
export async function checkForCrisis(latestText: string): Promise<boolean> {
  try {
    if (latestText.trim().split(/\s+/).length < 3) return false;

    const enabled = await isWellbeingEnabled();
    if (!enabled) return false;

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 5,
      system: `Does this message contain explicit crisis signals — suicidal ideation, self-harm language, wanting to not be alive, or wanting to permanently disappear? Be conservative: only answer YES for clear, unambiguous signals. Venting, frustration, or general sadness is not a crisis signal. Answer YES or NO only.`,
      messages: [{ role: 'user', content: latestText.slice(0, 500) }],
    });

    const raw = response.content[0]?.type === 'text'
      ? response.content[0].text.trim().toUpperCase()
      : '';
    return raw.startsWith('YES');
  } catch {
    return false;
  }
}

/**
 * Analyze a transcript entry for emotional distress.
 *
 * @param entry  The transcript entry to analyze.
 * @param date   YYYY-MM-DD date of the entry.
 * @returns      WellbeingAnalysis, or null if check-ins are disabled / no API key.
 */
export async function analyzeEntry(
  entry: TranscriptEntry,
  date: string,
): Promise<WellbeingAnalysis | null> {
  try {
    // ── Guard: disabled, no text, or too short to classify ──────────────────
    if (!entry.text.trim()) return null;
    if (entry.text.trim().split(/\s+/).length < 10) return null;

    const enabled = await isWellbeingEnabled();
    if (!enabled) return null;

    // ── Build longitudinal context ───────────────────────────────────────────

    const [recentEvents, summaryDates] = await Promise.all([
      getRecentDistressEvents(14),
      StorageService.getSummaryDates(),
    ]);

    // Last 7 days of daily summaries (brief excerpts for context)
    const last7 = summaryDates.slice(0, 7);
    const recentSummaries = await Promise.all(
      last7.map(d => StorageService.getSummaryForDate(d)),
    );
    const summaryContext = recentSummaries
      .filter(Boolean)
      .map(s => `${s!.date}: ${s!.summary?.slice(0, 180) ?? ''}`)
      .join('\n');

    const hasLongitudinalConcern =
      (recentEvents.length >= 3 &&
        recentEvents.reduce((sum, e) => sum + e.score, 0) / recentEvents.length >= 38) ||
      recentEvents.filter(e => e.tier >= 2).length >= 2;

    // ── Claude classification ────────────────────────────────────────────────

    const systemPrompt = `You are a compassionate mental health-aware AI assessing emotional wellbeing in personal journal entries. Your role is to classify — not to treat or respond.

Distress tiers:
• Tier 1 (score 0–39): Normal emotional range. Includes frustration, sadness, stress, overwhelm, venting, difficult days. This is the DEFAULT. Most journaling belongs here.
• Tier 2 (score 40–69): Sustained low state — persistent hopelessness, withdrawal from previously enjoyed things, loss of meaning or pleasure, self-efficacy collapse, feeling like a burden (without explicit crisis language).
• Tier 3 (score 70–100): Acute crisis — explicit suicidal ideation, self-harm language, expressions of wanting to permanently disappear, immediate danger signals. Even indirect language ("I've thought about not being here") warrants Tier 3.

Critical rules:
- Be conservative. When in doubt, score lower. A venting entry about a terrible day is Tier 1.
- Consider indirect/oblique expression as potentially more significant than direct venting.
- The longitudinal context matters: a moderately dark entry against a concerning recent backdrop may warrant a higher tier.
- Never classify frustration, anger, or ordinary sadness above Tier 1 unless combined with hopelessness or crisis signals.

Return ONLY valid JSON — no explanation, no markdown:
{"score": number, "tier": 1|2|3}`;

    const userContent = [
      hasLongitudinalConcern
        ? `Longitudinal context: Recent entries show an elevated distress pattern — this may warrant a slightly higher tier.\n\n`
        : '',
      summaryContext
        ? `Recent journal context (last 7 days):\n${summaryContext}\n\n`
        : '',
      `Current entry to assess:\n"""\n${entry.text.slice(0, 3000)}\n"""`,
    ].join('');

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw =
      response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const score = typeof parsed.score === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 0;
    let tier: DistressTier = ([1, 2, 3] as const).includes(parsed.tier as DistressTier)
      ? (parsed.tier as DistressTier)
      : 1;

    // ── Tier 3: Sonnet confirmation (prevent false positives on crisis modal) ─
    let tier3Confirmed: boolean | undefined;
    if (tier === 3) {
      try {
        const confirmResponse = await claudeProxy.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 40,
          system: `A previous model classified this journal entry as Tier 3 (acute crisis — suicidal/self-harm language or expressions of wanting to permanently disappear). Review it and confirm or downgrade.

• Return {"tier":3} if you also see clear crisis signals. Indirect language like "I've thought about not being here" counts.
• Return {"tier":2} if the entry is genuinely concerning but not an acute crisis.
• Return {"tier":1} if the classification seems incorrect.

Return ONLY valid JSON: {"tier":1|2|3}`,
          messages: [{
            role: 'user',
            content: `Entry to review:\n"""\n${entry.text.slice(0, 3000)}\n"""`,
          }],
        });
        const cRaw = confirmResponse.content[0]?.type === 'text'
          ? confirmResponse.content[0].text.trim() : '';
        const cStart = cRaw.indexOf('{');
        const cEnd   = cRaw.lastIndexOf('}');
        if (cStart !== -1 && cEnd !== -1) {
          const cParsed = JSON.parse(cRaw.slice(cStart, cEnd + 1));
          const confirmedTier = ([1, 2, 3] as const).includes(cParsed.tier)
            ? cParsed.tier as DistressTier : tier;
          tier3Confirmed = confirmedTier === 3;
          if (confirmedTier !== 3) {
            // Sonnet downgraded — trust it
            tier = confirmedTier;
          }
        }
      } catch { /* confirmation is best-effort — keep original tier */ }
    }

    // ── Per-user calibration ─────────────────────────────────────────────────
    // If the user has dismissed ≥2 Tier 2 alerts as false positives in the last
    // 14 days, raise their effective threshold from 40 → 55. This means their
    // scores need to be more clearly distressed before we interrupt them.
    const [fpCount, lastFpTs] = await Promise.all([
      getRecentFalsePositiveCount(14),
      getLastFalsePositiveTimestamp(),
    ]);
    const userTier2Threshold = fpCount >= 2 ? 55 : 40;
    if (tier === 2 && score < userTier2Threshold) {
      tier = 1;
    }

    // Never fire Tier 3 within 24 h of the user marking a false positive.
    // A Tier 3 appearing the morning after someone said "I was just venting"
    // destroys trust and desensitises them to real future alerts.
    if (tier === 3 && lastFpTs !== null && (Date.now() - lastFpTs) < 86_400_000) {
      tier = 2;
    }

    const analysis: WellbeingAnalysis = { tier, score };

    // ── Persist event for longitudinal tracking ──────────────────────────────
    await saveDistressEvent({
      date,
      timestamp: Date.now(),
      tier,
      score,
      transcriptId: entry.id,
    });

    // ── Log for observability ────────────────────────────────────────────────
    appendLog({
      timestamp: Date.now(),
      date,
      tier,
      score,
      source: 'entry',
      transcriptId: entry.id,
      ...(tier3Confirmed !== undefined ? { tier3Confirmed } : {}),
    });

    // ── Queue re-entry check-in for Tier 2+ ─────────────────────────────────
    if (tier >= 2) {
      await queueReentry(tier, date);
    }

    return analysis;
  } catch {
    // Fire-and-forget — never surface errors to the caller
    return null;
  }
}
