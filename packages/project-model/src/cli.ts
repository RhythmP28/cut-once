import { readFileSync } from "node:fs";
import type { BuildEvent, Plan } from "@cutonce/schemas";
import { fold, hasErrors, orderSteps, validatePlan } from "./index.js";

const [cmd, ...args] = process.argv.slice(2);
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));

if (cmd === "validate" && args[0]) {
  const issues = validatePlan(json(args[0]));
  for (const i of issues) console.log(`${i.severity === "error" ? "ERROR" : "warn "} ${i.code} ${i.message}${i.part_ids.length ? `  [${i.part_ids.join(", ")}]` : ""}`);
  console.log(issues.length === 0 ? "ok: no issues" : `${issues.filter((i) => i.severity === "error").length} errors, ${issues.filter((i) => i.severity === "warning").length} warnings`);
  process.exit(hasErrors(issues) ? 1 : 0);
} else if (cmd === "fold" && args[0] && args[1]) {
  const plan = json(args[0]) as Plan;
  const events = readFileSync(args[1], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as BuildEvent);
  const upTo = args.indexOf("--up-to") >= 0 ? Number(args[args.indexOf("--up-to") + 1]) : null;
  console.log(JSON.stringify(fold(plan, events[0]?.assembly_id ?? "asm_cli", events, upTo), null, 2));
} else if (cmd === "steps" && args[0]) {
  for (const s of orderSteps(json(args[0]) as Plan).steps) console.log(`${s.index}. ${s.title}  (${s.part_ids.join(", ")}) requires [${s.requires.join(", ")}]`);
} else {
  console.error("usage: pnpm pm validate <plan.json> | fold <plan.json> <events.jsonl> [--up-to N] | steps <plan.json>");
  process.exit(2);
}
