/**
 * StoryImageService
 *
 * Generates and locally caches bioluminescent DALL-E 3 images for the
 * three story card types: Current Chapter, Recurring Cast, and Arc Pattern.
 *
 * Uses the same deep-ocean visual language as WisdomImageService so the
 * aesthetic is consistent across the app.
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openaiImageProxy } from './AIProxy';

const CACHE_KEY_PREFIX = 'story_img_';
const IMAGE_DIR        = (FileSystem.documentDirectory ?? '') + 'story_images/';

// ── File system helpers ───────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export async function getCachedStoryImage(id: string): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY_PREFIX + id);
    if (!cached) return null;
    const info = await FileSystem.getInfoAsync(cached);
    if (!info.exists) {
      await AsyncStorage.removeItem(CACHE_KEY_PREFIX + id);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

// ── Generation ────────────────────────────────────────────────────────────────

export async function generateStoryImage(id: string, prompt: string): Promise<string | null> {
  try {
    await ensureDir();

    const response = await openaiImageProxy.images.generate({
      model:   'dall-e-3',
      prompt,
      size:    '1024x1024',
      quality: 'standard',
      n:       1,
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) return null;

    const safeName  = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const localPath = IMAGE_DIR + safeName + '.jpg';
    const result    = await FileSystem.downloadAsync(imageUrl, localPath);
    if (result.status !== 200) return null;

    await AsyncStorage.setItem(CACHE_KEY_PREFIX + id, localPath);
    return localPath;
  } catch {
    return null;
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

export function chapterImagePrompt(title: string, narrative: string): string {
  return (
    `A cinematic deep-ocean scene for a personal life chapter titled "${title}". ` +
    `${narrative.slice(0, 140)}. ` +
    `Dark abyssal waters, soft bioluminescent blues and teals, drifting particles of light, ` +
    `weightless and ethereal, symbolic underwater imagery, no text, no legible characters, masterpiece quality.`
  );
}

export function castImagePrompt(archetype: string): string {
  return (
    `A cinematic deep-ocean scene depicting the relational archetype: "${archetype.slice(0, 120)}". ` +
    `Symbolic bioluminescent forms — no literal faces or people, only abstract light and depth ` +
    `capturing the emotional essence. Dark abyssal waters, bioluminescent blues and teals, ` +
    `drifting light particles, no text, no legible characters, masterpiece quality.`
  );
}

const ARC_VISUAL: Record<string, string> = {
  Seeker:      'a lone bioluminescent creature following a distant light through the infinite abyss, always in motion toward the unknown',
  Builder:     'intricate coral-like bioluminescent structures growing from nothing in the deep, complexity emerging from darkness',
  Witness:     'a still luminous jellyfish floating in perfect silence, the ocean currents moving all around it while it simply observes',
  Transformer: 'a chrysalis dissolving into cascading bioluminescent light in deep water, old forms becoming radiant new shapes',
  Returner:    'spiraling ocean currents completing a full circle, bioluminescent trails tracing the return to origin',
};

export function arcImagePrompt(arcType: string): string {
  const visual = ARC_VISUAL[arcType]
    ?? 'a mysterious deep-ocean creature at the boundary between light and abyss';
  return (
    `A cinematic deep-ocean scene of ${visual}. ` +
    `Dark abyssal waters, soft bioluminescent blues and teals, drifting particles of light, ` +
    `weightless and ethereal, no text, no legible characters, masterpiece quality.`
  );
}

// ── Stable image IDs ──────────────────────────────────────────────────────────

function slug(s: string, maxLen = 36): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').slice(0, maxLen);
}

export function chapterImageId(title: string): string {
  return `chapter_${slug(title)}`;
}

export function castImageId(archetype: string): string {
  return `cast_${slug(archetype)}`;
}

export function arcImageId(arcType: string): string {
  return `arc_${arcType}`;
}
