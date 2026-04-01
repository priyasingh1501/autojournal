import * as FileSystem from 'expo-file-system/legacy';

const BASE = 'https://api.elevenlabs.io/v1';

export interface ELVoice {
  voice_id: string;
  name: string;
  category: string; // 'premade' | 'cloned' | 'generated' etc.
}

// ── Fetch available voices ────────────────────────────────────────────────────
export async function fetchElevenLabsVoices(apiKey: string): Promise<ELVoice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices error: ${res.status}`);
  const data = await res.json();
  return (data.voices as any[]).map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category ?? 'premade',
  }));
}

// ── Synthesize text → local .mp3 URI ─────────────────────────────────────────
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<string> {
  // mp3_22050_32 → ~4× smaller file than default 44100/128, still clear for voice
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',  // fastest EL model (~3× faster than turbo_v2)
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0,                      // style processing adds latency; 0 = skip it
        use_speaker_boost: false,      // extra DSP pass; not needed for conversation
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`ElevenLabs TTS error: ${err}`);
  }

  // Write audio bytes directly to a temp file via ArrayBuffer (FileReader is browser-only)
  const arrayBuffer = await res.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('Cache directory unavailable');
  const uri = `${dir}el_tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uri;
}
