import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Twin, WsMessage } from "@cutonce/schemas";
import { KIT, CAMERA, photoB64, synthScan } from "./build-synth.js";
import { BuildFiles } from "../src/build/files.js";
import { jsonCall } from "../src/llm.js";
import { pickIdea } from "../src/build/session.js";
import { auth, makeApp } from "./helpers.js";

// The two model calls. Labels: name by shape, like the vision model would for the kit. Ideas: none (rules still apply).
const nameTwins = vi.hoisted(() => vi.fn());
vi.mock("../src/build/label.js", async (orig) => ({ ...(await orig<object>()), nameTwins }));
const byShape = async (_d: unknown, _p: unknown, twins: Twin[]) => ({
  by: "vision" as const,
  twins: twins.map((t) => t.shape.type === "cylinder"
    ? { ...t, name: "tall_can", label: "tall can", material: "metal", load_bearing: true, confidence: 0.9 }
    : { ...t, name: "pizza_box", label: "pizza box", material: "cardboard", load_bearing: true, cuttable: true, confidence: 0.9 }),
});
vi.mock("../src/llm.js", async (orig) => ({ ...(await orig<object>()), jsonCall: vi.fn(async () => ({ ideas: [] })) }));

let t: Awaited<ReturnType<typeof makeApp>>;
let seen: WsMessage[];
beforeEach(async () => {
  nameTwins.mockReset(); nameTwins.mockImplementation(byShape);
  t = await makeApp({ openaiKey: "test-key" });
  seen = [];
  t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));
});
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); vi.restoreAllMocks(); });   // no scan may still be writing when the folder goes

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
    expect(kinds).toEqual(["inventory:false", "inventory:true", "ideas:true"]);
    const last = seen.at(-1)!;
    expect(nameTwins).toHaveBeenCalledOnce();
    const named = seen.find((m) => m.type === "build_inventory" && m.inventory.labelled);
    // Named by the (stand-in) vision model, so no "by size" note: just what it sees and what it is doing.
    expect(named?.type === "build_inventory" && named.inventory.message).toBe("I see three tall cans and a pizza box. Working out what they could become…");
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

  it("goes quiet for a session that has been replaced: its late names and ideas would pull the headset back to it", async () => {
    let release = () => {};
    nameTwins.mockImplementationOnce(async (d: unknown, ph: unknown, twins: Twin[]) => { await new Promise<void>((r) => { release = r; }); return byShape(d, ph, twins); });
    const { session_id: old } = (await post("/v1/build/scans", kitUpload())).json();
    await vi.waitFor(() => expect(nameTwins).toHaveBeenCalled());
    const fresh = (await post("/v1/build/sessions", {})).json().session_id;          // the Director's "New session" while names are on their way
    seen = [];
    release();
    await t.app.ctx.hooks.build!.idle();
    expect(fresh).not.toBe(old);
    expect(seen.filter((m) => m.type === "build_inventory" || m.type === "build_ideas")).toEqual([]);
  });

  it("does not lose a scan's names and ideas when its labels cannot be saved (a full disk)", async () => {
    const save = vi.spyOn(BuildFiles.prototype, "saveLabels").mockImplementation(() => { throw new Error("ENOSPC: no space left on device"); });
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    expect(save).toHaveBeenCalled();
    const last = seen.at(-1)!;
    expect(last.type === "build_ideas" && last.final && last.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
  });

  it("says in a few words when a scan cannot be read, not in a page of JSON", async () => {
    const { scan_id } = (await post("/v1/build/scans", kitUpload())).json();
    await t.app.ctx.hooks.build!.idle();
    // Saved labels from before sides were floored at 5 mm: a zero side, which the Twin schema refuses.
    const file = join(t.dataDir, "build", "scans", scan_id, "labels.json");
    const twins = JSON.parse(readFileSync(file, "utf8")) as { shape: { size?: number[] } }[];
    twins.find((q) => q.shape.size)!.shape.size![2] = 0;
    writeFileSync(file, JSON.stringify(twins));
    seen = [];
    await post(`/v1/build/scans/${scan_id}/replay`, { labels: "saved" });
    await t.app.ctx.hooks.build!.idle();
    const said = seen.flatMap((m) => (m.type === "build_inventory" && m.inventory.message ? [m.inventory.message] : []));
    expect(said).toEqual(["I couldn't read that scan: its saved data is not in the form I expect."]);
  });

  it("lists the vocabulary, and says which objects have a standard size: only those can be added by hand", async () => {
    const { items } = (await t.app.inject({ method: "GET", url: "/v1/build/vocabulary", headers: auth })).json() as { items: { name: string; label: string; standard: boolean }[] };
    expect(items.find((i) => i.name === "tall_can")).toEqual({ name: "tall_can", label: "tall can", standard: true });
    expect(items.find((i) => i.name === "cardboard_box")?.standard).toBe(false);
    for (const i of items) expect([i.name, (await post("/v1/build/objects", { name: i.name })).statusCode]).toEqual([i.name, i.standard ? 200 : 400]);
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

describe("the wish", () => {
  const asked = () => vi.mocked(jsonCall).mock.calls.map((c) => (c[1] as { text: string }).text);
  const current = async () => (await t.app.inject({ method: "GET", url: "/v1/build/sessions/current", headers: auth })).json();
  beforeEach(() => vi.mocked(jsonCall).mockClear());

  it("said before a scan reaches that scan's designs, stays through another view (X), and a plain ask clears it", async () => {
    const build = t.app.ctx.hooks.build!;
    build.expectScan("a birdhouse");
    const { session_id } = (await post("/v1/build/scans", kitUpload())).json();
    await build.idle();
    expect(asked().at(-1)).toContain('The builder asked: "a birdhouse"');
    expect((await current()).wish).toBe("a birdhouse");

    await post("/v1/build/scans", { ...kitUpload(), session_id });           // X: another view, nothing said
    await build.idle();
    expect(asked().at(-1)).toContain('The builder asked: "a birdhouse"');

    build.expectScan(null);                                                   // "what can I build?"
    await post("/v1/build/scans", { ...kitUpload(), session_id });
    await build.idle();
    expect(asked().at(-1)).not.toContain("The builder asked");
    expect((await current()).wish).toBeNull();
  });

  it("is dropped when no scan follows within a minute: it belongs to that question, not a later one", async () => {
    const build = t.app.ctx.hooks.build!;
    build.expectScan("a robot");
    const later = Date.now() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    await post("/v1/build/scans", kitUpload());
    await build.idle();
    vi.mocked(Date.now).mockRestore();
    expect(asked().at(-1)).not.toContain("a robot");
  });

  it("said while the scan is still being named reaches that scan's designs", async () => {
    let release = () => {};
    nameTwins.mockImplementationOnce(async (d: unknown, ph: unknown, twins: Twin[]) => { await new Promise<void>((r) => { release = r; }); return byShape(d, ph, twins); });
    await post("/v1/build/scans", kitUpload());
    await vi.waitFor(() => expect(nameTwins).toHaveBeenCalled());
    t.app.ctx.hooks.build!.expectScan("a robot");
    release();
    await t.app.ctx.hooks.build!.idle();
    expect(asked().at(-1)).toContain('The builder asked: "a robot"');
  });

  it("is replaced by a rethink's request, and tidied (spaces, trailing punctuation)", async () => {
    const build = t.app.ctx.hooks.build!;
    await post("/v1/build/scans", kitUpload());
    await build.idle();
    expect(await build.rethink("  something   for my phone!! ")).toBe(true);
    await build.idle();
    expect((await current()).wish).toBe("something for my phone");
    expect(asked().at(-1)).toContain('The builder asked: "something for my phone"');
  });
});
