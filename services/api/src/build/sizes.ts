import type { Twin, TwinShape } from "@cutonce/schemas";
import { standardShape, type Vocab } from "./data.js";
import { heightOf } from "./shape.js";

const SNAP = 0.25, SHARE = 0.15, TRUST_POINTS = 50;
const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * b;
/**
 * "Could this measurement be that standard size?" Within 25% of it, or within one and a half times the twin's own
 * measurement error. The second clause is what a small object needs: 25% of a 6.6 cm can is 1.7 cm, less than depth
 * noise alone puts on its width, so without it a correctly named can seen with 1% noise was never snapped.
 */
export const couldBe = (measured: number, standard: number, t: Twin) => Math.abs(measured - standard) <= Math.max(SNAP * standard, 1.5 * t.error_m);
const reseat = (t: Twin, shape: TwinShape): Twin => {
  const base = t.position[1] - heightOf(t.shape) / 2;
  return { ...t, shape, position: [t.position[0], base + heightOf(shape) / 2, t.position[2]] };
};

/**
 * Known products get their standard size when the measurement could be that size (see couldBe), or when too few
 * points were measured to trust (under 50). Then identical unsized objects within 15% of each other share the median
 * size, so a board resting on "two identical boxes" is level.
 */
export function fixSizes(twins: Twin[], vocab: Vocab): Twin[] {
  const out = twins.map((t) => snap(t, vocab));
  const groups = new Map<string, Twin[]>();
  for (const t of out) if (!t.snapped && t.name !== "unknown" && t.name !== "other" && t.shape.type === "box") groups.set(t.name, [...(groups.get(t.name) ?? []), t]);
  for (const group of groups.values()) if (group.length > 1) share(group, out);
  return out;
}

function snap(t: Twin, vocab: Vocab): Twin {
  const item = vocab.get(t.name);
  const std = item ? standardShape(item) : null;
  if (!std) return t;
  if (std.type === "cylinder") {
    const d = t.shape.type === "cylinder" ? t.shape.diameter : (t.shape.size[0] + t.shape.size[2]) / 2;
    const close = couldBe(d, std.diameter, t) && couldBe(heightOf(t.shape), std.length, t);
    return close || t.points < TRUST_POINTS ? { ...reseat(t, std), snapped: true, error_m: 0.003, yaw_deg: 0 } : t;
  }
  const m = t.shape.type === "box" ? t.shape.size : [t.shape.diameter, heightOf(t.shape), t.shape.diameter];
  const order = [0, 1, 2].sort((i, j) => m[j]! - m[i]!);             // measured axes, largest first
  const close = order.every((axis, k) => couldBe(m[axis]!, std.size[k]!, t));
  if (!close && t.points >= TRUST_POINTS) return t;
  const size: [number, number, number] = [0, 0, 0];
  order.forEach((axis, k) => { size[axis] = std.size[k]!; });        // the largest standard side goes to the largest measured side
  return { ...reseat(t, { type: "box", size }), snapped: true, error_m: 0.003 };
}

function share(group: Twin[], out: Twin[]): void {
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  const sizes = group.map((t) => (t.shape.type === "box" ? t.shape.size : [0, 0, 0]));
  const med: [number, number, number] = [0, 1, 2].map((k) => median(sizes.map((s) => s[k]!))) as [number, number, number];
  if (!sizes.every((s) => s.every((v, k) => within(v, med[k]!, SHARE)))) return;
  for (const t of group) { const i = out.indexOf(t); out[i] = { ...reseat(t, { type: "box", size: med }), error_m: Math.max(...group.map((g) => g.error_m)) / 2 }; }
}
