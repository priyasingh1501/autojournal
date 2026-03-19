import Anthropic from '@anthropic-ai/sdk';
import { TranscriptEntry, DailySummary } from '../types';
import { StorageService } from './StorageService';

export async function generateDailySummary(
  transcripts: TranscriptEntry[],
  date: string,
): Promise<DailySummary> {
  const settings = await StorageService.getSettings();
  if (!settings?.anthropicApiKey) {
    throw new Error('Anthropic API key not configured. Go to Settings.');
  }

  if (transcripts.length === 0) {
    throw new Error('No transcripts recorded today.');
  }

  const client = new Anthropic({ apiKey: settings.anthropicApiKey, dangerouslyAllowBrowser: true });

  // Build a readable transcript log
  const transcriptLog = transcripts
    .map((t, i) => {
      const time = new Date(t.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `[${time}] ${t.text}`;
    })
    .join('\n');

  const systemPrompt = `You are an intelligent personal journal assistant.
You receive transcripts of a person's spoken thoughts and conversations throughout the day,
captured automatically. Your job is to synthesize them into a meaningful, insightful daily summary.

The summary should:
- Be written in second person ("You...") to feel personal
- Highlight the key themes, activities, and thoughts of the day
- Note any decisions made, problems solved, or goals mentioned
- Capture mood and energy levels if apparent
- Be organized with clear sections using markdown (## headers, bullet points)
- Be warm, reflective, and encouraging
- Be 200-400 words`;

  const userMessage = `Here are today's (${date}) voice transcripts captured throughout the day:

${transcriptLog}

Please create a thoughtful daily summary based on these transcripts.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
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
