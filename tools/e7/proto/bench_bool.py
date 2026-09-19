"""Benchmark: cut N window openings in wall slabs with trimesh + manifold3d."""
import time
import numpy as np
import trimesh
from manifold3d import Manifold

def wall(length, thick, height, origin=(0, 0, 0)):
    b = trimesh.creation.box(extents=(length, thick, height))
    b.apply_translation(np.array(origin) + [length / 2, thick / 2, height / 2])
    return b

def cutters(length, height, floors, spacing=1.5, w=1.2, h=1.8, sill=0.9, thick=0.3):
    out = []
    for f in range(floors):
        z0 = f * height
        x = spacing / 2
        while x + w / 2 < length:
            c = trimesh.creation.box(extents=(w, thick * 3, h))
            c.apply_translation([x, thick / 2, z0 + sill + h / 2])
            out.append(c)
            x += spacing
    return out

for (L, floors, H) in [(30, 1, 4.0), (100, 1, 4.0), (100, 8, 4.0)]:
    w = wall(L, 0.3, H * floors)
    cs = cutters(L, H, floors)
    t = time.perf_counter()
    r = trimesh.boolean.difference([w] + cs, engine="manifold", check_volume=False)
    dt = time.perf_counter() - t
    print(f"one-shot trimesh.difference: wall {L}m x {floors} floors, {len(cs)} windows -> {dt*1000:.1f} ms, {len(r.faces)} tris, watertight={r.is_watertight}")

# Native manifold3d batch API
L, floors, H = 100, 8, 4.0
w = wall(L, 0.3, H * floors)
cs = cutters(L, H, floors)
def to_m(m):
    from manifold3d import Mesh
    return Manifold(Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
t = time.perf_counter()
mw = to_m(w)
cut = Manifold.batch_boolean([to_m(c) for c in cs], __import__('manifold3d').OpType.Add)
res = mw - cut
mesh = res.to_mesh()
print(f"native batch_boolean: {len(cs)} windows -> {(time.perf_counter()-t)*1000:.1f} ms, {len(mesh.tri_verts)} tris")

# Sequential (the naive pitfall)
t = time.perf_counter()
cur = to_m(w)
for c in cs:
    cur = cur - to_m(c)
cur.to_mesh()
print(f"sequential loop of {len(cs)} subtractions -> {(time.perf_counter()-t)*1000:.1f} ms")

# float32 precision pitfall: UTM-like coordinates
off = np.array([538000.0, 4812000.0, 0.0])
w2 = wall(30, 0.3, 4.0, origin=off)
cs2 = [c.copy() for c in cutters(30, 4.0, 1)]
for c in cs2:
    c.apply_translation(off)
r2 = trimesh.boolean.difference([w2] + cs2, engine="manifold", check_volume=False)
err = np.abs(r2.bounds[0] - w2.bounds[0]).max()
print(f"UTM-offset test: bounds error after float32 round-trip = {err:.4f} m")
