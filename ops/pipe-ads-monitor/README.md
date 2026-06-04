# pipe-ads-monitor

Weekly Google Ads performance monitor for pipe-rehab.no. Runs on Arrakis via Docker/supercronic every Tuesday at 08:00 Oslo time (day after the SERP monitor).

## What it does

1. Fetches last 7 days of campaign stats and search terms from Google Ads API
2. Scores each search term for waste (cost/click, CTR, conversion rate)
3. Auto-adds campaign-level BROAD negative keywords for terms matching waste patterns with > NOK 20 spend and 0 conversions
4. Commits `data/ads-brief.md` and `data/ads-history.json` back to the `timothyylim/piperehabilitering` repo

## Waste patterns auto-negated

`rørlegger`, `blikkenslager`, `snekker`, `tømrer`, `murer`, `ventilasjon`, `drenering`, `anleggsgartner`, `norsk piperehabilitering`, `varmefag`, `pipefiks`, `peis og pipe`

Threshold: cost > NOK 20 AND conversions = 0 within the last 7 days.

## Generated files (in piperehabilitering repo)

- `data/ads-brief.md` — LLM-readable weekly digest (same style as `serp-brief.md`)
- `data/ads-history.json` — historical weekly snapshots array

## Secrets

Copy `.env.example` to `.env` and ensure values are correct:

```
GOOGLE_ADS_YAML_PATH=/home/tim/google-ads/google-ads.yaml
CUSTOMER_ID=7629188870
CAMPAIGN_ID=23903483937
DRY_RUN=0
```

The google-ads.yaml is mounted read-only from `/home/tim/google-ads/google-ads.yaml` on Arrakis (same file used by the `gads` CLI tool). It must already exist on the host.

## Deploy

```bash
cd /Users/tim/repos/piperehabilitering/ops/pipe-ads-monitor
cp .env.example .env   # fill in if needed
./deploy.sh
```

`deploy.sh` uses `tim@100.102.100.43` (Tailscale IP). The SSH alias `arrakis` also works if your local `~/.ssh/config` maps it.

## Manual run

```bash
ssh tim@100.102.100.43 'docker exec pipe-ads-monitor /app/entrypoint.sh'
```

## Dry run (no mutations, no push)

```bash
ssh tim@100.102.100.43 'docker exec -e DRY_RUN=1 pipe-ads-monitor /app/entrypoint.sh'
```

## Logs

```bash
ssh tim@100.102.100.43 'docker logs pipe-ads-monitor --tail 100'
ssh tim@100.102.100.43 'cat /home/tim/pipe-ads-monitor/data/run.log | tail -50'
```

## SSH key

Uses the existing `~/.secrets/arrakis/github_pipe_rehab` deploy key (same as pipe-serp-monitor). It already has write access to `timothyylim/piperehabilitering`.

## Campaign IDs

- Customer ID: `7629188870`
- Standard Search campaign ID: `23903483937`
