#!/usr/bin/env bash
# Runs the headset's pure C# tests (CutOnce.Core, CutOnce.Net) in seconds, without opening Unity.
# Uses a system `dotnet` when there is one, else the .NET SDK that ships inside the Unity Editor.
set -euo pipefail
cd "$(dirname "$0")"
DOTNET="$(command -v dotnet || true)"
if [ -z "$DOTNET" ]; then
  for sdk in /Applications/Unity/Hub/Editor/*/Unity.app/Contents/Resources/Scripting/DotNetSdk/dotnet \
             "/c/Program Files/Unity/Hub/Editor"/*/Editor/Data/DotNetSdk/dotnet.exe; do
    [ -x "$sdk" ] && DOTNET="$sdk"
  done
fi
[ -n "$DOTNET" ] || { echo "No dotnet found. Install the .NET 8 SDK, or Unity 6 (its Editor bundles one)." >&2; exit 1; }
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 "$DOTNET" test CutOnce.Core.Tests.csproj "$@"
