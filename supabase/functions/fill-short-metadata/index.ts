/**
 * fill-short-metadata — Supabase Edge Function
 *
 * Triggered via a Database Webhook on INSERT to wisdom_shorts.
 * If a row has only id + title + short filled in, this function:
 *   1. Calls Claude to auto-fill all metadata fields
 *   2. Updates the row in Supabase with the filled data
 */

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const supabase  = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row = payload?.record;

    if (!row?.id || !row?.title || !row?.short) {
      return new Response('Missing id, title or short', { status: 400 });
    }

    // Only fill if metadata is missing
    if (row.pullquote && row.themes?.length > 0) {
      return new Response('Already has metadata', { status: 200 });
    }

    console.log('Filling metadata for:', row.id);

    const systemPrompt =
      'You are a wisdom-short curator and metadata expert. ' +
      'Return ONLY a valid JSON object — no explanation, no markdown fences.';

    const userPrompt = `Title: ${row.title}
Body: ${row.short}

Generate metadata for this wisdom short. Return a JSON object with EXACTLY these fields:
{
  "pullquote": "The single most impactful sentence from the body (≤ 20 words, verbatim or near-verbatim)",
  "source_type": "essay",
  "themes": ["theme1", "theme2"],
  "emotional_states": ["state1", "state2"],
  "cognitive_patterns": ["pattern1"],
  "values": ["value1", "value2"],
  "enneagram_resonance": [4, 9],
  "cognitive_style": ["analytical"],
  "depth": "mid",
  "image_prompt": "A luminous surreal digital painting of [visual metaphor for this insight]. Warm golden amber light, ethereal dreamlike atmosphere, symbolic and cinematic, no text, no faces, masterpiece quality."
}

Field rules:
- pullquote: extract verbatim from body; must be striking and standalone
- themes: 2–4 lowercase tags (e.g. "identity", "control", "acceptance")
- emotional_states: 1–3 from: anxious, overwhelmed, stuck, lonely, comparing, burned-out, self-critical, hopeless, restless, angry, unfulfilled, disconnected, purposeless, conflicted, performing
- cognitive_patterns: 1–2 from: rumination, perfectionism, all-or-nothing, catastrophizing, comparison, avoidance, people-pleasing
- values: 2–3 lowercase (e.g. "freedom", "authenticity", "courage")
- enneagram_resonance: 1–3 numbers 1–9
- cognitive_style: 1–2 from: analytical, reflective, philosophical, intuitive, practical
- depth: "entry" (light), "mid" (reflective), or "deep" (existential)
- image_prompt: vivid visual metaphor, luminous surreal style, no text, no readable characters

Return ONLY the JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude returned unexpected format');

    const meta = JSON.parse(match[0]);

    const { error } = await supabase
      .from('wisdom_shorts')
      .update({
        pullquote:           meta.pullquote           ?? row.title,
        source_author:       'untangle',
        source_type:         meta.source_type         ?? 'essay',
        themes:              meta.themes              ?? [],
        emotional_states:    meta.emotional_states    ?? [],
        cognitive_patterns:  meta.cognitive_patterns  ?? [],
        values:              meta.values              ?? [],
        enneagram_resonance: meta.enneagram_resonance ?? [],
        cognitive_style:     meta.cognitive_style     ?? [],
        depth:               meta.depth               ?? 'mid',
        image_prompt:        meta.image_prompt        ?? null,
      })
      .eq('id', row.id);

    if (error) throw error;

    console.log('Successfully filled metadata for:', row.id);
    return new Response(JSON.stringify({ success: true, id: row.id }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
