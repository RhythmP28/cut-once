import { describe, expect, it } from "vitest";
import type { Surface } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { loadVocab, standardShape } from "../src/build/data.js";
import { appendTwin, mergeSurfaces, mergeTwins } from "../src/build/merge.js";
import { dimsCm, heightOf } from "../src/build/shape.js";
import { fixSizes } from "../src/build/sizes.js";
import { buildTwins, decodeScan } from "../src/build/twins.js";
import { FLOOR, can, synthScan, turned, twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT);
const table = (over: Partial<Surface> = {}): Surface => ({ surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1], points: 900, ...over });

describe("fixSizes", () => {
  it("snaps a can measured a little small to the standard size, keeping its base on the table", () => {
    const [t] = fixSizes([twin({ name: "tall_can" })], vocab);
    expect(t!.snapped).toBe(true);
    expect(t!.shape).toEqual({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 });
    expect(t!.position[1]).toBeCloseTo(0.74 + 0.0785, 4);
  });
  it("snaps a lump measured as a box when the label says can", () => {
    const [t] = fixSizes([twin({ name: "tall_can", shape: { type: "box", size: [0.07, 0.16, 0.065] } })], vocab);
    expect(t!.shape.type).toBe("cylinder");
  });
  it("keeps a well-measured object that is far from the standard size", () => {
    const [t] = fixSizes([twin({ name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.066, length: 0.30 }, points: 80 })], vocab);
    expect(t!.snapped).toBe(false);
  });
  it("gives a lying pizza box its standard size with the thin side up", () => {
    const [t] = fixSizes([twin({ name: "pizza_box", shape: { type: "box", size: [0.33, 0.045, 0.34] }, position: [0, 0.7625, 0.5] })], vocab);
    expect(t!.shape).toEqual({ type: "box", size: [0.35, 0.04, 0.35] });
  });
  it("makes identical unsized objects share the median size", () => {
    const boxes = [0.19, 0.2, 0.21].map((w, k) => twin({ twin_id: `o${k + 1}`, name: "cardboard_box", shape: { type: "box", size: [0.3, 0.12, w] } }));
    const out = fixSizes(boxes, vocab);
    expect(out.map((t) => (t.shape.type === "box" ? t.shape.size[2] : 0))).toEqual([0.2, 0.2, 0.2]);
  });
});

describe("merging scans", () => {
  it("keeps one twin for the same object seen twice, and adds new ones with new ids", () => {
    const first = mergeTwins([], [twin(), twin({ position: [0.3, 0.815, 0.5] })]);
    expect(first.map((t) => t.twin_id)).toEqual(["o1", "o2"]);
    const second = mergeTwins(first, [twin({ position: [0.005, 0.815, 0.502], points: 60, scan_ids: ["scan_b"] }), twin({ position: [-0.4, 0.815, 0.6] })]);
    expect(second.map((t) => t.twin_id)).toEqual(["o1", "o2", "o3"]);
    expect(second[0]!.scan_ids).toEqual(["scan_a", "scan_b"]);
    expect(second[0]!.points).toBe(60);
  });
  it("keeps the surer name", () => {
    const merged = mergeTwins([twin({ name: "tall_can", label: "tall can", confidence: 0.9 })], [twin({ name: "other", confidence: 0.4 })]);
    expect(merged[0]!.name).toBe("tall_can");
  });
  it("maps a surface seen again onto the same id", () => {
    const { surfaces, idMap } = mergeSurfaces([table()], [table({ surface_id: "s1", min: [-0.8, 0.1], max: [0.5, 1.1] }), table({ surface_id: "s2", kind: "floor", y: 0 })]);
    expect(surfaces.map((s) => s.surface_id)).toEqual(["s1", "s2"]);
    expect(surfaces[0]!.min).toEqual([-0.8, 0.1]);
    expect(idMap.get("s2")).toBe("s2");
  });
  it("keeps two tables of the same height apart: a design must not be sited in the aisle between them", () => {
    const left = table({ surface_id: "s1", min: [-1.3, 0.2], max: [-0.15, 1.0] }), right = table({ surface_id: "s2", min: [0.15, 0.2], max: [1.3, 1.0] });
    const { surfaces } = mergeSurfaces([], [left, right]);
    expect(surfaces).toHaveLength(2);
    expect(mergeSurfaces(surfaces, [table({ surface_id: "s1", min: [-1.2, 0.25], max: [-0.1, 1.05] })]).surfaces).toHaveLength(2);   // the left one seen again
  });
  it("takes the shape and its error from the same look, and prefers the look that measured better", () => {
    const whole = twin({ twin_id: "o1", name: "cardboard_box", shape: { type: "box", size: [0.35, 0.2, 0.35] }, points: 150, error_m: 0.04 });
    // A closer look cut off by the edge of the photo: more points, half the box, and an error that says so.
    const cut = twin({ twin_id: "o9", name: "cardboard_box", shape: { type: "box", size: [0.35, 0.2, 0.17] }, points: 300, error_m: 0.175 });
    const [merged] = mergeTwins([whole], [cut]);
    expect(merged!.shape).toEqual(whole.shape);
    expect(merged!.error_m).toBe(0.04);
    const [other] = mergeTwins([cut], [whole]);
    expect([other!.shape, other!.error_m]).toEqual([whole.shape, 0.04]);
  });
  it("appends a Director-added object even where another one stands", () => {
    expect(appendTwin([twin()], twin()).map((t) => t.twin_id)).toEqual(["o1", "o2"]);
  });
  it("keeps two cans standing 5 cm apart as two", () => {
    const merged = mergeTwins([twin()], [twin({ position: [0.12, 0.815, 0.5], scan_ids: ["scan_b"] })]);
    expect(merged.map((t) => t.twin_id)).toEqual(["o1", "o2"]);
  });
});

/**
 * FR5, end to end: a scan of the kit with 1% depth noise, each object named as the labeller would name it, then
 * fixSizes. The raw measurements are up to 3 cm out (build-twins.test.ts); after this step every product the
 * vocabulary knows the size of must be exactly that size, still standing on the table, still where it was seen.
 */
describe("FR5: sizes within 2 cm once objects are named", () => {
  const slab = { kind: "box" as const, min: [-0.6, 0.71, 0.2] as [number, number, number], max: [0.6, 0.74, 1.0] as [number, number, number] };
  const kit = [
    { name: "pizza_box", prim: turned(-0.28, 0.55, 0.35, 0.04, 0.35, 20), at: [-0.28, 0.55] },
    { name: "tall_can", prim: can(0.05, 0.45), at: [0.05, 0.45] },
    { name: "tall_can", prim: can(0.17, 0.45), at: [0.17, 0.45] },
    { name: "energy_can", prim: can(0.11, 0.6, 0.0265, 0.135), at: [0.11, 0.6] },
    { name: "tape_roll", prim: can(-0.02, 0.75, 0.055, 0.048), at: [-0.02, 0.75] },
  ];

  for (const seed of [1, 2, 3])
    it(`seed ${seed}`, () => {
      const scan = synthScan([FLOOR, slab, ...kit.map((o) => o.prim)], [0.05, 1.55, -0.35], [0.05, 0.74, 0.55], { sigmaFrac: 0.01, seed });
      const { twins } = buildTwins(decodeScan(scan), "scan_synthetic");
      const named = twins.map((t) => {
        const o = kit.find((q) => Math.hypot(t.position[0] - q.at[0]!, t.position[2] - q.at[1]!) <= 0.03);
        return o ? { ...t, name: o.name, label: vocab.get(o.name)!.label, confidence: 0.9 } : t;
      });
      const fixed = fixSizes(named, vocab);
      expect(fixed.filter((t) => t.name !== "unknown")).toHaveLength(kit.length);
      for (const t of fixed.filter((q) => q.name !== "unknown")) {
        expect(t.snapped, t.name).toBe(true);
        expect(dimsCm(t.shape), t.name).toEqual(dimsCm(standardShape(vocab.get(t.name)!)!));
        expect(t.position[1] - heightOf(t.shape) / 2, `${t.name} stands on the table`).toBeCloseTo(0.74, 2);
        const o = kit.find((q) => q.name === t.name && Math.hypot(t.position[0] - q.at[0]!, t.position[2] - q.at[1]!) <= 0.03);
        expect(o, `${t.name} is where it was seen`).toBeDefined();
      }
    });
});
