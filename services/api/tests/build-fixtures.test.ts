import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type { WsMessage } from "@cutonce/schemas";
import { validatePlan } from "@cutonce/project-model";
import { REPO_ROOT, loadConfig } from "../src/config.js";
import { loadVocab } from "../src/build/data.js";
import { SYNTHETIC_KIT, syntheticKitRecording } from "../src/build/fixture.js";
import { Truth, scoreRecording } from "../src/build/score.js";
import { auth, makeApp } from "./helpers.js";

const dir = join(REPO_ROOT, "data", "build", "recordings", SYNTHETIC_KIT);
const file = (name: string) => readFileSync(join(dir, name));

/** The committed recording is what /director replays into the simulator with no headset, and what `pnpm build:eval` measures. */
describe("the synthetic kit recording", () => {
  let t: Awaited<ReturnType<typeof makeApp>> | null = null;
  afterEach(async () => { await t?.app.ctx.hooks.build!.idle(); await t?.cleanup(); t = null; });

  it("is exactly what `pnpm build:fixtures` makes, so it never drifts from the scan builder", async () => {
    const made = await syntheticKitRecording(loadConfig({}, {}), loadVocab(REPO_ROOT));
    expect(JSON.parse(file("scan.json").toString())).toEqual(made.scan);
    expect(JSON.parse(file("labels.json").toString())).toEqual(made.labels);
    expect(JSON.parse(file("truth.json").toString())).toEqual(made.truth);
    const photo = await sharp(file("photo.jpg")).metadata();
    expect([photo.format, photo.width, photo.height]).toEqual(["jpeg", made.scan.camera.intrinsics.width, made.scan.camera.intrinsics.height]);
  });

  it("replays with no key to the laptop riser, a plan that passes the checker, and sizes inside the eval's bars", async () => {
    t = await makeApp({ openaiKey: "" });
    const seen: WsMessage[] = [];
    t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));
    const r = await t.app.inject({ method: "POST", url: `/v1/build/scans/scan_rec_${SYNTHETIC_KIT}/replay`, headers: auth, payload: { labels: "saved" } });
    expect(r.statusCode).toBe(200);
    await t.app.ctx.hooks.build!.idle();

    const final = seen.find((m) => m.type === "build_ideas" && m.final);
    const ideas = final?.type === "build_ideas" ? final.ideas : [];
    expect(ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    expect(validatePlan(ideas[0]!.plan).filter((i) => i.severity === "error")).toEqual([]);

    const inventory = seen.filter((m) => m.type === "build_inventory").at(-1);
    const twins = inventory?.type === "build_inventory" ? inventory.inventory.twins : [];
    const score = scoreRecording(twins, Truth.parse(JSON.parse(file("truth.json").toString())));
    expect([score.found, score.truth, score.labelsRight, score.labelled]).toEqual([4, 4, 4, 4]);
    expect(Math.max(...score.sizeErrCm)).toBeLessThanOrEqual(2);
  });
});
