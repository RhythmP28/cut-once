#!/usr/bin/env bash
# Puts the previous push's simulation results in sim-out/baseline (GitHub only).
# Needs GH_TOKEN, GH_REPO, BEFORE (the commit before this push) and GITHUB_REF_NAME.
set -euo pipefail
mkdir -p sim-out/baseline
run_id=""
if [ -n "${BEFORE:-}" ] && [ "$BEFORE" != "0000000000000000000000000000000000000000" ]; then
  run_id=$(gh run list --workflow sim.yml --commit "$BEFORE" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty' || true)
fi
if [ -z "$run_id" ]; then
  run_id=$(gh run list --workflow sim.yml --branch "$GITHUB_REF_NAME" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty' || true)
fi
if [ -z "$run_id" ]; then echo "no earlier sim run: this report has no baseline"; exit 0; fi
tmp=$(mktemp -d)
if ! gh run download "$run_id" --name sim-out --dir "$tmp"; then echo "run $run_id has no sim-out artifact"; exit 0; fi
cp -R "$tmp/current/." sim-out/baseline/
echo "baseline: run $run_id"
