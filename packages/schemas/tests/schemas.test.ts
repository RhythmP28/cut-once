import { readFileSync } from "node:fs";
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

describe("build mode contracts", () => {
  const fixture = () => JSON.parse(readFileSync(new URL("../../../data/fixtures/build/ws_build_ideas.json", import.meta.url), "utf8"));

  it("parses the shared build_ideas fixture strictly", () => {
    const msg = Strict.WsMessage.parse(fixture());
    expect(msg.type).toBe("build_ideas");
  });

  it("accepts build mode in the copilot context and start_scan as an action", () => {
    expect(S.CopilotAction.parse({ type: "start_scan" })).toEqual({ type: "start_scan" });
    expect(S.CopilotContext.shape.mode.parse("build")).toBe("build");
  });

  it("lets a first scan omit its session id", () => {
    const upload = { device_id: "quest", grid: { cols: 8, rows: 6 }, points_mm: new Array(144).fill(0), hit: "0".repeat(48),
      camera: { position: [0, 1.6, 0], forward: [0, 0, 1], intrinsics: { width: 1280, height: 960, fx: 853.6, fy: 853.6, cx: 640, cy: 480 } },
      photo_b64: "x".repeat(200) };
    expect(S.BuildScanUpload.parse(upload).session_id).toBeUndefined();
  });

  it("lets a step say which pieces it is taped to, and leaves older steps valid without it", () => {
    const step = { place: "o2", orientation: "flat", on: ["o1"], at_cm: null, next_to: null, side: null, gap_cm: null };
    expect(Strict.PlaceStep.parse({ ...step, taped_to: ["o1"] }).taped_to).toEqual(["o1"]);
    expect(Strict.PlaceStep.parse(step).taped_to).toBeUndefined();
  });

  it("says where an idea came from (live, the rehearsal cache or a rule), and older ideas still parse", () => {
    const idea = fixture().ideas[0];
    expect(Strict.BuildIdea.parse({ ...idea, made: "cache" }).made).toBe("cache");
    expect(Strict.BuildIdea.safeParse({ ...idea, made: "guess" }).success).toBe(false);
    expect(Strict.BuildIdea.parse(idea).made).toBeUndefined();
  });

  it("lets an answer name the real objects it is about, by twin id", () => {
    const response = { turn_id: "turn_01abc", transcript: "t", answer_text: "a", highlight_parts: [], highlight_style: "pulse", drawing_refs: [],
      action: null, confidence: 1, needs_clarification: false, audio_url: null, cached: false, timings_ms: {} };
    expect(Strict.CopilotResponse.parse({ ...response, highlight_twins: ["o1", "o12"] }).highlight_twins).toEqual(["o1", "o12"]);
    expect(Strict.CopilotResponse.safeParse({ ...response, highlight_twins: ["part_leg"] }).success).toBe(false);
    expect(Strict.CopilotResponse.parse(response).highlight_twins).toBeUndefined();
  });

  it("keeps the AI's placement language free of tuples (strict JSON-schema mode rejects them)", () => {
    const step = Strict.PlaceStep.parse({ place: "o1", orientation: "upright", on: [], at_cm: { x: 0, z: 0 }, next_to: null, side: null, gap_cm: null });
    expect(step.at_cm).toEqual({ x: 0, z: 0 });
  });
});
