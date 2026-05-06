/**
 * SavedChatService — persists full chat conversations the user has chosen
 * to "continue later". Distinct from ConversationHistoryService, which only
 * stores a one-line shape for recent-minds context.
 *
 * Records are grouped per-day (by date) so the day-summary view can render
 * a "Reflection history" list with Continue buttons that resume the chat
 * from exactly where the user left off.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { claudeProxy } from './AIProxy';

const STORE_KEY = 'saved_chats';
const MAX_RECORDS = 200;

export interface SavedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface SavedChat {
  id: string;              // conv_<mindKey>_<startedAt>
  mindId: string | null;   // null => Companion
  date: string;            // YYYY-MM-DD — groups under the day summary
  startedAt: number;
  updatedAt: number;
  messages: SavedChatMessage[];
  shape: string;           // one-line summary for the list UI
}

async function readStore(): Promise<SavedChat[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeStore(records: SavedChat[]): Promise<void> {
  try {
    const capped = records.length > MAX_RECORDS
      ? records.slice(-MAX_RECORDS)
      : records;
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(capped));
  } catch { /* non-fatal */ }
}

export async function summarizeChatShape(messages: SavedChatMessage[]): Promise<string> {
  const transcript = messages
    .slice(-20)
    .map(m => `${m.role === 'user' ? 'You' : 'Mind'}: ${m.text.trim()}`)
    .filter(l => l.length > 3)
    .join('\n')
    .slice(0, 3500);

  if (transcript.length < 40) return 'A brief exchange.';

  try {
    const response = await claudeProxy.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system:
        'You are summarizing the SHAPE of a conversation in ONE short sentence ' +
        '(max 14 words). Describe what the conversation was about in a tentative, ' +
        'observational tone — no advice, no analysis, no naming the mind. ' +
        'Return ONLY the sentence, no preamble.',
      messages: [{ role: 'user', content: transcript }],
    });
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!text) return 'A brief exchange.';
    return text.length > 120 ? text.slice(0, 117) + '…' : text;
  } catch {
    return 'A brief exchange.';
  }
}

export interface SaveChatInput {
  id: string;
  mindId: string | null;
  date: string;
  startedAt: number;
  messages: SavedChatMessage[];
  shape: string;
}

export async function saveChat(input: SaveChatInput): Promise<void> {
  const records = await readStore();
  const now = Date.now();
  const idx = records.findIndex(r => r.id === input.id);
  const record: SavedChat = {
    id: input.id,
    mindId: input.mindId,
    date: input.date,
    startedAt: input.startedAt,
    updatedAt: now,
    messages: input.messages,
    shape: input.shape,
  };
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  await writeStore(records);
}

export async function getSavedChatsForDate(date: string): Promise<SavedChat[]> {
  const all = await readStore();
  return all
    .filter(r => r.date === date)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export async function getSavedChat(id: string): Promise<SavedChat | null> {
  const all = await readStore();
  return all.find(r => r.id === id) ?? null;
}

export async function deleteSavedChat(id: string): Promise<void> {
  const all = await readStore();
  await writeStore(all.filter(r => r.id !== id));
}
