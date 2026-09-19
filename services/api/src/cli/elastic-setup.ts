import "../env.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { mcpCall, mcpListTools, resetMcp } from "../search/mcp.js";
import { renderToolQuery } from "../search/toolQuery.js";
import { REMOTE_NAME, timeout } from "../search/tools.js";

/**
 * pnpm elastic:setup. Creates or updates the ES|QL tools in Agent Builder. Safe to run twice.
 * API (from Elastic's docs): GET/POST {KIBANA}/api/agent_builder/tools, PUT …/tools/{id},
 * headers `Authorization: ApiKey …` and `kbn-xsrf: true`. The key needs feature_agentBuilder.read (and write).
 */
const cfg = loadConfig();
if (!cfg.kibanaUrl || !cfg.esApiKey) { console.error("Set KIBANA_URL and ES_API_KEY first."); process.exit(1); }
const headers = { Authorization: `ApiKey ${cfg.esApiKey}`, "kbn-xsrf": "true", "Content-Type": "application/json" };
const base = `${cfg.kibanaUrl}/api/agent_builder/tools`;
const dir = join(cfg.repoRoot, "knowledge", "agent-builder", "tools");

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const tool = JSON.parse(readFileSync(join(dir, file), "utf8")) as { id: string; type: string; description: string; tags: string[]; configuration: { query: string; params?: object } };
  tool.configuration.query = renderToolQuery(tool.configuration.query, cfg);
  const exists = (await fetch(`${base}/${tool.id}`, { headers })).status === 200;
  const res = exists
    ? await fetch(`${base}/${tool.id}`, { method: "PUT", headers, body: JSON.stringify({ description: tool.description, tags: tool.tags, configuration: tool.configuration }) })
    : await fetch(base, { method: "POST", headers, body: JSON.stringify(tool) });
  console.log(`${res.ok ? (exists ? "updated" : "created") : `FAILED ${res.status}`}  ${tool.id}${res.ok ? "" : `  ${(await res.text()).slice(0, 300)}`}`);
  if (!res.ok) process.exitCode = 1;
}

try {
  const names = await mcpListTools(cfg);
  console.log(`\nMCP endpoint ${cfg.mcpUrl} lists ${names.length} tools.`);
  for (const [ours, remote] of Object.entries(REMOTE_NAME)) console.log(`  ${names.includes(remote) ? "ok     " : "MISSING"} ${remote}  (our ${ours})`);
  console.log("\nMISSING rows fall back to the direct Elasticsearch twin automatically. log_issue is made in the Kibana UI (see knowledge/README.md). If MCP names differ from the ids above, edit REMOTE_NAME in services/api/src/search/tools.ts.");

  // Evidence, not hope: call each tool once through MCP right after creating it. A hung tool must not hang setup.
  const asked = Number(process.env.SMOKE_TIMEOUT_MS); // unset, blank or junk means the default, never 0 ms
  const SMOKE_TIMEOUT_MS = asked > 0 ? asked : 15_000;
  const SMOKE: Record<string, Record<string, unknown>> = {
    cutonce_search_documents: { query: "where does the power cable go" }, cutonce_find_parts: { query: "rear leg" },
    cutonce_lookup_material: { text: "leg" }, cutonce_build_history: { assembly_id: "asm_run_001" },
  };
  console.log(`\nSmoke-testing each tool through MCP (up to ${SMOKE_TIMEOUT_MS} ms each):`);
  for (const [tool, args] of Object.entries(SMOKE)) {
    try {
      const rows = await timeout(mcpCall(cfg, tool, args), SMOKE_TIMEOUT_MS);
      console.log(`  smoke ok    ${tool}: ${Array.isArray(rows) ? rows.length : "?"} rows`);
    }
    catch (err) { console.log(`  smoke FAIL  ${tool}: ${(err as Error).message.slice(0, 160)}`); process.exitCode = 1; }
  }
  console.log("If cutonce_search_documents fails on RERANK, delete the RERANK stage from its JSON file and run this again.");
} catch (err) { console.log(`\nCould not reach MCP at ${cfg.mcpUrl}: ${(err as Error).message}`); process.exitCode = 1; }
resetMcp(); // closes the MCP client and aborts a hung call, so Node exits by itself once stdout is flushed
