#!/usr/bin/env bash
#
# Weekly run: clone/update the piperehabilitering repo, fetch Serper rankings,
# write data/serp-* artifacts, commit and push if anything changed.
#
set -euo pipefail

LOG=/data/run.log
REPO_DIR=${REPO_DIR:-/workspace/piperehabilitering}
REMOTE=${REMOTE:-git@github-pipe-rehab:timothyylim/piperehabilitering.git}

mkdir -p /data /workspace
log() { echo "$(date -u -Iseconds) $*" >> "$LOG"; }

log "start"

if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch origin --quiet
  git -C "$REPO_DIR" reset --hard origin/main --quiet
else
  rm -rf "$REPO_DIR"
  git clone --quiet "$REMOTE" "$REPO_DIR"
fi

REPO_PATH="$REPO_DIR" node /app/serp_monitor.mjs 2>&1 | tee -a "$LOG"

if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
  SNAPSHOT_DATE="$(date -u +%F)"
  git -C "$REPO_DIR" add data/serp-history.json data/serp-latest.json data/serp-brief.md llms.txt
  git -C "$REPO_DIR" commit -q -m "serp snapshot ${SNAPSHOT_DATE}"
  git -C "$REPO_DIR" push -q origin main
  log "pushed"
else
  log "no changes"
fi

log "done"

