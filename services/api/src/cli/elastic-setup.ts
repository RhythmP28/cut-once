import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { mcpListTools } from "../search/mcp.js";
import { REMOTE_NAME } from "../search/tools.js";

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
  const tool = JSON.parse(readFileSync(join(dir, file), "utf8")) as { id: string; type: string; description: string; tags: string[]; configuration: object };
  const exists = (await fetch(`${base}/${tool.id}`, { headers })).status === 200;
  const res = exists
    ? await fetch(`${base}/${tool.id}`, { method: "PUT", headers, body: JSON.stringify({ description: tool.description, tags: tool.tags, configuration: tool.configuration }) })
    : await fetch(base, { method: "POST", headers, body: JSON.stringify(tool) });
  console.log(`${res.ok ? (exists ? "updated" : "created") : `FAILED ${res.status}`}  ${tool.id}${res.ok ? "" : `  ${(await res.text()).slice(0, 300)}`}`);
}

try {
  const names = await mcpListTools(cfg);
  console.log(`\nMCP endpoint ${cfg.mcpUrl} lists ${names.length} tools.`);
  for (const [ours, remote] of Object.entries(REMOTE_NAME)) console.log(`  ${names.includes(remote) ? "ok     " : "MISSING"} ${remote}  (our ${ours})`);
  console.log("\nMISSING rows fall back to the direct Elasticsearch twin automatically. search_documents and log_issue are made in the Kibana UI (see knowledge/README.md). If MCP names differ from the ids above, edit REMOTE_NAME in services/api/src/search/tools.ts.");
} catch (err) { console.log(`\nCould not reach MCP at ${cfg.mcpUrl}: ${(err as Error).message}`); }
