import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsMessage } from "@cutonce/schemas";
import { validatePlan } from "@cutonce/project-model";
import { CAMERA, KIT, photoB64, synthScan } from "./build-synth.js";
import { auth, makeApp } from "./helpers.js";

/**
 * Build mode with no network at all: no OpenAI key (this is also what a dead venue Wi-Fi looks like to the server).
 * Nothing is mocked here. The scan goes through the real twin builder, the size-only labeller, the size fixer, the
 * rule matcher, the solver, the tipping check and the plan checker, and the chosen idea starts as a real run.
 */
let t: Awaited<ReturnType<typeof makeApp>>;
let seen: WsMessage[];
const kitUpload = () => {
  const scan = synthScan(KIT, CAMERA.cam, CAMERA.lookAt, { sigmaFrac: 0.005, seed: 7 });
  return { device_id: "quest", grid: scan.grid, points_mm: scan.points_mm, hit: scan.hit, camera: scan.camera, photo_b64: photoB64() };
};
const post = (url: string, payload: object) => t.app.inject({ method: "POST", url, headers: auth, payload });
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); vi.restoreAllMocks(); });

describe("with no key", () => {
  beforeEach(async () => {
    t = await makeApp({ openaiKey: "" });
    seen = [];
    t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));
  });

  it("names the kit by size, offers the laptop riser, and starts it as a run that passes the plan checker", async () => {
    expect((await post("/v1/build/scans", kitUpload())).statusCode).toBe(202);
    await t.app.ctx.hooks.build!.idle();

    const labelled = seen.find((m) => m.type === "build_inventory" && m.inventory.labelled);
    expect(labelled?.type === "build_inventory" && labelled.inventory.twins.map((q) => q.name).sort()).toEqual(["pizza_box", "tall_can", "tall_can", "tall_can"]);
    expect(labelled?.type === "build_inventory" && labelled.inventory.message).toMatch(/named 4 of 4 objects by their size alone/);

    const final = seen.find((m) => m.type === "build_ideas" && m.final);
    expect(final?.type === "build_ideas" && final.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    const idea = final?.type === "build_ideas" ? final.ideas[0]! : null;
    expect(validatePlan(idea!.plan).filter((i) => i.severity === "error")).toEqual([]);
    // The design stands on the table (its origin is at table height), not on the floor.
    expect(idea!.origin.position[1]).toBeCloseTo(0.74, 1);

    const started = await post(`/v1/build/ideas/${idea!.idea_id}/start`, {});
    expect(started.statusCode).toBe(200);
    const state = t.app.ctx.store.getState(started.json().assembly_id);
    expect([state.progress.built, state.progress.total, state.current_step_id]).toEqual([1, 5, "step_02"]);
  });

  it("answers 404 for a scan or an idea that does not exist, and never lets an id reach a path", async () => {
    expect((await post("/v1/build/scans/scan_nope/replay", { labels: "saved" })).statusCode).toBe(404);
    expect((await post("/v1/build/scans/scan_rec_..%2F..%2Fsecrets/replay", { labels: "saved" })).statusCode).toBe(404);
    expect((await post("/v1/build/ideas/idea_nope/start", {})).statusCode).toBe(404);
  });
});

describe("when the vision model fails (a timeout, a dead network)", () => {
  it("falls back to names by size instead of sinking the scan", async () => {
    // A key is set, but every request dies on the wire: the label call and the ideas call both fail for real.
    const wire = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ETIMEDOUT"));
    t = await makeApp({ openaiKey: "test-key" });
    seen = [];
    t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));

    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    const final = seen.find((m) => m.type === "build_ideas" && m.final);
    expect(wire).toHaveBeenCalled();                                 // the vision model really was tried
    expect(final?.type === "build_ideas" && final.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    const labelled = seen.find((m) => m.type === "build_inventory" && m.inventory.labelled);
    expect(labelled?.type === "build_inventory" && labelled.inventory.message).toMatch(/by their size alone/);
  }, 30_000);
});
