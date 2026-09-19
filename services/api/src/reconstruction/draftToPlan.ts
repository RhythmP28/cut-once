import type { Material, Part, Plan, PlanDraft, Shape, ValidationIssue, Vec3 } from "@cutonce/schemas";
import { generateSteps, toMaterialId, toPartId, validatePlan } from "@cutonce/project-model";

type DraftVec = { x: number; y: number; z: number };
const vec = (v: DraftVec): Vec3 => [v.x, v.y, v.z];
const norm = (s: string) => s.trim().toLowerCase();

function shapeOf(s: PlanDraft["parts"][number]["shape"]): Shape {
  if (s.type === "box") return { type: "box", size: vec(s.size) };
  if (s.type === "cylinder") return { type: "cylinder", axis: s.axis, diameter: s.diameter, length: s.length };
  return { type: "polyline", points: s.points.map(vec), diameter: s.diameter };
}

/**
 * The model proposes names and numbers; this code owns ids, relations, steps and checking.
 * It never throws on a bad draft: problems come back as validation issues for the review page.
 */
export function draftToPlan(draft: PlanDraft, meta: { plan_id: string; project_id: string; source_document_ids: string[]; extracted_by: string }): { plan: Plan; issues: ValidationIssue[] } {
  const partIds = new Set<string>(), matIds = new Set<string>();
  const idByName = new Map<string, string>();
  const named = draft.parts.map((d) => { const id = toPartId(d.name, partIds); partIds.add(id); if (!idByName.has(norm(d.name))) idByName.set(norm(d.name), id); return { d, id }; });

  const materials: Material[] = draft.materials.map((m) => {
    const id = toMaterialId(m.name, matIds); matIds.add(id);
    return { material_id: id, name: m.name, spec: m.spec, unit: m.unit || "each", quantity: m.quantity, used_by: [], doc_refs: [] };
  });
  const matByName = new Map(materials.map((m) => [norm(m.name), m]));
  const unresolved: ValidationIssue[] = [];
  const assumptions = [...draft.assumptions];

  const parts: Part[] = named.map(({ d, id }) => {
    const resolve = (name: string) => {
      const hit = idByName.get(norm(name));
      if (!hit) unresolved.push({ code: "V4", severity: "error", part_ids: [id], message: `${d.name} rests on or attaches to "${name}", which is not a part in this draft` });
      return hit;
    };
    let material = d.material_name ? matByName.get(norm(d.material_name)) : undefined;
    if (!material) { // keep the plan valid: every part needs a material row, so make one and say so
      const mid = toMaterialId(d.material_name ?? d.name, matIds); matIds.add(mid);
      material = { material_id: mid, name: d.material_name ?? d.name, spec: "not on the drawings", unit: "each", quantity: 0, used_by: [], doc_refs: [] };
      materials.push(material); matByName.set(norm(material.name), material);
      assumptions.push(`${d.name}: no matching row in the materials list; added "${material.name}"`);
    }
    material.used_by.push(id);
    if (material.spec === "not on the drawings") material.quantity += 1;
    if (d.evidence.length === 0) assumptions.push(`${d.name}: no dimension on the drawings supports its size or position`);
    for (const a of d.assumptions) assumptions.push(`${d.name}: ${a}`);
    return {
      part_id: id, name: d.name, aliases: d.aliases, kind: d.kind || "part", layer: d.layer || "structure", shape: shapeOf(d.shape), position: vec(d.position),
      material_id: material.material_id, step_id: "step_01", rests_on: d.rests_on_names.map(resolve).filter((x): x is string => !!x),
      attaches_to: d.attaches_to.map((a) => ({ part_id: resolve(a.name), relation: a.relation })).filter((a): a is { part_id: string; relation: typeof a.relation } => !!a.part_id),
      verify_hint: d.verify_hint, install_minutes: Math.max(0, d.install_minutes),
      doc_refs: [...new Set(d.evidence.map((e) => e.page))].map((page) => ({ document_id: meta.source_document_ids[0] ?? "doc_unknown", page })),
    };
  });

  const layers = ["structure", "hardware", "electrical"];
  for (const p of parts) if (!layers.includes(p.layer)) layers.push(p.layer);
  let steps: Plan["steps"] = [];
  try {
    steps = generateSteps(parts, materials, layers);
    const stepOf = new Map(steps.map((s) => [s.part_ids[0]!, s.step_id]));
    for (const p of parts) p.step_id = stepOf.get(p.part_id)!;
  } catch { /* a cycle: validatePlan reports it as V4 below */ }

  const size = vec(draft.overall_size.value);
  const plan: Plan = {
    plan_id: meta.plan_id, project_id: meta.project_id, name: draft.name || "Extracted plan", revision: 1, status: "draft",
    frame: { handedness: "right", up: "+Y", units: "m", pose: "assembly", origin: "far-left corner of the base part, as the builder stands" },
    ...(size.every((v) => v > 0) ? { overall_size: size } : {}), layers, parts, materials, steps, markers: [], touch_points: [],
    provenance: { source_document_ids: meta.source_document_ids, extracted_by: meta.extracted_by, assumptions, validation: [] },
  };
  const issues = [...unresolved, ...validatePlan(plan)];
  return { plan: { ...plan, provenance: { ...plan.provenance, validation: issues } }, issues };
}
