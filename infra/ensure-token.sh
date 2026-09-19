#!/usr/bin/env bash
# Makes sure .env.local exists and has an API_TOKEN, so the server never goes public with the default "dev-token".
# The token is kept, so the headset does not need a new one after every restart.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || cp .env.example .env.local
if ! grep -qE '^API_TOKEN=.+' .env.local; then
  { grep -v '^API_TOKEN=' .env.local || true; echo "API_TOKEN=$(openssl rand -hex 24)"; } > .env.local.tmp
  mv .env.local.tmp .env.local
  echo "Wrote a new API_TOKEN to .env.local (see it with: grep API_TOKEN .env.local)"
fi
chmod 600 .env.local
