/**
 * elevenlabs-signed-url — mints a short-lived conversation token for a private
 * ElevenLabs Conversational AI agent, used by the WebRTC (LiveKit) client.
 *
 * The ElevenLabs API key stays server-side; the client only receives a
 * conversation token it uses to join the LiveKit room.
 *
 * WebSocket mode (get-signed-url) is intentionally not used — the RN SDK's
 * WebSocket path depends on browser AudioContext/AudioWorklet, which are
 * unavailable in React Native.
 *
 * Request body: { agent_id: string }
 * Response:     { token: string }
 */

const EL_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { agent_id } = await req.json();
    if (!agent_id) {
      return new Response(JSON.stringify({ error: 'agent_id is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agent_id)}`,
      { headers: { 'xi-api-key': EL_API_KEY } },
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: res.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
