import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Twin, WsMessage } from "@cutonce/schemas";
import { KIT, CAMERA, photoB64, synthScan } from "./build-synth.js";
import { pickIdea } from "../src/build/session.js";
import { auth, makeApp } from "./helpers.js";

// The two model calls. Labels: name by shape, like the vision model would for the kit. Ideas: none (rules still apply).
vi.mock("../src/build/label.js", async (orig) => ({
  ...(await orig<object>()),
  labelTwins: vi.fn(async (_d: unknown, _p: unknown, twins: Twin[]) => twins.map((t) => t.shape.type === "cylinder"
    ? { ...t, name: "tall_can", label: "tall can", material: "metal", load_bearing: true, confidence: 0.9 }
    : { ...t, name: "pizza_box", label: "pizza box", material: "cardboard", load_bearing: true, cuttable: true, confidence: 0.9 })),
}));
vi.mock("../src/llm.js", async (orig) => ({ ...(await orig<object>()), jsonCall: vi.fn(async () => ({ ideas: [] })) }));

let t: Awaited<ReturnType<typeof makeApp>>;
let seen: WsMessage[];
beforeEach(async () => {
  t = await makeApp({ openaiKey: "test-key" });
  seen = [];
  t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));
});
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); });   // no scan may still be writing when the folder goes

const kitUpload = () => {
  const scan = synthScan(KIT, CAMERA.cam, CAMERA.lookAt);
  return { device_id: "quest", grid: scan.grid, points_mm: scan.points_mm, hit: scan.hit, camera: scan.camera, photo_b64: photoB64() };
};
const post = (url: string, payload: object) => t.app.inject({ method: "POST", url, headers: auth, payload });

describe("a scan of the kit", () => {
  it("streams outlines, then names, then the laptop riser, then the final list", async () => {
    expect((await post("/v1/build/scans", kitUpload())).statusCode).toBe(202);
    await t.app.ctx.hooks.build!.idle();
    const kinds = seen.map((m) => (m.type === "build_inventory" ? `inventory:${m.inventory.labelled}` : m.type === "build_ideas" ? `ideas:${m.final}` : m.type));
    expect(kinds).toEqual(["inventory:false", "inventory:true", "ideas:false", "ideas:true"]);
    const last = seen.at(-1)!;
    expect(last.type === "build_ideas" && last.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    expect(last.type === "build_ideas" && last.message).toMatch(/You could build a laptop riser/);
  });

  it("starts the picked idea as a normal run with the build area already built", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    const { ideas } = (await t.app.inject({ method: "GET", url: "/v1/build/sessions/current", headers: auth })).json();
    const r = await post(`/v1/build/ideas/${ideas[0].idea_id}/start`, {});
    expect(r.statusCode).toBe(200);
    const { assembly_id, plan_id } = r.json();
    expect(plan_id).toBe(ideas[0].plan.plan_id);
    const state = t.app.ctx.store.getState(assembly_id);
    expect([state.progress.built, state.progress.total, state.current_step_id]).toEqual([1, 5, "step_02"]);
  });

  it("starts an idea by name for the copilot", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    expect(await t.app.ctx.hooks.build!.startByName("let's build the laptop riser")).toBe("Laptop riser");
  });

  it("a question about an idea never starts it, and once a build is under way names are not picks until the next scan", async () => {
    const build = t.app.ctx.hooks.build!;
    await post("/v1/build/scans", kitUpload());
    await build.idle();
    const runs = () => t.app.ctx.store.listAssemblies().length;
    const before = runs();
    expect(await build.startByName("how tall is the laptop riser?")).toBeNull();
    expect(await build.startByName("The laptop riser, please.")).toBe("Laptop riser");
    expect(runs()).toBe(before + 1);
    // Mid-build the headset would drop out of build mode if another run appeared, and it shows no new ideas either.
    expect(await build.startByName("laptop riser")).toBeNull();
    expect(await build.rethink("make it taller")).toBe(false);
    expect(runs()).toBe(before + 1);
    // Scanning again puts the headset back to picking, so names are picks again.
    const { session_id } = (await t.app.inject({ method: "GET", url: "/v1/build/sessions/current", headers: auth })).json();
    await post("/v1/build/scans", { ...kitUpload(), session_id });
    await build.idle();
    expect(await build.rethink("make it taller")).toBe(true);
    await build.idle();
    expect(await build.startByName("laptop riser")).toBe("Laptop riser");
  });

  it("replays a saved scan into a new session using its saved labels", async () => {
    const { scan_id } = (await post("/v1/build/scans", kitUpload())).json();
    await t.app.ctx.hooks.build!.idle();
    seen = [];
    const r = await post(`/v1/build/scans/${scan_id}/replay`, { labels: "saved" });
    await t.app.ctx.hooks.build!.idle();
    expect(r.json().session_id).toMatch(/^bsess_/);
    expect(seen.some((m) => m.type === "build_ideas" && m.final && m.ideas.length === 1)).toBe(true);
  });

  it("adds a missed object from the Director", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    const r = await post("/v1/build/objects", { name: "drink_can" });
    expect(r.json()).toMatchObject({ name: "drink_can", snapped: true });
  });
});

describe("pickIdea: which idea a sentence picks", () => {
  const ideas = [{ title: "Laptop riser" }, { title: "Tall laptop riser" }, { title: "Two-tier display stand" }];
  const picked = (said: string) => pickIdea(said, ideas)?.title ?? null;

  it("takes the name alone or with the words people pick with", () => {
    expect(picked("Laptop riser.")).toBe("Laptop riser");
    expect(picked("Let's build the laptop riser, please")).toBe("Laptop riser");
    expect(picked("Can we do the two tier display stand instead?")).toBe("Two-tier display stand");
    expect(picked("I'd like to make the tall laptop riser")).toBe("Tall laptop riser");
  });
  it("leaves questions and remarks about an idea to the copilot", () => {
    expect(picked("How tall is the laptop riser?")).toBeNull();
    expect(picked("Why does the laptop riser have the cans at the front")).toBeNull();
    expect(picked("the laptop riser is wobbly")).toBeNull();
    expect(picked("build the laptop riser not the two tier display stand")).toBeNull();
    expect(picked("build a shelf")).toBeNull();
  });
});
