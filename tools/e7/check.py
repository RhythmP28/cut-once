"""Check the pipeline's outputs. Exits non-zero on any failure.

 1. e7.plan.json validates against Plan.json; every event validates against BuildEvent.json.
 2. The rules `pnpm pm validate` applies that matter here: one datum, every rests_on target exists and touches
    (axis-aligned bounds within 2 mm), supports are built first, materials cover their parts, one step per part.
 3. e7.glb has exactly one mesh node per part, named exactly the part_id, with identity transforms, and each
    node's real bounds equal the bounds written in the plan.
 4. Prints each level's area, footprint bounds and elevation for an eyeball check.
"""
from __future__ import annotations

import json
import re
import struct
import sys

from jsonschema import Draft7Validator

import common as c

TOUCH_M = 0.002
RFC3339_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)
    print(f"  FAIL  {msg}")


def schema_errors(schema_name: str, instance) -> list[str]:
    validator = Draft7Validator(c.read_json(c.SCHEMA_DIR / schema_name))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in validator.iter_errors(instance)]


def glb_json(path) -> dict:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2, "not a glTF 2 binary"
    chunk_len, chunk_type = struct.unpack_from("<I4s", data, 12)
    assert chunk_type == b"JSON"
    return json.loads(data[20:20 + chunk_len])


def gap(a: dict, b: dict) -> float:
    return max(0.0, *(max(a["min"][i] - b["max"][i], b["min"][i] - a["max"][i]) for i in range(3)))


def main() -> int:
    plan = c.read_json(c.OUT / "e7.plan.json")
    events = c.read_json(c.OUT / "e7.events.json")
    parts = {p["part_id"]: p for p in plan["parts"]}
    steps = {s["step_id"]: s for s in plan["steps"]}

    # 1. schemas
    errs = schema_errors("Plan.json", plan)
    for e in errs[:20]:
        fail(f"plan schema: {e}")
    n_bad = 0
    for ev in events:
        for e in schema_errors("BuildEvent.json", ev):
            n_bad += 1
            fail(f"event v{ev.get('version')} schema: {e}")
        for k in ("timestamp", "client_timestamp"):
            if not RFC3339_UTC.match(ev.get(k, "")):
                n_bad += 1
                fail(f"event v{ev.get('version')}: {k} is not ISO 8601 UTC with Z")
    if not errs and not n_bad:
        print(f"  ok    schema ok: plan valid, {len(events)} events valid")

    # 2. plan logic
    before = len(errors)
    if list(parts) != c.part_ids():
        fail(f"part ids are not the expected 17 in build order: {list(parts)}")
    if "overall_size" in plan:
        fail("overall_size must not be set on the E7 plan")
    datums = [pid for pid, p in parts.items() if not p["rests_on"]]
    if datums != ["part_e7_l01_slab"]:
        fail(f"expected the single datum part_e7_l01_slab, found {datums}")
    for pid, p in parts.items():
        if p["shape"] != {**p["shape"], "type": "mesh", "uri": "e7.glb", "node": pid} or "bounds" not in p["shape"]:
            fail(f"{pid}: shape must be a mesh in e7.glb with node == part_id and bounds")
        if p["position"] != [0, 0, 0]:
            fail(f"{pid}: position must be [0, 0, 0]")
        holders = [s["step_id"] for s in plan["steps"] if pid in s["part_ids"]]
        if holders != [p["step_id"]]:
            fail(f"{pid}: should sit in exactly its own step {p['step_id']}, found {holders}")
        for target in p["rests_on"]:
            if target not in parts:
                fail(f"{pid}: rests_on target {target} does not exist")
                continue
            g = gap(p["shape"]["bounds"], parts[target]["shape"]["bounds"])
            if g > TOUCH_M:
                fail(f"{pid}: floats {g * 1000:.1f} mm away from {target}")
            if steps[p["step_id"]]["index"] <= steps[parts[target]["step_id"]]["index"]:
                fail(f"{pid}: is built before {target}, which it rests on")
            if parts[target]["step_id"] not in steps[p["step_id"]]["requires"]:
                fail(f"{pid}: step {p['step_id']} does not require {parts[target]['step_id']}")
    if [s["index"] for s in plan["steps"]] != list(range(1, len(parts) + 1)):
        fail("step indices are not 1..N in order")
    for m in plan["materials"]:
        users = [pid for pid, p in parts.items() if p["material_id"] == m["material_id"]]
        if m["quantity"] < len(users) or sorted(m["used_by"]) != sorted(users):
            fail(f"{m['material_id']}: quantity {m['quantity']} / used_by do not cover its {len(users)} parts")
    missing_mats = {p["material_id"] for p in parts.values()} - {m["material_id"] for m in plan["materials"]}
    if missing_mats:
        fail(f"materials not defined: {sorted(missing_mats)}")
    if [e["part_id"] for e in events] != [pid for s in plan["steps"] for pid in s["part_ids"]]:
        fail("events are not one per part in step order")
    if [e["version"] for e in events] != list(range(1, len(events) + 1)):
        fail("event versions are not 1..N")
    if len({e["event_id"] for e in events}) != len(events):
        fail("event ids are not unique")
    if [e["timestamp"] for e in events] != sorted(e["timestamp"] for e in events):
        fail("event timestamps do not increase")
    if len(errors) == before:
        print("  ok    rests_on ok: one datum, every target exists and touches, supports come first, materials cover parts")

    # 3. GLB
    before = len(errors)
    gltf = glb_json(c.OUT / "e7.glb")
    mesh_nodes = {n.get("name"): n for n in gltf["nodes"] if "mesh" in n}
    if sorted(mesh_nodes) != sorted(parts) or len(mesh_nodes) != sum("mesh" in n for n in gltf["nodes"]):
        fail(f"GLB mesh nodes {sorted(map(str, mesh_nodes))} != part ids")
    for n in gltf["nodes"]:
        if any(k in n for k in ("translation", "rotation", "scale")) or n.get("matrix", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) != [
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]:
            fail(f"GLB node {n.get('name')} has a transform; coordinates must be baked into the vertices")
    for pid, node in mesh_nodes.items():
        if pid not in parts:
            continue
        lo, hi = [float("inf")] * 3, [float("-inf")] * 3
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            lo = [min(a, b) for a, b in zip(lo, acc["min"])]
            hi = [max(a, b) for a, b in zip(hi, acc["max"])]
        want = parts[pid]["shape"]["bounds"]
        if any(abs(a - b) > 1e-3 for a, b in zip(lo + hi, want["min"] + want["max"])):
            fail(f"{pid}: GLB bounds {lo} {hi} differ from the plan's {want}")
    if len(errors) == before:
        print(f"  ok    nodes match: {len(mesh_nodes)} GLB mesh nodes are named exactly the part ids, bounds agree with the plan")

    # 4. eyeball table
    heights = c.read_json(c.STAGES / "heights" / "heights.json")
    print("\n  level   area m2   X min..max (m)     Z min..max (m)     floor elev m   floor-to-floor m")
    total = 0.0
    for lv in heights["levels"]:
        f = c.read_json(c.FLOORS / f"{c.level_key(lv['level'])}.json")
        b = f["bounds_m"]
        total += f["area_m2"]
        print(f"  L{lv['level']:02d}    {f['area_m2']:8.1f}   {b['min_x']:6.2f}..{b['max_x']:6.2f}     {b['min_z']:6.2f}..{b['max_z']:6.2f}"
              f"     {lv['floor_elevation_m']:8.2f}       {lv['floor_to_floor_m']:6.2f}")
        if not 1000 < f["area_m2"] < 6000:
            fail(f"L{lv['level']:02d}: area {f['area_m2']} m2 is implausible")
    r = heights["roof"]
    print(f"  roof    base {r['base_elevation_m']:.2f} m, top {r['top_elevation_m']:.2f} m (height {r['height_m']:.2f} m)")
    print(f"  sum of level outlines {total:,.0f} m2, atrium voids included "
          "(sanity: ArchDaily gives E5 + E7 together as about 425,000 sq ft = 39,500 m2)")

    print(f"\n{'CHECK FAILED: ' + str(len(errors)) + ' problem(s)' if errors else 'CHECK PASSED'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
