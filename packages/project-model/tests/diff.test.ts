import { describe, expect, it } from "vitest";
import { diffPlans } from "../src/index.js";
import { clone, desk } from "./helpers.js";

describe("diffPlans", () => {
  it("finds nothing between identical plans", () => {
    const d = diffPlans(desk(), desk());
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(desk().parts.length);
  });

  it("reports a move and a resize in millimetres", () => {
    const b = clone(desk());
    const top = b.parts.find((p) => p.part_id === "part_tabletop")!;
    top.position = [top.position[0] + 0.01, top.position[1], top.position[2]];
    (top.shape as { size: number[] }).size[0]! += 0.02;
    const [c] = diffPlans(desk(), b).changes;
    expect(c).toMatchObject({ part_id: "part_tabletop", change: "changed", moved_mm: 10, resized_mm: 20, fields: [] });
  });

  it("ignores movement under the tolerance", () => {
    const b = clone(desk());
    const leg = b.parts.find((p) => p.part_id === "part_left_front_leg")!;
    leg.position = [leg.position[0] + 0.0003, leg.position[1], leg.position[2]];
    expect(diffPlans(desk(), b).changes).toEqual([]);
  });

  it("lists added, removed and field changes", () => {
    const b = clone(desk());
    b.parts = b.parts.filter((p) => p.part_id !== "part_power_cable");
    b.parts.push({ ...clone(desk().parts[0]!), part_id: "part_shelf", name: "Shelf" });
    b.parts.find((p) => p.part_id === "part_rear_crossbar")!.step_id = "step_07";
    const changes = diffPlans(desk(), b).changes;
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_shelf", change: "added" }));
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_power_cable", change: "removed" }));
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_rear_crossbar", change: "changed", fields: ["step_id"] }));
  });

  it("matches by id before name, so a new part sharing a name can't steal an existing part", () => {
    const b = clone(desk());
    const leg = b.parts.find((p) => p.part_id === "part_left_front_leg")!;
    b.parts.unshift({ ...clone(leg), part_id: "part_leg_extra" }); // same name, placed first
    const changes = diffPlans(desk(), b).changes;
    expect(changes).toEqual([expect.objectContaining({ part_id: "part_leg_extra", change: "added" })]);
  });

  it("matches AI-read parts by name when their IDs differ", () => {
    const b = clone(desk());
    for (const p of b.parts) p.part_id = p.part_id.replace("part_", "part_x_");
    const d = diffPlans(desk(), b);
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(desk().parts.length);
  });
});
