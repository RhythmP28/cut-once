"""Run the whole E7 pipeline, 00 -> 06, then check.py. Non-interactive: every number comes from e7_overrides.yaml.

    python tools/e7/run_all.py            (from the repo root, inside tools/e7/.venv)
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGES = ["00_fetch.py", "01_scale.py", "02_footprints.py", "03_heights.py", "04_plan.py", "05_mesh.py", "06_events.py", "check.py"]


def main() -> int:
    for script in STAGES:
        print(f"\n=== {script} ===", flush=True)
        code = subprocess.run([sys.executable, str(HERE / script)], cwd=HERE).returncode
        if code != 0:
            print(f"\n{script} failed with exit code {code}; stopping.")
            return code
    return 0


if __name__ == "__main__":
    sys.exit(main())
