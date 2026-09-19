/** 2D convex polygons in the x/z plane, counter-clockwise. */
export type P2 = [number, number];

export const rectPoly = (cx: number, cz: number, hx: number, hz: number): P2[] =>
  [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];

export const circlePoly = (cx: number, cz: number, r: number, n = 16): P2[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cz + r * Math.sin((2 * Math.PI * i) / n)] as P2);

const side = (a: P2, b: P2, p: P2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Sutherland–Hodgman: the part of a convex polygon inside another convex polygon. */
export function clip(subject: P2[], clipper: P2[]): P2[] {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length > 0; i++) {
    const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!;
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!, q = input[(j + 1) % input.length]!;
      const pIn = side(a, b, p) >= 0, qIn = side(a, b, q) >= 0;
      if (pIn) out.push(p);
      if (pIn !== qIn) {
        const d1: P2 = [q[0] - p[0], q[1] - p[1]], d2: P2 = [b[0] - a[0], b[1] - a[1]];
        const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / (d1[0] * d2[1] - d1[1] * d2[0]);
        out.push([p[0] + t * d1[0], p[1] + t * d1[1]]);
      }
    }
  }
  return out;
}

/** Monotone-chain convex hull, counter-clockwise. */
export function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const build = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) { while (h.length >= 2 && side(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop(); h.push(p); }
    return h;
  };
  const lower = build(pts), upper = build([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** How far inside a counter-clockwise convex polygon a point is (negative: outside). A point or a line has no inside. */
export function margin(p: P2, poly: P2[]): number {
  if (poly.length < 3) return -Infinity;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) m = Math.min(m, side(a, b, p) / len);
  }
  return m;
}
