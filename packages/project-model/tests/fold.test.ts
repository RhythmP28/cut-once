import { describe, expect, it } from "vitest";
import type { Plan } from "@cutonce/schemas";
import { fold } from "../src/index.js";
import { load, stateCases } from "./helpers.js";

const cases = stateCases();
const run = (file: string) => { const c = cases.find((x) => x.file.startsWith(file))!; return fold(load<Plan>(c.plan), c.assembly_id, c.events, c.up_to); };

describe("fold matches every shared fixture", () => {
  for (const c of cases) it(c.file, () => expect(fold(load<Plan>(c.plan), c.assembly_id, c.events, c.up_to)).toEqual(c.expected));
});

// These facts are written by hand, so a reducer bug cannot hide inside a generated expected file.
describe("key facts, pinned independently", () => {
  it("01 empty: nothing built, the tabletop is the only available part", () => {
    const s = run("01");
    expect([s.progress.built, s.progress.total, s.progress.pct, s.version]).toEqual([0, 9, 0, 0]);
    expect(s.current_step_id).toBe("step_01");
    expect(s.available_part_ids).toEqual(["part_tabletop"]);
    expect(s.blocked_part_ids).toHaveLength(8);
    expect(s.as_of).toBeNull();
  });
  it("02 demo start: 3 of 9, 33%, step 4 is current", () => {
    const s = run("02");
    expect([s.progress.built, s.progress.pct, s.version]).toEqual([3, 33, 3]);
    expect(s.current_step_id).toBe("step_04");
    expect(s.available_part_ids.sort()).toEqual(["part_cable_tray", "part_left_rear_leg", "part_right_rear_leg"]);
    expect(s.blocked_part_ids.sort()).toEqual(["part_power_cable", "part_power_strip", "part_rear_crossbar"]);
    expect(s.progress.by_layer).toEqual({ structure: [3, 6], hardware: [0, 1], electrical: [0, 2] });
  });
  it("03 build next: 4 of 9, 44%, step 5 is current, 9 minutes left", () => {
    const s = run("03");
    expect([s.progress.built, s.progress.pct, s.version]).toEqual([4, 44, 4]);
    expect(s.current_step_id).toBe("step_05");
    expect(s.parts.part_left_rear_leg).toMatchObject({ state: "built", since_version: 4 });
    expect(s.progress.minutes_left).toBe(1 + 2 + 2 + 1 + 2 + 1);
    expect(s.out_of_sequence).toEqual([]);
  });
  it("04 out of sequence: the cable is flagged hard", () =>
    expect(run("04").out_of_sequence).toEqual([{ part_id: "part_power_cable", kind: "hard" }]));
  it("05 undo: back to 3 of 9 at version 5", () => {
    const s = run("05");
    expect([s.progress.built, s.version, s.current_step_id]).toEqual([3, 5, "step_04"]);
    expect(s.parts.part_left_rear_leg).toMatchObject({ state: "missing", since_version: 5 });
  });
  it("06 no-op: a same-state event changes no part", () => {
    const s = run("06");
    expect(s.progress.built).toBe(3);
    expect(s.parts.part_tabletop.since_version).toBe(1);
  });
  it("07 verification: attaches a verdict, changes no progress", () => {
    const s = run("07");
    expect(s.progress.built).toBe(4);
    expect(s.parts.part_left_rear_leg.verified).toEqual({ verdict: "present", confidence: 0.91 });
  });
  it("08 history: version 2 shows only the tabletop and the left front leg", () => {
    const s = run("08");
    expect([s.progress.built, s.version]).toEqual([2, 2]);
    expect(s.parts.part_right_front_leg.state).toBe("missing");
  });
  it("provisional events apply after versioned ones", () => {
    const c = cases.find((x) => x.file.startsWith("03"))!;
    const events = c.events.map((e) => (e.version === 4 ? { ...e, version: null } : e)).reverse();
    expect(fold(load<Plan>(c.plan), c.assembly_id, events).progress.built).toBe(4);
  });
  it("a soft deviation: right rear leg before left rear leg", () => {
    const c = cases.find((x) => x.file.startsWith("02"))!;
    const e = { ...c.events[2]!, event_id: "evt_01J8ZK00000000000000000099", version: 4, part_id: "part_right_rear_leg", step_id: "step_05", source: "manual" as const };
    expect(fold(load<Plan>(c.plan), c.assembly_id, [...c.events, e]).out_of_sequence).toEqual([{ part_id: "part_right_rear_leg", kind: "soft" }]);
  });
});
