import type { Part, Vec3 } from "@cutonce/schemas";

export interface Aabb { min: Vec3; max: Vec3 }

/** Axis-aligned bounds of a part in model space. Returns null for a mesh without declared bounds. */
export function partAabb(part: Part): Aabb | null {
  const [px, py, pz] = part.position;
  const s = part.shape;
  if (s.type === "box") {
    const [sx, sy, sz] = s.size;
    return { min: [px - sx / 2, py - sy / 2, pz - sz / 2], max: [px + sx / 2, py + sy / 2, pz + sz / 2] };
  }
  if (s.type === "cylinder") {
    const r = s.diameter / 2, h = s.length / 2;
    const half: Vec3 = [s.axis === "x" ? h : r, s.axis === "y" ? h : r, s.axis === "z" ? h : r];
    return { min: [px - half[0], py - half[1], pz - half[2]], max: [px + half[0], py + half[1], pz + half[2]] };
  }
  if (s.type === "polyline") {
    const r = s.diameter / 2;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of s.points) for (let i = 0; i < 3; i++) {
      const v = p[i]! + part.position[i]!;
      min[i] = Math.min(min[i]!, v - r); max[i] = Math.max(max[i]!, v + r);
    }
    return { min, max };
  }
  return s.bounds ? { min: s.bounds.min, max: s.bounds.max } : null;
}

/** Largest per-axis gap between two boxes; 0 when they touch or overlap. */
export function aabbGap(a: Aabb, b: Aabb): number {
  let gap = 0;
  for (let i = 0; i < 3; i++) gap = Math.max(gap, a.min[i]! - b.max[i]!, b.min[i]! - a.max[i]!);
  return Math.max(0, gap);
}

/** Smallest per-axis overlap depth; > 0 only when the boxes interpenetrate on all three axes. */
export function aabbOverlapDepth(a: Aabb, b: Aabb): number {
  let depth = Infinity;
  for (let i = 0; i < 3; i++) depth = Math.min(depth, Math.min(a.max[i]!, b.max[i]!) - Math.max(a.min[i]!, b.min[i]!));
  return Math.max(0, depth);
}

export function union(boxes: Aabb[]): Aabb | null {
  if (boxes.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, b.min[i]!); max[i] = Math.max(max[i]!, b.max[i]!); }
  return { min, max };
}

export function volume(part: Part): number {
  const b = partAabb(part);
  return b ? (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]) : 0;
}

export const isSolid = (part: Part) => part.shape.type === "box" || part.shape.type === "cylinder";
