/**
 * WisdomImageService
 *
 * Handles:
 *  1. Auto-filling metadata (pullquote, themes, depth, image prompt, etc.) for
 *     user-created Wisdom Shorts via Claude — only title + body required from
 *     the user.
 *  2. Generating deep-ocean bioluminescent DALL-E 3 images for each short and caching
 *     them in the device's local file system so subsequent loads are instant.
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openaiImageProxy, claudeProxy, uploadWisdomImage } from './AIProxy';
import { StorageService } from './StorageService';
import { fetchShortImageUrl } from './SupabaseService';
import { supabase } from './AuthService';
import { WisdomShort } from '../types';
import { track } from './AnalyticsService';

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_CACHE_KEY = 'wisdom_img_'; // prefix + shortId → local path
const IMAGE_DIR       = (FileSystem.documentDirectory ?? '') + 'wisdom_images/';

// ── Generation queue (one image at a time, no stampede) ───────────────────────

type QueueEntry = { short: WisdomShort; resolve: (uri: string | null) => void };
let _queue: QueueEntry[] = [];
let _running = false;
const _inFlight = new Set<string>(); // short IDs currently being generated

async function _processQueue(): Promise<void> {
  if (_running) return;
  _running = true;

  while (_queue.length > 0) {
    const entry = _queue.shift()!;
    const uri = await _generateNow(entry.short);
    entry.resolve(uri);
  }

  _running = false;
}

/** Internal: actually calls DALL-E and caches. No queue logic here. */
async function _generateNow(short: WisdomShort): Promise<string | null> {
  try {
    await ensureImageDir();

    // Before spending a DALL-E credit, check if another device already uploaded
    // this image to Supabase. If so, download it and cache locally.
    const remoteUrl = await fetchShortImageUrl(short.id);
    if (remoteUrl) {
      console.log('[WisdomImage] Found existing Supabase image for:', short.id);
      const safeName = short.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const localPath = IMAGE_DIR + safeName + '.jpg';
      const result = await FileSystem.downloadAsync(remoteUrl, localPath);
      if (result.status === 200) {
        await AsyncStorage.setItem(IMAGE_CACHE_KEY + short.id, localPath);
        console.log('[WisdomImage] Cached remote image for:', short.id);
        return localPath;
      }
      // Download failed — fall through to generation
    }

    const storedPrompt = short.imagePrompt ?? buildAutoPrompt(short);

    console.log('[WisdomImage] Generating image for:', short.id, '\nPrompt:', storedPrompt);

    const callDallE = (prompt: string) => openaiImageProxy.images.generate({
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });

    const isSafetyError = (msg: string) =>
      msg.includes('safety') || msg.includes('content_policy') || msg.includes('rejected') ||
      (msg.includes('400') && !msg.includes('429'));

    let response: any;
    try {
      response = await callDallE(storedPrompt);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (isSafetyError(msg)) {
        // Content-policy rejection — retry once with a generic prompt that avoids
        // names or content that may trigger the safety filter.
        const fallbackPrompt = buildAutoPrompt(short);
        console.warn('[WisdomImage] Safety rejection for', short.id, '— retrying with fallback prompt');
        response = await callDallE(fallbackPrompt);
      } else {
        // Transient failure (timeout, 429, 5xx, network) — single retry after backoff.
        console.warn('[WisdomImage] Transient failure for', short.id, '— retrying once:', msg);
        await new Promise(r => setTimeout(r, 1500));
        response = await callDallE(storedPrompt);
      }
    }

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      console.warn('[WisdomImage] DALL-E returned no URL for:', short.id);
      return null;
    }

    const safeName = short.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const localPath = IMAGE_DIR + safeName + '.jpg';
    const result = await FileSystem.downloadAsync(imageUrl, localPath);
    if (result.status !== 200) {
      console.warn('[WisdomImage] Download failed (status', result.status, ') for:', short.id);
      return null;
    }

    await AsyncStorage.setItem(IMAGE_CACHE_KEY + short.id, localPath);
    console.log('[WisdomImage] Cached image for:', short.id, '→', localPath);

    // Upload to Supabase Storage so all other devices get this image for free
    _uploadToSupabase(short.id, localPath).catch(err =>
      console.warn('[WisdomImage] Supabase upload failed for', short.id, err),
    );

    return localPath;
  } catch (err: any) {
    console.error('[WisdomImage] Generation failed for:', short.id, err);
    track('wisdom_image_failed', { short_id: short.id, reason: err?.message ?? String(err) });
    return null;
  }
}

// ── File system helpers ───────────────────────────────────────────────────────

async function ensureImageDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

/** Returns the local cached file URI for a short, or null if not cached. */
export async function getCachedImageUri(shortId: string): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(IMAGE_CACHE_KEY + shortId);
    if (!cached) return null;
    const info = await FileSystem.getInfoAsync(cached);
    if (!info.exists) {
      await AsyncStorage.removeItem(IMAGE_CACHE_KEY + shortId);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

/**
 * Upload a locally generated image to Supabase Storage and update the
 * wisdom_short's image_url so every other device gets it without regenerating.
 * Fire-and-forget — caller should .catch() any errors.
 */
async function _uploadToSupabase(shortId: string, localPath: string): Promise<void> {
  // Routes through the `wisdom-image-upload` edge function (service role) because
  // the `wisdom-images` bucket rejects anon INSERT with "new row violates RLS"
  // even with correct role-scoped policies — some hidden bucket state blocks it.
  // The edge function uploads + updates wisdom_shorts.image_url in one call.
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { public_url } = await uploadWisdomImage(shortId, base64);
  console.log('[WisdomImage] Uploaded to Supabase:', shortId, '→', public_url);
}

/**
 * Walks the device's local wisdom-image cache and uploads every image to
 * Supabase Storage (+ sets image_url on the corresponding wisdom_shorts row)
 * that isn't already persisted server-side.
 *
 * Used as a one-shot backfill after RLS write policies were added — prior to
 * that fix, on-device generations only lived in the local cache.
 *
 * Reports running progress via the optional `onProgress` callback.
 */
export async function backfillCachedImagesToSupabase(
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: number; skipped: number; failed: number; total: number; firstError?: string }> {
  const allKeys = await AsyncStorage.getAllKeys();
  const imgKeys = allKeys.filter(k => k.startsWith(IMAGE_CACHE_KEY));

  let uploaded = 0;
  let skipped  = 0;
  let failed   = 0;
  let firstError: string | undefined;

  for (let i = 0; i < imgKeys.length; i++) {
    const key     = imgKeys[i];
    const shortId = key.slice(IMAGE_CACHE_KEY.length);
    onProgress?.(i, imgKeys.length);

    try {
      const localPath = await AsyncStorage.getItem(key);
      if (!localPath) { skipped++; continue; }

      const info = await FileSystem.getInfoAsync(localPath);
      if (!info.exists) { skipped++; continue; }

      // Skip if Supabase already has this image (don't re-upload)
      const existing = await fetchShortImageUrl(shortId);
      if (existing) { skipped++; continue; }

      await _uploadToSupabase(shortId, localPath);
      uploaded++;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.warn('[WisdomImage] Backfill failed for', shortId, msg);
      if (!firstError) firstError = `${shortId}: ${msg}`;
      failed++;
    }
  }

  onProgress?.(imgKeys.length, imgKeys.length);
  return { uploaded, skipped, failed, total: imgKeys.length, firstError };
}

/**
 * Deletes every cached wisdom image from disk and AsyncStorage.
 * Returns the number of bytes freed (best-effort; 0 if filesystem info unavailable).
 */
export async function clearImageCache(): Promise<number> {
  let freed = 0;
  try {
    const info = await FileSystem.getInfoAsync(IMAGE_DIR);
    if (info.exists && 'size' in info) freed = (info as any).size ?? 0;
    await FileSystem.deleteAsync(IMAGE_DIR, { idempotent: true });
  } catch { /* ignore */ }

  // Clear all AsyncStorage cache keys
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const imgKeys = allKeys.filter(k => k.startsWith(IMAGE_CACHE_KEY));
    if (imgKeys.length > 0) await AsyncStorage.multiRemove(imgKeys);
  } catch { /* ignore */ }

  return freed;
}

/** Builds a DALL-E prompt from a short's fields when none is stored. */
function buildAutoPrompt(short: WisdomShort): string {
  const t1 = short.themes[0] ?? 'wisdom';
  const t2 = short.themes[1] ? ` and ${short.themes[1]}` : '';
  return (
    `A cinematic deep-ocean scene embodying the idea: "${short.title}". ` +
    `Themes of ${t1}${t2}. ` +
    `Dark abyssal waters, soft bioluminescent blues and teals, drifting particles of light, ` +
    `weightless and ethereal, symbolic underwater imagery, no text, no legible letters, masterpiece quality.`
  );
}

/**
 * Queues DALL-E 3 image generation for the short.
 * Only one image is generated at a time to avoid rate-limit stampedes.
 * Returns the local file URI on success, or null on any error.
 */
export async function generateAndCacheImage(short: WisdomShort): Promise<string | null> {
  // Skip if already in-flight for this short
  if (_inFlight.has(short.id)) {
    return new Promise(resolve => {
      _queue.push({ short, resolve });
      _processQueue();
    });
  }

  _inFlight.add(short.id);
  return new Promise(resolve => {
    _queue.push({
      short,
      resolve: (uri) => {
        _inFlight.delete(short.id);
        resolve(uri);
      },
    });
    _processQueue();
  });
}

// ── Startup pre-warm ──────────────────────────────────────────────────────────

/**
 * Checks the first `count` shorts in the given ordered list and queues image
 * generation for any that don't already have a cached local image.
 * Fire-and-forget — never throws, never blocks app startup.
 */
export async function prewarmWisdomImages(
  shorts: WisdomShort[],
  count = 5,
): Promise<void> {
  try {
    const targets = shorts.slice(0, count);
    for (const short of targets) {
      const cached = await getCachedImageUri(short.id);
      if (!cached) {
        // Queue generation — existing queue ensures one-at-a-time, no stampede
        generateAndCacheImage(short).catch(() => {});
      }
    }
  } catch {
    // Never block startup
  }
}

// ── Metadata auto-fill ────────────────────────────────────────────────────────

export interface AutoFilledMeta {
  pullquote: string;
  source_author: string;
  source_type: WisdomShort['source_type'];
  themes: string[];
  emotional_states: string[];
  cognitive_patterns: string[];
  values: string[];
  enneagram_resonance: number[];
  depth: WisdomShort['depth'];
  imagePrompt: string;
}

/**
 * Given only a title and body, calls Claude to generate all remaining
 * WisdomShort metadata fields plus a DALL-E image prompt.
 */
export async function autoFillShortMetadata(
  title: string,
  body: string,
): Promise<AutoFilledMeta> {
  const systemPrompt =
    'You are a wisdom-short curator and metadata expert. ' +
    'Return ONLY a valid JSON object — no explanation, no markdown fences.';

  const userPrompt = `Title: ${title}
Body: ${body}

Generate metadata for this wisdom short. Return a JSON object with EXACTLY these fields:
{
  "pullquote": "The single most impactful sentence from the body (≤ 20 words, verbatim)",
  "source_author": "Personal Reflection",
  "source_type": "essay",
  "themes": ["theme1", "theme2"],
  "emotional_states": ["state1", "state2"],
  "cognitive_patterns": ["pattern1"],
  "values": ["value1", "value2"],
  "enneagram_resonance": [4, 9],
  "depth": "mid",
  "imagePrompt": "A cinematic deep-ocean scene of [visual metaphor for this insight]. Dark abyssal waters, soft bioluminescent blues and teals, drifting particles of light, weightless and ethereal, no text, no faces, masterpiece quality."
}

Field rules:
- pullquote: extract verbatim from body; must be striking and standalone
- themes: 2–4 lowercase tags (e.g. "identity", "control", "acceptance")
- emotional_states: 1–3 from: anxious, overwhelmed, stuck, lonely, comparing, burned-out, self-critical, hopeless, restless, angry, unfulfilled, disconnected, purposeless, conflicted, performing
- cognitive_patterns: 1–2 from: rumination, perfectionism, all-or-nothing, catastrophizing, comparison, avoidance, people-pleasing
- values: 2–3 lowercase (e.g. "freedom", "authenticity", "courage")
- enneagram_resonance: 1–3 numbers 1–9
- depth: "entry" (light), "mid" (reflective), or "deep" (existential)
- imagePrompt: vivid visual metaphor, cinematic deep-ocean style, dark abyssal waters with bioluminescent blues and teals, no text, no readable characters

Return ONLY the JSON.`;

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  });

  const raw = response.content?.[0]?.type === 'text' ? (response.content[0] as any).text.trim() : '';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned unexpected response format.');

  const parsed = JSON.parse(jsonMatch[0]) as Partial<AutoFilledMeta>;

  return {
    pullquote:           parsed.pullquote           ?? title,
    source_author:       parsed.source_author       ?? 'Personal Reflection',
    source_type:         parsed.source_type         ?? 'essay',
    themes:              Array.isArray(parsed.themes)             ? parsed.themes             : [],
    emotional_states:    Array.isArray(parsed.emotional_states)   ? parsed.emotional_states   : [],
    cognitive_patterns:  Array.isArray(parsed.cognitive_patterns) ? parsed.cognitive_patterns : [],
    values:              Array.isArray(parsed.values)             ? parsed.values             : [],
    enneagram_resonance: Array.isArray(parsed.enneagram_resonance)
      ? parsed.enneagram_resonance.filter((n): n is number => typeof n === 'number')
      : [],
    depth:        (['entry', 'mid', 'deep'] as const).includes(parsed.depth as any)
      ? (parsed.depth as WisdomShort['depth'])
      : 'mid',
    imagePrompt: parsed.imagePrompt ?? buildAutoPrompt({ title, themes: parsed.themes ?? [] } as WisdomShort),
  };
}
