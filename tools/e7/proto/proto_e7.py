"""Prototype: 8-storey building from a 2D footprint with atrium void, curtain wall
(mullions + transoms + glass), punched-window walls, stair, sawtooth roof. One named
node per element; GLB export. Measures time / tris / nodes / file size."""
import time, os
import numpy as np
import trimesh
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union

t0 = time.perf_counter()
FOOT = Polygon([(0, 0), (60, 0), (60, 25), (35, 25), (35, 40), (0, 40)])  # stand-in footprint
ATRIUM = box(20, 12, 30, 22)                                               # void through floors 2-8
HEIGHTS = [5.0, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2, 4.2]
SLAB_T, MULL_W, MULL_D, MOD = 0.3, 0.07, 0.15, 1.5
scene = trimesh.Scene()
names = []

def add(mesh, name):
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    names.append(name)

def bar(p0, p1, w, d, z0, z1):
    """Vertical/horizontal box between two 2D points, from z0 to z1."""
    p0, p1 = np.array(p0), np.array(p1)
    L = np.linalg.norm(p1 - p0)
    b = trimesh.creation.box(extents=(L, d, z1 - z0))
    ang = np.arctan2(*(p1 - p0)[::-1])
    T = trimesh.transformations.rotation_matrix(ang, [0, 0, 1])
    T[:3, 3] = [*(p0 + p1) / 2, (z0 + z1) / 2]
    b.apply_transform(T)
    return b

z = 0.0
for lvl, h in enumerate(HEIGHTS, start=1):
    plate = FOOT if lvl == 1 else FOOT.difference(ATRIUM)          # atrium = polygon hole, no boolean
    slab = trimesh.creation.extrude_polygon(plate, SLAB_T)
    slab.apply_translation([0, 0, z])
    add(slab, f"L{lvl}_slab")
    ring = LineString(FOOT.exterior.coords)
    top = z + h
    # curtain wall on the whole perimeter: mullions every MOD, transoms at sill+head, glass per bay
    mulls, trans, glass = [], [], []
    for i in range(len(ring.coords) - 1):
        a, b = np.array(ring.coords[i]), np.array(ring.coords[i + 1])
        L = np.linalg.norm(b - a); n = max(1, int(round(L / MOD)))
        for k in range(n + 1):
            p = a + (b - a) * k / n
            d = (b - a) / L * MULL_W / 2
            mulls.append(bar(p - d, p + d, MULL_W, MULL_D, z + SLAB_T, top))
        for zz in (z + SLAB_T + 0.9, top - 0.05):
            trans.append(bar(a, b, MULL_W, MULL_D, zz - MULL_W / 2, zz + MULL_W / 2))
        glass.append(bar(a, b, 1, 0.02, z + SLAB_T, top))
    add(trimesh.util.concatenate(mulls + trans), f"L{lvl}_curtainwall_frame")
    add(trimesh.util.concatenate(glass), f"L{lvl}_curtainwall_glass")
    # one punched-window core wall to exercise booleans
    core = bar((40, 5), (55, 5), 1, 0.3, z + SLAB_T, top)
    cut = [bar((41 + 1.5 * k, 5), (42.2 + 1.5 * k, 5), 1, 1.0, z + 1.2, z + 3.0) for k in range(9)]
    add(trimesh.boolean.difference([core] + cut, engine="manifold", check_volume=False), f"L{lvl}_wall_core_s")
    # straight-run stair: 18 risers
    risers = int(round(h / 0.175)); rh = h / risers
    steps = [bar((5, 35 - 0.28 * s), (6.2, 35 - 0.28 * s), 1, 0.28, z + s * rh, z + (s + 1) * rh) for s in range(risers)]
    add(trimesh.util.concatenate(steps), f"L{lvl}_stair_1")
    z = top

# sawtooth roof: extrude a 2D section profile, then rotate into place along the 60 m length
teeth = []
span, rise = 6.0, 2.5
for k in range(int(60 // span)):
    x0 = k * span
    prof = Polygon([(x0, 0), (x0 + span, 0), (x0 + span, rise), (x0, 0.3)])   # vertical glazed face at x0+span
    m = trimesh.creation.extrude_polygon(prof, 25.0)                          # extrude along +Z
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m.apply_translation([0, 25.0, z])
    teeth.append(m)
add(trimesh.util.concatenate(teeth), "ROOF_sawtooth")

t_build = time.perf_counter() - t0
scene.export("proto_e7.glb")
t_all = time.perf_counter() - t0
tris = sum(len(g.faces) for g in scene.geometry.values())
import pygltflib
g = pygltflib.GLTF2().load("proto_e7.glb")
print(f"build {t_build:.2f}s, build+export {t_all:.2f}s; {len(names)} named nodes; {tris:,} tris; "
      f"{os.path.getsize('proto_e7.glb')/1e6:.1f} MB; first GLB node names: {[n.name for n in g.nodes][:5]}")
