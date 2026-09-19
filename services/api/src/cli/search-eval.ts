import "../env.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { retrieve } from "../search/retrieve.js";

/** pnpm search:eval [--mode bm25|hybrid|both]. Pass mark: an expected passage in the top 3 for 8 of 10 golden questions. */
interface Golden { id: string; question: string; part_id: string | null; expected_chunk_ids: string[] }
const base = loadConfig();
const arg = process.argv[process.argv.indexOf("--mode") + 1];
const modes = (arg === "both" ? ["bm25", "hybrid"] : [arg === "hybrid" ? "hybrid" : arg === "bm25" ? "bm25" : base.searchMode]) as ("bm25" | "hybrid")[];
const golden = JSON.parse(readFileSync(join(base.repoRoot, "data", "demo", "golden_questions.json"), "utf8")) as Golden[];

for (const mode of modes) {
  let pass = 0;
  console.log(`\n== ${mode} ==`);
  for (const g of golden) {
    const hits = await retrieve({ ...base, searchMode: mode }, { query: g.question, projectId: base.projectId, partId: g.part_id, k: 3 }, console);
    const rank = hits.findIndex((h) => g.expected_chunk_ids.includes(h.chunk_id));
    if (rank >= 0) pass++;
    console.log(`${rank >= 0 ? "PASS" : "MISS"} ${g.id.padEnd(4)} rank ${rank >= 0 ? rank + 1 : "-"}  ${g.question}  -> ${hits.map((h) => h.chunk_id).join(", ") || "(nothing)"}`);
  }
  console.log(`${mode}: ${pass} / ${golden.length} in the top 3 ${pass >= Math.ceil(golden.length * 0.8) ? "(pass)" : "(BELOW the 80% mark: fix aliases and chunking first)"}`);
}
