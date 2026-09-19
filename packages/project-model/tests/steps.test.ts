import { describe, expect, it } from "vitest";
import { CycleError, generateSteps, orderParts, orderSteps } from "../src/index.js";
import { clone, desk } from "./helpers.js";

describe("step order", () => {
  it("orders the desk so nothing goes in before what it rests on", () => {
    const order = orderParts(desk().parts).map((p) => p.part_id);
    const pos = (id: string) => order.indexOf(id);
    expect(order[0]).toBe("part_tabletop");
    for (const leg of ["part_left_rear_leg", "part_right_rear_leg"]) expect(pos(leg)).toBeLessThan(pos("part_rear_crossbar"));
    expect(pos("part_cable_tray")).toBeLessThan(pos("part_power_strip"));
    expect(order.at(-1)).toBe("part_power_cable");
  });
  it("breaks ties left to right", () => {
    const order = orderParts(desk().parts).map((p) => p.part_id);
    expect(order.indexOf("part_left_front_leg")).toBeLessThan(order.indexOf("part_right_front_leg"));
  });
  it("throws on a cycle and names the parts", () => {
    const parts = clone(desk().parts);
    parts.find((p) => p.part_id === "part_tabletop")!.rests_on = ["part_left_front_leg"];
    expect(() => orderParts(parts)).toThrow(CycleError);
    try { orderParts(parts); } catch (e) { expect((e as CycleError).part_ids).toContain("part_tabletop"); }
  });
  it("generates one step per part with requires from rests_on", () => {
    const steps = generateSteps(desk().parts, desk().materials);
    expect(steps.map((s) => s.step_id)).toEqual(["step_01", "step_02", "step_03", "step_04", "step_05", "step_06", "step_07", "step_08", "step_09"]);
    expect(steps.every((s) => s.part_ids.length === 1)).toBe(true);
    const crossbar = steps.find((s) => s.part_ids[0] === "part_rear_crossbar")!;
    expect(crossbar.requires).toHaveLength(2);
  });
  it("orderSteps keeps hand-written titles and re-points parts", () => {
    const plan = orderSteps(desk());
    const leg = plan.parts.find((p) => p.part_id === "part_left_rear_leg")!;
    expect(plan.steps.find((s) => s.step_id === leg.step_id)!.title).toBe("Attach left rear leg");
  });
});
