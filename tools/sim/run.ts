import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASELINE, CURRENT, OUT, ROOT } from "./paths.js";
import type { RunMeta } from "./types.js";

/**
 * pnpm sim           locally: the last run becomes the baseline, then everything runs and a report is written.
 * pnpm sim --ci      on GitHub: the baseline was already downloaded into sim-out/baseline.
 * Flags: --skip-screens, --skip-scenario.
 */
const args = new Set(process.argv.slice(2));
const ci = args.has("--ci");
const sh = (cmd: string) => execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
const stage = (name: string, cmd: string, needsFile?: string): boolean => {
  if (needsFile && !existsSync(join(ROOT, needsFile))) { console.log(`\n· skip ${name}: ${needsFile} is not built yet`); return true; }
  console.log(`\n▶ ${name}`);
  return spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true }).status === 0;
};

if (!ci) {
  rmSync(BASELINE, { recursive: true, force: true });
  if (existsSync(CURRENT)) renameSync(CURRENT, BASELINE);
}
rmSync(CURRENT, { recursive: true, force: true });
rmSync(join(OUT, "diff"), { recursive: true, force: true });
mkdirSync(CURRENT, { recursive: true });
const meta: RunMeta = { sha: sh("git rev-parse HEAD"), dirty: sh("git status --porcelain") !== "", created_at: new Date().toISOString(), ci };
writeFileSync(join(CURRENT, "meta.json"), JSON.stringify(meta, null, 2));

let ok = true;
// Blueprint reading runs first: the sim server imports its output as plan_desk_extracted.
const drawing = "data/demo/docs/desk-drawings.pdf";
if (process.env.OPENAI_API_KEY && existsSync(join(ROOT, drawing))) {
  // A throwaway data folder: extract:eval saves the drawing as a document, and must never write into the
  // live server's data (DATA_DIR in .env.local). The environment wins over .env.local, so this holds.
  const scratch = mkdtempSync(join(tmpdir(), "cutonce-extract-"));
  const read = stage("blueprint reading", `DATA_DIR=${scratch} pnpm extract:eval ${drawing} --plan-out sim-out/current/extracted.plan.json`);
  rmSync(scratch, { recursive: true, force: true });
  if (!read || !existsSync(join(CURRENT, "extracted.plan.json"))) {
    writeFileSync(join(CURRENT, "extraction-skipped.txt"), "the blueprint reading failed; see the run log");
  }
} else {
  writeFileSync(join(CURRENT, "extraction-skipped.txt"), process.env.OPENAI_API_KEY ? `no ${drawing} yet` : "no OPENAI_API_KEY");
}
if (!args.has("--skip-scenario")) {
  ok = stage("pretend headset", "pnpm -F @cutonce/api exec tsx src/cli/sim-run.ts --out ../../sim-out/current/scenario.json", "services/api/src/cli/sim-run.ts") && ok;
}
if (!args.has("--skip-screens")) {
  ok = stage("web build", "pnpm -F @cutonce/web build") && ok;
  ok = stage("photographs", "pnpm -F @cutonce/sim capture") && ok;
}
const reported = stage("report", "pnpm -F @cutonce/sim exec tsx report.ts");
console.log(`\nreport: ${join(OUT, "report.html")}`);
process.exit(ok && reported ? 0 : 1);
