# Piperehabilitering — CLAUDE.md

Static marketing site for **Piperehabilitering AS**, a Norwegian chimney rehabilitation company based in Skien. Live at **https://www.pipe-rehab.no/**. Client is Fredrik; Tim manages the site under Lim Software (recurring 2000 kr/mnd invoice).

---

## Tech Stack

- Pure HTML/CSS/JS — no framework, no build step, no bundler
- Deployed on **Vercel** (auto-deploys from `main` branch of `timothyylim/piperehabilitering`)
- Node.js serverless functions in `/api/` (Vercel Functions, CommonJS)
- `package.json` deps: `google-ads-api ^23.0.1`, `google-auth-library ^9.0.0` (used by api/ and scripts/)
- Language: Norwegian (`lang="no"`), mobile-first CSS, CSS custom properties for theming

---

## Site Structure

### Public pages
- `index.html` — main landing page (all services, reviews, booking form, GA4 tag)
- `piperehabilitering-*.html` — 12 city landing pages (see list below)
- `404.html` — custom error page
- `llms.txt` — AI-readable company description (Norwegian); **must not link to SERP data files**

### City landing pages (12 total)
All follow `piperehabilitering-{city}.html` pattern. Cities: skien, porsgrunn, bamble, siljan, kragero, drangedal, nome, notodden, larvik, sandefjord, tonsberg, arendal. Each has inline CSS, Norwegian copy, Google reviews block (between `REVIEWS:BEGIN` / `REVIEWS:END` markers), and a CTA card. Reviews section is regenerated daily by `pipe-reviews`.

### Admin dashboard
- `admin.html` — password-gated dashboard at https://www.pipe-rehab.no/admin
  - Password: `"pipe"` (sent as `X-Admin-Password` header to API calls)
  - Panels: GA4 analytics (live via `/api/stats`), GSC data, SERP rankings (via `/api/serp`), Ads performance (from `data/ads-brief.md` + `data/ads-history.json`)
  - Robots: `noindex, nofollow`

---

## API Endpoints

All endpoints are Vercel serverless functions. Auth method noted per endpoint.

### `GET /api/stats`
Auth: `X-Admin-Password: pipe` header (or `?password=pipe` query param).
Calls GA4 Data API for `days` (default 7) window. Returns current + previous period:
overview metrics, top pages (10), traffic sources (10), devices, daily breakdown.
Env: `ADMIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON string).

### `GET /api/serp`
Auth: `X-Admin-Password: pipe` header (or `?password=pipe` query param).
Reads `data/serp-latest.json`, `data/serp-history.json`, optionally `data/serp-brief.md` (add `?brief=1`).
Returns `{ latest, history, brief }`. Cache: `private, no-store`.
Env: `ADMIN_PASSWORD`.

### `GET /api/ga-snapshot`
Auth: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) OR `X-Admin-Password` header.
Add `?test=1` for health check (no side effects).
Add `?backfill=1&start=YYYY-MM-DD` to fill historical weekly buckets.
Normal mode: fetches 7-day window ending 3 days ago, appends to `data/ga-history.json` via GitHub API, commits to `main`.
Cron schedule: **Mondays 07:00 UTC** (`vercel.json`).
Env: `CRON_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GITHUB_TOKEN`.

### `GET /api/gsc-snapshot`
Auth: same as `ga-snapshot` (cron Bearer or admin password).
Add `?test=1` for health check.
Fetches 7-day GSC window (ending 3 days ago) for `sc-domain:pipe-rehab.no`. Appends to `data/gsc-history.json`, idempotent (skips if range already captured).
Cron schedule: **Mondays 06:00 UTC** (`vercel.json`).
Env: `CRON_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GITHUB_TOKEN`.

---

## Analytics & Ads

### GA4
- Property ID: `531068491`
- Measurement ID: `G-9RJX14G2J6`
- Service account: `ga4-reader@pipe-rehab-analytics.iam.gserviceaccount.com`
- Credential env var: `GOOGLE_SERVICE_ACCOUNT_KEY` (full JSON, set in Vercel project env)
- Conversion events: `phone_click` + `email_click` tracked in GA4 → imported into Google Ads

### Google Search Console
- Property: `https://www.pipe-rehab.no/` (sc-domain:pipe-rehab.no in API)
- Same service account as GA4 has read access

### Google Ads
- Customer ID: `762-918-8870` (f4investas account)
- Standard Search campaign ID: `23903483937`
- MCC: `675-025-5603` (tim@hyperspeed.studio)
- Credentials YAML: `/Users/tim/repos/tools/google-ads/google-ads.yaml` (local); `/home/tim/google-ads/google-ads.yaml` on Arrakis

---

## Arrakis Services (Docker on Arrakis, tim@100.102.100.43 via Tailscale)

SSH alias `arrakis` resolves via Tailscale. Use `arrakis` (not the hostname "arrakis") or `tim@100.102.100.43`.

### `pipe-serp-monitor`
Source: `ops/pipe-serp-monitor/`
Remote path: `/home/tim/pipe-serp-monitor`
Schedule: **daily 06:15 Europe/Oslo**
What it does: Queries Serper.dev for Norwegian SERP results (`gl=no`, `hl=no`) for tracked money/local keywords. Writes `data/serp-latest.json`, `data/serp-history.json`, `data/serp-brief.md`. Commits + pushes to `main`.
Key file: `keywords.json` — tracked keyword list.
Secrets: `ops/pipe-serp-monitor/.env` (contains `SERPER_API_KEY`); copy from `~/.secrets/serper.env`.
Deploy: `cd ops/pipe-serp-monitor && cp ~/.secrets/serper.env .env && ./deploy.sh`
Manual run: `ssh arrakis 'docker exec pipe-serp-monitor /app/entrypoint.sh'`

### `pipe-reviews`
Source: `ops/pipe-reviews/`
Remote path: `/home/tim/pipe-reviews`
Schedule: **daily 06:00 Europe/Oslo**
What it does: Fetches Google Place reviews via Places API. Updates the `REVIEWS:BEGIN` / `REVIEWS:END` block in `index.html` and all 12 city pages. Commits + pushes to `main`.
Secrets: `ops/pipe-reviews/.env` (`GOOGLE_PLACES_API_KEY`, `PIPE_REHAB_PLACE_ID`). SSH deploy key: `~/.secrets/arrakis/github_pipe_rehab`.
Deploy: `cd ops/pipe-reviews && ./deploy.sh`
Logs: `ssh arrakis "docker logs pipe-reviews --tail 80"` or `/home/tim/pipe-reviews/data/run.log`

### `pipe-ads-monitor`
Source: `ops/pipe-ads-monitor/`
Remote path: `/home/tim/pipe-ads-monitor`
Schedule: **Tuesdays 08:00 Europe/Oslo** (day after SERP monitor)
What it does: Fetches last 7 days of Google Ads campaign stats + search terms. Scores terms for waste. Auto-adds broad negative keywords for waste patterns with >NOK 20 spend + 0 conversions. Commits `data/ads-brief.md` and `data/ads-history.json` to `main`.
Auto-negated waste patterns: `rørlegger`, `blikkenslager`, `snekker`, `tømrer`, `murer`, `ventilasjon`, `drenering`, `anleggsgartner`, `norsk piperehabilitering`, `varmefag`, `pipefiks`, `peis og pipe`.
Env vars in `.env`: `GOOGLE_ADS_YAML_PATH=/home/tim/google-ads/google-ads.yaml`, `CUSTOMER_ID=7629188870`, `CAMPAIGN_ID=23903483937`, `DRY_RUN=0`.
Deploy: `cd ops/pipe-ads-monitor && ./deploy.sh`
Dry run: `ssh arrakis 'docker exec -e DRY_RUN=1 pipe-ads-monitor /app/entrypoint.sh'`
Logs: `ssh arrakis 'docker logs pipe-ads-monitor --tail 100'`

---

## Data Files (committed to repo, blocked from public web by vercel.json + robots.txt)

- `data/serp-latest.json` — most recent SERP snapshot (written by pipe-serp-monitor)
- `data/serp-history.json` — daily SERP history array
- `data/serp-brief.md` — LLM-readable SERP summary; read this after `git pull` for SEO status
- `data/ga-history.json` — weekly GA4 snapshots array (written by `/api/ga-snapshot` cron)
- `data/gsc-history.json` — weekly GSC snapshots array (written by `/api/gsc-snapshot` cron)
- `data/ads-brief.md` — LLM-readable weekly Ads digest (written by pipe-ads-monitor)
- `data/ads-history.json` — weekly Ads snapshots array

`vercel.json` returns 404 for `serp-latest.json`, `serp-history.json`, `serp-brief.md`. The GA/GSC/ads data files are not explicitly blocked but are not linked publicly.

---

## Credentials Locations

| Secret | Where |
|--------|-------|
| `ADMIN_PASSWORD` | Vercel project env vars; value: `"pipe"` |
| `CRON_SECRET` | Vercel project env vars |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Vercel project env vars (full JSON) |
| `GITHUB_TOKEN` | Vercel project env vars (PAT with repo write) |
| Serper API key | `~/.secrets/serper.env` |
| Google Ads YAML | `/Users/tim/repos/tools/google-ads/google-ads.yaml` (local), `/home/tim/google-ads/google-ads.yaml` (Arrakis) |
| GitHub deploy key (Arrakis → repo) | `~/.secrets/arrakis/github_pipe_rehab` |
| Google Places API key | `ops/pipe-reviews/.env` |

---

## Issue Tracker

Issues live in `/issues/` — same format as the visions tracker (`~/bin/tracker`). Markdown files with YAML frontmatter (`id`, `title`, `status`, `priority`). Statuses: `open`, `shipped`, `closed`.

Current open issues (as of 2026-06-04):
- `#5` — Google Ads iterative optimisation program (high)
- `#6` — Build /piperehabilitering-pris pricing page (high)
- `#7` — competitor analysis: norskpiperehabilitering.no outranking for 'piperehabilitering skien' (high)
- `#8` — Link Google Business Profile to Google Ads campaign (medium)

---

## Local Development

```bash
python3 -m http.server 8000
```

No build step. Vercel Functions require `vercel dev` to run locally (needs Vercel CLI + env vars).

## Deploy

Push to `main` → Vercel auto-deploys. Or: `vercel deploy --prod`.

## LLM Workflow (SEO/Ads analysis)

```bash
cd /Users/tim/repos/piperehabilitering && git pull
```

Then read:
- `data/serp-brief.md` — weekly SERP standings vs competitors
- `data/ads-brief.md` — weekly Ads spend, waste, auto-negatives
- `data/serp-history.json` / `data/ga-history.json` — for trend analysis

Key competitors to watch: norskpiperehabilitering.no, alfavarme.no, smartvarme.no, proff.no, mittanbud.no.

---

## Conventions

- CSS custom properties: `--bg`, `--accent`, `--text`, `--text-light`, `--border`, `--white`
- Breakpoints: 768px, 1200px
- No external JS dependencies on public pages (vanilla JS only); admin.html uses Chart.js CDN
- Reviews sections use `<!-- REVIEWS:BEGIN -->` / `<!-- REVIEWS:END -->` markers — do not edit by hand, regenerated daily
