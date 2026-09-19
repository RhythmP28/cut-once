#!/usr/bin/env bash
# Refreshes the copies of repo files that the headset app carries in a Resources folder (a build cannot read
# outside Assets). BundledFilesTests fails when a copy is stale.
set -euo pipefail
cd "$(dirname "$0")/../.."
DEST=apps/quest/Assets/CutOnce/AR/Resources/CutOnce
cp data/fixtures/hologram-palette.json "$DEST/hologram-palette.json"
cp data/demo/desk.plan.json "$DEST/desk.plan.json"
cp data/e7/out/e7.plan.json "$DEST/e7.plan.json"
if head -c 4 data/e7/out/e7.glb | grep -q glTF; then
  cp data/e7/out/e7.glb "$DEST/e7.glb.bytes"      # .bytes: Unity loads it as a TextAsset; not in Git LFS, so every checkout has it
else
  echo "data/e7/out/e7.glb is a Git LFS pointer: run 'git lfs pull' first" >&2; exit 1
fi
echo "bundled: hologram-palette.json, desk.plan.json, e7.plan.json, e7.glb.bytes"
