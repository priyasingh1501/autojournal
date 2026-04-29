-- Lock down the wisdom-images bucket.
--
-- The only client-side write path goes through the `wisdom-image-upload`
-- edge function, which uses the service role and bypasses RLS. The bucket
-- is also marked public, so reads served as `getPublicUrl(...)` images
-- don't need an RLS SELECT policy either.
--
-- Net result: every existing non-service-role policy is dead code. Removing
-- them closes a vector where anyone with the project anon key could write
-- arbitrary objects into this bucket (the prior `_anon` policies were
-- expected not to work due to a "hidden bucket state" but RLS shouldn't be
-- the place we rely on that).

drop policy if exists "wisdom_images_insert_anon"  on storage.objects;
drop policy if exists "wisdom_images_insert_auth"  on storage.objects;
drop policy if exists "wisdom_images_update_anon"  on storage.objects;
drop policy if exists "wisdom_images_update_auth"  on storage.objects;

-- Belt-and-braces drops for the older "Anyone can…" names from the original
-- 20260422 migration, in case a dashboard edit reintroduced them under a
-- different version.
drop policy if exists "Anyone can insert into wisdom-images" on storage.objects;
drop policy if exists "Anyone can update wisdom-images"     on storage.objects;

-- Same treatment for the wisdom_shorts table: the metadata-fill / image-url
-- update path runs from edge functions with service role. Client-side
-- updates are not part of the design.
drop policy if exists "wisdom_shorts_update_anon" on wisdom_shorts;
drop policy if exists "wisdom_shorts_update_auth" on wisdom_shorts;
drop policy if exists "Anyone can update wisdom_shorts" on wisdom_shorts;

-- Note: no replacement policies. RLS denies by default for non-service
-- roles, which is exactly what we want — the only legitimate writers are
-- the `wisdom-image-upload` and `fill-short-metadata` edge functions, both
-- of which use service role.
