export interface TranscriptEntry {
  id: string;
  timestamp: number;
  text: string;
  duration: number; // seconds; 0 for manual entries
  kind?: 'voice' | 'manual'; // undefined treated as 'voice' for backward-compat
  photoUri?: string; // local file path, manual entries only
  emotionTags?: string[]; // 1–3 emotion labels inferred from voice transcript, e.g. ["anxious", "hopeful"]
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
  imageUri?: string;       // local file path of generated jellyfish card image
  dailyMacros?: DayMacros; // meal macro estimates extracted during summary generation

  // Adaptive day-summary fields — optional for backward compat with older cached summaries.
  // `reflection` is a 2–4 sentence, time-stamped prose paragraph mirroring the day.
  // `whatTheDayHeld` only lists categories that were actually present — no empty sections.
  // `moodArc` is null when the day didn't span enough entries across morning/afternoon/evening.
  reflection?: string;
  whatTheDayHeld?: Array<{ label: string; content: string }>;
  moodArc?: { morning: string; afternoon: string; evening: string } | null;
}

export interface AppSettings {
  summaryTime: string; // HH:MM, default "21:00"
  batchSize: number; // auto-transcribe when pending clips reach this count, 0 = manual only
  ttsVoiceId?: string;          // expo-speech voice identifier for Chat mode
  elevenLabsVoiceId?: string;  // ElevenLabs voice ID for Call mode
  // Retained so the IntentionsService starter-pack migration can still map
  // prior tracker selections onto intentions; no longer editable in Settings.
  enabledTrackers?: ('meals' | 'workout' | 'meditation' | 'spending')[];
  notificationsEnabled?: boolean;  // smart daily notification (default: false until opted in)
  notificationTime?: string;       // HH:MM local time for the daily notification, default "19:30"
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
  symbol: string;            // single emoji/symbol for avatar (fallback)
  teaser: string;            // static characteristic opener shown in the picker
  image: number;             // require()'d local asset
}

// ── V2 mind roster ──────────────────────────────────────────────────────────
// The V2 shape keeps every field the legacy UI uses, plus the new explicit
// opening lines + system prompt the rewritten roster owns directly (rather
// than looking up in ConversationService.MIND_PROMPTS). `tradition` is a
// one-word tag used by the picker. `image` is optional — Companion has no
// avatar asset and renders a fallback icon.
export interface MindV2 extends Omit<Mind, 'image'> {
  image?: number;
  tradition: string;
  openingLines: readonly string[];
  openingLinesWithContext: readonly string[];
  /** Only set on Companion — used when wellbeingState === 'hard_stretch'. */
  openingLinesDistress?: readonly string[];
  systemPrompt: string;
  /**
   * Short phone-pickup greeting prepended to the opening line in CALL mode
   * only (not chat). Kept per-mind so each voice stays intact — e.g. Jung's
   * "Hello." vs Rumi's "Greetings, friend."
   */
  callGreeting: string;
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

// Stance describes how a short meets the reader.
//  - comforting : "you are not alone in this ache"
//  - clarifying : "here is language for what you are feeling"
//  - disruptive : "who is the one who is lonely?"
// Existing shorts without a stance default to "clarifying" on read.
export type Stance = 'comforting' | 'clarifying' | 'disruptive';

// How long the user has been in their current dominant emotional pattern.
//   fresh    — < 3 days (comfort preferred)
//   building — 3–14 days (clarifying preferred)
//   stuck    — > 14 days (disruption preferred — the Vedantic move)
export type LoopState = 'fresh' | 'building' | 'stuck';

// Where a wisdom short is being surfaced. Each placement has its own stance bias.
export type Placement =
  | 'wisdom_tab'          // "For you today" + main feed
  | 'end_of_day_summary'  // short at bottom of day summary (lean clarifying)
  | 'home_warm_line'      // home screen warm line source (lean comforting)
  | 'smart_notification'; // push nudge (disruptive if stuck, else clarifying)

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
  stance?: Stance;      // defaults to 'clarifying' on read
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
  extractedAt?: number; // Unix ms — used for freshness checks
}

// ── Patterns tab ────────────────────────────────────────────────────────────
// Observational, archive-grounded replacement for the Insights tab. Sections
// fade in as more entries accumulate — see THRESHOLDS in PatternsService.
export type AcrossTimeType =
  | 'whats_loud'
  | 'returning_question'
  | 'mind_moving'
  | 'wondering_about'
  | 'gone_quiet'
  | 'whats_pulling_you'
  | 'stated_vs_actual'
  | 'recurring_cast'
  | 'thinking_texture'
  | 'early_signal'
  | 'first_impression'
  | 'texture_early'
  | 'self_language'
  | 'repeating_story';

// Calibrates observation confidence language based on how much data exists.
export type VoiceMode = 'provisional' | 'emerging' | 'established';

export interface PatternsEvidence {
  excerpt: string;
  date: string; // YYYY-MM-DD
}

export type RecurringCastRole = 'support' | 'friction' | 'aspiration' | 'obligation';

export interface RecurringCastPerson {
  name: string;                  // "Priya", "your manager", "a close friend"
  role: RecurringCastRole;
  appearance: string;            // one sentence about how they appear
  mentions: number;              // how many entries reference them
  evidence: PatternsEvidence[];  // ≥2 verbatim quotes naming them
}

export interface PullItem {
  theme: string;                 // short phrase
  detail: string;                // one-sentence observational detail
  mentions: number;              // distinct entries where it appears
  evidence: PatternsEvidence[];  // ≥2 verbatim quotes
}

export interface AcrossTimeObservation {
  type: AcrossTimeType;
  title: string;
  body: string;
  evidence: PatternsEvidence[];
  window: string;       // "last 30 days" / "last 60 days" etc
  dismissible: boolean; // only true for "wondering_about"
  /** Structured breakdown for recurring_cast — rendered as per-person visual cards. */
  people?: RecurringCastPerson[];
  /** Structured pulls for whats_pulling_you — rendered as two columns. */
  toward?: PullItem[];
  away?: PullItem[];
}

export interface PatternsReport {
  generatedAt: number;
  archiveDays: number;
  entryCount: number;
  voiceMode?: VoiceMode;
  thisMonth: {
    reflection: string;
    whatsLoud: string[];
    intentionsProgress: Array<{ intention: string; note: string; mentions: number }> | null;
    emotionalArc: Array<{ week: number; dominantEmotion: string; note: string }> | null;
  };
  acrossTime: AcrossTimeObservation[];
}

// ── User context ────────────────────────────────────────────────────────────
// Replacement for the classification-heavy legacy UserContext sent to Claude
// in mind conversations. Observational, derived from newer systems (Patterns,
// Intentions, Day Summary reflections). NOT a personality assessment.
export type WellbeingState = 'regulated' | 'tender' | 'hard_stretch';

export interface UserContextIntention {
  id: string;
  text: string;
}

export interface UserContextPattern {
  type: string;   // AcrossTimeType — kept as string to decouple from the enum
  body: string;
}

export interface UserContextRecentMind {
  mindId: string;            // 'companion' for the null-persona Companion
  lastTalkedAt: number;
  conversationShape: string; // one-line Haiku-summarized shape
}

export interface UserContextV2 {
  recentDays: string;                 // 2–3 sentences drawn from recent Day Summary reflections
  activeIntentions: UserContextIntention[]; // up to 5
  currentPatterns: UserContextPattern[];    // top 2–3 from latest PatternsReport
  wellbeingState: WellbeingState;
  recentMinds: UserContextRecentMind[];     // distinct minds in the last 30 days
  tenureDays: number;                 // days since first TranscriptEntry
  builtAt: number;
}

// ── Day Digest ──────────────────────────────────────────────────────────────
// Lightweight, device-computed snapshot of today-so-far. Distinct from
// DailySummary: a digest is factual, a summary is reflective. The digest is
// what renders in the "today" view before the day closes at 23:59 local.
export interface DayDigestHourBucket {
  hour: number;  // 0–23
  count: number;
}

export interface DayDigest {
  date: string;                        // YYYY-MM-DD (rollover-aware — see dayRollover.ts)
  entryCount: number;
  entriesByHour: DayDigestHourBucket[]; // always 24 buckets, sparse counts
  dominantEmotions: string[];           // top 2–3 emotion tags by frequency
  intentionsMentioned: string[];        // ids of active intentions referenced in today's entries
  computedAt: number;
}

// ── Intentions ──────────────────────────────────────────────────────────────
// Replaces the fixed tracker list. Users declare goals (or the system detects
// them from entries); intentions surface contextually in Day Summary +
// Patterns rather than as a fixed carousel.
export type IntentionCadence = 'daily' | 'weekly' | 'loose' | null;
export type IntentionSource = 'manual' | 'detected' | 'starter_pack';
export type IntentionStatus = 'active' | 'paused' | 'completed' | 'released';
export type IntentionCategory =
  | 'health' | 'relationships' | 'work' | 'mind'
  | 'creative' | 'spiritual' | 'financial' | 'other';

export interface Intention {
  id: string;
  text: string;
  shortLabel: string;
  source: IntentionSource;
  createdAt: number;
  declaredInEntryId?: string;
  cadence: IntentionCadence;
  status: IntentionStatus;
  statusChangedAt: number;
  statusNote?: string;
  lastMentionedAt: number | null;
  lastMentionedEntryId?: string;
  fadingPromptSentAt?: number;
  fadingPromptResponse?: 'keep' | 'release' | 'pause' | 'snooze';
  category?: IntentionCategory;
  whyText?: string;
  mentionCount: number;
  weeklyMentionCounts: Array<{ weekKey: string; count: number }>;
  targetCadence?: number;
  nudgeEnabled: boolean;
  nudgeSnoozedUntil?: number;
  /** @deprecated Use status === 'active'. Kept for backward compat with IntentionsScreen. */
  active: boolean;
}

/** A detected-but-not-yet-accepted intention awaiting the user's yes/no. */
export interface SuggestedIntention {
  id: string;
  text: string;
  detectedAt: number;
  sourceEntryId: string;
}

// ── Week Review ─────────────────────────────────────────────────────────────
export interface WeekReviewDay {
  date: string;     // YYYY-MM-DD
  oneLiner: string; // single-sentence pulled/derived from the day's summary
}

export interface WeekReview {
  weekStart: string;   // YYYY-MM-DD (Monday)
  weekEnd: string;     // YYYY-MM-DD (Sunday)
  reflection: string;  // 4–6 sentence prose reflection across the week
  days: WeekReviewDay[];
  generatedAt: number;
  entryCount: number;
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

