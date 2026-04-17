# untangle — Product Features

*Last updated: April 2026*

---

## Overview

**untangle** is a voice-first micro-journaling app for Android (APK) and iOS. It captures your thoughts through voice or text, surfaces AI-generated summaries and insights, and offers a curated wisdom feed — all with your data stored locally on-device. An account is required only for billing identity; your journal never leaves your phone.

---

## 1. Voice & Text Journaling

### Recording
- **Tap-to-record** with three states: idle, monitoring, and actively recording
- **Voice Activity Detection (VAD)** — automatically detects when you start and stop speaking; no need to manually stop recording
- **Configurable sensitivity** — four VAD threshold presets (-55, -45, -35, -25 dB) to tune how quiet or loud the environment can be
- **Configurable silence timeout** — 1.0s, 1.5s, 2.0s, or 3.0s before the clip is closed after you stop speaking
- **Manual text entry** — type a note directly when you don't want to speak
- **Photo attachments** — attach a photo from your camera or library to any note (JPEG, PNG, WEBP, HEIC supported)

### Transcription
- Clips are transcribed using **Whisper** via a batch queue so multiple short recordings are grouped efficiently
- **Pending clip queue** — if the app is backgrounded mid-transcription, clips are saved and retried automatically the next time the app comes to the foreground
- Transcripts are stored locally with their timestamp, duration, and any attached photo

### Compose Modal
- Full note editor available from the home screen
- Supports text + photo in a single entry
- In **edit mode**: change the date (moves the entry to a different day and regenerates affected summaries), update text, swap or remove the photo

---

## 2. Daily Summaries

Each day's notes are automatically compiled into a structured daily summary.

### Auto-generation
- Summary is generated **5 minutes after your last note** of the day (debounced — new notes reset the timer)
- Also generated on the **morning of the next day** when you open the app, if it wasn't generated the night before
- Uses **Claude Opus** with vision support (photos in your notes are included)
- Free plan: **3 summaries per week**. Pro: unlimited

### Summary sections
Each summary includes whichever of the following are relevant to your notes:
| Section | What it captures |
|---|---|
| Thoughts & Reflections | Emotional and reflective content |
| Ideas & Plans | Creative ideas, goals, to-dos |
| Learnings | Things you read, heard, or realised |
| Meals & Food | What you ate, drinks, nutrition notes |
| Spends & Expenses | Purchases, financial notes |
| Health & Fitness | Workouts, steps, physical wellbeing |
| Meditation & Mindfulness | Meditation sessions, breathing notes |
| Tasks & Decisions | Decisions made, tasks completed |
| Highlights | Notable moments from the day |

### Emotional check-in
- Each summary includes a **mood analysis** derived from the tone of your notes
- Estimated **daily macros** (calories, protein, carbs, fat) if food was mentioned

### Reflection
- After a conversation with an AI mind, a short reflection is saved back to the day's summary
- Displayed in the summary card in normal weight text

### Summary artwork
- A unique **jellyfish illustration** is AI-generated for each day's summary

### Navigation
- Browse summaries day-by-day using previous/next arrows
- Jump directly to any note mentioned in the summary

---

## 3. Transcript Manager

A full archive of every note you've ever made.

- **Full-text search** across all entries
- Grouped by date (newest first) in a section list
- Entry types: voice recording, manual note, pending clip
- **Inline editing** — tap any entry to edit its text, photo, or date
- **Move entries** between days via a date picker
- **Bulk delete** — selection mode to remove multiple entries at once
- **Delete entire days** — remove all entries for a given date
- Emotion tags displayed per entry
- Recording duration shown for voice clips

---

## 4. Insights

Four AI-generated insight tabs that build a psychological portrait from your journal over time. All insights require a minimum number of entries and have a staleness window — they don't refresh on every open.

### Tab 1 — Who I Am
*Minimum: 20 entries or 30 days since last generation*

- **Big Five personality dimensions** — scored on Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
- **Enneagram mapping** — primary type with supporting evidence from your writing
- **Character portrait** — a short second-person narrative of who you are based on your language patterns
- **Motivation pulse** — what moves you toward things and what you avoid (6 drivers, 3 each direction), with direction indicators (rising / stable / falling)
- **Self-labels** — recurring identity statements extracted from your writing ("I am…", "I tend to…")

### Tab 2 — Values
*Minimum: 10 entries or 14 days since last generation*

- **Values constellation** — 6–10 core topics scored by frequency and emotional intensity
- **Stated vs. actual divergence** — flags where what you say you care about differs from where your attention actually goes
- **Motivation style** — classification across four axes: achievement, connection, meaning, safety
- Topics are tagged positive, neutral, negative, or mixed
- **Divergence flags are shown first** — the most actionable insight is the headline

### Tab 3 — Thinking
*Minimum: 25 entries or 30 days since last generation*

- **Decision style** — e.g. "analytical deliberator", "intuition-first", with supporting evidence
- **Blind spots** — cognitive bias patterns detected in your reasoning
- **From idea to action** — execution pattern analysis: starts/finishes ratio, consistency score, planning-to-action ratio
- **Cognitive style map** — four-dimension radar built from voice vs. written evidence:
  - Systems thinking vs. Story thinking
  - Zoomed in vs. Zoomed out
  - Resolves things vs. Sits with things
  - Internal reference vs. External reference
- **Patterns you keep returning to** — recurring thought loops that appear across multiple days
- **Stories you keep telling** — narrative patterns from your Story tab surfaced here

### Tab 4 — Story
*Minimum: 30 entries or 30 days since last generation*

- **Life arc type** — one of: Seeker, Builder, Witness, Transformer, Returner
- **Current chapter** — a named chapter with date range and theme
- **Recurring cast** — unnamed archetypes that recur in your writing (e.g. "the challenger", "the supporter"), with interaction style and conflict pattern
- **Arc history** — last 6 arc transitions charted over time

### Insight freshness
- Each tab shows a **freshness badge** indicating when it was last generated
- Manual **refresh button** per tab (gated by entry count threshold to prevent empty re-runs)
- All tabs show parse-safe retry: if the AI response is truncated, it automatically retries with a concise prompt

---

## 5. Wisdom Shorts

A curated feed of short, meaningful ideas drawn from philosophy, psychology, and lived experience.

### Feed
- **Swipe-based browsing** — horizontal FlatList with paged navigation
- **150+ bundled shorts** plus a remote library synced from Supabase
- **Daily rotation** — seeded by date so the order is stable throughout the day and refreshes each morning
- **Seen tracking** — prevents shorts you've already read from dominating the feed

### Mood-based curation
- **Mood picker** — 15 emotions to choose from (anxious, overwhelmed, stuck, lonely, comparing, burned-out, self-critical, hopeless, restless, angry, unfulfilled, disconnected, purposeless, conflicted, performing)
- Your mood selection re-ranks the feed to surface the most relevant shorts
- **Journal signal** — if no mood is manually selected, the feed draws on the emotional tone of your last summary (refreshes every 24 hours)

### Interactions per short
- **Save** — bookmark a short to your saved collection
- **Reflect** — open a text modal to write a reflection; saved as a journal entry
- **Share** — copy to clipboard or use the system share sheet
- Toggle between **All** and **Saved** view

---

## 6. AI Conversations

Two modes for talking with an AI: voice call and text chat.

### Call mode (TalkScreen)
- Real-time voice conversation using your microphone
- Distress detection runs on each turn (see Wellbeing section)
- Post-call reflection generated automatically and saved to your day's summary

### Chat mode (ChatScreen)
- Text-based conversation
- Context-aware: your goals, monthly insight, Who I Am, and Values data are injected
- Reflection generated on close and saved to the day's summary

### AI Minds
Choose the mind you want to talk with:

| Mind | Era / Tradition |
|---|---|
| Untangle Companion | Default AI |
| Aristotle | Ancient Greece |
| Socrates | Ancient Greece |
| Marcus Aurelius | Stoicism |
| Buddha | Buddhism |
| Rumi | Sufi mysticism |
| Simone Weil | Christian mysticism |
| Pema Chödrön | Tibetan Buddhism |
| Frida Kahlo | Modern art |
| Audre Lorde | Feminist theory |
| Jesus Christ | Christian tradition |
| Anna Karenina | Literary |

Each mind has a distinct voice, opening message, and philosophical frame.

---

## 7. Wellbeing & Distress Detection

untangle monitors emotional patterns in your writing and gently checks in when it notices you might need support.

### Three-tier system
| Tier | Trigger | Response |
|---|---|---|
| 1 — Normal | Standard entry | No action |
| 2 — Sustained low | Multiple low-mood entries across several days | Gentle check-in modal |
| 3 — Acute | Single entry with acute distress signals (confirmed by a second model pass) | Crisis pause modal |

### Check-in modals
- **Tier 2**: Warm check-in asking how you're doing — options to "talk about it" (opens conversation) or "continue journaling"
- **Tier 2 follow-up**: A connection question and the top 2 crisis resources
- **Tier 3**: A more direct pause with warm messaging and all crisis resources
- **Re-entry check-in**: If your last session was Tier 2/3, you're gently asked how you're doing when you next open the app

### Crisis resources (India-focused)
- iCall — 9152987821
- Vandrevala Foundation — 1860-2662-345
- Snehi — 044-24640050
- IASP Crisis Centres directory

### Privacy
- All pattern detection happens **on-device** using your journal data only
- Nothing is shared externally
- Can be toggled off entirely in Settings

---

## 8. Trackers

Four optional life trackers that appear in your home card and feed into your summaries:

| Tracker | What gets tracked |
|---|---|
| Meals & Nutrition | Food entries, macro estimates |
| Workout & Movement | Exercise notes, activity |
| Meditation | Meditation sessions |
| Spending | Purchases, expenses |

- Each tracker can be **toggled on/off independently** in Settings
- Changes apply immediately — disabled trackers are excluded from summaries and the home card
- **Expense extraction** runs automatically on text entries and photo OCR when the Spending tracker is on

---

## 9. App Lock

- Set a **4-digit PIN** to protect your journal
- PIN is required on every app launch and every time you return from the background
- Change PIN option available when a PIN is active
- Disable PIN with a confirmation prompt
- Numeric keypad with **shake animation** on incorrect entry

---

## 10. Authentication

### Sign up
- Name, email, password (minimum 6 characters)
- Supabase-backed auth
- **Email verification** required — a confirmation link is sent to your inbox
- The app listens in the background and opens automatically once you click the link
- **Resend email** button with a 30-second cooldown

### Sign in
- Email + password
- **Forgot password** — enter your email to receive a reset link; "Check your inbox" confirmation screen shown after sending

### Sign out
- Available in Settings under the Account section
- Displays your current email address
- Clears your billing session (RevenueCat) on sign out

---

## 11. Subscription & Billing

- Powered by **RevenueCat** with Supabase user ID mapping (billing is always tied to your account)
- **Free plan**: 3 AI summaries per week, basic features
- **Trial**: Full Pro access for a limited period with countdown display
- **Pro plan**: Unlimited summaries, all insight tabs after first generation, full wisdom library

Plans can be managed via the App Store (iOS) or Google Play (Android).

---

## 12. Android Widget

- **Mic widget** — place on your home screen for one-tap journaling without opening the app
- Tapping the widget deeplinks to the Journal tab and starts monitoring
- A **compose shortcut** (`untangle://compose`) opens the note editor directly
- Widget state stays in sync with the app (reflects current monitoring/recording state)

---

## 13. Notifications

- **Nightly summary notification** — notifies you when your daily summary is ready
- Tapping the notification navigates directly to the Summary tab
- Notification channel configured on first launch (Android)

---

## 14. Monthly Home Card

- Displayed at the top of the home feed
- Shows a rolling monthly insight: recurring themes, emotional patterns, and highlights from the past 30 days
- Content persists during refresh (no blank flash while updating)
- Links to relevant daily entries

---

## 15. Onboarding

A 7-step first-launch flow:
1. **Welcome** — animated entrance with the untangle wordmark
2. **Micro-journal** — explains voice capture and auto-transcription
3. **Summaries** — explains daily digest generation
4. **Insights** — explains the four insight tabs
5. **Wisdom Shorts** — explains the curated feed
6. **Microphone permission** — OS permission request (skippable)
7. **All set** — feature checklist and "Start journaling" CTA

---

## Design Language

- **Dark ocean theme** — deep navy backgrounds, light blue text, jellyfish imagery
- **Typography** — Baskerville (serif) for headers and brand moments; GillSans-Light for all body text
- **Glassmorphism** — frosted-glass modals and cards with subtle borders
- **Colour palette**:
  - Background: `#02060E`
  - Primary blue: `rgba(9, 41, 173, …)`
  - Text: `rgba(224, 242, 254, …)` (near-white)
  - Accent: `rgba(152, 212, 250, …)` (pale blue)
  - Error/destructive: `rgba(252, 165, 165, …)`
- **Motion** — pulsing glow on the recording button, shake on PIN error, fade-in on onboarding welcome
- **Safe area aware** — correct padding on notched and gesture-navigation devices
