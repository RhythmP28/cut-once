import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plan } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { readBom } from "../src/ingest/bom.js";

it("every row of the demo parts list maps to its own material, with the plan's quantity", () => {
  const plan = JSON.parse(readFileSync(join(REPO_ROOT, "data/demo/desk.plan.json"), "utf8")) as Plan;
  const { rows } = readBom("doc_desk_bom", readFileSync(join(REPO_ROOT, "data/demo/docs/desk-bom.csv"), "utf8"), plan.materials);
  expect(rows.map((r) => r.material_id)).toEqual(plan.materials.map((m) => m.material_id));
  for (const r of rows) expect(r.qty).toBe(plan.materials.find((m) => m.material_id === r.material_id)!.quantity);
});
