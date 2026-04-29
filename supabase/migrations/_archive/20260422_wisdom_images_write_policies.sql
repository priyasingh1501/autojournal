-- Allows the mobile app (anon key) to write generated images back:
--   1. UPDATE wisdom_shorts.image_url after uploading to storage
--   2. INSERT/UPDATE objects in the wisdom-images storage bucket
--
-- Context: the table previously had only a public SELECT policy, so the app's
-- fire-and-forget `update({ image_url })` in WisdomImageService silently hit 0
-- rows under RLS. Images generated on-device never persisted beyond local cache,
-- leaving only the service-role-backfilled rows (9 at time of writing).

-- ── wisdom_shorts: allow UPDATE from anon ─────────────────────────────────────
create policy "Anyone can update wisdom_shorts"
  on wisdom_shorts for update
  using (true)
  with check (true);

-- ── storage.objects: allow writes to wisdom-images bucket ─────────────────────
create policy "Anyone can insert into wisdom-images"
  on storage.objects for insert
  with check (bucket_id = 'wisdom-images');

create policy "Anyone can update wisdom-images"
  on storage.objects for update
  using (bucket_id = 'wisdom-images')
  with check (bucket_id = 'wisdom-images');
