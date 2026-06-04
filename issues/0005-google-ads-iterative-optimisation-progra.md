---
id: 5
title: Google Ads: iterative optimisation program
status: open
priority: high
tags: [ads, dev]
created: 2026-05-27T13:03:53
updated: 2026-06-04T00:00:00
---

## current state (2026-06-04)

**Infrastructure shipped:**
- Smart campaign (ID 23074996706) paused
- Standard Search campaign (ID 23903483937) live — NOK 113/day, 2 ad groups (Rehabilitering + Lokal), 19 negative keywords
- Conversion tracking: `phone_click` + `email_click` events wired GA4 → Google Ads
- `pipe-ads-monitor` deployed on Arrakis — runs Tuesdays 08:00, auto-negates waste terms, commits `data/ads-brief.md` + `data/ads-history.json` weekly
- `gads.py` CLI at `/Users/tim/repos/tools/google-ads/` — query stats, search terms, budget, keywords

**Credentials:**
- `/Users/tim/repos/tools/google-ads/google-ads.yaml` — OAuth2 + developer token
- `/Users/tim/repos/tools/google-ads/accounts.yaml` — `pipe-rehab` alias → customer 762-918-8870

## open optimisation backlog

- [ ] Link Google Business Profile to campaign (was failing in UI — "Can't link ads to your Business Profile")
- [ ] Review first week of Standard Search data (check CTR vs Smart, CPC trends)
- [ ] Set up call extension with Google forwarding number for per-keyword call tracking
- [ ] Expand keyword list based on first 30 days of Standard Search terms
- [ ] Consider increasing budget once conversion data confirms cost-per-lead

## automation loop (pipe-ads-monitor)

Each Tuesday the monitor:
1. Pulls last 7 days stats + search terms
2. Auto-negates waste terms (competitor names, rørlegger, blikkenslager, etc.) with spend > NOK 20 and 0 conversions
3. Writes `data/ads-brief.md` (LLM-readable) + `data/ads-history.json`
4. Commits back to this repo

Check `data/ads-brief.md` after each Tuesday run for recommendations.
