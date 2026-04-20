import * as FileSystem from 'expo-file-system/legacy';
import { TranscriptEntry } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';
import { extractAndSaveExpenses } from './ExpenseService';
import { generateIfNeeded } from './AutoSummaryService';
import { claudeProxy } from './AIProxy';
import { UserContextService } from './UserContextService';
import { ActionablesService } from './ActionablesService';
import { detectAndSuggestIntention, getActive, recordMention } from './IntentionsService';
import { FeatureFlagsService } from './FeatureFlagsService';
import { effectiveDateStr } from './dayRollover';
import { invalidateDigest } from './DigestService';

const EMOTION_SET = [
  'calm', 'anxious', 'excited', 'sad', 'frustrated', 'content',
  'stressed', 'hopeful', 'grateful', 'uncertain', 'proud',
  'lonely', 'overwhelmed', 'motivated',
] as const;

/**
 * Infers 1–3 emotional tone tags from the transcript text using Haiku.
 * Returns an empty array on failure — never throws.
 */
async function detectEmotions(text: string): Promise<string[]> {
  try {
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount < 5) return []; // too short to classify reliably

    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 40,
      system: `You detect emotional tone from voice journal transcripts. The text may be in English, Hindi, or a mix of both (Hinglish). Choose 1–3 tags from this exact list:
${EMOTION_SET.join(', ')}
Return ONLY valid JSON: {"emotions":["tag1"]} or {"emotions":["tag1","tag2"]} etc.`,
      messages: [{ role: 'user', content: `Transcript:\n"${text.slice(0, 800)}"` }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed.emotions)) return [];
    return parsed.emotions
      .filter((e: any) => typeof e === 'string' && (EMOTION_SET as readonly string[]).includes(e))
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
      }
    }
  } catch { /* mention detection must never block transcription */ }
}

export type BatchProgress = {
  total: number;
  completed: number;
  failed: number;
};

export type SummaryBannerStatus = 'generating' | 'ready';

export async function transcribePendingClips(
  onProgress: (progress: BatchProgress) => void,
  onBatchComplete: (entry: TranscriptEntry) => void,
  onSummaryStatus?: (status: SummaryBannerStatus) => void,
): Promise<void> {
  const clips = await StorageService.getPendingClips();
  if (clips.length === 0) return;

  // Sort clips by timestamp so the merged text reads chronologically
  const sorted = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  const progress: BatchProgress = { total: sorted.length, completed: 0, failed: 0 };
  onProgress({ ...progress });

  const segments: string[] = [];
  let totalDuration = 0;
  const processedIds: string[] = [];
  const processedUris: string[] = [];
  const missingIds: string[] = [];

  for (const clip of sorted) {
    try {
      // Guard: if the OS cleaned up the temp file (app was killed mid-record),
      // remove the stale pending entry rather than looping on it forever.
      const info = await FileSystem.getInfoAsync(clip.uri);
      if (!info.exists) {
        missingIds.push(clip.id);
        progress.failed++;
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
    } catch (err) {
      console.error(`[BatchTranscription] clip ${clip.id} failed:`, err);
      progress.failed++;
    } finally {
      onProgress({ ...progress });
    }
  }

  // Single atomic remove of all successfully processed (and missing) clips.
  // This ensures any clip added by a concurrent recording during the loop
  // is visible in the pending-clips list after this write, so the retry
  // in handleTranscribeNow's finally block can pick it up.
  const idsToRemove = [...processedIds, ...missingIds];
  if (idsToRemove.length > 0) {
    await StorageService.removeManyPendingClips(idsToRemove);
  }
  for (const uri of processedUris) {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  }

  // Merge all segments into one single card
  if (segments.length > 0) {
    const mergedText = segments.join(' ');

    // Detect emotional tone from the merged transcript (fire-and-forget fallback)
    const emotionTags = await detectEmotions(mergedText);

    const entry: TranscriptEntry = {
      id: `batch_${Date.now()}`,
      timestamp: sorted[0].timestamp,   // time of the first clip
      text: mergedText,
      duration: totalDuration,
      kind: 'voice',
      ...(emotionTags.length > 0 ? { emotionTags } : {}),
    };
    // Under ff_day_close_model the entry's storage bucket uses a 3am rollover
    // (01:30 belongs to "last night", not "early morning"), so pre-compute
    // the date once and thread it through both storage and downstream hooks.
    const dayCloseOn = await FeatureFlagsService.getFlag('ff_day_close_model').catch(() => false);
    const d = new Date(entry.timestamp);
    const calendarDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const date = dayCloseOn ? effectiveDateStr(entry.timestamp) : calendarDate;

    await StorageService.addTranscript(entry, { storageDate: date });
    // Invalidate shared caches so the next AI session and actionables reflect new entries
    UserContextService.invalidate();
    ActionablesService.invalidate();
    // Stale digest for this date — next read recomputes.
    if (dayCloseOn) invalidateDigest(date).catch(() => {});
    onBatchComplete(entry);

    // Fire-and-forget expense extraction — never blocks transcription
    extractAndSaveExpenses(entry.text, date, entry.id).catch(() => {});
    // Fire-and-forget intention detection — no-op when ff_intentions is off,
    // weekly-throttled inside the service so it can't spam prompts.
    detectAndSuggestIntention(entry).catch(() => {});
    // Keyword-match active intentions and record any mentions found.
    detectIntentionMentions(entry).catch(() => {});
    // First-entry trigger: generate an initial summary if none exists for today yet.
    // Only show the banner if generation actually runs (generateIfNeeded returns true).
    // Under ff_day_close_model, summary generation is deferred to the 23:59
    // close-out — no per-entry generation during the day.
    if (!dayCloseOn) {
      generateIfNeeded(date)
        .then(generated => {
          if (generated) {
            onSummaryStatus?.('generating');
            onSummaryStatus?.('ready');
          }
        })
        .catch(() => {});
    }
  }
}
