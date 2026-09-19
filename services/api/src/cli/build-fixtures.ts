/**
 * Generates build mode's fixture: a synthetic recording of the demo kit (a pizza box and three tall cans on a table).
 * With it the whole flow (outlines, names, the laptop riser, the fly-together, the walkthrough) can be replayed from
 * /director into the Unity simulator with no headset in the room, and `pnpm build:eval` has something to measure.
 * It is a drawing of a made-up scene, so it is safe in the public repo. Real recordings come from `pnpm build:record`.
 *
 *   pnpm build:fixtures
 */
import "../env.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, REPO_ROOT } from "../config.js";
import { loadVocab } from "../build/data.js";
import { BuildFiles } from "../build/files.js";
import { SYNTHETIC_KIT, syntheticKitRecording } from "../build/fixture.js";
import { ensureDir } from "../store/fs.js";

const cfg = loadConfig();
const out = join(new BuildFiles(cfg.dataDir, REPO_ROOT).recordingsDir, SYNTHETIC_KIT);
const { scan, photo, labels, truth } = await syntheticKitRecording(cfg, loadVocab(REPO_ROOT));
ensureDir(out);
writeFileSync(join(out, "scan.json"), JSON.stringify(scan) + "\n");
writeFileSync(join(out, "photo.jpg"), photo);
writeFileSync(join(out, "labels.json"), JSON.stringify(labels, null, 2) + "\n");
writeFileSync(join(out, "truth.json"), JSON.stringify(truth, null, 2) + "\n");
console.log(`wrote ${out}: ${labels.length} objects (${labels.map((t) => t.name).join(", ")})`);
