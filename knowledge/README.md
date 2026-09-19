# Knowledge layer (Elasticsearch)

Disk is the record; every index here can be rebuilt with `pnpm reindex`.

## One-time setup (in order)
1. Put `ES_URL`, `ES_API_KEY`, `KIBANA_URL` in `.env.local`. If the cluster has Jina endpoints, add `JINA_EMBED_ID` and `JINA_RERANK_ID` (ask at the Elastic booth for the exact ids).
2. `pnpm elastic:indices` creates the six indices from `knowledge/mappings/`. With `JINA_EMBED_ID` set, `cutonce-docs.text` copies into a `semantic_text` field.
3. Upload the desk documents on `/upload` (or `pnpm reindex --rebuild-chunks` if they are already on disk).
4. `pnpm reindex` pushes passages, parts, materials and every run's events.
5. Fill `expected_chunk_ids` in `data/demo/golden_questions.json` (read the passages in Kibana Discover), then `pnpm search:eval --mode both`. Pass mark: 8 of 10 in the top 3. Make hybrid the default (`SEARCH_MODE=hybrid`) only if it scores at least as well as BM25. Paste the table below for the sponsor demo.
6. `pnpm elastic:setup` creates the four ES|QL tools in Agent Builder, lists what the MCP endpoint exposes, and calls each tool once.

## Verified from Elastic's docs (2026-09-19)
- Tools API: `GET|POST {KIBANA_URL}/api/agent_builder/tools`, `PUT …/tools/{id}`; headers `Authorization: ApiKey <key>`, `kbn-xsrf: true`. For a custom space, insert `/s/<space>` before `/api`.
- MCP endpoint: `{KIBANA_URL}/api/agent_builder/mcp`, header `Authorization: ApiKey <key>`. The key needs the Kibana privilege `feature_agentBuilder.read`, or every call returns 403.
- ES|QL param types on 9.4: `string | integer | float | boolean | date | array` only (Kibana 9.4 `esql/schemas.ts`); a test enforces it.

## Made by hand in Kibana (once, about 3 minutes)
1. **Workflows → Create**: paste `knowledge/workflows/log_issue.yaml`, set `webhook_url` to the server's public address and `webhook_token` to `API_TOKEN`, save, and run it once with a test input. The toast must appear on `/director`. **A quick Cloudflare tunnel gets a new address every time `pnpm tunnel` restarts: update `webhook_url` when it does** (a named tunnel on our domain avoids this).
2. **Agent Builder → Tools → New → Workflow**: id `cutonce_log_issue`, pick the workflow, and **turn off waiting for completion**. Otherwise Agent Builder waits up to 120 s, our 2 s fallback fires, and the issue reaches the server twice. The server ignores the second copy (it is idempotent on `issue_id`), but the copilot's reply is slower.
3. `pnpm elastic:setup` creates the other four tools (all ES|QL, including hybrid search with rerank) and smoke-tests each one through MCP.

If the MCP tool names differ from these ids, edit `REMOTE_NAME` in `services/api/src/search/tools.ts`. A missing or slow MCP tool is never fatal: `callKnowledgeTool` waits 2 s, then runs the direct twin in `search/fallbacks.ts`.

## Search evaluation
_Paste the output of `pnpm search:eval --mode both` here._

## Extraction evaluation
_Paste the output of `pnpm extract:eval data/demo/docs/desk-drawings.pdf` here, whatever it says._
