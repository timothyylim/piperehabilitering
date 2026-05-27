# Pipe Reviews

Arrakis workload that syncs Google Place reviews into the static
Piperehabilitering site.

Source of truth: `~/repos/piperehabilitering/ops/pipe-reviews/`.

Deploy:

```bash
cd ~/repos/piperehabilitering/ops/pipe-reviews
./deploy.sh
```

Secrets stay local and on Arrakis:

- `.env` in this directory: `GOOGLE_PLACES_API_KEY`, `PIPE_REHAB_PLACE_ID`
- `~/.secrets/arrakis/github_pipe_rehab`: deploy key used by the container to
  push review updates back to `timothyylim/piperehabilitering`

Runtime:

- Remote path: `/home/tim/pipe-reviews`
- Container: `pipe-reviews`
- Schedule: `crontab`, Europe/Oslo
- Logs: `ssh arrakis "docker logs pipe-reviews --tail 80"` or
  `/home/tim/pipe-reviews/data/run.log`
