import { describe, expect, it } from "vitest";
import { validatePlan } from "@cutonce/project-model";
import type { Surface, Twin } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { toPlan } from "../src/build/plan.js";
import { matchRules } from "../src/build/rules.js";
import { chooseSite } from "../src/build/site.js";
import { solve } from "../src/build/solver.js";
import { checkStability } from "../src/build/stability.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab);
let n = 0;
const std = (name: string, x = 0, z = 0.5): Twin => {
  const item = vocab.get(name)!;
  const shape = standardShape(item) ?? { type: "box" as const, size: [0.3, 0.2, 0.12] as [number, number, number] };
  return twin({ twin_id: `o${++n}`, name, label: item.label, shape, material: item.material, load_bearing: item.load_bearing, error_m: 0.003, snapped: true, position: [x, 0.8, z] });
};
const table: Surface = { surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1.0], points: 900 };

describe("every rule in data/build/rules.json", () => {
  // Four identical cans, so the four-can riser is exercised as well as the three-can one.
  const pile = [std("tall_can"), std("tall_can"), std("tall_can"), std("tall_can"), std("pizza_box"), std("cardboard_box"), std("drink_can")];
  const matched = matchRules(rules, pile);

  it("matches the demo pile", () => expect(matched.map((m) => m.rule.rule_id).sort()).toEqual(rules.map((r) => r.rule_id).sort()));

  for (const m of matched) {
    it(`${m.rule.rule_id} solves, stands with its payload, and passes the plan checker`, () => {
      const byId = new Map(pile.map((t) => [t.twin_id, t]));
      const solved = solve(m.draft, byId);
      if (!solved.ok) throw new Error(solved.reason);
      expect(checkStability(solved.placed, byId, vocab, m.payload)).toEqual({ ok: true });
      const { plan } = toPlan({ ideaId: "idea_test", title: m.draft.title, why: m.draft.why, tools: m.draft.tools, source: "rule", ruleId: m.rule.rule_id, model: "rules", placed: solved.placed, twins: byId, projectId: "proj_cutonce_demo" });
      expect(validatePlan(plan).filter((i) => i.severity === "error")).toEqual([]);
      expect(plan.parts.filter((p) => p.rests_on.length === 0).map((p) => p.part_id)).toEqual(["part_surface"]);
      expect(plan.parts.some((p) => p.rotation_quat)).toBe(false);
    });
  }
});

describe("matchRules", () => {
  it("needs identical cans for a rule that says same_name", () => {
    expect(matchRules(rules, [std("tall_can"), std("drink_can"), std("energy_can"), std("pizza_box")]).map((m) => m.rule.rule_id)).not.toContain("rule_laptop_riser");
  });
});

describe("chooseSite", () => {
  it("turns the design's front toward the viewer and puts it beside the pile, on the table", () => {
    const site = chooseSite(table, { min: [-0.1, 0.5], max: [0.1, 0.6] }, { w: 0.35, d: 0.35 }, [0, 1.6, -1]);
    expect(site.yaw_deg).toBeCloseTo(180, 0);
    expect(site.position[1]).toBeCloseTo(0.74);
    const [x, , z] = site.position;
    expect(x >= -0.6 + 0.175 && x <= 0.6 - 0.175 && z >= 0.2 && z <= 1.0).toBe(true);
    expect(Math.abs(x)).toBeGreaterThan(0.2);                     // beside the pile, not on it
  });

  it("goes to the clear side when something the design does not use stands on the other", () => {
    const pile = { min: [-0.1, 0.5] as [number, number], max: [0.1, 0.6] as [number, number] };
    const design = { w: 0.35, d: 0.35 }, viewer: [number, number, number] = [0, 1.6, -1];
    const free = chooseSite(table, pile, design, viewer);
    // Put a sponsor's box exactly where the design would have gone: it must now go to the other side of the pile.
    const inTheWay = { min: [free.position[0] - 0.1, free.position[2] - 0.1] as [number, number], max: [free.position[0] + 0.1, free.position[2] + 0.1] as [number, number] };
    const moved = chooseSite(table, pile, design, viewer, [inTheWay]);
    expect(Math.sign(moved.position[0])).toBe(-Math.sign(free.position[0]));
    expect(Math.abs(moved.position[0] - free.position[0])).toBeGreaterThan(0.4);
  });

  it("still gives a spot when every clear one is taken", () => {
    const everywhere = [{ min: [-5, -5] as [number, number], max: [5, 5] as [number, number] }];
    const site = chooseSite(table, { min: [-0.1, 0.5], max: [0.1, 0.6] }, { w: 0.35, d: 0.35 }, [0, 1.6, -1], everywhere);
    expect(Number.isFinite(site.position[0]) && Number.isFinite(site.position[2])).toBe(true);
  });
});
