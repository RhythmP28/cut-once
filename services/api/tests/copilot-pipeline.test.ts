import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Strict, type CopilotContext, type WsMessage } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { auth, makeApp } from "./helpers.js";

// The two calls that need a key and a network. Everything between them is the real pipeline.
const transcribe = vi.hoisted(() => vi.fn());
const ask = vi.hoisted(() => vi.fn());
vi.mock("../src/copilot/stt.js", () => ({ transcribe }));
vi.mock("../src/copilot/answer.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ask }));

const FIXTURES = join(REPO_ROOT, "data", "fixtures");
const frame = () => readFileSync(join(FIXTURES, "frame_0001.jpg"));
const baseContext = () => Strict.CopilotContext.parse(JSON.parse(readFileSync(join(FIXTURES, "context_packet.json"), "utf8"))) as CopilotContext;

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => {
  // The real cap is 9 s. Shortening it here keeps the two hard-cap tests honest without making the suite slow.
  process.env.COPILOT_CAP_MS = "1500";
  t = await makeApp({ elevenKey: "", openaiKey: "test-key" });
  transcribe.mockReset();
  ask.mockReset();
});
afterEach(async () => { await t.cleanup(); });

const aid = () => t.app.ctx.store.currentAssembly()!.assembly_id;

function multipart(parts: { name: string; value: string | Buffer; filename?: string; type?: string }[]) {
  const boundary = "----cutoncepipeline";
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

const query = (over: Partial<CopilotContext> = {}) => t.app.inject({
  method: "POST", url: `/v1/assemblies/${aid()}/copilot/query`,
  ...multipart([
    { name: "context", value: JSON.stringify({ ...baseContext(), assembly_id: aid(), ...over }) },
    { name: "audio", value: Buffer.from("RIFFfake"), filename: "a.wav", type: "audio/wav" },
    { name: "frame", value: frame(), filename: "f.jpg", type: "image/jpeg" },
  ]),
});

const draft = (over: object = {}) => ({
  draft: {
    answer_text: "Run it through the cable tray to the right rear leg.", highlight_parts: ["part_cable_tray", "part_right_rear_leg"],
    highlight_style: "path", cited_chunk_ids: [], confidence: 0.9, needs_clarification: false, ...over,
  },
  toolCalls: [],
});

describe("a spoken command", () => {
  it("skips the model, writes the event itself and reports the action", async () => {
    transcribe.mockResolvedValue("done");
    const before = t.app.ctx.store.getState(aid()).parts.part_cable_tray!.state;
    expect(before).toBe("missing");

    const r = await query({ selected_part_id: "part_cable_tray" });
    const body = r.json();

    expect(ask).not.toHaveBeenCalled();
    expect(body.action).toEqual({ type: "mark_state", part_ids: ["part_cable_tray"], new_state: "built", source: "voice" });
    expect(body.highlight_parts).toEqual(["part_cable_tray"]);
    expect(body.timings_ms.fast_path).toBe(1);
    // The server owns the log, so the part is already built by the time the headset hears the answer.
    expect(t.app.ctx.store.getState(aid()).parts.part_cable_tray!.state).toBe("built");
  });

  it("writes an event with source `voice`, so the history shows how it was marked", async () => {
    transcribe.mockResolvedValue("mark the left rear leg built");
    await query();
    const { events } = t.app.ctx.store.getEvents(aid());
    expect(events.at(-1)).toMatchObject({ part_id: "part_left_rear_leg", new_state: "built", source: "voice" });
  });

  it("never double-writes: saying it twice is a no-op the second time", async () => {
    transcribe.mockResolvedValue("mark the left rear leg built");
    await query();
    const head = t.app.ctx.store.getEvents(aid()).head;
    await query();
    expect(t.app.ctx.store.getEvents(aid()).head).toBe(head);
  });
});

describe("a question", () => {
  it("runs the full pipeline, grounds the answer and times every stage", async () => {
    transcribe.mockResolvedValue("where does this cable go");
    ask.mockResolvedValue(draft());

    const body = (await query({ selected_part_id: "part_power_cable" })).json();

    expect(body.transcript).toBe("where does this cable go");
    expect(body.answer_text).toContain("cable tray");
    expect(body.highlight_parts).toEqual(["part_cable_tray", "part_right_rear_leg"]);
    expect(body.highlight_style).toBe("path");
    expect(body.turn_id).toMatch(/^turn_[a-z0-9_]+$/);
    expect(body.audio_url).toBe(`/v1/audio/${body.turn_id}`);
    expect(body.cached).toBe(false);
    expect(Object.keys(body.timings_ms)).toEqual(expect.arrayContaining(["upload", "stt", "retrieve", "annotate", "llm", "total_to_response"]));
  });

  it("sends the model an annotated frame and a raw one, with the legend in the prompt", async () => {
    transcribe.mockResolvedValue("what goes here");
    ask.mockResolvedValue(draft());
    await query();

    const call = ask.mock.calls[0]![2] as { frames: { annotated: Buffer | null; raw: Buffer }; legend: { part_id: string }[] };
    expect(call.frames.annotated).toBeInstanceOf(Buffer);
    expect(call.frames.raw.length).toBe(frame().length);
    expect(call.legend.map((l) => l.part_id)).toContain("part_cable_tray");
  });

  it("puts the turn on the Director page's stream", async () => {
    transcribe.mockResolvedValue("what goes here");
    ask.mockResolvedValue(draft());
    const seen: WsMessage[] = [];
    t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));

    await query();
    const turn = seen.find((m) => m.type === "copilot_turn");
    expect(turn).toBeTruthy();
    expect((turn as { turn: Record<string, unknown> }).turn.answer_text).toContain("cable tray");
  });

  it("keeps the last turns so a follow-up has context", async () => {
    transcribe.mockResolvedValue("where does this cable go");
    ask.mockResolvedValue(draft());
    await query();
    transcribe.mockResolvedValue("and after that");
    await query();

    const second = ask.mock.calls[1]![2] as { turns: { transcript: string }[] };
    expect(second.turns.map((h) => h.transcript)).toEqual(["where does this cable go"]);
  });

  it("drops an invented part id before the headset ever sees it", async () => {
    transcribe.mockResolvedValue("what goes here");
    ask.mockResolvedValue(draft({ highlight_parts: ["part_cable_tray", "part_does_not_exist"] }));
    expect((await query()).json().highlight_parts).toEqual(["part_cable_tray"]);
  });

  it("503s with a readable reason when transcription itself fails", async () => {
    transcribe.mockRejectedValue(new Error("OPENAI_API_KEY is not set"));
    const r = await query();
    expect(r.statusCode).toBe(503);
    expect(r.json().error.message).toContain("OPENAI_API_KEY");
  });
});

describe("the safety net", () => {
  /** Answers one question for real, then promotes it the way the Director page does during rehearsal. */
  async function promote(scriptedQueryId: string) {
    transcribe.mockResolvedValue("where does the power cable run");
    ask.mockResolvedValue(draft());
    const turnId = (await query()).json().turn_id;
    const r = await t.app.inject({ method: "POST", url: "/v1/director/command", headers: auth, payload: { type: "promote_cache", turn_id: turnId, scripted_query_id: scriptedQueryId } });
    expect(r.statusCode).toBe(200);
  }

  it("a HUD query button replays the rehearsed answer without touching the model", async () => {
    await promote("q_cable");
    ask.mockReset();
    transcribe.mockReset();

    const body = (await query({ scripted_query_id: "q_cable" })).json();
    expect(body.cached).toBe(true);
    expect(body.answer_text).toContain("cable tray");
    expect(transcribe).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });

  it("past the hard cap, the same question falls back to its cached answer", async () => {
    await promote("q_cable");
    t.app.ctx.store.bus.removeAllListeners("broadcast");

    transcribe.mockResolvedValue("where does the power cable run");
    ask.mockImplementation(() => new Promise(() => { /* never settles: this is a dead network */ }));

    const body = (await query()).json();
    expect(body.cached).toBe(true);
    expect(body.answer_text).toContain("cable tray");
    expect(body.timings_ms.total_to_response).toBeLessThan(12_000);
  }, 20_000);

  it("with nothing cached, it says so instead of hanging", async () => {
    transcribe.mockResolvedValue("something we never rehearsed");
    ask.mockImplementation(() => new Promise(() => {}));
    const body = (await query()).json();
    expect(body.cached).toBe(false);
    expect(body.timings_ms.capped).toBe(1);
    expect(body.answer_text).toContain("too long");
  }, 20_000);

  it("lists what is in the cache for the Director page", async () => {
    await promote("q_cable");
    const r = await t.app.inject({ method: "GET", url: "/v1/copilot/cache", headers: auth });
    expect(r.json().entries).toMatchObject([{ scripted_query_id: "q_cable", transcript: "where does the power cable run" }]);
  });
});
