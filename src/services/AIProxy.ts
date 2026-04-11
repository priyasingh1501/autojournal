/**
 * AIProxy — routes all AI calls through Supabase Edge Functions.
 *
 * API keys (Anthropic, OpenAI, ElevenLabs) are stored as Supabase secrets
 * server-side and never embedded in the app binary.
 *
 * Drop-in interface mirrors the SDK clients used previously so service
 * files require minimal changes.
 */

import * as FileSystem from 'expo-file-system/legacy';
const SUPABASE_URL      = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

const BASE = `${SUPABASE_URL}/functions/v1`;
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function callEdge<T>(fn: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[AIProxy/${fn}] HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Claude proxy — mirrors Anthropic SDK client.messages.create ───────────────

export const claudeProxy = {
  messages: {
    create: (params: object) => callEdge<any>('claude', params),
  },
};

// ── OpenAI image proxy — mirrors OpenAI SDK client.images.generate ────────────

export const openaiImageProxy = {
  images: {
    generate: (params: object) => callEdge<any>('openai-image', params),
  },
};

// ── Whisper transcription ─────────────────────────────────────────────────────

/**
 * Reads the audio file at `uri`, base64-encodes it, and sends it to the
 * openai-whisper edge function. Returns the transcribed text.
 */
export async function transcribeAudio(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const data = await callEdge<{ text?: string }>('openai-whisper', {
    audio_base64: base64,
    filename: 'audio.m4a',
  });
  return data.text?.trim() ?? '';
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

/**
 * Sends text to the elevenlabs-tts edge function and returns the
 * synthesised audio as a base64-encoded mp3 string.
 */
export async function synthesizeSpeech(
  voiceId: string,
  text: string,
  voiceSettings?: VoiceSettings,
): Promise<string> {
  const data = await callEdge<{ audio: string }>('elevenlabs-tts', {
    voice_id: voiceId,
    text,
    voice_settings: voiceSettings,
  });
  return data.audio;
}
