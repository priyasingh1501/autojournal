/** elevenlabs-tts — ElevenLabs TTS proxy and voice list proxy */

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')!;

    // Voice list action — proxy the /v1/voices endpoint server-side so the
    // API key never needs to be sent from the client.
    if (body.action === 'list_voices') {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { voice_id, text, voice_settings } = body;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: voice_settings ?? {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: false,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: errText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const audioBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    // Encode in 8KB chunks to avoid call-stack limits and O(n²) concat
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    }
    const base64 = btoa(chunks.join(''));

    return new Response(JSON.stringify({ audio: base64 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ElevenLabs proxy error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
