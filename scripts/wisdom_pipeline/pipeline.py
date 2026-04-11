#!/usr/bin/env python3
"""
Untangle Wisdom Pipeline — CLI entry point.

Usage examples:

  # Run all configured PubMed queries (primary route to 500 shorts):
  python pipeline.py --source pubmed

  # Run a single ad-hoc PubMed query:
  python pipeline.py --source pubmed --query "loneliness immune system" --discipline neuroscience

  # Transcribe one YouTube video:
  python pipeline.py --source youtube --video-id GiLlIUlMDNg --channel "Acharya Prashant" --discipline philosophy --source-type talk

  # Scrape all configured web sources:
  python pipeline.py --source web

  # Ingest a text file (pasted book excerpts, Kindle highlights):
  python pipeline.py --source file --file highlights/sapolsky.txt --author "Robert Sapolsky" --discipline neuroscience

  # Preview what would be inserted (no DB write):
  python pipeline.py --source pubmed --dry-run

  # Show current library size:
  python pipeline.py --status
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

from config import PUBMED_QUERIES, YOUTUBE_SOURCES, WEB_SOURCES, TARGET_TOTAL
from fetchers import (
    fetch_pubmed,
    fetch_youtube,
    fetch_web_source_list,
    fetch_web_article,
    fetch_text_file,
    fetch_semantic_scholar,
)
from extractor import extract_insights, score_and_filter
from db import existing_ids, upsert_insights, get_client
from images import generate_images

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Local review cache — every run appends generated (pre-DB) insights here
REVIEW_DIR = Path(__file__).parent / "review"


def save_for_review(insights: list[dict], tag: str) -> Path:
    """Write insights to a local JSON file for human review."""
    REVIEW_DIR.mkdir(exist_ok=True)
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = REVIEW_DIR / f"{ts}_{tag}.json"
    with open(path, "w") as f:
        json.dump(insights, f, indent=2, ensure_ascii=False)
    log.info("Review file: %s (%d entries)", path, len(insights))
    return path


# ── Processing pipeline ───────────────────────────────────────────────────────

def process_chunks(chunks: list[dict], known_ids: set[str]) -> list[dict]:
    """Extract → score → deduplicate a list of source chunks."""
    all_insights: list[dict] = []

    for i, chunk in enumerate(chunks, 1):
        log.info("Processing chunk %d/%d — %s", i, len(chunks), chunk["title"][:60])
        raw = extract_insights(chunk)
        if not raw:
            continue

        # De-duplicate against DB and current batch before scoring
        novel = [ins for ins in raw if ins["id"] not in known_ids]
        deduped_ids = {ins["id"] for ins in novel}
        known_ids.update(deduped_ids)

        scored = score_and_filter(novel)
        all_insights.extend(scored)

        # Brief pause between chunks to stay inside rate limits
        if i < len(chunks):
            time.sleep(1.5)

    return all_insights


# ── Source runners ────────────────────────────────────────────────────────────

def run_pubmed(args, known_ids: set[str]) -> list[dict]:
    if args.query:
        queries = [{"query": args.query, "discipline": args.discipline or "neuroscience"}]
    else:
        queries = PUBMED_QUERIES
    dry_run_cap = 5 if args.dry_run else None

    log.info("PubMed: %d queries", len(queries))
    all_insights: list[dict] = []

    for q in queries:
        log.info("  → '%s' [%s]", q["query"], q["discipline"])
        chunks = fetch_pubmed(q["query"], q["discipline"])
        insights = process_chunks(chunks, known_ids)
        all_insights.extend(insights)
        log.info("  Running total: %d new shorts", len(all_insights))
        if dry_run_cap and len(all_insights) >= dry_run_cap:
            all_insights = all_insights[:dry_run_cap]
            break

    return all_insights


def run_youtube(args, known_ids: set[str]) -> list[dict]:
    if args.video_id:
        sources = [{
            "channel":    args.channel or "Unknown",
            "discipline": args.discipline or "philosophy",
            "source_type": args.source_type or "talk",
            "source_url": f"https://www.youtube.com/watch?v={args.video_id}",
            "video_ids":  [args.video_id],
        }]
    else:
        sources = YOUTUBE_SOURCES
        if args.channel_filter:
            sources = [s for s in sources if args.channel_filter.lower() in s["channel"].lower()]
            log.info("Channel filter '%s' matched %d source(s)", args.channel_filter, len(sources))

    all_insights: list[dict] = []
    for src in sources:
        for vid_id in src["video_ids"]:
            chunks = fetch_youtube(
                video_id=vid_id,
                channel=src["channel"],
                discipline=src["discipline"],
                source_type=src["source_type"],
                source_url=src["source_url"],
            )
            insights = process_chunks(chunks, known_ids)
            all_insights.extend(insights)

    return all_insights


def run_web(args, known_ids: set[str]) -> list[dict]:
    all_insights: list[dict] = []
    for src in WEB_SOURCES:
        chunks = fetch_web_source_list(src)
        insights = process_chunks(chunks, known_ids)
        all_insights.extend(insights)
    return all_insights


def run_file(args, known_ids: set[str]) -> list[dict]:
    if not args.file:
        log.error("--file required for --source file")
        return []
    chunks = fetch_text_file(
        path=args.file,
        source_author=args.author or "Unknown",
        source_url=args.url or args.file,
        discipline=args.discipline or "psychology",
        source_type=args.source_type or "book",
    )
    return process_chunks(chunks, known_ids)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Untangle Wisdom Pipeline")
    parser.add_argument("--source", choices=["pubmed", "youtube", "web", "file", "all"],
                        help="Which source to run")
    parser.add_argument("--query",       help="(pubmed) ad-hoc search query")
    parser.add_argument("--discipline",  help="Discipline override for ad-hoc runs")
    parser.add_argument("--video-id",       help="(youtube) single video ID")
    parser.add_argument("--channel",        help="(youtube) channel name for ad-hoc run")
    parser.add_argument("--channel-filter", help="(youtube) filter config sources by channel name substring")
    parser.add_argument("--source-type", help="Source type override (video|essay|book|talk|paper)")
    parser.add_argument("--file",        help="(file) path to text file")
    parser.add_argument("--author",      help="(file) author name")
    parser.add_argument("--url",         help="(file) canonical source URL")
    parser.add_argument("--dry-run",         action="store_true",
                        help="Extract and score but do not write to Supabase")
    parser.add_argument("--status",          action="store_true",
                        help="Print current library count and exit")
    parser.add_argument("--generate-images", action="store_true",
                        help="Generate DALL-E images for all shorts missing image_url")
    parser.add_argument("--limit",           type=int, default=None,
                        help="(--generate-images) max number of images to generate per run")
    args = parser.parse_args()

    # ── Image generation ──────────────────────────────────────────────────────
    if args.generate_images:
        generated, errors = generate_images(limit=args.limit, dry_run=args.dry_run)
        print(f"\nImages: {generated} generated, {errors} errors\n")
        return

    # ── Status check ──────────────────────────────────────────────────────────
    if args.status:
        ids = existing_ids()
        remaining = max(0, TARGET_TOTAL - len(ids))
        print(f"\nLibrary: {len(ids)} / {TARGET_TOTAL} shorts")
        print(f"Remaining to target: {remaining}\n")
        return

    if not args.source:
        parser.print_help()
        sys.exit(1)

    # ── Load existing IDs for deduplication ───────────────────────────────────
    log.info("Loading existing IDs from Supabase…")
    known_ids = existing_ids()
    log.info("Existing library: %d shorts (target: %d, need: %d)",
             len(known_ids), TARGET_TOTAL, max(0, TARGET_TOTAL - len(known_ids)))

    if len(known_ids) >= TARGET_TOTAL:
        log.info("Target already met. Exiting.")
        return

    # ── Run selected source ───────────────────────────────────────────────────
    source = args.source
    if source == "pubmed" or source == "all":
        insights = run_pubmed(args, known_ids)
        _finish(insights, "pubmed", args.dry_run, known_ids)

    if source == "youtube" or source == "all":
        insights = run_youtube(args, known_ids)
        _finish(insights, "youtube", args.dry_run, known_ids)

    if source == "web" or source == "all":
        insights = run_web(args, known_ids)
        _finish(insights, "web", args.dry_run, known_ids)

    if source == "file":
        insights = run_file(args, known_ids)
        _finish(insights, "file", args.dry_run, known_ids)

    # Final status
    if not args.dry_run:
        final_count = len(existing_ids())
        log.info("Library now at %d / %d shorts", final_count, TARGET_TOTAL)


def _finish(insights: list[dict], tag: str, dry_run: bool, known_ids: set[str]):
    if not insights:
        log.info("[%s] No new insights generated.", tag.upper())
        return

    review_path = save_for_review(insights, tag)
    log.info("[%s] %d insights ready → %s", tag.upper(), len(insights), review_path)

    inserted, errors = upsert_insights(insights, dry_run=dry_run)
    if not dry_run:
        log.info("[%s] Upserted %d, errors %d", tag.upper(), inserted, errors)


if __name__ == "__main__":
    main()
