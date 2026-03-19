import { StorageService } from './StorageService';

export async function transcribeAudio(audioUri: string): Promise<string> {
  const settings = await StorageService.getSettings();
  if (!settings?.openaiApiKey) {
    throw new Error('OpenAI API key not configured. Go to Settings.');
  }

  // React Native's FormData supports { uri, type, name } objects directly —
  // no need to fetch/blob the local file URI first.
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  });

  if (!whisperResponse.ok) {
    const error = await whisperResponse.text();
    throw new Error(`Whisper API error: ${error}`);
  }

  const data = await whisperResponse.json();
  return data.text?.trim() ?? '';
}
