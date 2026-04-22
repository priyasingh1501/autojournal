/** openai-whisper — Whisper audio transcription proxy (storage path in, text out) */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const HINGLISH_PROMPT =
  'The speaker may mix Hindi and English freely. For example: "Aaj mera mood thoda off tha, but phir kuch better feel hua." Keep Hindi words as spoken, romanized in English script.';

Deno.serve(async (req) => {
  try {
    const { storage_path, prompt, language } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Download audio from Storage (service role bypasses RLS)
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('audio-clips')
      .download(storage_path);

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

    // Delete from Storage — fire-and-forget, don't block the response
    supabase.storage.from('audio-clips').remove([storage_path]).catch(console.error);

    // Surface OpenAI errors as 5xx so the client throws instead of silently
    // treating `{error: ...}` as a successful transcription with empty text.
    if (!response.ok) {
      const msg = data?.error?.message || `Whisper HTTP ${response.status}`;
      throw new Error(msg);
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
  }
});
