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

## Conventions

- Language is Norwegian (`lang="no"`)
- CSS custom properties for theming (`--bg`, `--accent`, `--text`, etc.)
- Mobile-first responsive design (breakpoints at 768px and 1200px)
- No external JS dependencies — vanilla JS only
