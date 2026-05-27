#!/usr/bin/env python3
"""
Fetch Google Place reviews for Piperehabilitering AS, filter to 4+ stars,
and rewrite:

  1. The HTML block between <!-- REVIEWS:BEGIN --> and <!-- REVIEWS:END -->
     on every *.html page in the repo. The block's leading indentation is
     auto-detected from the existing marker and preserved.
  2. The JSON-LD structured data:
       - index.html: add aggregateRating + review array to
         HomeAndConstructionBusiness
       - per-town pages: add aggregateRating to the Service block

Environment:
    GOOGLE_PLACES_API_KEY  required
    PIPE_REHAB_PLACE_ID    required
    REPO_PATH              required, path to the checked-out pipe-rehab repo

The script never commits — the wrapping entrypoint.sh handles git.
"""

from __future__ import annotations
import hashlib
import html
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

NORWEGIAN_MONTHS = [
    "januar", "februar", "mars", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember",
]
AVATAR_COLORS = ["#e0663e", "#1a73e8", "#9c27b0", "#2e7d32", "#f4511e", "#546e7a"]

MIN_STARS = 4
REVIEWS_GMB_LINK = "https://share.google/wmMDkxCAsKE5tbgh4"

# -----------------------------------------------------------------------------
# Places API
# -----------------------------------------------------------------------------

def fetch_place(api_key: str, place_id: str) -> dict[str, Any]:
    url = f"https://places.googleapis.com/v1/places/{place_id}?languageCode=no&regionCode=NO"
    req = urllib.request.Request(url, headers={
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,reviews,googleMapsUri",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


# -----------------------------------------------------------------------------
# Rendering
# -----------------------------------------------------------------------------

def avatar_color(name: str) -> str:
    h = hashlib.md5(name.encode("utf-8")).hexdigest()
    return AVATAR_COLORS[int(h, 16) % len(AVATAR_COLORS)]


def format_date_no(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return ""
    return f"{NORWEGIAN_MONTHS[dt.month - 1]} {dt.year}"


def star_string(rating: int) -> str:
    return "★" * rating + "☆" * (5 - rating)


def render_review_card(review: dict[str, Any]) -> str:
    author = review.get("authorAttribution", {}).get("displayName", "Anonym")
    text = ""
    tobj = review.get("text") or review.get("originalText") or {}
    if isinstance(tobj, dict):
        text = tobj.get("text", "") or ""
    rating = int(review.get("rating", 5))
    publish_time = review.get("publishTime", "")
    initial = (author.strip()[:1] or "?").upper()
    color = avatar_color(author)
    date = format_date_no(publish_time)

    parts = [
        '<article class="google-review">',
        '    <header class="review-header">',
        f'        <div class="review-avatar" style="background:{color}">{html.escape(initial)}</div>',
        '        <div class="review-meta">',
        f'            <div class="review-name">{html.escape(author)}</div>',
        f'            <div class="review-date">{html.escape(date)}</div>',
        '        </div>',
        '    </header>',
        f'    <div class="review-stars" aria-label="{rating} av 5 stjerner">{star_string(rating)}</div>',
    ]
    if text.strip():
        parts.append(f'    <p class="review-text">{html.escape(text.strip())}</p>')
    parts.append('</article>')
    return "\n".join(parts)


def render_reviews_block(place: dict[str, Any], reviews: list[dict[str, Any]]) -> str:
    rating = float(place.get("rating", 0) or 0)
    total = int(place.get("userRatingCount", 0) or 0)
    score_str = f"{rating:.1f}".replace(".", ",")
    star_count = int(round(rating))
    cards = "\n".join(render_review_card(r) for r in reviews)
    cards_indented = "\n".join("    " + l if l.strip() else l for l in cards.split("\n"))

    return "\n".join([
        '<!-- REVIEWS:BEGIN — regenerated daily from Google Places API, do not edit by hand -->',
        '<section class="reviews-section" aria-label="Anmeldelser">',
        '    <h2>Hva kundene sier</h2>',
        '    <div class="reviews-summary">',
        f'        <span class="reviews-score">{score_str}</span>',
        f'        <span class="reviews-stars" aria-label="{star_count} av 5 stjerner">★★★★★</span>',
        f'        <span class="reviews-count">basert på {total} Google-anmeldelser</span>',
        '    </div>',
        '    <div class="reviews-grid">',
        cards_indented,
        '    </div>',
        f'    <p class="reviews-link"><a href="{REVIEWS_GMB_LINK}" target="_blank" rel="noopener">Se alle anmeldelser på Google</a></p>',
        '</section>',
        '<!-- REVIEWS:END -->',
    ])


# -----------------------------------------------------------------------------
# HTML rewriting with indent preservation
# -----------------------------------------------------------------------------

BEGIN_END_RE = re.compile(
    r"(^[ \t]*)<!--\s*REVIEWS:BEGIN[^>]*-->.*?<!--\s*REVIEWS:END\s*-->",
    re.DOTALL | re.MULTILINE,
)

def rewrite_html_block(html_text: str, new_block_at_col_zero: str) -> tuple[str, bool]:
    m = BEGIN_END_RE.search(html_text)
    if not m:
        return html_text, False
    indent = m.group(1)
    indented = "\n".join(indent + line if line.strip() else line
                         for line in new_block_at_col_zero.split("\n"))
    new_text = html_text[:m.start()] + indented + html_text[m.end():]
    return new_text, new_text != html_text


# -----------------------------------------------------------------------------
# JSON-LD rewriting
# -----------------------------------------------------------------------------

LD_SCRIPT_RE = re.compile(
    r'(<script\s+type="application/ld\+json"[^>]*>)(.*?)(</script>)',
    re.DOTALL | re.IGNORECASE,
)


def build_aggregate_rating(place: dict[str, Any]) -> dict[str, Any]:
    rating = float(place.get("rating", 0) or 0)
    count = int(place.get("userRatingCount", 0) or 0)
    return {
        "@type": "AggregateRating",
        "ratingValue": f"{rating:.1f}",
        "reviewCount": str(count),
        "bestRating": "5",
        "worstRating": "1",
    }


def build_review_list(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for r in reviews:
        tobj = r.get("text") or r.get("originalText") or {}
        text = tobj.get("text", "") if isinstance(tobj, dict) else ""
        if not text.strip():
            continue
        author = r.get("authorAttribution", {}).get("displayName", "")
        pt = r.get("publishTime", "") or ""
        date = pt.split("T")[0] if "T" in pt else pt
        out.append({
            "@type": "Review",
            "author": {"@type": "Person", "name": author},
            "datePublished": date,
            "reviewRating": {
                "@type": "Rating",
                "ratingValue": str(int(r.get("rating", 5))),
                "bestRating": "5",
            },
            "reviewBody": text.strip(),
        })
    return out


def reindent_jsonld(data: dict[str, Any], outer_indent: str = "    ") -> str:
    """Serialize data and re-indent so the outer braces have `outer_indent`
    leading whitespace and content has outer_indent + 4 spaces."""
    raw = json.dumps(data, ensure_ascii=False, indent=4)
    lines = raw.split("\n")
    out_lines = []
    for line in lines:
        out_lines.append(outer_indent + line if line.strip() else line)
    return "\n" + "\n".join(out_lines) + "\n" + outer_indent


def update_jsonld_block(
    html_text: str,
    target_type: str,
    place: dict[str, Any],
    reviews: list[dict[str, Any]],
    include_review_list: bool,
) -> tuple[str, bool]:
    state = {"done": False}

    def repl(m: re.Match[str]) -> str:
        if state["done"]:
            return m.group(0)
        open_tag, body, close_tag = m.group(1), m.group(2), m.group(3)
        try:
            data = json.loads(body.strip())
        except Exception:
            return m.group(0)
        t = data.get("@type")
        matched = (target_type in t) if isinstance(t, list) else (t == target_type)
        if not matched:
            return m.group(0)
        data["aggregateRating"] = build_aggregate_rating(place)
        if include_review_list:
            data["review"] = build_review_list(reviews)
        # Detect the outer indent used on the existing opening tag to match style.
        line_start = html_text.rfind("\n", 0, m.start()) + 1
        outer_indent = html_text[line_start:m.start()]
        if not outer_indent.strip():
            outer = outer_indent
        else:
            outer = "    "
        new_body = reindent_jsonld(data, outer_indent=outer)
        state["done"] = True
        return open_tag + new_body + close_tag

    new = LD_SCRIPT_RE.sub(repl, html_text)
    return new, state["done"]


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main() -> int:
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    place_id = os.environ.get("PIPE_REHAB_PLACE_ID")
    repo_path = os.environ.get("REPO_PATH")
    if not (api_key and place_id and repo_path):
        sys.stderr.write("need GOOGLE_PLACES_API_KEY, PIPE_REHAB_PLACE_ID, REPO_PATH\n")
        return 2

    repo = pathlib.Path(repo_path)
    if not repo.is_dir():
        sys.stderr.write(f"repo path does not exist: {repo}\n")
        return 2

    place = fetch_place(api_key, place_id)
    all_reviews = place.get("reviews", []) or []
    filtered = [r for r in all_reviews if int(r.get("rating", 0)) >= MIN_STARS]
    filtered.sort(key=lambda r: r.get("publishTime", ""), reverse=True)

    name = (place.get("displayName") or {}).get("text", "?")
    print(f"place: {name}  rating={place.get('rating')}  count={place.get('userRatingCount')}")
    print(f"fetched {len(all_reviews)} reviews, {len(filtered)} passed filter (>= {MIN_STARS} stars)")
    if not filtered:
        print("no qualifying reviews, nothing to do")
        return 0

    block = render_reviews_block(place, filtered)
    changed: list[str] = []

    index_path = repo / "index.html"
    if index_path.exists():
        text = index_path.read_text(encoding="utf-8")
        orig = text
        text, _ = rewrite_html_block(text, block)
        text, _ = update_jsonld_block(
            text, "HomeAndConstructionBusiness", place, filtered,
            include_review_list=True,
        )
        if text != orig:
            index_path.write_text(text, encoding="utf-8")
            changed.append("index.html")

    for path in sorted(repo.glob("piperehabilitering-*.html")):
        text = path.read_text(encoding="utf-8")
        orig = text
        text, _ = rewrite_html_block(text, block)
        text, _ = update_jsonld_block(
            text, "Service", place, filtered, include_review_list=False,
        )
        if text != orig:
            path.write_text(text, encoding="utf-8")
            changed.append(path.name)

    print(f"updated {len(changed)} file(s)")
    for c in changed:
        print(f"  {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
