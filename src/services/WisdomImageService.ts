/**
 * WisdomImageService
 *
 * Handles:
 *  1. Auto-filling metadata (pullquote, themes, depth, image prompt, etc.) for
 *     user-created Wisdom Shorts via Claude — only title + body required from
 *     the user.
 *  2. Generating luminous-surreal DALL-E 3 images for each short and caching
 *     them in the device's local file system so subsequent loads are instant.
 */

import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openaiImageProxy, claudeProxy } from './AIProxy';
import { StorageService } from './StorageService';
import { WisdomShort } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const IMAGE_CACHE_KEY = 'wisdom_img_'; // prefix + shortId
const IMAGE_DIR = (FileSystem.documentDirectory ?? '') + 'wisdom_images/';

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

    const prompt = short.imagePrompt ?? buildAutoPrompt(short);

    console.log('[WisdomImage] Generating image for:', short.id, '\nPrompt:', prompt);

    const response = await openaiImageProxy.images.generate({
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });

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
    return localPath;
  } catch (err) {
    console.error('[WisdomImage] Generation failed for:', short.id, err);
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

/** Returns local URI from cache if it still exists on disk, otherwise null. */
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

/** Builds a DALL-E prompt from a short's fields when none is stored. */
function buildAutoPrompt(short: WisdomShort): string {
  const t1 = short.themes[0] ?? 'wisdom';
  const t2 = short.themes[1] ? ` and ${short.themes[1]}` : '';
  return (
    `A luminous surreal digital painting embodying the idea: "${short.title}". ` +
    `Themes of ${t1}${t2}. ` +
    `Warm golden amber light, ethereal dreamlike atmosphere, symbolic imagery, ` +
    `cinematic depth, no text, no legible letters, masterpiece quality.`
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
  _apiKey: string,  // ignored — key is now server-side
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
  "imagePrompt": "A luminous surreal digital painting of [visual metaphor for this insight]. Warm golden amber light, ethereal dreamlike atmosphere, symbolic and cinematic, no text, no faces, masterpiece quality."
}

Field rules:
- pullquote: extract verbatim from body; must be striking and standalone
- themes: 2–4 lowercase tags (e.g. "identity", "control", "acceptance")
- emotional_states: 1–3 from: anxious, overwhelmed, stuck, lonely, comparing, burned-out, self-critical, hopeless, restless, angry, unfulfilled, disconnected, purposeless, conflicted, performing
- cognitive_patterns: 1–2 from: rumination, perfectionism, all-or-nothing, catastrophizing, comparison, avoidance, people-pleasing
- values: 2–3 lowercase (e.g. "freedom", "authenticity", "courage")
- enneagram_resonance: 1–3 numbers 1–9
- depth: "entry" (light), "mid" (reflective), or "deep" (existential)
- imagePrompt: vivid visual metaphor, luminous surreal style, warm golden/amber tones, no text, no readable characters

Return ONLY the JSON.`;

  const response = await claudeProxy.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

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
