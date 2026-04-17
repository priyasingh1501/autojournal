/** openai-image — DALL-E 3 image generation proxy */
import OpenAI from 'npm:openai';

const apiKey = Deno.env.get('OPENAI_API_KEY');

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
