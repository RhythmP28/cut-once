import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Twin } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";

/** Shared by the build tests. Kept out of *.test.ts files: importing a test file would register its tests twice. */
export const photoB64 = () => readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg")).toString("base64");

/** A labelled can on the table; override what a test cares about. */
export const twin = (over: Partial<Twin> = {}): Twin => ({
  twin_id: "o1", name: "unknown", label: "object", shape: { type: "cylinder", axis: "y", diameter: 0.06, length: 0.15 },
  position: [0, 0.74 + 0.075, 0.5], yaw_deg: 0, sits_on: "s1", material: "metal", load_bearing: true, cuttable: false,
  confidence: 0.9, error_m: 0.02, points: 30, distance_m: 1.5, bbox_px: [0, 0, 10, 10], snapped: false, scan_ids: ["scan_a"], ...over,
});

export * from "../src/build/synth.js";
