/** openai-image — DALL-E 3 image generation proxy */
import OpenAI from 'npm:openai';

const apiKey = Deno.env.get('OPENAI_API_KEY');

// The app only ever calls dall-e-3 at 1024x1024, quality 'standard', n=1.
// Lock the proxy to that envelope so a signed-in attacker can't request HD
// or oversize images (HD is 2× cost; portrait/landscape are 1.5×).
const ALLOWED_MODELS = new Set(['dall-e-3']);
const ALLOWED_SIZES = new Set(['1024x1024']);
const ALLOWED_QUALITIES = new Set(['standard']);
const MAX_PROMPT_LEN = 4000; // DALL-E 3 hard cap is 4000 chars
const MAX_N = 1;             // DALL-E 3 only supports n=1 anyway

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (!apiKey) {
    console.error('openai-image: OPENAI_API_KEY secret is not set');
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const params = await req.json();

    if (typeof params?.model !== 'string' || !ALLOWED_MODELS.has(params.model)) {
      return badRequest(`model not allowed: ${params?.model ?? '(missing)'}`);
    }
    if (typeof params?.prompt !== 'string' || params.prompt.length === 0) {
      return badRequest('prompt is required');
    }
    if (params.prompt.length > MAX_PROMPT_LEN) {
      return badRequest(`prompt exceeds ${MAX_PROMPT_LEN} chars`);
    }
    if (params.size !== undefined && !ALLOWED_SIZES.has(params.size)) {
      return badRequest(`size not allowed: ${params.size}`);
    }
    if (params.quality !== undefined && !ALLOWED_QUALITIES.has(params.quality)) {
      return badRequest(`quality not allowed: ${params.quality}`);
    }
    if (params.n !== undefined && (typeof params.n !== 'number' || params.n > MAX_N)) {
      return badRequest(`n must be ≤ ${MAX_N}`);
    }

    const client = new OpenAI({ apiKey });
    const response = await client.images.generate(params);
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('openai-image error:', err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
