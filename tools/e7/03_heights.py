"""Stage 3: floor-to-floor heights, estimated from the published E7 section. Provenance: estimated_from_section.

Scale: two x-points on the section whose real separation is known from the plan (metres / pixel distance).
Then y-points: ground line, each floor line (L2..L8), the top of level 8 (roof base) and the roof top.
The section is a perspective render, so pick the two scale points ON THE SAME WALL the floor lines are read on.

Default: reads everything from e7_overrides.yaml.   --click: a person clicks it all and the YAML is updated.
Writes data/e7/stages/heights/heights.json, heights.geom.png (committable) and heights.overlay.png (git-ignored).
"""
from __future__ import annotations

import argparse
import math
import sys

from PIL import Image, ImageDraw, ImageFont

import common as c

INK = (220, 30, 60)


def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def click(ov: dict) -> None:
    sec = ov["section"]
    ref = sec["scale_ref"]
    section_img = c.raw_path("section")
    pts = c.click_points(section_img, "SECTION: click two features on the back wall whose spacing you can find on the plan "
                                      "(e.g. two column centre-lines far apart)", n=2)
    if len(pts) == 2:
        ref["section_pts_px"] = pts
    pts = c.click_points(c.raw_path(ref["plan_level"]), f"PLAN {ref['plan_level']}: click the same two features",
                         n=2, zoom_box=(720, 380, 1480, 1760))
    if len(pts) == 2:
        ref["plan_pts_px"] = pts
    names = ["ground line"] + [f"{c.level_key(n)} floor line" for n in c.LEVELS[1:]] + ["top of level 8 (roof base)", "roof top"]
    pts = c.click_points(section_img, "SECTION: click, bottom to top: " + ", ".join(names), n=len(names))
    if len(pts) == len(names):
        ys = [p[1] for p in pts]
        sec["ground_y"] = ys[0]
        sec["floor_lines_y"] = {c.level_key(n): ys[i] for i, n in enumerate(c.LEVELS[1:], start=1)}
        sec["roof_base_y"], sec["roof_top_y"] = ys[-2], ys[-1]
        c.mark_clicked(ov, "heights")
    else:
        print(f"  need {len(names)} clicks, got {len(pts)}; keeping the old y values")
    c.save_overrides(ov)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--click", action="store_true", help="click the scale points and the floor lines")
    args = ap.parse_args()

    c.ensure_dirs()
    ov = c.load_overrides()
    if args.click:
        click(ov)
    sec = ov["section"]
    ref = sec["scale_ref"]
    scale = c.read_json(c.STAGES / "scale" / "scale.json")

    plan_ppm = scale["sheets"][ref["plan_level"]]["px_per_m"]
    length_m = math.dist(*ref["plan_pts_px"]) / plan_ppm
    span_px = abs(ref["section_pts_px"][1][0] - ref["section_pts_px"][0][0])
    ppm = span_px / length_m
    print(f"  section scale: {span_px:.1f} px = {length_m:.2f} m (from {ref['plan_level']})  ->  {ppm:.3f} px/m")

    # y grows downward in the image, so height above ground = (ground_y - y) / px_per_m
    ys = [sec["ground_y"]] + [sec["floor_lines_y"][c.level_key(n)] for n in c.LEVELS[1:]]
    elev = [c.r3((sec["ground_y"] - y) / ppm) for y in ys]
    roof_base, roof_top = (c.r3((sec["ground_y"] - sec[k]) / ppm) for k in ("roof_base_y", "roof_top_y"))
    tops = elev[1:] + [roof_base]

    ok, levels = True, []
    for i, n in enumerate(c.LEVELS):
        h = c.r3(tops[i] - elev[i])
        levels.append({"level": n, "floor_y_px": ys[i], "floor_elevation_m": elev[i], "floor_to_floor_m": h})
        flag = "" if 2.8 <= h <= 7.0 else "   <-- implausible storey height"
        ok &= not flag
        print(f"  L{n:02d}: floor at {elev[i]:6.2f} m, floor-to-floor {h:5.2f} m{flag}")
    roof_h = c.r3(roof_top - roof_base)
    print(f"  roof: base {roof_base:.2f} m, top {roof_top:.2f} m, height {roof_h:.2f} m")
    if roof_h <= 0 or any(b <= a for a, b in zip(elev + [roof_base], elev[1:] + [roof_base, roof_top])):
        print("  the y values are not in bottom-to-top order")
        ok = False

    c.write_json(c.STAGES / "heights" / "heights.json", {
        "provenance": sec.get("provenance", "estimated_from_section"),
        "section_px_per_m": round(ppm, 4),
        "scale_reference": {"plan_level": ref["plan_level"], "length_m": c.r3(length_m), "section_span_px": span_px},
        "ground_y_px": sec["ground_y"], "levels": levels,
        "roof": {"base_y_px": sec["roof_base_y"], "top_y_px": sec["roof_top_y"],
                 "base_elevation_m": roof_base, "top_elevation_m": roof_top, "height_m": roof_h},
        "total_height_m": roof_top,
        "note": sec.get("roof_note", ""),
    })

    drawing = Image.open(c.raw_path("section")).convert("RGB")
    lines = [(sec["ground_y"], "ground / L01  0.00 m")]
    lines += [(ys[i], f"L{n:02d}  {elev[i]:.2f} m") for i, n in enumerate(c.LEVELS) if i > 0]
    lines += [(sec["roof_base_y"], f"roof base  {roof_base:.2f} m"), (sec["roof_top_y"], f"roof top  {roof_top:.2f} m")]
    for base, name in ((Image.new("RGB", drawing.size, "white"), "heights.geom.png"), (drawing, "heights.overlay.png")):
        up = base.resize((base.size[0] * 2, base.size[1] * 2), Image.LANCZOS)   # 2x so the labels are legible
        d = ImageDraw.Draw(up)
        x0, x1 = (p[0] * 2 for p in ref["section_pts_px"])
        for y, label in lines:
            d.line([(x0 - 120, y * 2), (x1 + 120, y * 2)], fill=INK, width=2)
            ty = y * 2 + (14 if label.startswith("roof base") else -13)     # keep the two roof labels apart
            d.rectangle([x1 + 126, ty, x1 + 330, ty + 26], fill=(255, 255, 255))
            d.text((x1 + 130, ty + 1), label, fill=INK, font=font(20))
        ry = ref["section_pts_px"][0][1] * 2
        for x in (x0, x1):
            d.line([(x, ry - 30), (x, ry + 30)], fill=(20, 90, 200), width=4)
        d.line([(x0, ry), (x1, ry)], fill=(20, 90, 200), width=2)
        d.rectangle([x0 + 10, ry - 34, x0 + 330, ry - 6], fill=(255, 255, 255))
        d.text((x0 + 14, ry - 33), f"scale reference: {length_m:.2f} m from plan", fill=(20, 90, 200), font=font(20))
        up.save(c.STAGES / "heights" / name, optimize=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
