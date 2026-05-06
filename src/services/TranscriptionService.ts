import { transcribeAudio as proxyTranscribe } from './AIProxy';

export async function transcribeAudio(audioUri: string): Promise<string> {
  return proxyTranscribe(audioUri);
}
