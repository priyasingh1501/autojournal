/** openai-whisper — Whisper audio transcription proxy (base64 audio in, text out) */

Deno.serve(async (req) => {
  try {
    const { audio_base64, filename } = await req.json();
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
