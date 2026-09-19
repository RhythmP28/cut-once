import { afterEach, describe, expect, it } from "vitest";
import { Strict } from "@cutonce/schemas";
import { wavToPcm } from "../src/turns/wav.js";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => { await t?.cleanup(); t = undefined; });
const fake = async () => (t = await makeApp({ copilotMode: "fake", fakeCopilotDelayMs: 0 }));

function form(context: unknown) {
  const b = "----cutonce" + Math.random().toString(16).slice(2);
  const file = (name: string, bytes: Buffer) => [Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from("\r\n")];
  const payload = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="context"\r\n\r\n${typeof context === "string" ? context : JSON.stringify(context)}\r\n`),
    ...file("audio", Buffer.from("RIFF")), ...file("frame", Buffer.from([0xff, 0xd8])), Buffer.from(`--${b}--\r\n`),
  ]);
  return { payload, headers: { ...auth, "content-type": `multipart/form-data; boundary=${b}` } };
}
const packet = (aid: string, over: Record<string, unknown> = {}) => ({
  context_id: "ctx_test_1", assembly_id: aid, plan_revision: 1, state_version: 3, mode: "overlay",
  selected_part_id: "part_left_rear_leg", selection_source: "controller_ray", current_step_id: "step_04",
  visible_parts: [], camera: null, scripted_query_id: null, client_sent_at: new Date().toISOString(), ...over,
});
const ask = (aid: string, context: unknown) => t!.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/copilot/query`, ...form(context) });
const aidOf = () => t!.app.ctx.store.currentAssembly()!.assembly_id;

describe("fake copilot", () => {
  it("is off unless COPILOT_MODE=fake", async () => {
    t = await makeApp();
    expect((await ask(aidOf(), packet(aidOf()))).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: "/health" })).json().copilot).toBe("off");
  });

  it("answers about the selected part with a valid response, a logged turn and playable audio", async () => {
    await fake();
    const r = await ask(aidOf(), packet(aidOf()));
    expect(r.statusCode).toBe(200);
    const body = Strict.CopilotResponse.parse(r.json());
    expect(body.highlight_parts).toEqual(["part_left_rear_leg"]);
    expect(body.answer_text).toMatch(/Left rear leg/);
    expect(body.drawing_refs.length).toBeGreaterThan(0);
    expect(body.audio_url).toBe(`/v1/audio/${body.turn_id}`);
    const pcm = await t!.app.inject({ method: "GET", url: body.audio_url!, headers: auth });
    expect(pcm.headers["content-type"]).toMatch(/^audio\/L16; rate=22050/);
    expect(pcm.rawPayload.length).toBeGreaterThanOrEqual(22050 * 2);
    const wav = await t!.app.inject({ method: "GET", url: `${body.audio_url}?format=wav`, headers: auth });
    expect(wavToPcm(wav.rawPayload).pcm.length).toBe(pcm.rawPayload.length);
    const turns = (await t!.app.inject({ method: "GET", url: "/v1/copilot/turns", headers: auth })).json().turns;
    expect(turns[0].turn_id).toBe(body.turn_id);
    expect((await t!.app.inject({ method: "GET", url: "/health" })).json().copilot).toBe("fake");
  });

  it("draws cables as a path and asks for a selection when there is none", async () => {
    await fake();
    expect((await ask(aidOf(), packet(aidOf(), { selected_part_id: "part_power_cable" }))).json().highlight_style).toBe("path");
    const none = (await ask(aidOf(), packet(aidOf(), { selected_part_id: null, selection_source: "none" }))).json();
    expect(none).toMatchObject({ needs_clarification: true, highlight_parts: [] });
  });

  it("returns an action for fake_done and a 500 for fake_error", async () => {
    await fake();
    expect((await ask(aidOf(), packet(aidOf(), { scripted_query_id: "fake_done" }))).json().action)
      .toEqual({ type: "mark_state", part_ids: ["part_left_rear_leg"], new_state: "built", source: "voice" });
    const err = await ask(aidOf(), packet(aidOf(), { scripted_query_id: "fake_error" }));
    expect([err.statusCode, err.json().error.code]).toEqual([500, "fake_error"]);
  });

  it("rejects bad packets clearly", async () => {
    await fake();
    expect((await ask(aidOf(), "{not json")).statusCode).toBe(400);
    const bad = await ask(aidOf(), { ...packet(aidOf()), assembly_id: undefined });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details).toBeDefined();
    expect((await ask(aidOf(), packet("asm_someone_else"))).statusCode).toBe(400);
    expect((await ask("asm_nope", packet("asm_nope"))).statusCode).toBe(404);
    expect((await t!.app.inject({ method: "GET", url: "/v1/audio/turn_BAD", headers: auth })).statusCode).toBe(400);
    expect((await t!.app.inject({ method: "GET", url: "/v1/audio/turn_missing", headers: auth })).statusCode).toBe(404);
  });
});
