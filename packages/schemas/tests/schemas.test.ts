import { describe, expect, it } from "vitest";
import { S, Strict } from "../src/index.js";

const leg = {
  part_id: "part_left_rear_leg", name: "Left rear leg", aliases: ["back left leg"], kind: "leg", layer: "structure",
  shape: { type: "cylinder", axis: "y", diameter: 0.04, length: 0.7 }, position: [0.07, 0.35, 0.07],
  material_id: "mat_leg_700", step_id: "step_04", rests_on: ["part_tabletop"],
  attaches_to: [{ part_id: "part_tabletop", relation: "on", via_material_id: "mat_mount_plate" }],
  verify_hint: "black steel tube", install_minutes: 1, doc_refs: [{ document_id: "doc_desk_manual", page: 4 }],
};
const event = {
  event_id: "evt_01J8ZK3V9Q4T7M2A5B6C7D8E9F", assembly_id: "asm_desk_run_017", version: 4,
  timestamp: "2026-09-20T13:12:07.412Z", client_timestamp: "2026-09-20T13:12:07.377Z", kind: "part_state",
  part_id: "part_left_rear_leg", previous_state: "missing", new_state: "built", source: "manual", confidence: 1,
  actor: "operator", step_id: "step_04",
};

describe("Part", () => {
  it("parses a valid part", () => expect(Strict.Part.safeParse(leg).success).toBe(true));
  it("rejects a bad part id", () => expect(Strict.Part.safeParse({ ...leg, part_id: "LeftLeg" }).success).toBe(false));
  it("rejects a negative size", () =>
    expect(Strict.Part.safeParse({ ...leg, shape: { type: "box", size: [-0.1, 0.1, 0.1] } }).success).toBe(false));
  it("rejects an unknown shape", () => expect(Strict.Part.safeParse({ ...leg, shape: { type: "sphere" } }).success).toBe(false));
  it("rejects a bad cylinder axis", () =>
    expect(Strict.Part.safeParse({ ...leg, shape: { ...leg.shape, axis: "w" } }).success).toBe(false));
  it("parses a polyline", () =>
    expect(Strict.Part.safeParse({ ...leg, shape: { type: "polyline", diameter: 0.008, points: [[0, 0, 0], [1, 0, 0]] } }).success).toBe(true));
  it("strict form rejects an unknown key; runtime form drops it", () => {
    expect(Strict.Part.safeParse({ ...leg, colour: "red" }).success).toBe(false);
    const parsed = S.Part.parse({ ...leg, colour: "red" }) as Record<string, unknown>;
    expect(parsed.colour).toBeUndefined();
  });
});

describe("BuildEvent", () => {
  it("parses with a server version", () => expect(Strict.BuildEvent.safeParse(event).success).toBe(true));
  it("parses a provisional event", () => expect(Strict.BuildEvent.safeParse({ ...event, version: null }).success).toBe(true));
  it("rejects an unknown source", () => expect(Strict.BuildEvent.safeParse({ ...event, source: "ai" }).success).toBe(false));
  it("rejects a short event id", () => expect(Strict.BuildEvent.safeParse({ ...event, event_id: "evt_123" }).success).toBe(false));
  it("rejects an unknown state", () => expect(Strict.BuildEvent.safeParse({ ...event, new_state: "done" }).success).toBe(false));
  it("needs part fields on part_state events", () => {
    const { part_id: _omit, ...noPart } = event;
    expect(Strict.BuildEvent.safeParse(noPart).success).toBe(false);
  });
});

describe("WsMessage", () => {
  it("narrows by type", () => {
    const msg = S.WsMessage.parse({ type: "event_appended", assembly_id: "asm_desk_run_017", event, head: 4 });
    expect(msg.type).toBe("event_appended");
    if (msg.type === "event_appended") expect(msg.head).toBe(4);
  });
});
