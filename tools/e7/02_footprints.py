"""Stage 2: the E7 outline on each level, from pixel corners to metres in ONE shared frame.

Default: reads the corners from e7_overrides.yaml.   --click: a person clicks them and the YAML is updated.
Writes data/e7/floors/L0N.json plus two images per level in data/e7/stages/footprints/:
  L0N.geom.png     our polygon only, on a blank background   (may be committed)
  L0N.overlay.png  our polygon over the architects' drawing  (git-ignored, video only)
"""
from __future__ import annotations

import argparse
import sys

from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Polygon
from shapely.validation import explain_validity

import common as c

AREA_MIN_M2, AREA_MAX_M2 = 1000.0, 6000.0   # E7 is about 21,000 m2 over 7 floors plus a penthouse
INK, FILL = (220, 30, 60), (220, 30, 60, 60)


def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:            # very old Pillow
        return ImageFont.load_default()


def draw_stage(base: Image.Image, poly_px, origin_px, ppm: float, title: str, sub: str) -> Image.Image:
    img = base.convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = [tuple(p) for p in poly_px]
    d.polygon(pts, fill=FILL)
    d.line(pts + [pts[0]], fill=INK + (255,), width=5, joint="curve")
    for x, y in pts:
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=INK + (255,))
    # origin and axes of the shared model frame
    ox, oy = origin_px
    d.line([(ox, oy), (ox + 90, oy)], fill=(20, 90, 200, 255), width=4)
    d.line([(ox, oy), (ox, oy + 90)], fill=(20, 90, 200, 255), width=4)
    d.ellipse([ox - 8, oy - 8, ox + 8, oy + 8], outline=(20, 90, 200, 255), width=4)
    d.text((ox + 96, oy - 16), "+X", fill=(20, 90, 200, 255), font=font(26))
    d.text((ox - 16, oy + 94), "+Z", fill=(20, 90, 200, 255), font=font(26))
    # our own 20 m bar (top-right, clear of the drawing's title block)
    bx, by = img.size[0] - 120 - 20 * ppm, 90
    d.line([(bx, by), (bx + 20 * ppm, by)], fill=(0, 0, 0, 255), width=6)
    d.text((bx, by + 10), "20 m (traced scale)", fill=(0, 0, 0, 255), font=font(24))
    d.text((60, 40), title, fill=(0, 0, 0, 255), font=font(44))
    d.text((60, 96), sub, fill=(60, 60, 60, 255), font=font(26))
    return Image.alpha_composite(img, layer).convert("RGB")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--click", action="store_true", help="click E7's outline corners on each level")
    ap.add_argument("--level", type=int, action="append", help="only (re)click these levels, e.g. --level 3")
    args = ap.parse_args()

    c.ensure_dirs()
    ov = c.load_overrides()
    scale = c.read_json(c.STAGES / "scale" / "scale.json")
    origin = ov["frame"]["origin_px"]

    if args.click:
        changed = False
        for n in args.level or c.LEVELS:
            key = c.level_key(n)
            pts = c.click_points(
                c.raw_path(key),
                f"{key}: click E7's outline corners in order (EAST bar + atrium; NOT the west wing = E5, NOT the bridge)",
                zoom_box=(720, 380, 1480, 1760))
            if len(pts) < 3:
                print(f"  {key}: need at least 3 corners, got {len(pts)}; keeping the old polygon")
                continue
            ov["footprints"][key]["polygon_px"] = pts
            changed = True
        if changed:
            c.mark_clicked(ov, "footprints")
            c.save_overrides(ov)

    ok = True
    by_eye = "footprints" not in (ov.get("clicked_by_person") or {})
    for n in c.LEVELS:
        key = c.level_key(n)
        ppm = scale["sheets"][key]["px_per_m"]
        poly_px = ov["footprints"][key]["polygon_px"]
        poly_m = [c.px_to_m(p, origin, ppm) for p in poly_px]
        shape = Polygon(poly_m)
        problems = []
        if not shape.is_valid:
            problems.append(explain_validity(shape))
        if not shape.exterior.is_simple:
            problems.append("outline crosses itself")
        if not AREA_MIN_M2 < shape.area < AREA_MAX_M2:
            problems.append(f"area {shape.area:.0f} m2 is outside {AREA_MIN_M2:.0f}-{AREA_MAX_M2:.0f} m2")
        if problems:
            ok = False
            print(f"  {key}: INVALID: {'; '.join(problems)}")
        minx, minz, maxx, maxz = shape.bounds
        print(f"  {key}: {len(poly_px)} corners, area {shape.area:8.1f} m2, "
              f"X {minx:6.2f}..{maxx:6.2f}  Z {minz:6.2f}..{maxz:6.2f}")
        c.write_json(c.FLOORS / f"{key}.json", {
            "level": n, "key": key, "frame": "x_m = (px_x - origin_x) / px_per_m ; z_m = (px_y - origin_y) / px_per_m",
            "origin_px": origin, "px_per_m": ppm,
            "traced_by": "AI assistant, by eye from zoomed crops" if by_eye else "person, clicked",
            "polygon_px": poly_px,
            "polygon_m": [[c.r3(x), c.r3(z)] for x, z in poly_m],
            "area_m2": round(shape.area, 1),
            "bounds_m": {"min_x": c.r3(minx), "min_z": c.r3(minz), "max_x": c.r3(maxx), "max_z": c.r3(maxz)},
            "note": ov["footprints"][key].get("note", ""),
        })

        drawing = Image.open(c.raw_path(key)).convert("RGB")
        sub = f"E7 footprint, {shape.area:,.0f} m2, {'estimated by eye' if by_eye else 'clicked by a person'}"
        blank = Image.new("RGB", drawing.size, "white")
        draw_stage(blank, poly_px, origin, ppm, f"E7 LEVEL {n}", sub).save(
            c.STAGES / "footprints" / f"{key}.geom.png", optimize=True)
        draw_stage(drawing, poly_px, origin, ppm, "", "").save(
            c.STAGES / "footprints" / f"{key}.overlay.png", optimize=True)

    # Upper floors should sit roughly over lower ones; a big overhang usually means a mis-click.
    for n in c.LEVELS[1:]:
        over = c.load_floor_polygon(n).difference(c.load_floor_polygon(n - 1).buffer(0.5)).area
        if over > 150:
            print(f"  note: {c.level_key(n)} overhangs {c.level_key(n - 1)} by {over:.0f} m2; check the clicks")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
