import { describe, expect, it } from "vitest";
import type { Plan } from "@cutonce/schemas";
import { hasErrors, validatePlan } from "../src/index.js";
import { clone, desk, load } from "./helpers.js";

const codes = (plan: unknown) => [...new Set(validatePlan(plan).map((i) => i.code))];
const part = (plan: Plan, id: string) => plan.parts.find((p) => p.part_id === id)!;

describe("validatePlan", () => {
  it("passes the archetype desk and the mirror-test plan with no issues at all", () => {
    expect(validatePlan(desk())).toEqual([]);
    expect(validatePlan(load<Plan>("plan_asymmetric.json"))).toEqual([]);
  });
  it("V1: a 1 mm part", () => {
    const p = clone(desk()); part(p, "part_rear_crossbar").shape = { type: "box", size: [0.82, 0.06, 0.001] };
    expect(codes(p)).toContain("V1");
  });
  it("V1: bad data stops early with only V1", () => expect(codes({ plan_id: "nope" })).toEqual(["V1"]));
  it("V2: parts do not add up to the stated overall size", () => {
    const p = clone(desk()); p.overall_size = [1.05, 0.734, 0.6];
    expect(codes(p)).toEqual(["V2"]);
  });
  it("V3: two legs overlapping by 5 mm", () => {
    const p = clone(desk()); part(p, "part_right_front_leg").position = [0.105, 0.35, 0.53];
    expect(codes(p)).toContain("V3");
  });
  it("V3: the power strip inside the tray is allowed", () => expect(codes(desk())).not.toContain("V3"));
  it("V4: a leg floating 30 mm above the tabletop", () => {
    const p = clone(desk()); part(p, "part_left_rear_leg").position = [0.07, 0.38, 0.07];
    const issues = validatePlan(p).filter((i) => i.code === "V4");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.part_ids).toContain("part_left_rear_leg");
  });
  it("V4: a second part resting on nothing", () => {
    const p = clone(desk()); part(p, "part_cable_tray").rests_on = [];
    expect(codes(p)).toContain("V4");
  });
  it("V5: three legs in the materials list, four in the plan", () => {
    const p = clone(desk()); p.materials.find((m) => m.material_id === "mat_leg_700")!.quantity = 3;
    expect(codes(p)).toEqual(["V5"]);
  });
  it("V6: a leg's step placed before the tabletop's", () => {
    const p = clone(desk());
    p.steps.find((s) => s.step_id === "step_01")!.index = 3;
    p.steps.find((s) => s.step_id === "step_02")!.index = 1;
    expect(codes(p)).toContain("V6");
  });
  it("V7 (warning): one leg 10 mm further out than its partner", () => {
    const p = clone(desk()); part(p, "part_left_front_leg").position = [0.06, 0.35, 0.53];
    const issues = validatePlan(p);
    expect(issues.some((i) => i.code === "V7" && i.severity === "warning")).toBe(true);
    expect(hasErrors(issues.filter((i) => i.code === "V7"))).toBe(false);
  });
  it("V8 (warning): a reference to an unknown document", () => {
    const p = clone(desk()); part(p, "part_tabletop").doc_refs = [{ document_id: "doc_missing", page: 1 }];
    expect(validatePlan(p)).toEqual([expect.objectContaining({ code: "V8", severity: "warning" })]);
  });
});
