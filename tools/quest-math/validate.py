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
    tr, rr = refine(np.zeros(3), np.array([0, 0, 0, 1.0]), [A1, A2, A3], W, 1)
    print(f"   cold start (no two-point first), 1 call: worst error {max(np.linalg.norm(apply(tr, rr, a) - w) for a, w in zip((A1, A2, A3), W))*1000:.1f} mm")

# PartProjector: stand-in viewport = world x/y + 0.5; JPEG flip
def project(center, size, W=1280, H=960):
    c, e = np.array(center), np.array(size) / 2
    corners = [c + e * np.array([sx, sy, sz]) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    if any(p[2] <= 0.1 for p in corners): return None
    vp = np.array([[p[0] + 0.5, p[1] + 0.5] for p in corners]); mn, mx = vp.min(0), vp.max(0)
    full = np.prod(mx - mn); cmn, cmx = np.maximum(mn, 0), np.minimum(mx, 1)
    if (cmx <= cmn).any(): return None
    return (cmn[0]*W, (1 - cmx[1])*H, (cmx[0]-cmn[0])*W, (cmx[1]-cmn[1])*H), np.prod(cmx - cmn) / full
b, f = project([0, 0, 1], [0.2]*3); print("projector centred:", tuple(round(v, 1) for v in b), "inFrame", round(f, 3), " (plan: 512, 384, 256, 192, 1.0)")
print("projector flip: top y", round(project([0, .3, 1], [.1]*3)[0][1]), "< bottom y", round(project([0, -.3, 1], [.1]*3)[0][1]))
print("projector behind camera:", project([0, 0, -1], [.1]*3), "| half off-screen inFrame:", round(project([.5, 0, 1], [.2]*3)[1], 3))
