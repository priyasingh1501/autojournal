-- Lock down the audio-clips bucket.
--
-- Before this migration: an `allow_anon_upload` policy let anyone with the
-- project anon key (i.e. anyone who reverse-engineered the app binary) write
-- to this bucket — and there was nothing forcing reads/deletes/updates to
-- service role only either. Since the openai-whisper edge function uses
-- service role to read + delete clips, RLS doesn't apply there, so we can
-- safely remove every non-service-role policy.
--
-- After this migration:
--   • Only authenticated (signed-in) users can INSERT clips.
--   • No anon, authenticated, or public can SELECT / UPDATE / DELETE.
--   • Service role (used by the whisper function) bypasses RLS as before.

-- Drop the legacy anon INSERT policy created in the dashboard.
drop policy if exists "allow_anon_upload 1o3af70_0" on storage.objects;

-- Drop any other audio-clips policies that may have been added in the
-- dashboard with the names listed below. Safe no-ops if they don't exist.
drop policy if exists "audio_clips_insert_anon"  on storage.objects;
drop policy if exists "audio_clips_select_anon"  on storage.objects;
drop policy if exists "audio_clips_update_anon"  on storage.objects;
drop policy if exists "audio_clips_delete_anon"  on storage.objects;
drop policy if exists "audio_clips_select_auth"  on storage.objects;
drop policy if exists "audio_clips_update_auth"  on storage.objects;
drop policy if exists "audio_clips_delete_auth"  on storage.objects;

-- Authenticated users can upload clips. The path convention used by AIProxy
-- (`clips/<timestamp>-<random>.m4a`) is not enforced here — short-lived clips
-- get auto-deleted by the whisper edge function so directory hygiene matters
-- less than identity gating.
create policy "audio_clips_insert_auth"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'audio-clips');

-- Note: no SELECT / UPDATE / DELETE policies. RLS denies by default, so only
-- service_role (used by the openai-whisper edge function) can read or delete
-- clips. This means a malicious authenticated user CANNOT enumerate, fetch,
-- or tamper with another user's clips during the brief window before the
-- whisper function deletes them.
