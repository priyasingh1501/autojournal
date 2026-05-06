/**
 * End-to-end test: journal signal → wisdom feed contextualisation
 *
 * Run with:
 *   npx ts-node --skip-project scripts/test_wisdom_signal.ts
 *
 * Tests:
 *  1. Signal extraction — given a sample journal summary, does Claude produce valid tags?
 *  2. Feed ranking    — do those tags actually surface relevant shorts from the library?
 *  3. Relevance check — are the top-ranked shorts topically appropriate?
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Types (mirrors app) ───────────────────────────────────────────────────────

interface JournalSignal {
  emotional_states: string[];
  cognitive_patterns: string[];
  themes: string[];
  values_in_tension: string[];
  enneagram_hints: number[];
  depth_preference: 'entry' | 'mid' | 'deep';
  extractedAt?: number;
}

interface WisdomShort {
  id: string;
  title: string;
  short: string;
  pullquote: string;
  themes: string[];
  emotional_states: string[];
  cognitive_patterns: string[];
  values: string[];
  enneagram_resonance: number[];
  depth: string;
  source_author: string;
}

// ── Test journal summaries ────────────────────────────────────────────────────

const TEST_CASES = [
  {
    label: 'Work stress / burnout',
    summary: `Had a really exhausting week. I keep pushing myself to do more but I feel completely drained. 
      My manager piled on another project and I said yes even though I wanted to say no. 
      I'm not sleeping well, waking up at 3am thinking about deadlines. Feel like I'm running on empty 
      and slowly losing the sense of why I even care about this work anymore. 
      Also been snapping at my partner which I hate.`,
  },
  {
    label: 'Relationship conflict',
    summary: `Had a big argument with my partner last night. We keep having the same fight — I feel unheard 
      and they feel criticized. I said some things I regret. Afterwards I just shut down and couldn't talk. 
      I notice I always go cold when I feel threatened. Wondering if this pattern comes from somewhere deeper. 
      Feel guilty and sad today.`,
  },
  {
    label: 'Existential / identity',
    summary: `Been feeling a strange emptiness lately. Not sad exactly, more like — what's the point? 
      I have everything I'm supposed to want but something feels hollow. 
      Keep asking myself who I am when I'm not performing for others. 
      Reading a lot, spending more time alone. Feel like I'm on the edge of something but don't know what.`,
  },
];

// ── Signal extraction (mirrors WisdomService.extractJournalSignal) ────────────

async function extractSignal(summary: string): Promise<JournalSignal | null> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `Extract a structured signal from this journal summary for content matching.
Return ONLY valid JSON:
{
  "emotional_states": [array of 1-4 strings, lowercase, e.g. "anxious", "restless", "unfulfilled"],
  "cognitive_patterns": [array of 1-3 strings, e.g. "rumination", "all-or-nothing", "perfectionism"],
  "themes": [array of 1-4 strings, e.g. "relationships", "work", "identity", "control"],
  "values_in_tension": [array of 0-2 strings, e.g. "freedom", "security"],
  "enneagram_hints": [array of 0-2 numbers 1-9],
  "depth_preference": "entry" | "mid" | "deep"
}
depth_preference: "entry" if surface venting/stress, "deep" if existential/identity, else "mid".`,
    messages: [{ role: 'user', content: `Journal summary:\n"""\n${summary}\n"""` }],
  });
  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  return JSON.parse(raw.slice(start, end + 1)) as JournalSignal;
}

// ── Scoring (mirrors WisdomService.scoreShort) ────────────────────────────────

function scoreShort(short: WisdomShort, signal: JournalSignal): number {
  let score = 0;
  for (const e of signal.emotional_states)   if (short.emotional_states.includes(e))   score += 3;
  for (const c of signal.cognitive_patterns) if (short.cognitive_patterns.includes(c)) score += 2;
  for (const t of signal.themes)             if (short.themes.includes(t))             score += 2;
  for (const v of signal.values_in_tension)  if (short.values.includes(v))             score += 1;
  for (const n of signal.enneagram_hints)    if (short.enneagram_resonance.includes(n)) score += 1;
  if (short.depth === signal.depth_preference) score += 1;
  return score;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_KEY || !ANTHROPIC_KEY) {
    console.error('Set SUPABASE_KEY and ANTHROPIC_API_KEY env vars');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: library, error } = await sb.from('wisdom_shorts').select('*');
  if (error || !library) { console.error('Failed to load library:', error); process.exit(1); }
  console.log(`Library loaded: ${library.length} shorts\n`);

  for (const tc of TEST_CASES) {
    console.log(`${'='.repeat(70)}`);
    console.log(`TEST: ${tc.label}`);
    console.log(`${'='.repeat(70)}`);

    // 1. Extract signal
    const signal = await extractSignal(tc.summary);
    if (!signal) { console.log('Signal extraction failed\n'); continue; }

    console.log('\nSIGNAL EXTRACTED:');
    console.log(`  emotional_states:   ${signal.emotional_states.join(', ')}`);
    console.log(`  cognitive_patterns: ${signal.cognitive_patterns.join(', ')}`);
    console.log(`  themes:             ${signal.themes.join(', ')}`);
    console.log(`  depth_preference:   ${signal.depth_preference}`);

    // 2. Score and rank
    const scored = library
      .map(s => ({ short: s as WisdomShort, score: scoreShort(s as WisdomShort, signal) }))
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5);
    const scoreZero = scored.filter(s => s.score === 0).length;

    console.log(`\nTOP 5 SHORTS (score/total ${library.length}, ${scoreZero} with score 0):`);
    for (const { short, score } of top) {
      console.log(`\n  [${score}pts] ${short.title}`);
      console.log(`         author: ${short.source_author}`);
      console.log(`         themes: ${short.themes.join(', ')}`);
      console.log(`         quote:  "${short.pullquote?.slice(0, 90)}..."`);
    }
    console.log();
  }
}

main().catch(console.error);
