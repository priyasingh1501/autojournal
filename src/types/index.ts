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
  insightText?: string;    // five-section plain-text insight (optional for backward compat)
  reflectionText?: string; // generated after a Call or Chat session ends
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
  ttsVoiceId?: string;          // expo-speech voice identifier for Chat mode
  elevenLabsApiKey?: string;   // ElevenLabs API key for Call mode
  elevenLabsVoiceId?: string;  // ElevenLabs voice ID for Call mode
}

export interface WeeklyData {
  moodScore: number;                              // 1–5 (1=very hard, 5=great)
  movementDays: boolean[];                        // length 7, Mon–Sun, true = had movement
  mealQuality: 'good' | 'mixed' | 'poor';
  spendLevel: 'none' | 'low' | 'medium' | 'high';
  learningCount: number;                          // distinct things learned
}

export interface WeeklyInsight {
  weekKey: string;        // e.g. "2026-W12"
  weekStart: string;      // YYYY-MM-DD Monday
  weekEnd: string;        // YYYY-MM-DD Sunday
  insightText: string;    // Claude-generated flowing prose
  weeklyData?: WeeklyData; // structured signals for infographics
  daysActive: number;     // days with at least one entry
  totalEntries: number;   // sum of all entries across the week
  daysSummarised: number; // days with a DailySummary
  generatedAt: number;    // Unix ms
}

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';

// ── Insight Analysis types ────────────────────────────────────────────────────

export interface EmotionEntry {
  name: string;                          // e.g. "anxiety", "joy"
  intensity: 'low' | 'medium' | 'high';
  occurrences: number;                   // count of days it surfaced
  dates: string[];                       // YYYY-MM-DD list
  color?: string;                        // assigned by service, not Claude
}

export interface EmotionAnalysis {
  generatedAt: number;
  windowDays: number;
  emotions: EmotionEntry[];              // sorted by occurrences descending
  narrative: string;
}

export interface ThemeEntry {
  theme: string;                         // short label e.g. "Work pressure"
  frequency: number;                     // count of days it appeared
  trend: 'rising' | 'stable' | 'falling';
  dates: string[];
  excerpt: string;                       // representative quote/paraphrase
}

export interface ThoughtPatternAnalysis {
  generatedAt: number;
  windowDays: number;
  themes: ThemeEntry[];                  // sorted by frequency descending
  narrative: string;
}

export interface BigFiveScores {
  openness: number;           // 0–100
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface PersonalityAnalysis {
  generatedAt: number;
  windowDays: number;
  scores: BigFiveScores;
  narrative: string;
  traitNarratives: Record<string, string>;  // one sentence per trait
}

export interface GrowthTip {
  id: string;
  title: string;
  body: string;
  category: 'emotion' | 'habits' | 'relationships' | 'mindset' | 'productivity';
}

export interface GrowthTipsAnalysis {
  generatedAt: number;
  windowDays: number;
  tips: GrowthTip[];          // exactly 5
  narrative: string;
}

// ── Minds types ───────────────────────────────────────────────────────────────

export interface Mind {
  id: string;
  name: string;
  era: string;               // e.g. "Roman Emperor · 161–180 AD"
  philosophy: string;        // one-line description
  accent: string;            // rgba colour for UI accent
  symbol: string;            // single emoji/symbol for avatar
}

export interface MindHighlight {
  passage: string;           // exact quote from the journal entry
  comment: string;           // the mind's perspective (2-3 sentences)
  date: string;              // YYYY-MM-DD of the source entry
}

export interface MindPerspective {
  mindId: string;
  framing: string;           // 1-2 sentence intro in the mind's voice
  highlights: MindHighlight[];
  generatedAt: number;
  entryWindowDays: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
