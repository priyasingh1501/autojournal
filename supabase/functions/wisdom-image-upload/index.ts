/**
 * wisdom-image-upload — uploads a generated wisdom image to Storage and writes
 * the public URL back to `wisdom_shorts.image_url`.
 *
 * Exists because the `wisdom-images` bucket has some hidden server-side state
 * (created 2026-04-12) that blocks anon uploads with "new row violates RLS",
 * despite identical PG policies working for newer buckets. Using service role
 * on the server side sidesteps the RLS layer entirely.
 *
 * Body: { short_id: string, image_base64: string (no data: prefix) }
 * Returns: { public_url: string }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'wisdom-images';
// 1024×1024 standard JPEG is well under 1 MB; 5 MB base64 (~3.6 MB binary)
// gives generous headroom while bounding storage growth from a malicious or
// runaway client that sends a huge payload.
const MAX_IMAGE_BASE64_LEN = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  try {
    const { short_id, image_base64 } = await req.json();

    if (typeof short_id !== 'string' || !short_id) {
      throw new Error('short_id is required');
    }
    if (typeof image_base64 !== 'string' || !image_base64) {
      throw new Error('image_base64 is required');
    }
    if (image_base64.length > MAX_IMAGE_BASE64_LEN) {
      throw new Error(`image_base64 exceeds ${MAX_IMAGE_BASE64_LEN} bytes`);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Decode base64 → Uint8Array for upload
    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));
    const path = `shorts/${short_id}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updateError } = await supabase
      .from('wisdom_shorts')
      .update({ image_url: publicUrl })
      .eq('id', short_id);

    if (updateError) throw new Error(`wisdom_shorts update failed: ${updateError.message}`);

    return new Response(JSON.stringify({ public_url: publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('wisdom-image-upload error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
