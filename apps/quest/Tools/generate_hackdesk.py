#!/usr/bin/env python3
"""
Synthesise an MRUK room scan: a hackathon desk covered in water bottles, mugs and tools.

Why this exists: MRUK's bundled rooms are tidy homes. The thing RoomGlow has to prove is that
LOOSE OBJECTS ON A DESK glow — and they glow purely because the scan captured them as geometry,
with no labels and no object detection. So the bottles here are deliberately NOT labelled as
anchors. If they glow, it's the global mesh doing it, exactly as on a real headset.

Output: Assets/CutOnce/RoomSense/MockRooms/HackDesk.json  (MRUK scene JSON, Unity coordinates)
"""
import json, math, hashlib, os

ROOM_W, ROOM_D, ROOM_H = 5.0, 4.0, 2.7          # x, z, y
HX, HZ = ROOM_W / 2, ROOM_D / 2

verts: list[list[float]] = []
tris: list[int] = []


def quad(a, b, c, d):
    """Two triangles, wound so the face points the way the corner order implies."""
    i = len(verts)
    verts.extend([list(a), list(b), list(c), list(d)])
    tris.extend([i, i + 1, i + 2, i, i + 2, i + 3])


def box(cx, cy, cz, sx, sy, sz):
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z0, z1 = cz - sz / 2, cz + sz / 2
    quad((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1))  # top
    quad((x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0))  # bottom
    quad((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0))  # -z
    quad((x1, y0, z1), (x0, y0, z1), (x0, y1, z1), (x1, y1, z1))  # +z
    quad((x0, y0, z1), (x0, y0, z0), (x0, y1, z0), (x0, y1, z1))  # -x
    quad((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0))  # +x


def cylinder(cx, cy, cz, radius, height, axis="y", seg=14):
    """cy is the BASE for a standing cylinder; the centre for one lying on its side."""
    ring_a, ring_b = [], []
    for k in range(seg):
        t = 2 * math.pi * k / seg
        u, v = radius * math.cos(t), radius * math.sin(t)
        if axis == "y":
            ring_a.append((cx + u, cy, cz + v)); ring_b.append((cx + u, cy + height, cz + v))
        elif axis == "x":
            ring_a.append((cx - height / 2, cy + u, cz + v)); ring_b.append((cx + height / 2, cy + u, cz + v))
        else:
            ring_a.append((cx + u, cy + v, cz - height / 2)); ring_b.append((cx + u, cy + v, cz + height / 2))
    base = len(verts)
    verts.extend([list(p) for p in ring_a] + [list(p) for p in ring_b])
    for k in range(seg):
        n = (k + 1) % seg
        a, b = base + k, base + n
        c, d = base + seg + n, base + seg + k
        tris.extend([a, b, c, a, c, d])
    for ring, flip in ((ring_a, True), (ring_b, False)):        # caps
        c = len(verts)
        verts.append([sum(p[0] for p in ring) / seg, sum(p[1] for p in ring) / seg, sum(p[2] for p in ring) / seg])
        start = base + (0 if flip else seg)
        for k in range(seg):
            n = (k + 1) % seg
            tris.extend([c, start + n, start + k] if flip else [c, start + k, start + n])


# ---------------------------------------------------------------- the room shell
quad((-HX, 0, -HZ), (HX, 0, -HZ), (HX, 0, HZ), (-HX, 0, HZ))                    # floor
quad((-HX, ROOM_H, HZ), (HX, ROOM_H, HZ), (HX, ROOM_H, -HZ), (-HX, ROOM_H, -HZ))  # ceiling
quad((-HX, 0, -HZ), (-HX, ROOM_H, -HZ), (HX, ROOM_H, -HZ), (HX, 0, -HZ))
quad((HX, 0, HZ), (HX, ROOM_H, HZ), (-HX, ROOM_H, HZ), (-HX, 0, HZ))
quad((-HX, 0, HZ), (-HX, ROOM_H, HZ), (-HX, ROOM_H, -HZ), (-HX, 0, -HZ))
quad((HX, 0, -HZ), (HX, ROOM_H, -HZ), (HX, ROOM_H, HZ), (HX, 0, HZ))

# ---------------------------------------------------------------- the desk
DESK_Y, DESK_Z = 0.75, -1.35
box(0, DESK_Y - 0.02, DESK_Z, 1.8, 0.04, 0.8)                     # top
for lx in (-0.85, 0.85):
    for lz in (DESK_Z - 0.35, DESK_Z + 0.35):
        box(lx, DESK_Y / 2, lz, 0.05, DESK_Y, 0.05)               # legs

# ---------------------------------------------------------------- ON the desk (unlabelled!)
BOTTLES = [(-0.72, -1.55), (-0.45, -1.2), (0.12, -1.6), (0.55, -1.25), (0.78, -1.5)]
for bx, bz in BOTTLES:
    cylinder(bx, DESK_Y, bz, 0.035, 0.22)                          # body
    cylinder(bx, DESK_Y + 0.22, bz, 0.015, 0.03)                   # cap
cylinder(-0.15, DESK_Y, -1.45, 0.045, 0.10)                        # mug
cylinder(0.32, DESK_Y, -1.5, 0.042, 0.11)                          # second mug
box(-0.35, DESK_Y + 0.01, -1.3, 0.33, 0.02, 0.23)                  # laptop base
box(-0.35, DESK_Y + 0.12, -1.42, 0.33, 0.21, 0.015)                # laptop screen
box(0.62, DESK_Y + 0.004, -1.05, 0.075, 0.008, 0.15)               # phone
box(0.15, DESK_Y + 0.03, -1.12, 0.26, 0.06, 0.18)                  # parts tray
cylinder(-0.62, DESK_Y, -1.1, 0.05, 0.03)                          # roll of tape
for i, sz in enumerate((-1.02, -1.08, -1.14)):                     # screwdrivers lying down
    cylinder(0.42 + i * 0.01, DESK_Y + 0.01, sz, 0.009, 0.20, axis="x")

# ---------------------------------------------------------------- floor clutter
box(0.0, 0.45, -0.55, 0.45, 0.05, 0.45)                            # chair seat
box(0.0, 0.68, -0.34, 0.45, 0.45, 0.05)                            # chair back
for cx in (-0.18, 0.18):
    for cz in (-0.73, -0.37):
        cylinder(cx, 0, cz, 0.022, 0.45)                           # chair legs
box(-1.8, 0.2, -1.4, 0.35, 0.4, 0.22)                              # backpack
box(1.7, 0.2, -1.5, 0.4, 0.4, 0.4)                                 # cardboard box
cylinder(1.35, 0, -1.1, 0.035, 0.22)                               # bottle on the floor
cylinder(-1.35, 0, -0.9, 0.035, 0.22)                              # another
box(-2.3, 1.35, -0.2, 0.3, 0.9, 1.2)                               # shelf unit against -x wall
for sy in (0.95, 1.35, 1.75):
    for si in range(3):
        cylinder(-2.3, sy, -0.55 + si * 0.35, 0.035, 0.22)          # bottles on the shelf

# ---------------------------------------------------------------- anchors
def uid(name):
    return hashlib.md5(name.encode()).hexdigest().upper()


def plane(name, labels, translation, rotation, hw, hh):
    return {
        "UUID": uid(name),
        "SemanticClassifications": labels,
        "Transform": {"Translation": list(translation), "Rotation": list(rotation), "Scale": [1.0, 1.0, 1.0]},
        "PlaneBounds": {"Min": [-hw, -hh], "Max": [hw, hh]},
        "PlaneBoundary2D": [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]],
    }


def volume(name, labels, translation, rotation, hw, hh, depth):
    a = plane(name, labels, translation, rotation, hw, hh)
    a["VolumeBounds"] = {"Min": [-hw, -hh, -depth], "Max": [hw, hh, 0.0]}
    return a


floor = plane("floor", ["FLOOR"], (0, 0, 0), (270, 0, 0), HX, HZ)
ceiling = plane("ceiling", ["CEILING"], (0, ROOM_H, 0), (90, 0, 0), HX, HZ)
walls = [
    plane("wall-n", ["WALL_FACE"], (0, ROOM_H / 2, -HZ), (0, 0, 0), HX, ROOM_H / 2),
    plane("wall-s", ["WALL_FACE"], (0, ROOM_H / 2, HZ), (0, 180, 0), HX, ROOM_H / 2),
    plane("wall-w", ["WALL_FACE"], (-HX, ROOM_H / 2, 0), (0, 90, 0), HZ, ROOM_H / 2),
    plane("wall-e", ["WALL_FACE"], (HX, ROOM_H / 2, 0), (0, 270, 0), HZ, ROOM_H / 2),
]
furniture = [
    volume("desk", ["TABLE"], (0, DESK_Y, DESK_Z), (270, 0, 0), 0.9, 0.4, DESK_Y),
    volume("chair", ["OTHER"], (0, 0.9, -0.55), (270, 0, 0), 0.23, 0.23, 0.9),
    volume("shelf", ["STORAGE"], (-2.3, 1.8, -0.2), (270, 0, 0), 0.15, 0.6, 1.8),
    volume("box", ["OTHER"], (1.7, 0.4, -1.5), (270, 0, 0), 0.2, 0.2, 0.4),
    volume("backpack", ["OTHER"], (-1.8, 0.4, -1.4), (270, 0, 0), 0.18, 0.11, 0.4),
    plane("screen", ["SCREEN"], (-0.35, DESK_Y + 0.12, -1.43), (0, 0, 0), 0.165, 0.105),
    plane("door", ["DOOR_FRAME"], (HX - 0.01, 1.0, 1.2), (0, 270, 0), 0.45, 1.0),
    plane("window", ["WINDOW_FRAME"], (0, 1.5, HZ - 0.01), (0, 180, 0), 0.8, 0.6),
]
mesh_anchor = {
    "UUID": uid("global"),
    "SemanticClassifications": ["GLOBAL_MESH"],
    "Transform": {"Translation": [0.0, 0.0, 0.0], "Rotation": [0.0, 0.0, 0.0], "Scale": [1.0, 1.0, 1.0]},
    "GlobalMesh": {"Positions": verts, "Indices": tris},
}

scene = {
    "CoordinateSystem": "Unity",
    "Rooms": [{
        "UUID": uid("room"),
        "RoomLayout": {
            "FloorUuid": floor["UUID"],
            "CeilingUuid": ceiling["UUID"],
            "WallsUuid": [w["UUID"] for w in walls],
        },
        "Anchors": [floor, ceiling] + walls + furniture + [mesh_anchor],
    }],
}

out = os.path.join(os.path.dirname(__file__), "..", "Assets", "CutOnce", "RoomSense", "MockRooms", "HackDesk.json")
out = os.path.normpath(out)
with open(out, "w") as f:
    json.dump(scene, f)
print(f"wrote {out}")
print(f"  {len(verts)} verts, {len(tris)//3} tris, {len(scene['Rooms'][0]['Anchors'])} anchors")
print(f"  {len(BOTTLES)} bottles on the desk + 9 on the shelf + 2 on the floor, none of them labelled")
