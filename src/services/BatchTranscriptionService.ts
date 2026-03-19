import * as FileSystem from 'expo-file-system';
import { TranscriptEntry, PendingClip } from '../types';
import { transcribeAudio } from './TranscriptionService';
import { StorageService } from './StorageService';

export type BatchProgress = {
  total: number;
  completed: number;
  failed: number;
};

export async function transcribePendingClips(
  onProgress: (progress: BatchProgress) => void,
  onTranscript: (entry: TranscriptEntry) => void,
): Promise<void> {
  const clips = await StorageService.getPendingClips();
  if (clips.length === 0) return;

  const progress: BatchProgress = { total: clips.length, completed: 0, failed: 0 };
  onProgress({ ...progress });

  for (const clip of clips) {
    try {
      const text = await transcribeAudio(clip.uri);

      if (text.length > 2) {
        const entry: TranscriptEntry = {
          id: clip.id,
          timestamp: clip.timestamp,
          text,
          duration: clip.duration,
        };
        await StorageService.addTranscript(entry);
        onTranscript(entry);
      }

      progress.completed++;
    } catch {
      progress.failed++;
    } finally {
      // Remove from pending and delete audio file regardless of result
      await StorageService.removePendingClip(clip.id);
      try {
        await FileSystem.deleteAsync(clip.uri, { idempotent: true });
      } catch {}
      onProgress({ ...progress });
    }
  }
}
