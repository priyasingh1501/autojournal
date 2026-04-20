/**
 * API Keys — no longer used in the app binary.
 *
 * All AI calls (Anthropic, OpenAI, ElevenLabs) are routed through
 * Supabase Edge Functions. Keys are stored as Supabase secrets server-side
 * and never embedded in the app bundle.
 *
 * See src/services/AIProxy.ts for the proxy implementation.
 */

export const ANTHROPIC_API_KEY   = '';
export const OPENAI_API_KEY      = '';
export const ELEVENLABS_API_KEY  = '';
export const ELEVENLABS_VOICE_ID = '';
export const SUPABASE_URL        = 'https://hgodsuwrdpmaqcdetjjn.supabase.co';
export const SUPABASE_ANON_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnb2RzdXdyZHBtYXFjZGV0ampuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTI3MjYsImV4cCI6MjA5MDc4ODcyNn0.PrrHGD7Vx0hq51uLcCLTH4tA-smRFMKTnxom1i5lrCw';
