import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Plan } from "@cutonce/schemas";
import { partAabb } from "@cutonce/project-model";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { draftToPlan } from "../reconstruction/draftToPlan.js";
import { extractPlan } from "../reconstruction/extract.js";

/**
 * pnpm extract:eval <drawing.pdf> [--plan-out <file>]. Runs the real extraction and prints each part's error
 * against the known-good plan. --plan-out also saves the extracted plan (pnpm sim draws and scores it).
 */
const file = process.argv[2];
if (!file || file.startsWith("--")) { console.error("usage: pnpm extract:eval <drawing.pdf> [--plan-out <file>]"); process.exit(2); }
const cfg = loadConfig(process.env, { logLevel: "warn", reconstruction: true });
const app = await buildApp(cfg);
const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const { document } = app.ctx.docs.save({ filename: basename(path), mime: "application/pdf", buffer: readFileSync(path), projectId: cfg.projectId });

const started = Date.now();
const draft = await extractPlan(app.ctx, [document.document_id]);
const { plan, issues } = draftToPlan(draft, { plan_id: "plan_extract_eval", project_id: cfg.projectId, source_document_ids: [document.document_id], extracted_by: cfg.openaiModel });
const outIdx = process.argv.indexOf("--plan-out");
if (outIdx > 0 && process.argv[outIdx + 1]) {
  const out = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[outIdx + 1]!);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(`wrote the extracted plan to ${out}`);
}
const truth = JSON.parse(readFileSync(join(cfg.repoRoot, "data", "demo", "desk.plan.json"), "utf8")) as Plan;
console.log(`${cfg.openaiModel}: ${plan.parts.length} parts in ${((Date.now() - started) / 1000).toFixed(1)} s; known-good plan has ${truth.parts.length}\n`);

const mm = (v: number) => `${(v * 1000).toFixed(0)} mm`;
for (const t of truth.parts) {
  const got = plan.parts.find((p) => p.part_id === t.part_id) ?? plan.parts.find((p) => p.name.toLowerCase() === t.name.toLowerCase());
  if (!got) { console.log(`MISSING  ${t.name}`); continue; }
  const a = partAabb(t), b = partAabb(got);
  const err = a && b ? Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(a.min[i]! - b.min[i]!), Math.abs(a.max[i]! - b.max[i]!)])) : NaN;
  console.log(`${err <= 0.005 ? "OK     " : "OFF    "} ${t.name.padEnd(20)} worst corner error ${mm(err)}`);
}
for (const p of plan.parts.filter((p) => !truth.parts.some((t) => t.name.toLowerCase() === p.name.toLowerCase()))) console.log(`EXTRA    ${p.name}`);
console.log(`\nvalidator: ${issues.filter((i) => i.severity === "error").length} errors, ${issues.filter((i) => i.severity === "warning").length} warnings`);
for (const i of issues) console.log(`  ${i.severity} ${i.code} ${i.message}`);
console.log(`\nassumptions the model declared:\n${plan.provenance.assumptions.map((a) => `  - ${a}`).join("\n") || "  (none)"}`);
await app.close();
