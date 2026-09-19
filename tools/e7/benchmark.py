"""Benchmark: how accurate is the E7 model, measured against sources that did not produce it.

Inputs are the model's own geometry (data/e7/floors/L0N.json outlines, data/e7/stages/heights/heights.json floor
lines) and three independent references, all committed and openly licensed:

- OpenStreetMap way 382735686 (Pearl Sullivan Engineering Building, ex-E7): the building outline (ODbL).
- Ontario lidar-derived DSM and DTM, 0.5 m, 2025 (Open Government Licence - Ontario): real roof heights.
- Published facts: 8 levels in OSM; gross floor area 230,000-242,000 sq ft in UW / consultant sources.

Nothing here reads the Perkins&Will drawings, so the benchmark runs anywhere, including CI.

Writes data/e7/out/e7.benchmark.json (numbers) and data/e7/stages/benchmark/*.png (geometry-only pictures).
04_plan.py turns the measured errors into each part's accuracy tags (source, tolerance_m, basis).
`--check` recomputes and fails if the committed benchmark is stale, so nobody ships a model with an old score.
"""
from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np
from PIL import Image
from shapely import affinity
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

import common as c

OSM_WAY = 382735686
UTM_ZONE = 17
GFA_PUBLISHED_M2 = (230_000 * 0.09290304, 242_000 * 0.09290304)   # sources disagree; both ends are reported
OUT = c.OUT / "e7.benchmark.json"
PICS = c.STAGES / "benchmark"


# ── coordinates ──────────────────────────────────────────────────────────────────────────────────────────────
def utm(lat: float, lon: float, zone: int = UTM_ZONE) -> tuple[float, float]:
    """WGS84 latitude/longitude to UTM easting/northing (northern hemisphere), Snyder's series; millimetre-level
    within a zone. The lidar is in NAD83 / UTM 17N: NAD83 and WGS84 differ here by about a metre, which the
    rigid fit below absorbs for the footprint; for heights it is at most two lidar pixels at roof edges, so the
    height comparison uses an outline shrunk by 2 m."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    phi, lam = math.radians(lat), math.radians(lon)
    lam0 = math.radians(-183 + 6 * zone)
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    t = math.tan(phi) ** 2; cc = ep2 * math.cos(phi) ** 2; aa = math.cos(phi) * (lam - lam0)
    m = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = k0 * n * (aa + (1 - t + cc) * aa ** 3 / 6 + (5 - 18 * t + t * t + 72 * cc - 58 * ep2) * aa ** 5 / 120) + 500000
    y = k0 * (m + n * math.tan(phi) * (aa ** 2 / 2 + (5 - t + 9 * cc + 4 * cc * cc) * aa ** 4 / 24
                                       + (61 - 58 * t + t * t + 600 * cc - 330 * ep2) * aa ** 6 / 720))
    return x, y


def osm_outline() -> Polygon:
    data = c.read_json(c.DATA / "context" / "pse.json")
    way = next(e for e in data["elements"] if e["type"] == "way" and e["id"] == OSM_WAY)
    return Polygon([utm(p["lat"], p["lon"]) for p in way["geometry"]]).buffer(0)


def osm_levels() -> int:
    data = c.read_json(c.DATA / "context" / "pse.json")
    way = next(e for e in data["elements"] if e["type"] == "way" and e["id"] == OSM_WAY)
    return int(way["tags"]["building:levels"])


def model_outlines() -> dict[int, Polygon]:
    """Each level's outline as (x, -z): the plan's +Z runs down the drawing, so flipping it gives a map-like frame
    (north roughly up) that differs from UTM by a rotation and a shift only, never a mirror."""
    out = {}
    for n in c.LEVELS:
        fl = c.read_json(c.FLOORS / f"L{n:02d}.json")
        out[n] = Polygon([(x, -z) for x, z in fl["polygon_m"]]).buffer(0)
    return out


# ── registration ─────────────────────────────────────────────────────────────────────────────────────────────
def place(poly: Polygon, theta: float, tx: float, ty: float, s: float = 1.0) -> Polygon:
    p = affinity.scale(poly, s, s, origin=(0, 0)) if s != 1.0 else poly
    return affinity.translate(affinity.rotate(p, theta, origin=(0, 0)), tx, ty)


def iou(a: Polygon, b: Polygon) -> float:
    return a.intersection(b).area / a.union(b).area


def fit(model: Polygon, ref: Polygon, with_scale: bool) -> dict:
    """Rotation (and optionally uniform scale) plus shift that maximises overlap. A coarse sweep over every degree
    with the centroids matched, then a shrinking coordinate search. Deterministic: same inputs, same answer."""
    cx, cy = ref.centroid.x, ref.centroid.y

    def at(theta: float, s: float = 1.0) -> tuple[float, float]:
        p = place(model, theta, 0, 0, s)
        return cx - p.centroid.x, cy - p.centroid.y

    best = max(((iou(place(model, th, *at(th)), ref), th) for th in np.arange(0, 360, 1.0)), key=lambda r: r[0])
    theta = float(best[1]); tx, ty = at(theta); s = 1.0
    params = [theta, tx, ty, s]
    steps = [0.5, 1.0, 1.0, 0.01]
    score = iou(place(model, *params), ref)
    for _ in range(60):
        improved = False
        for i in range(4 if with_scale else 3):
            for sign in (1, -1):
                trial = list(params); trial[i] += sign * steps[i]
                v = iou(place(model, *trial), ref)
                if v > score + 1e-9: params, score, improved = trial, v, True
        if not improved:
            steps = [st / 2 for st in steps]
            if steps[0] < 0.005: break
    return {"theta_deg": params[0], "tx": params[1], "ty": params[2], "scale": params[3], "iou": score}


def boundary_distances(a: Polygon, b: Polygon, step: float = 0.25) -> np.ndarray:
    """Distance from points every `step` m along each outline to the other outline, both ways (symmetric)."""
    def along(p: Polygon, q: Polygon) -> list[float]:
        ring = p.exterior; n = max(4, int(ring.length / step))
        return [q.exterior.distance(ring.interpolate(i * ring.length / n)) for i in range(n)]
    return np.array(along(a, b) + along(b, a))


# ── heights ──────────────────────────────────────────────────────────────────────────────────────────────────
def read_lidar() -> tuple[np.ndarray, tuple[float, float, float]]:
    """nDSM (height above ground) and its grid: easting of column 0, northing of row 0, pixel size."""
    grids = []
    for name in ("DSM", "DTM"):
        im = Image.open(c.DATA / "lidar" / f"Ontario_{name}_LidarDerived.tif")
        tag = im.tag_v2
        px = float(tag[33550][0]); e0, n0 = float(tag[33922][3]), float(tag[33922][4])
        grids.append(np.array(im, dtype=np.float64))
    return grids[0] - grids[1], (e0, n0, px)


def model_heights() -> dict[int, float]:
    """Top of each level above Level 1's floor. The top level ends at the roof the section shows."""
    h = c.read_json(c.STAGES / "heights" / "heights.json")
    tops = {lv["level"]: lv["floor_elevation_m"] + lv["floor_to_floor_m"] for lv in h["levels"]}
    tops[max(tops)] = max(tops[max(tops)], h.get("roof", {}).get("top_elevation_m", 0.0))
    return tops


def compare_heights(outlines_utm: dict[int, Polygon], tops: dict[int, float]) -> dict:
    ndsm, (e0, n0, px) = read_lidar()
    union = unary_union(list(outlines_utm.values())).buffer(-2.0)          # away from the edges (datum shift, facade)
    rows, cols = ndsm.shape
    model, lidar, where = [], [], []
    for r in range(rows):
        for col in range(cols):
            p = Point(e0 + (col + 0.5) * px, n0 - (r + 0.5) * px)
            if not union.contains(p): continue
            covering = [tops[n] for n, poly in outlines_utm.items() if poly.contains(p)]
            if not covering: continue
            model.append(max(covering)); lidar.append(ndsm[r, col]); where.append((r, col))
    model, lidar = np.array(model), np.array(lidar)
    err = model - lidar
    top_level = max(tops)
    top_zone = np.array([outlines_utm[top_level].contains(Point(e0 + (col + 0.5) * px, n0 - (r + 0.5) * px)) for r, col in where])
    return {
        "samples": int(len(err)),
        "pixel_m": round(px, 3),
        "median_abs_error_m": round(float(np.median(np.abs(err))), 2),
        "rmse_m": round(float(np.sqrt(np.mean(err ** 2))), 2),
        "bias_m": round(float(np.median(err)), 2),
        "p90_abs_error_m": round(float(np.percentile(np.abs(err), 90)), 2),
        "zones": {
            "penthouse (level 8 outline)": {"model_m": round(float(np.median(model[top_zone])), 2), "lidar_median_m": round(float(np.median(lidar[top_zone])), 2)},
            "main roof (outside level 8)": {"model_m": round(float(np.median(model[~top_zone])), 2), "lidar_median_m": round(float(np.median(lidar[~top_zone])), 2)},
        },
        "_where": where, "_err": err,
    }


# ── pictures ─────────────────────────────────────────────────────────────────────────────────────────────────
def pictures(model_utm: Polygon, ref: Polygon, heights: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    PICS.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 6), dpi=120)
    for poly, colour, label in ((ref, "#e0712b", "OpenStreetMap outline"), (model_utm, "#1f6feb", "model (union of levels, fitted)")):
        x, y = poly.exterior.xy; ax.plot(x, y, color=colour, lw=2, label=label)
    ax.set_aspect("equal"); ax.legend(loc="lower left", fontsize=8); ax.set_title("E7 footprint vs OpenStreetMap"); ax.set_xlabel("UTM 17N easting (m)")
    fig.tight_layout(); fig.savefig(PICS / "footprint.geom.png"); plt.close(fig)

    ndsm, _ = read_lidar()
    grid = np.full(ndsm.shape, np.nan)
    for (r, col), e in zip(heights["_where"], heights["_err"]): grid[r, col] = e
    fig, ax = plt.subplots(figsize=(6, 6), dpi=120)
    im = ax.imshow(grid, cmap="RdBu_r", vmin=-8, vmax=8); fig.colorbar(im, ax=ax, label="model - lidar (m)")
    ax.set_title("Roof height error (red: model too high)"); ax.set_xticks([]); ax.set_yticks([])
    fig.tight_layout(); fig.savefig(PICS / "heights.geom.png"); plt.close(fig)


# ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────
def measure(draw: bool) -> dict:
    outlines = model_outlines()
    model = unary_union(list(outlines.values()))
    ref = osm_outline()

    rigid = fit(model, ref, with_scale=False)
    similar = fit(model, ref, with_scale=True)
    placed = place(model, rigid["theta_deg"], rigid["tx"], rigid["ty"])
    dist = boundary_distances(placed, ref)
    outlines_utm = {n: place(p, rigid["theta_deg"], rigid["tx"], rigid["ty"]) for n, p in outlines.items()}
    heights = compare_heights(outlines_utm, model_heights())
    if draw: pictures(placed, ref, heights)

    gfa = sum(p.area for p in outlines.values())
    lo, hi = GFA_PUBLISHED_M2
    footprint = {
        "reference": f"OpenStreetMap way {OSM_WAY}",
        "iou": round(rigid["iou"], 3),
        "model_area_m2": round(model.area, 1),
        "reference_area_m2": round(ref.area, 1),
        "area_error_pct": round(100 * (model.area - ref.area) / ref.area, 1),
        "mean_boundary_distance_m": round(float(dist.mean()), 2),
        "p90_boundary_distance_m": round(float(np.percentile(dist, 90)), 2),
        "max_boundary_distance_m": round(float(dist.max()), 2),
        "fit_rotation_deg": round(rigid["theta_deg"] % 360, 2),
        "scale_if_free": round(similar["scale"], 3),
        "iou_if_scale_free": round(similar["iou"], 3),
    }
    return {
        "what": "Accuracy of the E7 model against sources that did not produce it. Lower errors and higher IoU are better.",
        "footprint": footprint,
        "heights": {k: v for k, v in heights.items() if not k.startswith("_")},
        "levels": {"model": len(outlines), "reference": osm_levels(), "reference_source": f"OpenStreetMap way {OSM_WAY} building:levels"},
        "gross_floor_area": {
            "model_m2": round(gfa, 0), "published_m2": [round(lo, 0), round(hi, 0)],
            "error_pct_vs_nearest": round(100 * (gfa - min(max(gfa, lo), hi)) / min(max(gfa, lo), hi), 1),
            "note": "The massing model counts the atrium and every outline as floor on every level, so it overstates floor area.",
        },
        "not_measured": ["atrium width (the massing model has no atrium)", "interior walls, doors, stairs (not modelled)"],
        "caveats": [
            "OpenStreetMap outlines are traced from aerial imagery; typically within about 1 m.",
            "The OpenStreetMap outline includes the start of the bridge to Engineering 6, which the model leaves out on purpose; that lowers the IoU a little.",
            "The lidar is NAD83 / UTM 17N and the outline WGS84: about 1 m apart here. The outline is shrunk by 2 m before sampling heights.",
            "Lidar sees parapets, rooftop plant and the sawtooth ridges; the model's roofs are flat.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="fail if the committed benchmark does not match the current model")
    args = ap.parse_args()
    result = measure(draw=not args.check)
    if args.check:
        committed = c.read_json(OUT) if OUT.exists() else None
        if committed != json.loads(json.dumps(result)):
            print("e7.benchmark.json is stale: run tools/e7/.venv/bin/python tools/e7/benchmark.py and commit it")
            return 1
        print("benchmark up to date")
        return 0
    c.write_json(OUT, result)
    f, h = result["footprint"], result["heights"]
    print(f"footprint vs OSM: IoU {f['iou']}, mean edge distance {f['mean_boundary_distance_m']} m (p90 {f['p90_boundary_distance_m']} m), "
          f"area {f['area_error_pct']:+}%; with free scale {f['scale_if_free']} the IoU would be {f['iou_if_scale_free']}")
    print(f"roof heights vs lidar: median |error| {h['median_abs_error_m']} m, RMSE {h['rmse_m']} m, bias {h['bias_m']:+} m over {h['samples']} pixels")
    for zone, z in h["zones"].items(): print(f"  {zone}: model {z['model_m']} m, lidar {z['lidar_median_m']} m")
    print(f"levels: model {result['levels']['model']}, OSM {result['levels']['reference']}; "
          f"floor area {result['gross_floor_area']['model_m2']:.0f} m2 vs published {result['gross_floor_area']['published_m2']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
