"""Stage 1: pixels per metre for each level sheet, from two points on its scale bar (0 m and 20 m ticks).

Default: reads the points from e7_overrides.yaml.   --click: a person clicks them and the YAML is updated.
Writes data/e7/stages/scale/scale.json and a small L0N.overlay.png crop of the scale bar (git-ignored).
"""
from __future__ import annotations

import argparse
import math
import sys

from PIL import Image, ImageDraw

import common as c


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--click", action="store_true", help="click the 0 m and 20 m ticks on each sheet")
    ap.add_argument("--level", type=int, action="append", help="only (re)click these levels, e.g. --level 3")
    args = ap.parse_args()

    c.ensure_dirs()
    ov = c.load_overrides()
    bar_m = float(ov["scale"]["bar_length_m"])

    if args.click:
        changed = False
        for n in args.level or c.LEVELS:
            key = c.level_key(n)
            pts = c.click_points(c.raw_path(key), f"{key}: click the 0 m tick, then the {bar_m:g} m tick of the scale bar",
                                 n=2, zoom_box=(40, 1820, 480, 2000))
            if len(pts) != 2:
                print(f"  {key}: need exactly 2 clicks, got {len(pts)}; keeping the old values")
                continue
            ov["scale"]["sheets"][key] = {"zero_px": pts[0], "twenty_px": pts[1]}
            changed = True
        if changed:
            c.mark_clicked(ov, "scale")
            c.save_overrides(ov)

    out, ok = {"bar_length_m": bar_m, "sheets": {}}, True
    for n in c.LEVELS:
        key = c.level_key(n)
        p0, p1 = ov["scale"]["sheets"][key]["zero_px"], ov["scale"]["sheets"][key]["twenty_px"]
        dist = math.dist(p0, p1)
        ppm = dist / bar_m
        out["sheets"][key] = {"zero_px": p0, "twenty_px": p1, "bar_px": round(dist, 2), "px_per_m": round(ppm, 4),
                              "m_per_px": round(1 / ppm, 6)}
        # A 1:500 sheet that is about 2000 px wide should land near 13-14 px/m.
        if not 8 < ppm < 25:
            print(f"  {key}: px_per_m = {ppm:.2f} looks wrong for a 1:500 sheet")
            ok = False
        print(f"  {key}: {dist:.1f} px = {bar_m:g} m  ->  {ppm:.3f} px/m")

        img = Image.open(c.raw_path(key)).convert("RGB").crop((0, 1800, 520, 2000)).resize((1040, 400), Image.LANCZOS)
        d = ImageDraw.Draw(img)
        for p, label in ((p0, "0 m"), (p1, f"{bar_m:g} m")):
            x, y = p[0] * 2, (p[1] - 1800) * 2
            d.line([(x, y - 40), (x, y + 40)], fill=(220, 30, 60), width=3)
            d.text((x + 6, y - 58), label, fill=(220, 30, 60))
        img.save(c.STAGES / "scale" / f"{key}.overlay.png", optimize=True)

    ppms = [s["px_per_m"] for s in out["sheets"].values()]
    out["spread_px_per_m"] = round(max(ppms) - min(ppms), 4)
    c.write_json(c.STAGES / "scale" / "scale.json", out)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
