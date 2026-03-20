import Anthropic from '@anthropic-ai/sdk';
import * as FileSystem from 'expo-file-system';
import { TranscriptEntry, DailySummary } from '../types';
import { StorageService } from './StorageService';

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
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }
  if (transcripts.length === 0) {
    throw new Error('No entries recorded today.');
  }

  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  // Sort chronologically
  const sorted = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);

  // Build the text log — label voice vs manual, placeholder for photo-only
  const photoEntries = sorted.filter(t => t.photoUri);
  const hasPhotos = photoEntries.length > 0;

  const textLog = sorted
    .map(t => {
      const time = formatTime(t.timestamp);
      const label = t.kind === 'manual' ? '[Note]' : '[Voice]';
      if (t.text.trim()) {
        return `${label} [${time}] ${t.text.trim()}`;
      } else if (t.photoUri) {
        return `[Photo] [${time}] (see attached image)`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

  // System prompt — categorised output
  const systemPrompt = `You are an intelligent personal journal assistant.
You receive a mix of voice transcripts, written notes, and photos from a person's day.
Your job is to organise them into a clear, categorised daily summary.

Output format (strict markdown):
1. Start with a single bold sentence overview of the day — no header, just **overview text**.
2. Then include only the categories below that have actual content from the entries.
   Skip any category with nothing relevant. Use exactly these headers and emojis:

## 💭 Thoughts & Reflections
## 💡 Ideas & Plans
## 🍽️ Meals & Food
## 💰 Spends & Expenses
## 💪 Health & Fitness
## 📋 Tasks & Decisions
## 🌟 Highlights

Under each header, use short bullet points (- item). Be concise.
If an entry mentions a price, amount, or purchase → Spends & Expenses.
If an entry mentions food, eating, drinking, restaurant → Meals & Food.
If an entry mentions exercise, gym, steps, sport → Health & Fitness.
Write in second person ("You..."). Warm and personal tone. Total length 150–350 words.`;

  // Build multimodal content
  const content: Anthropic.ContentBlockParam[] = [];

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

  const response = await client.messages.create({
    model: 'claude-opus-4-5',   // opus-4-5 supports vision; swap back to opus-4-6 when it launches with vision
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const summaryText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('');

  const summary: DailySummary = {
    date,
    summary: summaryText,
    transcriptCount: transcripts.length,
    createdAt: Date.now(),
  };

  await StorageService.saveSummary(summary);
  return summary;
}
