import "../env.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, REPO_ROOT } from "../config.js";
import { loadRules, loadVocab } from "../build/data.js";
import { BuildFiles } from "../build/files.js";
import { computeIdeas } from "../build/ideas.js";
import { nameTwins } from "../build/label.js";
import { Truth, scoreRecording } from "../build/score.js";
import { fixSizes } from "../build/sizes.js";
import { buildTwins, decodeScan } from "../build/twins.js";
import { models } from "../copilot/models.js";
import { ROUTE_MIN, routeTurn } from "../copilot/router.js";
import { jsonCall } from "../llm.js";

/**
 * pnpm build:eval [--live] [--router] [--check]
 *   (no flag)  every recording in data/build/recordings that has a truth.json, named by its saved labels: no key, no network.
 *   --live     name with the vision model and ask the ideas model too (needs OPENAI_API_KEY).
 *   --router   the router test set (needs OPENAI_API_KEY): how often it is right, and how long it takes against its budget.
 *   --check    exit 1 when a bar is missed: found 90%, labels 90%, size p90 2 cm, router 97%.
 */
const args = new Set(process.argv.slice(2));
const cfg = loadConfig();
const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab), files = new BuildFiles(cfg.dataDir, REPO_ROOT);
const log = { warn: (o: object, m: string) => console.warn(`  ! ${m}`, o) };
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const q = (v: number[], p: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))]! : NaN);
let bad = false;

if (args.has("--router")) {
  if (!cfg.openaiKey) console.log("router: skipped (OPENAI_API_KEY is not set)");
  else {
    const set = JSON.parse(readFileSync(join(REPO_ROOT, "data", "build", "router-eval.json"), "utf8")) as { said: string; mode: string; ideas: string[]; expect: string }[];
    const real = models(cfg);
    const patient = { ...real, budgets: { ...real.budgets, route: 5000 } };   // judgement first; the clock is reported beside it
    const ms: number[] = [];
    let right = 0, rightInTime = 0;
    for (const c of set) {
      const t0 = Date.now();
      const r = await routeTurn(cfg, patient, { transcript: c.said, mode: c.mode, ideaTitles: c.ideas });
      const took = Date.now() - t0;
      ms.push(took);
      const got = r && r.confidence >= ROUTE_MIN ? r.flow : "question";
      // Live, an answer later than the budget is dropped and the turn is answered as a question.
      const live = took > real.budgets.route ? "question" : got;
      if (got === c.expect) right++; else console.log(`  ✗ "${c.said}" → ${got} (${r?.confidence ?? "–"}), expected ${c.expect}`);
      if (live === c.expect) rightInTime++; else if (got === c.expect) console.log(`  ⏱ "${c.said}" was right, but took ${took} ms: live it is a question`);
    }
    console.log(`router (${real.router}): ${right}/${set.length} = ${pct(right, set.length)} right; within its ${real.budgets.route} ms: ${rightInTime}/${set.length} = ${pct(rightInTime, set.length)} (bar 97%); median ${q(ms, 0.5)} ms, p90 ${q(ms, 0.9)} ms`);
    if (rightInTime / set.length < 0.97) bad = true;
  }
}

const dir = files.recordingsDir;
const recs = existsSync(dir) ? readdirSync(dir).filter((d) => /^[a-z0-9_]+$/.test(d) && existsSync(join(dir, d, "truth.json"))) : [];
const all = { found: 0, truth: 0, labelsRight: 0, labelled: 0, sizeErrCm: [] as number[] };
if (args.has("--live") && !cfg.openaiKey) console.log("--live needs OPENAI_API_KEY: naming by size and offering rule designs only");
for (const name of recs) {
  const truth = Truth.parse(JSON.parse(readFileSync(join(dir, name, "truth.json"), "utf8")));
  const { scan, photo } = files.readScan(`scan_rec_${name}`);
  const t0 = Date.now(), cloud = decodeScan(scan), built = buildTwins(cloud, scan.scan_id), msTwins = Date.now() - t0;
  const saved = args.has("--live") ? null : files.readLabels(scan.scan_id);
  const named = saved ? { twins: saved, by: "saved labels" }
    : await nameTwins({ cfg, call: jsonCall, model: process.env.OPENAI_LABEL_MODEL || cfg.openaiModel, vocab, timeoutMs: 20_000, log }, photo, built.twins, built.surfaces, cloud);
  const twins = fixSizes(named.twins, vocab);
  const ideas = await computeIdeas(
    { cfg: args.has("--live") ? cfg : { ...cfg, openaiKey: "" }, vocab, rules, call: jsonCall, model: process.env.OPENAI_IDEAS_MODEL || cfg.openaiModel,
      cacheDir: join(files.root, "idea-cache"), timeoutMs: 20_000, log },
    { sessionId: "bsess_eval", twins, surfaces: built.surfaces, camera: scan.camera.position, photo, request: null }, () => {});
  const s = scoreRecording(twins, truth);
  console.log(`${name} (${named.by}): found ${s.found}/${s.truth} (${pct(s.found, s.truth)}), labels ${pct(s.labelsRight, s.labelled)}, size err median ${q(s.sizeErrCm, 0.5)} cm p90 ${q(s.sizeErrCm, 0.9)} cm, ideas ${ideas.length} [${ideas.map((i) => i.title).join(", ")}], twins ${msTwins} ms`);
  all.found += s.found; all.truth += s.truth; all.labelsRight += s.labelsRight; all.labelled += s.labelled; all.sizeErrCm.push(...s.sizeErrCm);
}
if (recs.length) {
  console.log(`ALL: found ${pct(all.found, all.truth)} (bar 90%), labels ${pct(all.labelsRight, all.labelled)} (bar 90%), size p90 ${q(all.sizeErrCm, 0.9)} cm (bar 2 cm)`);
  if (all.found / Math.max(1, all.truth) < 0.9 || all.labelsRight / Math.max(1, all.labelled) < 0.9 || q(all.sizeErrCm, 0.9) > 2) bad = true;
} else console.log(`no recordings with a truth.json in ${dir} yet: record one with pnpm build:record`);
if (args.has("--check") && bad) process.exit(1);
