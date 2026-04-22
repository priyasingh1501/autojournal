-- Fix: the previous migration's policies were scoped to `public` (pseudo-role).
-- Direct SQL `SET ROLE anon; INSERT ...` passed, but the Supabase Storage HTTP
-- layer (which authenticates as `authenticator` then SET ROLE) still returned
-- 403 "new row violates row-level security policy" on uploads.
--
-- The existing `allow_anon_upload 1o3af70_0` policy for the `audio-clips`
-- bucket works because it's scoped `TO anon` explicitly. Match that pattern.

-- Drop the public-scoped policies from the prior migration
drop policy if exists "Anyone can insert into wisdom-images" on storage.objects;
drop policy if exists "Anyone can update wisdom-images"     on storage.objects;
drop policy if exists "Anyone can update wisdom_shorts"     on wisdom_shorts;

-- ── storage.objects: scoped INSERT/UPDATE for anon + authenticated ────────────
create policy "wisdom_images_insert_anon"
  on storage.objects for insert to anon
  with check (bucket_id = 'wisdom-images');

create policy "wisdom_images_insert_auth"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'wisdom-images');

create policy "wisdom_images_update_anon"
  on storage.objects for update to anon
  using      (bucket_id = 'wisdom-images')
  with check (bucket_id = 'wisdom-images');

create policy "wisdom_images_update_auth"
  on storage.objects for update to authenticated
  using      (bucket_id = 'wisdom-images')
  with check (bucket_id = 'wisdom-images');

-- ── wisdom_shorts: scoped UPDATE for anon + authenticated ─────────────────────
create policy "wisdom_shorts_update_anon"
  on wisdom_shorts for update to anon
  using (true) with check (true);

create policy "wisdom_shorts_update_auth"
  on wisdom_shorts for update to authenticated
  using (true) with check (true);
