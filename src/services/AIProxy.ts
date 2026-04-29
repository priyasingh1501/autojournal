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
import { supabase } from './AuthService';

const SUPABASE_URL      = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

const AUDIO_BUCKET = 'audio-clips';

const BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Returns the user's session JWT if signed in, else the anon key. We prefer
 * the session token so edge functions and storage uploads carry the user's
 * identity (`auth.uid()` resolves server-side) and so the audio-clips bucket
 * — which now requires authenticated INSERT — accepts the upload.
 */
async function getAuthToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? SUPABASE_ANON_KEY;
  } catch {
    return SUPABASE_ANON_KEY;
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function callEdge<T>(fn: string, body: object, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await getAuthToken();
    const res = await fetch(`${BASE}/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[AIProxy/${fn}] HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`[AIProxy/${fn}] timeout after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Claude proxy — mirrors Anthropic SDK client.messages.create ───────────────

export const claudeProxy = {
  messages: {
    create: (params: object, options?: { timeoutMs?: number }) =>
      callEdge<any>('claude', params, options?.timeoutMs),
  },
};

// ── OpenAI image proxy — mirrors OpenAI SDK client.images.generate ────────────

export const openaiImageProxy = {
  images: {
    // DALL-E 3 routinely takes 30–60 s; the default 30 s timeout aborts mid-flight.
    generate: (params: object) => callEdge<any>('openai-image', params, 90_000),
  },
};

// ── Whisper transcription ─────────────────────────────────────────────────────

/**
 * Uploads the audio file to Supabase Storage, calls the openai-whisper edge
 * function with the storage path (tiny JSON payload), and returns the
 * transcribed text. The edge function deletes the file from Storage after
 * Whisper responds, so the file exists in Storage for only a few seconds.
 */
export async function transcribeAudio(uri: string): Promise<string> {
  const path = `clips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`;
  const token = await getAuthToken();

  // expo-file-system uploadAsync streams the file natively — no JS memory
  // pressure and no fetch(file://) issues on Android.
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'audio/m4a',
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`[AIProxy] Storage upload failed: ${uploadResult.status} ${uploadResult.body}`);
  }

  try {
    const data = await callEdge<{ text?: string }>('openai-whisper', { storage_path: path }, 90_000);
    return data.text?.trim() ?? '';
  } catch (err) {
    // Best-effort cleanup if the edge function call itself fails
    supabase.storage.from(AUDIO_BUCKET).remove([path]).catch(() => {});
    throw err;
  }
}

// ── Wisdom image upload ───────────────────────────────────────────────────────

/**
 * Uploads a locally-generated wisdom image to Storage via the
 * `wisdom-image-upload` edge function. The function uses service role to
 * bypass the bucket's RLS-layer quirks and also writes the public URL back
 * to `wisdom_shorts.image_url` in one round trip.
 */
export async function uploadWisdomImage(
  shortId: string,
  imageBase64: string,
): Promise<{ public_url: string }> {
  return callEdge<{ public_url: string }>(
    'wisdom-image-upload',
    { short_id: shortId, image_base64: imageBase64 },
    60_000,
  );
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

/**
 * Fetches the list of available ElevenLabs voices via the edge function,
 * keeping the API key server-side.
 */
export async function fetchVoices(): Promise<{ voices: any[] }> {
  return callEdge<{ voices: any[] }>('elevenlabs-tts', { action: 'list_voices' });
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
