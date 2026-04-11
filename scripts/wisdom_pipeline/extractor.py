"""
4-job Claude extraction pipeline.

Job 1+2+3 (combined): Extract insight units from a source chunk, rewrite in
  Untangle voice, tag with all WisdomShort fields.
Job 4: Score each unit for quality and flag keep/reject.

The combined approach (1-3 in one call) preserves the intent of the 4-job design
while halving API calls — the model can rewrite and tag simultaneously because
both operations see the same material.
"""

from __future__ import annotations

import json
import hashlib
import logging
import re
import time
from typing import Optional

import anthropic

from config import ANTHROPIC_API_KEY, EXTRACT_MODEL, FILTER_MODEL, MIN_QUALITY_SCORE, MAX_PER_CHUNK

log = logging.getLogger(__name__)
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── Valid taxonomy values (kept in sync with WisdomShort type) ────────────────

VALID_THEMES = {
    "stress", "anxiety", "fear", "loneliness", "belonging", "anger", "frustration",
    "shame", "guilt", "grief", "loss", "joy", "pleasure", "identity", "self-concept",
    "motivation", "drive", "attention", "distraction", "habit", "behavior-change",
    "decision-making", "self-compassion", "ego", "meaning", "purpose", "attachment",
    "connection", "trust", "betrayal", "power", "conflict", "uncertainty", "control",
    "mortality", "impermanence", "freedom", "responsibility", "energy", "fatigue",
    "sleep", "hunger", "craving", "interoception",
}
VALID_EMOTIONAL_STATES = {
    "anxious", "restless", "overwhelmed", "frustrated", "angry", "ashamed", "guilty",
    "grieving", "lonely", "isolated", "disconnected", "numb", "hopeless", "stuck",
    "striving", "seeking", "curious", "content", "unfulfilled", "comparing", "insecure",
    "envious", "purposeless", "empty",
}
VALID_COGNITIVE_PATTERNS = {
    "rumination", "catastrophising", "all-or-nothing", "approval-seeking", "perfectionism",
    "over-analysis", "future-orientation", "personalisation", "social-evaluation",
    "avoidance", "withdrawal", "emotional-suppression", "comparison",
    "learned-helplessness", "should-statements", "philosophical",
}
VALID_COGNITIVE_STYLES = {"analytical", "reflective", "intuitive", "practical"}
VALID_VALUES = {
    "authenticity", "freedom", "security", "connection", "achievement", "clarity",
    "peace", "integrity", "self-worth", "meaning", "truth", "belonging",
}
VALID_DEPTH    = {"entry", "mid", "deep"}
VALID_CONFIDENCE = {"high", "moderate", "philosophical"}
VALID_DISCIPLINES = {
    "neuroscience", "evolutionary_biology", "psychology", "philosophy", "behavioral_economics",
}
VALID_SOURCE_TYPES = {"video", "essay", "book", "talk", "paper"}


# ── System prompts ────────────────────────────────────────────────────────────

_EXTRACT_SYSTEM = """\
You are building the wisdom content library for Untangle — a journaling app that helps \
people understand their inner lives through science and philosophy.

TARGET LENGTH: 100–150 words. No more. Short sentences. Plain words. One idea per short.

VOICE — think of a brilliant friend who happens to know the science. They're talking to you at dinner, not writing a paper. They get to the point fast and leave space for the idea to land.

LANGUAGE RULES (hard constraints):
• No chemical names (not "corticotropin-releasing factor", not "dynorphin"). Say what it does: "a stress chemical", "a compound that makes things feel bleak".
• No anatomical terms. Not "prefrontal cortex" — "the part of your brain that pumps the brakes". Not "amygdala" — "your threat-detection system". Not "basal ganglia" — "the circuits that run your habits".
• No academic concepts. Not "incentive salience" — "the urgent sense that something matters". Not "negative reinforcement" — "escaping pain rather than seeking pleasure".
• Test: would a curious 22-year-old understand this without Googling anything? If no, rewrite.

EXAMPLES OF GOOD SHORTS (match this voice and length):

Example 1 — neuroscience:
"Dopamine is widely misunderstood as the pleasure chemical. It is actually the wanting chemical. It drives you toward the reward — not the satisfaction of receiving it. The anticipation of a notification, a win, or an achievement floods you with dopamine. But the arrival of that thing often doesn't. This is why modern life, engineered for maximum stimulation, is producing a generation that cannot sit still and cannot feel satisfied."

Example 2 — psychology/philosophy:
"Every instance of suffering involves a comparison — this is how things are, and this is how they should be. Pain arises from the gap between the two. Watch any grievance and you'll find the hidden comparison underneath it. Who decided how things should be? A conditioned mind, shaped by fear, memory, and social expectation."

Example 3 — neuroscience with story:
"A zebra on the savannah activates a stress response when chased by a lion, then — if it survives — switches it off completely. Humans activate the same physiological response to a lion, a job review, a social media argument, and a memory from three years ago. We are the only animals who can turn on the stress response just by thinking. And we leave it on. That sustained activation is what destroys us."

WHAT MAKES A GOOD INSIGHT UNIT:
• Non-obvious — the reader shouldn't already know this
• Standalone — understandable without the source
• One clear idea — don't pack in multiple mechanisms
• Changes how you see something, doesn't tell you what to do
• Directly grounded in the source — do not invent or extrapolate

OUTPUT FORMAT — return a JSON array. Each element must have ALL these fields \
(no extras, no omissions):

{
  "id": "snake_case, max 45 chars. Format: authorabbrev_topic, e.g. 'sapolsky_dopamine_prediction'",
  "title": "Punchy 5-10 word title. No 'The' opener. E.g. 'Dopamine Fires Before You Get What You Want'",
  "short": "100-150 word insight in Untangle voice. Plain prose, no markdown, no bullet points.",
  "pullquote": "One sentence extracted verbatim from 'short' — the most resonant standalone line.",
  "source_author": "Full author name or institution name",
  "source_url": "URL, DOI, or reference string",
  "source_type": "video|essay|book|talk|paper",
  "discipline": "neuroscience|evolutionary_biology|psychology|philosophy|behavioral_economics",
  "themes": ["1-4 items from: stress, anxiety, fear, loneliness, belonging, anger, frustration, shame, guilt, grief, loss, joy, pleasure, identity, self-concept, motivation, drive, attention, distraction, habit, behavior-change, decision-making, self-compassion, ego, meaning, purpose, attachment, connection, trust, betrayal, power, conflict, uncertainty, control, mortality, impermanence, freedom, responsibility, energy, fatigue, sleep, hunger, craving, interoception"],
  "emotional_states": ["1-4 items from: anxious, restless, overwhelmed, frustrated, angry, ashamed, guilty, grieving, lonely, isolated, disconnected, numb, hopeless, stuck, striving, seeking, curious, content, unfulfilled, comparing, insecure, envious, purposeless, empty"],
  "cognitive_patterns": ["1-3 items from: rumination, catastrophising, all-or-nothing, approval-seeking, perfectionism, over-analysis, future-orientation, personalisation, social-evaluation, avoidance, withdrawal, emotional-suppression, comparison, learned-helplessness, should-statements, philosophical"],
  "enneagram_resonance": [0-3 integers from 1-9],
  "cognitive_style": ["1-2 items from: analytical, reflective, intuitive, practical"],
  "values": ["1-3 items from: authenticity, freedom, security, connection, achievement, clarity, peace, integrity, self-worth, meaning, truth, belonging"],
  "depth": "entry (accessible, surface insight) | mid (requires reflection) | deep (existential/identity level)",
  "confidence_level": "high (well-replicated science) | moderate (emerging/mixed evidence) | philosophical (wisdom tradition, not science)"
}

Return ONLY valid JSON — a top-level array. No preamble, no trailing text.\
"""

_FILTER_SYSTEM = """\
You are a quality filter for a wisdom content library.

Score each insight on 4 criteria, each 1–10:
  clarity       — Is the idea expressed with precision and zero ambiguity?
  non_obvious   — Does it go beyond common knowledge or wellness platitudes?
  voice_fit     — Direct, contemporary, not preachy, no jargon a layperson would need to Google? Penalise chemical names, anatomical Latin, and research terminology that hasn't been translated into plain English.
  standalone    — Fully understandable without reading the original source?

keep = true when (clarity + non_obvious + voice_fit + standalone) >= 28.

Return ONLY a JSON array — one object per input insight:
[{"id": "...", "clarity": N, "non_obvious": N, "voice_fit": N, "standalone": N, "total": N, "keep": bool}]
\
"""


# ── Job 1-3: Extract + rewrite + tag ─────────────────────────────────────────

def extract_insights(chunk: dict) -> list[dict]:
    """
    Run Jobs 1-3 on a single source chunk.
    Returns a list of raw insight dicts (unscored).
    """
    context = (
        f"Source: {chunk['source_author']} — {chunk['title']}\n"
        f"Type: {chunk['source_type']} | Discipline: {chunk['discipline']}\n"
        f"URL: {chunk['source_url']}\n\n"
        f"--- SOURCE TEXT ---\n{chunk['text']}\n--- END ---\n\n"
        f"Extract up to {MAX_PER_CHUNK} distinct insight units. "
        f"Prefer quality over quantity — skip thin or obvious material."
    )

    try:
        response = client.messages.create(
            model=EXTRACT_MODEL,
            max_tokens=4096,
            system=_EXTRACT_SYSTEM,
            messages=[{"role": "user", "content": context}],
        )
        raw = response.content[0].text.strip() if response.content else ""
        insights = _parse_json_array(raw)
    except anthropic.RateLimitError:
        log.warning("Rate limit hit — sleeping 60s")
        time.sleep(60)
        return extract_insights(chunk)  # single retry
    except Exception as e:
        log.error("Extraction failed: %s", e)
        return []

    # Normalise + validate fields
    cleaned = []
    for ins in insights:
        ins = _normalise(ins, chunk)
        if ins:
            cleaned.append(ins)

    log.info("Extracted %d insights from chunk (%s)", len(cleaned), chunk["title"][:50])
    return cleaned


# ── Job 4: Score + filter ─────────────────────────────────────────────────────

def score_and_filter(insights: list[dict]) -> list[dict]:
    """
    Run Job 4 on a batch of insight dicts.
    Returns only the ones that pass the quality threshold.
    """
    if not insights:
        return []

    summaries = [
        {"id": ins["id"], "title": ins["title"], "short": ins["short"][:300]}
        for ins in insights
    ]

    try:
        response = client.messages.create(
            model=FILTER_MODEL,
            max_tokens=1024,
            system=_FILTER_SYSTEM,
            messages=[{"role": "user", "content": json.dumps(summaries)}],
        )
        raw = response.content[0].text.strip() if response.content else ""
        scores = _parse_json_array(raw)
    except anthropic.RateLimitError:
        log.warning("Rate limit hit (filter) — sleeping 30s")
        time.sleep(30)
        return score_and_filter(insights)
    except Exception as e:
        log.error("Scoring failed: %s", e)
        # On scoring failure, pass everything through (conservative)
        return insights

    score_map = {s["id"]: s for s in scores if isinstance(s, dict)}
    kept = []
    for ins in insights:
        score = score_map.get(ins["id"])
        if score is None:
            log.debug("No score for %s — keeping by default", ins["id"])
            kept.append(ins)
            continue
        total = score.get("total", 0)
        keep  = score.get("keep", total >= MIN_QUALITY_SCORE)
        ins["_score"] = score
        if keep:
            kept.append(ins)
        else:
            log.debug("Rejected %s (score %d): c=%s no=%s vf=%s sa=%s",
                      ins["id"], total,
                      score.get("clarity"), score.get("non_obvious"),
                      score.get("voice_fit"), score.get("standalone"))

    log.info("Filter: %d/%d passed (threshold %d)", len(kept), len(insights), MIN_QUALITY_SCORE)
    return kept


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json_array(text: str) -> list:
    """Extract the first JSON array from a string, tolerating preamble/postamble."""
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    start = text.find("[")
    end   = text.rfind("]")
    if start == -1 or end == -1:
        log.warning("No JSON array found in response: %s", text[:200])
        return []
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as e:
        log.warning("JSON parse error: %s\n...in: %s", e, text[start:start+200])
        return []


def _normalise(ins: dict, chunk: dict) -> Optional[dict]:
    """
    Validate required fields, enforce taxonomy, fall back to chunk metadata
    where the model omitted values, and generate a stable ID if missing.
    """
    # Must have non-empty short
    short = (ins.get("short") or "").strip()
    if len(short.split()) < 50:
        return None

    # ID — generate from title hash if missing or too long
    raw_id = (ins.get("id") or "").strip().lower().replace(" ", "_")
    raw_id = re.sub(r"[^a-z0-9_]", "", raw_id)[:45]
    if not raw_id:
        seed = (ins.get("title", "") + short[:50]).encode()
        raw_id = "gen_" + hashlib.md5(seed).hexdigest()[:12]
    ins["id"] = raw_id

    # Fall back to chunk metadata for source fields
    ins.setdefault("source_author", chunk["source_author"])
    ins.setdefault("source_url",    chunk["source_url"])
    ins.setdefault("source_type",   chunk["source_type"])
    ins.setdefault("discipline",    chunk["discipline"])

    # Enforce source_type
    if ins["source_type"] not in VALID_SOURCE_TYPES:
        ins["source_type"] = chunk["source_type"]

    # Enforce discipline
    if ins["discipline"] not in VALID_DISCIPLINES:
        ins["discipline"] = chunk["discipline"]

    # Filter array fields to valid values only
    ins["themes"]            = _filter_list(ins.get("themes"), VALID_THEMES, 4)
    ins["emotional_states"]  = _filter_list(ins.get("emotional_states"), VALID_EMOTIONAL_STATES, 4)
    ins["cognitive_patterns"]= _filter_list(ins.get("cognitive_patterns"), VALID_COGNITIVE_PATTERNS, 3)
    ins["cognitive_style"]   = _filter_list(ins.get("cognitive_style"), VALID_COGNITIVE_STYLES, 2)
    ins["values"]            = _filter_list(ins.get("values"), VALID_VALUES, 3)

    # Enneagram — integers 1-9 only
    raw_enn = ins.get("enneagram_resonance") or []
    ins["enneagram_resonance"] = [
        int(n) for n in raw_enn if isinstance(n, (int, float)) and 1 <= int(n) <= 9
    ][:3]

    # Depth
    if ins.get("depth") not in VALID_DEPTH:
        ins["depth"] = "mid"

    # Confidence
    if ins.get("confidence_level") not in VALID_CONFIDENCE:
        ins["confidence_level"] = "moderate"

    # Pullquote fallback
    if not ins.get("pullquote"):
        # Take the first sentence of the short
        sentences = re.split(r"(?<=[.!?])\s+", short)
        ins["pullquote"] = sentences[0] if sentences else short[:120]

    # Title fallback
    if not ins.get("title"):
        ins["title"] = short[:60] + "…"

    return ins


def _filter_list(values, valid_set: set, max_items: int) -> list:
    if not values or not isinstance(values, list):
        return []
    return [str(v).lower() for v in values if str(v).lower() in valid_set][:max_items]
