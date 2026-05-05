import * as FileSystem from 'expo-file-system/legacy';
import { TranscriptEntry } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';
import { extractAndSaveExpenses } from './ExpenseService';
import { claudeProxy } from './AIProxy';
import { UserContextService } from './UserContextService';
import { ActionablesService } from './ActionablesService';
import { MAX_CLIP_BYTES } from './AudioRecorderService';
import { detectAndSuggestIntention, getActive, recordMention } from './IntentionsService';
import { extractPromptsForEntry } from './PerspectivePromptsService';
import { effectiveDateStr } from './dayRollover';
import { invalidateDigest } from './DigestService';
import { track } from './AnalyticsService';

const EMOTION_SET = [
  'calm', 'anxious', 'excited', 'sad', 'frustrated', 'content',
  'stressed', 'hopeful', 'grateful', 'uncertain', 'proud',
  'lonely', 'overwhelmed', 'motivated',
] as const;

const DEGREE_SET = ['slightly', 'quite', 'deeply'] as const;

/**
 * Infers 1–3 degree-qualified emotion tags from the transcript text using Haiku.
 * Tags are formatted as "[degree] [emotion]" e.g. "slightly anxious", "deeply sad".
 * Returns an empty array on failure — never throws.
 */
export async function detectEmotions(text: string): Promise<string[]> {
  try {
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount < 5) return [];

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system: `You detect emotional tone from voice journal transcripts. The text may be in English, Hindi, or Hinglish.

Return 1–3 emotion tags. Each tag must pair a degree word with an emotion word.
Degree words: slightly, quite, deeply
Emotion words: ${EMOTION_SET.join(', ')}

Choose the degree that reflects how strongly the emotion comes through — not just its presence.
Examples: "slightly anxious", "quite frustrated", "deeply sad"

Return ONLY valid JSON: {"emotions":["slightly anxious"]} or {"emotions":["quite frustrated","deeply sad"]} etc.`,
      messages: [{ role: 'user', content: `Transcript:\n"${text.slice(0, 800)}"` }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed.emotions)) return [];
    return parsed.emotions
      .filter((e: any) => {
        if (typeof e !== 'string') return false;
        const parts = e.trim().split(' ');
        return parts.length === 2 &&
          (DEGREE_SET as readonly string[]).includes(parts[0] as any) &&
          (EMOTION_SET as readonly string[]).includes(parts[1] as any);
      })
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Scan entry text against active intentions using simple keyword matching.
 * Calls recordMention() for each match. Never throws.
 */
async function detectIntentionMentions(entry: TranscriptEntry): Promise<void> {
  try {
    const actives = await getActive();
    if (actives.length === 0) return;
    const lower = entry.text.toLowerCase();
    for (const intention of actives) {
      const textHit  = lower.includes(intention.text.toLowerCase());
      const labelHit = intention.shortLabel
        ? lower.includes(intention.shortLabel.toLowerCase())
        : false;
      if (textHit || labelHit) {
        await recordMention(intention.id, entry.id, entry.timestamp);
        track('intention_mentioned', {
          intention_id: intention.id,
          day: effectiveDateStr(entry.timestamp),
        });
      }
    }
  } catch { /* mention detection must never block transcription */ }
}

export type BatchProgress = {
  total: number;
  completed: number;
  failed: number;
  // Clips removed from the queue without producing transcripts (missing file
  // or exceeded MAX_RETRIES). Surfacing this lets the caller tell the user
  // we gave up on a recording, instead of silently losing it.
  dropped: number;
};

// A clip that fails this many consecutive times with a recoverable server
// error is dropped from the pending queue. Without this cap, a clip the
// server permanently rejects (e.g. corrupt audio with a flaky 5xx) would
// re-enter the loop on every app foreground and pin the mic orb in the
// "thinking…" state forever — even across app kills, since the queue is
// persisted to AsyncStorage.
const MAX_RETRIES = 5;

type ErrorClass = 'drop-now' | 'count' | 'transient';

/**
 * Classify a transcription error so we don't burn the user's recording on
 * conditions they can recover from (offline, expired JWT, server hiccup):
 *
 *   - 'drop-now'  → audio is permanently rejected (HTTP 400/413/415/422).
 *                   Don't waste retries; remove the clip immediately.
 *   - 'count'     → server responded with 5xx / 408 / 429. Plausibly
 *                   transient, but keeps coming back — count toward
 *                   MAX_RETRIES so a hard-broken clip doesn't sit forever.
 *   - 'transient' → no server response (network, abort, timeout) or
 *                   401/403 auth issue. The user can recover (reconnect,
 *                   re-sign-in), so leave the clip alone — don't count
 *                   this attempt against it.
 */
function classifyTranscriptionError(err: any): ErrorClass {
  const msg = err?.message ?? String(err);
  // AIProxy's two failure shapes both embed the HTTP status:
  //   "[AIProxy] Storage upload failed: 401 ..."
  //   "[AIProxy/openai-whisper] HTTP 500: ..."
  const m = msg.match(/(?:HTTP |upload failed: )(\d{3})/);
  if (!m) return 'transient'; // network failure, fetch abort, timeout
  const status = parseInt(m[1], 10);
  if (status === 401 || status === 403) return 'transient'; // user can re-auth
  if (status === 408 || status === 429) return 'count';
  if (status >= 400 && status < 500) return 'drop-now';
  return 'count'; // 5xx
}

export type BatchResult = {
  /** IDs of clips that were in this batch — used by the caller to detect new clips. */
  attemptedIds: string[];
  /** Clips removed because retries were exhausted or the file was missing. */
  droppedCount: number;
  /** Whether at least one clip produced a usable transcript (forward progress). */
  hadSuccess: boolean;
};

export async function transcribePendingClips(
  onProgress: (progress: BatchProgress) => void,
  onBatchComplete: (entry: TranscriptEntry) => void,
): Promise<BatchResult> {
  const clips = await StorageService.getPendingClips();
  if (clips.length === 0) {
    return { attemptedIds: [], droppedCount: 0, hadSuccess: false };
  }

  // Sort clips by timestamp so the merged text reads chronologically
  const sorted = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  const progress: BatchProgress = {
    total: sorted.length, completed: 0, failed: 0, dropped: 0,
  };
  onProgress({ ...progress });

  const segments: string[] = [];
  let totalDuration = 0;
  const processedIds: string[] = [];
  const processedUris: string[] = [];
  // Clips we're giving up on (missing file OR too many failures). Their files
  // get deleted; their slots get cleared from AsyncStorage.
  const droppedIds: string[] = [];
  const droppedUris: string[] = [];
  // Clips that failed this attempt but haven't hit MAX_RETRIES yet — keep
  // them in the queue with an incremented failureCount.
  const retryIds: string[] = [];

  for (const clip of sorted) {
    try {
      // Guard: if the OS cleaned up the temp file (app was killed mid-record),
      // remove the stale pending entry rather than looping on it forever.
      const info = await FileSystem.getInfoAsync(clip.uri);
      if (!info.exists) {
        droppedIds.push(clip.id);
        progress.failed++;
        progress.dropped++;
        onProgress({ ...progress });
        continue;
      }

      // Guard: an oversized clip will always 413 from Whisper (25 MB hard
      // limit). Drop it locally instead of burning an upload round-trip.
      // AudioRecorderService catches this at save-time for new clips, but
      // this check covers legacy clips recorded under the old high-bitrate
      // profile that may still be sitting in the pending queue.
      if ((info.size ?? 0) > MAX_CLIP_BYTES) {
        console.warn(`[BatchTranscription] clip ${clip.id} too large (${info.size}B), dropping`);
        track('transcription_failed', {
          reason: 'oversize_local',
          size: info.size,
          error_class: 'drop-now',
        });
        droppedIds.push(clip.id);
        droppedUris.push(clip.uri);
        progress.failed++;
        progress.dropped++;
        onProgress({ ...progress });
        continue;
      }

      const text = await transcribeAudio(clip.uri);
      if (text.length > 2) {
        segments.push(text);
        totalDuration += clip.duration; // only count clips that produced usable text
      }
      progress.completed++;
      // Collect processed clip IDs/URIs for a single bulk-remove at the end.
      // Removing one-by-one inside the loop races with addPendingClip: if a new
      // recording finishes between the READ and WRITE inside removePendingClip,
      // the new clip's entry can be silently overwritten and lost.
      processedIds.push(clip.id);
      processedUris.push(clip.uri);
    } catch (err: any) {
      console.error(`[BatchTranscription] clip ${clip.id} failed:`, err);
      const cls = classifyTranscriptionError(err);
      track('transcription_failed', {
        reason: err?.message ?? String(err),
        error_class: cls,
      });
      progress.failed++;
      if (cls === 'drop-now') {
        droppedIds.push(clip.id);
        droppedUris.push(clip.uri);
        progress.dropped++;
      } else if (cls === 'count') {
        const nextCount = (clip.failureCount ?? 0) + 1;
        if (nextCount >= MAX_RETRIES) {
          droppedIds.push(clip.id);
          droppedUris.push(clip.uri);
          progress.dropped++;
        } else {
          retryIds.push(clip.id);
        }
      }
      // 'transient' → leave the clip's failureCount unchanged. The user is
      // offline / signed-out / hit a network blip; we'll try again on the
      // next foreground or recording without burning a retry.
    } finally {
      onProgress({ ...progress });
    }
  }

  // Single atomic write that removes processed/dropped clips and bumps
  // failureCount on retry clips. Any clip added by a concurrent recording
  // during the loop is preserved (the live list is read inside the call).
  const removedIds = [...processedIds, ...droppedIds];
  if (removedIds.length > 0 || retryIds.length > 0) {
    await StorageService.applyPendingClipResults({ removedIds, retriedIds: retryIds });
  }
  for (const uri of [...processedUris, ...droppedUris]) {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  }

  // Merge all segments into one single card
  if (segments.length > 0) {
    const mergedText = segments.join(' ');

    const entry: TranscriptEntry = {
      id: `batch_${Date.now()}`,
      timestamp: sorted[0].timestamp,   // time of the first clip
      text: mergedText,
      duration: totalDuration,
      kind: 'voice',
    };
    // The entry's storage bucket uses a 3am rollover (01:30 belongs to "last
    // night", not "early morning"), so pre-compute the date once and thread
    // it through both storage and downstream hooks.
    const date = effectiveDateStr(entry.timestamp);

    await StorageService.addTranscript(entry, { storageDate: date });

    // Detect emotional tone fire-and-forget — doesn't block the entry save
    // or onBatchComplete so the UI can render immediately.
    detectEmotions(mergedText).then(emotionTags => {
      if (emotionTags.length > 0) {
        StorageService.updateTranscript({ ...entry, emotionTags }, date).catch(() => {});
      }
    }).catch(() => {});
    // Invalidate shared caches so the next AI session and actionables reflect new entries
    UserContextService.invalidate();
    ActionablesService.invalidate();
    // Stale digest for this date — next read recomputes.
    invalidateDigest(date).catch(() => {});
    onBatchComplete(entry);

    // Fire-and-forget expense extraction — never blocks transcription
    extractAndSaveExpenses(entry.text, date, entry.id).catch(() => {});
    // Fire-and-forget intention detection — weekly-throttled inside the
    // service so it can't spam prompts.
    detectAndSuggestIntention(entry).catch(() => {});
    // Keyword-match active intentions and record any mentions found.
    detectIntentionMentions(entry).catch(() => {});
    // Fire-and-forget perspective-prompt extraction — writes back onto
    // the entry so the Home carousel and summary card can aggregate them.
    extractPromptsForEntry(entry).catch(() => {});
    // Summary generation is deferred to the 23:59 close-out — no per-entry
    // generation during the day.
  }

  return {
    attemptedIds: sorted.map(c => c.id),
    droppedCount: progress.dropped,
    hadSuccess: segments.length > 0,
  };
}
