#!/usr/bin/env bash
# Usage: infra/deploy.sh user@host https://your-domain
set -euo pipefail
HOST="${1:?usage: infra/deploy.sh user@host https://your-domain}"
URL="${2:?usage: infra/deploy.sh user@host https://your-domain}"
ssh "$HOST" 'set -e; cd /opt/cutonce && git pull --ff-only && pnpm install --frozen-lockfile && pnpm -F @cutonce/web build && sudo systemctl restart cutonce'
sleep 2
curl -fsS "$URL/health" && echo && echo "deployed"
