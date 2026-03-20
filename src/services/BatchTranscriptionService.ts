import * as FileSystem from 'expo-file-system';
import { TranscriptEntry } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';

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
    } catch {
      progress.failed++;
    } finally {
      totalDuration += clip.duration;
      await StorageService.removePendingClip(clip.id);
      try {
        await FileSystem.deleteAsync(clip.uri, { idempotent: true });
      } catch {}
      onProgress({ ...progress });
    }
  }

  // Merge all segments into one single card
  if (segments.length > 0) {
    const entry: TranscriptEntry = {
      id: `batch_${Date.now()}`,
      timestamp: sorted[0].timestamp,   // time of the first clip
      text: segments.join(' '),
      duration: totalDuration,
      kind: 'voice',
    };
    await StorageService.addTranscript(entry);
    onBatchComplete(entry);
  }
}
