import type { Twin } from "@cutonce/schemas";
import type { Payload, Vocab } from "./data.js";
import { centroid, circlePoly, clip, hull, margin, rectPoly, type P2 } from "./poly.js";
import { halfOf, volumeOf } from "./shape.js";
import type { Placed } from "./solver.js";

const DENSITY: Record<Twin["material"], number> = { cardboard: 60, metal: 1000, plastic: 900, glass: 1200, wood: 600, paper: 700, fabric: 200, ceramic: 1500, other: 300 };
const cm = (m: number) => (m * 100).toFixed(1);

const footprint = (p: Placed): P2[] => p.shape.type === "cylinder" && p.shape.axis === "y"
  ? circlePoly(p.position[0], p.position[2], p.shape.diameter / 2)
  : rectPoly(p.position[0], p.position[2], halfOf(p.shape)[0], halfOf(p.shape)[2]);

/**
 * Static tipping check. Every part rests flat, so sliding is impossible and the only failure is tipping. For each
 * object, the downward forces on it are its own weight at its centre, plus the load of each thing resting on it,
 * applied where they touch. Their combined point must fall inside what holds it up (its contact patches with its
 * supports, or its own footprint on the table) by at least max(1 cm, the size error), plus 1 cm for every level
 * stacked above it: a person sets each piece down about a centimetre off, and those errors add up, so four cans
 * stacked on end pass a perfect-placement check and fall over on a real table. Deterministic and exact.
 *
 * Balance alone is not enough: a pizza box centred on one can balances on paper and falls when a finger touches its
 * edge. So what holds a piece up must also span at least SUPPORT_SPAN of it, along both of its sides. Three cans in a
 * triangle do, and so does one support as wide as the piece: the rule the ideas model is given, kept here in code.
 */
export const PLACEMENT_ERROR = 0.01;
export const SUPPORT_SPAN = 0.5;

export function checkStability(placed: Placed[], twins: Map<string, Twin>, vocab: Vocab, payload: Payload | null): { ok: true } | { ok: false; reason: string } {
  const byId = new Map(placed.map((p) => [p.twin_id, p]));
  const top = placed.at(-1)!;
  const mass = (p: Placed) => { const t = twins.get(p.twin_id)!; return volumeOf(p.shape) * (vocab.get(t.name)?.density_kg_m3 ?? DENSITY[t.material]); };
  const above = new Map<string, Placed[]>();
  for (const p of placed) for (const s of p.rests_on) above.set(s, [...(above.get(s) ?? []), p]);
  const carried = new Map<string, number>();
  const carriedBy = (p: Placed): number => {
    const hit = carried.get(p.twin_id);
    if (hit !== undefined) return hit;
    let m = mass(p) + (payload && p === top ? payload.kg : 0);
    for (const q of above.get(p.twin_id) ?? []) m += carriedBy(q) / q.rests_on.length;
    carried.set(p.twin_id, m);
    return m;
  };
  const levels = new Map<string, number>();
  const levelsAbove = (p: Placed): number => {
    const hit = levels.get(p.twin_id);
    if (hit !== undefined) return hit;
    const n = Math.max(0, ...(above.get(p.twin_id) ?? []).map((q) => 1 + levelsAbove(q)));
    levels.set(p.twin_id, n);
    return n;
  };
  for (const p of placed) {
    const t = twins.get(p.twin_id)!;
    let m = mass(p) + (payload && p === top ? payload.kg : 0);
    let sx = m * p.position[0], sz = m * p.position[2];
    for (const q of above.get(p.twin_id) ?? []) {
      const patch = clip(footprint(q), footprint(p));
      if (patch.length === 0) continue;
      const share = carriedBy(q) / q.rests_on.length, c = centroid(patch);
      sx += share * c[0]; sz += share * c[1]; m += share;
    }
    const load: P2 = [sx / m, sz / m];
    const region = p.rests_on.length === 0 ? footprint(p) : hull(p.rests_on.flatMap((id) => clip(footprint(p), footprint(byId.get(id)!))));
    const need = Math.max(0.01, t.error_m, ...p.rests_on.map((id) => twins.get(id)!.error_m)) + PLACEMENT_ERROR * levelsAbove(p);
    const got = margin(load, region);
    if (got < need) {
      return { ok: false, reason: got < 0 || !Number.isFinite(got)
        ? `the ${t.label} would tip: its weight lands ${Number.isFinite(got) ? cm(-got) : "well"} cm outside what holds it up`
        : `the ${t.label} is only ${cm(got)} cm from tipping; it needs ${cm(need)} cm` };
    }
    if (p.rests_on.length > 0) {
      const own = footprint(p);
      for (const k of [0, 1] as const) {
        const span = (poly: P2[]) => (poly.length ? Math.max(...poly.map((q) => q[k])) - Math.min(...poly.map((q) => q[k])) : 0);
        if (span(region) < SUPPORT_SPAN * span(own)) {
          return { ok: false, reason: `the ${t.label} overhangs what holds it up: its supports span ${cm(span(region))} cm of its ${cm(span(own))} cm. Use three supports that are not in a line, or one at least half as wide` };
        }
      }
    }
  }
  return { ok: true };
}
