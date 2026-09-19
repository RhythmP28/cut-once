import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, makeApp } from "./helpers.js";

// One second of 22.05 kHz PCM per clip, without ElevenLabs.
vi.mock("../src/copilot/speech.js", () => ({ streamSpeech: vi.fn(async () => (async function* () { yield new Uint8Array(44_100); })()) }));

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { process.env.COPILOT_AUDIO_RETAIN_MS = "100"; t = await makeApp({ copilotMode: "live" }); });
afterEach(async () => { delete process.env.COPILOT_AUDIO_RETAIN_MS; await t.cleanup(); });

describe("answer audio", () => {
  it("leaves memory once it is finished and is then served from the saved file", async () => {
    const turnId = (await t.app.inject({ method: "POST", url: "/v1/copilot/debug/say", headers: auth, payload: { text: "Through the tray." } })).json().turn_id as string;
    expect(t.app.ctx.hooks.audioStream?.(turnId)).not.toBeNull(); // live right after
    await new Promise((r) => setTimeout(r, 300));
    expect(t.app.ctx.hooks.audioStream?.(turnId)).toBeNull();
    const audio = await t.app.inject({ method: "GET", url: `/v1/audio/${turnId}`, headers: auth });
    expect(audio.statusCode).toBe(200);
    expect(audio.rawPayload.length).toBe(44_100);
  });
});
