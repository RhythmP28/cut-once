import { Strict, type Part, type Plan, type ValidationIssue } from "@cutonce/schemas";
import { aabbGap, aabbOverlapDepth, isSolid, partAabb, union } from "./geometry.js";
import { CycleError, orderParts } from "./steps.js";

const MM = 0.001;
const MIN_SIZE = 0.005, MAX_SIZE = 3;
const TOUCH_TOLERANCE = 2 * MM, OVERLAP_TOLERANCE = 1 * MM, SIZE_TOLERANCE = 2 * MM;

export const hasErrors = (issues: readonly ValidationIssue[]) => issues.some((i) => i.severity === "error");

/** Checks a plan with plain code. Errors block approval; warnings are shown on the review page. */
export function validatePlan(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue["code"], severity: ValidationIssue["severity"], part_ids: string[], message: string) =>
    issues.push({ code, severity, part_ids, message });

  // V1: shape of the data
  const parsed = Strict.Plan.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 20)) add("V1", "error", [], `${i.path.join(".")}: ${i.message}`);
    return issues;
  }
  const plan: Plan = parsed.data;
  const byId = new Map<string, Part>();
  for (const p of plan.parts) {
    if (byId.has(p.part_id)) add("V1", "error", [p.part_id], `duplicate part id ${p.part_id}`);
    byId.set(p.part_id, p);
    const dims = p.shape.type === "box" ? p.shape.size
      : p.shape.type === "cylinder" ? [p.shape.diameter, p.shape.length]
      : p.shape.type === "polyline" ? [p.shape.diameter] : [];
    for (const d of dims) {
      if (d < MIN_SIZE || d > MAX_SIZE) add("V1", "error", [p.part_id], `${p.name}: dimension ${d} m is outside ${MIN_SIZE}–${MAX_SIZE} m`);
    }
  }

  // V2: the parts add up to the stated overall size
  if (plan.overall_size) {
    const all = union(plan.parts.filter(isSolid).map((p) => partAabb(p)!));
    if (all) for (let i = 0; i < 3; i++) {
      const got = all.max[i]! - all.min[i]!, want = plan.overall_size[i]!;
      if (Math.abs(got - want) > SIZE_TOLERANCE) {
        add("V2", "error", [], `overall ${"xyz"[i]} is ${got.toFixed(3)} m but the drawing says ${want.toFixed(3)} m`);
      }
    }
  }

  // V3: no two solid parts occupy the same space
  const linked = (a: Part, b: Part) =>
    [...a.attaches_to.filter((l) => l.part_id === b.part_id), ...b.attaches_to.filter((l) => l.part_id === a.part_id)]
      .some((l) => l.relation === "inside" || l.relation === "along");
  const solids = plan.parts.filter(isSolid);
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i]!, b = solids[j]!;
    const depth = aabbOverlapDepth(partAabb(a)!, partAabb(b)!);
    if (depth > OVERLAP_TOLERANCE && !linked(a, b)) {
      add("V3", "error", [a.part_id, b.part_id], `${a.name} and ${b.name} overlap by ${(depth / MM).toFixed(1)} mm`);
    }
  }

  // V4: nothing floats; one datum; no cycles
  const datums = plan.parts.filter((p) => p.rests_on.length === 0);
  if (plan.parts.length > 0 && datums.length !== 1) {
    add("V4", "error", datums.map((p) => p.part_id), `expected exactly one datum part (rests on nothing), found ${datums.length}`);
  }
  for (const p of plan.parts) for (const id of p.rests_on) {
    const target = byId.get(id);
    if (!target) { add("V4", "error", [p.part_id], `${p.name} rests on ${id}, which does not exist`); continue; }
    const a = partAabb(p), b = partAabb(target);
    if (!a || !b) continue;
    const gap = aabbGap(a, b);
    if (gap > TOUCH_TOLERANCE) add("V4", "error", [p.part_id, id], `${p.name} floats ${(gap / MM).toFixed(1)} mm away from ${target.name}`);
  }
  try { orderParts(plan.parts, plan.layers); }
  catch (e) { if (e instanceof CycleError) add("V4", "error", e.part_ids, e.message); else throw e; }

  // V5: materials
  const matIds = new Set(plan.materials.map((m) => m.material_id));
  for (const p of plan.parts) if (!matIds.has(p.material_id)) add("V5", "error", [p.part_id], `${p.name} uses ${p.material_id}, which is not in the materials list`);
  for (const m of plan.materials) {
    const users = plan.parts.filter((p) => p.material_id === m.material_id).map((p) => p.part_id);
    if (users.length > 0 && m.quantity < users.length) {
      add("V5", "error", users, `${m.name}: quantity ${m.quantity} but ${users.length} parts use it`);
    }
  }

  // V6: steps
  const stepIndex = new Map(plan.steps.map((s) => [s.step_id, s.index]));
  for (const p of plan.parts) {
    const holders = plan.steps.filter((s) => s.part_ids.includes(p.part_id));
    if (holders.length !== 1) { add("V6", "error", [p.part_id], `${p.name} is in ${holders.length} steps (must be exactly 1)`); continue; }
    if (holders[0]!.step_id !== p.step_id) add("V6", "error", [p.part_id], `${p.name} says ${p.step_id} but sits in ${holders[0]!.step_id}`);
    for (const id of p.rests_on) {
      const support = byId.get(id);
      if (support && (stepIndex.get(p.step_id) ?? 0) < (stepIndex.get(support.step_id) ?? 0)) {
        add("V6", "error", [p.part_id, id], `${p.name} is built before ${support.name}, which it rests on`);
      }
    }
  }

  // V7 (warning): like parts should mirror about the centre plane
  const all = union(solids.map((p) => partAabb(p)!));
  if (all) {
    const cx = (all.min[0] + all.max[0]) / 2;
    const groups = new Map<string, Part[]>();
    for (const p of solids) { const k = `${p.kind}|${JSON.stringify(p.shape)}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
    for (const group of groups.values()) {
      if (group.length < 2 || group.length % 2 !== 0) continue;
      for (const p of group) {
        if (Math.abs(p.position[0] - cx) < TOUCH_TOLERANCE) continue;
        const mirror = group.some((q) => q !== p && Math.abs(q.position[0] - (2 * cx - p.position[0])) <= TOUCH_TOLERANCE
          && Math.abs(q.position[1] - p.position[1]) <= TOUCH_TOLERANCE && Math.abs(q.position[2] - p.position[2]) <= TOUCH_TOLERANCE);
        if (!mirror) add("V7", "warning", [p.part_id], `${p.name} has no mirror partner about the centre plane`);
      }
    }
  }

  // V8 (warning): references point at known documents
  const docs = new Set(plan.provenance.source_document_ids);
  for (const p of plan.parts) for (const r of p.doc_refs) {
    if (!docs.has(r.document_id)) add("V8", "warning", [p.part_id], `${p.name} cites ${r.document_id}, which is not a source document`);
  }

  return issues;
}
