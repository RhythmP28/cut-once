"""Stage 5: extrude every footprint into a solid and export data/e7/out/e7.glb, one node per part.

The node name is EXACTLY the part_id. All coordinates are baked into the vertices (node transforms stay
identity) because every part in the plan has position [0, 0, 0].

Axes. trimesh.creation.extrude_polygon extrudes a 2D polygon (a, b) along +Z, giving vertices (a, b, h).
Our polygon is (a, b) = (model x, model z), so the model vertex is (a, h, b): a swap of the last two axes.
A swap is a reflection, which would turn the triangles inside out, so the winding is flipped back afterwards.
Positions are therefore exactly x = image x, z = image y, y = height: nothing is mirrored. This is checked
below by matching every mesh corner against the traced polygon, which is not symmetric.
"""
from __future__ import annotations

import sys

import numpy as np
import trimesh

import common as c

SWAP_YZ = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
COLOURS = {"slab": [0.62, 0.62, 0.60, 1.0], "envelope": [0.55, 0.75, 0.88, 1.0], "roof": [0.85, 0.85, 0.83, 1.0]}


def build(spec: dict) -> trimesh.Trimesh:
    poly = c.load_floor_polygon(spec["level"])
    height = spec["y1"] - spec["y0"]
    mesh = trimesh.creation.extrude_polygon(poly, height)        # (x, z, h), h in 0..height
    mesh.apply_transform(SWAP_YZ)                                # -> (x, h, z)
    if mesh.volume < 0:                                          # the reflection turned it inside out
        mesh.invert()
    mesh.apply_translation([0, spec["y0"], 0])

    # --- checks: watertight, outward-facing, right size, and NOT mirrored ---
    want_volume = poly.area * height
    assert mesh.is_watertight, f"{spec['part_id']}: mesh is not watertight"
    assert abs(mesh.volume - want_volume) < 1e-6 * max(1.0, want_volume), f"{spec['part_id']}: volume {mesh.volume} != {want_volume}"
    corners_mesh = {(round(x, 3), round(z, 3)) for x, _, z in mesh.vertices}
    corners_poly = {(round(x, 3), round(z, 3)) for x, z in poly.exterior.coords}
    assert corners_mesh == corners_poly, f"{spec['part_id']}: mesh corners do not match the traced polygon (mirrored?)"
    assert np.allclose([mesh.bounds[0][1], mesh.bounds[1][1]], [spec["y0"], spec["y1"]], atol=1e-6)
    # top faces must point up (+Y): a second guard against an inside-out or upside-down solid
    top = mesh.face_normals[np.isclose(mesh.triangles_center[:, 1], spec["y1"], atol=1e-6)]
    assert len(top) and np.all(top[:, 1] > 0.99), f"{spec['part_id']}: top faces do not point +Y"

    mesh.unmerge_vertices()                                      # flat shading: hard edges on a box-like solid
    # after unmerging, face i owns vertices 3i..3i+2, so each vertex simply takes its face's normal
    mesh.vertex_normals = np.repeat(mesh.face_normals, 3, axis=0)
    mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        name=f"e7_{spec['role']}", baseColorFactor=COLOURS[spec["role"]], metallicFactor=0.0, roughnessFactor=0.8))
    return mesh


def preview(meshes: dict[str, trimesh.Trimesh], specs: list[dict]) -> None:
    """A geometry-only picture of the stacked model (no drawing pixels, so it may be committed)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    fig = plt.figure(figsize=(10, 8), dpi=120)
    ax = fig.add_subplot(projection="3d")
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for s in specs:
        m = meshes[s["part_id"]]
        tri = m.triangles[:, :, [0, 2, 1]].copy()                # matplotlib is Z-up: plot (x, z, y)
        tri[:, :, 1] *= -1                                       # and keep it right-handed: plot (x, -z, y)
        ax.add_collection3d(Poly3DCollection(tri, facecolor=COLOURS[s["role"]][:3], edgecolor="none", alpha=1.0))
        lo, hi = np.minimum(lo, tri.reshape(-1, 3).min(0)), np.maximum(hi, tri.reshape(-1, 3).max(0))
    ax.set_xlim(lo[0], hi[0]); ax.set_ylim(lo[1], hi[1]); ax.set_zlim(lo[2], hi[2])
    ax.set_box_aspect(hi - lo)
    ax.view_init(elev=24, azim=-38)
    ax.set_xlabel("+X (m)"); ax.set_ylabel("-Z (m)"); ax.set_zlabel("+Y (m)")
    ax.set_title("E7 massing model (extruded hand-traced footprints)")
    out = c.STAGES / "mesh" / "massing.geom.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.relative_to(c.REPO)}")


def main() -> int:
    c.ensure_dirs()
    plan = c.read_json(c.OUT / "e7.plan.json")
    specs = c.part_specs()
    assert [s["part_id"] for s in specs] == [p["part_id"] for p in plan["parts"]], "plan is stale: run 04_plan.py first"

    scene, meshes = trimesh.Scene(), {}
    for s in specs:
        mesh = build(s)
        meshes[s["part_id"]] = mesh
        scene.add_geometry(mesh, node_name=s["part_id"], geom_name=s["part_id"])
        print(f"  {s['part_id']:<24} y {s['y0']:6.2f}..{s['y1']:6.2f}  {len(mesh.faces):3d} triangles")

    out = c.OUT / "e7.glb"
    out.write_bytes(scene.export(file_type="glb", include_normals=True))
    print(f"  wrote {out.relative_to(c.REPO)} ({out.stat().st_size / 1024:.0f} KiB)")
    preview(meshes, specs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
