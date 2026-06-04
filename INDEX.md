# INDEX.md — Piperehabilitering repo navigation

One line per meaningful file/directory. Read CLAUDE.md for full context.

---

## Root

| Path | What it is |
|------|------------|
| `CLAUDE.md` | Full project context: tech stack, API docs, Arrakis services, credentials map, issue tracker |
| `INDEX.md` | This file — navigation map for LLMs |
| `index.html` | Main landing page (all services, reviews, booking form, GA4 tag) |
| `admin.html` | Password-gated admin dashboard (password: "pipe"); panels for GA4, GSC, SERP, Ads |
| `404.html` | Custom Vercel 404 page |
| `vercel.json` | Vercel config: security headers, cleanUrls, data-file 404 blocks, GA/GSC snapshot crons |
| `robots.txt` | Disallows /admin.html, /api/, and all /data/ SERP files |
| `sitemap.xml` | Lists all 13 public URLs (index + 12 city pages) |
| `llms.txt` | AI-readable company description in Norwegian; do not add links to SERP data here |
| `package.json` | Node deps: google-ads-api, google-auth-library (used by /api and /scripts) |
| `package-lock.json` | Lockfile |

---

## City Landing Pages (12 files)

Pattern: `piperehabilitering-{city}.html`. Inline CSS, Norwegian copy, Google reviews block (auto-updated by pipe-reviews service), CTA card. Reviews section delimited by `REVIEWS:BEGIN` / `REVIEWS:END` — do not edit manually.

| File | City |
|------|------|
| `piperehabilitering-skien.html` | Skien (primary market) |
| `piperehabilitering-porsgrunn.html` | Porsgrunn |
| `piperehabilitering-bamble.html` | Bamble |
| `piperehabilitering-siljan.html` | Siljan |
| `piperehabilitering-kragero.html` | Kragerø |
| `piperehabilitering-drangedal.html` | Drangedal |
| `piperehabilitering-nome.html` | Nome |
| `piperehabilitering-notodden.html` | Notodden |
| `piperehabilitering-larvik.html` | Larvik |
| `piperehabilitering-sandefjord.html` | Sandefjord |
| `piperehabilitering-tonsberg.html` | Tønsberg |
| `piperehabilitering-arendal.html` | Arendal |

---

## /api/ — Vercel Serverless Functions

| File | Auth | Schedule | What it does |
|------|------|----------|--------------|
| `api/stats.js` | `X-Admin-Password` header | on demand | Live GA4 data for admin dashboard (current + prev period, pages, sources, devices) |
| `api/serp.js` | `X-Admin-Password` header | on demand | Serves serp-latest.json + serp-history.json (+ serp-brief.md if ?brief=1) |
| `api/ga-snapshot.js` | Vercel cron Bearer OR admin header | Mon 07:00 UTC | Fetches weekly GA4 snapshot, appends to data/ga-history.json via GitHub API |
| `api/gsc-snapshot.js` | Vercel cron Bearer OR admin header | Mon 06:00 UTC | Fetches weekly GSC snapshot, appends to data/gsc-history.json via GitHub API |

All endpoints accept `?test=1` for health check (no side effects) except `stats.js` and `serp.js`.

---

## /data/ — Generated data files (not publicly accessible)

`vercel.json` blocks the three SERP files. GA/GSC/Ads files are unblocked but unlinked.

| File | Written by | Contents |
|------|-----------|---------|
| `data/serp-latest.json` | pipe-serp-monitor (Arrakis, daily) | Current SERP snapshot: per-keyword ranks, competitor scores |
| `data/serp-history.json` | pipe-serp-monitor (Arrakis, daily) | Array of daily SERP snapshots |
| `data/serp-brief.md` | pipe-serp-monitor (Arrakis, daily) | LLM-readable SERP summary — read this first for SEO status |
| `data/ga-history.json` | /api/ga-snapshot (Vercel cron, weekly) | Array of weekly GA4 snapshots |
| `data/gsc-history.json` | /api/gsc-snapshot (Vercel cron, weekly) | Array of weekly GSC snapshots |
| `data/ads-brief.md` | pipe-ads-monitor (Arrakis, weekly) | LLM-readable Ads digest — spend, waste terms, auto-negatives |
| `data/ads-history.json` | pipe-ads-monitor (Arrakis, weekly) | Array of weekly Ads snapshots |

---

## /ops/ — Arrakis Docker Services

Each service dir contains: `Dockerfile`, `compose.yml`, `crontab`, `entrypoint.sh`, `deploy.sh`, `ssh_config`, `README.md`.

| Directory | Schedule | What it does |
|-----------|----------|-------------|
| `ops/pipe-serp-monitor/` | Daily 06:15 Oslo | Queries Serper.dev for Norwegian SERPs, writes serp-*.json + serp-brief.md, commits to main |
| `ops/pipe-reviews/` | Daily 06:00 Oslo | Fetches Google Place reviews via Places API, updates REVIEWS blocks in index.html + all city pages, commits to main |
| `ops/pipe-ads-monitor/` | Tuesdays 08:00 Oslo | Fetches Google Ads stats, auto-adds negative keywords for waste patterns, writes ads-brief.md + ads-history.json, commits to main |

Key files within ops/:
- `ops/pipe-serp-monitor/keywords.json` — tracked keyword list
- `ops/pipe-serp-monitor/serp_monitor.mjs` — main monitor script
- `ops/pipe-reviews/update_reviews.py` — Places API fetch + HTML injection script
- `ops/pipe-ads-monitor/ads_monitor.py` — Ads API fetch + waste scoring + auto-negative script

---

## /scripts/ — One-shot and manual utility scripts

| File | What it does |
|------|-------------|
| `scripts/add-reviews-markers.py` | One-shot: adds REVIEWS:BEGIN/END markers + reviews CSS to all city pages and index.html. Idempotent. Run from repo root: `python3 scripts/add-reviews-markers.py` |
| `scripts/ads-spend.js` | Manual CLI: queries Google Ads spend + top search terms for any number of days. Requires `scripts/ads-creds.json` (not in repo). Usage: `node scripts/ads-spend.js [days]` |

---

## /issues/ — Issue tracker

18 issues in `~/bin/tracker` format (YAML frontmatter + markdown body). Use `~/bin/tracker` to manage.

Open issues:
- `0005` — Google Ads iterative optimisation program (high)
- `0006` — Build /piperehabilitering-pris pricing page (high)
- `0007` — competitor analysis: norskpiperehabilitering.no outranking for 'piperehabilitering skien' (high)
- `0008` — Link Google Business Profile to Google Ads campaign (medium)

Shipped/closed: #1 prisside, #2 set up Search Ads, #3 link f4investa MCC, #4 Ads API mock, #9 Fiken recurring invoice, #10 investigate Fredrik's campaign, #11 new invoice, #12 Fredrik follow-up, #13 SERP monitor, #14 migrate Smart→Standard Search, #15 conversion tracking, #16 pipe-ads-monitor, #17 admin Ads panel, #18 negative keywords before cutover.

`issues/worklog.md` — chronological notes on all issue work.
`issues/artifacts/` — any files generated during issue work.

---

## /assets/

| Path | Contents |
|------|---------|
| `assets/logo.png` | Company logo (PNG) |
| `assets/logo-140h.webp` | Logo (WebP, 140px height) |
| `assets/apple-touch-icon.png` | iOS touch icon |
| `assets/favicon-16.png`, `favicon-32.png` | Favicons |
| `assets/fonts/inter-latin.woff2` | Inter font (self-hosted, avoids Google Fonts on public pages) |
| `assets/photos/` | Job site photos in jpg + webp, multiple responsive sizes (360w, 720w, 800w, 400w variants) |
