import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOLOGRAM_PALETTE, resolveVisuals, stateForBuilt, styleFor } from "../src/index.js";
import { FIXTURES, clone, desk } from "./helpers.js";

describe("resolveVisuals", () => {
  const plan = desk();
  const state = stateForBuilt(plan, ["part_tabletop", "part_left_front_leg", "part_right_front_leg"]);

  it("starts from the state these cases assume", () => {
    expect(state.progress.built).toBe(3);
    expect(state.current_step_id).toBe("step_04");
    expect(state.available_part_ids).toContain("part_right_rear_leg");
    expect(state.available_part_ids).not.toContain("part_power_cable");
  });

  it("gives every part one base state, following blueprint §8", () => {
    const v = resolveVisuals(plan, state);
    expect(Object.keys(v).sort()).toEqual(plan.parts.map((p) => p.part_id).sort());
    expect(v.part_tabletop!.base).toBe("BUILT_LIVE");
    expect(v.part_left_rear_leg!.base).toBe("CURRENT_STEP");
    expect(v.part_right_rear_leg!.base).toBe("MISSING");
    expect(v.part_power_cable!.base).toBe("FUTURE");
  });

  it("marks wrong parts WRONG and replayed parts BUILT_REPLAY", () => {
    const s = clone(state);
    s.parts.part_right_front_leg!.state = "wrong";
    expect(resolveVisuals(plan, s).part_right_front_leg!.base).toBe("WRONG");
    expect(resolveVisuals(plan, state, { replay: true }).part_tabletop!.base).toBe("BUILT_REPLAY");
  });

  it("adds SELECTED and HIGHLIGHTED on top without changing the base", () => {
    const v = resolveVisuals(plan, state, { selected: "part_power_cable", highlighted: ["part_power_cable"] });
    expect(v.part_power_cable).toEqual({ base: "FUTURE", modifiers: ["SELECTED", "HIGHLIGHTED"] });
  });
});

describe("stateForBuilt", () => {
  it("builds nothing, a list, or everything", () => {
    const plan = desk();
    expect(stateForBuilt(plan, []).progress.built).toBe(0);
    expect(stateForBuilt(plan, "all").progress.built).toBe(plan.parts.length);
  });
});

describe("styleFor", () => {
  it("lets HIGHLIGHTED beat SELECTED and adds 0.15 fill", () => {
    const s = styleFor({ base: "MISSING", modifiers: ["SELECTED", "HIGHLIGHTED"] });
    expect(s.edge).toBe(HOLOGRAM_PALETTE.modifiers.HIGHLIGHTED.edge);
    expect(s.fillAlpha).toBeCloseTo(HOLOGRAM_PALETTE.bases.MISSING.fillAlpha + 0.15);
  });
  it("never lets a modifier repaint a WRONG part", () => {
    expect(styleFor({ base: "WRONG", modifiers: ["HIGHLIGHTED"] })).toEqual(HOLOGRAM_PALETTE.bases.WRONG);
  });
  it("keeps built parts see-through so the real wood shows", () => {
    expect(HOLOGRAM_PALETTE.bases.BUILT_LIVE.fillAlpha).toBe(0);
    expect(HOLOGRAM_PALETTE.bases.BUILT_LIVE.brackets).toBe(true);
  });
});

it("the palette file Unity reads matches the code", () => {
  const file = JSON.parse(readFileSync(join(FIXTURES, "hologram-palette.json"), "utf8"));
  expect(file).toEqual(HOLOGRAM_PALETTE);
});
