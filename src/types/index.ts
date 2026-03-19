export interface TranscriptEntry {
  id: string;
  timestamp: number;
  text: string;
  duration: number; // seconds
}

export interface PendingClip {
  id: string;
  uri: string;
  timestamp: number;
  duration: number;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  summary: string;
  transcriptCount: number;
  createdAt: number;
}

export interface AppSettings {
  openaiApiKey: string;
  anthropicApiKey: string;
  vadThreshold: number; // -60 to 0 dB, default -35
  silenceDuration: number; // ms to wait before stopping, default 2000
  summaryTime: string; // HH:MM, default "21:00"
  batchSize: number; // auto-transcribe when pending clips reach this count, 0 = manual only
}

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';
