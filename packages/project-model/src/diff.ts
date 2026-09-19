import type { Part, Plan } from "@cutonce/schemas";
import { partAabb } from "./geometry.js";

/**
 * What changed between two plans, part by part, in millimetres. Parts are matched by id, then by name
 * (case-insensitive), so a plan the AI read from a drawing, with its own ids, still lines up with the
 * known-good plan. Used by the push report and to score drawing extraction.
 */
export interface PartChange {
  part_id: string; name: string; change: "added" | "removed" | "changed";
  moved_mm: number | null; resized_mm: number | null; fields: string[];
}
export interface PlanDiff {
  from: { plan_id: string; revision: number }; to: { plan_id: string; revision: number };
  changes: PartChange[]; unchanged: number;
}

const ID_FIELDS = ["kind", "layer", "material_id", "step_id", "rests_on", "attaches_to"] as const;
const NAME_FIELDS = ["kind", "layer"] as const; // ids differ, so id-valued fields can't be compared

const round = (mm: number) => Math.round(mm * 10) / 10;

function geometry(p: Part): { c: number[]; s: number[] } | null {
  const b = partAabb(p);
  if (!b) return null;
  return { c: [0, 1, 2].map((i) => (b.min[i]! + b.max[i]!) / 2), s: [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) };
}

export function diffPlans(from: Plan, to: Plan, toleranceMm = 0.5): PlanDiff {
  const byId = new Map(from.parts.map((p) => [p.part_id, p]));
  const byName = new Map(from.parts.map((p) => [p.name.toLowerCase(), p]));
  const matched = new Set<string>();
  const changes: PartChange[] = [];
  let unchanged = 0;

  for (const b of to.parts) {
    const a = byId.get(b.part_id) ?? byName.get(b.name.toLowerCase());
    if (!a || matched.has(a.part_id)) {
      changes.push({ part_id: b.part_id, name: b.name, change: "added", moved_mm: null, resized_mm: null, fields: [] });
      continue;
    }
    matched.add(a.part_id);
    const ga = geometry(a), gb = geometry(b);
    const moved = ga && gb ? round(Math.hypot(...[0, 1, 2].map((i) => gb.c[i]! - ga.c[i]!)) * 1000) : null;
    const resized = ga && gb ? round(Math.max(...[0, 1, 2].map((i) => Math.abs(gb.s[i]! - ga.s[i]!))) * 1000) : null;
    const compared = a.part_id === b.part_id ? ID_FIELDS : NAME_FIELDS;
    const fields = compared.filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null));
    if (fields.length > 0 || (moved ?? 0) > toleranceMm || (resized ?? 0) > toleranceMm) {
      changes.push({ part_id: b.part_id, name: b.name, change: "changed", moved_mm: moved, resized_mm: resized, fields: [...fields] });
    } else {
      unchanged += 1;
    }
  }
  for (const a of from.parts) {
    if (!matched.has(a.part_id)) changes.push({ part_id: a.part_id, name: a.name, change: "removed", moved_mm: null, resized_mm: null, fields: [] });
  }
  return {
    from: { plan_id: from.plan_id, revision: from.revision }, to: { plan_id: to.plan_id, revision: to.revision },
    changes, unchanged,
  };
}
