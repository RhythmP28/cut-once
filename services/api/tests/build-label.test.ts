import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT, loadConfig } from "../src/config.js";
import { loadVocab } from "../src/build/data.js";
import type { Twin } from "@cutonce/schemas";
import { MAX_MARKS, applyLabels, labelBySize, labelTwins, nameTwins, type LabelResult } from "../src/build/label.js";
import { buildTwins, decodeScan } from "../src/build/twins.js";
import { CAMERA, FLOOR, TABLE, box, can, synthScan } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT);
const cloud = decodeScan(synthScan([FLOOR, TABLE, box(-0.2, 0.55, 0.13, 0.157, 0.066), can(0.15, 0.5)], CAMERA.cam, CAMERA.lookAt));
const { surfaces, twins } = buildTwins(cloud, "scan_synthetic");
const item = (n: number, over: Partial<LabelResult["objects"][number]> = {}) =>
  ({ n, is_object: true, name: "tall_can", other_name: null, count: 1, material: "metal" as const, load_bearing: true, cuttable: false, confidence: 0.9, shape: "cylinder" as const, ...over });

describe("applyLabels", () => {
  it("names objects from the vocabulary and splits a lump that is two cans side by side", () => {
    const lump = twins.findIndex((t) => t.shape.type === "box") + 1, single = twins.findIndex((t) => t.shape.type === "cylinder") + 1;
    const out = applyLabels(twins, { objects: [item(lump, { count: 2 }), item(single)], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out.filter((t) => t.name === "tall_can")).toHaveLength(3);
    expect(out.every((t) => t.label === "tall can")).toBe(true);
  });
  it("splits a lump of two cans along the lump, whichever way it lies", () => {
    // Two cans standing one behind the other: a 13.2 × 6.6 cm lump whose long side runs along z (yaw -90).
    const lumpTwin: Twin = { ...twins[0]!, twin_id: "o1", shape: { type: "box", size: [0.132, 0.157, 0.066] }, position: [0, 0.8185, 0.6], yaw_deg: -90 };
    const out = applyLabels([lumpTwin], { objects: [item(1, { count: 2 })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out).toHaveLength(2);
    const at = out.map((t) => [Math.round(t.position[0] * 1000) || 0, Math.round(t.position[2] * 1000) || 0]).sort((a, b) => a[1]! - b[1]!);
    expect(at).toEqual([[0, 567], [0, 633]]);
  });
  it("takes what an object is made of, and whether it holds weight, from the vocabulary when it knows the object", () => {
    const out = applyLabels(twins, { objects: [item(1, { name: "paper_cup", material: "metal", load_bearing: true, cuttable: false })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    const cup = out.find((t) => t.name === "paper_cup")!;
    expect([cup.material, cup.load_bearing, cup.cuttable]).toEqual([vocab.get("paper_cup")!.material, false, vocab.get("paper_cup")!.cuttable]);
  });
  it("drops what is not an object and calls unknown names 'other' with their own label", () => {
    const out = applyLabels(twins, { objects: [item(1, { is_object: false }), item(2, { name: "banana", other_name: "banana" })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out).toHaveLength(1);
    expect([out[0]!.name, out[0]!.label]).toEqual(["other", "banana"]);
  });
  it("adds a missed clear bottle on the table at its standard size", () => {
    // A 60 × 160 px box in the 1024-wide annotated image, standing on the table near the image centre.
    const out = applyLabels(twins, { objects: [], missed: [{ name: "water_bottle", other_name: null, x: 482, y: 250, w: 60, h: 160 }] }, vocab, surfaces, cloud, 1024 / 1280);
    const bottle = out.find((t) => t.name === "water_bottle");
    expect(bottle?.sits_on).toBe(surfaces.find((s) => s.kind === "table")!.surface_id);
    expect(bottle?.shape).toEqual({ type: "cylinder", axis: "y", diameter: 0.065, length: 0.21 });
  });
});

describe("labelTwins", () => {
  it("sends the numbered photo and the plain photo, and applies the answer", async () => {
    const call = vi.fn(async (_cfg: unknown, _req: unknown) => ({ objects: twins.map((_, i) => item(i + 1)), missed: [] }));
    const photo = readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg"));
    const out = await labelTwins({ cfg: loadConfig({}, { openaiKey: "k" }), call, model: "m", vocab, timeoutMs: 1000 }, photo, twins, surfaces, cloud);
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0]![1]).toMatchObject({ name: "build_labels", model: "m" });
    expect((call.mock.calls[0]![1] as { images: unknown[] }).images).toHaveLength(2);
    expect(out.every((t) => t.name === "tall_can")).toBe(true);
  });

  it("tells the model each vocabulary item's size, so the measured size can settle look-alikes", async () => {
    const call = vi.fn(async (_cfg: unknown, _req: unknown) => ({ objects: [], missed: [] }));
    const photo = readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg"));
    await labelTwins({ cfg: loadConfig({}, { openaiKey: "k" }), call, model: "m", vocab, timeoutMs: 1000 }, photo, twins, surfaces, cloud);
    const { system } = call.mock.calls[0]![1] as { system: string };
    expect(system).toContain("tall_can (tall can, 15.7 × 6.6 × 6.6 cm)");
    expect(system).toContain("drink_can (drink can, 12.2 × 6.6 × 6.6 cm)");
    expect(system).toContain("cardboard_box (cardboard box, any size)");
  });

  it("numbers only the nearest 24 objects and keeps the rest, unnamed, for a closer scan", async () => {
    const many = Array.from({ length: 30 }, (_, k) => ({ ...twins[0]!, twin_id: `o${k + 1}`, distance_m: 1 + k * 0.1 }));
    const call = vi.fn(async (_cfg: unknown, _req: unknown) => ({ objects: Array.from({ length: MAX_MARKS }, (_, i) => item(i + 1)), missed: [] }));
    const photo = readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg"));
    const out = await labelTwins({ cfg: loadConfig({}, { openaiKey: "k" }), call, model: "m", vocab, timeoutMs: 1000 }, photo, many, surfaces, cloud);
    const { text } = call.mock.calls[0]![1] as { text: string };
    expect(text).toContain(`#${MAX_MARKS}:`);
    expect(text).not.toContain(`#${MAX_MARKS + 1}:`);
    expect(out).toHaveLength(30);
    expect(out.filter((t) => t.name === "unknown").map((t) => t.twin_id)).toEqual(["o25", "o26", "o27", "o28", "o29", "o30"]);
  });
});

/**
 * No key, no Wi-Fi, or the vision call timed out: the kit's objects still have sizes that give them away, and the
 * rule designs need names, not pixels. This keeps build mode alive with no network at all.
 */
describe("labelBySize: names from sizes alone, when the vision model cannot be asked", () => {
  const measured = (shape: Twin["shape"], over: Partial<Twin> = {}): Twin =>
    ({ ...twins[0]!, twin_id: "o1", name: "unknown", label: "object", confidence: 0, error_m: 0.02, shape, ...over });

  it("names a can, a pizza box and a tape roll from their sizes, and says how sure it is", () => {
    const out = labelBySize([
      measured({ type: "cylinder", axis: "y", diameter: 0.07, length: 0.16 }, { twin_id: "o1" }),
      measured({ type: "box", size: [0.36, 0.045, 0.34] }, { twin_id: "o2" }),
      measured({ type: "box", size: [0.115, 0.05, 0.10] }, { twin_id: "o3" }),          // a roll seen with noise comes out as a box
    ], vocab);
    expect(out.map((t) => t.name)).toEqual(["tall_can", "pizza_box", "tape_roll"]);
    expect(out[0]).toMatchObject({ label: "tall can", material: "metal", load_bearing: true, confidence: 0.6 });
  });
  it("leaves an object alone when two products fit it about as well, or none does", () => {
    const out = labelBySize([
      measured({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.139 }, { twin_id: "o1" }),   // between a drink can (12.2) and a tall can (15.7)
      measured({ type: "box", size: [0.6, 0.4, 0.5] }, { twin_id: "o2" }),
    ], vocab);
    expect(out.map((t) => t.name)).toEqual(["unknown", "unknown"]);
  });
  it("never renames an object that already has a name", () => {
    const [t] = labelBySize([measured({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 }, { name: "other", label: "thermos", confidence: 0.9 })], vocab);
    expect([t!.name, t!.label]).toEqual(["other", "thermos"]);
  });
});

describe("nameTwins: the vision model's names, or names by size when it cannot be asked or fails", () => {
  const photo = readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg"));
  const answer = { objects: twins.map((_, i) => item(i + 1)), missed: [] };
  const deps = (call: ((cfg: unknown, req: unknown) => Promise<unknown>) | null, warn = vi.fn()) =>
    ({ cfg: loadConfig({}, {}), ai: call ? { provider: "omni" as const, model: "m", call } : null, vocab, timeoutMs: 1000, log: { warn } });

  it("asks the vision model when a provider has a key", async () => {
    const out = await nameTwins(deps(vi.fn(async () => answer)), photo, twins, surfaces, cloud);
    expect([out.by, out.twins.every((t) => t.name === "tall_can")]).toEqual(["vision", true]);
  });
  it("names by size when no provider has a key", async () => {
    const out = await nameTwins(deps(null), photo, twins, surfaces, cloud);
    expect(out.by).toBe("size");
  });
  it("names by size when the call fails, and logs why", async () => {
    const warn = vi.fn();
    const out = await nameTwins(deps(vi.fn(async () => { throw new Error("connect ETIMEDOUT"); }), warn), photo, twins, surfaces, cloud);
    expect(out.by).toBe("size");
    expect(warn.mock.calls[0]![0]).toEqual({ err: "connect ETIMEDOUT", provider: "omni" });
  });
});

describe("the shape the model saw", () => {
  const boxy = twins.findIndex((t) => t.shape.type === "box") + 1;
  it("turns an unknown round thing measured as a box into a cylinder as wide as its longer side", () => {
    const out = applyLabels(twins, { objects: [item(boxy, { name: "other", other_name: "thermos", shape: "cylinder" })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    const t = out.find((q) => q.twin_id === twins[boxy - 1]!.twin_id);
    const measured = twins[boxy - 1]!.shape;
    expect(t!.label).toBe("thermos");
    expect(t!.shape).toEqual({ type: "cylinder", axis: "y", diameter: measured.type === "box" ? Math.max(measured.size[0], measured.size[2]) : NaN, length: measured.type === "box" ? measured.size[1] : NaN });
    expect(t!.yaw_deg).toBe(0);
  });
  it("trusts the vocabulary over the model for an object it knows: a pizza box is a box whatever the model says", () => {
    const out = applyLabels(twins, { objects: [item(boxy, { name: "pizza_box", shape: "cylinder" })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out.find((q) => q.twin_id === twins[boxy - 1]!.twin_id)!.shape.type).toBe("box");
  });
});
