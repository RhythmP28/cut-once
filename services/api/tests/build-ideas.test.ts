import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BuildIdea, Surface, Twin } from "@cutonce/schemas";
import { REPO_ROOT, loadConfig } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { computeIdeas, summary } from "../src/build/ideas.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab);
const std = (id: string, name: string, x: number): Twin => {
  const item = vocab.get(name)!;
  return twin({ twin_id: id, name, label: item.label, shape: standardShape(item)!, material: item.material, load_bearing: item.load_bearing, error_m: 0.003, snapped: true, position: [x, 0.8, 0.5] });
};
const pile = [std("o1", "tall_can", 0.1), std("o2", "tall_can", 0.2), std("o3", "tall_can", 0.3), std("o4", "pizza_box", -0.2)];
const table: Surface = { surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1.0], points: 900 };
const aiDraft = { title: "Can tower", why: "One can on another.", tools: [], uses: ["o1"], steps: [{ place: "o1", orientation: "upright" as const, on: [], at_cm: null, next_to: null, side: null, gap_cm: null }] };
const deps = (over: object = {}) => ({
  cfg: loadConfig({}, { openaiKey: "k" }), vocab, rules, model: "m", cacheDir: mkdtempSync(join(tmpdir(), "ideas-")), timeoutMs: 1000,
  log: { warn: () => {} }, call: vi.fn(async (_cfg: unknown, _req: unknown) => ({ ideas: [aiDraft] })), ...over,
});
const input = { sessionId: "bsess_t", twins: pile, surfaces: [table], camera: [0, 1.6, -1] as [number, number, number], photo: null, request: null };

describe("computeIdeas", () => {
  it("sends the rule ideas first, then the final list with the AI's", async () => {
    const emitted: { ideas: BuildIdea[]; final: boolean }[] = [];
    const out = await computeIdeas(deps(), input, (ideas, final) => emitted.push({ ideas, final }));
    expect(emitted.map((e) => e.final)).toEqual([false, true]);
    expect(emitted[0]!.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    expect(out.map((i) => i.title)).toEqual(["Laptop riser", "Can tower"]);
    expect(out[0]!.origin.position[1]).toBeCloseTo(0.74);
    expect(out[0]!.twin_of).toMatchObject({ part_o1: "o1" });
  });

  it("repairs a design that fails a check once, telling the model why", async () => {
    const bad = { ...aiDraft, title: "Rolling can", steps: [{ ...aiDraft.steps[0]!, orientation: "on_side" as const }] };
    const call = vi.fn().mockResolvedValueOnce({ ideas: [bad] }).mockResolvedValueOnce({ ideas: [aiDraft] });
    const out = await computeIdeas(deps({ call }), input, () => {});
    expect(call).toHaveBeenCalledTimes(2);
    expect((call.mock.calls[1]![1] as { text: string }).text).toMatch(/would roll on its side/);
    expect(out.map((i) => i.title)).toContain("Can tower");
  });

  it("reuses the AI's designs for the same pile without calling it again", async () => {
    const d = deps();
    await computeIdeas(d, input, () => {});
    const again = await computeIdeas(d, { ...input, twins: pile.map((t, k) => ({ ...t, twin_id: `o${k + 11}` })) }, () => {});
    expect(d.call).toHaveBeenCalledOnce();
    expect(again.find((i) => i.title === "Can tower")?.twin_of).toMatchObject({ part_o11: "o11" });
  });

  it("never lets a rethink's designs become the plain answer for that pile", async () => {
    const phone = { ...aiDraft, title: "Phone stand" };
    const call = vi.fn().mockResolvedValueOnce({ ideas: [phone] }).mockResolvedValue({ ideas: [aiDraft] });
    const d = deps({ call });
    expect((await computeIdeas(d, { ...input, request: "something for my phone instead" }, () => {})).map((i) => i.title)).toContain("Phone stand");
    // The demo kit is always the same pile, so the same cache key: a plain scan must ask afresh, not replay "for my phone".
    const plain = await computeIdeas(d, input, () => {});
    expect(call).toHaveBeenCalledTimes(2);
    expect(plain.map((i) => i.title)).toEqual(["Laptop riser", "Can tower"]);
  });

  it("keeps the designs that passed when the repair call fails", async () => {
    const bad = { ...aiDraft, title: "Rolling can", steps: [{ ...aiDraft.steps[0]!, orientation: "on_side" as const }] };
    const warn = vi.fn();
    const call = vi.fn().mockResolvedValueOnce({ ideas: [aiDraft, bad] }).mockRejectedValueOnce(new Error("Request timed out."));
    const out = await computeIdeas(deps({ call, log: { warn } }), input, () => {});
    expect(out.map((i) => i.title)).toEqual(["Laptop riser", "Can tower"]);
    expect(warn.mock.calls[0]![1]).toMatch(/repair/);
  });

  it("still offers the AI's designs when they cannot be cached (a full disk)", async () => {
    const notAFolder = join(mkdtempSync(join(tmpdir(), "ideas-")), "file");
    writeFileSync(notAFolder, "x");
    const out = await computeIdeas(deps({ cacheDir: join(notAFolder, "cache") }), input, () => {});
    expect(out.map((i) => i.title)).toEqual(["Laptop riser", "Can tower"]);
  });

  it("offers rule ideas only when there is no key", async () => {
    const d = deps({ cfg: loadConfig({}, { openaiKey: "" }) });
    const out = await computeIdeas(d, input, () => {});
    expect(d.call).not.toHaveBeenCalled();
    expect(out.map((i) => i.source)).toEqual(["rule"]);
  });

  it("puts the design where nothing else stands: an unnamed object beside the pile pushes it to the other side", async () => {
    const d = deps({ cfg: loadConfig({}, { openaiKey: "" }) });
    // A tight pile in the middle of the table, so the design fits on either side of it.
    const tight = [std("o1", "tall_can", -0.08), std("o2", "tall_can", 0), std("o3", "tall_can", 0.08), std("o4", "pizza_box", 0)].map((t) => ({ ...t, position: [t.position[0], t.position[1], 0.6] as [number, number, number] }));
    const [free] = await computeIdeas(d, { ...input, twins: tight }, () => {});
    const [fx, , fz] = free!.origin.position;
    expect(Math.abs(fx)).toBeGreaterThan(0.3);                      // beside the pile, not on it
    // Something the design does not use (not even named yet) stands exactly where the design would have gone.
    const blocker = twin({ twin_id: "o9", name: "unknown", confidence: 0, shape: { type: "box", size: [0.2, 0.1, 0.2] }, position: [fx, 0.79, fz] });
    const [moved] = await computeIdeas(d, { ...input, twins: [...tight, blocker] }, () => {});
    expect(Math.sign(moved!.origin.position[0])).toBe(-Math.sign(fx));
  });

  it("says so, with no ideas, when nothing in view has a name yet", async () => {
    const emitted: { ideas: BuildIdea[]; final: boolean }[] = [];
    const out = await computeIdeas(deps(), { ...input, twins: pile.map((t) => ({ ...t, name: "unknown", confidence: 0 })) }, (ideas, final) => emitted.push({ ideas, final }));
    expect(out).toEqual([]);
    expect(emitted).toEqual([{ ideas: [], final: true }]);
  });
});

describe("summary", () => {
  it("says what it found and what you could build", () =>
    expect(summary(pile, [{ title: "Laptop riser" } as BuildIdea])).toBe("I found three tall cans and a pizza box. You could build a laptop riser."));
});
