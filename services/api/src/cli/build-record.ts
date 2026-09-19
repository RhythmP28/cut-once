import "../env.js";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { S, type BuildScan } from "@cutonce/schemas";
import { loadConfig, REPO_ROOT } from "../config.js";
import { BuildFiles } from "../build/files.js";
import { dimsCm } from "../build/shape.js";

/**
 * pnpm build:record <scan_id> <name>: keeps a live scan as a test recording in data/build/recordings/<name>/.
 * Only record the kit pile with no people in the photo: the repo is public. Then correct truth.json with a tape measure.
 */
const [scanId, name] = process.argv.slice(2);
if (!scanId || !name || !/^[a-z0-9_]+$/.test(name)) { console.error("usage: pnpm build:record <scan_id> <name: lower_snake>"); process.exit(1); }
if (scanId.startsWith("scan_rec_")) { console.error(`${scanId} is already a recording`); process.exit(1); }
const files = new BuildFiles(loadConfig().dataDir, REPO_ROOT);
const { scan } = files.readScan(scanId);
const out = join(files.recordingsDir, name);
mkdirSync(out, { recursive: true });
const rec: BuildScan = S.BuildScan.parse({ ...scan, scan_id: `scan_rec_${name}` });
writeFileSync(join(out, "scan.json"), JSON.stringify(rec) + "\n");
copyFileSync(join(files.scanDir(scanId), "photo.jpg"), join(out, "photo.jpg"));
const labels = files.readLabels(scanId);
if (labels) writeFileSync(join(out, "labels.json"), JSON.stringify(labels, null, 2) + "\n");
if (!existsSync(join(out, "truth.json"))) {
  const truth = { objects: (labels ?? []).filter((t) => t.name !== "unknown" && t.name !== "other").map((t) => ({ name: t.name, size_cm: dimsCm(t.shape) })) };
  writeFileSync(join(out, "truth.json"), JSON.stringify(truth, null, 2) + "\n");
}
console.log(`saved ${out}`);
console.log("1. Open photo.jpg: the repo is public, so commit it only if it shows the kit pile and no people.");
console.log("2. Tape-measure every object and correct truth.json (add anything the scan missed). Then: pnpm build:eval");
