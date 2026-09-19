import { expect, it } from "vitest";
import { Strict } from "@cutonce/schemas";
import { fold, plannedEvents } from "../src/index.js";
import { desk } from "./helpers.js";

it("plans one built event per part, in step order, and replays to 100%", () => {
  const events = plannedEvents(desk(), "asm_planned", "2026-09-20T13:00:00.000Z", 1);
  expect(events.map((e) => e.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(events[0]!.part_id).toBe("part_tabletop");
  expect(events.at(-1)!.part_id).toBe("part_power_cable");
  for (const e of events) expect(Strict.BuildEvent.safeParse(e).success).toBe(true);
  const times = events.map((e) => Date.parse(e.timestamp));
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  const end = fold(desk(), "asm_planned", events);
  expect([end.progress.pct, end.current_step_id, end.out_of_sequence]).toEqual([100, "step_10", []]);
});
