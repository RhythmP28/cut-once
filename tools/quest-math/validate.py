"""Numeric check of the headset maths in apps/quest (AlignmentSolver, zalo Kabsch refine, PartProjector),
using Unity's quaternion formulas. Runs without Unity. Usage: python3 tools/quest-math/validate.py (needs numpy)."""
# Numeric check of the C# device maths, using Unity's own quaternion formulas (x, y, z, w; Hamilton product).
import numpy as np
def aa(deg, axis):
    a = np.asarray(axis, float); a /= np.linalg.norm(a); h = np.radians(deg) / 2
    return np.array([*(a * np.sin(h)), np.cos(h)])
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2])
def rot(q, v):
    u, w = q[:3], q[3]; v = np.asarray(v, float)
    return 2*np.dot(u, v)*u + (w*w - np.dot(u, u))*v + 2*w*np.cross(u, v)
def qmat(q): return np.column_stack([rot(q, e) for e in np.eye(3)])
up = [0, 1, 0]

# Unity's convention: AngleAxis(90, up) * forward == right
assert np.allclose(rot(aa(90, up), [0, 0, 1]), [1, 0, 0])

def solve_two_point(a1, a2, w1, w2):
    da, dw = np.subtract(a2, a1), np.subtract(w2, w1)
    yaw = np.degrees(np.arctan2(dw[0], dw[2]) - np.arctan2(da[0], da[2]))
    r = aa(yaw, up); t = 0.5 * ((w1 - rot(r, a1)) + (w2 - rot(r, a2)))
    return t, r, abs(np.linalg.norm(dw) - np.linalg.norm(da)), abs((w1[1] - a1[1]) - (w2[1] - a2[1]))
apply = lambda t, r, a: t + rot(r, a)

class KabschSolver:  # faithful port of zalo/MathUtilities Kabsch.cs (Unlicense)
    def __init__(self): self.q = np.array([0, 0, 0, 1.0])
    def solve(self, inp, ref):
        ic, rc = inp.mean(0), ref.mean(0)
        A = [np.zeros(3) for _ in range(3)]
        for p, r in zip(inp, ref):
            l, rr = p - ic, r - rc
            for i in range(3):
                for j in range(3): A[i][j] += l[i] * rr[j]
        for _ in range(9):
            B = [rot(self.q, e) for e in np.eye(3)]
            om = sum(np.cross(B[i], A[i]) for i in range(3)) / abs(sum(np.dot(B[i], A[i]) for i in range(3)) + 1e-9)
            w = np.linalg.norm(om)
            if w < 1e-9: break
            self.q = qmul(aa(np.degrees(w), om / w), self.q); self.q /= np.linalg.norm(self.q)
        return rc, self.q, ic   # delta(p) = rc + R (p - ic)

def refine(t0, r0, model, world, calls):
    solver, moved = KabschSolver(), np.array([apply(t0, r0, a) for a in model])
    for _ in range(calls): rc, q, ic = solver.solve(moved, np.array(world))
    return rc + rot(q, t0 - ic), qmul(q, r0)

A1, A2, A3 = np.array([-0.2, 0, 0.53]), np.array([-0.8, 0, 0.53]), np.array([-0.19, 0, 0.08])
T = np.array([1.2, 0.74, -2.0])
truth = aa(37, up)
t, r, base, lvl = solve_two_point(A1, A2, apply(T, truth, A1), apply(T, truth, A2))
e3 = np.linalg.norm(apply(t, r, A3) - apply(T, truth, A3))
print(f"two-point: m3 error {e3*1000:.4f} mm, baseline {base:.2e}, level {lvl:.2e}   (plan: < 0.5 mm)")

for tilt in (2, 5):
    tq = qmul(aa(37, up), aa(tilt, [1, 0, 0]))
    W = [apply(T, tq, a) for a in (A1, A2, A3)]
    t, r, _, _ = solve_two_point(A1, A2, W[0], W[1])
    print(f"tilt {tilt} deg: m3 residual after two-point {np.linalg.norm(apply(t, r, A3) - W[2])*1000:.1f} mm   (plan: > 4 mm triggers the fallback)")
    for calls in (1, 2, 5):
        tr, rr = refine(t, r, [A1, A2, A3], W, calls)
        print(f"   refine with {calls} call(s): worst error {max(np.linalg.norm(apply(tr, rr, a) - w) for a, w in zip((A1, A2, A3), W))*1000:.3f} mm")

# Cold start (refine from identity, no two-point pose first) only converges for small headings; the refine needs the pre-alignment.
for yaw in (37, 90, 135, 180):
    tq = qmul(aa(yaw, up), aa(5, [1, 0, 0])); W = [apply(T, tq, a) for a in (A1, A2, A3)]
    worst = lambda tr, rr: max(np.linalg.norm(apply(tr, rr, a) - w) for a, w in zip((A1, A2, A3), W)) * 1000
    cold = [worst(*refine(np.zeros(3), np.array([0, 0, 0, 1.0]), [A1, A2, A3], W, n)) for n in (1, 20)]
    t, r, _, _ = solve_two_point(A1, A2, W[0], W[1])
    print(f"heading {yaw:3d} deg, 5 deg tilt: cold start 1 call {cold[0]:6.1f} mm, 20 calls {cold[1]:6.1f} mm"
          f" | two-point then 5 calls {worst(*refine(t, r, [A1, A2, A3], W, 5)):.3f} mm")

# Stickers m1 and m2 swapped: no rigid pose fits, so the refine must not be trusted without its residual.
W = [apply(T, truth, a) for a in (A2, A1, A3)]
t, r, base, _ = solve_two_point(A1, A2, W[0], W[1])
tr, rr = refine(t, r, [A1, A2, A3], W, 5)
worst = max(np.linalg.norm(apply(tr, rr, a) - w) for a, w in zip((A1, A2, A3), W))
print(f"m1/m2 swapped: baseline {base*1000:.2f} mm (blind to it), m3 after two-point {np.linalg.norm(apply(t, r, A3) - W[2])*1000:.0f} mm, "
      f"worst after refine {worst*1000:.0f} mm   (plan: > 4 mm, so the pose is rejected)")

# PartProjector: corners behind the near plane are clipped away along the box's 12 edges, not allowed to drop the part.
NEAR = 0.1
ortho = lambda p: (p[0] + 0.5, p[1] + 0.5)                          # stand-in camera used by the C# tests
persp = lambda p: (0.5 + 0.5 * p[0] / p[2], 0.5 + 0.5 * p[1] / p[2])  # 90° pinhole looking down +z
def project(center, size, vp=ortho, W=1280, H=960):
    c, e = np.array(center, float), np.array(size, float) / 2
    corners = [c + e * np.array([1 if i & 1 else -1, 1 if i & 2 else -1, 1 if i & 4 else -1]) for i in range(8)]
    d = [p[2] - NEAR for p in corners]  # depth along the camera's forward, minus the near plane
    pts = [corners[i] for i in range(8) if d[i] >= 0]
    pts += [corners[i] + (corners[j] - corners[i]) * d[i] / (d[i] - d[j])
            for i in range(8) for bit in (1, 2, 4) if (j := i ^ bit) > i and (d[i] >= 0) != (d[j] >= 0)]
    if not any(x >= 0 for x in d): return None
    v = np.array([vp(p) for p in pts]); mn, mx = v.min(0), v.max(0)
    full = np.prod(mx - mn); cmn, cmx = np.maximum(mn, 0), np.minimum(mx, 1)
    if (cmx <= cmn).any() or full <= 0: return None
    return (cmn[0]*W, (1 - cmx[1])*H, (cmx[0]-cmn[0])*W, (cmx[1]-cmn[1])*H), np.prod(cmx - cmn) / full
b, f = project([0, 0, 1], [0.2]*3); print("projector centred:", tuple(round(v, 1) for v in b), "inFrame", round(f, 3), " (plan: 512, 384, 256, 192, 1.0)")
print("projector flip: top y", round(project([0, .3, 1], [.1]*3)[0][1]), "< bottom y", round(project([0, -.3, 1], [.1]*3)[0][1]))
print("projector behind camera:", project([0, 0, -1], [.1]*3), "| half off-screen inFrame:", round(project([.5, 0, 1], [.2]*3)[1], 3))
# Tabletop 0.5 m below the eyes, running from 0.2 m behind the camera to 0.8 m ahead: most of it fills the bottom of the photo.
b, f = project([0, -0.475, 0.3], [1.0, 0.05, 1.0], persp)
print("projector tabletop partly behind camera:", tuple(round(v, 1) for v in b), "inFrame", round(f, 3), " (plan: kept, full width, bottom edge 960)")
