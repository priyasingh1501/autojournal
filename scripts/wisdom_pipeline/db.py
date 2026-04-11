"""
Supabase writer — maps pipeline output to the wisdom_shorts schema and upserts.

The table requires two extra columns for the two-axis model. If they don't exist,
run this once in the Supabase SQL editor:

  ALTER TABLE wisdom_shorts ADD COLUMN IF NOT EXISTS discipline      text;
  ALTER TABLE wisdom_shorts ADD COLUMN IF NOT EXISTS confidence_level text;
"""

from __future__ import annotations

import logging
from typing import Optional
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY

log = logging.getLogger(__name__)
_supabase: Optional[Client] = None


def get_client() -> Client:
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in .env or environment."
            )
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase


def existing_ids() -> set[str]:
    """Fetch all IDs currently in the table for deduplication."""
    sb = get_client()
    result = sb.table("wisdom_shorts").select("id").execute()
    return {row["id"] for row in (result.data or [])}


def upsert_insights(insights: list[dict], dry_run: bool = False) -> tuple[int, int]:
    """
    Upsert a list of insight dicts to wisdom_shorts.
    Returns (inserted_count, skipped_count).
    """
    if not insights:
        return 0, 0

    rows = [_to_row(ins) for ins in insights]
    if dry_run:
        log.info("[DRY RUN] Would upsert %d rows", len(rows))
        for r in rows:
            log.info("  → %s | %s", r["id"], r["title"])
        return len(rows), 0

    sb = get_client()
    BATCH = 50
    inserted = 0
    errors   = 0

    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        try:
            result = sb.table("wisdom_shorts").upsert(
                batch,
                on_conflict="id",   # update if same id already exists
            ).execute()
            inserted += len(batch)
            log.info("Upserted batch %d–%d (%d rows)", i + 1, i + len(batch), len(batch))
        except Exception as e:
            log.error("Upsert batch %d–%d failed: %s", i + 1, i + BATCH, e)
            errors += len(batch)

    return inserted, errors


def _to_row(ins: dict) -> dict:
    """Map an insight dict to the Supabase row schema."""
    return {
        "id":                  ins["id"],
        "title":               ins.get("title", ""),
        "short":               ins.get("short", ""),
        "pullquote":           ins.get("pullquote", ""),
        "source_author":       ins.get("source_author", ""),
        "source_url":          ins.get("source_url", ""),
        "source_type":         ins.get("source_type", "paper"),
        "themes":              ins.get("themes", []),
        "emotional_states":    ins.get("emotional_states", []),
        "cognitive_patterns":  ins.get("cognitive_patterns", []),
        "values":              ins.get("values", []),
        "enneagram_resonance": ins.get("enneagram_resonance", []),
        "cognitive_style":     ins.get("cognitive_style", []),
        "depth":               ins.get("depth", "mid"),
        "image_url":           ins.get("image_url", None),
        "image_prompt":        ins.get("image_prompt", None),
        # Two-axis model columns (add via SQL migration if missing)
        "discipline":          ins.get("discipline", None),
        "confidence_level":    ins.get("confidence_level", None),
    }
