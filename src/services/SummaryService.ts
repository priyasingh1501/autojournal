import { claudeProxy } from './AIProxy';
import * as FileSystem from 'expo-file-system/legacy';
import { TranscriptEntry, DailySummary, DayMacros } from '../types';
import { StorageService } from './StorageService';
import { generateSummaryImage } from './SummaryImageService';
import { extractJournalSignal } from './WisdomService';

const MAX_PHOTOS = 8; // Claude handles up to ~20 but keep cost/latency reasonable

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mediaTypeFromUri(uri: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function readPhotoAsBase64(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

export async function generateDailySummary(
  transcripts: TranscriptEntry[],
  date: string,
): Promise<DailySummary> {
  if (transcripts.length === 0) {
    throw new Error('No entries recorded today.');
  }

  // Start jellyfish image generation in parallel with Claude — doesn't block summary
  const imagePromise = generateSummaryImage(date, '');

  // Sort chronologically
  const sorted = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);

  // Build the text log — label voice vs manual, add tone tags from emotion detection
  const photoEntries = sorted.filter(t => t.photoUri);
  const hasPhotos = photoEntries.length > 0;

  const textLog = sorted
    .map(t => {
      const time = formatTime(t.timestamp);
      const label = t.kind === 'manual' ? '[Note]' : '[Voice]';
      const tone  = t.emotionTags?.length ? ` [Tone: ${t.emotionTags.join(', ')}]` : '';
      if (t.text.trim()) {
        return `${label}${tone} [${time}] ${t.text.trim()}`;
      } else if (t.photoUri) {
        return `[Photo] [${time}] (see attached image)`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  // System prompt — categorised summary + five-section insight
  const systemPrompt = `You are an intelligent personal journal assistant.
You receive a mix of voice transcripts, written notes, and photos from a person's day.
Your job is to produce TWO things, separated by the exact line ===INSIGHTS===.

PART 1 — Categorised daily summary (strict markdown):
1. Start with a single bold sentence overview of the day — no header, just **overview text**.
2. Then include only the categories below that have actual content from the entries.
   Skip any category with nothing relevant. Use exactly these headers:

## Thoughts & Reflections
## Ideas & Plans
## Learnings
## Meals & Food
## Spends & Expenses
## Health & Fitness
## Meditation & Mindfulness
## Tasks & Decisions
## Highlights

Under each header, use short bullet points (- item). Be concise.
Entries may include a [Tone: tag, tag] marker — these are emotional tone signals detected from voice recordings. Factor them into the Emotional check-in and overall interpretation of the entry.
If an entry mentions a price, amount, or purchase → Spends & Expenses.
If an entry mentions food, eating, drinking, restaurant → Meals & Food.
If an entry mentions exercise, gym, steps, sport → Health & Fitness.
If an entry mentions meditation, breathwork, mindfulness, pranayama, sitting practice, journaling intention → Meditation & Mindfulness.
If an entry mentions reading a book, something learned at work, a new skill, a new observation or realisation → Learnings.
Write in second person ("You..."). Warm and personal tone. Total length 150–400 words.

Then output exactly this line on its own:
===INSIGHTS===

PART 2 — Daily personal insight (plain text only, no markdown):
Use EXACTLY these seven section headings, each on its own line, followed by 1–2 sentences:
  Emotional check-in:
  Meals:
  Movement:
  Meditation:
  Spending:
  Recurring thoughts:
  Learnings:

Rules:
- No markdown symbols (no *, no #). Plain text only.
- Be specific — reference actual things from the entries.
- For Meals: flag any unhealthy patterns (junk food, skipped meals, late-night eating). Say "Looks balanced" if nothing concerning.
- For Movement: call out if there was no workout or physical activity today. Mention what was done if there was.
- For Meditation: note any meditation, breathwork, mindfulness, or pranayama practice. Say "None logged today" if not mentioned.
- For Spending: give a short qualitative note — high/low/unusual. Say "No spending logged" if nothing mentioned.
- For Recurring thoughts: name actual themes or concerns that appear more than once, or say "None that stood out today."
- For Learnings: note anything the person read, studied, learned at work, a new skill practised, or a meaningful new observation. Say "Nothing specific logged today" if nothing stands out.
- Write in second person ("You...").

Then output exactly this line on its own:
===MACROS===

PART 3 — Meal macro estimates (single JSON object, no other text):
If any food or drink was mentioned today, estimate totals and output ONLY:
{"calories": <kcal number>, "protein": <grams number>, "carbs": <grams number>, "fat": <grams number>}
If no meals were mentioned at all, output: null`;

  // Build multimodal content
  const content: any[] = [];

  content.push({
    type: 'text',
    text: `Here are today's (${date}) journal entries:\n\n${textLog}`,
  });

  // Attach photos (up to MAX_PHOTOS, in chronological order)
  const photosToEmbed = photoEntries.slice(0, MAX_PHOTOS);
  if (photosToEmbed.length > 0) {
    content.push({
      type: 'text',
      text: `\nAttached photo${photosToEmbed.length !== 1 ? 's' : ''} (${photosToEmbed.length}):`,
    });

    for (const entry of photosToEmbed) {
      const base64 = await readPhotoAsBase64(entry.photoUri!);
      if (!base64) continue; // file missing — skip silently

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaTypeFromUri(entry.photoUri!),
          data: base64,
        },
      });
      // Brief caption so Claude knows when each photo was taken
      content.push({
        type: 'text',
        text: `↑ Photo taken at ${formatTime(entry.timestamp)}${entry.text.trim() ? ` — "${entry.text.trim()}"` : ''}`,
      });
    }

    if (photoEntries.length > MAX_PHOTOS) {
      content.push({
        type: 'text',
        text: `(${photoEntries.length - MAX_PHOTOS} additional photo${photoEntries.length - MAX_PHOTOS !== 1 ? 's' : ''} not shown)`,
      });
    }
  }

  content.push({
    type: 'text',
    text: 'Please create a thoughtful daily summary based on all the entries above.',
  });

  const response = await claudeProxy.messages.create({
    model: 'claude-opus-4-5',   // opus-4-5 supports vision; swap back to opus-4-6 when it launches with vision
    max_tokens: 1600,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const fullText = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  const SENTINEL        = '===INSIGHTS===';
  const MACROS_SENTINEL = '===MACROS===';

  const sentinelIdx = fullText.indexOf(SENTINEL);
  const macrosIdx   = fullText.indexOf(MACROS_SENTINEL);

  const summaryText = sentinelIdx !== -1
    ? fullText.slice(0, sentinelIdx).trim()
    : fullText.trim();

  const insightEnd  = macrosIdx !== -1 ? macrosIdx : fullText.length;
  const insightText = sentinelIdx !== -1
    ? fullText.slice(sentinelIdx + SENTINEL.length, insightEnd).trim()
    : undefined;

  // Parse structured macro estimates from Part 3
  let dailyMacros: DayMacros | undefined;
  if (macrosIdx !== -1) {
    const macrosRaw = fullText.slice(macrosIdx + MACROS_SENTINEL.length).trim();
    try {
      const jsonStr = macrosRaw.match(/\{[\s\S]*?\}/)?.[0];
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          dailyMacros = {
            date,
            calories: parsed.calories ?? null,
            protein:  parsed.protein  ?? null,
            carbs:    parsed.carbs    ?? null,
            fat:      parsed.fat      ?? null,
          };
        }
      }
    } catch { /* ignore malformed JSON */ }
  }

  // Collect image result — may already be done since it ran in parallel with Claude
  const imageUri = await imagePromise.catch(() => null);

  const summary: DailySummary = {
    date,
    summary: summaryText,
    insightText,
    transcriptCount: transcripts.length,
    createdAt: Date.now(),
    imageUri: imageUri ?? undefined,
    dailyMacros,
  };

  await StorageService.saveSummary(summary);

  // Extract journal signal for wisdom feed contextualisation — awaited so
  // the signal is ready before the user navigates to the Wisdom screen.
  await extractJournalSignal(summaryText).catch(() => {});

  return summary;
}
