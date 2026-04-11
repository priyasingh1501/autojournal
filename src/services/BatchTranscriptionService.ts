import * as FileSystem from 'expo-file-system/legacy';
import { TranscriptEntry } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';
import { extractAndSaveExpenses } from './ExpenseService';
import { generateIfNeeded } from './AutoSummaryService';
import { claudeProxy } from './AIProxy';

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
      system: `You detect emotional tone from voice journal transcripts. Choose 1–3 tags from this exact list:
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

export type BatchProgress = {
  total: number;
  completed: number;
  failed: number;
};

export async function transcribePendingClips(
  onProgress: (progress: BatchProgress) => void,
  onBatchComplete: (entry: TranscriptEntry) => void,
): Promise<void> {
  const clips = await StorageService.getPendingClips();
  if (clips.length === 0) return;

  // Sort clips by timestamp so the merged text reads chronologically
  const sorted = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  const progress: BatchProgress = { total: sorted.length, completed: 0, failed: 0 };
  onProgress({ ...progress });

  const segments: string[] = [];
  let totalDuration = 0;

  for (const clip of sorted) {
    try {
      const text = await transcribeAudio(clip.uri);
      if (text.length > 2) {
        segments.push(text);
      }
      progress.completed++;
      // Only remove and delete after a successful transcription so that
      // failed clips remain in storage and can be retried on the next call.
      await StorageService.removePendingClip(clip.id);
      try {
        await FileSystem.deleteAsync(clip.uri, { idempotent: true });
      } catch {}
    } catch (err) {
      console.error(`[BatchTranscription] clip ${clip.id} failed:`, err);
      progress.failed++;
    } finally {
      totalDuration += clip.duration;
      onProgress({ ...progress });
    }
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
    await StorageService.addTranscript(entry);
    onBatchComplete(entry);

    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    // Fire-and-forget expense extraction — never blocks transcription
    extractAndSaveExpenses(entry.text, date, entry.id).catch(() => {});
    // First-entry trigger: generate an initial summary if none exists for today yet
    generateIfNeeded(date).catch(() => {});
  }
}
