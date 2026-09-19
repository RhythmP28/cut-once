import type { Surface, Twin } from "@cutonce/schemas";
import { halfOf, heightOf } from "./shape.js";

const baseY = (t: Twin) => t.position[1] - heightOf(t.shape) / 2;
const narrowest = (t: Twin) => { const h = halfOf(t.shape); return 2 * Math.min(h[0], h[2]); };
const nextId = (twins: Twin[]) => twins.reduce((m, t) => Math.max(m, Number(t.twin_id.slice(1)) || 0), 0) + 1;

/** Same object: bases within 3 cm in height and centres closer than half its narrowest side (at least 4 cm). */
function same(a: Twin, b: Twin): boolean {
  const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
  return Math.abs(baseY(a) - baseY(b)) <= 0.03 && d <= Math.max(0.04, 0.5 * Math.min(narrowest(a), narrowest(b)));
}

/** Twins across scans: geometry from the better look (more points), the name from the surer label. Unseen twins stay. */
export function mergeTwins(existing: Twin[], incoming: Twin[]): Twin[] {
  const out = existing.map((t) => ({ ...t, scan_ids: [...t.scan_ids] }));
  let next = nextId(out);
  for (const t of incoming) {
    const match = out.find((e) => same(e, t));
    if (!match) { out.push({ ...t, twin_id: `o${next++}` }); continue; }
    const geo = t.points > match.points ? t : match;
    const name = t.confidence > match.confidence ? t : match;
    Object.assign(match, {
      shape: geo.shape, position: geo.position, yaw_deg: geo.yaw_deg, points: geo.points, distance_m: geo.distance_m, sits_on: geo.sits_on,
      error_m: Math.min(t.error_m, match.error_m), bbox_px: t.bbox_px ?? match.bbox_px, snapped: false,
      name: name.name, label: name.label, material: name.material, load_bearing: name.load_bearing, cuttable: name.cuttable, confidence: name.confidence,
      scan_ids: [...new Set([...match.scan_ids, ...t.scan_ids])],
    });
  }
  return out;
}

/** A Director-added object: always new, even where something already stands. */
export const appendTwin = (existing: Twin[], t: Twin): Twin[] => [...existing, { ...t, twin_id: `o${nextId(existing)}` }];

/** Surfaces across scans: same kind within 3 cm of height is the same surface (its extent grows); ids stay stable. */
export function mergeSurfaces(existing: Surface[], incoming: Surface[]): { surfaces: Surface[]; idMap: Map<string, string> } {
  const surfaces = existing.map((s) => ({ ...s, min: [...s.min] as [number, number], max: [...s.max] as [number, number] }));
  const idMap = new Map<string, string>();
  let next = surfaces.reduce((m, s) => Math.max(m, Number(s.surface_id.slice(1)) || 0), 0) + 1;
  for (const s of incoming) {
    const match = surfaces.find((e) => e.kind === s.kind && Math.abs(e.y - s.y) <= 0.03);
    if (!match) { const id = `s${next++}`; surfaces.push({ ...s, surface_id: id }); idMap.set(s.surface_id, id); continue; }
    match.min = [Math.min(match.min[0], s.min[0]), Math.min(match.min[1], s.min[1])];
    match.max = [Math.max(match.max[0], s.max[0]), Math.max(match.max[1], s.max[1])];
    match.points = Math.max(match.points, s.points);
    idMap.set(s.surface_id, match.surface_id);
  }
  return { surfaces, idMap };
}
