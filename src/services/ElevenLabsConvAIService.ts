/**
 * ElevenLabsConvAIService — helpers for the Conversational AI session.
 *
 * Replace ELEVENLABS_AGENT_ID with the value printed by:
 *   npx tsx scripts/setup-elevenlabs-agent.ts
 */

// ── Set this after running the setup script ────────────────────────────────────
export const ELEVENLABS_AGENT_ID = '';   // <-- fill in after setup

const SUPABASE_URL      = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

/**
 * Fetch a 15-minute signed WebSocket URL for the agent.
 * The ElevenLabs API key stays in Supabase secrets.
 */
export async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-signed-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ agent_id: agentId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[ElevenLabsConvAI] Failed to get signed URL: ${err}`);
  }

  const { signed_url } = await res.json();
  return signed_url as string;
}
