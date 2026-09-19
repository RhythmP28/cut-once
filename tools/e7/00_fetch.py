"""Download the published E7 drawings into data/e7/raw/ (git-ignored) and write manifest.json.

The drawings are copyright Perkins&Will. They are never committed. Files already present are kept.
"""
from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timezone

import requests

import common as c

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) cut-once-e7-pipeline/1.0"}


def main() -> int:
    c.ensure_dirs()
    manifest_path = c.RAW / "manifest.json"
    old = {e["key"]: e for e in c.read_json(manifest_path)["files"]} if manifest_path.exists() else {}
    files, failed = [], []
    for key, (rel, name) in c.SOURCES.items():
        url = c.IMAGE_BASE + rel
        dest = c.RAW / name
        if dest.exists() and dest.stat().st_size > 0:
            data = dest.read_bytes()
            retrieved = old.get(key, {}).get("retrieved_at") or datetime.fromtimestamp(
                dest.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            print(f"  have  {name}")
        else:
            try:
                resp = requests.get(url, headers=UA, timeout=60)
                resp.raise_for_status()
            except requests.RequestException as e:
                print(f"  FAIL  {name}: {e}\n        find the image on {c.ARCHDAILY_PAGE} and fix common.SOURCES")
                failed.append(key)
                continue
            data = resp.content
            dest.write_bytes(data)
            retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            print(f"  got   {name} ({len(data) / 1024:.0f} KiB)")
        files.append({"key": key, "file": name, "url": url, "sha256": hashlib.sha256(data).hexdigest(),
                      "bytes": len(data), "retrieved_at": retrieved})
    c.write_json(manifest_path, {
        "source_page": c.ARCHDAILY_PAGE,
        "copyright": "Drawings (c) Perkins&Will, published on ArchDaily. Never commit these files.",
        "files": files,
    })
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
