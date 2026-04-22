/**
 * elevenlabs-llm — OpenAI-compatible custom LLM webhook for ElevenLabs Conversational AI.
 *
 * ElevenLabs sends each conversation turn here as an OpenAI Chat Completions
 * request (with stream: true). We forward it to Claude Haiku and proxy the
 * Anthropic SSE stream back in OpenAI SSE format so ElevenLabs can pipe the
 * text straight to its TTS engine.
 */

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
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
    const body = await req.json();
    const messages: { role: string; content: string }[] = body.messages ?? [];
    const maxTokens: number = body.max_tokens ?? 220;

    // ElevenLabs sends a `system` role message when the agent has a system prompt.
    // Anthropic uses a top-level `system` field instead of a message role.
    const systemMsg = messages.find((m) => m.role === 'system');

    // Diagnostic: log system prompt length + first/last chars so we can verify
    // the full mind persona is reaching Claude. Inspect in the Supabase
    // dashboard under Edge Functions → elevenlabs-llm → Logs.
    const sysContent = typeof systemMsg?.content === 'string' ? systemMsg.content : '';
    console.log('[elevenlabs-llm] system_len=%d first120=%s last120=%s user_turns=%d',
      sysContent.length,
      sysContent.slice(0, 120).replace(/\n/g, ' '),
      sysContent.slice(-120).replace(/\n/g, ' '),
      messages.filter(m => m.role === 'user').length,
    );

    // Warn loud if the mind persona didn't reach us. Empty = the agent template
    // was wiped in the dashboard; "Task description: You are an AI agent" is
    // ElevenLabs' generic fallback when {{full_system_prompt}} didn't resolve.
    // We still answer (refusing would fail the whole agent boot and surface to
    // the client as a 502 at LiveKit), but this log flags the misconfiguration.
    if (!sysContent || sysContent.startsWith('Task description: You are an AI agent')) {
      console.error('[elevenlabs-llm] Missing mind persona — responding as generic. len=%d', sysContent.length);
    }
    const convMsgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

    // Ensure the messages array alternates correctly (Anthropic requires user first).
    const normalised: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const msg of convMsgs) {
      const last = normalised[normalised.length - 1];
      if (last && last.role === msg.role) {
        // Merge consecutive same-role turns (can happen with tool outputs).
        last.content += '\n' + msg.content;
      } else {
        normalised.push(msg as { role: 'user' | 'assistant'; content: string });
      }
    }
    // Anthropic requires the first message to be from the user.
    if (normalised.length === 0 || normalised[0].role !== 'user') {
      normalised.unshift({ role: 'user', content: '.' });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        stream: true,
        system: systemMsg?.content ?? '',
        messages: normalised,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('[elevenlabs-llm] Anthropic error:', err);
      return new Response(JSON.stringify({ error: err }), {
        status: anthropicRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Transform Anthropic SSE → OpenAI SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const enqueue = (text: string) => {
          const chunk = {
            id: 'chatcmpl-el',
            object: 'chat.completion.chunk',
            choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (!raw || raw === '[DONE]') continue;

              try {
                const event = JSON.parse(raw);
                if (
                  event.type === 'content_block_delta' &&
                  event.delta?.type === 'text_delta' &&
                  event.delta.text
                ) {
                  enqueue(event.delta.text);
                }
              } catch { /* skip malformed events */ }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (e) {
          console.error('[elevenlabs-llm] Stream error:', e);
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[elevenlabs-llm] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
