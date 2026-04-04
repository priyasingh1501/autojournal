/** elevenlabs-tts — ElevenLabs text-to-speech proxy (returns base64 mp3) */

Deno.serve(async (req) => {
  try {
    const { voice_id, text, voice_settings } = await req.json();
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')!;

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
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

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
