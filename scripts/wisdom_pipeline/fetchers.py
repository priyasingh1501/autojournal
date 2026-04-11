"""
Fetchers — one function per source type.

Each fetcher returns a list of SourceChunk dicts:
  {
    "text":         str,           # raw text to feed into the extractor
    "source_author": str,
    "source_url":   str,
    "source_type":  str,           # video|essay|book|talk|paper
    "discipline":   str,           # neuroscience|psychology|philosophy|...
    "title":        str,           # article/video title for context
  }
"""

import time
import logging
import textwrap
from typing import Iterator

import requests
from bs4 import BeautifulSoup

from config import CHUNK_WORDS, CHUNK_OVERLAP

log = logging.getLogger(__name__)


# ── Chunking helper ───────────────────────────────────────────────────────────

def chunk_text(text: str) -> list[str]:
    """Split text into overlapping word windows."""
    words = text.split()
    if len(words) <= CHUNK_WORDS:
        return [text]
    chunks = []
    step = CHUNK_WORDS - CHUNK_OVERLAP
    for i in range(0, len(words), step):
        chunk = " ".join(words[i : i + CHUNK_WORDS])
        if chunk.strip():
            chunks.append(chunk)
        if i + CHUNK_WORDS >= len(words):
            break
    return chunks


# ── PubMed ────────────────────────────────────────────────────────────────────

PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
PUBMED_HEADERS = {"User-Agent": "untangle-wisdom-pipeline/1.0 (mailto:pipeline@untangle.app)"}


def fetch_pubmed(query: str, discipline: str, max_results: int = 30) -> list[dict]:
    """
    Search PubMed and return source chunks from abstracts.
    Rate-limited to 3 req/s (NCBI guideline).
    """
    # Search for IDs
    search_resp = requests.get(PUBMED_SEARCH, params={
        "db":      "pubmed",
        "term":    query,
        "retmax":  max_results,
        "retmode": "json",
        "sort":    "relevance",
    }, headers=PUBMED_HEADERS, timeout=15)
    search_resp.raise_for_status()
    ids = search_resp.json().get("esearchresult", {}).get("idlist", [])

    if not ids:
        log.info("PubMed: no results for '%s'", query)
        return []

    time.sleep(0.35)  # stay under 3 req/s

    # Fetch abstracts in one batch call
    fetch_resp = requests.get(PUBMED_FETCH, params={
        "db":      "pubmed",
        "id":      ",".join(ids),
        "rettype": "medline",
        "retmode": "text",
    }, headers=PUBMED_HEADERS, timeout=30)
    fetch_resp.raise_for_status()

    time.sleep(0.35)

    # Split into per-paper sections on PMID marker
    raw = fetch_resp.text
    papers = _split_pubmed_text(raw)

    chunks = []
    for paper in papers:
        title   = paper.get("title", "PubMed Paper")
        pmid    = paper.get("pmid", "")
        authors = paper.get("authors", "Unknown")
        abstract = paper.get("abstract", "").strip()
        if len(abstract) < 80:
            continue  # skip papers with no real abstract
        url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else "https://pubmed.ncbi.nlm.nih.gov/"
        for chunk in chunk_text(abstract):
            chunks.append({
                "text":          f"Title: {title}\nAuthors: {authors}\n\n{chunk}",
                "source_author": authors,
                "source_url":    url,
                "source_type":   "paper",
                "discipline":    discipline,
                "title":         title,
            })
    log.info("PubMed '%s': %d papers → %d chunks", query, len(papers), len(chunks))
    return chunks


def _split_pubmed_text(raw: str) -> list[dict]:
    """Parse the flat text block PubMed returns into per-paper dicts."""
    papers = []
    current: dict = {}
    section = None

    for line in raw.splitlines():
        if line.startswith("PMID-"):
            if current:
                papers.append(current)
            current = {"pmid": line.split("-", 1)[1].strip(), "abstract": ""}
            section = None
        elif line.startswith("TI  -"):
            current["title"] = line.split("-", 1)[1].strip()
            section = "title"
        elif line.startswith("AU  -"):
            current.setdefault("authors", line.split("-", 1)[1].strip())
        elif line.startswith("AB  -"):
            current["abstract"] += line.split("-", 1)[1].strip() + " "
            section = "abstract"
        elif line.startswith("      ") and section == "abstract":
            current["abstract"] += line.strip() + " "
        elif line.startswith("      ") and section == "title":
            current["title"] = current.get("title", "") + " " + line.strip()
        elif line.strip() == "":
            section = None

    if current:
        papers.append(current)
    return papers


# ── YouTube transcripts ───────────────────────────────────────────────────────

def fetch_youtube(video_id: str, channel: str, discipline: str,
                  source_type: str, source_url: str,
                  cookies_path: str | None = None) -> list[dict]:
    """
    Fetch transcript for a single YouTube video and return source chunks.
    Requires: pip install youtube-transcript-api

    If YouTube blocks requests (IpBlocked error), export cookies from your
    browser (e.g. using the "Get cookies.txt LOCALLY" Chrome extension) and
    pass the path via cookies_path, or set YOUTUBE_COOKIES_FILE in .env.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
    except ImportError:
        log.error("youtube-transcript-api not installed. Run: pip install youtube-transcript-api")
        return []

    # Resolve cookies path: arg > env var > none
    import os
    resolved_cookies = cookies_path or os.environ.get("YOUTUBE_COOKIES_FILE")

    try:
        api = YouTubeTranscriptApi(cookies=resolved_cookies) if resolved_cookies else YouTubeTranscriptApi()
        transcript_list = api.fetch(video_id, languages=["en"])
    except (NoTranscriptFound, TranscriptsDisabled) as e:
        log.warning("YouTube %s: %s", video_id, e)
        return []
    except Exception as e:
        log.warning("YouTube %s unexpected error: %s", video_id, e)
        return []

    # Join all segments into continuous prose (handle both object and dict formats)
    def _seg_text(seg):
        return (seg.text if hasattr(seg, "text") else seg["text"]).replace("\n", " ")
    full_text = " ".join(_seg_text(seg) for seg in transcript_list)
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    chunks = []
    for chunk in chunk_text(full_text):
        chunks.append({
            "text":          chunk,
            "source_author": channel,
            "source_url":    video_url,
            "source_type":   source_type,
            "discipline":    discipline,
            "title":         f"{channel} — {video_id}",
        })
    log.info("YouTube %s (%s): %d chunks", video_id, channel, len(chunks))
    return chunks


# ── Web scraper ───────────────────────────────────────────────────────────────

_WEB_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; untangle-wisdom-pipeline/1.0)"
}


def fetch_web_article(url: str, source_author: str, discipline: str,
                      source_type: str, article_selector: str = "article p") -> list[dict]:
    """
    Fetch a single article page and return source chunks.
    article_selector: CSS selector for content paragraphs.
    """
    try:
        resp = requests.get(url, headers=_WEB_HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.warning("Web fetch failed %s: %s", url, e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    title_el = soup.find("h1") or soup.find("title")
    title = title_el.get_text(strip=True) if title_el else url

    paragraphs = soup.select(article_selector)
    text = " ".join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 40)

    if len(text.split()) < 80:
        log.debug("Web %s: too short after extraction, skipping", url)
        return []

    chunks = []
    for chunk in chunk_text(text):
        chunks.append({
            "text":          chunk,
            "source_author": source_author,
            "source_url":    url,
            "source_type":   source_type,
            "discipline":    discipline,
            "title":         title,
        })
    return chunks


def fetch_web_source_list(source_cfg: dict, max_articles: int = 30) -> list[dict]:
    """
    Crawl a source's listing page, collect article URLs, then scrape each one.
    """
    list_url   = source_cfg["list_url"]
    list_sel   = source_cfg.get("list_selector", "a")
    art_sel    = source_cfg.get("article_selector", "article p")

    try:
        resp = requests.get(list_url, headers=_WEB_HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.warning("Web list fetch failed %s: %s", list_url, e)
        return []

    soup  = BeautifulSoup(resp.text, "lxml")
    links = soup.select(list_sel)

    from urllib.parse import urljoin
    base = "/".join(list_url.split("/")[:3])  # scheme + host

    url_filter = source_cfg.get("url_filter")  # optional substring that must appear in URL

    urls = []
    seen = set()
    for a in links:
        href = a.get("href", "")
        full = urljoin(base, href)
        if url_filter and url_filter not in full:
            continue
        if full not in seen and full.startswith("http"):
            seen.add(full)
            urls.append(full)
        if len(urls) >= max_articles:
            break

    all_chunks = []
    for url in urls:
        chunks = fetch_web_article(
            url=url,
            source_author=source_cfg["source_author"],
            discipline=source_cfg["discipline"],
            source_type=source_cfg["source_type"],
            article_selector=art_sel,
        )
        all_chunks.extend(chunks)
        time.sleep(0.5)  # polite crawl rate

    log.info("Web source '%s': %d articles → %d chunks", source_cfg["name"], len(urls), len(all_chunks))
    return all_chunks


# ── PDF / plain text file ─────────────────────────────────────────────────────

def fetch_text_file(path: str, source_author: str, source_url: str,
                    discipline: str, source_type: str = "book") -> list[dict]:
    """
    Ingest a plain .txt file (e.g. pasted book excerpts, Kindle highlights).
    For PDFs, pre-convert with: pdftotext book.pdf book.txt
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as e:
        log.error("Cannot read file %s: %s", path, e)
        return []

    import os
    title = os.path.basename(path)
    chunks = []
    for chunk in chunk_text(text):
        chunks.append({
            "text":          chunk,
            "source_author": source_author,
            "source_url":    source_url,
            "source_type":   source_type,
            "discipline":    discipline,
            "title":         title,
        })
    log.info("File '%s': %d chunks", path, len(chunks))
    return chunks


# ── Semantic Scholar (bonus — richer citation context) ────────────────────────

SS_SEARCH = "https://api.semanticscholar.org/graph/v1/paper/search"


def fetch_semantic_scholar(query: str, discipline: str, max_results: int = 20) -> list[dict]:
    """
    Semantic Scholar API — returns abstracts with author + year context.
    No auth required for basic use (rate limit: 100 req/5 min).
    """
    try:
        resp = requests.get(SS_SEARCH, params={
            "query":  query,
            "limit":  max_results,
            "fields": "title,abstract,authors,year,externalIds",
        }, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.warning("Semantic Scholar '%s' failed: %s", query, e)
        return []

    time.sleep(0.5)
    papers = resp.json().get("data", [])
    chunks = []

    for p in papers:
        abstract = (p.get("abstract") or "").strip()
        if len(abstract) < 80:
            continue
        title   = p.get("title", "")
        authors = ", ".join(a["name"] for a in p.get("authors", [])[:3])
        year    = p.get("year", "")
        doi     = (p.get("externalIds") or {}).get("DOI", "")
        url     = f"https://doi.org/{doi}" if doi else "https://www.semanticscholar.org/"
        for chunk in chunk_text(abstract):
            chunks.append({
                "text":          f"Title: {title} ({year})\nAuthors: {authors}\n\n{chunk}",
                "source_author": authors or "Unknown",
                "source_url":    url,
                "source_type":   "paper",
                "discipline":    discipline,
                "title":         title,
            })

    log.info("Semantic Scholar '%s': %d papers → %d chunks", query, len(papers), len(chunks))
    return chunks
