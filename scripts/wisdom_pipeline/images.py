"""
images.py — Bulk image generation for wisdom shorts.

For every short in Supabase that has no image_url, this module:
  1. Builds a DALL-E 3 prompt from the short's fields
  2. Calls DALL-E 3 to generate the image
  3. Downloads the result
  4. Uploads it to Supabase Storage (bucket: wisdom-images)
  5. Updates the short's image_url column with the public CDN URL

Usage (from pipeline.py CLI):
  python pipeline.py --generate-images          # all missing images
  python pipeline.py --generate-images --limit 20  # batch of 20

Requirements:
  pip install openai supabase requests
  OPENAI_API_KEY and SUPABASE_URL / SUPABASE_KEY must be in .env
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import Optional

import requests
from openai import OpenAI

from config import SUPABASE_URL, SUPABASE_KEY
from db import get_client

log = logging.getLogger(__name__)

BUCKET   = "wisdom-images"
SLEEP_S  = 8   # DALL-E 3 rate limit: ~7 images/min on standard tier


# ── DALL-E prompt builder ─────────────────────────────────────────────────────

def _build_prompt(short: dict) -> str:
    """
    Build a DALL-E 3 prompt from a short's stored image_prompt field,
    falling back to an auto-built prompt from themes + title.
    """
    stored = short.get("image_prompt", "").strip()
    if stored:
        return stored

    t1 = (short.get("themes") or ["wisdom"])[0]
    t2 = short.get("themes", [])[1] if len(short.get("themes", [])) > 1 else None
    theme_str = f"{t1} and {t2}" if t2 else t1
    title = short.get("title", "inner life")
    return (
        f'A luminous surreal digital painting embodying: "{title}". '
        f"Themes of {theme_str}. "
        "Warm golden amber light, ethereal dreamlike atmosphere, symbolic imagery, "
        "cinematic depth, no text, no legible letters, masterpiece quality."
    )


# ── Supabase Storage helpers ──────────────────────────────────────────────────

def _ensure_bucket() -> None:
    """Create the storage bucket if it does not exist yet."""
    sb = get_client()
    existing = sb.storage.list_buckets()
    names = [b.name for b in existing]
    if BUCKET not in names:
        sb.storage.create_bucket(BUCKET, options={"public": True})
        log.info("Created Supabase Storage bucket: %s", BUCKET)


def _upload(short_id: str, image_bytes: bytes) -> str:
    """
    Upload image_bytes to Supabase Storage and return the public CDN URL.
    """
    sb    = get_client()
    path  = f"shorts/{short_id}.jpg"

    # upsert=True overwrites an existing file with the same path
    sb.storage.from_(BUCKET).upload(
        path,
        image_bytes,
        file_options={"content-type": "image/jpeg", "upsert": "true"},
    )

    url_resp = sb.storage.from_(BUCKET).get_public_url(path)
    return url_resp


def _update_image_url(short_id: str, url: str) -> None:
    sb = get_client()
    sb.table("wisdom_shorts").update({"image_url": url}).eq("id", short_id).execute()


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_images(limit: Optional[int] = None, dry_run: bool = False) -> tuple[int, int]:
    """
    Generate and upload images for all shorts with no image_url.

    Returns (generated_count, error_count).
    """
    sb = get_client()

    # Fetch shorts with no image_url
    query = (
        sb.table("wisdom_shorts")
        .select("id, title, themes, image_prompt")
        .is_("image_url", "null")
        .order("created_at", desc=False)
    )
    if limit:
        query = query.limit(limit)

    result = query.execute()
    shorts = result.data or []

    if not shorts:
        log.info("[Images] All shorts already have images.")
        return 0, 0

    log.info("[Images] %d shorts need images%s", len(shorts),
             f" (capped at {limit})" if limit else "")

    if dry_run:
        for s in shorts[:5]:
            prompt = _build_prompt(s)
            log.info("[DRY RUN] %s → prompt: %s…", s["id"], prompt[:80])
        return len(shorts), 0

    _ensure_bucket()

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment / .env")

    client   = OpenAI(api_key=openai_key)
    generated = 0
    errors    = 0

    for i, short in enumerate(shorts, 1):
        short_id = short["id"]
        prompt   = _build_prompt(short)

        log.info("[Images] %d/%d  %s", i, len(shorts), short.get("title", "")[:60])
        log.debug("  Prompt: %s", prompt[:120])

        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1024x1024",
                quality="standard",
                n=1,
            )
            url = response.data[0].url
            if not url:
                raise ValueError("DALL-E returned no URL")

            img_bytes = requests.get(url, timeout=60).content

            public_url = _upload(short_id, img_bytes)
            _update_image_url(short_id, public_url)

            log.info("  ✓ uploaded → %s", public_url[:80])
            generated += 1

        except Exception as exc:
            log.error("  ✗ failed for %s: %s", short_id, exc)
            errors += 1

        # Respect DALL-E rate limits between requests
        if i < len(shorts):
            time.sleep(SLEEP_S)

    log.info("[Images] Done — generated: %d  errors: %d", generated, errors)
    return generated, errors
