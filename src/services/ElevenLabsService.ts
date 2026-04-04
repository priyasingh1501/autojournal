import * as FileSystem from 'expo-file-system/legacy';
import { synthesizeSpeech as proxySynthesize } from './AIProxy';

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
  _apiKey: string,  // ignored — key is now server-side
): Promise<string> {
  const base64 = await proxySynthesize(voiceId, text);
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('Cache directory unavailable');
  const uri = `${dir}el_tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
