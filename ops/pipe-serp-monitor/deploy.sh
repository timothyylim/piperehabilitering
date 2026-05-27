#!/usr/bin/env bash
#
# Deploy pipe-serp-monitor to arrakis.
#
# Required local files:
#   - .env with SERPER_API_KEY
#   - ~/.secrets/arrakis/github_pipe_rehab[.pub]
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

HOST="${1:-${ARRAKIS_HOST:-arrakis}}"
DEST="${DEST:-/home/tim/pipe-serp-monitor}"
KEY_DIR="${HOME}/.secrets/arrakis"
KEY_NAME="github_pipe_rehab"

if [ ! -f .env ]; then
  echo "error: .env not found in $HERE" >&2
  echo "copy .env.example to .env and set SERPER_API_KEY" >&2
  exit 1
fi
if [ ! -f "$KEY_DIR/$KEY_NAME" ]; then
  echo "error: deploy key not found at $KEY_DIR/$KEY_NAME" >&2
  exit 1
fi

ssh "$HOST" "mkdir -p ~/.ssh $DEST $DEST/data && chmod 700 ~/.ssh"

scp -q "$KEY_DIR/$KEY_NAME" "$HOST:~/.ssh/$KEY_NAME"
scp -q "$KEY_DIR/$KEY_NAME.pub" "$HOST:~/.ssh/$KEY_NAME.pub"
ssh "$HOST" "chmod 600 ~/.ssh/$KEY_NAME && chmod 644 ~/.ssh/$KEY_NAME.pub"

ssh "$HOST" "cat > ~/.ssh/config <<'EOF'
Host github-pipe-rehab
  HostName github.com
  User git
  IdentityFile ~/.ssh/$KEY_NAME
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 ~/.ssh/config"

rsync -avz --delete \
  --exclude='.git*' \
  --exclude='data/' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  ./ "$HOST:$DEST/"

ssh "$HOST" "chmod 600 $DEST/.env"
ssh "$HOST" "cd $DEST && docker compose up -d --build"
ssh "$HOST" "docker ps --filter name=pipe-serp-monitor"
