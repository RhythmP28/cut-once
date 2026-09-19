import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Strict, type CopilotContext, type RetrievedChunk } from "@cutonce/schemas";
import { annotateFrame } from "../src/copilot/annotate.js";
import { ground, type Draft } from "../src/copilot/answer.js";
import { REPO_ROOT } from "../src/config.js";
import { cropJpeg, padded } from "../src/copilot/crop.js";
import { gather, searchQuery } from "../src/copilot/context.js";
import { matchFastPath, normalise, resolvePart } from "../src/copilot/fastpath.js";
import { newTurnId, newVerificationId } from "../src/copilot/ids.js";
import { models } from "../src/copilot/models.js";
import { userText } from "../src/copilot/prompt.js";
import { Turns } from "../src/copilot/turns.js";
import { loadConfig } from "../src/config.js";
import { auth, builtEvent, makeApp } from "./helpers.js";

const FIXTURES = join(REPO_ROOT, "data", "fixtures");
const fixtureContext = () => Strict.CopilotContext.parse(JSON.parse(readFileSync(join(FIXTURES, "context_packet.json"), "utf8"))) as CopilotContext;
const fixtureFrame = () => readFileSync(join(FIXTURES, "frame_0001.jpg"));

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

const currentId = () => t.app.ctx.store.currentAssembly()!.assembly_id;
const contextFor = (aid: string, over: Partial<CopilotContext> = {}): CopilotContext => ({ ...fixtureContext(), assembly_id: aid, ...over });

/** The headset sends three multipart parts; Fastify's inject needs them assembled by hand. */
function multipart(parts: { name: string; value: string | Buffer; filename?: string; type?: string }[]) {
  const boundary = "----cutoncetest";
  const chunks: Buffer[] = [];
  for (const p of parts) {
    const disposition = p.filename ? `; filename="${p.filename}"` : "";
    const type = p.type ? `\r\nContent-Type: ${p.type}` : "";
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${disposition}${type}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("ids", () => {
  it("are prefix_lower_snake, which the shared schemas require", () => {
    expect(newTurnId()).toMatch(/^turn_[a-z0-9_]+$/);
    expect(newVerificationId()).toMatch(/^ver_[a-z0-9_]+$/);
  });
});

describe("fast path", () => {
  const plan = () => t.app.ctx.store.getPlan(t.app.ctx.store.getAssembly(currentId()).plan_id);
  const input = (over: Partial<Parameters<typeof matchFastPath>[1]> = {}) =>
    ({ plan: plan(), state: t.app.ctx.store.getState(currentId()), selectedPartId: null, recentEvents: [], ...over });

  it("strips punctuation and case", () => expect(normalise("Mark the LEFT rear leg, built.")).toBe("mark the left rear leg built"));

  it("resolves a part by its full name and prefers the longer match", () => {
    expect(resolvePart("left rear leg", plan().parts)?.part_id).toBe("part_left_rear_leg");
    expect(resolvePart("tabletop", plan().parts)?.part_id).toBe("part_tabletop");
  });

  it("refuses an ambiguous name rather than guessing", () => {
    // "leg" alone matches four parts; a wrong guess would write a wrong event.
    expect(resolvePart("leg", plan().parts)).toBeNull();
    expect(matchFastPath("mark the leg built", input())).toBeNull();
  });

  it("'done' marks the part being pointed at", () => {
    const fast = matchFastPath("done", input({ selectedPartId: "part_cable_tray" }));
    expect(fast?.action).toEqual({ type: "mark_state", part_ids: ["part_cable_tray"], new_state: "built", source: "voice" });
    expect(fast?.highlight_parts).toEqual(["part_cable_tray"]);
  });

  it("'done' with nothing selected falls through to the model", () => expect(matchFastPath("done", input())).toBeNull());

  it("'next' and 'back' navigate without touching the event log", () => {
    expect(matchFastPath("next", input())?.action).toEqual({ type: "step_nav", direction: "next" });
    expect(matchFastPath("go back", input())?.action).toEqual({ type: "step_nav", direction: "back" });
  });

  it("'undo' reverses the last part_state change as a new event", () => {
    const aid = currentId();
    const event = { ...builtEvent(aid, "part_cable_tray"), version: 1 } as never;
    const fast = matchFastPath("undo", input({ recentEvents: [event] }));
    expect(fast?.action).toEqual({ type: "mark_state", part_ids: ["part_cable_tray"], new_state: "missing", source: "voice" });
  });

  it("a question is not a command", () => {
    for (const q of ["where does this cable go", "is this the right screw", "what goes here"]) expect(matchFastPath(q, input())).toBeNull();
  });
});

describe("frame annotation", () => {
  it("numbers every visible part and scales the boxes with the image", () => {
    const ctx = fixtureContext();
    const out = annotateFrame(fixtureFrame(), ctx.visible_parts);
    expect(out.width).toBe(1024);
    expect(out.legend).toHaveLength(ctx.visible_parts.length);
    expect(out.legend.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6]);
    // Nearest last, so a small near box stays readable over the big far one behind it.
    expect(out.legend.at(-1)!.part_id).toBe("part_tabletop");
    expect(out.jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // a real JPEG
  });

  it("leaves a small frame alone rather than upscaling it", () => {
    const small = annotateFrame(fixtureFrame(), [], 4000);
    expect(small.width).toBe(1280);
  });

  it("throws on a frame that is not a JPEG, so the caller can send the raw one", () => {
    expect(() => annotateFrame(Buffer.from("not an image"), [])).toThrow();
  });
});

describe("crop", () => {
  it("pads a box by 25% and clamps it to the image", () => {
    expect(padded([100, 100, 200, 200], 1280, 960)).toEqual([50, 50, 300, 300]);
    expect(padded([0, 0, 40, 40], 1280, 960)).toEqual([0, 0, 50, 50]);
  });
  it("cuts the region out and returns a smaller JPEG", () => {
    const out = cropJpeg(fixtureFrame(), [430, 470, 420, 46], { width: 1280, height: 960 });
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(out.length).toBeLessThan(fixtureFrame().length);
  });
});

describe("grounding the answer", () => {
  const chunks: RetrievedChunk[] = [{ chunk_id: "chunk_0042", document_id: "doc_desk_drawings", sheet_id: "sheet_e1", page: 2, title: "E-1 Wiring", text: "route the cable", part_ids: ["part_power_cable"], score: 4 }];
  const draft = (over: Partial<Draft> = {}): Draft => ({ answer_text: " Run it through the tray. ", highlight_parts: ["part_cable_tray"], highlight_style: "path", cited_chunk_ids: ["chunk_0042"], confidence: 0.9, needs_clarification: false, ...over });

  it("keeps known parts and turns cited chunks into source cards", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId()));
    const out = ground(draft(), g, chunks);
    expect(out.answer_text).toBe("Run it through the tray.");
    expect(out.highlight_parts).toEqual(["part_cable_tray"]);
    expect(out.drawing_refs).toEqual([{ document_id: "doc_desk_drawings", sheet_id: "sheet_e1", page: 2, chunk_id: "chunk_0042", title: "E-1 Wiring" }]);
  });

  it("drops an invented part id and lowers confidence for it", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId()));
    const out = ground(draft({ highlight_parts: ["part_cable_tray", "part_imaginary_bracket"] }), g, chunks);
    expect(out.highlight_parts).toEqual(["part_cable_tray"]);
    expect(out.confidence).toBeLessThanOrEqual(0.5);
  });

  it("drops a citation that was never retrieved, so no source card is a lie", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId()));
    expect(ground(draft({ cited_chunk_ids: ["chunk_9999"] }), g, chunks).drawing_refs).toEqual([]);
  });
});

describe("context and prompt", () => {
  it("gathers the pointed part, its material and its step from memory", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId(), { selected_part_id: "part_cable_tray", current_step_id: "step_07" }));
    expect(g.selected?.name).toBe("Cable tray");
    expect(g.material?.material_id).toBe("mat_cable_tray");
    expect(g.step?.step_id).toBe("step_07");
    expect(g.nextStep?.step_id).toBe("step_08");
  });

  it("notices when the headset's state is behind the server's", async () => {
    const aid = currentId();
    await t.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/events`, headers: auth, payload: builtEvent(aid, "part_cable_tray") as object });
    expect(gather(t.app.ctx.store, aid, contextFor(aid, { state_version: 0 })).staleBy).toBeGreaterThan(0);
  });

  it("widens the search query with the pointed part's names", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId(), { selected_part_id: "part_cable_tray" }));
    expect(searchQuery("where does this go", g.selected)).toContain("Cable tray");
  });

  it("the prompt states what is built, names only real chunks and never leaks the raw answer", () => {
    const g = gather(t.app.ctx.store, currentId(), contextFor(currentId(), { selected_part_id: "part_cable_tray" }));
    const text = userText({ transcript: "where does this cable go", gathered: g, legend: [{ n: 1, part_id: "part_cable_tray", state: "missing", in_frame: 1, distance_m: 0.9 }], chunks: [], mode: "overlay", turns: [] });
    expect(text).toContain("POINTED AT: part_cable_tray");
    expect(text).toContain("[1] · part_cable_tray");
    expect(text).toContain("DOCUMENTS: nothing came back from search");
    expect(text).toContain('THEY ASKED: "where does this cable go"');
  });
});

describe("turn log", () => {
  it("matches knowledge/mappings/cutonce-copilot-turns.json field for field", () => {
    const mapping = JSON.parse(readFileSync(join(REPO_ROOT, "knowledge", "mappings", "cutonce-copilot-turns.json"), "utf8"));
    const response = Strict.CopilotResponse.parse(JSON.parse(readFileSync(join(FIXTURES, "copilot_response.json"), "utf8")));
    const doc = Turns.doc({ response, assembly_id: "asm_x", selected_part_id: "part_cable_tray", chunk_ids: ["chunk_0042"], scripted_query_id: null, asked_at: new Date().toISOString() });
    expect(Object.keys(doc).sort()).toEqual(Object.keys(mapping.mappings.properties).sort());
  });
});

describe("routes", () => {
  it("rejects a query whose context is not a CopilotContext", async () => {
    const aid = currentId();
    const body = multipart([
      { name: "context", value: JSON.stringify({ nope: true }) },
      { name: "audio", value: Buffer.from("RIFF"), filename: "a.wav", type: "audio/wav" },
      { name: "frame", value: fixtureFrame(), filename: "f.jpg", type: "image/jpeg" },
    ]);
    const r = await t.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/copilot/query`, ...body });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("bad_request");
  });

  it("says which multipart field is missing", async () => {
    const aid = currentId();
    const body = multipart([{ name: "context", value: JSON.stringify(contextFor(aid)) }]);
    const r = await t.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/copilot/query`, ...body });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toContain("audio");
  });

  it("needs a bearer token like every other /v1 route", async () => {
    const r = await t.app.inject({ method: "POST", url: `/v1/assemblies/${currentId()}/copilot/query` });
    expect(r.statusCode).toBe(401);
  });

  it("404s for audio that was never generated", async () => {
    const r = await t.app.inject({ method: "GET", url: "/v1/audio/turn_nothing_here", headers: auth });
    expect(r.statusCode).toBe(404);
  });

  it("serves the debug page without a token and the capture behind one", async () => {
    expect((await t.app.inject({ method: "GET", url: "/debug" })).statusCode).toBe(200);
    expect((await t.app.inject({ method: "GET", url: "/v1/copilot/debug/last" })).statusCode).toBe(401);
  });

  // G2's server half: a frame and a clip from the headset come back out of the debug endpoints.
  it("stores and serves the last capture", async () => {
    const frame = fixtureFrame();
    const body = multipart([
      { name: "note", value: "from the quest" },
      { name: "frame", value: frame, filename: "f.jpg", type: "image/jpeg" },
      { name: "audio", value: Buffer.from("RIFFtest"), filename: "a.wav", type: "audio/wav" },
    ]);
    const put = await t.app.inject({ method: "POST", url: "/v1/copilot/debug/capture", ...body });
    expect(put.json()).toMatchObject({ frame_bytes: frame.length, audio_bytes: 8, note: "from the quest" });
    const got = await t.app.inject({ method: "GET", url: "/v1/copilot/debug/frame.jpg", headers: auth });
    expect(got.headers["content-type"]).toBe("image/jpeg");
    expect(got.rawPayload.length).toBe(frame.length);
  });

  it("promote_cache reaches the copilot's cache through the director hook", async () => {
    const r = await t.app.inject({ method: "POST", url: "/v1/director/command", headers: auth, payload: { type: "promote_cache", turn_id: "turn_not_in_history", scripted_query_id: "q1" } });
    // The hook is registered (not a 501), and it refuses a turn this session never answered.
    expect(r.statusCode).not.toBe(501);
    expect(r.statusCode).toBe(500);
  });
});

describe("verification", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    verification_id: "ver_test_0001", part_id: "part_cable_tray", claimed_state: "built", state_version: 0,
    bbox_px: [430, 470, 420, 46], in_frame: 0.97,
    camera: { width: 1280, height: 960, fx: 870.1, fy: 870.4, cx: 640.2, cy: 481.7 }, ...over,
  });
  const send = (aid: string, req: object) => t.app.inject({
    method: "POST", url: `/v1/assemblies/${aid}/verify`,
    ...multipart([{ name: "request", value: JSON.stringify(req) }, { name: "frame", value: fixtureFrame(), filename: "f.jpg", type: "image/jpeg" }]),
  });

  it("answers `unsure` when the part is mostly out of frame, without calling a model", async () => {
    const r = await send(currentId(), request({ in_frame: 0.2 }));
    expect(r.json()).toMatchObject({ verdict: "unsure", confidence: 0, part_id: "part_cable_tray" });
    expect(r.json().evidence).toContain("outside the frame");
  });

  it("answers `unsure` when the part is too small to judge", async () => {
    const r = await send(currentId(), request({ bbox_px: [100, 100, 20, 20] }));
    expect(r.json().verdict).toBe("unsure");
  });

  it("answers `unsure` for a part that is not in the plan", async () => {
    const r = await send(currentId(), request({ part_id: "part_not_real" }));
    expect(r.json().evidence).toContain("not in this plan");
  });

  it("an unsure verdict writes no event: the camera never changes what is built", async () => {
    const aid = currentId();
    const before = t.app.ctx.store.getEvents(aid).head;
    await send(aid, request({ in_frame: 0.2 }));
    expect(t.app.ctx.store.getEvents(aid).head).toBe(before);
  });
});

describe("budgets", () => {
  it("default to section 10's numbers and can be overridden per environment", () => {
    const cfg = loadConfig({});
    expect(models(cfg, {}).budgets).toMatchObject({ stt: 3000, retrieve: 800, llm: 6000, hardCap: 9000, verify: 8000 });
    expect(models(cfg, { OPENAI_COPILOT_MODEL: "gpt-5.6-terra", COPILOT_CAP_MS: "5000" })).toMatchObject({ chat: "gpt-5.6-terra" });
    expect(models(cfg, { COPILOT_CAP_MS: "5000" }).budgets.hardCap).toBe(5000);
  });
});
