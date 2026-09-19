import type { BuildStep, Material, Part, Plan, Twin } from "@cutonce/schemas";
import { aabbOfPlaced, type Placed } from "./solver.js";
import { dimsCm } from "./shape.js";

export interface PlanInput {
  ideaId: string; title: string; why: string; tools: string[]; source: "rule" | "ai"; ruleId: string | null; model: string;
  placed: Placed[]; twins: Map<string, Twin>; projectId: string;
}

const PLAN_PREFIX = "plan_build_";
/** True for a plan that build mode made (toPlan mints the id). The copilot uses it: only such a run has one-piece steps. */
export const isBuildPlan = (plan: Pick<Plan, "plan_id">) => plan.plan_id.startsWith(PLAN_PREFIX);

const VERB = { upright: "Stand", flat: "Lay", on_side: "Turn" } as const;
const HOW = { upright: "upright", flat: "flat", on_side: "on its side" } as const;
const stepId = (i: number) => `step_${String(i).padStart(2, "0")}`;
const joinWords = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", the ")} and the ${w.at(-1)}`);

/**
 * A design as a normal Cut Once plan, centred on the origin. One base part, "part_surface" (the patch of table under
 * the build, top at y = 0), so V4's "exactly one datum" holds; the run's seed marks it built. One object per step,
 * bottom-up, so V6 holds. No rotation_quat anywhere (validate.ts ignores it).
 */
export function toPlan(input: PlanInput): { plan: Plan; twinOf: Record<string, string>; size: [number, number] } {
  const boxes = input.placed.map(aabbOfPlaced);
  const minX = Math.min(...boxes.map((b) => b.min[0])), maxX = Math.max(...boxes.map((b) => b.max[0]));
  const minZ = Math.min(...boxes.map((b) => b.min[2])), maxZ = Math.max(...boxes.map((b) => b.max[2]));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, w = maxX - minX, d = maxZ - minZ;

  const counts = new Map<string, number>();
  for (const p of input.placed) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  const label = new Map(input.placed.map((p) => {
    if ((counts.get(p.label) ?? 0) < 2) return [p.twin_id, p.label];
    const k = (seen.get(p.label) ?? 0) + 1; seen.set(p.label, k);
    return [p.twin_id, `${p.label} ${String.fromCharCode(64 + k)}`];       // "tall can A", "tall can B"
  }));

  const parts: Part[] = [{
    part_id: "part_surface", name: "Build area", aliases: ["table", "build area"], kind: "surface", layer: "build",
    shape: { type: "box", size: [w + 0.1, 0.005, d + 0.1] }, position: [0, -0.0025, 0], material_id: "mat_surface", step_id: stepId(1),
    rests_on: [], attaches_to: [], verify_hint: "the table under the outline is clear", install_minutes: 0.2, doc_refs: [],
  }];
  const materials: Material[] = [{ material_id: "mat_surface", name: "Build area", spec: "the table under the build", unit: "area", quantity: 1, used_by: ["part_surface"], doc_refs: [] }];
  const steps: BuildStep[] = [{
    step_id: stepId(1), index: 1, title: "Clear the build area", instruction: "Clear the space where the outline glows.",
    part_ids: ["part_surface"], requires: [], layer: "build", est_minutes: 0.2, materials: [], doc_refs: [],
  }];
  const twinOf: Record<string, string> = {};
  const tools = [...new Set([...input.tools, ...(input.placed.some((p) => p.taped_to.length) ? ["tape"] : [])])];
  // Tape, when the design uses it: one strip per taped joint, listed as a material the taped parts attach through.
  const joints = input.placed.reduce((n, p) => n + p.taped_to.length, 0);
  if (joints > 0) {
    materials.push({ material_id: "mat_tape", name: "Tape", spec: "one strip per joint", unit: "strip", quantity: joints,
      used_by: input.placed.filter((p) => p.taped_to.length).map((p) => `part_${p.twin_id}`), doc_refs: [] });
  }

  input.placed.forEach((p, i) => {
    const t = input.twins.get(p.twin_id)!, name = label.get(p.twin_id)!, partId = `part_${p.twin_id}`, matId = `mat_${p.twin_id}`, sid = stepId(i + 2);
    twinOf[partId] = p.twin_id;
    parts.push({
      part_id: partId, name, aliases: [t.label, t.name.replace(/_/g, " ")], kind: t.name, layer: "build", shape: p.shape,
      position: [p.position[0] - cx, p.position[1], p.position[2] - cz], material_id: matId, step_id: sid,
      rests_on: p.rests_on.length ? p.rests_on.map((id) => `part_${id}`) : ["part_surface"],
      attaches_to: p.taped_to.map((id) => ({ part_id: `part_${id}`, relation: "on" as const, via_material_id: "mat_tape" })),
      verify_hint: `${name} ${HOW[p.orientation]}`, install_minutes: 0.2, doc_refs: [],
    });
    materials.push({ material_id: matId, name, spec: `${dimsCm(p.shape).join(" × ")} cm`, unit: "each", quantity: 1, used_by: [partId], doc_refs: [] });
    const where = p.rests_on.length ? ` on top of the ${joinWords(p.rests_on.map((id) => label.get(id)!))}` : " where its outline glows on the table";
    const tape = p.taped_to.length ? ` Tape it to the ${joinWords(p.taped_to.map((id) => label.get(id)!))}.` : "";
    steps.push({
      step_id: sid, index: i + 2, title: `Place the ${name}`,
      instruction: `${VERB[p.orientation]} the ${name} ${HOW[p.orientation]}${where}.${tape}${i === 0 && input.why ? ` ${input.why}` : ""}`,
      part_ids: [partId], requires: [stepId(i + 1)], layer: "build", est_minutes: p.taped_to.length ? 0.5 : 0.2,
      materials: [{ material_id: matId, qty: 1 }, ...(p.taped_to.length ? [{ material_id: "mat_tape", qty: p.taped_to.length }] : [])], doc_refs: [],
    });
  });

  const plan: Plan = {
    plan_id: `${PLAN_PREFIX}${input.ideaId.replace(/^idea_/, "")}`, project_id: input.projectId, name: input.title, revision: 1, status: "draft",
    frame: { handedness: "right", up: "+Y", units: "m", pose: "design", origin: "centre of the build area, on the table" },
    layers: ["build"], parts, materials, steps, markers: [], touch_points: [],
    provenance: {
      source_document_ids: [], extracted_by: input.source === "rule" ? `build mode rule ${input.ruleId}` : `build mode, ${input.model}`,
      assumptions: [input.why, ...(tools.length ? [`tools: ${tools.join(", ")}`] : [])], validation: [],
    },
  };
  return { plan, twinOf, size: [w, d] };
}
