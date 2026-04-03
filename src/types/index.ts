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
  enabledTrackers?: ('meals' | 'workout' | 'meditation' | 'spending')[]; // which trackers to show in home + summaries
}

export interface EmotionCount {
  name: string;                                   // e.g. "anxiety", "gratitude"
  count: number;                                  // number of entries/days where this emotion appeared
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface SpendCategory {
  name: string;                                   // e.g. "Food & Dining"
  level: 'low' | 'medium' | 'high';
  summary: string;                                // one-line description
  amount?: number;                                // actual total in ₹ (from SMS)
  count?: number;                                 // number of transactions (from SMS)
  source?: 'sms' | 'ai';                         // data origin
}

export interface ExpenseEntry {
  id: string;
  amount: number;                                 // in local currency (₹)
  currency: string;                               // 'INR' default
  category: string;                               // e.g. 'Food & Dining'
  description: string;                            // brief note, e.g. "lunch at office"
  date: string;                                   // YYYY-MM-DD
  timestamp: number;                              // unix ms (when extracted)
  sourceTranscriptId: string;                     // deduplication key
}

export interface DayMacros {
  date: string;             // YYYY-MM-DD
  calories?: number | null; // estimated kcal
  protein?: number | null;  // grams
  carbs?: number | null;    // grams
  fat?: number | null;      // grams
  mealSummary?: string | null; // brief description of what was eaten
}

export interface MonthlyData {
  moodScore: number;                              // 1–5 (1=very hard, 5=great)
  movementDays: boolean[];                        // one bool per day of the month so far
  mealQuality: 'good' | 'mixed' | 'poor';        // overall fallback
  spendLevel: 'none' | 'low' | 'medium' | 'high'; // overall fallback
  learningCount: number;                          // distinct things learned
  spendCategories?: SpendCategory[];              // per-category spend breakdown
  mealWeeks?: ('good' | 'mixed' | 'poor')[];     // legacy — one entry per week of the month
  mealDays?: ('good' | 'mixed' | 'poor' | null)[]; // per-day meal quality vs goals; null = no data
  lastMealDate?: string;                          // YYYY-MM-DD of the most recent day meals were recorded
  lastMealSummary?: string;                       // what was eaten that day (1-2 sentences)
  mealMacrosByDay?: DayMacros[];                  // per-day macro estimates from journal entries
  meditationDays?: boolean[];                     // one bool per day of the month so far
  emotionCounts?: EmotionCount[];                 // emotions ranked by how many entries reflected them
  recurringTopics?: { word: string; count: number }[]; // word cloud data, sorted by count desc
}

export interface MonthlyInsight {
  weekKey: string;        // e.g. "2026-W12"
  weekStart: string;      // YYYY-MM-DD Monday
  weekEnd: string;        // YYYY-MM-DD Sunday
  insightText: string;    // Claude-generated flowing prose
  weeklyData?: MonthlyData; // structured signals for infographics
  daysActive: number;     // days with at least one entry
  totalEntries: number;   // sum of all entries across the week
  daysSummarised: number; // days with a DailySummary
  generatedAt: number;    // Unix ms
}

export type RecordingStatus = 'idle' | 'monitoring' | 'recording';

export interface WaistEntry {
  date: string;   // YYYY-MM-DD
  cm: number;
}

export interface UserGoals {
  // ── Spending ─────────────────────────────────────────────────
  monthlySpendBudget?: number;           // ₹/month

  // ── Training (split strength vs cardio) ─────────────────────
  strengthDaysPerWeek?: number;          // resistance/compound — target 4
  cardioDaysPerWeek?: number;            // low-intensity cardio — target 2

  // ── Nutrition ────────────────────────────────────────────────
  dailyCalorieTarget?: number;           // kcal/day e.g. 1400
  dailyProteinTarget?: number;           // grams/day e.g. 95
  dailyCarbsTarget?: number;             // grams/day — computed from recomp split
  dailyFatTarget?: number;               // grams/day — computed from recomp split

  // ── Body composition milestones ──────────────────────────────
  bodyFatTargetPct?: number;             // current phase target e.g. 42
  muscleMassTargetKg?: number;           // skeletal muscle target e.g. 17
  waistTargetCm?: number;                // waist goal in cm
  waistHistory?: WaistEntry[];           // weekly measurements

  // ── Legacy (backward compat) ─────────────────────────────────
  workoutDaysPerWeek?: number;
  healthyMealDaysPerWeek?: number;
}

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

// ── Wisdom Shorts ─────────────────────────────────────────────────────────────

export interface WisdomShort {
  id: string;
  title: string;
  short: string;
  pullquote: string;
  source_author: string;
  source_url: string;
  source_type: 'video' | 'essay' | 'book' | 'talk' | 'paper';
  themes: string[];
  emotional_states: string[];
  cognitive_patterns: string[];
  enneagram_resonance: number[];
  cognitive_style: string[];
  values: string[];
  depth: 'entry' | 'mid' | 'deep';
  imageUri?: string;    // local cached file path for the generated image
  imagePrompt?: string; // DALL-E prompt used to generate the image
}

export interface JournalSignal {
  emotional_states: string[];
  cognitive_patterns: string[];
  themes: string[];
  values_in_tension: string[];
  enneagram_hints: number[];
  depth_preference: 'entry' | 'mid' | 'deep';
}

export interface FeedSelection {
  acute: WisdomShort[];        // ~70% — matched to today's signals
  dispositional: WisdomShort[]; // ~20% — matched to persistent patterns
  stretch: WisdomShort[];      // ~10% — slightly outside comfort zone
}

export interface SavedShort {
  shortId: string;
  savedAt: number;
}

// ── Insights V2 ───────────────────────────────────────────────────────────────

// Tab 1: Who You Are
export interface BigFiveTrait {
  score: number;                               // 0–100
  direction: 'rising' | 'stable' | 'falling';
}
export interface WhoYouAreAnalysis {
  generatedAt: number;
  entryCountAtGeneration: number;
  narrative: string;                           // 3–4 sentence portrait
  bigFive: {
    openness:          BigFiveTrait;
    conscientiousness: BigFiveTrait;
    extraversion:      BigFiveTrait;
    agreeableness:     BigFiveTrait;
    neuroticism:       BigFiveTrait;
  };
  bigFiveNarratives: Record<string, string>;   // one observation per trait
  enneagram: {
    types:        number[];                    // 1–2 candidate type numbers
    typeSummaries: Record<string, string>;     // per-type short description
    coreFear:       string;
    coreDesire:     string;
    growthDirection: string;
  };
  sourceEntries: string[];                     // YYYY-MM-DD dates
}
export interface EnneagramResponse {
  typeId:   number;
  response: 'confirmed' | 'partly' | 'rejected';
  date:     string;
}

// Tab 2: What You Care About
export interface ValueNode {
  topic:     string;
  frequency: number;   // 0–100, drives bubble size
  intensity: number;   // 0–100, drives brightness / colour saturation
  valence:   'positive' | 'neutral' | 'negative' | 'mixed';
}
export interface WhatYouCareAboutAnalysis {
  generatedAt: number;
  entryCountAtGeneration: number;
  values: ValueNode[];
  divergence: Array<{
    stated:      string;
    actual:      string;
    observation: string;
  }>;
  motivationPulse:     'achievement' | 'connection' | 'meaning' | 'safety';
  motivationRationale: string;
  sourceEntries: string[];
}

// Tab 3: How You Think
export interface CognitiveDimension {
  name:         string;   // e.g. "Systems vs. Stories"
  leftLabel:    string;
  rightLabel:   string;
  score:        number;   // 0 = fully left, 100 = fully right
  observation:  string;   // one-line inference — not a label
  sourceEntries: string[];
}
export interface HowYouThinkAnalysis {
  generatedAt: number;
  entryCountAtGeneration: number;
  dimensions:  CognitiveDimension[];
}

// Tab 4: Your Story
export type ArcType = 'Seeker' | 'Builder' | 'Witness' | 'Transformer' | 'Returner';
export interface YourStoryAnalysis {
  generatedAt: number;
  entryCountAtGeneration: number;
  currentChapter: {
    title:     string;   // e.g. "The Clearing"
    dateRange: string;   // e.g. "October–December 2025"
    narrative: string;   // 2–3 sentences, written like an opening line
  };
  recurringCast: Array<{
    archetype:  string;  // e.g. "A relationship where you hold back"
    frequency:  number;
  }>;
  arcPattern: {
    type:        ArcType;
    description: string;
    history:     Array<{ type: string; dateRange: string }>;
  };
  sourceEntries: string[];
}
