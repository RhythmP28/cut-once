import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { Truth, scoreRecording } from "../src/build/score.js";
import { matchFastPath } from "../src/copilot/fastpath.js";
import { Routed } from "../src/copilot/router.js";
import { twin } from "./build-synth.js";

describe("scoreRecording", () => {
  it("matches twins to the truth by name, closest size first, and reports size errors in cm", () => {
    const twins = [
      twin({ twin_id: "o1", name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 } }),
      twin({ twin_id: "o2", name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.07, length: 0.17 } }),
      twin({ twin_id: "o3", name: "other" }),
    ];
    const s = scoreRecording(twins, { objects: [{ name: "tall_can", size_cm: [15.7, 6.6, 6.6] }, { name: "pizza_box", size_cm: [35, 35, 4] }] });
    expect([s.found, s.truth, s.labelsRight, s.labelled]).toEqual([1, 2, 1, 2]);
    expect(s.sizeErrCm).toEqual([0]);
  });

  it("takes a tape-measured size in any order", () => {
    const box = twin({ twin_id: "o1", name: "pizza_box", shape: { type: "box", size: [0.36, 0.045, 0.34] } });
    expect(scoreRecording([box], { objects: [{ name: "pizza_box", size_cm: [4, 35, 35] }] }).sizeErrCm).toEqual([1]);
  });

  it("refuses a truth file that is not three sizes per object: it is corrected by hand, so it is checked", () => {
    expect(Truth.safeParse({ objects: [{ name: "tall_can", size_cm: [15.7, 6.6] }] }).success).toBe(false);
    expect(Truth.safeParse({ objects: [{ name: "tall_can", size_cm: [15.7, 6.6, 6.6] }] }).success).toBe(true);
  });
});

describe("the router test set", () => {
  const set = JSON.parse(readFileSync(join(REPO_ROOT, "data", "build", "router-eval.json"), "utf8")) as { said: string; mode: string; ideas: string[]; expect: string }[];

  it("is well formed: a known mode and flow for every sentence, and no sentence twice", () => {
    expect(set.length).toBeGreaterThanOrEqual(40);
    for (const c of set) {
      expect(["upload", "overlay", "build"], c.said).toContain(c.mode);
      expect(Routed.shape.flow.options, c.said).toContain(c.expect);
      expect(Array.isArray(c.ideas), c.said).toBe(true);
    }
    expect(new Set(set.map((c) => `${c.mode}|${c.said.toLowerCase()}`)).size).toBe(set.length);
  });

  it("never expects a flow the fast path would overrule: what the regex catches never reaches the router", () => {
    const nothing = { plan: { plan_id: "plan_x", parts: [], steps: [] }, state: { parts: {}, current_step_id: null }, selectedPartId: null, recentEvents: [] };
    for (const c of set) {
      const fast = matchFastPath(c.said, { ...nothing, mode: c.mode } as never);
      if (fast) expect([c.said, fast.action?.type, c.expect]).toEqual([c.said, "start_scan", "build_ideas"]);
    }
  });
});
