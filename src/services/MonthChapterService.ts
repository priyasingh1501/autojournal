/**
 * MonthChapterService — turns an archived PatternsReport into a "chapter" of
 * the user's life story: literary title, 2–3 paragraph second-person narrative,
 * 9-point enneagram weights, and a painted-memory image.
 *
 * Lazy-generated on first view of a past month and cached forever as
 * `patterns_chapter_YYYY-MM`. The story is one Claude call, the image is one
 * DALL-E call — both are gated behind a queue so opening the Past months tab
 * with N un-generated months doesn't fan out into N parallel API calls.
 */

import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { claudeProxy, openaiImageProxy } from './AIProxy';
import { MonthChapter, PatternsReport } from '../types';

const CHAPTER_PREFIX = 'patterns_chapter_';
const IMAGE_DIR      = (FileSystem.documentDirectory ?? '') + 'month_chapter_images/';

// ── Generation queue (one chapter at a time) ──────────────────────────────────

type Job = {
  month: string;
  report: PatternsReport;
  resolve: (chapter: MonthChapter | null) => void;
};
const _queue: Job[] = [];
let _running = false;
const _inFlight = new Set<string>();

async function _drain(): Promise<void> {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const job = _queue.shift()!;
    const chapter = await _generateNow(job.month, job.report).catch(() => null);
    _inFlight.delete(job.month);
    job.resolve(chapter);
  }
  _running = false;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function getChapter(month: string): Promise<MonthChapter | null> {
  try {
    const json = await AsyncStorage.getItem(CHAPTER_PREFIX + month);
    if (!json) return null;
    const chapter: MonthChapter = JSON.parse(json);
    // If the cached image file disappeared (app cleared, OS sweep), clear the
    // imageUri so the UI re-requests generation.
    if (chapter.imageUri) {
      const info = await FileSystem.getInfoAsync(chapter.imageUri);
      if (!info.exists) chapter.imageUri = undefined;
    }
    return chapter;
  } catch {
    return null;
  }
}

async function saveChapter(chapter: MonthChapter): Promise<void> {
  await AsyncStorage.setItem(CHAPTER_PREFIX + chapter.month, JSON.stringify(chapter));
}

export async function deleteChapter(month: string): Promise<void> {
  try {
    const existing = await getChapter(month);
    if (existing?.imageUri) {
      await FileSystem.deleteAsync(existing.imageUri, { idempotent: true });
    }
    await AsyncStorage.removeItem(CHAPTER_PREFIX + month);
  } catch { /* best-effort */ }
}

/**
 * Public: get the chapter for a month, generating it if needed. Idempotent —
 * concurrent calls for the same month coalesce to a single generation.
 */
export async function ensureChapter(
  month: string,
  report: PatternsReport,
): Promise<MonthChapter | null> {
  const cached = await getChapter(month);
  if (cached && cached.imageUri) return cached; // fully ready
  if (cached && !cached.imageUri) {
    // Story exists but image didn't finish last time. Try to recover the image.
    const refreshed = await _ensureImage(cached);
    return refreshed;
  }
  if (_inFlight.has(month)) {
    return new Promise<MonthChapter | null>(resolve => {
      _queue.push({ month, report, resolve });
    });
  }
  _inFlight.add(month);
  return new Promise<MonthChapter | null>(resolve => {
    _queue.push({ month, report, resolve });
    _drain();
  });
}

/** Force-regenerate (e.g. user taps Regenerate). Discards old chapter + image. */
export async function regenerateChapter(
  month: string,
  report: PatternsReport,
): Promise<MonthChapter | null> {
  await deleteChapter(month);
  return ensureChapter(month, report);
}

// ── Generation ────────────────────────────────────────────────────────────────

async function _generateNow(
  month: string,
  report: PatternsReport,
): Promise<MonthChapter | null> {
  // 1. Story + enneagram from Claude. Save immediately so the user sees prose
  //    while the image is still painting.
  const partial = await _generateStoryAndEnneagram(month, report);
  if (!partial) return null;
  await saveChapter(partial);
  // 2. Image (slower, more expensive). Update the cached chapter when ready.
  return _ensureImage(partial);
}

async function _generateStoryAndEnneagram(
  month: string,
  report: PatternsReport,
): Promise<MonthChapter | null> {
  try {
    const monthLabel = monthLabelOf(month);
    const userContent = buildUserContent(monthLabel, report);

    const response = await claudeProxy.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: STORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const parsed = parseChapterJson(raw);
    if (!parsed) return null;

    return {
      month,
      title:       parsed.title,
      story:       parsed.story,
      enneagram:   parsed.enneagram,
      imagePrompt: buildImagePrompt(parsed.title, parsed.imageHint, report),
      generatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function _ensureImage(chapter: MonthChapter): Promise<MonthChapter> {
  if (chapter.imageUri) return chapter;
  try {
    await ensureImageDir();
    const prompt = chapter.imagePrompt ?? buildFallbackImagePrompt(chapter);
    const response = await openaiImageProxy.images.generate({
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    }).catch((err: any) => {
      const msg: string = err?.message ?? '';
      if (msg.includes('safety') || msg.includes('400') || msg.includes('rejected')) {
        return openaiImageProxy.images.generate({
          model: 'dall-e-3',
          prompt: buildFallbackImagePrompt(chapter),
          size: '1024x1024',
          quality: 'standard',
          n: 1,
        });
      }
      throw err;
    });

    const url = response.data?.[0]?.url;
    if (!url) return chapter;

    const safe = chapter.month.replace(/[^a-zA-Z0-9_-]/g, '_');
    const localPath = IMAGE_DIR + safe + '.jpg';
    const result = await FileSystem.downloadAsync(url, localPath);
    if (result.status !== 200) return chapter;

    const updated: MonthChapter = { ...chapter, imageUri: localPath };
    await saveChapter(updated);
    return updated;
  } catch {
    return chapter; // story is still useful even without an image
  }
}

async function ensureImageDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const STORY_SYSTEM_PROMPT = `You are reading a structured summary of one month from someone's private journal — generated from their daily entries — and writing it back to them as a chapter of their own life story.

VOICE:
- Second person ("you"). Warm, observational, literary — never clinical or therapeutic.
- Specific, not vague. Quote details that appear in the source material (people, places, situations).
- Tentative when describing inner state; certain when describing what happened.
- Read like the opening pages of a chapter in a novel about the user, not like a report.
- FORBIDDEN: trait labels ("you are a perfectionist"), advice, prescriptions, clinical jargon, mood-tracking framing.

STRUCTURE:
- 1 short paragraph of prose (4–6 sentences max).
- Open with the texture of the month — the felt sense, not a stat.
- Touch on who showed up and what kept coming back.
- End on a quiet, observational beat — never a lesson, never a moral.

CHAPTER TITLE:
- 3 to 7 words. Evocative, specific, not a summary.
- Examples of voice: "The month the noise quieted", "Three Wednesdays of waiting", "Saying it out loud".
- AVOID generic titles like "Reflections", "A month of growth", "The journey".

ENNEAGRAM:
- The 9 enneagram types map to recurring tendencies the user showed THIS MONTH (not lifetime traits):
  1 — perfecting, holding standards, frustration when things slip
  2 — caring, attuning to others, prioritising others' needs
  3 — achieving, performing, image-management
  4 — feeling, longing, dwelling in what's missing
  5 — observing, withdrawing, conserving energy
  6 — vigilance, doubt, looking for safety
  7 — pursuing, scattering toward what's next, avoiding pain
  8 — asserting, protecting, taking up space
  9 — accommodating, smoothing over, going along
- Read the source material and assign each type a weight from 0.0 to 1.0 reflecting how much it appeared THIS MONTH.
- Most months have 2 to 4 dominant types (>= 0.5) and the rest faded.
- Be honest — if a type isn't there, give it 0 or near-0.

IMAGE HINT:
- 4 to 8 words describing the visual atmosphere of the month — colours, weather, season-of-life imagery.
- Examples: "rain on the window late afternoon", "early morning kitchen light", "long quiet hallway at dusk".

OUTPUT — a single JSON object, no fences, no preamble:
{
  "title": "<3-7 words>",
  "story": "<2-3 paragraphs separated by \\n\\n>",
  "enneagram": [<9 numbers 0.0-1.0, in type order 1..9>],
  "imageHint": "<4-8 words>"
}`;

function buildUserContent(monthLabel: string, report: PatternsReport): string {
  const arc = report.thisMonth.emotionalArc?.length
    ? report.thisMonth.emotionalArc
        .map(w => `Week ${w.week}: ${w.dominantEmotion} — "${w.note}"`)
        .join('\n')
    : 'No emotion tags this month.';

  const themes = report.thisMonth.whatsLoud?.length
    ? report.thisMonth.whatsLoud.map(t => `- ${t}`).join('\n')
    : 'None recorded.';

  const intentions = report.thisMonth.intentionsProgress?.length
    ? report.thisMonth.intentionsProgress
        .map(i => `- "${i.intention}" — ${i.note} (${i.mentions} mention${i.mentions === 1 ? '' : 's'})`)
        .join('\n')
    : 'None active.';

  const observations = (report.acrossTime ?? [])
    .slice(0, 6)
    .map(o => `- [${o.type}] ${o.title}: ${o.body}`)
    .join('\n') || 'None this month.';

  return [
    `# ${monthLabel}`,
    `Entries logged: ${report.entryCount}`,
    ``,
    `## Reflection (3–5 sentences from the patterns report)`,
    report.thisMonth.reflection || '(none)',
    ``,
    `## What kept coming up`,
    themes,
    ``,
    `## Emotional arc by week`,
    arc,
    ``,
    `## Active intentions`,
    intentions,
    ``,
    `## Observations across time`,
    observations,
    ``,
    `Now write this month as a chapter of the user's story. Output the JSON object only.`,
  ].join('\n');
}

function buildImagePrompt(title: string, hint: string | undefined, report: PatternsReport): string {
  const dominant = report.thisMonth.emotionalArc?.[report.thisMonth.emotionalArc.length - 1]?.dominantEmotion;
  const atmosphere = hint?.trim() || 'soft window light, quiet interior';
  const moodHint = dominant ? ` Mood undertone: ${dominant}.` : '';
  return (
    `A painterly, dreamlike memory-image evoking: ${atmosphere}. ` +
    `Inspired by the chapter title "${title}".${moodHint} ` +
    `Soft brushstrokes, muted warm-cool palette, abstract impressionistic, ` +
    `no people's faces, no text, no legible letters or numbers, no symbols. ` +
    `Atmospheric, contemplative, like a still from a quiet film.`
  );
}

function buildFallbackImagePrompt(chapter: MonthChapter): string {
  return (
    `A painterly, dreamlike memory-image: soft brushstrokes, muted warm and cool tones, ` +
    `abstract impressionistic atmosphere, no people, no text, no letters, no symbols. ` +
    `Quiet, contemplative, like a still from a quiet film.`
  );
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseChapterJson(raw: string): {
  title: string;
  story: string;
  enneagram: number[];
  imageHint: string;
} | null {
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj: any;
  try { obj = JSON.parse(stripped.slice(start, end + 1)); }
  catch { return null; }

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const story = typeof obj.story === 'string' ? obj.story.trim() : '';
  const imageHint = typeof obj.imageHint === 'string' ? obj.imageHint.trim() : '';

  let enneagram: number[] = [];
  if (Array.isArray(obj.enneagram) && obj.enneagram.length === 9) {
    enneagram = obj.enneagram.map((n: any) => {
      const num = Number(n);
      if (!isFinite(num)) return 0;
      return Math.max(0, Math.min(1, num));
    });
  } else {
    enneagram = new Array(9).fill(0);
  }

  if (!title || title.length > 80) return null;
  if (!story || story.length < 80) return null;
  return { title, story, enneagram, imageHint };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthLabelOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
