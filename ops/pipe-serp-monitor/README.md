# pipe-serp-monitor

Daily Serper.dev rank monitor for pipe-rehab.no.

The service runs on Arrakis, clones `timothyylim/piperehabilitering`, writes:

- `data/serp-history.json`
- `data/serp-latest.json`
- `data/serp-brief.md`

Then it commits and pushes those files back to `main`.

## Local setup

```bash
cp .env.example .env
printf 'SERPER_API_KEY=...\n' > .env
```

The laptop currently has the key at `/Users/tim/.secrets/serper.env`.
For normal local deploys, copy that file to this directory as `.env`; `.env`
is intentionally gitignored.

## Deploy

```bash
./deploy.sh
```

## Manual remote run

```bash
ssh arrakis 'docker exec pipe-serp-monitor /app/entrypoint.sh'
```

## Schedule

Runs daily at 06:15 Europe/Oslo.
