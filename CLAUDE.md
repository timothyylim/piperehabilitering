# Piperehabilitering

Static landing page for Piperehabilitering AS, a Norwegian chimney rehabilitation company.

## Tech Stack

- Pure HTML/CSS/JS — no framework, no build step, no dependencies
- Deployed on Vercel (auto-deploys from GitHub)

## Development

Serve locally with any static file server:

```bash
python3 -m http.server 8000
```

## Deploy

Push to `main` for automatic Vercel deployment, or run `vercel deploy --prod`.

## Structure

- `index.html` — entire site (single page)
- `assets/logo.png` — company logo
- `admin.html` — password-gated admin dashboard
- `api/serp.js` — password-gated SERP monitor data endpoint
- `data/serp-latest.json` — latest Serper rank snapshot, committed by Arrakis
- `data/serp-history.json` — historical Serper rank snapshots, committed by Arrakis
- `data/serp-brief.md` — concise LLM-readable SERP summary, committed by Arrakis

## Conventions

- Language is Norwegian (`lang="no"`)
- CSS custom properties for theming (`--bg`, `--accent`, `--text`, etc.)
- Mobile-first responsive design (breakpoints at 768px and 1200px)
- No external JS dependencies — vanilla JS only

## SERP Monitor

Relative SEO/rank tracking is generated outside this repo by the Arrakis service
`/home/tim/pipe-serp-monitor` from the `visions/work/pipe-serp-monitor`
source directory. It uses Serper.dev to query Google Norway (`gl=no`, `hl=no`)
for tracked money/local keywords, then commits generated artifacts back here.

Generated files:

- `data/serp-latest.json` — current structured snapshot
- `data/serp-history.json` — daily history
- `data/serp-brief.md` — short LLM-facing summary for local Codex analysis

Privacy model:

- The files are kept in git so laptop Codex can answer questions after `git pull`.
- The public site must not expose them directly. `vercel.json` returns 404 for
  `/data/serp-latest.json`, `/data/serp-history.json`, and `/data/serp-brief.md`.
- `robots.txt` also disallows those paths, but the real access control is the
  Vercel route block plus the authenticated API.
- `llms.txt` must not link to the SERP brief.
- `admin.html` reads SERP data through `/api/serp`, using the same
  `X-Admin-Password` header as `/api/stats`.

Local LLM workflow:

```bash
cd /Users/tim/repos/piperehabilitering
git pull
```

Then inspect `data/serp-brief.md`, `data/serp-latest.json`, and
`data/serp-history.json` directly for questions like:

- Are we beating Norsk Piperehabilitering?
- Which money queries are weakest?
- What changed since yesterday?
- What page should we build next?
