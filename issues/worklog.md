### entry-3 · 2026-05-17T15:29:47 · #8

Fredrik has an active Smart campaign (30.8k impressions, 677 clicks, 12.2k kr spent all-time). Tim has MCC 675-025-5603 on tim@hyperspeed.studio. Developer token generated but needs VPN to activate. Next: connect VPN, activate token, link f4investas@gmail.com to MCC via API, then build CLI scripts to query + steer campaign.

---

### entry-4 · 2026-05-17T15:54:03 · #8

MCC 675-025-5603 created on tim@hyperspeed.studio. Dev token generated, needs home IP/VPN to activate. Link invite sent to Fredrik (762-918-8870) — he needs to accept in Tilgang og sikkerhet → Administratorer. Smart campaign stats: 1,606 kr spend, 2.76k impressions, 87 clicks, 37 local actions, 3 call clicks (last 26 days). No conversion tracking set up. Next: activate dev token from home IP, confirm Fredrik accepted link, then build CLI scripts.

---

### entry-26 · 2026-05-27T01:20:59 · #35

Scope: create a dedicated /home/tim/pipe-serp-monitor service on Arrakis using Serper.dev credentials. Run weekly from cron/supercronic, query fixed Norwegian pipe-rehab keyword set with gl=no hl=no, store raw SERP results plus pipe-rehab.no rank, competitor domains, visibility scores, and alerts. Commit snapshots back to timothyylim/piperehabilitering as data/serp-history.json and data/serp-latest.json, separate from the existing pipe-reviews service.

---

### entry-27 · 2026-05-27T01:21:28 · #35

Implementation scope:

1. Service layout on laptop/source repo
- Add a new service directory under visions/work/pipe-serp-monitor.
- Files: Dockerfile, compose.yml, crontab, entrypoint.sh, serp_monitor.mjs, keywords.json, .env.example, deploy.sh, README.md.
- Keep this separate from visions/work/pipe-reviews so review content sync and SEO rank monitoring fail independently.

2. Secrets and deployment
- Use Serper.dev key from 1Password item habitat-social-listening-serper or local /Users/tim/.secrets/serper.env as source of truth.
- Create /home/tim/pipe-serp-monitor/.env on Arrakis with SERPER_API_KEY.
- Reuse or create a GitHub deploy key with write access to timothyylim/piperehabilitering.
- deploy.sh should rsync service files to Arrakis, upload .env/deploy key if needed, and run docker compose up -d --build.

3. Schedule
- Run weekly, Monday morning Europe/Oslo time, via supercronic.
- Suggested crontab: 15 6 * * 1 /app/entrypoint.sh.
- No daily polling initially; SERP volatility makes weekly trend data more useful and cheaper.

4. Keywords
- keywords.json should contain weighted keyword objects, not plain strings.
- Initial priority queries: piperehabilitering skien, piperehabilitering porsgrunn, piperehabilitering telemark, piperehabilitering vestfold, piperehabilitering arendal, piperehabilitering larvik, piperehabilitering pris, hva koster piperehabilitering, pipe rehabilitering, foring pipe, foring av pipe, stålpipe montering, kamerainspeksjon pipe, rehabilitering av skorstein, pipeinspeksjon.
- Include fields: query, weight, priority, targetCity optional, intent optional.

5. Serper request
- POST https://google.serper.dev/search with X-API-KEY.
- Body per keyword: { q, gl: no, hl: no, num: 20 }.
- Add basic retry/backoff for 429/5xx.
- Keep raw organic results enough to audit titles/snippets/links later.

6. Snapshot output
- Clone or reset timothyylim/piperehabilitering to origin/main inside the container.
- Append one weekly snapshot to data/serp-history.json.
- Write data/serp-latest.json for current dashboard/latest state.
- Snapshot schema should include capturedAt, range/date, provider, request params, keywords[], visibilityScores[], alerts[].
- Per keyword store ourRank, ourUrl, topResults, competitorDomains, directoryHits, and raw organic entries.

7. Rank extraction
- Normalize domains by stripping protocol, www, query strings, and trailing slash.
- Treat pipe-rehab.no and www.pipe-rehab.no as our domain.
- Track known competitors/directories: norskpiperehabilitering.no, vtpipe.no, varmefag.no, mittanbud.no, proff.no, 1881.no, gulesider.no, facebook.com, instagram.com.
- For each keyword, record first rank for pipe-rehab.no and all top-20 competitor/domain appearances.

8. Visibility scoring
- Initial rank score: #1=10, #2=8, #3=6, #4-5=4, #6-10=2, #11-20=1, absent=0.
- Multiply by keyword weight.
- Aggregate by normalized domain.
- Store sorted visibilityScores and weekly delta if prior snapshot exists.

9. Alerts
- Alert if pipe-rehab.no is absent from top 10 for high-priority keywords.
- Alert if pipe-rehab.no drops below top 3 for piperehabilitering skien or piperehabilitering porsgrunn.
- Alert if any known competitor enters top 3 for a high-priority keyword.
- Alert if a directory/social profile outranks pipe-rehab.no for a priority keyword.
- Alert if a new unknown domain appears top 5 across two or more keywords.

10. Commit behavior
- If data changed, commit back to piperehabilitering with message: serp snapshot YYYY-MM-DD.
- If current week already exists, skip unless FORCE=1.
- entrypoint.sh should log to /data/run.log and exit nonzero on real failures.

11. First verification
- Run manually once on Arrakis.
- Confirm data/serp-history.json and data/serp-latest.json committed to GitHub.
- Confirm no secrets are committed.
- Confirm local piperehabilitering can git pull the generated snapshot.
- Compare at least one keyword manually against Serper response to validate rank extraction.

12. Later dashboard follow-up
- Add Visions dashboard view after snapshots exist: keyword table, our rank trend, competitor visibility trend, and alerts.
- Do not block initial service on dashboard work.

---

### entry-28 · 2026-05-27T01:21:54 · #35

Additional requirement: the SERP monitor must feed both the live pipe-rehab admin page and an LLM-queryable artifact.

Admin integration:
- Extend https://www.pipe-rehab.no/admin to show SERP monitor state alongside existing GA/GSC/review data.
- Commit data/serp-latest.json in a shape that admin.html can fetch statically from /data/serp-latest.json.
- Admin UI should show: last captured time, keyword table with pipe-rehab rank, top competing domain, rank delta where available, visibility score table, and alerts.
- Keep admin static/no backend dependency if possible, matching the current site architecture.

LLM-queryable integration:
- Generate a concise Markdown or text summary at data/serp-brief.md or data/serp-brief.txt for LLM ingestion.
- Also consider updating llms.txt with a stable pointer to the latest SERP brief once the file exists.
- Brief should include: current overall relative standing, priority keyword wins/losses, top competitors, new threats, alerts, and recommended next actions.
- Structure the brief so an LLM can answer questions like: 'are we beating Norsk Piperehabilitering?', 'which keywords dropped?', 'which competitor is gaining?', and 'what should we do next?'
- Do not include secrets, raw API keys, or noisy full SERP dumps in the LLM-facing file; keep raw data in serp-history/latest JSON.

---

### entry-29 · 2026-05-27T01:33:31 · #35

Implemented: added visions/work/pipe-serp-monitor as a standalone Docker/supercronic service, deployed to Arrakis at /home/tim/pipe-serp-monitor, verified container is running and manual /app/entrypoint.sh skips existing 2026-W22 snapshot cleanly. Initial Serper snapshot generated and pushed in piperehabilitering commit 6c9ef97, with data/serp-history.json, data/serp-latest.json, data/serp-brief.md, admin.html SERP panel, and llms.txt brief pointer. Service source committed in visions commit 090560d.

---

### entry-33 · 2026-06-01T13:34:29 · #8

Blocked: Fredrik has not granted Google Ads manager access yet

---

### entry-34 · 2026-06-03T17:21:53 · #8

Fredrik granted Google Ads access. Campaign stats: NOK1,913.63 spend, NOK113.10/day avg, NOK3,438/mo max. Top search terms: piperehabilitering (8 clicks, 264kr), piperehabilitering pris (4 clicks, 93kr), vestfold peis og pipe (3 clicks, 79kr). Recommendations open: conversion tracking, search terms review, add images. Can't link to Business Profile. Showing in Vestfold, Telemark and Agder.

---

### entry-35 · 2026-06-03T18:04:04 · #8

API write ops blocked on Smart (EXPRESS_SMART) campaigns: CampaignCriterionService, CampaignSharedSetService, and CustomerNegativeCriterionService all rejected. Negative keywords must be added via UI: Campaign → Edit → Negative keywords. Terms to add: varmefag skien, blikkenslager, norsk piperehabilitering (as), rørlegger porsgrunn/skien, skien rørleggerforretning, vestfold peis og pipe, vestfold pipe og peis, blikkenslager skien. Read ops (stats, search terms) work fine.

---

### entry-36 · 2026-06-04T15:35:58 · #44

Context: Smart campaign (ID 23074996706) has been running ~30 days, NOK 2,188 spend, 109 clicks, 10 conversions. Switching to Standard Search to unlock full API control (negative keywords, keyword match types, bid management). Plan: (1) build create-search-campaign.py script seeded from existing search term data, (2) run both campaigns in parallel for ~1 week to validate, (3) pause Smart campaign once Standard is stable. Key winning terms to seed: piperehabilitering, piperehabilitering pris, piperehabilitering stålrør, piperehabilitering skien/porsgrunn/vestfold. Negatives to add from day 1: varmefag skien, blikkenslager, norsk piperehabilitering, rørlegger porsgrunn/skien, vestfold peis og pipe.

---

### entry-37 · 2026-06-04T15:51:58 · #46

Depends on #44 (Standard campaign) being live first. Build order: #45 conversion tracking → #44 Standard campaign → #46 ads monitor → #47 dashboard panel.

---

### entry-38 · 2026-06-04T15:51:58 · #48

Smart campaign paused 2026-06-04. Negatives to add via UI before reactivating or during Standard campaign setup: varmefag skien, blikkenslager, norsk piperehabilitering (as), rørlegger porsgrunn/skien, skien rørleggerforretning, vestfold peis og pipe, vestfold pipe og peis, blikkenslager skien.

---

### entry-39 · 2026-06-04T16:43:36 · #45

Completed: phone_click + email_click tracking JS added to index.html, GA4 key events created, GA4 → Google Ads link established, conversion actions created in Google Ads. GA4 Admin access granted to tim@hyperspeed.studio.

---

### entry-40 · 2026-06-04T16:51:19 · #44

Standard Search campaign created: ID 23903483937, PAUSED. Budget: NOK 113/day. 2 ad groups: Rehabilitering (ID 200223093274, 7 keywords) + Lokal (ID 198155458538, 7 keywords). 19 negative keywords. RSAs created for both groups. Conversion tracking linked (phone_click, email_click). Enable via Google Ads UI or API when ready to go live.

---

### entry-41 · 2026-06-04T17:05:32 · #46

Deployed to Arrakis at /home/tim/pipe-ads-monitor. Runs weekly Tuesdays 08:00 Oslo. Dry run verified: connects to Google Ads API, reads 19 existing negatives, writes ads-brief.md and ads-history.json. Zero stats as campaign just went live.

---

### entry-42 · 2026-06-04T17:05:33 · #47

Ads panel added to admin.html — fetches /data/ads-latest.json, shows spend/clicks/CTR/conversions, top terms table, waste terms, auto-actions, campaign status badge.

---
