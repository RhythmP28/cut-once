"""Shared paths, YAML handling and geometry helpers for the E7 massing pipeline.

Frame used everywhere downstream of 02_footprints.py (right-handed, +Y up, metres):
    image x (grows right)  -> model +X
    image y (grows down)   -> model +Z
    height                 -> model +Y
Seen from above (looking down -Y) with +X to the right, +Z points down the page, which is
exactly how the drawing is laid out, so the plan is not mirrored.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

TOOLS_DIR = Path(__file__).resolve().parent
REPO = TOOLS_DIR.parents[1]
DATA = REPO / "data" / "e7"
RAW = DATA / "raw"
STAGES = DATA / "stages"
FLOORS = DATA / "floors"
OUT = DATA / "out"
OVERRIDES = TOOLS_DIR / "e7_overrides.yaml"
SCHEMA_DIR = REPO / "packages" / "schemas" / "dist" / "jsonschema"

LEVELS = list(range(1, 9))
SLAB_THICKNESS_M = 0.3

IMAGE_BASE = "https://images.adsttc.com/media/images/"
ARCHDAILY_PAGE = "https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will"
# key -> (path under IMAGE_BASE, local file name)
SOURCES: dict[str, tuple[str, str]] = {
    "L01": ("5fc0/5c12/63c0/17d6/2c00/10b6/large_jpg/LEVEL_01_PLAN_1-500-01.jpg", "LEVEL_01_PLAN.jpg"),
    "L02": ("5fc0/5c47/63c0/17dd/6300/0d93/large_jpg/LEVEL_02_PLAN_1-500-01.jpg", "LEVEL_02_PLAN.jpg"),
    "L03": ("5fc0/5caa/63c0/17dd/6300/0d98/large_jpg/LEVEL_03_PLAN_1-500-01.jpg", "LEVEL_03_PLAN.jpg"),
    "L04": ("5fc0/5cd5/63c0/17d6/2c00/10bd/large_jpg/LEVEL_04_PLAN_1-500-01.jpg", "LEVEL_04_PLAN.jpg"),
    "L05": ("5fc0/5d0d/63c0/17d6/2c00/10c0/large_jpg/LEVEL_05_PLAN_1-500-01.jpg", "LEVEL_05_PLAN.jpg"),
    "L06": ("5fc0/5d5c/63c0/17dd/6300/0d9f/large_jpg/LEVEL_06_PLAN_1-500-01.jpg", "LEVEL_06_PLAN.jpg"),
    "L07": ("5fc0/5dbd/63c0/17dd/6300/0da3/large_jpg/LEVEL_07_PLAN_1-500-01.jpg", "LEVEL_07_PLAN.jpg"),
    "L08": ("5fc0/5e41/63c0/17dd/6300/0da4/large_jpg/LEVEL_08_PLAN_1-500-01.jpg", "LEVEL_08_PLAN.jpg"),
    "section": ("5fc0/5f64/63c0/17d6/2c00/10d3/large_jpg/UWaterloo_Engineering7_Section.jpg", "E7_SECTION.jpg"),
    "site": ("5fc0/5e9d/63c0/17dd/6300/0da6/large_jpg/Site_Plan_1-500-01.jpg", "SITE_PLAN.jpg"),
}


def level_key(n: int) -> str:
    return f"L{n:02d}"


def raw_path(key: str) -> Path:
    return RAW / SOURCES[key][1]


def part_ids() -> list[str]:
    """All part ids in build order: slab 1, envelope 1, slab 2, ..., envelope 8, roof."""
    ids: list[str] = []
    for n in LEVELS:
        ids += [f"part_e7_l{n:02d}_slab", f"part_e7_l{n:02d}_envelope"]
    return ids + ["part_e7_roof"]


# ---------- files ----------

def ensure_dirs() -> None:
    for d in (RAW, STAGES / "scale", STAGES / "footprints", STAGES / "heights", FLOORS, OUT):
        d.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n")
    print(f"  wrote {path.relative_to(REPO)}")


def r3(v: float) -> float:
    """Round to the millimetre, so the JSON is readable and stable between runs."""
    return round(float(v), 3)


# ---------- overrides YAML ----------

class _Flow(list):
    """A list that is dumped in YAML flow style ([x, y]) so point lists stay readable."""


class _Dumper(yaml.SafeDumper):
    pass


_Dumper.add_representer(_Flow, lambda d, v: d.represent_sequence("tag:yaml.org,2002:seq", v, flow_style=True))

HEADER = """\
# e7_overrides.yaml: EVERY hand-entered number in the E7 pipeline lives here.
# Pixel coordinates are (x, y) in the downloaded large_jpg images, origin top-left, y grows downward.
# Re-click any stage with:  python tools/e7/01_scale.py --click   (also 02_footprints.py, 03_heights.py)
# The scripts rewrite this file when you click, so comments below this header are not preserved.
"""


def _flowify(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: _flowify(v) for k, v in node.items()}
    if isinstance(node, (list, tuple)):
        if all(isinstance(x, (int, float)) for x in node):
            return _Flow(node)
        return [_flowify(x) for x in node]
    return node


def load_overrides() -> dict:
    return yaml.safe_load(OVERRIDES.read_text())


def save_overrides(ov: dict) -> None:
    body = yaml.dump(_flowify(ov), Dumper=_Dumper, sort_keys=False, width=110, allow_unicode=True)
    OVERRIDES.write_text(HEADER + body)
    print(f"  updated {OVERRIDES.relative_to(REPO)}")


def mark_clicked(ov: dict, stage: str) -> None:
    """Record that a person re-clicked this stage, so the plan's provenance can say so honestly."""
    from datetime import datetime, timezone
    ov.setdefault("clicked_by_person", {})[stage] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- clicking ----------

def click_points(image_path: Path, title: str, n: int = -1, zoom_box: tuple[float, float, float, float] | None = None):
    """Open the image, let a person click points, return [[x, y], ...] in image pixels.

    Left click adds a point, right click removes the last one, Enter (or middle click) finishes.
    """
    import matplotlib.pyplot as plt
    from PIL import Image

    img = Image.open(image_path)
    fig, ax = plt.subplots(figsize=(12, 12))
    ax.imshow(img)
    if zoom_box:
        x0, y0, x1, y1 = zoom_box
        ax.set_xlim(x0, x1)
        ax.set_ylim(y1, y0)
    ax.set_title(title + "\nleft click = add, right click = undo, Enter = done", fontsize=10)
    pts = plt.ginput(n=n, timeout=0, show_clicks=True)
    plt.close(fig)
    return [[round(x, 1), round(y, 1)] for x, y in pts]


# ---------- geometry ----------

def px_to_m(pt_px, origin_px, px_per_m: float) -> tuple[float, float]:
    """Image pixel -> shared model frame (x_m, z_m). No flip: image y-down becomes model +Z."""
    return ((pt_px[0] - origin_px[0]) / px_per_m, (pt_px[1] - origin_px[1]) / px_per_m)


def load_floor_polygon(n: int):
    """The level's footprint as a shapely Polygon whose coordinates are (model x, model z)."""
    from shapely.geometry import Polygon
    floor = read_json(FLOORS / f"{level_key(n)}.json")
    return Polygon(floor["polygon_m"])
