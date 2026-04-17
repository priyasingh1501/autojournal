/** openai-whisper — Whisper audio transcription proxy (base64 audio in, text out) */

// Default prompt that helps Whisper handle Hinglish (Hindi-English code-switching).
// Whisper uses the prompt as a prior — seeing mixed-language examples biases it to
// keep Hindi words romanized and not force everything into one language.
const HINGLISH_PROMPT =
  'The speaker may mix Hindi and English freely. For example: "Aaj mera mood thoda off tha, but phir kuch better feel hua." Keep Hindi words as spoken, romanized in English script.';

Deno.serve(async (req) => {
  try {
    const { audio_base64, filename, prompt, language } = await req.json();
    const apiKey = Deno.env.get('OPENAI_API_KEY')!;

    // Decode base64 → binary
    const binaryStr = atob(audio_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: 'audio/m4a' }), filename ?? 'audio.m4a');
    formData.append('model', 'whisper-1');
    // Use caller-supplied prompt, or fall back to the Hinglish default
    formData.append('prompt', prompt ?? HINGLISH_PROMPT);
    // Omit language field when not specified — lets Whisper auto-detect, which works
    // better for code-switched audio than forcing a single language.
    if (language) formData.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const data = await response.json();
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
