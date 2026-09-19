"""Stage 4: build data/e7/out/e7.plan.json, a valid Plan (packages/schemas/dist/jsonschema/Plan.json).

Per level N = 1..8: part_e7_l0N_slab (footprint x 0.3 m) and part_e7_l0N_envelope (footprint x clear height),
plus part_e7_roof. One step per part, in build order. No overall_size (the desk-scale size check is for boxes).
"""
from __future__ import annotations

import sys

import common as c

MATERIALS = {
    "slab": ("mat_e7_concrete_slab", "Concrete floor slab", "Cast-in-place slab, thickness ASSUMED 0.3 m (massing model)"),
    "envelope": ("mat_e7_curtain_wall", "Curtain wall storey", "One storey of building envelope, extruded footprint (massing model)"),
    "roof": ("mat_e7_roof", "Roof", "Roof cap on the level 8 footprint (massing model; the real atrium roof is a sawtooth)"),
}


def main() -> int:
    c.ensure_dirs()
    ov = c.load_overrides()
    heights = c.read_json(c.STAGES / "heights" / "heights.json")
    specs = c.part_specs()
    days = ov["schedule"]
    minutes = {"slab": days["slab_days"] * 1440, "envelope": days["envelope_days"] * 1440, "roof": days["roof_days"] * 1440}
    step_of = {s["part_id"]: f"step_{i:02d}" for i, s in enumerate(specs, start=1)}

    parts, steps = [], []
    for i, s in enumerate(specs, start=1):
        n, role, pid = s["level"], s["role"], s["part_id"]
        floor = c.read_json(c.FLOORS / f"{c.level_key(n)}.json")
        b = floor["bounds_m"]
        if role == "slab":
            name, aliases = f"Level {n} slab", [f"L{n} slab", f"floor {n} slab"]
            rests_on = [] if n == 1 else [f"part_e7_l{n - 1:02d}_envelope"]          # L1 slab is the single datum
            hint = f"flat floor plate of level {n}, {floor['area_m2']:.0f} m2, 0.3 m thick"
            title, how = f"Pour level {n} slab", f"Form and pour the level {n} floor slab."
        elif role == "envelope":
            name, aliases = f"Level {n} envelope", [f"L{n} envelope", f"floor {n} walls", f"level {n} storey"]
            rests_on = [f"part_e7_l{n:02d}_slab"]
            hint = f"storey-high block of level {n}, {s['y1'] - s['y0']:.2f} m tall, standing on its slab"
            title, how = f"Enclose level {n}", f"Raise the level {n} structure and close it in with the envelope."
        else:
            name, aliases = "Roof", ["roof cap", "top"]
            rests_on = [f"part_e7_l{c.LEVELS[-1]:02d}_envelope"]
            hint = "thin cap on top of the level 8 block"
            title, how = "Close the roof", "Build the roof over level 8 and the atrium."
        layer = "structure" if role == "slab" else "envelope"
        mat_id = MATERIALS[role][0]
        parts.append({
            "part_id": pid, "name": name, "aliases": aliases, "kind": role, "layer": layer,
            "shape": {"type": "mesh", "uri": "e7.glb", "node": pid,
                      "bounds": {"min": [b["min_x"], s["y0"], b["min_z"]], "max": [b["max_x"], s["y1"], b["max_z"]]}},
            "position": [0, 0, 0], "material_id": mat_id, "step_id": step_of[pid],
            "rests_on": rests_on, "attaches_to": [], "verify_hint": hint,
            "install_minutes": minutes[role], "doc_refs": [],
        })
        steps.append({
            "step_id": step_of[pid], "index": i, "title": title, "instruction": how, "part_ids": [pid],
            "requires": [step_of[r] for r in rests_on], "layer": layer, "est_minutes": minutes[role],
            "materials": [{"material_id": mat_id, "qty": 1}], "doc_refs": [],
        })

    materials = []
    for role, (mat_id, name, spec) in MATERIALS.items():
        users = [p["part_id"] for p in parts if p["material_id"] == mat_id]
        materials.append({"material_id": mat_id, "name": name, "spec": spec, "unit": "each",
                          "quantity": len(users), "used_by": users, "doc_refs": []})

    clicked = ov.get("clicked_by_person") or {}
    who = (lambda stage, what: f"{what} were clicked by a person on {clicked[stage]}." if stage in clicked else
           f"{what} were estimated by eye by an AI assistant from zoomed crops of the drawings; no person has clicked them yet.")
    hs = ", ".join(f"L{lv['level']} {lv['floor_to_floor_m']:.2f}" for lv in heights["levels"])
    assumptions = [
        "Massing model only: each level is its outline extruded straight up. Interiors, columns, cores, the atrium "
        "voids, stairs and the bridge to Engineering 6 are omitted.",
        "Footprints were traced by hand from Perkins&Will's published 1:500 level plans (ArchDaily), scaled from each "
        "sheet's 20 m scale bar. " + who("footprints", "The footprint corners"),
        "Engineering 7 is taken to be the east bar plus the atrium. The west wing is the existing Engineering 5 "
        "(labelled 'existing roof' on the Level 7 sheet) and is excluded, as is Engineering 6.",
        f"Heights are estimated from the published section render (estimated_from_section), not dimensioned: "
        f"floor-to-floor in metres {hs}; total {heights['total_height_m']:.1f} m. "
        + who("heights", "The section's floor lines"),
        "The section is a perspective render; its scale was taken between two column lines on the same wall the floor "
        "lines were read on, matched to the Level 3 plan.",
        "The mechanical penthouse's height is not visible in the section; level 8 is assumed to top out at the atrium's "
        "sawtooth ridge line, and the sawtooth roof is simplified to a flat cap.",
        f"Slab thickness is assumed to be {c.SLAB_THICKNESS_M} m on every level.",
        "install_minutes are placeholders that only space the build animation; they are not a construction programme.",
    ]
    # Say "hand-clicked" only once a person really has clicked the footprints.
    extracted_by = ("tools/e7 massing pipeline (hand-clicked footprints)" if "footprints" in clicked else
                    "tools/e7 massing pipeline (footprints estimated by eye by an AI assistant, not yet hand-clicked)")
    plan = {
        "plan_id": "plan_e7_massing", "project_id": "proj_cutonce_demo", "name": "Engineering 7 massing model",
        "revision": 1, "status": "approved",
        "frame": {"handedness": "right", "up": "+Y", "units": "m", "pose": "upright",
                  "origin": f"plan pixel {tuple(ov['frame']['origin_px'])} on every level sheet: where the E5/E7 party-wall "
                            "line (west edge of the E7 atrium) meets the line of the E7 bar's north face, at Level 1 "
                            "finished floor (Y = 0). +X = drawing right (roughly east), +Z = drawing down (roughly south)."},
        "layers": ["structure", "envelope"],
        "parts": parts, "materials": materials, "steps": steps, "markers": [], "touch_points": [],
        "provenance": {"source_document_ids": [], "extracted_by": extracted_by,
                       "approved_by": ov["plan"]["approved_by"], "assumptions": assumptions, "validation": []},
    }
    c.write_json(c.OUT / "e7.plan.json", plan)
    print(f"  {len(parts)} parts, {len(steps)} steps, {len(materials)} materials")
    return 0


if __name__ == "__main__":
    sys.exit(main())
