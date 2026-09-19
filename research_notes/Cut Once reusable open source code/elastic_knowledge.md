# Elastic knowledge layer: official code to borrow, and a check of Cut Once's implementation (target 9.4+)

Scope: code-level verification of `services/api/src/search/*`, `src/cli/elastic-*.ts`, `src/ingest/*`, `knowledge/{mappings,agent-builder,workflows,esql}` against official Elastic sources, checked on 2026-09-19. Nothing in the Cut Once repo was modified.

Sources used, with licence and freshness:

| Source | Licence | Last activity |
|---|---|---|
| elastic/elasticsearch-labs (notebooks, blog code) | Apache-2.0 | repo pushed 2026-09-17 |
| elastic/workflows (YAML library and examples) | Apache-2.0 | last commit cd60795, 2026-09-17 |
| elastic/elasticsearch-js | Apache-2.0 | latest tag v9.5.1; Cut Once has 9.5.1 installed |
| elastic/mcp-server-elasticsearch | Apache-2.0 | **deprecated**, superseded by the Agent Builder MCP endpoint |
| elastic/kibana (`x-pack/.../agent_builder`, branch `9.4`) | per-file header "Elastic License 2.0" | mcp.ts last changed 2026-03-31 on 9.4 |
| elastic/elasticsearch docs (`docs/reference/...`) and elastic/docs-content | GitHub reports licence as NOASSERTION (docs-content); only request shapes are borrowed | retrievers-examples.md 2026-02-12; semantic-text-setup-configuration.md 2026-07-30 |

The GitHub URLs below are the files themselves. Kibana links point at the `9.4` branch unless marked `main`.

---

## 1. Hybrid retrieval: rrf + text_similarity_reranker + semantic_text, and the Jina endpoint ids

### Takeaway
Our retriever tree and our `copy_to` mapping are valid 9.x syntax. The mapping is the same pattern as Elastic's own retriever examples (`text` with `copy_to: text_semantic`). Three changes are worth making. Swap the legacy `semantic` query for `match`. Apply the `doc_type` filter to the semantic branch too, which today ignores it. Set `JINA_EMBED_ID=.jina-embeddings-v5-text-small`, and set `JINA_RERANK_ID=.jina-reranker-v3` (or `.jina-reranker-v3.5` on 9.5+).

### Cited Findings
- **Best official example:** `docs/reference/elasticsearch/rest-apis/retrievers/retrievers-examples.md` in elastic/elasticsearch. It sets up an index with `"text": {"type": "text", "copy_to": "text_semantic"}` and `"text_semantic": {"type": "semantic_text"}`, the same field names Cut Once uses. It also has an example titled "Rerank results of an RRF retriever", which nests `text_similarity_reranker` around `rrf` using `field`, `inference_id`, `inference_text` and `chunk_rescorer` — [retrievers-examples.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/retrievers-examples.md)
- `copy_to` into semantic_text is allowed: "The `semantic_text` field type can serve as the target of copy_to fields, be part of a multi-field structure, or contain multi-fields internally" — [semantic-text-ingestions.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-ingestions.md)
- `text_similarity_reranker` parameters:
  - `retriever`, `field` and `inference_text` are required.
  - `inference_id` is optional and defaults to `.rerank-v1-elasticsearch`.
  - `rank_window_size` defaults to 10.
  - `min_score` and `filter` are optional.
  - `chunk_rescorer` is "beta 9.2-9.3, ga 9.4+".
  
  [text-similarity-reranker-retriever.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/text-similarity-reranker-retriever.md)
- RRF `rank_window_size` "must be greater than or equal to `size`". RRF-level `filter` "Applies the specified boolean query filter to all of the specified sub-retrievers". Per-retriever `weight` in the wrapped format `{ "retriever": {...}, "weight": 2 }` is "ga 9.2". The multi-field shorthand `{"rrf": {"query": "...", "fields": [...]}}` is "ga 9.1" — [rrf-retriever.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/rrf-retriever.md)
- The `semantic` query is legacy. Elastic says "We don't recommend this legacy query type for _new_ projects… The `semantic` query remains available". It recommends a `match` query as "the recommended method for querying `semantic_text` fields" — [semantic-text-search-retrieval.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-search-retrieval.md)
- A semantic query inside a `bool` is filtered correctly (stack ga 9.3, serverless ga). "In Query DSL, `must`, `filter`, and `must_not` queries within the parent `bool` query are used as pre-filters for `semantic_text` queries". The docs example is `bool.must.match.<semantic field>` plus `bool.filter.term`. The caveat: a raw `knn` query does *not* get automatic pre-filtering — [semantic-text-reference.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-reference.md)
- Default embedding endpoint: "On Elastic Cloud Hosted deployments running Stack 9.4+ and on Serverless, the `inference_id` parameter defaults to `.jina-embeddings-v5-text-small`". On 9.3 the default was `.elser-2-elastic`. Elastic advises setting `inference_id` explicitly so indices don't mix models, because ELSER scores run 0 to 10+ while Jina scores are 0 to 1 — [semantic-text-setup-configuration.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration.md)
- The code confirms the id: `DEFAULT_JINA_V5_ENDPOINT_ID = ".jina-embeddings-v5-text-small"` appears on the 9.4 branch — [InternalPreconfiguredEndpoints.java (9.4)](https://github.com/elastic/elasticsearch/blob/9.4/x-pack/plugin/inference/src/main/java/org/elasticsearch/xpack/inference/services/elastic/InternalPreconfiguredEndpoints.java)
- Preconfigured reranker endpoints on EIS are `.jina-reranker-v2-base-multilingual` and `.jina-reranker-v3` (blog dated 2026-02-03) — [Jina rerankers on EIS](https://www.elastic.co/search-labs/blog/jina-rerankers-elastic-inference-service)
- The current docs name "the preconfigured `.jina-reranker-v3.5` endpoint… This is the recommended option" — [semantic-reranking.md](https://github.com/elastic/docs-content/blob/main/solutions/search/ranking/semantic-reranking.md)
- Elastic's model table lists jina-reranker-v3.5 with Stack Version **9.5**, and v2/v3 with **9.3** — [reranker-models.csv](https://github.com/elastic/docs-content/blob/main/explore-analyze/elastic-inference/reranker-models.csv)
- Input windows: jina-reranker-v2-base-multilingual supports "input lengths up to 1K tokens"; jina-reranker-v3.5 supports "up to 131K tokens". jina-embeddings-v5-text-small produces "1024-dimensional vector embeddings" with inputs "up to 32K tokens" — [ml-nlp-jina.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/machine-learning/nlp/ml-nlp-jina.md)

### Inferences
- **`retrieve.ts` is valid as written.** The field names (`retriever`, `field`, `inference_id`, `inference_text`, `rank_window_size`) match the docs. `rank_window_size: 30` is at least `size` (5). A `semantic` query inside `bool.must` with `bool.filter` is legal, and on 9.3+ the filter acts as a kNN pre-filter ([reference](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-reference.md)).
- **Correction 1 (bug).** The semantic branch filters only on `project_id`, so a `docTypes` restriction leaks through RRF. Put one filter at the RRF level; it applies to every sub-retriever ([rrf docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/rrf-retriever.md)). In the same edit, replace the legacy `semantic` query with `match` ([search docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-search-retrieval.md)). `bm25Core` below is `bm25(q)` without its `filter` array:
  ```ts
  const filter = [{ term: { project_id: q.projectId } }, ...(q.docTypes?.length ? [{ terms: { doc_type: q.docTypes } }] : [])];
  const rrf = { rrf: { rank_window_size: 30, filter, retrievers: [
    { standard: { query: bm25Core(q) } },
    { standard: { query: { match: { text_semantic: { query: q.query } } } } },
  ] } };
  // unchanged outer layer:
  { text_similarity_reranker: { retriever: rrf, field: "text", inference_id: cfg.jinaRerankId,
      inference_text: q.query, rank_window_size: 30 } }
  ```
- **Optional (9.2+).** To let BM25 dominate on part-number-style queries, use the wrapped form `{ retriever: { standard: {...} }, weight: 1.5 }` ([rrf docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/rrf-retriever.md)). Add `min_score` on the reranker only after calibrating on the golden set, because "score calculations vary depending on the model used" ([reranker docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/rest-apis/retrievers/text-similarity-reranker-retriever.md)).
- **`.env.local` values.** Use the endpoint ids confirmed in [the 9.4 source](https://github.com/elastic/elasticsearch/blob/9.4/x-pack/plugin/inference/src/main/java/org/elasticsearch/xpack/inference/services/elastic/InternalPreconfiguredEndpoints.java) and the [EIS reranker blog](https://www.elastic.co/search-labs/blog/jina-rerankers-elastic-inference-service): `JINA_EMBED_ID=.jina-embeddings-v5-text-small`, and `JINA_RERANK_ID=.jina-reranker-v3` on 9.4 (`.jina-reranker-v3.5` if the cluster reports 9.5+). Confirm on the day with `GET _inference/_all`. Our chunks of 900 characters or less fit even v2's 1K-token window, so `chunk_rescorer` is unnecessary.
- **`elastic-indices.ts` is valid.** It matches the official example exactly. Keeping `inference_id` explicit, as it does now, follows Elastic's advice on model drift ([setup docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration.md)).

### Gaps
- Nothing here was run against a live cluster. The reranker id on the actual HTN cluster (v3 vs v3.5) depends on its minor version. The docs disagree on v3.5: docs-content calls it "preconfigured", while the CSV says 9.5.
- No official Elastic *TypeScript* example of this exact rrf + reranker tree turned up. The canonical examples are console/REST docs and Python notebooks.

---

## 2. @elastic/elasticsearch v9: top-level `retriever` in `search()`, and named ES|QL params

### Takeaway
Both calls in our code are supported by the installed client (9.5.1). `retriever` is a typed top-level field of `SearchRequest`. `esql.query` accepts `params: [{ assembly_id: "…" }]` (the `EsqlNamedValue[]` type), so the `as never` cast in `fallbacks.ts` can go.

### Cited Findings
- `SearchRequest` has a top-level `retriever?: RetrieverContainer` field. Its doc comment says it "replaces other elements of the search API that also return top documents such as `query` and `knn`" — [elasticsearch-js src/api/types.ts](https://github.com/elastic/elasticsearch-js/blob/main/src/api/types.ts). The same line is in the installed `lib/api/types.d.ts` (9.5.1).
- `TextSimilarityReranker` type: `retriever`, `rank_window_size?`, `inference_id?`, `inference_text` (required), `field` (required), `chunk_rescorer?`. `RRFRetriever` type: `retrievers`, `rank_constant?`, `rank_window_size?`, `query?`, `fields?` — [types.ts](https://github.com/elastic/elasticsearch-js/blob/main/src/api/types.ts)
- `EsqlQueryRequest.params?: EsqlESQLParams`, where `EsqlESQLParams = EsqlSingleOrMultiValue[] | EsqlNamedValue[]` and `EsqlNamedValue = Partial<Record<string, EsqlNamedParameterValue>>`. The doc comment says to "Use question mark placeholders (?) in the query string" — [types.ts](https://github.com/elastic/elasticsearch-js/blob/main/src/api/types.ts)
- Compatibility: "clients support communicating with greater or equal minor versions of Elasticsearch… Elasticsearch language clients are only backwards compatible with default distributions and without guarantees made" — [elasticsearch-js README](https://github.com/elastic/elasticsearch-js/blob/main/README.md)

### Inferences
- **Correction (cleanup).** In `runEsql`, drop the cast. The call typechecks as it stands ([types.ts](https://github.com/elastic/elasticsearch-js/blob/main/src/api/types.ts)):
  ```ts
  const res = await es.esql.query({ query, ...(query.includes("?assembly_id") ? { params: [{ assembly_id: assemblyId ?? "" }] } : {}) });
  return { columns: res.columns, rows: res.values };
  ```
- **Version risk.** `"^9.0.0"` resolved to client 9.5.1. If the HTN cluster is 9.4, a 9.5 client talking to a 9.4 server is the "backwards, no guarantees" direction ([README](https://github.com/elastic/elasticsearch-js/blob/main/README.md)). Pinning `"@elastic/elasticsearch": "~9.4.0"` removes that risk. It is low risk either way for the plain `search`, `bulk` and `esql.query` calls we make.

### Gaps
- There is no official TS example calling `esql.query` with named params. The typing is confirmed, but the runtime wire format was not run.

---

## 3. Our ES|QL files (`knowledge/esql/*.esql` and the query strings in `knowledge/agent-builder/tools/*.json`)

### Takeaway
No syntax errors found. Each construct is documented:
- per-aggregation `COUNT(*) WHERE …` inside `STATS`
- `DATE_DIFF("seconds", start, end)`
- `MEDIAN`
- `MATCH(field, ?param)`, including `OR` between two MATCHes
- `METADATA _score` with `SORT _score DESC`

ES|QL 9.4 also offers GA `FORK` and `RERANK` (with `FUSE` in preview), so hybrid search plus rerank can run *inside an Agent Builder ES|QL tool*. That is a strong fit for the prize.

### Cited Findings
- STATS syntax is `STATS [column1 =] expression1 [WHERE boolean_expression1][, …]`. The docs have a section "Filter aggregations with WHERE", and "Filtered and unfiltered aggregations can be freely mixed". STATS is `stack: ga` — [stats-by.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/stats-by.md)
- `DATE_DIFF(unit, startTimestamp, endTimestamp)` returns an integer. "second" and "seconds" (also "ss", "s") are valid unit strings. The result is negative if start is later than end — [DATE_DIFF](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/date-time-functions/date_diff)
- MATCH accepts a named param. Elastic's own Agent Builder example query is `| WHERE MATCH(title, ?search_terms)` — [esql-tools.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/esql-tools.md). An official Labs notebook (May 2026) ships `WHERE MATCH(executive_summary, ?query) OR MATCH(key_vulnerabilities, ?query) OR MATCH(policy_recommendations, ?query)` — [llamaindex notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb). (A summarised fetch of the MATCH reference page claimed the query "cannot be a parameter placeholder". These two primary examples contradict that, and I treat the summary as wrong.)
- MATCH works on text, semantic_text, keyword and more. "On semantic_text fields, MATCH performs semantic queries". It is GA since 9.1 — [MATCH](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/match). In ES|QL, a later `WHERE` on another field is applied as a pre-filter to the kNN on a semantic_text field (9.3+) — [semantic-text-reference.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-reference.md)
- Version status of the search commands:
  - `FORK`: "stack: preview 9.1-9.3, ga 9.4+" ([fork.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/fork.md))
  - `FUSE`: "stack: preview 9.2-9.4, ga 9.5+" ([fuse.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/fuse.md))
  - `RERANK`: "stack: preview 9.2-9.3, ga 9.4.0+", with syntax `RERANK [column =] query ON field [, field, ...] [WITH { "inference_id" : "..." }]` ([rerank.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/rerank.md))
- The official FUSE example is `FROM books METADATA _id, _index, _score | FORK (WHERE title:"Shakespeare" | SORT _score DESC | LIMIT 100) (WHERE semantic_title:"Shakespeare" | SORT _score DESC | LIMIT 100) | FUSE | SORT _score DESC` — [fuse.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/fuse.md)

### Inferences
- `runs_compared.esql`, `step_durations.esql`, `sources_breakdown.esql`, and the three tool queries are valid as written ([stats](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/stats-by.md), [DATE_DIFF](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/date-time-functions/date_diff), [esql-tools](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/esql-tools.md)). Two small notes. `COUNT_DISTINCT` is approximate, which is harmless at our scale. `DATE_DIFF` returns an integer, so `/ 60.0` correctly gives a double.
- **Suggested addition (the ES|QL showcase).** Replace the LLM-driven index_search tool (see section 4) with a deterministic ES|QL tool that does hybrid retrieval and rerank in one query. It uses only GA-in-9.4 pieces ([MATCH](https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/match), [RERANK](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/rerank.md)):
  ```
  FROM cutonce-docs METADATA _score
  | WHERE MATCH(text, ?query) OR MATCH(text_semantic, ?query)
  | SORT _score DESC | LIMIT 30
  | RERANK ?query ON text WITH { "inference_id": ".jina-reranker-v3" }
  | SORT _score DESC
  | KEEP chunk_id, document_id, page, title, text, part_ids, _score
  | LIMIT 5
  ```
  A variant with FORK and FUSE (`FROM … METADATA _id, _index, _score | FORK (…MATCH(text,…)…) (…MATCH(text_semantic,…)…) | FUSE | …`) is closer to real RRF, but FUSE is still *preview* in 9.4 ([fuse.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/query-languages/esql/_snippets/commands/layout/fuse.md)).

### Gaps
- I found no doc example of `RERANK ?query ON …`, with a named parameter as the rerank query text. Test it once in Discover. If it is rejected, fall back to calling the retriever-based twin.
- The `OR` of a BM25 MATCH and a semantic MATCH sums two differently scaled scores (the scale difference is noted in [setup docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration.md)). RERANK afterwards hides most of this, but it has not been measured.

---

## 4. Agent Builder: tool bodies (`esql`, `index_search`, `workflow`), and the MCP endpoint from TypeScript

### Takeaway
Of everything in the knowledge layer, the Agent Builder tool files need the most fixing.

1. **Blocking on 9.4.** Our ES|QL tool params use `"type": "keyword"` and `"type": "text"`. The 9.4 API only accepts `string | integer | float | boolean | date | array`, so `pnpm elastic:setup` gets HTTP 400 for every tool.
2. MCP tool names equal the tool id, with `.` replaced by `_`, so `REMOTE_NAME` is correct. MCP results come back wrapped as `{"results":[{type:"esql_results", data:{columns, values}}]}`, which is not the shape the direct twin returns.
3. An `index_search` tool takes only `{ nlQuery }` and runs an LLM internally. Our `{query, part_id}` args will fail validation, and it will rarely finish inside our 2 s timeout.
4. The bodies for creating index_search and workflow tools *are* now documented or shown in official code, so `elastic:setup` can create all five tools.

### Cited Findings
- **Best official examples:**
  - Kibana's create-tool API docs give the `esql` and `index_search` bodies ([Kibana API: create a tool](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-agent-builder-tools)).
  - The Labs notebook "elastic-agent-builder-llamaindex-document-processing" (Apache-2.0, last commit 2026-05-14) creates a `workflow` tool and two `esql` tools over the REST API ([notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)).
  - The Labs SRE notebook (last commit 2026-08-20, targets 9.4) creates an `index_search` tool and a workflow by API ([sre notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/observability-labs/sre-control-plane-agent-builder-workflows/sre-control-plane-agent-builder-workflows.ipynb)).
- **ES|QL tool param types (9.4, server-side validation):** `paramValueTypeSchema = schema.oneOf([literal('string'), literal('integer'), literal('float'), literal('boolean'), literal('date'), literal('array')])`. `defaultValue` is only allowed when `optional: true` — [esql/schemas.ts (9.4)](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/esql/schemas.ts)
- The docs agree. For "stack: ga 9.4+, serverless: ga" the types are `string`, `integer`, `float`, `boolean`, `date`, `array`. `text`, `keyword`, `long`, `double`, `object`, `nested` are listed only for "stack: ga 9.2-9.3" — [esql-tools.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/esql-tools.md). The old types survive only as "Legacy/persisted param type values", converted on read — [esql_legacy.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/esql/esql_legacy.ts)
- The ES|QL tool validator rejects a query with syntax errors, "Query uses undefined parameters", or "Defined parameters not used in query" — [validate_configuration.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/esql/validate_configuration.ts)
- The Labs notebook's text-search tool uses `"params": {"query": {"type": "string", "description": "..."}}` — [notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)
- **index_search config** is `{ pattern: string; row_limit?: number; custom_instructions?: string }` ([index_search.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/types/index_search.ts)). Its input schema is `z.object({ nlQuery: z.string() })`, and the handler calls `runSearchTool({ nlQuery, index: pattern, rowLimit, customInstructions, … modelProvider … })` ([index_search/tool_type.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/index_search/tool_type.ts)). The docs say it "selects only one index per query" and generates ES|QL or Query DSL itself — [index-search-tools.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/index-search-tools.md)
- **workflow tool config** is `configurationSchema = schema.object({ workflow_id: schema.string(), wait_for_completion: schema.maybe(schema.boolean()) })` ([workflow/schemas.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/workflow/schemas.ts)). The tool's argument schema is generated from `workflow.definition.inputs` ([generate_schema.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/workflow/generate_schema.ts)). Execution requires the "'workflowsManagement' execute and read privileges" ([workflow/tool_type.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/workflow/tool_type.ts)). `waitForCompletion` defaults to `true` ([execute_workflow.ts, main](https://github.com/elastic/kibana/blob/main/x-pack/platform/packages/shared/agent-builder/agent-builder-tools-base/workflows/execute_workflow.ts)), and waits "up to 120s" ([i18n.ts, main](https://github.com/elastic/kibana/blob/main/x-pack/platform/plugins/shared/agent_builder/public/application/components/tools/form/i18n.ts)).
- The official workflow tool body is `{"id": "run_llamaextract_workflow", "type": "workflow", "description": "...", "tags": [...], "configuration": {"workflow_id": WORKFLOW_ID}}`, POSTed to `{KIBANA_URL}/api/agent_builder/tools` with headers `Authorization: ApiKey …`, `kbn-xsrf: true`. The workflow id is looked up with `GET {KIBANA_URL}/api/workflows?size=20&page=1` → `results[]` → match by `name` — [notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)
- Tool id rules: `toolIdRegexp = /^(?:[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?))*$/`, with `toolIdMaxLength = 64` — [tool_ids.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/tool_ids.ts)
- **How MCP names tools.** The route registers `server.tool(idMapping.get(tool.id) ?? tool.id, …)` for *every* tool in the registry, built-in and custom, filtered by an optional `?namespace=a,b` query param that matches the id prefix before the last `.`. It creates a new stateless `McpServer` per POST ("no session persistence") and returns `content: [{ type: 'text', text: JSON.stringify(toolResult) }]` — [routes/mcp.ts (9.4)](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/routes/mcp.ts). The mapping is `sanitizeToolId = toolId.replaceAll('.', '_').replace(/[^a-zA-Z0-9_-]/g, '')`, with `_1`, `_2` suffixes on collisions — [langchain/tools.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-genai-utils/langchain/tools.ts)
- The tool result is `RunToolReturn { results?: ToolResult[] }` ([runner.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-server/runner/runner.ts)). Each result is `{ tool_result_id, type, data }`, and ES|QL data is `{ query, columns, values, time_range? }` — [tool_result.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/tool_result.ts)
- The MCP endpoint is `{KIBANA_URL}/api/agent_builder/mcp`, or `{KIBANA_URL}/s/{SPACE_NAME}/api/agent_builder/mcp` in a custom space. It is "preview =9.2, ga 9.3+" — [mcp-server.md](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/mcp-server)
- The MCP API key needs `"application": "kibana-.kibana"` with `"feature_agentBuilder.read", "feature_actions.read"`, plus `"cluster": ["monitor_inference"]`, which is "Required to use Elasticsearch inference endpoints". Without `feature_agentBuilder.read` you get a 403. The official client config is `npx mcp-remote ${KIBANA_URL}/api/agent_builder/mcp --header Authorization:${AUTH_HEADER}` with `AUTH_HEADER = "ApiKey ${API_KEY}"` — [mcp-server-api-keys.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/mcp-server-api-keys.md)
- Other privileges: `feature_workflowsManagement.workflow_execute` to "Run workflows"; `feature_agentBuilder.manage_tools` (ga 9.4+) to create and edit custom tools; `feature_agentBuilder.all` for everything — [permissions.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/permissions.md)
- elastic/mcp-server-elasticsearch: "This MCP server is deprecated… superseded by the Elastic Agent Builder MCP endpoint, which is available in Elastic 9.2.0+" — [README](https://github.com/elastic/mcp-server-elasticsearch)
- **TS SDK behaviour.** In the installed `@modelcontextprotocol/sdk` 1.30.0 (`dist/esm/client/streamableHttp.js`), a non-405 failure of the optional GET SSE stream after `initialized` is passed to `onerror` rather than thrown. The code comments that "405 indicates that the server does not offer an SSE stream". I verified this in the local package; upstream source is the [typescript-sdk streamableHttp.ts](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/streamableHttp.ts).

### Inferences
- **Correction A (blocking on 9.4+).** In `knowledge/agent-builder/tools/*.json`, change every param type to `"string"` ([schemas.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/esql/schemas.ts)). Use `optional`/`defaultValue` where it helps:
  ```json
  "params": {
    "assembly_id": { "type": "string", "description": "The run to read, for example asm_run_017" }
  }
  ```
  If the cluster is 9.2 or 9.3, the old `keyword`/`text` types are the right ones ([esql-tools.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/esql-tools.md)). `elastic-setup.ts` could read `GET /api/status` or `es.info()` and map the types by version.
- **`REMOTE_NAME` is right.** Ids without dots are unchanged by `sanitizeToolId` ([langchain/tools.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-genai-utils/langchain/tools.ts)). One option: rename ids to `cutonce.find_parts` etc. The MCP names stay `cutonce_find_parts`, and `AGENT_BUILDER_MCP_URL={KIBANA}/api/agent_builder/mcp?namespace=cutonce` then lists only our five tools instead of every built-in ([routes/mcp.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/routes/mcp.ts)).
- **Correction B (shape mismatch).** `mcpCall` returns `{results:[{type:"esql_results",data:{query,columns,values}}]}`, while the direct twins return `{parts}`, `{report,columns,rows}`, and so on ([tool_result.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/packages/shared/agent-builder/agent-builder-common/tools/tool_result.ts)). Unwrap it so the copilot sees one shape:
  ```ts
  const parsed = text ? JSON.parse(text) : res.structuredContent;
  const r = parsed?.results?.[0];
  if (r?.type === "error") throw new Error(JSON.stringify(r.data));
  if (r?.type === "esql_results") return { columns: r.data.columns, rows: r.data.values };
  return r?.data ?? parsed;
  ```
- **Correction C (search_documents over MCP).** index_search takes only `nlQuery` ([tool_type.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/services/tools/tool_types/index_search/tool_type.ts)), so `remoteArgs` would at least need `if (name === "search_documents") return { nlQuery: String(args.query ?? "") };`. It also runs an LLM to write its own query, which is slow and hides our hybrid-plus-rerank tuning. The better fix is to make `cutonce_search_documents` an `esql` tool built on the hybrid query from section 3, with `{"query": {"type": "string", …}}`. That also makes it creatable by `elastic:setup` instead of by hand.
- **Correction D (`elastic:setup` can create everything).** The index_search and workflow bodies are now documented or shown in official code ([Kibana API](https://www.elastic.co/docs/api/doc/kibana/operation/operation-post-agent-builder-tools); [Labs notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)), so the README's "Made by hand in Kibana (their request bodies are not documented)" is out of date:
  ```json
  { "id": "cutonce_search_documents", "type": "index_search", "description": "…",
    "configuration": { "pattern": "cutonce-docs", "row_limit": 5 } }
  { "id": "cutonce_log_issue", "type": "workflow", "description": "…",
    "configuration": { "workflow_id": "<id from GET /api/workflows>", "wait_for_completion": false } }
  ```
- **API key.** The key behind `ES_API_KEY` used for MCP should add `feature_workflowsManagement.read` and `feature_workflowsManagement.workflow_execute` (for the workflow tool), plus cluster `monitor_inference` (for semantic and rerank inside ES|QL tools). The key used by `elastic:setup` needs `feature_agentBuilder.manage_tools` or `.all` ([permissions.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/permissions.md); [mcp-server-api-keys.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/mcp-server-api-keys.md)). `mcp.ts` is otherwise correct: `StreamableHTTPClientTransport` with `requestInit.headers.Authorization = "ApiKey …"` is the TS equivalent of the documented `mcp-remote --header`. Reusing one connected `Client` is safe even though the server is stateless per POST ([routes/mcp.ts](https://github.com/elastic/kibana/blob/9.4/x-pack/platform/plugins/shared/agent_builder/server/routes/mcp.ts)).

### Gaps
- I found no official *TypeScript* MCP-client example for Agent Builder. Elastic only documents `mcp-remote` configs for Claude Desktop, Cursor and VS Code.
- No official request-body example for a `workflow` tool exists in the Kibana API reference page; it shows only `esql` and `index_search`. The workflow body comes from Kibana source plus the Labs notebook.
- `wait_for_completion` was read on Kibana `main`, not the 9.4 branch; its default there is `true`.

---

## 5. Workflows: `log_issue.yaml` syntax, and turning a workflow into an Agent Builder tool

### Takeaway
`log_issue.yaml` is mostly correct 9.4 syntax:
- `version: "1"` as a string
- `consts`
- top-level `inputs` (correct for ≤9.4)
- `elasticsearch.index` with `index`/`id`/`document`
- `on-failure.retry.max-attempts`/`delay` plus `continue`

One real error: `headers: "{{ consts.auth_headers }}"` renders an object through the string template. Objects need `${{ }}`, or write the headers inline. On a 9.5+ or Serverless cluster, `inputs` moves under the manual trigger. Before wiring it as a tool, also fix a double-logging risk in `tools.ts`.

### Cited Findings
- On inputs placement: "On stack 9.4 and earlier, `inputs` sits at the top level of the workflow. From stack 9.5+ and on serverless, new workflows place `inputs` inside the `manual` trigger; existing top-level workflows continue to run." On the version field: it is "the string `"1"`, not the number `1`" — [Anatomy of a workflow](https://www.elastic.co/docs/explore-analyze/workflows/authoring-techniques/anatomy)
- "Use `${{ ... }}` for arrays and objects, `{{ ... }}` for strings." The full `on-failure` block is `retry: { max-attempts, delay, strategy: exponential, jitter, condition }`, `continue: true`, `fallback: [...]`. Workflows are "Generally available since 9.4, Preview in 9.3" — [Workflows cheat sheet](https://www.elastic.co/docs/explore-analyze/workflows/reference/cheat-sheet)
- **Best official examples** (elastic/workflows, Apache-2.0, commit cd60795, 2026-09-17):
  - `examples/search/es-ql-query-output-table-values-to-new-index.yaml` uses `type: elasticsearch.index` with `with: { index: "sar-reports", id: "{{ execution.id }}-{{ foreach.index }}", document: { timestamp: "{{ execution.startedAt }}", … } }`, and notes that "the `id` of the document must be set" ([file](https://github.com/elastic/workflows/blob/main/examples/search/es-ql-query-output-table-values-to-new-index.yaml)).
  - `examples/security/response/createcasetool.yaml` is a workflow written to be an agent tool, tagged `"AgentTool"`, with `inputs` under `triggers: - type: manual` ([file](https://github.com/elastic/workflows/blob/main/examples/security/response/createcasetool.yaml)).
  - Of the repo's 153 YAML files, none puts `inputs` at the top level; where inputs exist they sit under the manual trigger. 96 of the files declare `version: "1"`/`'1'` and 57 omit it. Counted from the repo tree at cd60795 — [elastic/workflows](https://github.com/elastic/workflows)
- The `http` step shape is `url`, `method`, `headers:` (a map), `body:` (a map), `timeout: 30s`. On-failure is `continue` plus `retry: {max-attempts, delay}` — [docs/schema.md](https://github.com/elastic/workflows/blob/main/docs/schema.md)
- The Labs llamaindex notebook's 9.4 workflow has top-level `inputs:`, `consts:`, `triggers: - type: manual`, and `http` steps with inline `headers: { Authorization: "Bearer {{ consts.llamaCloudApiKey }}", Content-Type: application/json }`. It then indexes with `type: elasticsearch.index` / `with: {index, id, document: {...}}` — [notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)
- Creating and running a workflow by API (9.4):
  - `POST {BASE}/api/workflows` with `json={"workflows": [{"yaml": WORKFLOW}]}`, `params={"overwrite": "true"}`, and headers including `"x-elastic-internal-origin": "Kibana"`; the id comes back as `r.json()["created"][0]["id"]`.
  - Run with `POST {BASE}/api/workflows/workflow/{id}/run` and `{"inputs": {...}}`, which returns `workflowExecutionId`.
  - Poll `GET {BASE}/api/workflows/executions/{id}`.
  
  [SRE control-plane notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/observability-labs/sre-control-plane-agent-builder-workflows/sre-control-plane-agent-builder-workflows.ipynb)
- Workflow → tool: "Select **Workflow** as the tool type… **Inputs**… are automatically detected from the `inputs` section of the selected workflow's YAML definition". The tool must then be assigned to an agent — [workflow-tools.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/ai-features/agent-builder/tools/workflow-tools.md). The API body is in section 4.

### Inferences
- **Correction 1 (headers).** Inline the headers, as every official example does ([Labs notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb); [schema.md](https://github.com/elastic/workflows/blob/main/docs/schema.md)). The alternative is `headers: "${{ consts.auth_headers }}"` ([cheat sheet](https://www.elastic.co/docs/explore-analyze/workflows/reference/cheat-sheet)):
  ```yaml
  consts:
    webhook_url: "https://YOUR-DOMAIN/v1/webhooks/issue"
    webhook_token: "YOUR_API_TOKEN"
  # …
      with:
        url: "{{ consts.webhook_url }}"
        method: POST
        headers:
          Authorization: "Bearer {{ consts.webhook_token }}"
          Content-Type: application/json
  ```
- **Correction 2 (document completeness).** `cutonce-issues` maps `@timestamp`, but the workflow does not write it. Add `"@timestamp": "{{ execution.startedAt }}"` (the same variable the official example uses, [file](https://github.com/elastic/workflows/blob/main/examples/search/es-ql-query-output-table-values-to-new-index.yaml)) and an optional `assembly_id` input.
- **Correction 3 (version-dependent inputs).** For 9.5+ or Serverless, move `inputs` under the trigger ([anatomy](https://www.elastic.co/docs/explore-analyze/workflows/authoring-techniques/anatomy)):
  ```yaml
  triggers:
    - type: manual
      inputs:
        - { name: issue_id, type: string, required: true }
        - { name: part_id,  type: string, required: false }
        - { name: note,     type: string, required: true }
  ```
- **Correction 4 (double execution, in `tools.ts`).** The workflow tool defaults to `waitForCompletion = true` for up to 120 s ([execute_workflow.ts](https://github.com/elastic/kibana/blob/main/x-pack/platform/packages/shared/agent-builder/agent-builder-tools-base/workflows/execute_workflow.ts)), and our http step retries 3 × 2 s. So `callKnowledgeTool` will often hit its 2 s timeout, then run the direct twin *while the workflow is still running*. The twin then logs a second issue under a different id: `issue_${Date.now()…}` vs `issue_${ulid()}`. Fix it in two parts:
  - Create the tool with `"wait_for_completion": false`.
  - Generate `issue_id` once and pass it to both paths, so `logIssue` / `es.index({ id: issue_id })` is idempotent. Alternatively, never fall back for `log_issue` after the remote call was *sent*.
- **Suggestion.** `elastic:setup` can now automate the whole chain from the notebooks: `POST /api/workflows` → workflow id → `POST /api/agent_builder/tools` with `type: "workflow"`. Keep the Kibana UI path only as a backup.

### Gaps
- It is not confirmed whether a 9.5+ Kibana *rejects* a newly created workflow with top-level `inputs`, or just migrates it. The docs only say existing ones "continue to run".
- It is not confirmed whether Kibana restricts `http` step targets (for example with an allow-list like connectors' `allowedHosts`). Test the webhook call on the real cluster once.
- The public API reference for `/api/workflows` was not found. The shapes above come from a 9.4-era official notebook, which needed the `x-elastic-internal-origin: Kibana` header.

---

## 6. Ingesting messy documents (PDF, scans), and retrieval evaluation (golden questions, recall@k)

### Takeaway
Elastic's built-in answer to chunking is `semantic_text` automatic chunking. Its default is sentence strategy, 250 words, 1-sentence overlap, and `chunking_settings` is ga 9.1. We should keep our own chunker, because deterministic `chunk_id`s, page numbers and bboxes are what make the golden set and the page-image citations work. Set `chunking_settings: {strategy: "none"}` so Elasticsearch embeds each of our passages exactly once. For evaluation, the closest official pieces are:
- the `_rank_eval` API, which has `recall` and `mean_reciprocal_rank` with `k`
- the Labs "evaluating search relevance" notebook, which uses nDCG@10 via `pytrec_eval` and bootstrap confidence intervals

Neither is a drop-in for a retriever-based TS pipeline, so extending `pnpm search:eval` is the pragmatic path.

### Cited Findings
- Default chunking: "documents are split into sentences and grouped in sections up to 250 words with 1 sentence overlap". "The default chunking strategy is `sentence`" — [inference-api.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/elastic-inference/inference-api.md)
- `chunking_settings` (stack ga 9.1) "will override the chunking settings set in the Inference endpoint… To completely disable chunking, use the `none` chunking strategy". With `none`, the `elastic` and `elasticsearch` services "automatically truncate the input to fit within the model's limit" — [semantic-text-reference.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-reference.md)
- Pre-chunked input (ga 9.1): set `"chunking_settings": { "strategy": "none" }` and pass an array of strings, where "Each element represents a single chunk". Bulk partial updates that omit the semantic_text field "reuse existing embeddings". Scripted updates via Bulk are "Not supported" on indices with semantic_text — [semantic-text-ingestions.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-ingestions.md)
- Modalities: "`semantic_text` accepts text only. For images, audio, video, or PDF files, use `semantic` with a compatible multimodal embedding endpoint" ([setup docs](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration.md)). "In Stack 9.5 and later, the `semantic` field type supports all modalities" ([ml-nlp-jina.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/machine-learning/nlp/ml-nlp-jina.md)).
- **Best official messy-PDF example:** "Extending Elastic Agent Builder with LlamaParse Extract" (Labs, Apache-2.0, 2026-05-14). A Workflow uploads a PDF URL to LlamaCloud, runs Extract v2, polls with a `while` step, then `elasticsearch.index`es the structured fields. The index is exposed through one `workflow` tool and two `esql` tools. It depends on an external LlamaCloud API key — [notebook](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/elastic-agent-builder-llamaindex-document-processing/notebook.ipynb)
- **Evaluation:** `_rank_eval` takes `requests[]` of `{id, request, ratings: [{_index, _id, rating}]}` and metrics including `"recall": {"k": 20, "relevant_rating_threshold": 1}` and `mean_reciprocal_rank`. The page does not mention retrievers — [Ranking evaluation API](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-rank-eval)
- The Labs notebook "retrieve-and-rerank" (last commit 2024-09-25, pre-9.x) evaluates BM25 against BM25 plus a reranker. It uses BEIR qrels, `pytrec_eval` `ndcg_cut_10`, a "judge rate" for how many of the top-10 hits are labelled, and bootstrap 95% confidence intervals — [retrieve-and-rerank.ipynb](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/evaluating-search-relevance-part-1/retrieve-and-rerank.ipynb)

### Inferences
- **Mapping tweak (optional).** In `elastic-indices.ts`, add `chunking_settings` so each 300–900 character passage is exactly one embedding and the citation unit equals the retrieval unit ([semantic-text-ingestions.md](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/mapping-reference/semantic-text-ingestions.md)). Our passages are already under 250 words, so this mainly makes the behaviour explicit and deterministic:
  ```ts
  body.mappings.properties.text_semantic = { type: "semantic_text", inference_id: cfg.jinaEmbedId,
    chunking_settings: { strategy: "none" } };
  ```
- **Keep `chunk.ts`, `pages.ts` and `transcribe.ts`.** No official Elastic example does OCR or vision transcription of scanned drawings *inside* Elasticsearch on 9.4. The ingest pipeline's attachment/Tika route cannot read image-only pages, and the multimodal `semantic` field is 9.5+ ([ml-nlp-jina.md](https://github.com/elastic/docs-content/blob/main/explore-analyze/machine-learning/nlp/ml-nlp-jina.md)). For "messy data" judging, it is better to say plainly that we use a vision model for the scans and Elastic for hybrid retrieval, rerank, analytics and actions.
- **`search:eval` additions**, mirroring `_rank_eval` definitions ([rank-eval](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-rank-eval)):
  - Report recall@3, recall@5 and MRR per mode (bm25, hybrid, and hybrid without the reranker), not just pass or fail.
  - Keep the Labs notebook's caveat in mind: with 10 questions, one question is 10 points, so show the per-question table rather than claiming significance ([retrieve-and-rerank.ipynb](https://github.com/elastic/elasticsearch-labs/blob/main/supporting-blog-content/evaluating-search-relevance-part-1/retrieve-and-rerank.ipynb)).
  - For an Elastic-native cross-check of the BM25 mode, the same golden file converts directly to `_rank_eval`, using `ratings: [{ _index: "cutonce-docs", _id: chunk_id, rating: 1 }]`, since `_id` equals `chunk_id` in `indexChunks`.
  - MRR itself is `mrr = golden.reduce((s, g, i) => s + (ranks[i] >= 0 ? 1 / (ranks[i] + 1) : 0), 0) / golden.length`.

### Gaps
- It is undocumented whether `_rank_eval` accepts a `retriever` (rrf or text_similarity_reranker) in `request`. Assume it doesn't until tested.
- I found no official Elastic example of retrieval evaluation on 9.x with Jina endpoints. The Labs evaluation notebooks predate 9.0.
- I found no official Elastic TypeScript ingestion example for scanned PDFs.
