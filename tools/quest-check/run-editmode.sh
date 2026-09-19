#!/usr/bin/env bash
# Compiles apps/quest/Assets/CutOnce and runs its EditMode tests in a throwaway Unity project, so the C# can be
# checked before (and without) the QuestCameraKit fork. Device/ is left out: it needs Meta's packages and is
# compiled by the fork itself. Usage: bash tools/quest-check/run-editmode.sh   (UNITY=/path/to/Unity to choose)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UNITY="${UNITY:-$(ls -d /Applications/Unity/Hub/Editor/*/Unity.app/Contents/MacOS/Unity 2>/dev/null | sort -V | tail -1)}"
[ -x "$UNITY" ] || { echo "No Unity editor found; set UNITY=/path/to/Unity.app/Contents/MacOS/Unity"; exit 2; }
BUILTIN="$(dirname "$UNITY")/../Resources/PackageManager/BuiltInPackages"
ver() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$BUILTIN/$1/package.json"; }
PROJ="${QUEST_CHECK_DIR:-${TMPDIR:-/tmp}/cutonce-quest-check}"
mkdir -p "$PROJ/Assets" "$PROJ/Packages"
printf '{ "dependencies": { "com.unity.test-framework": "%s", "com.unity.ext.nunit": "%s" } }\n' \
  "$(ver com.unity.test-framework)" "$(ver com.unity.ext.nunit)" > "$PROJ/Packages/manifest.json"
# Unity writes .meta files beside ours; keep them (--exclude protects them from --delete) so GUIDs stay stable.
rsync -a --delete --exclude '*.meta' --exclude 'Device/' "$ROOT/apps/quest/Assets/CutOnce/" "$PROJ/Assets/CutOnce/"
rm -f "$PROJ/results.xml"
echo "Unity:   $UNITY"
echo "Project: $PROJ"
set +e
"$UNITY" -batchmode -nographics -projectPath "$PROJ" -runTests -testPlatform EditMode -testResults "$PROJ/results.xml" -logFile "$PROJ/editor.log"
code=$?
set -e
grep -E "error CS[0-9]{4}" "$PROJ/editor.log" | sed 's#.*/Assets/#Assets/#' | sort -u || true
if [ -f "$PROJ/results.xml" ]; then
  python3 - "$PROJ/results.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
run = ET.parse(sys.argv[1]).getroot()
print(f"EditMode: {run.get('passed')} passed, {run.get('failed')} failed, {run.get('total')} total")
for case in run.iter("test-case"):
    if case.get("result") == "Failed":
        msg = case.find("failure/message")
        print("FAIL", case.get("fullname"), "-", ((msg.text or "").strip()[:300] if msg is not None else ""))
PY
fi
echo "Unity exit code: $code (0 all passed, 1 compile error, 2 tests failed, 3 run error)"
exit $code
