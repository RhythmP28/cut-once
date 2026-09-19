import { describe, expect, it } from "vitest";
import { Strict, type PlanDraft } from "@cutonce/schemas";
import { toOpenAiSchema } from "../src/llm.js";
import { draftToPlan } from "../src/reconstruction/draftToPlan.js";

const meta = { plan_id: "plan_test", project_id: "proj_cutonce_demo", source_document_ids: ["doc_desk_drawings"], extracted_by: "test" };
const ev = [{ page: 1, text: "1000 x 600" }];
const part = (name: string, over: Partial<PlanDraft["parts"][number]> = {}): PlanDraft["parts"][number] => ({
  name, aliases: [], kind: "leg", layer: "structure", shape: { type: "cylinder", axis: "y", diameter: 0.04, length: 0.7 }, position: { x: 0.07, y: 0.35, z: 0.07 },
  rests_on_names: ["Tabletop"], attaches_to: [{ name: "Tabletop", relation: "on" }], material_name: "Steel leg", verify_hint: "black tube", install_minutes: 1, evidence: ev, assumptions: [], ...over,
});
const top = part("Tabletop", { kind: "panel", shape: { type: "box", size: { x: 1, y: 0.034, z: 0.6 } }, position: { x: 0.5, y: -0.017, z: 0.3 }, rests_on_names: [], attaches_to: [], material_name: "Top" });
const draft = (parts: PlanDraft["parts"]): PlanDraft => ({
  name: "Desk", overall_size: { value: { x: 1, y: 0.734, z: 0.6 }, evidence: ev }, parts,
  materials: [{ name: "Top", spec: "1000 x 600", unit: "each", quantity: 1, evidence: ev }, { name: "Steel leg", spec: "700 mm", unit: "each", quantity: 4, evidence: ev }], assumptions: [],
});

describe("draftToPlan", () => {
  it("assigns ids, resolves names, generates steps, and yields a valid plan", () => {
    const { plan, issues } = draftToPlan(draft([top, part("Left rear leg")]), meta);
    const leg = plan.parts.find((p) => p.part_id === "part_left_rear_leg")!;
    expect(leg.rests_on).toEqual(["part_tabletop"]);
    expect(leg.material_id).toBe("mat_steel_leg");
    expect(plan.steps.map((s) => s.part_ids[0])).toEqual(["part_tabletop", "part_left_rear_leg"]);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(Strict.Plan.safeParse(plan).success).toBe(true);
  });
  it("reports an unknown support as V4 instead of throwing", () => {
    const { issues } = draftToPlan(draft([top, part("Left rear leg", { rests_on_names: ["Shelf"] })]), meta);
    expect(issues.some((i) => i.code === "V4" && i.message.includes("Shelf"))).toBe(true);
  });
  it("numbers duplicate names", () =>
    expect(draftToPlan(draft([top, part("Leg"), part("Leg", { position: { x: 0.93, y: 0.35, z: 0.07 } })]), meta).plan.parts.map((p) => p.part_id)).toEqual(["part_tabletop", "part_leg", "part_leg_2"]));
  it("lists a part with no evidence under assumptions", () =>
    expect(draftToPlan(draft([top, part("Left rear leg", { evidence: [] })]), meta).plan.provenance.assumptions.join(" ")).toContain("Left rear leg: no dimension"));
  it("catches a floating part", () =>
    expect(draftToPlan(draft([top, part("Left rear leg", { position: { x: 0.07, y: 0.4, z: 0.07 } })]), meta).issues.some((i) => i.code === "V4")).toBe(true));
});

describe("strict JSON schema for the model", () => {
  const schema = toOpenAiSchema(Strict.PlanDraft);
  const objects: Record<string, any>[] = [];
  const walk = (n: any) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === "object") { if (n.type === "object") objects.push(n); Object.values(n).forEach(walk); } };
  walk(schema);
  it("closes every object and requires every key", () => {
    expect(objects.length).toBeGreaterThan(5);
    for (const o of objects) { expect(o.additionalProperties).toBe(false); expect(o.required.sort()).toEqual(Object.keys(o.properties).sort()); }
  });
  it("has no keyword strict mode may reject, and no tuples", () => {
    const text = JSON.stringify(schema);
    for (const k of ["minimum", "minItems", "maxItems", "pattern", "format", "$schema"]) expect(text).not.toContain(`"${k}"`);
    expect(text).not.toMatch(/"items":\[/);
  });
});
