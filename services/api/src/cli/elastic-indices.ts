import "../env.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { getEs } from "../search/client.js";

/** pnpm elastic:indices [--recreate]. Creates the six indices from knowledge/mappings. */
const cfg = loadConfig();
const es = getEs(cfg);
if (!es) { console.error("Set ES_URL and ES_API_KEY first (in .env.local)."); process.exit(1); }
const recreate = process.argv.includes("--recreate");
const dir = join(cfg.repoRoot, "knowledge", "mappings");

try {
  const info = await es.info();
  console.log(`connected to ${info.cluster_name}, Elasticsearch ${info.version.number}`);
  if (Number(info.version.number.split(".")[0]) < 9) console.warn("WARNING: Workflows, Agent Builder and the Jina defaults need 9.x (9.4+).");
} catch (err) {
  console.error(`Could not reach ${cfg.esUrl}: ${(err as Error).message}. Check ES_URL (the Elasticsearch endpoint, not Kibana) and the API key.`);
  process.exit(1);
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const index = file.replace(/\.json$/, "");
  const body = JSON.parse(readFileSync(join(dir, file), "utf8")) as { mappings: { properties: Record<string, any> } };
  if (index === "cutonce-docs" && cfg.jinaEmbedId) { // semantic search only when the cluster's Jina endpoint id is known
    body.mappings.properties.text = { type: "text", copy_to: "text_semantic" };
    body.mappings.properties.text_semantic = { type: "semantic_text", inference_id: cfg.jinaEmbedId };
  }
  const exists = await es.indices.exists({ index });
  if (exists && recreate) { await es.indices.delete({ index }); console.log(`deleted ${index}`); }
  if (exists && !recreate) { console.log(`exists  ${index} (use --recreate to rebuild)`); continue; }
  await es.indices.create({ index, ...body });
  console.log(`created ${index}${index === "cutonce-docs" ? (cfg.jinaEmbedId ? ` with semantic_text via ${cfg.jinaEmbedId}` : " WITHOUT semantic_text (JINA_EMBED_ID is not set)") : ""}`);
}
