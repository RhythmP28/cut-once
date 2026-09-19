import { aabbOverlapDepth, type Aabb } from "@cutonce/project-model";
import type { IdeaDraft, Orientation, Twin, TwinShape, Vec3 } from "@cutonce/schemas";
import { halfOf } from "./shape.js";

/** An object's pose in the design frame: table top at y = 0, x to the viewer's right, z toward the viewer. */
export interface Placed { twin_id: string; label: string; orientation: Orientation; shape: TwinShape; position: Vec3; rests_on: string[] }
export type Solved = { ok: true; placed: Placed[] } | { ok: false; reason: string };

/** validate.ts's TOUCH_TOLERANCE: tops further apart than this fail V4 ("floats"). */
const TOUCH = 0.002;
const mm = (m: number) => Math.round(m * 1000);

/**
 * The shape as it rests. Orientation is expressed by the order of a box's sides and a cylinder's axis — never by a
 * rotation, which validate.ts cannot see.
 */
export function oriented(t: Twin, o: Orientation): TwinShape | string {
  if (t.shape.type === "cylinder") {
    return o === "upright" ? { type: "cylinder", axis: "y", diameter: t.shape.diameter, length: t.shape.length } : `the ${t.label} would roll on its side; stand it upright`;
  }
  const [d0, d1, d2] = [...t.shape.size].sort((a, b) => b - a) as [number, number, number];
  if (o === "flat") return { type: "box", size: [d0, d2, d1] };
  if (o === "upright") return { type: "box", size: [d1, d0, d2] };
  return { type: "box", size: [d0, d1, d2] };
}

export const aabbOfPlaced = (p: Placed): Aabb => {
  const h = halfOf(p.shape);
  return { min: [p.position[0] - h[0], p.position[1] - h[1], p.position[2] - h[2]], max: [p.position[0] + h[0], p.position[1] + h[1], p.position[2] + h[2]] };
};

function beside(other: Placed, half: Vec3, side: "left" | "right" | "front" | "back", gap: number): [number, number] {
  const o = halfOf(other.shape), [x, , z] = other.position;
  if (side === "right") return [x + o[0] + gap + half[0], z];
  if (side === "left") return [x - o[0] - gap - half[0], z];
  if (side === "front") return [x, z + o[2] + gap + half[2]];
  return [x, z - o[2] - gap - half[2]];
}

/** Turns placement steps into exact poses. Every refusal says why, in words the AI's repair round can act on. */
export function solve(draft: IdeaDraft, twins: Map<string, Twin>): Solved {
  const placed = new Map<string, Placed>();
  const order: Placed[] = [];
  let lastOnTable: Placed | null = null;
  const fail = (reason: string): Solved => ({ ok: false, reason });
  for (const [i, s] of draft.steps.entries()) {
    const t = twins.get(s.place);
    if (!t) return fail(`step ${i + 1} places ${s.place}, which is not in the inventory`);
    if (placed.has(t.twin_id)) return fail(`the ${t.label} is placed twice`);
    const shape = oriented(t, s.orientation);
    if (typeof shape === "string") return fail(shape);
    const half = halfOf(shape);
    let x: number, z: number, bottom: number;
    if (s.on.length > 0) {
      const supports: Placed[] = [];
      for (const id of s.on) {
        const p = placed.get(id);
        if (!p) return fail(`the ${t.label} rests on ${id}, which is not placed before it`);
        if (!twins.get(id)!.load_bearing) return fail(`the ${twins.get(id)!.label} cannot hold anything up`);
        supports.push(p);
      }
      const tops = supports.map((p) => p.position[1] + halfOf(p.shape)[1]);
      const hi = Math.max(...tops), lo = Math.min(...tops);
      if (hi - lo > TOUCH) return fail(`the tops of the ${supports.map((p) => p.label).join(" and the ")} differ by ${mm(hi - lo)} mm, so the ${t.label} would rock; use supports of the same height`);
      bottom = hi;
      [x, z] = s.at_cm ? [s.at_cm.x / 100, s.at_cm.z / 100]
        : [supports.reduce((a, p) => a + p.position[0], 0) / supports.length, supports.reduce((a, p) => a + p.position[2], 0) / supports.length];
    } else {
      bottom = 0;
      if (s.at_cm) [x, z] = [s.at_cm.x / 100, s.at_cm.z / 100];
      else if (s.next_to) {
        const other = placed.get(s.next_to);
        if (!other) return fail(`the ${t.label} goes next to ${s.next_to}, which is not placed before it`);
        [x, z] = beside(other, half, s.side ?? "right", (s.gap_cm ?? 2) / 100);
      } else if (lastOnTable) [x, z] = beside(lastOnTable, half, "right", 0.05);
      else [x, z] = [0, 0];
    }
    const p: Placed = { twin_id: t.twin_id, label: t.label, orientation: s.orientation, shape, position: [x, bottom + half[1], z], rests_on: [...s.on] };
    for (const q of order) if (aabbOverlapDepth(aabbOfPlaced(p), aabbOfPlaced(q)) > 0.001) return fail(`the ${t.label} would overlap the ${q.label}`);
    placed.set(t.twin_id, p); order.push(p);
    if (s.on.length === 0) lastOnTable = p;
  }
  return { ok: true, placed: order };
}
