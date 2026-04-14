#!/usr/bin/env python3
"""
One-shot prep: add REVIEWS markers + reviews section + CSS to every
per-town landing page, and add markers to the existing reviews block
in index.html.

Idempotent: re-running is a no-op on files that already have markers.

Run from the repo root:
    python3 scripts/add-reviews-markers.py
"""

from __future__ import annotations
import glob
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# --- CSS to inject into per-town pages (subset of index.html's reviews CSS,
#     adapted for the narrower <main> layout on per-town pages) ---
REVIEWS_CSS = """
        /* REVIEWS (google-style cards) — injected by scripts/add-reviews-markers.py */
        .reviews-section {
            margin: 2.5em 0 1em;
            padding: 1.4em 1.6em;
            background: var(--white);
            border: 1px solid var(--border);
            border-radius: 12px;
        }
        .reviews-section h2 {
            margin: 0 0 0.6em;
            font-size: 1.05rem;
            color: var(--text-light);
            font-weight: 600;
        }
        .reviews-summary {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            margin: 0 0 1.3em;
            flex-wrap: wrap;
        }
        .reviews-summary .reviews-score {
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--text);
            line-height: 1;
        }
        .reviews-summary .reviews-stars {
            color: #fbbc04;
            font-size: 1.05rem;
            letter-spacing: 0.08em;
            line-height: 1;
        }
        .reviews-summary .reviews-count {
            color: var(--text-light);
            font-size: 0.85rem;
        }
        .reviews-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.9rem;
            text-align: left;
            margin: 0;
        }
        .google-review {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 1em 1.1em;
            display: flex;
            flex-direction: column;
            gap: 0.7em;
            margin: 0;
        }
        .review-header {
            display: flex;
            align-items: center;
            gap: 0.7em;
        }
        .review-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 600;
            font-size: 0.95rem;
            flex-shrink: 0;
        }
        .review-meta {
            display: flex;
            flex-direction: column;
            line-height: 1.3;
        }
        .review-name {
            font-weight: 600;
            color: var(--text);
            font-size: 0.9rem;
        }
        .review-date {
            color: var(--text-light);
            font-size: 0.78rem;
            margin-top: 0.1em;
        }
        .review-stars {
            color: #fbbc04;
            font-size: 1rem;
            letter-spacing: 0.05em;
            line-height: 1;
        }
        .review-text {
            color: var(--text);
            margin: 0;
            line-height: 1.55;
            font-size: 0.88rem;
        }
        .reviews-link {
            text-align: right;
            margin: 1em 0 0;
            font-size: 0.85rem;
        }
        @media (max-width: 600px) {
            .reviews-grid { grid-template-columns: 1fr; }
            .reviews-section { padding: 1.2em 1.3em; }
        }
"""

# --- Placeholder reviews block injected on first prep. The daily job will
#     overwrite everything between the markers with Places API data.
#     The placeholder shows the three existing reviews from index.html so
#     pages render meaningfully before the first job run.
REVIEWS_BLOCK = """
        <!-- REVIEWS:BEGIN — do not edit by hand, regenerated daily from Google Places API -->
        <section class="reviews-section" aria-label="Anmeldelser">
            <h2>Hva kundene sier</h2>
            <div class="reviews-summary">
                <span class="reviews-score">5,0</span>
                <span class="reviews-stars" aria-label="5 av 5 stjerner">★★★★★</span>
                <span class="reviews-count">basert på Google-anmeldelser</span>
            </div>
            <div class="reviews-grid">
                <article class="google-review">
                    <header class="review-header">
                        <div class="review-avatar" style="background:#e0663e">C</div>
                        <div class="review-meta">
                            <div class="review-name">Chris Staulen</div>
                            <div class="review-date">oktober 2025</div>
                        </div>
                    </header>
                    <div class="review-stars" aria-label="5 av 5 stjerner">★★★★★</div>
                    <p class="review-text">Ryddig og profft firma. Kom til tiden, arbeid utført hurtig. Super fornøyd.</p>
                </article>
                <article class="google-review">
                    <header class="review-header">
                        <div class="review-avatar" style="background:#1a73e8">T</div>
                        <div class="review-meta">
                            <div class="review-name">Terje Jakobsen</div>
                            <div class="review-date">oktober 2025</div>
                        </div>
                    </header>
                    <div class="review-stars" aria-label="5 av 5 stjerner">★★★★★</div>
                </article>
            </div>
            <p class="reviews-link"><a href="https://share.google/wmMDkxCAsKE5tbgh4" target="_blank" rel="noopener">Se alle anmeldelser på Google</a></p>
        </section>
        <!-- REVIEWS:END -->
"""

def inject_per_town(path: pathlib.Path) -> str:
    html = path.read_text(encoding="utf-8")
    if "REVIEWS:BEGIN" in html:
        return "skip (already has markers)"

    # Anchor 1: insert CSS immediately before the closing </style> of the
    # page's single inline stylesheet.
    if "</style>" not in html:
        return "error: no </style> found"
    html = html.replace("</style>", REVIEWS_CSS + "    </style>", 1)

    # Anchor 2: insert the reviews block before the <div class="cta-card">.
    cta = '<div class="cta-card">'
    if cta not in html:
        return "error: cta-card anchor not found"
    html = html.replace(cta, REVIEWS_BLOCK + "        " + cta, 1)

    path.write_text(html, encoding="utf-8")
    return "ok"


def wrap_index(path: pathlib.Path) -> str:
    html = path.read_text(encoding="utf-8")
    if "REVIEWS:BEGIN" in html:
        return "skip (already wrapped)"

    start_re = re.compile(r'(    <div id="anmeldelser"[^>]*>)')
    if not start_re.search(html):
        return "error: anmeldelser div not found"

    # Wrap the existing reviews section (div id="anmeldelser" ... closing </div>
    # before the next top-level container div id="bestill").
    html = start_re.sub(
        r'    <!-- REVIEWS:BEGIN — do not edit by hand, regenerated daily from Google Places API -->\n\1',
        html, count=1)

    # Find the closing </div> of the reviews section — it is the last </div>
    # before <div id="bestill".
    bestill = '<div id="bestill"'
    idx = html.find(bestill)
    if idx < 0:
        return "error: bestill anchor not found"
    # Walk back to the </div> preceding bestill (it closes the anmeldelser div)
    close_idx = html.rfind("</div>", 0, idx)
    if close_idx < 0:
        return "error: could not find closing </div> of anmeldelser"
    html = html[:close_idx + len("</div>")] + "\n    <!-- REVIEWS:END -->" + html[close_idx + len("</div>"):]

    path.write_text(html, encoding="utf-8")
    return "ok"


def main():
    index = ROOT / "index.html"
    print(f"index.html: {wrap_index(index)}")

    pattern = str(ROOT / "piperehabilitering-*.html")
    per_town = sorted(pathlib.Path(p) for p in glob.glob(pattern))
    print(f"found {len(per_town)} per-town pages")
    for path in per_town:
        status = inject_per_town(path)
        print(f"  {path.name}: {status}")


if __name__ == "__main__":
    main()
