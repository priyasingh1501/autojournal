/**
 * setup-elevenlabs-agent.ts
 *
 * One-time script that creates the untangle ElevenLabs Conversational AI agent
 * and prints its agent ID. Run once, then set ELEVENLABS_AGENT_ID in the app.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... npx tsx scripts/setup-elevenlabs-agent.ts [voice_id]
 *
 * voice_id defaults to Rachel (21m00Tcm4TlvDq8ikWAM) — pass your preferred
 * ElevenLabs voice ID as the first argument to override.
 */

const EL_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!EL_API_KEY) {
  console.error('Set ELEVENLABS_API_KEY env var first.');
  process.exit(1);
}

// The custom LLM webhook — your Supabase project URL + function name.
const SUPABASE_URL = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
const LLM_WEBHOOK = `${SUPABASE_URL}/functions/v1/elevenlabs-llm`;

const voiceId = process.argv[2] ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel

const agentPayload = {
  name: 'untangle-companion',
  conversation_config: {
    agent: {
      // Dynamic variables {{full_system_prompt}} and {{first_message}} are
      // substituted at session-start time from the React Native client.
      prompt: {
        prompt: '{{full_system_prompt}}',
        llm: 'custom-llm',
        custom_llm: {
          url: LLM_WEBHOOK,
          api_type: 'chat_completions',
        },
      },
      first_message: '{{first_message}}',
      language: 'en',
    },
    tts: {
      model_id: 'eleven_flash_v2',
      voice_id: voiceId,
      stability: 0.45,
      similarity_boost: 0.75,
      use_speaker_boost: false,
    },
    turn: {
      turn_timeout: 10,
      silence_end_call_timeout: 60,
    },
  },
  platform_settings: {
    auth: {
      enable_auth: true,
    },
  },
};

async function createAgent() {
  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: {
      'xi-api-key': EL_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentPayload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Failed to create agent:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const agentId: string = data.agent_id;

  console.log('\n✅ Agent created successfully!\n');
  console.log(`Agent ID: ${agentId}`);
  console.log('\nAdd this to src/services/ElevenLabsConvAIService.ts:');
  console.log(`  export const ELEVENLABS_AGENT_ID = '${agentId}';\n`);
}

createAgent().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
