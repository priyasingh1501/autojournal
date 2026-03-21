import OpenAI from 'openai';
import * as FileSystem from 'expo-file-system';

const IMAGE_DIR = `${FileSystem.documentDirectory}summary-images/`;

/**
 * Generates a unique bioluminescent jellyfish image for a daily summary
 * using DALL-E 3, downloads it to local storage and returns the file URI.
 * Returns null silently if image generation fails — summary is never blocked.
 */
export async function generateSummaryImage(
  date: string,
  openaiApiKey: string,
): Promise<string | null> {
  try {
    const client = new OpenAI({
      apiKey: openaiApiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.images.generate({
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

    const url = response.data[0]?.url;
    if (!url) return null;

    // Ensure directory exists then download to a stable local path
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
    const localPath = `${IMAGE_DIR}${date}.jpg`;
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
    const path = `${IMAGE_DIR}${date}.jpg`;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}
