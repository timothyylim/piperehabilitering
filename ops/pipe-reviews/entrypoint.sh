#!/usr/bin/env bash
#
# Daily run: clone/update the piperehabilitering repo, regenerate reviews
# blocks from Google Places API, commit and push if anything changed.
#
set -euo pipefail

LOG=/data/run.log
REPO_DIR=/workspace/piperehabilitering
REMOTE=git@github-pipe-rehab:timothyylim/piperehabilitering.git

mkdir -p /data /workspace
log() { echo "$(date -u -Iseconds) $*" >> "$LOG"; }

log "start"

# Clone fresh or fast-forward existing clone.
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch origin --quiet
  git -C "$REPO_DIR" reset --hard origin/main --quiet
else
  rm -rf "$REPO_DIR"
  git clone --quiet "$REMOTE" "$REPO_DIR"
fi

# Regenerate review blocks.
REPO_PATH="$REPO_DIR" python3 /app/update_reviews.py 2>&1 | tee -a "$LOG"

# Commit + push only if the updater produced diffs.
if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
  git -C "$REPO_DIR" add -A
  git -C "$REPO_DIR" commit -q -m "reviews: sync from google places $(date -u +%F)"
  git -C "$REPO_DIR" push -q origin main
  log "pushed"
else
  log "no changes"
fi

log "done"
