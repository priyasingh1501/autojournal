import { openaiImageProxy } from './AIProxy';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Generates a unique bioluminescent jellyfish image for a daily summary
 * using DALL-E 3, downloads it to local storage and returns the file URI.
 * Returns null silently if image generation fails — summary is never blocked.
 */
export async function generateSummaryImage(
  date: string,
  _openaiApiKey: string,  // ignored — key is now server-side
): Promise<string | null> {
  try {
    // Resolved inside the function so documentDirectory is read at call-time, not module-load time
    const imageDir = `${FileSystem.documentDirectory}summary-images/`;

    const response = await openaiImageProxy.images.generate({
      model: 'dall-e-3',
      prompt:
        'A single bioluminescent jellyfish drifting through an infinite dark deep ocean, ' +
        'electric blue and cyan neon glow, intricate translucent tentacles with fine detail, ' +
        'deep navy to pure black background, soft scattered glowing orbs and particles, ' +
        'photorealistic, cinematic, no text, no people',
      n: 1,
      size: '1792x1024',
      quality: 'standard',
    });

    const url = response.data?.[0]?.url;
    if (!url) return null;

    // Ensure directory exists then download to a stable local path
    await FileSystem.makeDirectoryAsync(imageDir, { intermediates: true });
    const localPath = `${imageDir}${date}.jpg`;
    const { uri } = await FileSystem.downloadAsync(url, localPath);
    return uri;
  } catch {
    // Never block the summary on image failure
    return null;
  }
}

/**
 * Deletes the locally cached image for a given date, if it exists.
 */
export async function deleteSummaryImage(date: string): Promise<void> {
  try {
    const imageDir = `${FileSystem.documentDirectory}summary-images/`;
    const path = `${imageDir}${date}.jpg`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}
