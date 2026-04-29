/** openai-whisper — Whisper audio transcription proxy (storage path in, text out) */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const HINGLISH_PROMPT =
  'The speaker may mix Hindi and English freely. For example: "Aaj mera mood thoda off tha, but phir kuch better feel hua." Keep Hindi words as spoken, romanized in English script.';

Deno.serve(async (req) => {
  let storage_path: string | undefined;
  let supabase: ReturnType<typeof createClient> | undefined;
  try {
    const body = await req.json();
    storage_path = body.storage_path;
    const { prompt, language } = body as { prompt?: string; language?: string };

    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Download audio from Storage (service role bypasses RLS)
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('audio-clips')
      .download(storage_path!);

    if (downloadError) throw new Error(`Storage download failed: ${downloadError.message}`);

    // Send binary to Whisper
    const formData = new FormData();
    formData.append('file', fileBlob, 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('prompt', prompt ?? HINGLISH_PROMPT);
    if (language) formData.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}` },
      body: formData,
    });

    const data = await response.json();

    // Mirror the upstream status to the client so it can distinguish
    // permanent rejections (4xx — bad audio, too large, unsupported format)
    // from transient ones (5xx — OpenAI hiccup) and apply the right retry
    // policy. Without this, the client would treat every bad clip as
    // retryable and waste five round-trips before giving up.
    if (!response.ok) {
      const msg = data?.error?.message || `Whisper HTTP ${response.status}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Whisper proxy error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    // Always clean up the uploaded clip — even on download failure or
    // OpenAI error — so audio never lingers in the bucket. Fire-and-forget;
    // failures here are logged but don't affect the response.
    if (supabase && storage_path) {
      supabase.storage
        .from('audio-clips')
        .remove([storage_path])
        .catch((e: unknown) => console.error('Whisper cleanup failed:', e));
    }
  }
});
