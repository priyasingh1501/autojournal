/** claude — Anthropic messages.create proxy */
import Anthropic from 'npm:@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

// Allowlist of models the app actually calls. Anything else is rejected so a
// signed-in attacker can't request Opus / extended-thinking / 64k-token
// responses on our bill. Add new models here when the app adopts them.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]);
// Highest legitimate request in app code is 2400; 4096 leaves headroom.
const MAX_TOKENS_CAP = 4096;

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const params = await req.json();

    if (typeof params?.model !== 'string' || !ALLOWED_MODELS.has(params.model)) {
      return badRequest(`model not allowed: ${params?.model ?? '(missing)'}`);
    }
    if (typeof params?.max_tokens !== 'number' || params.max_tokens <= 0) {
      return badRequest('max_tokens must be a positive number');
    }
    if (params.max_tokens > MAX_TOKENS_CAP) {
      // Clamp rather than reject so a slightly-too-large request still works
      // — but a 64k token attempt gets cut to the cap.
      params.max_tokens = MAX_TOKENS_CAP;
    }

    const response = await client.messages.create(params);
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Claude proxy error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
