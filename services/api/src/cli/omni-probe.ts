/**
 * pnpm omni:probe [--audio clip.wav] [--photo frame.jpg] [--check]
 *
 * Does yibuapi's OMNI model (Qwen3.5-Omni) do what Kit needs? Four checks, each timed:
 *   text   a JSON answer to a text prompt
 *   photo  what it sees in a photo (the copilot's fixture frame, or --photo)
 *   voice  what it hears in a voice clip, sent both ways the API may want it (a data URL, and bare base64).
 *   kit    one real Kit turn: the voice clip, the photo and a small table of objects, in Kit's own prompt and schema.
 *          Without --audio the clip is a tone, so only "the call works" is being tested. For real words, ask a
 *          question on the headset with the copilot's debug capture on and pass that audio.wav.
 * A missing key skips every check. --check exits 1 when a check that ran failed.
 */
import "../env.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig, REPO_ROOT } from "../config.js";
import { KIT_SYSTEM, KitTurn, kitContextText } from "../copilot/kit.js";
import { omniJsonCall, type OmniTiming } from "../omni.js";
import { pcmToWav, tone } from "../turns/wav.js";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const cfg = loadConfig();
const results: { check: string; ok: boolean; skipped?: boolean; ms: number; detail: string }[] = [];

async function check(name: string, fn: (timed: (t: OmniTiming) => void) => Promise<string>) {
  const t0 = Date.now();
  let first: number | null = null;
  try {
    const detail = await fn((t) => { first = t.firstTokenMs; });
    results.push({ check: name, ok: true, ms: Date.now() - t0, detail: `${detail}${first !== null ? ` (first text after ${first} ms)` : ""}` });
  } catch (err) { results.push({ check: name, ok: false, ms: Date.now() - t0, detail: (err as Error).message }); }
}

const photoPath = arg("--photo") ?? join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg");
const audioPath = arg("--audio");
const checks = ["text", "photo", "voice (dataurl)", "voice (base64)", "kit"];

console.log(`base URL: ${cfg.omniBaseUrl || "(not set)"}\nmodel:    ${cfg.omniModel}\nOMNI_AUDIO=${cfg.omniAudio}\n`);
if (!cfg.omniKey || !cfg.omniBaseUrl) {
  for (const c of checks) results.push({ check: c, ok: false, skipped: true, ms: 0, detail: "OMNI_API_KEY and OMNI_BASE_URL must both be set in .env.local" });
} else {
  await check("text", async (timed) => {
    const out = await omniJsonCall(cfg, { name: "probe_text", schema: z.object({ hello: z.string(), model: z.string() }), timeoutMs: 30_000,
      system: "You are being tested. Answer briefly.", text: "Say hello, and say which model you are, in the fields \"hello\" and \"model\"." }, timed);
    return JSON.stringify(out);
  });
  await check("photo", async (timed) => {
    if (!existsSync(photoPath)) throw new Error(`no photo at ${photoPath}`);
    const out = await omniJsonCall(cfg, { name: "probe_photo", schema: z.object({ objects: z.array(z.string()) }), timeoutMs: 30_000,
      system: "You describe photos.", text: "List up to 8 objects you can see in this photo, in the field \"objects\".",
      images: [{ data: readFileSync(photoPath), mime: "image/jpeg" }] }, timed);
    return out.objects.join(", ") || "(nothing)";
  });
  const clip = audioPath ? readFileSync(audioPath) : pcmToWav(tone(1.5, 16000), 16000);
  for (const encoding of ["dataurl", "base64"] as const) {
    await check(`voice (${encoding})`, async (timed) => {
      const out = await omniJsonCall({ ...cfg, omniAudio: encoding }, { name: "probe_voice", schema: z.object({ heard: z.string() }), timeoutMs: 30_000,
        system: "You transcribe audio.", text: "Write down exactly what is said in the audio, in the field \"heard\" (an empty string if nothing is said).",
        audio: { data: clip, format: "wav" } }, timed);
      return `heard ${JSON.stringify(out.heard)}${audioPath ? "" : " (a tone: the call working is the point)"}`;
    });
  }
  await check("kit", async (timed) => {
    const table = {
      status: "showing 1 design", surfaces: [], camera: null, wish: null, started: null, tape: true,
      twins: [
        { twin_id: "o1", name: "tall_can", label: "tall can", shape: { type: "cylinder" as const, axis: "y" as const, diameter: 0.066, length: 0.157 }, position: [0.1, 0.82, 0.5] as [number, number, number], yaw_deg: 0, sits_on: null, material: "metal" as const, load_bearing: true, cuttable: false, confidence: 0.9, error_m: 0.003, points: 40, distance_m: 1.2, bbox_px: null, snapped: true, scan_ids: [] },
      ],
      ideas: [{ idea_id: "idea_probe", title: "Can stand", why: "A can, standing.", uses: ["o1"], steps: 1 }],
    };
    const out = KitTurn.parse(await omniJsonCall(cfg, { name: "kit_turn", schema: KitTurn, system: KIT_SYSTEM, text: kitContextText(table, null, null, []), timeoutMs: cfg.kitTurnMs,
      images: existsSync(photoPath) ? [{ data: readFileSync(photoPath), mime: "image/jpeg" }] : [], audio: { data: clip, format: "wav" } }, timed));
    return `intent ${out.intent} (${out.confidence}), heard ${JSON.stringify(out.heard)}, says ${JSON.stringify(out.answer)}; budget ${cfg.kitTurnMs} ms`;
  });
}

console.log(results.map((r) => `${r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(16)} ${String(r.ms).padStart(6)} ms  ${r.detail}`).join("\n"));
const voice = results.filter((r) => r.check.startsWith("voice") && r.ok).map((r) => r.check.slice(7, -1));
if (voice.length === 1) console.log(`\nSet OMNI_AUDIO=${voice[0]} in .env.local: only that encoding worked.`);
if (process.argv.includes("--check") && results.some((r) => !r.ok && !r.skipped)) process.exit(1);
