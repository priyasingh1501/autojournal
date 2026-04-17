import * as FileSystem from 'expo-file-system/legacy';
import { synthesizeSpeech as proxySynthesize, fetchVoices } from './AIProxy';

export interface ELVoice {
  voice_id: string;
  name: string;
  category: string; // 'premade' | 'cloned' | 'generated' etc.
}

// ── Fetch available voices (server-side proxied — API key never leaves the server) ──
export async function fetchElevenLabsVoices(_apiKey?: string): Promise<ELVoice[]> {
  const data = await fetchVoices();
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
