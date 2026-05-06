/**
 * ElevenLabsConvAIService — helpers for the Conversational AI session.
 *
 * Replace ELEVENLABS_AGENT_ID with the value printed by:
 *   npx tsx scripts/setup-elevenlabs-agent.ts
 */

// ── Set this after running the setup script ────────────────────────────────────
export const ELEVENLABS_AGENT_ID = 'agent_0601kpfaz1nhe9as35fzy6mwqnjg';

const SUPABASE_URL      = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';

/**
 * Fetch a short-lived conversation token for the agent.
 * The ElevenLabs API key stays in Supabase secrets.
 *
 * Required for the @elevenlabs/react-native SDK's WebRTC path — the WebSocket
 * path depends on browser AudioContext/AudioWorklet and does not work in RN.
 */
export async function getConversationToken(agentId: string): Promise<string> {
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
    throw new Error(`[ElevenLabsConvAI] Failed to get conversation token: ${err}`);
  }

  const { token } = await res.json();
  return token as string;
}
