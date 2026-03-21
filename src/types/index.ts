export interface TranscriptEntry {
  id: string;
  timestamp: number;
  text: string;
  duration: number; // seconds; 0 for manual entries
  kind?: 'voice' | 'manual'; // undefined treated as 'voice' for backward-compat
  photoUri?: string; // local file path, manual entries only
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
  insightText?: string; // five-section plain-text insight (optional for backward compat)
  transcriptCount: number;
  createdAt: number;
  imageUri?: string; // local file path of generated jellyfish card image
}

export interface AppSettings {
  openaiApiKey: string;
  anthropicApiKey: string;
  vadThreshold: number; // -60 to 0 dB, default -35
  silenceDuration: number; // ms to wait before stopping, default 2000
  summaryTime: string; // HH:MM, default "21:00"
  batchSize: number; // auto-transcribe when pending clips reach this count, 0 = manual only
}

export interface WeeklyInsight {
  weekKey: string;        // e.g. "2026-W12"
  weekStart: string;      // YYYY-MM-DD Monday
  weekEnd: string;        // YYYY-MM-DD Sunday
  insightText: string;    // Claude-generated flowing prose
  daysActive: number;     // days with at least one entry
  totalEntries: number;   // sum of all entries across the week
  daysSummarised: number; // days with a DailySummary
  generatedAt: number;    // Unix ms
}

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
