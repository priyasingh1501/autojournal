# Auto Journal

An AI-powered voice journaling app that automatically records, transcribes, and summarizes your day.

## How It Works

1. Tap "Start Monitoring" — the app listens in the background using Voice Activity Detection (VAD)
2. When you speak, it automatically starts recording
3. When you stop speaking (2-second silence), it saves the audio and sends it to OpenAI Whisper for transcription
4. At the end of the day, tap "Generate Summary" — Claude analyzes all your transcripts and writes a thoughtful daily journal entry

## Tech Stack

- **Expo SDK ~51** (React Native + TypeScript)
- **expo-av** — audio recording and real-time metering (VAD)
- **OpenAI Whisper API** — speech-to-text transcription
- **Anthropic Claude API** (`claude-opus-4-6` with adaptive thinking) — daily summary generation
- **AsyncStorage** — local-only encrypted storage for transcripts and settings
- **React Navigation** — bottom tab navigation

---

## Setup Guide

### Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your iOS or Android device ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))

### Step 1 — Install Dependencies

```bash
cd "/Users/priyasingh/Documents/Auto journal"
npm install
```

### Step 2 — Get Your API Keys

**OpenAI API Key** (for Whisper transcription):
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

**Anthropic API Key** (for Claude summaries):
1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Click "Create Key"
3. Copy the key (starts with `sk-ant-`)

### Step 3 — Start the App

```bash
npx expo start
```

This opens the Expo Dev Tools in your browser and shows a QR code in the terminal.

### Step 4 — Open on Your Phone

- **iOS**: Open the Camera app and scan the QR code — it will open in Expo Go
- **Android**: Open the Expo Go app, tap "Scan QR code", and scan

### Step 5 — Configure API Keys

1. In the app, tap the **Settings** tab (gear icon)
2. Enter your **OpenAI API Key** in the first field
3. Enter your **Anthropic API Key** in the second field
4. Tap **Save Settings**

### Step 6 — Start Journaling

1. Go to the **Journal** tab (microphone icon)
2. Tap the large microphone button
3. Grant microphone permission when prompted
4. Start talking — the app will automatically record and transcribe your speech
5. At the end of the day, go to the **Summary** tab and tap "Generate Summary"

---

## App Screens

| Screen | Description |
|--------|-------------|
| Journal | Main screen — start/stop monitoring, see recent transcripts |
| Transcripts | Browse all transcripts by date |
| Summary | Generate and view AI daily summaries |
| Settings | Configure API keys and VAD sensitivity |

## VAD Settings

- **Threshold**: The dB level above which speech is detected. Default is -35 dB. Lower values (-55 dB) are more sensitive and will pick up quiet sounds; higher values (-25 dB) only capture loud speech.
- **Silence Timeout**: How long to wait after silence before ending a recording segment. Default is 2 seconds.

## Privacy

- All transcripts are stored **locally on your device** using AsyncStorage
- API keys never leave your device (they are used only for direct API calls)
- Audio files are deleted after transcription to save storage space
- No data is sent to any server other than OpenAI (Whisper) and Anthropic (Claude)

---

## Troubleshooting

**"Microphone permission denied"** — Go to your phone's Settings > Privacy > Microphone and enable it for Expo Go.

**"OpenAI API key not configured"** — Make sure you've saved your API keys in the Settings tab.

**App not detecting speech** — Try lowering the VAD threshold in Settings (e.g., from -35 to -45 dB).

**Transcription errors** — Ensure you have an active internet connection and your OpenAI API key has available credits.
