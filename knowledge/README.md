# Knowledge layer (Elasticsearch)

Disk is the record; every index here can be rebuilt with `pnpm reindex`.

## One-time setup (in order)
1. Put `ES_URL`, `ES_API_KEY`, `KIBANA_URL` in `.env.local`. If the cluster has Jina endpoints, add `JINA_EMBED_ID` and `JINA_RERANK_ID` (ask at the Elastic booth for the exact ids).
2. `pnpm elastic:indices` creates the six indices from `knowledge/mappings/`. With `JINA_EMBED_ID` set, `cutonce-docs.text` copies into a `semantic_text` field.
3. Upload the desk documents on `/upload` (or `pnpm reindex --rebuild-chunks` if they are already on disk).
4. `pnpm reindex` pushes passages, parts, materials and every run's events.
5. Fill `expected_chunk_ids` in `data/demo/golden_questions.json` (read the passages in Kibana Discover), then `pnpm search:eval --mode both`. Pass mark: 8 of 10 in the top 3. Make hybrid the default (`SEARCH_MODE=hybrid`) only if it scores at least as well as BM25. Paste the table below for the sponsor demo.
6. `pnpm elastic:setup` creates the three ES|QL tools in Agent Builder and lists what the MCP endpoint exposes.

## Verified from Elastic's docs (2026-09-19)
- Tools API: `GET|POST {KIBANA_URL}/api/agent_builder/tools`, `PUT …/tools/{id}`; headers `Authorization: ApiKey <key>`, `kbn-xsrf: true`. For a custom space, insert `/s/<space>` before `/api`.
- MCP endpoint: `{KIBANA_URL}/api/agent_builder/mcp`, header `Authorization: ApiKey <key>`. The key needs the Kibana privilege `feature_agentBuilder.read`, or every call returns 403.
- Only the ES|QL tool body is documented, so `elastic:setup` creates ES|QL tools only.

## Made by hand in Kibana (their request bodies are not documented)
- **`cutonce_search_documents`**: an index search tool over `cutonce-docs`.
- **`cutonce_log_issue`**: a workflow tool that runs `knowledge/workflows/log_issue.yaml`. Paste the YAML into Workflows, set `webhook_url` and the bearer token in `consts`, run it once by hand, and watch the toast appear on `/director`.

If the MCP tool names differ from these ids, edit `REMOTE_NAME` in `services/api/src/search/tools.ts`. A missing or slow MCP tool is never fatal: `callKnowledgeTool` waits 2 s, then runs the direct twin in `search/fallbacks.ts`.

## Search evaluation
_Paste the output of `pnpm search:eval --mode both` here._

## Extraction evaluation
_Paste the output of `pnpm extract:eval data/demo/docs/desk-drawings.pdf` here, whatever it says._
