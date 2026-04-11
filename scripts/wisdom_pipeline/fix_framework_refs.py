"""
Fix wisdom shorts that reference "the framework" / "this framework" / "AP framework"
— these break the standalone rule since readers have no context for what "the framework" is.

For each affected short, rewrites only the offending sentence(s) in place, then upserts.
"""

import json
import re
import time
import logging
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

from config import ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

client  = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SYSTEM = """\
You are editing a single wisdom short (100-150 words) for a journaling app.

The short contains one or more references to "this framework", "the framework", or "AP framework".
These phrases break the standalone rule — the reader has no idea what "the framework" is.

Your job: rewrite ONLY the offending sentence(s) so the idea stands on its own without any meta-reference.
Rules:
- Do NOT change any other sentences
- Keep the same voice, length, and meaning
- Replace "this framework" / "the framework" with the actual idea it refers to
  (e.g. "This view argues that...", "Acharya Prashant's position is...", "Here, the insight is...",
   or simply restructure so the meta-reference disappears entirely)
- Return ONLY the full rewritten short — no explanation, no preamble
"""

def fix_short(short_id: str, title: str, short_text: str) -> str:
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=SYSTEM,
        messages=[{"role": "user", "content": f'Title: {title}\n\nShort:\n{short_text}'}],
    )
    return resp.content[0].text.strip()


def main():
    # Load all review files and collect framework refs
    review_dir = Path(__file__).parent / "review"
    all_shorts = []
    for f in sorted(review_dir.glob("*.json")):
        with open(f) as fp:
            all_shorts.extend(json.load(fp))

    pattern = re.compile(r'this framework|the framework|AP framework', re.I)
    to_fix = [d for d in all_shorts if pattern.search(d['short'])]
    log.info("Found %d shorts with framework references", len(to_fix))

    fixed = []
    for i, d in enumerate(to_fix):
        log.info("Fixing %d/%d: %s", i+1, len(to_fix), d['title'])
        try:
            new_short = fix_short(d['id'], d['title'], d['short'])
            # Verify the reference is gone
            if pattern.search(new_short):
                log.warning("  Still contains framework ref after rewrite — skipping: %s", d['id'])
                continue
            # Verify length is reasonable
            words = len(new_short.split())
            if words < 50 or words > 200:
                log.warning("  Unusual length (%d words) — skipping: %s", words, d['id'])
                continue
            log.info("  Fixed (%d→%d words)", len(d['short'].split()), words)
            fixed.append({'id': d['id'], 'short': new_short})
            time.sleep(0.3)
        except Exception as e:
            log.error("  Failed %s: %s", d['id'], e)

    log.info("Upserting %d fixed shorts to Supabase…", len(fixed))
    for item in fixed:
        try:
            supabase.table("wisdom_shorts").update({"short": item["short"]}).eq("id", item["id"]).execute()
            log.info("  Updated: %s", item["id"])
        except Exception as e:
            log.error("  Upsert failed %s: %s", item["id"], e)

    log.info("Done. Fixed %d/%d shorts.", len(fixed), len(to_fix))


if __name__ == "__main__":
    main()
