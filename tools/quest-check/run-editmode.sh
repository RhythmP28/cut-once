#!/usr/bin/env bash
# Kept so older notes still work. apps/quest is now the real Unity project, with Meta's packages, so the checks
# run there, Device/ included: see apps/quest/README.md. Usage: bash tools/quest-check/run-editmode.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
exec pnpm quest:check
