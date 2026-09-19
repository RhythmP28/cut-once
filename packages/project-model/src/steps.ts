import type { BuildStep, Material, Part, Plan } from "@cutonce/schemas";
import { partAabb, volume } from "./geometry.js";

export class CycleError extends Error {
  constructor(public readonly part_ids: string[]) {
    super(`rests_on forms a cycle through: ${part_ids.join(", ")}`);
  }
}

const DEFAULT_LAYERS = ["structure", "hardware", "electrical"];

/**
 * Build order for parts: a part can only go in after everything it rests on.
 * Ties break by layer (structure → hardware → electrical), then left to right, then larger first, then by id.
 */
export function orderParts(parts: readonly Part[], layers: readonly string[] = DEFAULT_LAYERS): Part[] {
  const layerRank = (p: Part) => { const i = layers.indexOf(p.layer); return i === -1 ? layers.length : i; };
  const xCentre = (p: Part) => { const b = partAabb(p); return b ? (b.min[0] + b.max[0]) / 2 : p.position[0]; };
  const before = (a: Part, b: Part) =>
    layerRank(a) - layerRank(b) || xCentre(a) - xCentre(b) || volume(b) - volume(a) || a.part_id.localeCompare(b.part_id);

  const placed = new Set<string>(), out: Part[] = [];
  const known = new Set(parts.map((p) => p.part_id));
  let remaining = [...parts];
  while (remaining.length > 0) {
    const ready = remaining.filter((p) => p.rests_on.every((id) => placed.has(id) || !known.has(id)));
    if (ready.length === 0) throw new CycleError(remaining.map((p) => p.part_id).sort());
    const next = ready.sort(before)[0]!;
    out.push(next); placed.add(next.part_id);
    remaining = remaining.filter((p) => p !== next);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** One step per part, in build order, with `requires` derived from rests_on. */
export function generateSteps(parts: readonly Part[], materials: readonly Material[] = [], layers?: readonly string[]): BuildStep[] {
  const ordered = orderParts(parts, layers);
  const stepOf = new Map(ordered.map((p, i) => [p.part_id, `step_${pad(i + 1)}`]));
  return ordered.map((p, i) => ({
    step_id: stepOf.get(p.part_id)!, index: i + 1, title: `Install ${p.name.toLowerCase()}`,
    instruction: p.rests_on.length ? `Fit the ${p.name.toLowerCase()} onto ${p.rests_on.map((id) => parts.find((q) => q.part_id === id)?.name.toLowerCase() ?? id).join(" and ")}.` : `Place the ${p.name.toLowerCase()}.`,
    part_ids: [p.part_id], requires: [...new Set(p.rests_on.map((id) => stepOf.get(id)).filter((s): s is string => !!s))].sort(),
    layer: p.layer, est_minutes: p.install_minutes,
    materials: materials.some((m) => m.material_id === p.material_id) ? [{ material_id: p.material_id, qty: 1 }] : [],
    doc_refs: p.doc_refs,
  }));
}

/** Regenerates a plan's steps in build order and points every part at its new step. Hand-written titles are kept. */
export function orderSteps(plan: Plan): Plan {
  const steps = generateSteps(plan.parts, plan.materials, plan.layers);
  const written = new Map(plan.steps.filter((s) => s.part_ids.length === 1).map((s) => [s.part_ids[0]!, s]));
  for (const s of steps) {
    const old = written.get(s.part_ids[0]!);
    if (old) { s.title = old.title; s.instruction = old.instruction; s.est_minutes = old.est_minutes; s.materials = old.materials; }
  }
  const stepOf = new Map(steps.map((s) => [s.part_ids[0]!, s.step_id]));
  return { ...plan, steps, parts: plan.parts.map((p) => ({ ...p, step_id: stepOf.get(p.part_id)! })) };
}
