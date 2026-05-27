#!/usr/bin/env bash
#
# Deploy pipe-reviews to arrakis.
#
# The laptop is the source of truth for secrets:
#   - .env (in this directory, gitignored)
#   - ~/.secrets/arrakis/github_pipe_rehab[.pub]  (outside visions repo)
#
# Every deploy rsyncs both up to arrakis, so if the droplet is wiped the
# replacement is one deploy.sh invocation away from a working workload.
#
# Usage:
#     ./deploy.sh                    # defaults to arrakis SSH alias
#     ./deploy.sh arrakis
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

HOST="${1:-${ARRAKIS_HOST:-arrakis}}"
DEST="${DEST:-/home/tim/pipe-reviews}"
KEY_DIR="${HOME}/.secrets/arrakis"
KEY_NAME="github_pipe_rehab"

if [ ! -f .env ]; then
  echo "error: .env not found in $HERE" >&2
  echo "copy .env.example to .env and fill in GOOGLE_PLACES_API_KEY + PIPE_REHAB_PLACE_ID" >&2
  exit 1
fi
if [ ! -f "$KEY_DIR/$KEY_NAME" ]; then
  echo "error: deploy key not found at $KEY_DIR/$KEY_NAME" >&2
  echo "this is the GitHub deploy key for timothyylim/piperehabilitering." >&2
  echo "either restore from backup or generate a new one:" >&2
  echo "  ssh-keygen -t ed25519 -f $KEY_DIR/$KEY_NAME -N '' -C 'arrakis-pipe-reviews'" >&2
  echo "  gh api --method POST /repos/timothyylim/piperehabilitering/keys \\" >&2
  echo "    -f title='arrakis-pipe-reviews' -f key=\"\$(cat $KEY_DIR/$KEY_NAME.pub)\" -F read_only=false" >&2
  exit 1
fi

# --- host-level prep (idempotent) -------------------------------------------
ssh "$HOST" "mkdir -p ~/.ssh $DEST $DEST/data && chmod 700 ~/.ssh"

# Upload the GitHub deploy key.
scp -q "$KEY_DIR/$KEY_NAME" "$HOST:~/.ssh/$KEY_NAME"
scp -q "$KEY_DIR/$KEY_NAME.pub" "$HOST:~/.ssh/$KEY_NAME.pub"
ssh "$HOST" "chmod 600 ~/.ssh/$KEY_NAME && chmod 644 ~/.ssh/$KEY_NAME.pub"

# ~/.ssh/config alias so manual clones from a tim shell also work.
ssh "$HOST" "cat > ~/.ssh/config <<'EOF'
Host github-pipe-rehab
  HostName github.com
  User git
  IdentityFile ~/.ssh/$KEY_NAME
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config"

# --- workload deploy --------------------------------------------------------
rsync -avz --delete \
  --exclude='.git*' \
  --exclude='data/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.venv/' \
  --exclude='.DS_Store' \
  ./ "$HOST:$DEST/"

ssh "$HOST" "chmod 600 $DEST/.env"
ssh "$HOST" "cd $DEST && docker compose up -d --build"
ssh "$HOST" "docker ps --filter name=pipe-reviews"
