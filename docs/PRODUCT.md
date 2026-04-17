# Untangle — Product Documentation

> **Single source of truth.** This document covers every aspect of Untangle as it exists today. Update it whenever the product changes.

**Last updated:** 2026-04-16
**Version:** 1.3.0
**Platforms:** iOS, Android, Android Home Screen Widgets

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Personas](#2-user-personas)
3. [Jobs To Be Done & Pain Points](#3-jobs-to-be-done--pain-points)
4. [Use Cases](#4-use-cases)
5. [Business Requirements](#5-business-requirements)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Feature Specifications](#8-feature-specifications)
9. [Technical Architecture](#9-technical-architecture)
10. [Analytics & Instrumentation](#10-analytics--instrumentation)
11. [Release & Rollout Plan](#11-release--rollout-plan)
12. [Open Questions & Decision Log](#12-open-questions--decision-log)

---

## 1. Product Overview

### What is Untangle?

**Untangle** is a voice-first AI journaling app that transforms spoken thoughts into structured self-understanding. Users talk or type their thoughts throughout the day; the app transcribes, summarizes, and — over time — builds a psychological portrait of who they are, what they value, how they think, and the story they're living.

### Tagline

*Your inner ocean.*

### Core Value Proposition

1. **Zero-friction capture** — Tap a mic and talk. No blank page anxiety.
2. **AI-powered daily summaries** — Every day's entries become a structured digest with mood analysis, macro estimates, and unique artwork.
3. **Deep self-insights** — Four personality/values/thinking/story analyses that evolve as the user journals more.
4. **Wisdom feed** — 3,000+ curated psychology/philosophy/neuroscience shorts ranked to match the user's current emotional state.
5. **AI conversations** — Voice calls and text chats with 12 distinct philosophical minds (Companion, Buddha, Rumi, Carl Jung, Charlie Munger, etc.).
6. **Safety net** — Three-tier distress detection with crisis resources.

### Privacy Model

**Local-first.** All journal entries, summaries, and insights are stored on-device in AsyncStorage. No journal content is persisted server-side. Supabase is used only for authentication, the wisdom library, and as an API proxy for AI services. AI calls transit through Supabase Edge Functions so API keys never touch the client.

### Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81.5 / Expo SDK 54 |
| Language | TypeScript 5.9 (strict mode) |
| Local Storage | AsyncStorage (encrypted at rest) |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions) |
| AI — Text | Anthropic Claude (Opus 4.5, Sonnet 4.6, Haiku 4.5) |
| AI — Speech | OpenAI Whisper (transcription) |
| AI — Images | OpenAI DALL-E 3 |
| AI — Voice | ElevenLabs TTS (Flash v2.5) |
| Billing | RevenueCat (iOS App Store + Google Play) |
| Analytics | PostHog |
| Build/Deploy | Expo EAS (preview APK, production AAB) |

---

## 2. User Personas

### Persona A — "The Reflective Journaler"

| Attribute | Detail |
|-----------|--------|
| Age | 25–40 |
| Context | Professionally active, introspective, may have tried traditional journaling and abandoned it |
| Goal | Understand recurring patterns in their thinking, emotions, and decisions |
| Frustration | Blank-page anxiety; typing feels slow and performative; existing apps are just text editors |
| Tech comfort | High — uses iPhone/Android daily, comfortable with AI tools |
| Key features | Voice recording, daily summaries, 4-tab insights, AI conversations |
| Success metric | "I learned something about myself I didn't consciously know" |

### Persona B — "The Wellness Tracker"

| Attribute | Detail |
|-----------|--------|
| Age | 22–35 |
| Context | Health-conscious, tracks meals, workouts, spending; wants a single place for all of it |
| Goal | See patterns in nutrition, exercise, meditation, and spending without manual data entry |
| Frustration | Too many tracking apps; manual logging is tedious; no app connects wellness data to emotional state |
| Tech comfort | Medium-high |
| Key features | Auto macro extraction, spending tracker, workout/meditation tracking, monthly insight card |
| Success metric | "I can see how my eating affects my mood without logging a single number" |

### Persona C — "The Seeker"

| Attribute | Detail |
|-----------|--------|
| Age | 28–50 |
| Context | Interested in philosophy, spirituality, psychology; reads widely; values contemplation |
| Goal | Engage with wisdom traditions in a way that's personal, not generic |
| Frustration | Self-help content feels shallow; no feedback loop between what they read and how they live |
| Tech comfort | Medium |
| Key features | Wisdom shorts feed, mood-based ranking, AI mind conversations (Krishna, Rumi, Buddha, Jung) |
| Success metric | "The app surfaced exactly the right quote on a day I needed it" |

---

## 3. Jobs To Be Done & Pain Points

### Jobs To Be Done

| # | Job Statement | Persona |
|---|--------------|---------|
| J1 | When I have a thought or feeling I want to capture, I want to record it instantly so I don't lose it to the busyness of my day. | A, B |
| J2 | When my day ends, I want to see a structured summary of everything I said so I can reflect without re-reading raw notes. | A, B |
| J3 | When I've been journaling for weeks, I want to discover patterns in my personality, values, and thinking that I can't see on my own. | A, C |
| J4 | When I'm in a particular emotional state, I want wisdom that matches my mood so I feel understood, not lectured. | C |
| J5 | When I'm stuck on a decision or feeling, I want to talk it through with an intelligent perspective that challenges me. | A, C |
| J6 | When I'm going through a hard time, I want the app to notice and offer support without being intrusive. | A |
| J7 | When I eat, exercise, meditate, or spend money, I want it captured from my voice notes automatically so I don't have to log it separately. | B |
| J8 | When I want to review past entries, I want to search and filter them easily so I can find specific moments. | A, B |

### Pain Points with Alternatives

| Pain Point | Current Alternatives | How Untangle Solves It |
|-----------|---------------------|----------------------|
| Blank-page anxiety | Day One, Notion, pen journals | Voice-first — just talk |
| No synthesis | All traditional journals | AI summaries + 4-tab insights |
| Generic wisdom | Headspace, Calm quotes | Mood-matched, journal-signal-ranked wisdom feed |
| Tracking fragmentation | MyFitnessPal + Mint + Headspace | Auto-extraction from voice (macros, spending, workouts) |
| No conversational depth | ChatGPT (generic) | 12 distinct philosophical minds with user context injection |
| No safety net | No journaling app has this | Three-tier distress detection with escalation |

---

## 4. Use Cases

### UC-01: Quick Voice Capture

**Actor:** Any user
**Trigger:** User has a thought they want to capture
**Flow:**
1. Tap mic button on HomeScreen (or Android widget)
2. Speak naturally — VAD detects start/end of speech
3. Recording stops after configurable silence (default 2.0s)
4. Clip queued → transcribed via Whisper → saved as entry
5. If enough entries, auto-summary triggers after 5 min debounce
**Outcome:** Thought captured in <10 seconds with no typing

### UC-02: Manual Photo + Text Note

**Actor:** Any user
**Trigger:** User wants to add a text note or receipt photo
**Flow:**
1. Tap "+" button → ComposeModal opens
2. Type text and/or attach photo from camera/library
3. Optionally change date (last 30 days)
4. Tap Save → entry stored → expense extraction runs if spending tracker enabled
**Outcome:** Entry saved with optional photo and expense data

### UC-03: Daily Summary Review

**Actor:** Reflective Journaler, Wellness Tracker
**Trigger:** End of day or next morning
**Flow:**
1. Navigate to Summary tab → carousel shows today's summary
2. Summary includes: categorized text, mood analysis, macro estimates, jellyfish artwork
3. If new entries exist since last generation, "Stale" banner shows → tap Regenerate
4. Free users limited to 3/week → PaywallModal if exceeded
**Outcome:** Structured daily digest with visual artwork

### UC-04: Personality Insight Discovery

**Actor:** Reflective Journaler
**Trigger:** User has accumulated 20+ entries over 30+ days
**Flow:**
1. Navigate to Insights tab → select "Who I Am" tab
2. If enough data: tap "Generate now" (first generation free)
3. Claude analyzes 60 days of entries → returns Big Five, Enneagram, motivation drivers
4. Results displayed with scores, narratives, and evidence
5. Subsequent regenerations require Pro subscription
**Outcome:** Psychological portrait the user didn't know about themselves

### UC-05: Mood-Matched Wisdom Browsing

**Actor:** Seeker
**Trigger:** User opens Wisdom tab feeling a specific way
**Flow:**
1. Navigate to Wisdom tab → horizontal carousel of shorts
2. Optionally tap mood picker → select current emotional state
3. Feed re-ranks instantly (70% acute matches, 20% dispositional, 10% stretch)
4. Swipe through cards with generated artwork, save favorites, reflect
**Outcome:** Personally relevant wisdom that matches the user's current state

### UC-06: AI Voice Conversation

**Actor:** Reflective Journaler, Seeker
**Trigger:** User wants to talk through a decision or feeling
**Flow:**
1. Tap "Call" on HomeScreen → mind picker carousel
2. Select a mind (Companion, Buddha, Jung, etc.)
3. Opening message plays via TTS
4. User speaks → transcribed → Claude responds in mind's voice → TTS plays
5. Distress detection runs on each turn (Tier 2/3 may trigger modal)
6. End call → reflection summary generated and saved
**Outcome:** Meaningful conversation with a philosophical perspective, saved as journal entry

### UC-07: Distress Detection & Support

**Actor:** Any user
**Trigger:** Sustained low mood or acute crisis language detected
**Flow:**
1. Entry or call turn analyzed by WellbeingService
2. **Tier 2** (sustained low): On next app open, warm check-in modal with options to continue or talk
3. **Tier 3** (acute crisis): Immediate pause modal with crisis resources (Vandrevala Foundation, iCall, AASRA, Snehi)
4. User can dismiss and continue journaling at any time
5. Re-entry check-in on next session if prior Tier 2/3
**Outcome:** Safety net without being intrusive; crisis resources always accessible

### UC-08: Expense Tracking from Voice

**Actor:** Wellness Tracker
**Trigger:** User mentions spending in a voice note ("spent 500 on groceries")
**Flow:**
1. After transcription, ExpenseService scans for spending keywords
2. If detected: Claude extracts amount, category, description
3. If photo attached: Claude Vision reads receipt
4. Expenses saved and surfaced in monthly insight card
**Outcome:** Spending tracked from natural speech without manual entry

### UC-09: Subscription Upgrade

**Actor:** Any user hitting a gate
**Trigger:** Free user attempts 4th summary/week, 2nd insight generation, or 2nd conversation
**Flow:**
1. PaywallModal appears with context ("You've used 3 of 3 free summaries this week")
2. Two plans shown: Monthly ($8.99) and Annual ($59.99)
3. User taps Subscribe → RevenueCat handles IAP flow
4. On success: gates removed, modal dismissed
**Outcome:** Seamless upgrade from free to Pro

### UC-10: Android Widget Quick Capture

**Actor:** Any Android user
**Trigger:** User sees widget on home screen
**Flow:**
1. **Mic Widget**: Tap mic icon → deep links to HomeScreen, starts recording
2. **Mic Widget**: Tap "Type a note" → deep links to ComposeModal
3. **Wisdom Widget**: Shows daily rotating short → tap opens Wisdom tab
**Outcome:** Zero-app-open journaling and daily wisdom glance

---

## 5. Business Requirements

### BR-01: Subscription Model

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0 | 3 AI summaries/week, 1 insight per tab (first generation free), 1 AI conversation session |
| **Trial** | $0 (14 days) | Full Pro access from install date |
| **Pro Monthly** | $8.99/month | Unlimited summaries, insights, conversations |
| **Pro Annual** | $59.99/year | Same as monthly |

### BR-02: Revenue Infrastructure

- **Billing provider:** RevenueCat
- **iOS product IDs:** `untangle_pro_monthly`, `untangle_pro_annual`
- **Android product IDs:** Same
- **Entitlement ID:** `pro`
- **RevenueCat API keys:**
  - iOS: `test_xxxxxxxxxxxxxx` (test key — replace before production)
  - Android: `sk_OXaoQGNbDRvWqbUVPRdtPQAwAzPAD`

### BR-03: Gate Logic

| Feature | Free Limit | Gate Behavior |
|---------|-----------|---------------|
| Summary generation | 3 per week (Sunday reset) | PaywallModal on 4th attempt |
| Insight generation | 1 per tab (lifetime soft gate) | First generation always free; PaywallModal on regeneration |
| AI conversation | 1 session (lifetime soft gate) | First session always free; PaywallModal on 2nd |

### BR-04: Analytics Requirements

- Track all user actions via PostHog (see Section 10)
- Identify users by Supabase user ID
- Key conversion funnel: Recording → Summary → Insight → Subscription

### BR-05: Privacy & Data

- All journal data stored locally on-device only
- No journal content transmitted to Untangle servers
- AI calls transit through Supabase Edge Functions (keys server-side)
- Supabase stores: user accounts, wisdom library, wisdom images
- User can clear all data from Settings

---

## 6. Functional Requirements

### Recording & Entry

| ID | Requirement |
|----|------------|
| FR-001 | The app shall record audio using the device microphone with HIGH_QUALITY preset (Opus codec, 48 kHz) |
| FR-002 | Voice Activity Detection (VAD) shall automatically stop recording after configurable silence duration (1.0s, 1.5s, 2.0s, or 3.0s; default 2.0s) |
| FR-003 | VAD sensitivity shall be configurable across 4 thresholds (-55, -45, -35, -25 dB) |
| FR-004 | Recordings shorter than 0.5 seconds shall be discarded |
| FR-005 | Each clip shall be assigned a unique ID: `${startTimestamp}-${randomHash}` |
| FR-006 | Users shall be able to create manual text entries via ComposeModal |
| FR-007 | Manual entries shall support photo attachment (camera or photo library) |
| FR-008 | Manual entries shall support backdating to any date within the last 30 days |
| FR-009 | The Android MicWidget shall deep-link to HomeScreen recording mode on tap |
| FR-010 | The Android MicWidget shall deep-link to ComposeModal on "Type a note" tap |

### Transcription

| ID | Requirement |
|----|------------|
| FR-011 | Pending audio clips shall be transcribed via OpenAI Whisper through the `openai-whisper` edge function |
| FR-012 | Transcription shall support Hinglish (Hindi-English code-switching) with a default romanization prompt |
| FR-013 | Clips shall be transcribed sequentially; failed clips remain in queue for retry |
| FR-014 | After transcription, emotion tags shall be detected via Claude Haiku (14 possible emotions: calm, anxious, excited, sad, frustrated, content, stressed, hopeful, grateful, uncertain, proud, lonely, overwhelmed, motivated) |
| FR-015 | Merged transcript entries shall be deduplicated by `sourceTranscriptId` |
| FR-016 | After batch transcription completes, expense extraction and summary generation shall be triggered (fire-and-forget) |

### Summaries

| ID | Requirement |
|----|------------|
| FR-017 | Daily summaries shall be generated using Claude with vision support for photo entries |
| FR-018 | Summary output shall include: categorized text, 7-section daily insight, and macro estimates (calories/protein/carbs/fat) if food is mentioned |
| FR-019 | Each summary shall have a unique DALL-E 3 jellyfish artwork generated |
| FR-020 | Auto-summary shall trigger 5 minutes after the last entry (debounced) |
| FR-021 | Auto-summary shall check and generate yesterday's summary if missing on app launch |
| FR-022 | A "stale" banner shall appear on summaries when new entries exist since last generation |
| FR-023 | Regeneration shall re-process all entries for the date including new ones |
| FR-024 | Free users shall be limited to 3 summary generations per week (Sunday reset) |

### Insights

| ID | Requirement |
|----|------------|
| FR-025 | The Insights screen shall have 4 tabs: Who I Am, What I Value, How I Think, Your Story |
| FR-026 | Each tab shall have minimum data requirements: Who (20 entries / 60-day window), Values (10 entries / 30-day window), Thinking (25 entries / 45-day window), Story (30 entries / 90-day window) |
| FR-027 | "Who I Am" shall output: Big Five scores (0-100 with direction), Enneagram type(s), motivation drivers (3 toward + 3 away), character narrative |
| FR-028 | "What I Value" shall output: 6-10 values constellation, stated-vs-actual divergence flags, motivation pulse (achievement/connection/meaning/safety) |
| FR-029 | "How I Think" shall output: decision style, 2-4 cognitive bias patterns, execution metrics (starts-finishes ratio, consistency, planning-action), 4 cognitive dimension scales, 1-3 repeating thought loops |
| FR-030 | "Your Story" shall output: self-labels, current chapter narrative, 2-4 recurring cast archetypes, narrative patterns, arc type (Seeker/Builder/Witness/Transformer/Returner) |
| FR-031 | Arc history shall be tracked (last 6 transitions stored) |
| FR-032 | Each generation shall be snapshotted to InsightSnapshotService for historical comparison |
| FR-033 | First generation per tab shall be free; subsequent regenerations require Pro |
| FR-034 | Insight freshness shall be displayed (max age: Who 30d, Values 14d, Thinking 30d, Story 30d) |

### Wisdom

| ID | Requirement |
|----|------------|
| FR-035 | The wisdom library shall be fetched from Supabase with 24-hour cache TTL and bundled fallback |
| FR-036 | Feed order shall be date-seeded (deterministic within a day, rotates at midnight) using Mulberry32 PRNG |
| FR-037 | Feed ranking shall use journal signal (emotional_states, cognitive_patterns, themes, values, enneagram, depth) when available |
| FR-038 | Feed composition: ~70% acute matches, ~20% dispositional, ~10% stretch |
| FR-039 | Users shall be able to select a mood from 8 options (Heavy, Scattered, Frustrated, Comparing, Disconnected, Lonely, Seeking, Calm) to override signal-based ranking |
| FR-040 | Each wisdom short card shall display a DALL-E 3 generated image (cached locally) |
| FR-041 | Users shall be able to save, reflect on, and share wisdom shorts |
| FR-042 | Seen shorts shall be tracked with 30-day expiry to prevent repetition |
| FR-043 | The Android WisdomWidget shall show a daily rotating short with tap-to-open deep link |

### Conversations

| ID | Requirement |
|----|------------|
| FR-044 | The app shall support 12 AI minds: Companion + 11 philosophical perspectives (Krishna, Buddha, J. Krishnamurti, Charlie Munger, Carl Jung, Rumi, Ramana Maharshi, Adi Shankaracharya, and others) |
| FR-045 | Call mode (TalkScreen): User speaks → Whisper transcription → Claude response → ElevenLabs TTS playback, in a continuous loop |
| FR-046 | Chat mode (ChatScreen): Text-based turn exchange with the same mind system |
| FR-047 | Intent detection shall classify the first user message into one of 6 intents: emotional, decision, reflection, problem_solving, value_alignment, life_optimisation |
| FR-048 | User context (personality, values, goals, recent patterns) shall be injected into the system prompt |
| FR-049 | Distress-aware response modification: Tier 2 adds gentle naming; Tier 3 pauses session |
| FR-050 | Post-session reflection shall be generated and saved to the day's summary |
| FR-051 | Free users shall be limited to 1 AI conversation session (lifetime soft gate) |

### Wellbeing

| ID | Requirement |
|----|------------|
| FR-052 | Distress detection shall run on every journal entry save and every call turn (after minimum turns) |
| FR-053 | Tier 1 (score 0-39): Normal range — no action taken |
| FR-054 | Tier 2 (score 40-69): Sustained low — warm check-in modal on next app open with "Continue journaling" and "Talk about it" options |
| FR-055 | Tier 3 (score 70-100): Acute crisis — immediate pause modal with 4 crisis resources |
| FR-056 | Tier 3 shall be confirmed by a second Claude Sonnet call to prevent false positives |
| FR-057 | Per-user calibration: Tier 2 threshold rises from 40 to 55 after 2+ false-positive dismissals within 14 days |
| FR-058 | Tier 3 shall not fire within 24 hours of a false-positive dismissal |
| FR-059 | Re-entry check-in shall be queued after any Tier 2/3 event for the next session |
| FR-060 | Crisis resources: Vandrevala Foundation, iCall, AASRA, Snehi (India-focused) |
| FR-061 | Wellbeing detection can be disabled from Settings |

### Tracking

| ID | Requirement |
|----|------------|
| FR-062 | Expense extraction shall scan transcripts for spending keywords (regex: currency symbols, "spent", "paid", "bought", etc.) |
| FR-063 | Photo receipts shall be processed with Claude Vision for amount/category extraction |
| FR-064 | Expense categories: Food & Dining, Transport, Shopping, Health & Wellness, Entertainment, Bills & Utilities, Subscriptions, Other |
| FR-065 | Optional trackers (toggleable in Settings): Meals & Nutrition, Workout & Movement, Meditation, Spending |
| FR-066 | Monthly insight card shall show: mood score, movement days, meal quality, spend level, emotion breakdown, recurring topics, meditation days |
| FR-067 | User goals shall be configurable: spending budget, training days, nutrition targets |

### Auth & Security

| ID | Requirement |
|----|------------|
| FR-068 | Users shall sign up with email + password via Supabase Auth |
| FR-069 | Email verification via 6-digit OTP with 30-second resend cooldown |
| FR-070 | Password reset via email link |
| FR-071 | App lock via 4-digit PIN (djb2 hash with salt), enforced on every cold launch and background return |
| FR-072 | PIN setup, change, and disable flows in Settings |

### Notifications

| ID | Requirement |
|----|------------|
| FR-073 | One smart notification per day at configurable time (default 19:30) |
| FR-074 | Priority queue: wellbeing follow-up > emotional follow-up > recurring thought nudge > values divergence > tracker nudge > wisdom short > generic |
| FR-075 | Notifications shall deep-link to relevant screen (Wisdom, Home, etc.) |

---

## 7. Non-Functional Requirements

### Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-001 | Voice recording start latency | < 300ms from tap |
| NFR-002 | Single clip transcription (Whisper) | < 3 seconds for 10s clip |
| NFR-003 | Summary generation (Claude + image) | < 30 seconds total |
| NFR-004 | Call mode round-trip (speech → response audio) | < 5 seconds (current: 3.5-7.5s) |
| NFR-005 | App cold start to interactive | < 3 seconds |
| NFR-006 | Wisdom feed load | < 1 second (cached) |
| NFR-007 | Insight tab switch | < 500ms (cached data) |

### Storage

| ID | Requirement |
|----|------------|
| NFR-008 | Insight snapshot history shall be capped at 200 entries per tab |
| NFR-009 | Seen shorts tracking shall expire entries older than 30 days |
| NFR-010 | Wellbeing events shall be capped at 90 entries |
| NFR-011 | Wellbeing log shall be capped at 200 entries |
| NFR-012 | Image cache (wisdom + summary + story) shall be clearable from Settings |

### Security

| ID | Requirement |
|----|------------|
| NFR-013 | No API keys shall be stored in the client bundle |
| NFR-014 | All AI API calls shall route through Supabase Edge Functions |
| NFR-015 | Edge functions shall validate caller JWT (NOT YET IMPLEMENTED — see Open Questions) |
| NFR-016 | PIN hash shall use djb2 with fixed salt (not plaintext) |
| NFR-017 | AsyncStorage is encrypted at rest by the OS |

### Offline

| ID | Requirement |
|----|------------|
| NFR-018 | Voice recording shall work fully offline |
| NFR-019 | Manual text entry shall work fully offline |
| NFR-020 | Wisdom feed shall fall back to bundled library (~150 shorts) when offline |
| NFR-021 | Cached summaries, insights, and transcripts shall be readable offline |
| NFR-022 | Transcription, summary generation, and AI conversations require network |

### Accessibility (Gaps)

| ID | Gap |
|----|-----|
| NFR-023 | Most interactive elements lack `accessibilityLabel` and `accessibilityRole` |
| NFR-024 | No screen reader testing has been performed |
| NFR-025 | Color contrast has not been audited |

---

## 8. Feature Specifications

### Feature 1: Voice Recording & VAD

**Behavior:**
1. User taps mic button on HomeScreen → `audioRecorderService.startMonitoring()` called
2. Recording starts with Expo Audio HIGH_QUALITY preset (Opus, 48 kHz)
3. Audio metering values polled; VAD detects speech vs. silence
4. When silence exceeds the configured threshold (default 2.0s), recording stops
5. If recording duration > 0.5s: clip saved to `pending_clips` in AsyncStorage
6. If recording duration <= 0.5s: clip discarded
7. HomeScreen shows pending clips count and triggers batch transcription

**Edge Cases:**
- Mic permission denied: Alert shown, recording disabled
- Recording interrupted by phone call: Clip saved as-is if > 0.5s
- App backgrounded during recording: Recording stops, clip saved
- Multiple rapid start/stop: `isTranscribingRef` guard prevents concurrent batch processing
- Very long recording (>5 min): No explicit cap — records until silence detected

**Error States:**
- Mic permission denied → Alert with "Open Settings" option
- Audio hardware failure → `onError` callback fires, user shown error message
- File write failure → Clip lost; pending_clips not updated

**Acceptance Criteria:**
- [ ] Tapping mic starts recording within 300ms
- [ ] VAD stops recording after configured silence duration (1.0-3.0s)
- [ ] Clips < 0.5s are discarded (no empty entries)
- [ ] Clip ID format: `${timestamp}-${hash}` is unique
- [ ] Pending clips persist across app restarts
- [ ] Recording works on iOS and Android

**Rules:**
- Recording uses `Audio.RecordingOptionsPresets.HIGH_QUALITY`
- Minimum clip duration: 0.5 seconds
- VAD thresholds: -55 (very sensitive), -45 (sensitive), -35 (normal), -25 (loud only)
- Silence durations: 1.0s, 1.5s, 2.0s, 3.0s

---

### Feature 2: Manual Note Entry (ComposeModal)

**Behavior:**
1. User taps "+" on HomeScreen → ComposeModal opens
2. Auto-growing TextInput for text entry
3. Optional photo attachment (camera or library via Expo ImagePicker)
4. Optional date selection (last 30 days) for backdating
5. Tap Save → entry stored via `StorageService.addTranscript()`
6. If Spending tracker enabled and text contains expense keywords → `ExpenseService.extractAndSaveExpenses()` fires
7. `ActionablesService.invalidate()` and `UserContextService.invalidate()` called

**Edge Cases:**
- Empty text + no photo: Save button disabled
- Photo-only entry (no text): Allowed — photo processed by Claude Vision during summary
- Editing existing entry: Pre-fills text, photo, date; updates in place
- Date change on edit: Entry moved to new date's transcript array

**Error States:**
- Photo picker cancelled → No change
- Photo load failure → Toast error, entry saved without photo
- Storage write failure → Alert shown, entry not saved

**Acceptance Criteria:**
- [ ] Text input auto-grows as user types
- [ ] Photos can be attached from camera or library
- [ ] Date picker shows last 30 days
- [ ] Save is disabled when text is empty and no photo
- [ ] Editing preserves existing entry data
- [ ] Expense extraction triggers on save if keywords detected

**Rules:**
- Entries are stored in `transcripts_YYYY-MM-DD` keyed by local date
- Each entry has: id, text, timestamp, source ("manual"), optional photoUri, optional emotionTags
- Expense keywords regex: `[₹$£€]|spent|paid|bought|cost|bill|rent|emi|upi|purchased`

---

### Feature 3: Batch Transcription

**Behavior:**
1. `BatchTranscriptionService.transcribePendingClips()` reads all pending clips
2. Clips sorted by timestamp (oldest first)
3. Each clip transcribed sequentially via `AIProxy.transcribeAudio()` (Whisper edge function)
4. Successfully transcribed text merged into a single `TranscriptEntry`
5. Emotion tags detected via Claude Haiku (14 possible emotions)
6. Entry saved to `StorageService.addTranscript()`
7. Post-processing fired (fire-and-forget): expense extraction, summary check, cache invalidation
8. Progress reported via `onProgress` callback

**Edge Cases:**
- Audio file missing (deleted externally): Clip skipped, removed from pending
- Empty transcription result: Clip removed, no entry saved
- Partial batch failure: Successfully transcribed clips saved; failed clips remain for retry
- Duplicate `sourceTranscriptId`: Deduplicated on save

**Error States:**
- Whisper API failure → Clip stays in pending queue; retried on next batch
- Network offline → All clips fail, remain pending
- Storage write failure → Entry lost for that batch

**Acceptance Criteria:**
- [ ] All pending clips are processed in timestamp order
- [ ] Missing audio files are handled gracefully (skip + remove from pending)
- [ ] Failed transcriptions remain in queue for retry
- [ ] Emotion detection runs but never blocks the save
- [ ] Post-processing (expenses, summary) is fire-and-forget

**Rules:**
- Whisper edge function uses Hinglish prompt by default
- Emotion tag set: calm, anxious, excited, sad, frustrated, content, stressed, hopeful, grateful, uncertain, proud, lonely, overwhelmed, motivated
- Minimum transcribed text to save: non-empty after trim

---

### Feature 4: Daily Summary Generation

**Behavior:**
1. Triggered by auto-summary (5 min debounce after last entry) or manual "Regenerate"
2. All transcripts for the target date loaded from `StorageService`
3. Up to 8 photos read as base64 and embedded in the Claude request
4. Claude (Opus for vision / Haiku for text-only) generates:
   - Categorized summary text with markdown headers
   - 7-section daily insight (plain text)
   - Macro estimates (calories, protein, carbs, fat) or null
5. Structured output parsed using `===INSIGHTS===` and `===MACROS===` sentinel markers
6. DALL-E 3 generates unique jellyfish artwork (1792x1024)
7. Summary saved to `StorageService.saveSummary()`
8. Journal signal extracted (fire-and-forget) for wisdom feed ranking

**Edge Cases:**
- No entries for date: Summary not generated
- Entries with photos but no text: Photos still analyzed by Claude Vision
- Very long day (50+ entries): All text concatenated; may hit token limits
- DALL-E image generation fails: Summary saved without artwork (null image)
- Near midnight (23:55+): Auto-summary regenerates today; also checks yesterday

**Error States:**
- Claude API failure → Error propagated to caller; no summary saved
- JSON parse failure for macros → Macros set to null; summary saved without them
- Image generation failure → Summary saved; image = null
- Storage write failure → Summary lost

**Acceptance Criteria:**
- [ ] Summary includes all entries for the date
- [ ] Photos (up to 8) are embedded in the Claude request
- [ ] Output contains categorized summary, insights, and optional macros
- [ ] Jellyfish artwork is unique per day
- [ ] Free users gated at 3 summaries/week
- [ ] Stale banner shows when entries exist after last summary generation
- [ ] Regeneration re-processes all entries including new ones

**Rules:**
- Model: `claude-opus-4-5` (supports vision) — currently used for ALL summaries (cost optimization needed)
- Image: DALL-E 3, 1792x1024, bioluminescent jellyfish theme
- Auto-summary debounce: 5 minutes after last entry
- Weekly limit (free): 3 per week, Sunday reset
- Sentinel markers: `===INSIGHTS===`, `===MACROS===`

---

### Feature 5: Insights System (4 Tabs)

**Behavior:**

**Tab 1 — Who I Am:**
1. Requires 20+ entries in 60-day window
2. Claude Opus analyzes all entries + summaries
3. Outputs: Big Five (5 traits scored 0-100 with direction), Enneagram (1-2 types with evidence), motivation drivers (3 toward + 3 away), character narrative (3-4 sentences)
4. Results cached in `insightv2_who`; snapshot saved to history

**Tab 2 — What I Value:**
1. Requires 10+ entries in 30-day window
2. Outputs: 6-10 values by frequency/intensity/valence, stated-vs-actual divergence (0-2 flags), motivation pulse (one of: achievement, connection, meaning, safety)
3. Cached in `insightv2_values`

**Tab 3 — How I Think:**
1. Requires 25+ entries in 45-day window
2. Outputs: decision style, 2-4 cognitive biases (occasional/frequent/dominant), execution metrics (3 ratios), 4 cognitive dimension scales, 1-3 repeating thought loops
3. Uses both voice and typed entries (explains contrast between unedited vs. typed)
4. Cached in `insightv2_thinking`

**Tab 4 — Your Story:**
1. Requires 30+ entries in 90-day window
2. Outputs: 3-6 self-labels, current chapter (title + date range + narrative), 2-4 recurring cast archetypes, 1-3 narrative patterns, arc type (Seeker/Builder/Witness/Transformer/Returner)
3. Arc history tracked (last 6 transitions)
4. Cached in `insightv2_story`

**Edge Cases:**
- Not enough entries: "Not enough entries yet" empty state with count/threshold shown
- JSON parse failure on Claude response: Full retry with tighter prompt (25-word limits) — doubles API cost
- All tabs cached: Freshness badge shown; manual refresh available
- Tab data older than max age: Shown with "outdated" indicator

**Error States:**
- Claude API failure → Error message on tab; retry button shown
- Parse failure after retry → Error state persisted; user can try again later
- Storage read failure → Tab shows empty state

**Acceptance Criteria:**
- [ ] Each tab shows "not enough entries" when below threshold
- [ ] "Generate now" button appears when threshold is met
- [ ] First generation per tab is free (soft gate)
- [ ] Subsequent regenerations require Pro subscription
- [ ] Generated data matches the specified output structure
- [ ] Freshness badge shows time since last generation
- [ ] Snapshot saved on every generation
- [ ] Arc history tracks last 6 transitions

**Rules:**
- Freshness max ages: Who 30d, Values 14d, Thinking 30d, Story 30d
- JSON extraction uses `===JSON===` sentinel marker
- On parse failure: one retry with stricter prompt (<=25 word limits per field)
- Big Five direction: rising / stable / falling
- Bias frequency: occasional / frequent / dominant
- Arc types: Seeker, Builder, Witness, Transformer, Returner

---

### Feature 6: Wisdom Feed

**Behavior:**
1. On Wisdom tab open: load library (Supabase → 24h cache → bundled fallback)
2. Extract journal signal from last summary (emotional_states, cognitive_patterns, themes, values, enneagram_hints, depth_preference)
3. Rank shorts by signal relevance: emotional_states +3, cognitive_patterns +2, themes +2, values +1, enneagram +1, depth match +1
4. Split feed: ~70% acute matches, ~20% dispositional, ~10% stretch
5. Date-seeded shuffle (Mulberry32 PRNG) for deterministic-within-day order
6. Unseen shorts prioritized; author interleaving prevents clustering
7. Cards display: pullquote, author, generated artwork, save/reflect/share buttons

**Edge Cases:**
- No journal signal (new user): Deterministic shuffle, unseen first
- All shorts seen (30-day expiry prevents permanent exhaustion): Oldest seen recycled
- Library fetch fails + no cache: Falls back to bundled ~150 shorts
- Image not yet generated: Gradient placeholder shown while DALL-E generates in background
- Image generation fails: Gradient fallback persists; retry button shown

**Error States:**
- Supabase fetch failure → Use cached or bundled library
- Image generation failure → Gradient placeholder; manual retry
- Signal extraction failure → Use unranked shuffle

**Acceptance Criteria:**
- [ ] Feed order is stable within a day (same seed)
- [ ] Feed rotates at midnight
- [ ] Mood selection immediately re-ranks the feed
- [ ] Seen shorts are deprioritized (30-day tracking)
- [ ] Cards show generated images (cached locally)
- [ ] Save, reflect, and share actions work per card
- [ ] Offline mode shows bundled library

**Rules:**
- 8 moods: Heavy, Scattered, Frustrated, Comparing, Disconnected, Lonely, Seeking, Calm
- Each mood maps to a JournalSignal with emotional_states, cognitive_patterns, themes, values_in_tension, enneagram_hints, depth_preference
- Ranking weights: emotional +3, cognitive +2, themes +2, values +1, enneagram +1, depth +1
- Seen expiry: 30 days
- Cache TTL: 24 hours (Supabase library)

---

### Feature 7: AI Conversations — Call Mode

**Behavior:**
1. User opens TalkScreen → mind picker carousel shown
2. Select a mind → `startBoot()`:
   a. Request mic permission
   b. Load settings, goals, monthly insight, personality, values in parallel
   c. Check pending re-entry (wellbeing)
   d. Fetch opening message from Claude in mind's voice
3. Opening message plays via ElevenLabs TTS
4. Conversation loop:
   a. User speaks → VAD detects silence (1200ms) → recording stops
   b. Audio base64-encoded → sent to Whisper edge function → text returned
   c. (First turn only) `detectIntent()` classifies user message — BLOCKING
   d. System prompt rebuilt with user context
   e. Claude Haiku generates response → split into sentences
   f. Each sentence synthesized to speech (TTS, parallel launch, sequential playback)
   g. After all sentences play → listening resumes
5. Distress detection runs on each turn (after minimum turns)
6. End call → reflection generated and saved to summary

**Edge Cases:**
- Mic permission denied: Error state shown; cannot proceed
- Opening message fails: Fallback generic greeting
- Empty transcription: Turn skipped, listening resumes
- Very long user turn: No explicit limit; full text sent to Claude
- Call duration: No time limit; timer shown in UI
- Network drop mid-call: Current turn fails; user can retry or end call

**Error States:**
- Whisper failure → Toast error; user can tap mic to retry
- Claude failure → Error message in transcript; listening resumes
- TTS failure → Response shown as text only (no audio)
- Mic permission denied → Error screen with Settings link

**Acceptance Criteria:**
- [ ] Mind picker shows all 12 minds with portraits and descriptions
- [ ] Opening message plays automatically after mind selection
- [ ] VAD detects speech end and triggers transcription
- [ ] AI responds in the selected mind's voice and perspective
- [ ] TTS audio plays for each AI response
- [ ] Distress detection runs on each turn
- [ ] Post-call reflection is generated and saved
- [ ] Free users gated after 1 session

**Rules:**
- SILENCE_MS: 1200ms (current; recommended reduction to 800ms)
- Max tokens for response: 220 (keeps responses concise)
- Sentence splitting for parallel TTS synthesis
- Audio mode switching required on iOS (recording ↔ playback)
- Timer starts at call start, displayed in UI
- 12 minds: Companion + Krishna, Buddha, J. Krishnamurti, Charlie Munger, Carl Jung, Rumi, Ramana Maharshi, Adi Shankaracharya + others

---

### Feature 8: AI Conversations — Chat Mode

**Behavior:**
1. User opens ChatScreen → mind picker carousel shown
2. Select a mind → chat UI with text input at bottom
3. User types message and taps Send
4. System prompt built with user context + mind persona + intent (detected on first message)
5. Claude responds in mind's voice
6. Conversation continues with full history
7. On close: reflection generated and saved to summary

**Edge Cases:**
- Very long conversation (30+ turns): Full history sent to Claude; may hit context limits
- User sends empty message: Send button disabled
- Network failure mid-conversation: Error toast; user can retry

**Error States:**
- Claude API failure → Error message in chat thread; retry button
- Context build failure → Falls back to basic prompt without user context

**Acceptance Criteria:**
- [ ] Mind picker matches TalkScreen design
- [ ] Text input with Send button at bottom
- [ ] AI responds in mind's voice with user context
- [ ] Conversation history displayed with role indicators
- [ ] Post-close reflection generated and saved
- [ ] Free users gated after 1 session

**Rules:**
- 6 intents: emotional, decision, reflection, problem_solving, value_alignment, life_optimisation
- Intent detected once per session, cached
- User context injected: personality, values, goals, patterns, recent summary
- Distress-aware: Tier 2 adds gentle naming; Tier 3 pauses session

---

### Feature 9: Wellbeing Detection

**Behavior:**
1. On every entry save: `WellbeingService.analyzeEntry()` runs
2. On every call turn (after minimum turns): `analyzeCallTurn()` runs
3. Claude Haiku scores distress on a 0-100 scale
4. **Tier 1 (0-39):** No action
5. **Tier 2 (40-69):** Event logged; re-entry queued; modal shown on next app open
   - Initial view: warm check-in with "Continue journaling" and "Talk about it"
   - "Talk about it": follow-up question + top 2 crisis resources
6. **Tier 3 (70-100):** Confirmed by Claude Sonnet; immediate pause modal
   - All 4 crisis resources displayed
   - Can continue journaling at any time
7. Re-entry check-in shown on next session if prior Tier 2/3

**Edge Cases:**
- False positive (user is venting, not distressed): "This doesn't apply" dismissal → `recordFalsePositive()`
- Rapid successive Tier 3s: Blocked within 24h of false-positive dismissal
- Detection disabled in Settings: No analysis runs
- In-call detection: Lightweight check; no modal during call (deferred to post-call)

**Error States:**
- Claude API failure → Detection skipped silently (never blocks journaling)
- Sonnet confirmation failure → Tier 3 not escalated (defaults to Tier 2 behavior)

**Acceptance Criteria:**
- [ ] Tier 2 modal appears on next app open (not immediately)
- [ ] Tier 3 modal appears immediately with crisis resources
- [ ] Tier 3 requires Sonnet confirmation (double-check)
- [ ] False-positive dismissal raises Tier 2 threshold (40→55 after 2 dismissals in 14 days)
- [ ] Tier 3 blocked within 24h of false-positive
- [ ] Re-entry check-in shown on next session
- [ ] Detection can be disabled from Settings
- [ ] Detection never blocks entry save or app usage

**Rules:**
- Tier 2 threshold: 40 (default), rises to 55 after 2+ false positives in 14 days
- Tier 3: always 70+
- Sonnet double-check on Tier 3 only
- Events capped at 90; log capped at 200
- Crisis resources (India): Vandrevala Foundation (1860-2662-345), iCall (9152987821), AASRA (9820466726), Snehi (044-24640050)

---

### Feature 10: Expense & Tracker System

**Behavior:**
1. After transcription, `ExpenseService.mayContainExpense()` checks for keywords
2. If keywords found: Claude Haiku extracts amount, category, description from text
3. If photo attached: Claude Vision (Opus) reads receipt
4. Expenses saved to `expenses_YYYY-MM` in AsyncStorage
5. Monthly insight card shows spending breakdown by category
6. Optional trackers (Meals, Workout, Meditation, Spending) toggleable in Settings
7. Monthly insight aggregates tracker data from summaries

**Edge Cases:**
- Text mentions money but no actual expense ("my budget is 500"): May extract incorrectly
- Receipt photo with no text: Vision extraction only
- Duplicate extraction (same entry processed twice): Deduplicated by sourceTranscriptId
- Currency: INR-focused formatting (rupee symbol, lakhs/crores)

**Error States:**
- Extraction fails → Fire-and-forget; no expense saved (non-blocking)
- Vision call fails → Text extraction attempted as fallback

**Acceptance Criteria:**
- [ ] Spending keywords trigger extraction
- [ ] Photo receipts processed by Claude Vision
- [ ] Expenses categorized into 8 categories
- [ ] Monthly spending shown in insight card
- [ ] Trackers toggleable from Settings
- [ ] No duplicate expenses per sourceTranscriptId

**Rules:**
- 8 categories: Food & Dining, Transport, Shopping, Health & Wellness, Entertainment, Bills & Utilities, Subscriptions, Other
- INR formatting: amounts shown as "1L", "1k", "123"
- Keyword regex: `[₹$£€]|spent|paid|bought|cost|bill|rent|emi|upi|purchased`

---

### Feature 11: Subscription & Paywall

**Behavior:**
1. Install date recorded on first launch
2. 14-day trial begins automatically (full Pro access)
3. After trial: free tier with gates
4. PaywallModal shown when user hits a gate:
   - Context hint ("You've used 3 of 3 free summaries this week")
   - Two plans: Annual ($59.99) and Monthly ($8.99)
   - Subscribe button → RevenueCat IAP flow
   - Restore purchases button
5. On successful purchase: entitlement checked via RevenueCat SDK
6. Subscription status cached locally as fallback

**Edge Cases:**
- App Store cancellation: RevenueCat reflects status; local cache may be stale
- Offline purchase check: Falls back to local `sub_is_subscribed` flag
- Trial countdown: Shows days remaining on Settings screen
- Restore purchases: Checks RevenueCat for existing entitlement

**Error States:**
- Purchase failure (cancelled, declined) → Error toast; modal stays open
- RevenueCat SDK failure → Falls back to local flag
- Network offline during gate check → Local flag used

**Acceptance Criteria:**
- [ ] 14-day trial starts automatically on install
- [ ] Free tier enforces: 3 summaries/week, 1 insight/tab, 1 conversation
- [ ] PaywallModal shows context of what gate was hit
- [ ] Both plan options displayed with pricing
- [ ] Purchase completes through App Store / Play Store
- [ ] Restore purchases recovers existing subscription
- [ ] Trial countdown shown in Settings

**Rules:**
- Trial duration: 14 days from `sub_install_date`
- Week reset: Sunday
- Soft gates: first use per feature type is always free
- Product IDs: `untangle_pro_monthly`, `untangle_pro_annual`
- Entitlement: `pro`
- Local fallback: `sub_is_subscribed` in AsyncStorage

---

### Feature 12: Smart Notifications

**Behavior:**
1. One notification per day at configurable time (default 19:30)
2. Priority queue selects content:
   1. Wellbeing follow-up (pending re-entry)
   2. Emotional follow-up (yesterday's distress tags)
   3. Recurring thought nudge (active loop from How I Think)
   4. Values divergence (stated vs. actual gap)
   5. Tracker nudge (enabled tracker not mentioned today)
   6. Wisdom short (matched to yesterday's emotions)
   7. Generic fallback (simple reflection prompt)
3. Deep-link payload directs to relevant screen on tap

**Edge Cases:**
- Notification time already passed today: Scheduled for tomorrow
- Permission not granted: Notifications silently skipped
- No relevant content for any priority: Generic fallback used
- Multiple re-entry events: Highest priority (wellbeing) wins

**Error States:**
- Notification scheduling failure → Silently retried on next app open
- Deep-link failure → Opens HomeScreen as fallback

**Acceptance Criteria:**
- [ ] One notification per day maximum
- [ ] Content selected by priority queue
- [ ] Notification time configurable in Settings
- [ ] Deep-link opens correct screen
- [ ] Permission requested gracefully

**Rules:**
- Default time: 19:30 local
- Priority order: wellbeing > emotional > thought > values > tracker > wisdom > generic
- Cancels previous before scheduling new
- Skips if already scheduled for today

---

### Feature 13: App Lock (PIN)

**Behavior:**
1. User sets 4-digit PIN in Settings → hashed with djb2 + salt → stored in AsyncStorage
2. On every cold launch and background-to-foreground transition: PinLockScreen overlay shown
3. User enters 4 digits via numeric keypad
4. On correct PIN: overlay removed
5. On incorrect PIN: shake animation + vibration + error message + digits cleared
6. Change PIN: enter old PIN → enter new PIN → confirm new PIN
7. Disable PIN: enter current PIN → PIN removed

**Edge Cases:**
- No PIN set: PinLockScreen never shown
- App killed during PIN entry: PIN still required on relaunch
- PIN forgotten: No recovery mechanism (user must clear app data)
- Rapid incorrect attempts: No lockout (no brute-force protection)

**Error States:**
- Incorrect PIN → Shake + vibrate + clear; unlimited retries
- Storage read failure for PIN hash → PIN lock disabled (fail-open)

**Acceptance Criteria:**
- [ ] PIN is 4 digits, entered via numeric keypad
- [ ] PIN stored as djb2 hash with salt (never plaintext)
- [ ] Lock screen covers entire app on every cold launch and background return
- [ ] Correct PIN dismisses overlay
- [ ] Incorrect PIN shows error with shake animation
- [ ] PIN can be set, changed, and disabled from Settings

**Rules:**
- Hash: djb2 algorithm with fixed salt
- Storage key: `app_pin_hash`
- No lockout after failed attempts
- No recovery mechanism
- Fail-open on storage read error

---

## 9. Technical Architecture

### 9.1 Data Models

#### TranscriptEntry
```
{
  id: string                    // UUID
  text: string                  // Transcribed or manual text
  timestamp: number             // Unix ms
  duration?: number             // Recording duration in seconds
  source: "voice" | "manual"    // Entry origin
  emotionTags?: string[]        // Detected emotions (14 possible)
  photoUri?: string             // Local file path to attached photo
  sourceTranscriptId?: string   // For deduplication
}
```

#### PendingClip
```
{
  id: string                    // ${timestamp}-${hash}
  uri: string                   // Local audio file path
  timestamp: number             // Recording start time
  duration: number              // Clip duration in seconds
}
```

#### DailySummary
```
{
  date: string                  // YYYY-MM-DD
  summary: string               // Markdown-formatted summary
  insight: string               // 7-section plain text insight
  macros?: DayMacros            // {calories, protein, carbs, fat} or null
  moodEmoji?: string            // Detected mood emoji
  moodLabel?: string            // Detected mood label
  imageUri?: string             // Local path to DALL-E artwork
  generatedAt: number           // Unix ms
}
```

#### DayMacros
```
{
  calories: number
  protein: number
  carbs: number
  fat: number
}
```

#### WhoYouAreAnalysis
```
{
  bigFive: {
    openness: { score: number, direction: "rising"|"stable"|"falling" }
    conscientiousness: { score: number, direction: string }
    extraversion: { score: number, direction: string }
    agreeableness: { score: number, direction: string }
    neuroticism: { score: number, direction: string }
  }
  enneagram: {
    types: Array<{ type: number, evidence: string }>
    coreFear: string
    coreDesire: string
    growthDirection: string
  }
  motivationDrivers: {
    toward: Array<{ driver: string, strength: number }>  // 3 items
    away: Array<{ driver: string, strength: number }>     // 3 items
  }
  characterNarrative: string     // 3-4 sentences
  generatedAt: number
}
```

#### WhatYouCareAboutAnalysis
```
{
  values: Array<{
    topic: string
    frequency: number           // 0-100
    intensity: number           // 0-100
    valence: "positive"|"negative"|"neutral"|"mixed"
  }>                             // 6-10 items
  divergence: Array<{
    stated: string
    actual: string
    evidence: string
  }>                             // 0-2 items
  motivationPulse: "achievement"|"connection"|"meaning"|"safety"
  generatedAt: number
}
```

#### HowYouThinkAnalysis
```
{
  decisionStyle: { label: string, evidence: string }
  biasPatterns: Array<{
    name: string
    frequency: "occasional"|"frequent"|"dominant"
    evidence: string
  }>                             // 2-4 items
  executionPatterns: {
    startsFinishesRatio: number
    consistencyScore: number
    planningActionScore: number
  }
  cognitiveDimensions: {
    systemsVsStories: number     // -100 to 100
    zoomedInVsOut: number
    resolvesVsSitsWith: number
    internalVsExternal: number
  }
  repeatingLoops: Array<{
    pattern: string
    trigger: string
    frequency: string
  }>                             // 1-3 items
  generatedAt: number
}
```

#### YourStoryAnalysis
```
{
  selfLabels: string[]           // 3-6 items
  currentChapter: {
    title: string
    dateRange: string
    narrative: string            // Present tense, second person
  }
  recurringCast: Array<{
    archetype: string
    interactionStyle: string
    conflictPattern: string
  }>                             // 2-4 items
  narrativePatterns: Array<{
    pattern: string
    evidence: string
  }>                             // 1-3 items
  arcType: "Seeker"|"Builder"|"Witness"|"Transformer"|"Returner"
  generatedAt: number
}
```

#### WisdomShort
```
{
  id: string
  title: string
  short: string                  // 100-150 words
  pullquote: string              // <=20 words, verbatim
  source_author: string
  source_url?: string
  source_type: string            // "essay"
  themes: string[]               // 2-4
  emotional_states: string[]     // 1-3
  cognitive_patterns: string[]   // 1-2
  values: string[]               // 2-3
  enneagram_resonance: string[]  // 1-3
  cognitive_style?: string[]
  depth: "entry"|"mid"|"deep"
  image_url?: string             // Supabase CDN URL
  image_prompt?: string
  created_at?: string
}
```

#### JournalSignal
```
{
  emotional_states: string[]
  cognitive_patterns: string[]
  themes: string[]
  values_in_tension: string[]
  enneagram_hints: string[]
  depth_preference: "entry"|"mid"|"deep"
}
```

#### AppSettings
```
{
  vadThreshold: number           // -55, -45, -35, or -25
  silenceDuration: number        // 1.0, 1.5, 2.0, or 3.0
  batchSize: number              // Number of clips per batch
  openaiApiKey?: string          // Legacy — no longer used
  anthropicApiKey?: string       // Legacy — no longer used
  elevenLabsApiKey?: string      // Legacy — no longer used
  elevenLabsVoiceId?: string     // Legacy — no longer used
}
```

#### ExpenseEntry
```
{
  id: string
  amount: number
  category: string               // One of 8 categories
  description: string
  date: string                   // YYYY-MM-DD
  sourceTranscriptId: string     // For deduplication
}
```

#### UserGoals
```
{
  spendingBudget?: number
  trainingDaysPerWeek?: number
  calorieTarget?: number
  proteinTarget?: number
  carbTarget?: number
  fatTarget?: number
}
```

#### ConversationMessage
```
{
  role: "user" | "assistant"
  text: string
  timestamp: number
}
```

#### DistressEvent
```
{
  tier: 1 | 2 | 3
  score: number                  // 0-100
  date: string                   // YYYY-MM-DD
  timestamp: number
  confidence: number
}
```

### 9.2 AsyncStorage Key Registry

| Key Pattern | Shape | TTL | Service |
|-------------|-------|-----|---------|
| `transcripts_YYYY-MM-DD` | TranscriptEntry[] | Permanent | StorageService |
| `summaries_YYYY-MM-DD` | DailySummary | Permanent | StorageService |
| `pending_clips` | PendingClip[] | Until processed | StorageService |
| `app_settings` | AppSettings | Permanent | StorageService |
| `insightv2_who` | WhoYouAreAnalysis | Max 30 days | InsightV2Service |
| `insightv2_values` | WhatYouCareAboutAnalysis | Max 14 days | InsightV2Service |
| `insightv2_thinking` | HowYouThinkAnalysis | Max 30 days | InsightV2Service |
| `insightv2_story` | YourStoryAnalysis | Max 30 days | InsightV2Service |
| `insightv2_who_history` | WhoYouAreAnalysis[] | Permanent (cap 200) | InsightSnapshotService |
| `insightv2_values_history` | Analysis[] | Permanent (cap 200) | InsightSnapshotService |
| `insightv2_thinking_history` | Analysis[] | Permanent (cap 200) | InsightSnapshotService |
| `insightv2_story_history` | Analysis[] | Permanent (cap 200) | InsightSnapshotService |
| `insightv2_enneagram_response` | string | Permanent | StorageService |
| `insightv2_arc_history` | {type, date}[] | Permanent (cap 6) | StorageService |
| `insight_emotions_WINDOW_TAG` | EmotionAnalysis | 24 hours | InsightAnalysisService |
| `insight_patterns_WINDOW_TAG` | ThoughtPatternAnalysis | 7 days | InsightAnalysisService |
| `insight_personality` | PersonalityAnalysis | Legacy | InsightAnalysisService |
| `insight_growthtips` | GrowthTips | Legacy | InsightAnalysisService |
| `monthly_insight_YYYY-MM` | MonthlyInsight | Until new summaries added | MonthlyInsightService |
| `expenses_YYYY-MM` | ExpenseEntry[] | Permanent | ExpenseService |
| `user_goals` | UserGoals | Permanent | StorageService |
| `wisdom_saved_shorts` | SavedShort[] | Permanent | StorageService |
| `wisdom_seen_shorts` | {id, timestamp}[] | 30-day expiry | StorageService |
| `wisdom_journal_signal` | JournalSignal | Permanent | StorageService |
| `wisdom_custom_shorts` | WisdomShort[] | Permanent | StorageService |
| `wisdom_img_${shortId}` | string (file path) | Until cache cleared | WisdomImageService |
| `supabase_shorts_v2` | {shorts, timestamp} | 24 hours | SupabaseService |
| `app_pin_hash` | string | Permanent | StorageService |
| `sub_install_date` | string (ISO date) | Permanent | SubscriptionService |
| `sub_is_subscribed` | string ("true"/"false") | Permanent (may be stale) | SubscriptionService |
| `sub_summaries_usage` | {weekKey, count} | Weekly reset | SubscriptionService |
| `sub_insights_generated` | {who, values, thinking, story} | Permanent | SubscriptionService |
| `sub_conversation_used` | string ("true") | Permanent | SubscriptionService |
| `wellbeing_enabled` | string ("true"/"false") | Permanent | WellbeingService |
| `wellbeing_events` | DistressEvent[] | Cap 90 | WellbeingService |
| `wellbeing_reentry` | ReentryPending \| null | Until cleared | WellbeingService |
| `wellbeing_log` | WellbeingLogEntry[] | Cap 200 | WellbeingService |
| `wellbeing_false_positives` | number[] (timestamps) | 30-day expiry | WellbeingService |
| `user_context_cache` | {context, timestamp} | 4 hours | UserContextService |
| `actionables_cache` | {data, timestamp} | 12 hours | ActionablesService |
| `mind_perspective_${mindId}` | MindPerspective | 24 hours | MindService |
| `story_img_${id}` | string (file path) | Until cache cleared | StoryImageService |
| `publisher_mode` | string ("true") | Permanent | StorageService |
| `sms_synced_ids` | string[] | Permanent | SMSSpendService |
| `smart_notification_scheduled_id` | string | Permanent | SmartNotificationService |
| `smart_notification_last_date` | string | Permanent | SmartNotificationService |
| `wisdom_last_reflected` | string (shortId) | Permanent | UserContextService |
| `UNTANGLE_FIRST_NOTE_DONE` | string ("true") | Permanent | HomeScreen |
| `UNTANGLE_NOTIF_OPT_IN_DONE` | string ("true") | Permanent | HomeScreen |
| `onboarding_complete` | string ("true") | Permanent | OnboardingScreen |

### 9.3 Supabase Schema

#### Tables

**wisdom_shorts**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Short identifier |
| title | text | Short title |
| short | text | Full body (100-150 words) |
| pullquote | text | Key quote (<=20 words) |
| source_author | text | Author name |
| source_url | text | Original source URL |
| source_type | text | "essay" |
| themes | text[] | 2-4 themes |
| emotional_states | text[] | 1-3 emotional states |
| cognitive_patterns | text[] | 1-2 cognitive patterns |
| values | text[] | 2-3 values |
| enneagram_resonance | text[] | 1-3 Enneagram types |
| cognitive_style | text[] | Cognitive style tags |
| depth | text | "entry" / "mid" / "deep" |
| image_url | text | Supabase Storage CDN URL |
| image_prompt | text | DALL-E prompt used |
| discipline | text | Source discipline |
| confidence_level | text | Extraction confidence |
| created_at | timestamptz | Row creation time |

#### Storage Buckets

| Bucket | Path Pattern | Access |
|--------|-------------|--------|
| `wisdom-images` | `shorts/${shortId}.jpg` | Public read |

### 9.4 API Integrations

#### Anthropic Claude (via `claude` edge function)

| Model | Use Case | Service |
|-------|----------|---------|
| claude-opus-4-5 | Daily summaries (vision), Who I Am insights, monthly insights, expense receipts | SummaryService, InsightV2Service, MonthlyInsightService, ExpenseService |
| claude-sonnet-4-6 | Tier 3 wellbeing confirmation | WellbeingService |
| claude-haiku-4-5 | Conversations, emotion detection, actionables, expense text extraction, mind perspectives, wisdom metadata, intent detection | ConversationService, BatchTranscriptionService, ActionablesService, ExpenseService, MindService, WisdomImageService |

#### OpenAI (via edge functions)

| API | Edge Function | Use Case |
|-----|--------------|----------|
| Whisper v1 | `openai-whisper` | Audio transcription (Hinglish support) |
| DALL-E 3 | `openai-image` | Summary artwork (1792x1024), wisdom images (1024x1024), story images |

#### ElevenLabs (via `elevenlabs-tts` edge function)

| API | Use Case |
|-----|----------|
| Text-to-Speech (Flash v2.5) | Call mode voice responses |
| Voices list (direct API — not proxied) | Voice selection in settings |

#### RevenueCat

| Method | Use Case |
|--------|----------|
| `Purchases.configure()` | SDK init with API key + Supabase user ID |
| `Purchases.getCustomerInfo()` | Check subscription status |
| `Purchases.purchasePackage()` | Purchase Pro plan |
| `Purchases.restorePurchases()` | Restore existing subscription |

#### PostHog

| Method | Use Case |
|--------|----------|
| `posthog.capture()` | Event tracking |
| `posthog.identify()` | User identification |
| `posthog.screen()` | Screen tracking |
| `posthog.reset()` | Clear identity on sign-out |

### 9.5 System Flows

#### Flow 1: Recording → Transcription → Summary

```
User taps mic
  │
  ▼
AudioRecorderService.startMonitoring()
  │  ← VAD monitors audio levels
  ▼
Silence detected (threshold exceeded for SILENCE_DURATION)
  │
  ▼
Clip saved to pending_clips (AsyncStorage)
  │
  ▼
BatchTranscriptionService.transcribePendingClips()
  │
  ├─► For each clip (sequential):
  │     AIProxy.transcribeAudio(uri) → Whisper edge function → text
  │
  ▼
Merge texts → detect emotions (Haiku, fire-and-forget)
  │
  ▼
StorageService.addTranscript(entry)
  │
  ├─► ExpenseService.extractAndSaveExpenses() [fire-and-forget]
  ├─► UserContextService.invalidate()
  ├─► ActionablesService.invalidate()
  │
  ▼
AutoSummaryService.checkAndAutoGenerate() [5 min debounce]
  │
  ▼
SummaryService.generateDailySummary(transcripts, date)
  │
  ├─► Read photos as base64 (up to 8)
  ├─► Claude Opus: summary + insights + macros
  ├─► DALL-E 3: jellyfish artwork
  │
  ▼
StorageService.saveSummary(summary)
  │
  ▼
extractJournalSignal() [fire-and-forget]
```

#### Flow 2: Call Mode Round-Trip

```
User speaks → VAD silence (1200ms)
  │
  ▼
rec.stopAndUnloadAsync()
  │
  ▼
FileSystem.readAsStringAsync(uri, {encoding: Base64})
  │
  ▼
AIProxy.transcribeAudio() → openai-whisper edge function
  │                           ├─ atob decode
  │                           ├─ POST to OpenAI Whisper API
  │                           └─ return {text, language, duration}
  │
  ▼
[First turn only] detectIntent(text) → claude edge function (BLOCKING)
  │
  ▼
getSystemPromptWithContext() → UserContextService.get()
  │
  ▼
fetchSentences() → claude edge function (Haiku)
  │                  ├─ Full response (no streaming)
  │                  └─ Split into sentences
  │
  ▼
For each sentence (parallel synthesis, sequential playback):
  │
  ├─► AIProxy.synthesizeSpeech() → elevenlabs-tts edge function
  │                                  ├─ POST to ElevenLabs API
  │                                  ├─ arrayBuffer → base64 (byte-by-byte)
  │                                  └─ return {audio: base64}
  │
  ▼
Client: base64 → write file → Audio.Sound.createAsync → play
  │
  ▼
After all sentences → startListening() → loop
```

#### Flow 3: Distress Detection Escalation

```
Entry saved / Call turn completed
  │
  ▼
WellbeingService.analyzeEntry() or analyzeCallTurn()
  │
  ▼
Claude Haiku scores distress (0-100)
  │
  ├─ Score < Tier2Threshold (40/55) → Tier 1 → No action
  │
  ├─ Score 40-69 → Tier 2
  │     ├─ Log event
  │     ├─ Queue re-entry
  │     └─ Show modal on next app open
  │           ├─ "Continue journaling" → dismiss
  │           └─ "Talk about it" → follow-up + crisis resources
  │
  └─ Score 70+ → Tier 3 candidate
        │
        ▼
      Claude Sonnet confirmation
        │
        ├─ Confirmed → Tier 3
        │     ├─ Immediate pause modal
        │     ├─ 4 crisis resources shown
        │     ├─ Log event
        │     └─ Queue re-entry
        │
        └─ Not confirmed → Treat as Tier 2
```

#### Flow 4: Wisdom Feed Curation

```
User opens Wisdom tab
  │
  ▼
SupabaseService.getShortsLibrary()
  ├─ Cache fresh (<24h)? → return cached
  ├─ Network fetch → cache + return
  └─ Fallback: stale cache → bundled library
  │
  ▼
StorageService.getJournalSignal()
  │
  ▼
WisdomService.buildFeed(signal, savedIds, seenIds, emotionFilter?)
  │
  ├─ With signal:
  │     ├─ Score each short by signal relevance
  │     ├─ Split: 70% acute / 20% dispositional / 10% stretch
  │     └─ Unseen first, author-interleaved
  │
  └─ Without signal:
        ├─ Date-seeded Mulberry32 shuffle
        └─ Unseen first, author-interleaved
  │
  ▼
Render FlatList carousel → Each ShortCard auto-generates image if not cached
```

### 9.6 Edge Function Architecture

All 5 edge functions run on Supabase Edge (Deno runtime).

| Function | Endpoint | Input | Output | External API |
|----------|---------|-------|--------|-------------|
| `claude` | POST `/claude` | Claude API params (any) | Claude response JSON | Anthropic Messages API |
| `openai-whisper` | POST `/openai-whisper` | {audio_base64, filename, prompt?, language?} | {text, language, duration} | OpenAI Whisper v1 |
| `openai-image` | POST `/openai-image` | OpenAI image params (any) | Image response JSON | OpenAI DALL-E 3 |
| `elevenlabs-tts` | POST `/elevenlabs-tts` | {voice_id, text, voice_settings?} | {audio: base64} | ElevenLabs TTS |
| `fill-short-metadata` | POST (webhook) | Supabase INSERT payload | Updates row in-place | Anthropic (Haiku) |

**Environment variables** (set in Supabase dashboard):
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `ELEVEN_LABS_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (fill-short-metadata only)

### 9.7 Wisdom Pipeline (Python ETL)

**Location:** `scripts/wisdom_pipeline/`

**Purpose:** Build and maintain 3,000+ curated wisdom shorts from academic and philosophical sources.

**Pipeline stages:**

```
1. FETCH  → PubMed, YouTube, Web, Text files
               │
2. CHUNK  → 900-word windows, 150-word overlap
               │
3. EXTRACT → Claude Opus: extract insight units, rewrite in "Untangle voice"
               │
4. TAG    → Claude Opus: themes, emotions, patterns, values, enneagram, depth
               │
5. SCORE  → Claude Haiku: 4 criteria × 10 pts = 40 max (min: 28)
               │
6. DEDUP  → Against existing Supabase IDs + current batch
               │
7. REVIEW → Save to /review/{timestamp}_{tag}.json for human review
               │
8. UPSERT → Supabase: 50 rows/batch, on_conflict="id"
               │
9. IMAGE  → DALL-E 3: bulk generate for rows with image_url IS NULL
```

**Source distribution target:** ~30% neuroscience, ~35% psychology, ~15% philosophy, ~10% behavioral economics, ~10% evolutionary biology

**14 thematic clusters:** self-knowledge, meaning, stoicism, emotions, grief, anxiety, relationships, self-compassion, motivation, attention, awe, social comparison, decision-making, evolutionary biology

### 9.8 Build & Deploy

**EAS Build Profiles (eas.json):**

| Profile | Platform | Output | Use |
|---------|----------|--------|-----|
| preview | Android | APK | Internal testing |
| device | iOS | Internal distribution | Device testing |
| production | Android | AAB (App Bundle) | Play Store release |

**Project ID:** `5dddd28c-4e99-4303-afef-ba88d7266fa9`
**Package:** `com.priyasingh.autojournal`

**Android-specific:**
- Custom Expo plugin: `withMicrophonePermission.js` (injects `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` into AndroidManifest)
- Hermes bytecode engine
- Adaptive icon with `#1a1a2e` background

---

## 10. Analytics & Instrumentation

### PostHog Configuration

- **Host:** https://us.i.posthog.com
- **API Key:** `phc_CwxC4JQYRrB73nmmJvYbrXscwTyvyTawkuz235egRuEE`
- **Flush:** `flushAt: 1`, `flushInterval: 500ms` (NOTE: should be batched for production)

### Event Catalog

| Category | Event Name | Properties |
|----------|-----------|------------|
| **Auth** | `user_signed_up` | method |
| | `user_signed_in` | method |
| | `user_signed_out` | — |
| **Journaling** | `recording_started` | — |
| | `recording_completed` | duration |
| | `manual_note_created` | hasPhoto |
| **Summaries** | `summary_viewed` | date |
| | `summary_generated` | date, isRegenerate |
| | `summary_shared` | date |
| **Conversations** | `talk_session_started` | mindId |
| | `talk_session_ended` | mindId, duration, turnCount |
| | `chat_session_started` | mindId |
| | `chat_session_ended` | mindId, turnCount |
| **Insights** | `insight_tab_viewed` | tab |
| | `insight_generated` | tab, isRegenerate |
| **Wisdom** | `wisdom_short_saved` | shortId |
| | `wisdom_short_unsaved` | shortId |
| | `wisdom_short_shared` | shortId |
| | `wisdom_short_reflected` | shortId |
| | `mood_selected` | mood |
| **Subscription** | `paywall_shown` | context |
| | `subscription_purchased` | plan, price |

### Key Funnels

1. **Onboarding → First Entry:** Onboarding complete → recording_started
2. **Entry → Summary:** recording_completed → summary_generated
3. **Summary → Insight:** summary_viewed → insight_tab_viewed → insight_generated
4. **Paywall → Purchase:** paywall_shown → subscription_purchased
5. **Wisdom Engagement:** wisdom_short_saved, wisdom_short_reflected

### User Identification

- Identify by Supabase user ID after sign-in
- Reset on sign-out
- Anonymous tracking before sign-in

---

## 11. Release & Rollout Plan

### Current State

- **Version:** 1.3.0
- **Branch:** `feat/auto-journal-v1`
- **Build system:** Expo EAS
- **Distribution:** Internal testing (preview APK)
- **Not yet on public stores**

### Platform Support Matrix

| Feature | iOS | Android | Android Widget | Web |
|---------|-----|---------|---------------|-----|
| Voice recording | Yes | Yes | Deep-link only | No |
| Manual entry | Yes | Yes | Deep-link only | No |
| Transcription | Yes | Yes | N/A | No |
| Summaries | Yes | Yes | N/A | No |
| Insights | Yes | Yes | N/A | No |
| Wisdom feed | Yes | Yes | Display only | No |
| Call mode (TTS) | Yes | Yes | N/A | No |
| Chat mode | Yes | Yes | N/A | No |
| Wellbeing detection | Yes | Yes | N/A | No |
| SMS spending | No | Yes | N/A | No |
| App lock (PIN) | Yes | Yes | N/A | No |
| Notifications | Yes | Yes | N/A | No |
| Widgets | No | Yes (Mic + Wisdom) | N/A | No |

### Feature Gates (Free vs Pro)

| Feature | Free | Trial (14d) | Pro |
|---------|------|------------|-----|
| Voice recording | Unlimited | Unlimited | Unlimited |
| Manual entry | Unlimited | Unlimited | Unlimited |
| Summaries | 3/week | Unlimited | Unlimited |
| Insights (first gen) | 1/tab (free) | Unlimited | Unlimited |
| Insights (regen) | Paywalled | Unlimited | Unlimited |
| AI conversation | 1 session (free) | Unlimited | Unlimited |
| Wisdom feed | Full | Full | Full |
| Trackers | All | All | All |

---

## 12. Open Questions & Decision Log

### Open Questions

| # | Question | Context | Priority |
|---|---------|---------|----------|
| OQ-01 | Should edge functions validate JWT? | Currently no auth check — anyone with anon key can call AI APIs at our expense | **CRITICAL** |
| OQ-02 | Should we add model whitelisting and max_tokens caps to edge functions? | `claude` and `openai-image` accept arbitrary params | **CRITICAL** |
| OQ-03 | Should daily summaries use Haiku instead of Opus for text-only entries? | Currently Opus for all summaries; 75x cost difference | **HIGH** |
| OQ-04 | Should call mode implement streaming Claude responses? | Current non-streaming adds 500-1000ms perceived latency | **HIGH** |
| OQ-05 | Should SILENCE_MS be reduced from 1200ms to 800ms? | Affects call mode responsiveness | **MEDIUM** |
| OQ-06 | Should we add brute-force protection to PIN entry? | Currently unlimited retries | **LOW** |
| OQ-07 | Should the `@anthropic-ai/sdk` and `openai` npm packages be removed? | Dead weight in bundle (~500KB+) since all calls go through AIProxy | **MEDIUM** |
| OQ-08 | Should subscription status be periodically synced with RevenueCat? | Local cache can become stale if user cancels via App Store | **HIGH** |
| OQ-09 | Should insight snapshot history have a cap? | Currently unbounded; could exceed AsyncStorage limits after years | **MEDIUM** |
| OQ-10 | How should the app handle PIN recovery? | Currently no recovery; user must clear all data | **MEDIUM** |
| OQ-11 | Should the ElevenLabs voice list endpoint be proxied through an edge function? | Currently sends API key from client | **HIGH** |

### Decision Log

| Date | Decision | Rationale |
|------|---------|-----------|
| Pre-v1 | Local-first storage (AsyncStorage) | Privacy is a core value; no journal content on servers |
| Pre-v1 | Supabase Edge Functions as API proxy | Keep API keys server-side; minimize client secrets |
| Pre-v1 | Claude Opus for summaries | Required for vision (photo) support; not downgraded for text-only yet |
| Pre-v1 | 14-day free trial with soft gates | Let users experience full product before paywall; first use of each feature is always free |
| Pre-v1 | India-focused crisis resources | Primary user base is Indian; resources are India-specific |
| Pre-v1 | Hinglish Whisper prompt | Indian users code-switch Hindi/English; romanization prompt improves accuracy |
| Pre-v1 | Date-seeded wisdom shuffle | Deterministic within day prevents "reload for new content" behavior |
| Pre-v1 | ElevenLabs Flash v2.5 for TTS | Lowest latency model; acceptable quality for conversational use |
| Pre-v1 | 4-digit PIN (no biometrics) | Simple to implement; biometrics deferred |
| Pre-v1 | Bioluminescent jellyfish art theme | Brand identity; deep-ocean / inner-ocean metaphor |
| 2026-04 | Motivation drivers added to Who I Am | Enriches personality portrait; toward/away framework useful for coaching |
| 2026-04 | Intent-aware companion added | First conversation message classified into 6 intents for more relevant responses |

### Known Issues (from codebase audit)

| # | Issue | Severity | File |
|---|-------|----------|------|
| KI-01 | React hooks called conditionally (useSafeAreaInsets after early return) | **CRITICAL** | ChatScreen.tsx:457 |
| KI-02 | Timer leak on mic denial (setInterval not cleared) | **HIGH** | TalkScreen.tsx:551-605 |
| KI-03 | `today` memoized with empty deps never updates past midnight | **HIGH** | SummaryScreen.tsx:263 |
| KI-04 | Recursive handleTranscribeNow without queue guard | **MEDIUM** | HomeScreen.tsx:314 |
| KI-05 | Side-effect write during read in getSeenShortIds | **MEDIUM** | StorageService.ts:394 |
| KI-06 | O(n^2) byte-by-byte base64 encoding in ElevenLabs edge function | **HIGH** | elevenlabs-tts/index.ts:40 |
| KI-07 | Blocking detectIntent on first call turn | **HIGH** | TalkScreen.tsx:465 |
| KI-08 | PostHog flushAt:1 in production | **LOW** | AnalyticsService.ts:24 |
| KI-09 | DALL-E 3 at 1792x1024 for all summaries (2x cost vs 1024x1024) | **MEDIUM** | SummaryImageService.ts:25 |
| KI-10 | Android subscription link hardcoded to iOS App Store URL | **MEDIUM** | SettingsScreen.tsx:153 |

---

*End of document. Update this file whenever the product changes.*
