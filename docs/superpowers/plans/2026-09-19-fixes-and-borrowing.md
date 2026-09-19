# Fixes and Borrowed Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine demo-breaking problems found by the code-reuse research, and wire in the borrowed code each owner needs, with the smallest change that is correct.

**Architecture:** Server fixes land in the existing `services/api` code and `knowledge/` files, each with a failing test first. Device fixes are small, pure C# classes (no Meta calls inside them) so they can be tested in the Unity Editor without the one headset; the Meta API is passed in as a function. Blueprint text is corrected where it was wrong.

**Tech stack:** Node 22, TypeScript, Fastify, Vitest, `@elastic/elasticsearch` 9, `@modelcontextprotocol/sdk`, `openai` v7, `@elevenlabs/elevenlabs-js`, `sharp` · Unity 6000.3.12f1, URP, Meta XR Core/MRUK 205.0.0, Unity Test Framework (EditMode).

**Spec:** `reports/Cut Once reusable open source code.md` (the 18 fixes and per-owner tables), `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` (sections 5, 8, 10, 12, 14), `docs/superpowers/specs/2026-09-18-cut-once-team-plan.md`.

## Global Constraints

- Node **22**; TypeScript `strict`; every server change keeps `pnpm test` and `pnpm typecheck` green.
- Elastic **9.4+**. Agent Builder ES|QL param types: `string | integer | float | boolean | date | array` only.
- **Disk is truth.** Elasticsearch and MCP are optional; a tool call never throws on the copilot path.
- **The user's tap or voice is truth.** Models and the camera only suggest.
- **Stable IDs.** `part_id`, `issue_id` and `chunk_id` are the join keys everywhere.
- Unity **6000.3.12f1**, Meta XR **205.0.0** (the QuestCameraKit fork's pins). Superseded 2026-09-19: `apps/quest` is the project and pins Unity **6000.6.2f1** (see `apps/quest/README.md`). Oculus SDK-licensed code is called, not vendored; LGPL/GPL sources are ideas only.
- Secrets never enter git.

## How every decision in this plan was made

These criteria come from earlier in this project. Each task names the options it considered, the one it picks, **why** in terms of these criteria, and **how the choice is validated**.

| # | Criterion | Where it came from |
|---|---|---|
| K1 | **Correctness first.** Order: breaks the demo → gives wrong answers → cleanup | Critic priority ladder |
| K2 | **Minimal diff.** The smallest change with the same result; no new abstraction where a parameter will do | Critic priority ladder |
| K3 | **Fix at the layer that owns the invariant** (for example, the receiver makes duplicates harmless) | Blueprint §9 idempotent append |
| K4 | **Never throw on the copilot path**; fall back instead | Blueprint §10, `retrieve()` and `callKnowledgeTool` contracts |
| K5 | **Prefer the vendor's documented function over our own maths** | Research report: our projection formula was wrong |
| K6 | **Testable without the headset** (one Quest, three Unity developers) | Team plan, risk 1 |
| K7 | **Prize evidence**: Elastic wants ES\|QL, Agent Builder tools and Workflows that act | Devpost track text |
| K8 | **Evidence before claims**: every fix has a test (logic) or a cited source plus a one-minute check on the day (evidence) | User's instruction; verification-before-completion |
| K9 | **Licence safety**: MIT/Apache/public-domain may be copied; Oculus SDK code is called; LGPL/GPL is ideas only | Research report, licence section |

## Decisions at a glance

| Fix | Options considered | Chosen | Why (criteria) | Validated by |
|---|---|---|---|---|
| 1 Tool param types | (a) edit 3 JSON files to `string`; (b) detect the cluster version and map types; (c) create tools by hand in Kibana | **(a)** plus a regression test | K2: three one-word edits. (b) is code for a version we don't support (Global Constraints say 9.4+). (c) isn't reproducible | Evidence: Kibana 9.4 `esql/schemas.ts`. Test: every param type is in the allowed set, and every `?param` in a query is declared |
| 2 `log_issue` twice | (a) share one `issue_id`; (b) never fall back after the remote call was sent; (c) make `logIssue` idempotent on `issue_id`; (d) `wait_for_completion: false` | **(a) + (c)**, and (d) in Kibana | K3: both paths end in `logIssue` (the Workflow calls our webhook), so only a receiver-side check stops the second annotation. It also covers the Workflow's own HTTP retries (delivery at least once needs an idempotent receiver). (b) alone can lose the issue if MCP hangs (K4) | Logic plus 3 tests: same id on both paths; webhook then direct gives one annotation and one toast; two concurrent calls give one |
| 3 Workflow headers, `@timestamp` | (a) inline headers with string templates; (b) `${{ }}` object templating; for the timestamp: (c) `{{ execution.startedAt }}`; (d) let our server write the final issue document | **(a) + (d)** | (a) is correct however the object-template question resolves; every official example writes headers inline. (d) removes a dependency on an unverified template variable and keeps one writer for the record's shape (K2, K8). The Workflow still indexes and calls us, so it still "acts" (K7) | Evidence: Elastic workflow examples. Check on the day: Discover shows `@timestamp` on the issue |
| 4 Search over MCP | (a) `index_search` tool with `{nlQuery}`; (b) ES\|QL tool: `MATCH` on text + `text_semantic`, then `RERANK`; (c) don't expose search over MCP | **(b)**, with the existing direct twin as the automatic fallback | (a) runs Elastic's own LLM (slow, non-deterministic, bypasses our tuning). (b) is deterministic and creatable by our script, and it is the strongest Elastic-prize evidence (K7). The copilot's main retrieval stays the direct `retrieve()` prefetch, so MCP search only serves follow-ups | Test: query rendering for each env combination. On the day: `elastic:setup` calls each tool once through MCP and prints the result |
| 5 MCP result shape | (a) unwrap in `mcp.ts`, then reshape per tool to the direct twin's keys; (b) change the direct twins to Elastic's column shape; (c) leave both and tell the model | **(a)** | The direct twins' shapes are already the contract tests rely on. (b) changes more code (K2). (c) pushes inconsistency onto the model (K1) | Evidence: Kibana `tool_result.ts`. Tests: unwrap of the documented wrapper; MCP and direct give the same keys |
| 6 Camera boxes | (a) call `PassthroughCameraAccess.WorldToViewportPoint`, flip v; (b) convert Meta's intrinsics and keep our pinhole maths; (c) project on the server | **(a)** | K5: Meta's function already handles the sensor crop and offset; our own formula was wrong once. The server never needs intrinsics because the device sends pixel boxes (K2) | EditMode tests on the box maths with a stand-in projection; on device: the Director overlay (blueprint test 12) |
| 7 SDKs | openai: (a) `^7`, keep Chat Completions; (b) `^7` and move to the Responses API; (c) stay on v4. ElevenLabs and `sharp`: (d) install now; (e) install with their first use | **(a) + (e)** | (a): OpenAI still supports Chat Completions, and our only call site is unchanged in v7 (K2). New copilot code uses the Responses API. (e): every commit's dependencies are used, and a 30 MB native package doesn't sit on a 6 GB disk before it's needed | Typecheck and tests; `pnpm llm:smoke` (gate G0: image in, strict JSON out) |
| 8 QR sampling | (a) keep a sample only when the pose changes, K = 5, per-axis median; (b) average every frame; (c) one read | **(a)** | MRUK updates QR poses at about 1 Hz (MRUK source), so (b) repeats one measurement about 70 times and fakes confidence. A median of 5 tolerates 2 bad reads with no tuning, which is simpler than a z-score window (K2) | EditMode tests: repeats count once, untracked reads are ignored, an outlier is rejected |
| 9 E7 rise | (a) world-height clip in the shader; (b) re-pivot the GLB, then scale Y; (c) translate up while clipping | **(a)** | Desk parts (centre pivots) and E7 parts (origin pivots) both squash under scaling, so one clip handles both (DRY). No asset re-export. `renderer.bounds` is already in world space, whatever the pivot | Logic (the clip plane is world-space); Editor check with `e7.glb` |

## Task order and owners

| Part | Tasks | Owner | Runs here? |
|---|---|---|---|
| A · Server and knowledge (fixes 1–5, 7, and the semantic-branch filter) | A1–A7 | Michael | Yes: Vitest |
| B · Copilot building blocks (Rhythm's borrowed pieces) | B1–B3 | Rhythm, on the server | B1–B2 yes; B3 needs an ElevenLabs key |
| C · Device (fixes 6, 8, 9, and A1's solver) | C1–C5 | Rhythm, A1, A2 | EditMode tests need the Unity project; `apps/quest` doesn't exist yet |

A before B (B1 changes `llm.ts`, A7 upgrades its SDK). C is independent of A and B.

---
# Part A — Server and knowledge (Michael)

### Task A1: Agent Builder param types (fix 1)

**Files:**
- Modify: `knowledge/agent-builder/tools/cutonce_build_history.json`, `cutonce_find_parts.json`, `cutonce_lookup_material.json` (the `"type"` inside `params`)
- Test: `services/api/tests/tool-defs.test.ts` (new)

**Interfaces:** Produces: the regression test that A4's new tool file must also pass.

- [ ] **Step 1: Write the failing test**

```ts
// services/api/tests/tool-defs.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";

// Kibana 9.4 x-pack/.../agent_builder/.../esql/schemas.ts accepts only these param types.
const ALLOWED = ["string", "integer", "float", "boolean", "date", "array"];
const dir = join(REPO_ROOT, "knowledge", "agent-builder", "tools");
const tools = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: JSON.parse(readFileSync(join(dir, f), "utf8")) }));

it("every ES|QL tool param uses a type Kibana 9.4 accepts", () => {
  for (const { f, t } of tools.filter(({ t }) => t.type === "esql"))
    for (const [name, p] of Object.entries<{ type: string }>(t.configuration.params ?? {})) expect(ALLOWED, `${f} ${name}`).toContain(p.type);
});

it("every ?param in a query is declared, and every declared param is used", () => {
  for (const { f, t } of tools.filter(({ t }) => t.type === "esql")) {
    const used = [...new Set([...t.configuration.query.matchAll(/\?([a-z_]+)/g)].map((m: RegExpMatchArray) => m[1]))].sort();
    expect(Object.keys(t.configuration.params ?? {}).sort(), f).toEqual(used);
  }
});
```

- [ ] **Step 2: Run it.** `pnpm -F @cutonce/api test tests/tool-defs.test.ts`. Expected: FAIL on the first test (`keyword`, `text` not allowed); the second passes.
- [ ] **Step 3: Fix the three files.**

```bash
sed -i '' 's/"type": "keyword"/"type": "string"/; s/"type": "text"/"type": "string"/' knowledge/agent-builder/tools/cutonce_build_history.json knowledge/agent-builder/tools/cutonce_find_parts.json knowledge/agent-builder/tools/cutonce_lookup_material.json
```

- [ ] **Step 4: Run it.** Expected: PASS (2 tests).
- [ ] **Step 5: Commit.** `git commit -am "fix(knowledge): Agent Builder ES|QL params use 9.4 types; regression test"`

---

### Task A2: One result shape for MCP and direct answers (fix 5)

**Files:**
- Modify: `services/api/src/search/mcp.ts:27-34` (`mcpCall`), add `unwrapAgentBuilder`
- Modify: `services/api/src/search/tools.ts` (add `REMOTE_SHAPE`, use it in `callKnowledgeTool`)
- Test: `services/api/tests/knowledge.test.ts` (add cases; update the one "uses MCP when it answers" expectation)

**Interfaces:**
- Produces: `unwrapAgentBuilder(value: unknown): unknown`, exported from `mcp.ts`. It returns row objects for `esql_results`, `data` for other result types, and throws for `type: "error"`.
- Produces: `callKnowledgeTool` returns the same top-level keys from either path: `{chunks}`, `{parts}`, `{materials}`, `{report, events}`, `{ok, issue_id}`.

- [ ] **Step 1: Write the failing tests** (append to `knowledge.test.ts`)

```ts
import { unwrapAgentBuilder } from "../src/search/mcp.js";

describe("Agent Builder result shape", () => {
  // Shape from Kibana 9.4 agent-builder-common/tools/tool_result.ts, returned as JSON text over MCP.
  const wrapped = { results: [{ type: "esql_results", data: { columns: [{ name: "part_id", type: "keyword" }, { name: "name", type: "text" }], values: [["part_tabletop", "Tabletop"]] } }] };
  it("turns ES|QL columns into row objects", () =>
    expect(unwrapAgentBuilder(wrapped)).toEqual([{ part_id: "part_tabletop", name: "Tabletop" }]));
  it("throws on an error result so the caller falls back", () =>
    expect(() => unwrapAgentBuilder({ results: [{ type: "error", data: { message: "boom" } }] })).toThrow(/boom/));
  it("passes unwrapped values through", () => expect(unwrapAgentBuilder({ parts: [] })).toEqual({ parts: [] }));
  it("gives MCP answers the direct twin's keys", async () => {
    const rows = [{ part_id: "part_left_rear_leg", name: "Left rear leg" }];
    const viaMcp = await callKnowledgeTool(t.app.ctx, "find_parts", { query: "rear leg" }, { remote: async () => rows });
    const direct = await callKnowledgeTool(t.app.ctx, "find_parts", { query: "rear leg" });
    expect(Object.keys((viaMcp as any).data)).toEqual(Object.keys((direct as any).data));
  });
});
```

Also change the existing expectation in "falls back when MCP errors, and uses MCP when it answers" from `data: { name: "cutonce_find_parts" }` to `data: { parts: { name: "cutonce_find_parts" } }`.

- [ ] **Step 2: Run.** `pnpm -F @cutonce/api test tests/knowledge.test.ts`. Expected: FAIL (`unwrapAgentBuilder` is not exported; the shape test fails).
- [ ] **Step 3: Implement.** In `mcp.ts`, add below `mcpListTools`:

```ts
/** Agent Builder wraps every answer as {"results":[{type, data}]}. Return plain rows so MCP and the direct twins agree. */
export function unwrapAgentBuilder(value: unknown): unknown {
  const first = (value as { results?: { type?: string; data?: any }[] } | null)?.results?.[0];
  if (!first) return value;
  if (first.type === "error") throw new Error(`Agent Builder tool error: ${JSON.stringify(first.data).slice(0, 200)}`);
  if (first.type === "esql_results" && Array.isArray(first.data?.columns) && Array.isArray(first.data?.values)) {
    const cols = first.data.columns as { name: string }[];
    return (first.data.values as unknown[][]).map((row) => Object.fromEntries(cols.map((c, i) => [c.name, row[i]])));
  }
  return first.data;
}
```

and replace the last line of `mcpCall`:

```ts
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : res.structuredContent ?? res.content; } catch { return text; }
  return unwrapAgentBuilder(parsed);
```

In `tools.ts`, add below `REMOTE_NAME`:

```ts
/** Reshape MCP rows into the direct twin's shape, so the copilot sees one format per tool. */
const REMOTE_SHAPE: Record<ToolName, (rows: unknown, sent: Record<string, unknown>) => unknown> = {
  search_documents: (rows) => ({ chunks: rows }),
  find_parts: (rows) => ({ parts: rows }),
  lookup_material: (rows) => ({ materials: rows }),
  build_history: (rows) => ({ report: "events", events: rows }),
  log_issue: (_rows, sent) => ({ ok: true, issue_id: sent.issue_id }),
};
```

and change the MCP line in `callKnowledgeTool`:

```ts
    const sent = remoteArgs(ctx, name, args);
    try { return { ok: true, data: REMOTE_SHAPE[name](await timeout(remote(REMOTE_NAME[name], sent), opts.timeoutMs ?? 2000), sent), via: "mcp" }; }
```

- [ ] **Step 4: Run** the API suite: `pnpm -F @cutonce/api test`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "fix(knowledge): unwrap Agent Builder results; MCP and direct answers share one shape"`

---

### Task A3: `log_issue` is recorded once, however it arrives (fix 2)

**Files:**
- Modify: `services/api/src/search/tools.ts` (`callKnowledgeTool`: make the id once; `remoteArgs` log_issue: use it)
- Modify: `services/api/src/search/fallbacks.ts` (`directTools.log_issue` uses `args.issue_id`; `logIssue` becomes idempotent)
- Test: `services/api/tests/knowledge.test.ts`

**Interfaces:**
- Produces: `logIssue(...)` returns `{ ok: true, issue_id, duplicate?: true }`, and never appends or broadcasts twice for one `issue_id`.

**Why the receiver check matters (logic):** the Workflow's HTTP step retries up to 3 times, and our MCP call falls back after 2 s. Both mean the same issue can reach `logIssue` more than once. Only a check where the record is written makes that harmless. The check and the "seen" mark are both synchronous, so two calls can't interleave between them in Node's single thread.

- [ ] **Step 1: Write the failing tests**

```ts
describe("log_issue is idempotent", () => {
  it("both paths carry the same issue_id", async () => {
    let sent: any;
    const r = await callKnowledgeTool(t.app.ctx, "log_issue", { part_id: "part_left_rear_leg", note: "thread damaged" },
      { timeoutMs: 50, remote: (_n, a) => { sent = a; return new Promise(() => undefined); } });
    expect(r).toMatchObject({ ok: true, via: "direct" });
    expect((r as any).data.issue_id).toBe(sent.issue_id);
  });
  it("webhook then direct: one annotation, one toast", async () => {
    const toasts: unknown[] = [];
    t.app.ctx.store.bus.on("broadcast", (m) => { if (m.type === "issue_logged") toasts.push(m); });
    await post("/v1/webhooks/issue", { issue_id: "issue_dup_1", part_id: "part_left_rear_leg", note: "n" });
    const again = await logIssue(t.app.ctx, { issue_id: "issue_dup_1", part_id: "part_left_rear_leg", note: "n" });
    expect(again).toMatchObject({ duplicate: true });
    const aid = t.app.ctx.store.currentAssembly()!.assembly_id;
    expect(t.app.ctx.store.getEvents(aid).events.filter((e) => e.note?.startsWith("issue_dup_1:"))).toHaveLength(1);
    expect(toasts).toHaveLength(1);
  });
  it("two concurrent calls write once", async () => {
    await Promise.all([1, 2].map(() => logIssue(t.app.ctx, { issue_id: "issue_dup_2", part_id: null, note: "n" })));
    const aid = t.app.ctx.store.currentAssembly()!.assembly_id;
    expect(t.app.ctx.store.getEvents(aid).events.filter((e) => e.note?.startsWith("issue_dup_2:"))).toHaveLength(1);
  });
});
```

(Import `logIssue` from `../src/search/fallbacks.js`.)

- [ ] **Step 2: Run.** Expected: FAIL (different ids; two annotations).
- [ ] **Step 3: Implement.** In `tools.ts`, add `import { ulid } from "ulid";`. At the top of `callKnowledgeTool`, after the unknown-tool check:

```ts
  // A mutating tool gets its id once, so the MCP path and the fallback describe the same issue.
  if (name === "log_issue" && typeof args.issue_id !== "string") args = { ...args, issue_id: `issue_${ulid().toLowerCase()}` };
```

In `remoteArgs`, the log_issue line becomes:

```ts
  if (name === "log_issue") return { issue_id: args.issue_id, part_id: args.part_id ?? "", note: args.note ?? "" };
```

In `fallbacks.ts`, `directTools.log_issue` becomes:

```ts
  log_issue: async (ctx, a) => logIssue(ctx, { issue_id: str(a.issue_id) || `issue_${ulid().toLowerCase()}`, part_id: str(a.part_id) || null, note: str(a.note) || "Issue logged", photo_ref: str(a.photo_ref) || undefined }),
```

and at the start of `logIssue`, replacing its first line:

```ts
const issuesSeen = new Set<string>(); // module level, above logIssue

  const current = ctx.store.currentAssembly();
  // Idempotent on issue_id: the Workflow retries, and the MCP fallback may race it. Check and mark synchronously.
  const onDisk = current ? ctx.store.getEvents(current.assembly_id).events.some((e) => e.kind === "annotation" && e.note?.startsWith(`${issue.issue_id}:`)) : false;
  if (issuesSeen.has(issue.issue_id) || onDisk) return { ok: true, issue_id: issue.issue_id, duplicate: true };
  issuesSeen.add(issue.issue_id);
```

- [ ] **Step 4: Run** the API suite. Expected: all pass (the existing webhook test still gets `{ok, issue_id}` on the first call).
- [ ] **Step 5: Commit.** `git commit -am "fix(knowledge): log_issue shares one id across paths and is idempotent at the receiver"`

---
### Task A4: `search_documents` as a deterministic ES|QL tool (fix 4)

**Files:**
- Create: `knowledge/agent-builder/tools/cutonce_search_documents.json`
- Create: `services/api/src/search/toolQuery.ts` (`renderToolQuery`)
- Modify: `services/api/src/cli/elastic-setup.ts` (render queries before POST; one MCP smoke call per tool; update the closing message)
- Modify: `services/api/src/search/tools.ts` (`remoteArgs` for search_documents)
- Test: `services/api/tests/tool-defs.test.ts` (A1's tests now also cover the new file), `services/api/tests/toolQuery.test.ts` (new)

**Interfaces:**
- Produces: `renderToolQuery(query: string, cfg: Pick<Config, "jinaEmbedId" | "jinaRerankId">): string`
- The tool takes one param, `query` (string). `part_id` is not sent; the direct twin still applies the part boost.

**Why this query (evidence):** ES|QL `MATCH` works on `text` and on `semantic_text`, and `RERANK` is generally available in 9.4 (Elasticsearch docs, `rerank.md`). Nobody has documented `RERANK` taking a named parameter as its query text. So the setup script tests the tool through MCP straight after creating it; if that fails, delete the `RERANK` segment from the JSON and re-run (1 line).

- [ ] **Step 1: Create the tool file**

```json
{
  "id": "cutonce_search_documents",
  "type": "esql",
  "description": "Search the Cut Once project's drawings, manual, parts list and site notes. Hybrid: keyword and Jina semantic match, reranked with Jina. Returns passages with their document, page and the part ids they mention.",
  "tags": ["cutonce", "search"],
  "configuration": {
    "query": "FROM cutonce-docs METADATA _score | WHERE MATCH(text, ?query) OR MATCH(text_semantic, ?query) | SORT _score DESC | LIMIT 30 | RERANK ?query ON text WITH { \"inference_id\": \"${JINA_RERANK_ID}\" } | SORT _score DESC | KEEP chunk_id, document_id, page, title, text, part_ids, _score | LIMIT 5",
    "params": { "query": { "type": "string", "description": "What the user is asking, in plain words" } }
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// services/api/tests/toolQuery.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { renderToolQuery } from "../src/search/toolQuery.js";

const q = JSON.parse(readFileSync(join(REPO_ROOT, "knowledge/agent-builder/tools/cutonce_search_documents.json"), "utf8")).configuration.query as string;

it("with both Jina ids: semantic match and rerank with the real id", () => {
  const r = renderToolQuery(q, { jinaEmbedId: ".jina-embeddings-v5-text-small", jinaRerankId: ".jina-reranker-v3" });
  expect(r).toContain("MATCH(text_semantic, ?query)");
  expect(r).toContain('"inference_id": ".jina-reranker-v3"');
});
it("without a reranker: no RERANK stage", () => expect(renderToolQuery(q, { jinaEmbedId: "x", jinaRerankId: "" })).not.toContain("RERANK"));
it("without embeddings: keyword match only", () => expect(renderToolQuery(q, { jinaEmbedId: "", jinaRerankId: "" })).not.toContain("text_semantic"));
it("never leaves a placeholder", () => {
  for (const cfg of [{ jinaEmbedId: "a", jinaRerankId: "b" }, { jinaEmbedId: "", jinaRerankId: "" }]) expect(renderToolQuery(q, cfg)).not.toContain("${");
});
```

- [ ] **Step 3: Run.** Expected: FAIL (`toolQuery.js` missing). A1's tests already pass on the new file (`string` type; `?query` declared).
- [ ] **Step 4: Implement `toolQuery.ts`**

```ts
import type { Config } from "../config.js";

/** Fits a tool's ES|QL to the cluster: drops the semantic branch or the rerank stage when their Jina endpoint is not configured. */
export function renderToolQuery(query: string, cfg: Pick<Config, "jinaEmbedId" | "jinaRerankId">): string {
  let q = query;
  if (!cfg.jinaEmbedId) q = q.replace(/ OR MATCH\(text_semantic, \?query\)/, "");
  if (!cfg.jinaRerankId) q = q.replace(/ \| RERANK [^|]+/, "");
  return q.replaceAll("${JINA_RERANK_ID}", cfg.jinaRerankId);
}
```

- [ ] **Step 5: Use it in `elastic-setup.ts`.** Import `renderToolQuery` and `mcpCall`. Before POST/PUT, set `tool.configuration.query = renderToolQuery(tool.configuration.query, cfg)` (type the configuration as `{ query: string; params?: object }`). After the MCP listing, add the smoke calls:

```ts
const SMOKE: Record<string, Record<string, unknown>> = {
  cutonce_search_documents: { query: "where does the power cable go" }, cutonce_find_parts: { query: "rear leg" },
  cutonce_lookup_material: { text: "leg" }, cutonce_build_history: { assembly_id: "asm_run_001" },
};
for (const [tool, args] of Object.entries(SMOKE)) {
  try { const rows = await mcpCall(cfg, tool, args); console.log(`  smoke ok    ${tool}: ${Array.isArray(rows) ? rows.length : "?"} rows`); }
  catch (err) { console.log(`  smoke FAIL  ${tool}: ${(err as Error).message.slice(0, 160)}`); }
}
```

Replace the closing message's "search_documents and log_issue are made in the Kibana UI" with "log_issue is made in the Kibana UI (see knowledge/README.md)".

- [ ] **Step 6: Map the args.** In `tools.ts` `remoteArgs`, add `if (name === "search_documents") return { query: args.query ?? "" };`.
- [ ] **Step 7: Run** the API suite and typecheck. Expected: all pass.
- [ ] **Step 8: Commit.** `git commit -am "feat(knowledge): hybrid + rerank search as a deterministic ES|QL Agent Builder tool; setup smoke-tests every tool"`

---

### Task A5: The Workflow's headers and one writer for the issue record (fix 3)

**Files:**
- Modify: `knowledge/workflows/log_issue.yaml` (consts, `http.with.headers`, drop `indexed: true`)
- Modify: `knowledge/README.md` ("Made by hand in Kibana" section)

**Why no code test:** the change is to a file Kibana runs, not our code. The logic: with `indexed` gone, our webhook calls `logIssue` with `alreadyIndexed = false`, so the server writes the complete issue document, `@timestamp` included, under the same id. That overwrites the Workflow's copy rather than duplicating it. Evidence on the day: Discover shows one document per issue, with `@timestamp`.

- [ ] **Step 1: Edit `log_issue.yaml`.** Replace the `auth_headers` const with a token, and write the headers inline, as Elastic's official examples do:

```yaml
consts:
  webhook_url: "https://YOUR-TUNNEL-OR-DOMAIN/v1/webhooks/issue"
  webhook_token: "YOUR_API_TOKEN"
```

```yaml
      headers:
        Authorization: "Bearer {{ consts.webhook_token }}"
        Content-Type: "application/json"
```

Delete the `indexed: true` line from the `body`. Add this comment under the header comment: `# 9.5+ and Serverless: move "inputs" under the manual trigger.`

- [ ] **Step 2: Rewrite the README section** "Made by hand in Kibana" to:

```markdown
## Made by hand in Kibana (once, about 3 minutes)
1. **Workflows → Create**: paste `knowledge/workflows/log_issue.yaml`, set `webhook_url` to the tunnel address and `webhook_token` to `API_TOKEN`, save, and run it once with a test input. The toast must appear on `/director`.
2. **Agent Builder → Tools → New → Workflow**: id `cutonce_log_issue`, pick the workflow, and **turn off waiting for completion**. Otherwise Agent Builder waits up to 120 s, our 2 s fallback fires, and the issue arrives twice (the server now ignores the second copy, but the reply is slower).
3. `pnpm elastic:setup` creates the other four tools (all ES|QL) and smoke-tests them.
```

- [ ] **Step 3: Commit.** `git commit -am "fix(knowledge): workflow headers inline; server writes the final issue record"`

---

### Task A6: The semantic branch honours the document-type filter (report fix 10)

**Files:**
- Modify: `services/api/src/search/retrieve.ts:12-30`
- Test: `services/api/tests/knowledge.test.ts`

**Why:** a "drawings only" search currently leaks other document types through the semantic branch (K1). The legacy `semantic` query still works in 9.4, so it stays as is (K2); only the filter changes.

- [ ] **Step 1: Write the failing test** (in `describe("search request")`)

```ts
  it("hybrid: both branches filter by project and document type", () => {
    const body = buildSearchBody(loadConfig({ JINA_EMBED_ID: "e" }), { ...q, docTypes: ["electrical"] }, "hybrid") as any;
    const semanticFilter = body.retriever.rrf.retrievers[1].standard.query.bool.filter;
    expect(semanticFilter).toContainEqual({ terms: { doc_type: ["electrical"] } });
  });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Pull the filter into one function used by both branches:

```ts
const filters = (q: RetrieveQuery) => [{ term: { project_id: q.projectId } }, ...(q.docTypes?.length ? [{ terms: { doc_type: q.docTypes } }] : [])];
```

In `bm25`, use `filter: filters(q)`. In `buildSearchBody`, delete `const filter = [...]` and use `filter: filters(q)` in the semantic branch.
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Add the Jina ids as hints** in `.env.example` (comments only, so an unconfigured cluster is never pointed at endpoints it lacks):

```
# Elastic Cloud 9.4+: .jina-embeddings-v5-text-small and .jina-reranker-v3 (9.5+: .jina-reranker-v3.5). Confirm with GET _inference/_all.
```

- [ ] **Step 6: Commit.** `git commit -am "fix(search): semantic branch honours docTypes; Jina id hints"`

**Deliberately not done now:** pinning `@elastic/elasticsearch` to `~9.4.0`. The right pin is the cluster's minor version, which we learn at gate G0. Pin then (one line), not on a guess.

---

### Task A7: OpenAI SDK v7, and gate G0 as a command (fix 7)

**Files:**
- Modify: `services/api/package.json` (`openai` → `^7`), `pnpm-lock.yaml`
- Create: `services/api/src/cli/llm-smoke.ts`; root script `llm:smoke`

**Why a smoke command, not a unit test:** the risk is whether *our key* can use *this model* with an image and strict JSON. That is gate G0, and only a real call answers it (K8). Mocking the SDK would test nothing we doubt.

- [ ] **Step 1: Upgrade.** `pnpm -F @cutonce/api add openai@^7`
- [ ] **Step 2: Verify nothing broke.** `pnpm -F @cutonce/api typecheck && pnpm -F @cutonce/api test`. Expected: both pass. `llm.ts` only calls `chat.completions.create`, which v7 keeps.
- [ ] **Step 3: Write the smoke command**

```ts
// services/api/src/cli/llm-smoke.ts — gate G0: can our key use the model with an image and strict JSON?
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { jsonCall } from "../llm.js";

const cfg = loadConfig();
const image = readFileSync(join(cfg.repoRoot, "data/e7/stages/footprints/L01.geom.png"));
const Answer = z.object({ fill_colour: z.string(), has_title_text: z.boolean() }).strict();
const started = Date.now();
try {
  const out = await jsonCall(cfg, { name: "smoke", schema: Answer, system: "Describe the image exactly.", text: "What colour is the filled shape, and is there a title at the top?", images: [{ data: image, mime: "image/png" }], timeoutMs: 30_000 });
  console.log(`G0 PASS  ${cfg.openaiModel}  ${Date.now() - started} ms  ${JSON.stringify(out)}`);
} catch (err) {
  console.error(`G0 FAIL  ${cfg.openaiModel}: ${(err as Error).message}. Try OPENAI_MODEL=gpt-5.6-terra.`);
  process.exit(1);
}
```

Root `package.json` script: `"llm:smoke": "pnpm -F @cutonce/api exec tsx --env-file-if-exists=../../.env.local src/cli/llm-smoke.ts"`.

- [ ] **Step 4: Run it once a key exists.** `pnpm llm:smoke`. Expected: `G0 PASS … {"fill_colour":"pink…","has_title_text":true}`. Record the milliseconds in `knowledge/README.md`; it's the first real latency number we'll have.
- [ ] **Step 5: Commit.** `git commit -am "chore(api): openai v7; pnpm llm:smoke runs gate G0"`

---
# Part B — Copilot building blocks (Rhythm, server side)

These are the three borrowed pieces the copilot endpoint (`POST …/copilot/query`, built separately) will be assembled from. Each is a small unit with its own check, so the endpoint work becomes wiring.

### Task B1: The model can only name real parts (strict ID lists)

**Files:**
- Create: `services/api/src/copilot/schema.ts`
- Modify: `services/api/src/llm.ts` (`JsonCall` gets an optional `jsonSchema`)
- Test: `services/api/tests/copilot-schema.test.ts`

**Interfaces:**
- Produces: `copilotAnswerSchema(partIds: readonly string[], chunkIds: readonly string[]): Record<string, unknown>` (a JSON Schema for strict mode)
- Produces: `CopilotAnswer` (Zod, for parsing), and `keepKnown(ids: readonly string[], allowed: readonly string[]): string[]`
- Produces: `JsonCall.jsonSchema?: Record<string, unknown>`. When set, it is sent as-is instead of converting the Zod schema.

**Options:** (a) post-filter invalid IDs after the answer; (b) put the allowed IDs in the prompt; (c) make the allowed IDs an `enum` in a schema built per request. **Chosen: (c), keeping (a) as a second check.** Why: strict mode forces the output to match the schema, enums included, so an invented `part_id` can't be produced at all; (b) is a request, not a guarantee (K1). The post-filter stays because a wrong-but-valid ID is still possible and the copilot path must never trust a model blindly (K4). `answer_text` is the first key, because output follows key order, which later lets speech start on the first sentence. That costs nothing now.

- [ ] **Step 1: Write the failing test**

```ts
// services/api/tests/copilot-schema.test.ts
import { expect, it } from "vitest";
import { CopilotAnswer, copilotAnswerSchema, keepKnown } from "../src/copilot/schema.js";

const s = copilotAnswerSchema(["part_power_cable", "part_cable_tray"], ["chunk_desk_drawings_p2_1"]) as any;

it("lists exactly the allowed part and chunk ids", () => {
  expect(s.properties.highlight_parts.items.enum).toEqual(["part_power_cable", "part_cable_tray"]);
  expect(s.properties.chunk_ids.items.enum).toEqual(["chunk_desk_drawings_p2_1"]);
});
it("is strict: every key required, nothing extra, answer_text first", () => {
  expect(s.additionalProperties).toBe(false);
  expect(s.required).toEqual(Object.keys(s.properties));
  expect(Object.keys(s.properties)[0]).toBe("answer_text");
});
it("an empty list becomes a sentinel, never an empty enum", () =>
  expect((copilotAnswerSchema([], []) as any).properties.chunk_ids.items.enum).toEqual(["none"]));
it("parses a model answer and filters unknown ids", () => {
  const a = CopilotAnswer.parse({ answer_text: "Run it through the tray.", highlight_parts: ["part_power_cable", "none"], highlight_style: "path", chunk_ids: ["none"], action: null, confidence: 0.9, needs_clarification: false });
  expect(keepKnown(a.highlight_parts, ["part_power_cable"])).toEqual(["part_power_cable"]);
});
```

- [ ] **Step 2: Run.** `pnpm -F @cutonce/api test tests/copilot-schema.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `schema.ts`**

```ts
import { z } from "zod";

const oneOf = (list: readonly string[]) => ({ type: "string", enum: list.length ? [...list] : ["none"] });

/** Built per question: the model may only name parts in this plan and passages it was actually given. */
export function copilotAnswerSchema(partIds: readonly string[], chunkIds: readonly string[]): Record<string, unknown> {
  const properties = {
    answer_text: { type: "string", description: "At most two short spoken sentences. Say part names, never ids." },
    highlight_parts: { type: "array", items: oneOf(partIds) },
    highlight_style: { type: "string", enum: ["pulse", "path"] },
    chunk_ids: { type: "array", items: oneOf(chunkIds) },
    action: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["type", "part_ids", "new_state"],
      properties: { type: { type: "string", enum: ["mark_state"] }, part_ids: { type: "array", items: oneOf(partIds) }, new_state: { type: "string", enum: ["missing", "built", "wrong"] } } }] },
    confidence: { type: "number" },
    needs_clarification: { type: "boolean" },
  };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

export const CopilotAnswer = z.object({
  answer_text: z.string(), highlight_parts: z.array(z.string()), highlight_style: z.enum(["pulse", "path"]), chunk_ids: z.array(z.string()),
  action: z.object({ type: z.literal("mark_state"), part_ids: z.array(z.string()), new_state: z.enum(["missing", "built", "wrong"]) }).nullable(),
  confidence: z.number(), needs_clarification: z.boolean(),
});

/** Second check after the schema: drop the sentinel and anything not in the plan. */
export const keepKnown = (ids: readonly string[], allowed: readonly string[]) => ids.filter((id) => id !== "none" && allowed.includes(id));
```

In `llm.ts`, add `jsonSchema?: Record<string, unknown>;` to `JsonCall`, and change the schema line to `schema: call.jsonSchema ?? toOpenAiSchema(call.strictSchema ?? call.schema)`.

- [ ] **Step 4: Run** the suite and typecheck. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(copilot): per-question strict schema; model can only name real parts and given passages"`

---

### Task B2: Numbered part boxes drawn on the camera frame (Set-of-Mark)

**Files:**
- Modify: `services/api/package.json` (add `sharp`, with its first use)
- Create: `services/api/src/copilot/annotate.ts`
- Test: `services/api/tests/annotate.test.ts`

**Interfaces:**
- Produces: `annotateFrame(jpeg: Buffer, marks: Mark[], width?: number): Promise<Buffer>`, where `Mark = { n: number; bbox_px: [x, y, w, h]; state: "missing" | "built" | "wrong" }`. `bbox_px` is top-left origin, the same order as the context packet.

**Options:** (a) draw boxes with `sharp` plus one SVG overlay; (b) node-canvas; (c) send boxes only as numbers in the text. **Chosen: (a).** `sharp` is the report's pick (Apache-2.0, prebuilt binaries, no system Cairo like node-canvas needs). (c) gives the model coordinates it must imagine; the evidence that drawn marks help grounding is from GPT-4V (Flickr30k R@1 84.4 → 89.2, SoM paper), and is untested on GPT-5-class models, so the raw frame is also sent. One trap from the research: `sharp` resizes *before* compositing, so the SVG is sized to the resized frame.

- [ ] **Step 1: Install.** `pnpm -F @cutonce/api add sharp`
- [ ] **Step 2: Write the failing test**

```ts
// services/api/tests/annotate.test.ts
import sharp from "sharp";
import { expect, it } from "vitest";
import { annotateFrame } from "../src/copilot/annotate.js";

it("resizes to 1024 wide, keeps 4:3, and draws the box in its state colour", async () => {
  const frame = await sharp({ create: { width: 1280, height: 960, channels: 3, background: "#202020" } }).jpeg().toBuffer();
  const out = await annotateFrame(frame, [{ n: 1, bbox_px: [640, 480, 200, 200], state: "missing" }]);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([1024, 768]);
  const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  const [r, g, b] = px(Math.round(640 * 0.8), Math.round(580 * 0.8)); // centre of the box's left edge (x = 512), half-way down
  expect(r).toBeLessThan(90); expect(g).toBeGreaterThan(150); expect(b).toBeGreaterThan(150); // cyan (#00e5ff), allowing JPEG blur
  expect(px(10, 10)[0]).toBeLessThan(60); // the background is untouched
});
```

- [ ] **Step 3: Run.** Expected: FAIL (module missing).
- [ ] **Step 4: Implement `annotate.ts`**

```ts
import sharp from "sharp";

export interface Mark { n: number; bbox_px: [number, number, number, number]; state: "missing" | "built" | "wrong" }
const COLOUR: Record<Mark["state"], string> = { missing: "#00e5ff", built: "#39ff14", wrong: "#ff3b3b" };

/** Draws numbered part boxes on the frame. The number ↔ part_id table goes in the prompt text. */
export async function annotateFrame(jpeg: Buffer, marks: Mark[], width = 1024): Promise<Buffer> {
  const meta = await sharp(jpeg).metadata();
  const scale = width / (meta.width ?? width);
  const height = Math.round((meta.height ?? width) * scale);
  const shapes = marks.map(({ n, bbox_px, state }) => {
    const [x, y, w, h] = bbox_px.map((v) => Math.round(v * scale));
    const c = COLOUR[state], ty = Math.max(0, y - 22);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="3"/>` +
      `<rect x="${x}" y="${ty}" width="30" height="22" fill="${c}"/><text x="${x + 7}" y="${ty + 17}" font-size="17" font-family="Helvetica, Arial, sans-serif" fill="#000">${n}</text>`;
  }).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`);
  return sharp(jpeg).resize(width, height).composite([{ input: svg }]).jpeg({ quality: 80 }).toBuffer();
}
```

- [ ] **Step 5: Run** the suite. Expected: PASS. Then look at one output by eye: write it to `data/runtime/annotate-check.jpg` in a scratch run. The number labels need system fonts (fine on the Mac that hosts the server).
- [ ] **Step 6: Commit.** `git commit -am "feat(copilot): annotateFrame draws numbered part boxes (Set-of-Mark) with sharp"`

---

### Task B3: Streamed speech from ElevenLabs

**Files:**
- Modify: `services/api/package.json` (add `@elevenlabs/elevenlabs-js`); `services/api/src/config.ts` (add `elevenVoiceId` from `ELEVENLABS_VOICE_ID`); `.env.example` (add `ELEVENLABS_VOICE_ID=`)
- Create: `services/api/src/copilot/speech.ts`, `services/api/src/cli/tts-smoke.ts`; root script `tts:smoke`

**Interfaces:** Produces: `streamSpeech(cfg: Config, text: string)`, returning the SDK's stream (async-iterable in Node 22; let TypeScript infer the type) of raw 16-bit PCM at 22 050 Hz, mono.

**Options:** (a) SDK `textToSpeech.stream` with `pcm_22050`; (b) MP3 then decode on the headset; (c) the WebSocket input-streaming API. **Chosen: (a).** PCM plays directly in Unity's audio callback with no decoder (A2's `PcmStreamPlayer`). (c) only pays off once text streams sentence by sentence, which is a later latency step. `optimizeStreamingLatency: 3`, not 4, because 4 turns off text normalisation and can mispronounce numbers like "70 cm" (SDK source).

**Why no unit test:** a mocked SDK proves nothing we doubt. The questions are latency and byte order (the report lists PCM byte order as unverified), and only a real call with a listen answers them (K8).

- [ ] **Step 1: Install.** `pnpm -F @cutonce/api add @elevenlabs/elevenlabs-js`
- [ ] **Step 2: Implement `speech.ts`**

```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Config } from "../config.js";

/** Raw 16-bit PCM, 22.05 kHz, mono: plays straight into Unity's audio callback. */
export async function streamSpeech(cfg: Config, text: string) {
  if (!cfg.elevenKey || !cfg.elevenVoiceId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set");
  const client = new ElevenLabsClient({ apiKey: cfg.elevenKey });
  return client.textToSpeech.stream(cfg.elevenVoiceId, { text, modelId: "eleven_flash_v2_5", outputFormat: "pcm_22050", optimizeStreamingLatency: 3 });
}
```

- [ ] **Step 3: Write the smoke command** `src/cli/tts-smoke.ts`: call `streamSpeech` with "Run the cable through the tray to the right rear leg, then clip it down the leg every 20 centimetres.", record milliseconds to the first chunk and the total bytes, write `data/runtime/tts-smoke.pcm`, print both numbers and the play command. Root script: `"tts:smoke": "pnpm -F @cutonce/api exec tsx --env-file-if-exists=../../.env.local src/cli/tts-smoke.ts"`.
- [ ] **Step 4: Run and listen** once keys exist:
```bash
pnpm tts:smoke
```
```bash
ffplay -autoexit -f s16le -ar 22050 -ch_layout mono data/runtime/tts-smoke.pcm
```
Pass: clear speech, and "20 centimetres" spoken correctly. Static means the byte order is wrong: try `-f s16be`, and tell A2 which one plays. Record the first-chunk time in `knowledge/README.md`.
- [ ] **Step 5: Commit.** `git commit -am "feat(copilot): streamed PCM speech via ElevenLabs Flash v2.5; tts:smoke"`

---
# Part C — Device (Rhythm, A1, A2)

`apps/quest` doesn't exist yet, so these tasks start once A1 has forked QuestCameraKit into it. Each class is pure C#: the Meta call is passed in, so the logic can be tested in the Editor (Window → General → Test Runner → EditMode) without taking the one headset (K6). One test assembly per module:

```json
// Assets/CutOnce/<Module>/Tests/CutOnce.<Module>.Tests.asmdef
{ "name": "CutOnce.<Module>.Tests", "references": ["CutOnce.<Module>", "UnityEngine.TestRunner", "UnityEditor.TestRunner"],
  "includePlatforms": ["Editor"], "overrideReferences": true, "precompiledReferences": ["nunit.framework.dll"],
  "defineConstraints": ["UNITY_INCLUDE_TESTS"], "autoReferenced": false }
```

### Task C1: Correct the blueprint and the scene settings (fixes 6, 8, boundary, world lock)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` (§5 transform 5, §5 calibration steps 2–3, §8 `BUILT_REPLAY`, risk 18)
- Modify (A1, in Unity): `Main.unity`, the `OVRManager` on `[XRRig]` and the `MRUK` object

**Why:** the blueprint is what four people build from; three of its statements are now known to be wrong (K1). The scene settings are one-click changes the research found in the fork: QR tracking is on from startup, world lock is on, and the boundary flag is off.

- [ ] **Step 1: Replace the blueprint text** (run from the repo root):

```bash
python3 - <<'PY'
p = "docs/superpowers/specs/2026-09-18-cut-once-blueprint.md"; s = open(p).read()
R = [
 ("`p_C = T_W_C⁻¹ · p_W`; visible if `p_C.z > 0.1`; `u = cx + fx·p_C.x / p_C.z`; `v = cy − fy·p_C.y / p_C.z`.\n   The sign of `v` and any lens-distortion handling come from Meta's CameraToWorld sample.",
  "Call Meta's `PassthroughCameraAccess.WorldToViewportPoint(p_W, cachedPose)`; viewport (0,0) is the image's bottom-left, so JPEG pixels are `u = vp.x·W`, `v = (1 − vp.y)·H`. Reject points behind the camera (dot product with the camera's forward). Meta's intrinsics are in sensor pixels on a centred crop, so never plug them straight into JPEG maths; there is no lens-distortion model in Meta's code. The device sends pixel boxes, so the server needs no intrinsics."),
 ("collect **K = 8 centre samples** while head speed is under 5 cm/s. Centre = `trackable.transform.TransformPoint(PlaneRect.center)`. Take the per-axis median. MRUK updates QR poses \"at a lower frequency\"; measure the real rate at gate G3 and tune K.",
  "collect **K = 5 centre samples**, keeping a sample only when the pose has changed and `IsTracked` is true: MRUK updates QR poses at about 1 Hz and has no update event, so every-frame reads repeat one measurement. Sample all markers in parallel (about 5 s). Centre = `TransformPoint(PlaneRect.Value.center)`, falling back to `transform.position` when `PlaneRect` is null. Take the per-axis median."),
 ("Meta does not document which local axis is the normal, so at G3 drop an axis gizmo on a trackable and record the answer in `QrAlignmentSource`.",
  "MRUK's code puts the plane in local XY, so the normal is `transform.forward`; confirm with a gizmo at G3."),
 ("| Rises into place over 0.4 s |", "| Revealed bottom-up over 0.4 s by a world-height clip in the shader (pivots differ, so never scale) |"),
 ("suppress the boundary (`shouldBoundaryVisibilityBeSuppressed` on OVRManager plus the boundaryless manifest flag, which sideloaded builds may use)",
  "suppress the boundary with `OVRManager.shouldBoundaryVisibilityBeSuppressed` only (the fork already has the permission; the boundaryless manifest flag is an alternative, not an addition)"),
]
for old, new in R:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new)
open(p, "w").write(s); print("blueprint corrected:", len(R))
PY
```

Expected: `blueprint corrected: 5`.

- [ ] **Step 2 (A1, in Unity): scene settings.**
  - `OVRManager` → **Should Boundary Visibility Be Suppressed = on**. Add one line in `AlignmentController.Start`: `OVRManager.BoundaryVisibilityChanged += v => Debug.Log($"[CutOnce] boundary visibility: {v}");`
  - `MRUK` → **Enable World Lock = off** (no MRUK room is loaded; world lock rewrites the rig's tracking space).
  - `MRUK` scene settings → QR tracking **off at startup**. `QrAlignmentSource` switches it on when entering `Scanning` and off after Lock, using the copy/modify/assign pattern from the fork's `QRCodeManager.cs` (lines 52–65).
  - Don't `Destroy` a trackable when it's lost; keep the reference and check `IsTracked`.
- [ ] **Step 3: Validate on device.** In a room the headset has never seen: no boundary prompt appears, the log prints `boundary visibility: Suppressed`, and QR tracking is off until Scanning (blueprint test 18).
- [ ] **Step 4: Commit.** `git commit -am "docs+quest: correct projection, QR sampling, reveal and boundary; scene settings"`

---

### Task C2: Camera-frame boxes from Meta's projection (fix 6, Rhythm)

**Files:**
- Create: `apps/quest/Assets/CutOnce/Copilot/Projection/PartProjector.cs`
- Test: `apps/quest/Assets/CutOnce/Copilot/Tests/PartProjectorTests.cs`

**Interfaces:**
- Produces: `PartProjector.TryProject(Bounds world, Func<Vector3, Vector3> worldToViewport, Func<Vector3, float> depth, int width, int height, out Rect boxPx, out float inFrame): bool`
- On device, `worldToViewport = p => pca.WorldToViewportPoint(p, cachedPose)`, with `cachedPose = pca.GetCameraPose()` read in the same step as `GetColors()`. `depth = p => Vector3.Dot(p - cachedPose.position, cachedPose.forward)`.
- Review fix (2026-09-19): the box is clipped at 0.1 m in front of the camera along its 12 edges, so a part that runs behind the operator (the tabletop) is kept rather than dropped. The code on disk supersedes the listing below.

- [ ] **Step 1: Write the failing tests**

```csharp
using NUnit.Framework; using UnityEngine; using CutOnce.Copilot;

public class PartProjectorTests {
    // Stand-in camera: viewport = world x/y shifted by 0.5, so (0,0,z) is the image centre.
    static Vector3 Vp(Vector3 p) => new Vector3(p.x + 0.5f, p.y + 0.5f, p.z);
    static bool Front(Vector3 p) => p.z > 0.1f;

    [Test] public void CentredBoxMapsToTopLeftPixels() {
        Assert.IsTrue(PartProjector.TryProject(new Bounds(new Vector3(0, 0, 1), new Vector3(0.2f, 0.2f, 0.2f)), Vp, Front, 1280, 960, out var r, out var f));
        Assert.AreEqual(0.4f * 1280, r.x, 0.5f); Assert.AreEqual(0.4f * 960, r.y, 0.5f);
        Assert.AreEqual(0.2f * 1280, r.width, 0.5f); Assert.AreEqual(1f, f, 1e-4f);
    }
    [Test] public void HigherInTheWorldIsSmallerYInThePhoto() {   // the vertical flip
        PartProjector.TryProject(new Bounds(new Vector3(0, 0.3f, 1), Vector3.one * 0.1f), Vp, Front, 1280, 960, out var top, out _);
        PartProjector.TryProject(new Bounds(new Vector3(0, -0.3f, 1), Vector3.one * 0.1f), Vp, Front, 1280, 960, out var bottom, out _);
        Assert.Less(top.y, bottom.y);
    }
    [Test] public void BehindTheCameraIsRejected() =>
        Assert.IsFalse(PartProjector.TryProject(new Bounds(new Vector3(0, 0, -1), Vector3.one * 0.1f), Vp, Front, 1280, 960, out _, out _));
    [Test] public void HalfOffScreenReportsInFrameAboutHalf() {
        PartProjector.TryProject(new Bounds(new Vector3(0.5f, 0, 1), new Vector3(0.2f, 0.2f, 0.2f)), Vp, Front, 1280, 960, out var r, out var f);
        Assert.AreEqual(0.5f, f, 0.01f); Assert.LessOrEqual(r.xMax, 1280f);
    }
}
```

- [ ] **Step 2: Run** in the Test Runner. Expected: FAIL (type missing).
- [ ] **Step 3: Implement**

```csharp
using System; using UnityEngine;
namespace CutOnce.Copilot {
    /// <summary>A part's box in JPEG pixels (top-left origin). Uses Meta's projection rather than our own camera maths.</summary>
    public static class PartProjector {
        public static bool TryProject(Bounds world, Func<Vector3, Vector3> worldToViewport, Func<Vector3, bool> inFront,
                                      int width, int height, out Rect boxPx, out float inFrame) {
            boxPx = default; inFrame = 0f;
            Vector2 min = new(float.MaxValue, float.MaxValue), max = new(float.MinValue, float.MinValue);
            for (int i = 0; i < 8; i++) {
                var c = world.center + Vector3.Scale(world.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
                if (!inFront(c)) return false;                       // Meta's function does not reject points behind the camera
                var vp = worldToViewport(c);
                min = Vector2.Min(min, vp); max = Vector2.Max(max, vp);
            }
            float full = (max.x - min.x) * (max.y - min.y);
            Vector2 cmin = Vector2.Max(min, Vector2.zero), cmax = Vector2.Min(max, Vector2.one);
            if (cmax.x <= cmin.x || cmax.y <= cmin.y || full <= 0f) return false;
            inFrame = (cmax.x - cmin.x) * (cmax.y - cmin.y) / full;
            // Viewport (0,0) is bottom-left; JPEG (0,0) is top-left.
            boxPx = new Rect(cmin.x * width, (1f - cmax.y) * height, (cmax.x - cmin.x) * width, (cmax.y - cmin.y) * height);
            return true;
        }
    }
}
```

- [ ] **Step 4: Run.** Expected: 4 PASS.
- [ ] **Step 5: Validate on device** (blueprint test 12): the Director page draws `visible_parts` boxes over the received JPEG, and they sit on the real parts.
- [ ] **Step 6: Commit.** `git commit -am "feat(quest): PartProjector uses Meta's WorldToViewportPoint; vertical flip and behind-camera tested"`

---
### Task C3: QR samples that are real measurements (fix 8, A1)

**Files:**
- Create: `apps/quest/Assets/CutOnce/AR/Alignment/MarkerSampler.cs`
- Test: `apps/quest/Assets/CutOnce/AR/Tests/MarkerSamplerTests.cs`

**Interfaces:** Produces `MarkerSampler(int needed = 5)`, with `bool Offer(Vector3 centre, bool isTracked)`, `bool IsReady`, `int Count`, `Vector3 Median()`, `void Reset()`. `QrAlignmentSource` owns one per payload (`co:desk:m1..m3`) and calls `Offer` every frame from `MRUK.Instance.GetTrackables(list)`.

- [ ] **Step 1: Write the failing tests**

```csharp
using NUnit.Framework; using UnityEngine; using CutOnce.AR;

public class MarkerSamplerTests {
    [Test] public void RepeatedPoseCountsOnce() {
        var s = new MarkerSampler(5);
        for (int i = 0; i < 70; i++) s.Offer(new Vector3(0.2f, 0, 0.53f), true);   // ~70 frames of one 1 Hz measurement
        Assert.AreEqual(1, s.Count);
    }
    [Test] public void UntrackedReadsAreIgnored() {
        var s = new MarkerSampler(5);
        Assert.IsFalse(s.Offer(Vector3.one, false)); Assert.AreEqual(0, s.Count);
    }
    [Test] public void MedianRejectsOneBadRead() {
        var s = new MarkerSampler(5);
        foreach (var x in new[] { 0.200f, 0.201f, 0.199f, 0.200f, 0.260f }) s.Offer(new Vector3(x, 0, 0.53f), true);
        Assert.IsTrue(s.IsReady); Assert.AreEqual(0.200f, s.Median().x, 0.0005f);
    }
}
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**

```csharp
using System.Collections.Generic; using System.Linq; using UnityEngine;
namespace CutOnce.AR {
    /// <summary>Collects distinct QR centre measurements. MRUK refreshes QR poses at about 1 Hz (MRUK.Trackers.cs) and
    /// has no update event, so a reading identical to the last one is the same measurement and is skipped.</summary>
    public sealed class MarkerSampler {
        const float SameMeasurement = 1e-5f;                  // metres; real re-measurements of a still marker differ by more
        readonly int _needed; readonly List<Vector3> _samples = new(); Vector3? _last;
        public MarkerSampler(int needed = 5) { _needed = needed; }
        public int Count => _samples.Count;
        public bool IsReady => _samples.Count >= _needed;
        public bool Offer(Vector3 centre, bool isTracked) {
            if (!isTracked || IsReady) return false;
            if (_last.HasValue && (centre - _last.Value).sqrMagnitude < SameMeasurement * SameMeasurement) return false;
            _last = centre; _samples.Add(centre); return true;
        }
        /// <summary>Per-axis median: with 5 samples, up to 2 bad reads cannot move it.</summary>
        public Vector3 Median() {
            float M(IEnumerable<float> v) { var a = v.OrderBy(x => x).ToArray(); return a.Length % 2 == 1 ? a[a.Length / 2] : 0.5f * (a[a.Length / 2 - 1] + a[a.Length / 2]); }
            return new Vector3(M(_samples.Select(p => p.x)), M(_samples.Select(p => p.y)), M(_samples.Select(p => p.z)));
        }
        public void Reset() { _samples.Clear(); _last = null; }
    }
}
```

- [ ] **Step 4: Run.** Expected: 3 PASS.
- [ ] **Step 5: Validate on device (gate G3):** log each accepted sample with a timestamp. Expected: about 1 per second per marker, and all three markers ready in about 5–6 s. If samples arrive faster than once a second, the 1 Hz figure didn't hold; lower nothing, just note it.
- [ ] **Step 6: Commit.** `git commit -am "feat(quest): MarkerSampler keeps only fresh QR measurements; median of 5"`

---

### Task C4: The alignment solver, plus the borrowed three-point fit (A1)

**Files:**
- Create: `apps/quest/Assets/CutOnce/AR/Alignment/AlignmentSolver.cs`
- Copy: `apps/quest/Assets/CutOnce/AR/Alignment/ThirdParty/Kabsch.cs` from `https://github.com/zalo/MathUtilities/blob/master/Assets/Kabsch/Kabsch.cs` (Unlicense, public domain; keep its header and add a `// Source:` line)
- Test: `apps/quest/Assets/CutOnce/AR/Tests/AlignmentSolverTests.cs`

**Interfaces:** Produces `AlignmentSolver.SolveTwoPoint(a1, a2, w1, w2, out float baselineResidual, out float levelError): Pose`, `AlignmentSolver.Residual(Pose, Vector3 model, Vector3 world): float`, `AlignmentSolver.WorstResidual(Pose, Vector3[] model, Vector3[] world): float`, and `AlignmentSolver.RefineThreePoint(Pose initial, Vector3[] model, Vector3[] world, out float worstResidual, int calls = 5): Pose`. Model points are already in Unity space (X negated). Lock only if `worstResidual` < 4 mm: the rigid fit returns a pose even for swapped stickers (review fix 2026-09-19; the code on disk supersedes the listing below).

**Options for the tilt fallback:** (a) zalo's Kabsch (public domain, iterative); (b) write an SVD-based fit ourselves; (c) no fallback. **Chosen: (a), started from the two-point answer.** No licence concerns (K9). The research found it runs 9 iterations from its previous answer, so a large rotation may not converge from a cold start. Giving it only the small leftover tilt removes that risk. (c) leaves a tilted surface with no answer (blueprint risk 19).

**Why the two-point formula is right (logic):** in Unity, rotating about +Y by θ turns (0,0,1) into (sin θ, 0, cos θ), so a direction's heading `atan2(x, z)` grows by exactly θ. The yaw is therefore heading(world baseline) − heading(model baseline), and the translation is the mean of the two points' offsets after rotation.

- [ ] **Step 1: Write the failing tests**

```csharp
using NUnit.Framework; using UnityEngine; using CutOnce.AR;

public class AlignmentSolverTests {
    static readonly Vector3 A1 = new(-0.2f, 0, 0.53f), A2 = new(-0.8f, 0, 0.53f), A3 = new(-0.19f, 0, 0.08f);
    static Vector3 Apply(Pose p, Vector3 a) => p.position + p.rotation * a;

    [Test] public void RecoversKnownYawAndTranslation() {
        var truth = new Pose(new Vector3(1.2f, 0.74f, -2.0f), Quaternion.AngleAxis(37f, Vector3.up));
        var p = AlignmentSolver.SolveTwoPoint(A1, A2, Apply(truth, A1), Apply(truth, A2), out var baseline, out var level);
        Assert.Less(Vector3.Distance(Apply(p, A3), Apply(truth, A3)), 0.0005f);
        Assert.Less(baseline, 1e-4f); Assert.Less(level, 1e-4f);
    }
    [Test] public void ThirdMarkerCatchesATilt() {
        var tilted = new Pose(new Vector3(1.2f, 0.74f, -2.0f), Quaternion.AngleAxis(37f, Vector3.up) * Quaternion.AngleAxis(2f, Vector3.right));
        var p = AlignmentSolver.SolveTwoPoint(A1, A2, Apply(tilted, A1), Apply(tilted, A2), out _, out _);
        Assert.Greater(AlignmentSolver.Residual(p, A3, Apply(tilted, A3)), 0.004f);   // > 4 mm → switch to the three-point fit
    }
    [Test] public void ThreePointRefineFixesTheTilt() {
        var tilted = new Pose(new Vector3(1.2f, 0.74f, -2.0f), Quaternion.AngleAxis(37f, Vector3.up) * Quaternion.AngleAxis(2f, Vector3.right));
        var model = new[] { A1, A2, A3 }; var world = new[] { Apply(tilted, A1), Apply(tilted, A2), Apply(tilted, A3) };
        var p = AlignmentSolver.RefineThreePoint(AlignmentSolver.SolveTwoPoint(A1, A2, world[0], world[1], out _, out _), model, world);
        foreach (var i in new[] { 0, 1, 2 }) Assert.Less(Vector3.Distance(Apply(p, model[i]), world[i]), 0.001f);
    }
}
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Copy `Kabsch.cs`** from the URL above. Open it and confirm the solver's method: in that file it is `KabschSolver.SolveKabsch(Vector3[] inPoints, Vector4[] refPoints, …)` returning a `Matrix4x4` that maps `inPoints` onto `refPoints`, where `w` is each point's weight. If the signature differs, adapt the one call below.
- [ ] **Step 4: Implement**

```csharp
using UnityEngine;
namespace CutOnce.AR {
    public static class AlignmentSolver {
        /// <summary>Gravity-constrained fit from two points: yaw about +Y, then translation (blueprint §5).</summary>
        public static Pose SolveTwoPoint(Vector3 a1, Vector3 a2, Vector3 w1, Vector3 w2, out float baselineResidual, out float levelError) {
            Vector3 da = a2 - a1, dw = w2 - w1;
            float yawDeg = (Mathf.Atan2(dw.x, dw.z) - Mathf.Atan2(da.x, da.z)) * Mathf.Rad2Deg;   // AngleAxis takes degrees
            var r = Quaternion.AngleAxis(yawDeg, Vector3.up);
            var t = 0.5f * ((w1 - r * a1) + (w2 - r * a2));
            baselineResidual = Mathf.Abs(dw.magnitude - da.magnitude);            // headset scale is metric: catches a wrong sheet or print scale
            levelError = Mathf.Abs((w1.y - a1.y) - (w2.y - a2.y));                // only sees tilt along the m1–m2 line
            return new Pose(t, r);
        }
        /// <summary>Distance between where the pose puts a model point and where it was measured (the m3 check).</summary>
        public static float Residual(Pose p, Vector3 model, Vector3 world) => Vector3.Distance(p.position + p.rotation * model, world);

        /// <summary>Full rigid fit for a tilted surface: Kabsch solves only the small correction left after the two-point pose.</summary>
        public static Pose RefineThreePoint(Pose initial, Vector3[] model, Vector3[] world) {
            var moved = new Vector3[model.Length]; var refs = new Vector4[world.Length];
            for (int i = 0; i < model.Length; i++) { moved[i] = initial.position + initial.rotation * model[i]; refs[i] = new Vector4(world[i].x, world[i].y, world[i].z, 1f); }
            Matrix4x4 delta = new KabschSolver().SolveKabsch(moved, refs);
            for (int k = 0; k < 4; k++) {   // it iterates from its last answer; a few more calls converge a small tilt fully
                for (int i = 0; i < model.Length; i++) moved[i] = delta.MultiplyPoint3x4(initial.position + initial.rotation * model[i]);
                delta = new KabschSolver().SolveKabsch(moved, refs) * delta;
            }
            return new Pose(delta.MultiplyPoint3x4(initial.position), delta.rotation * initial.rotation);
        }
    }
}
```

- [ ] **Step 5: Run.** Expected: 3 PASS. If `ThreePointRefineFixesTheTilt` misses by a few millimetres, raise the loop count in `RefineThreePoint`: the test, not a guess, decides how many iterations are enough.
- [ ] **Step 6: Validate on device (gate G4):** on the floor, the m3 residual shows under 4 mm. Shim one side of the desk by 5 mm: the residual goes over 4 mm, the three-point fit takes over, and the ghost's leg tips land within 5 mm (blueprint test 19).
- [ ] **Step 7: Commit.** `git commit -am "feat(quest): two-point gravity solve, m3 residual check, Kabsch refine for tilt"`

---

### Task C5: The reveal clip for "prints itself" and the E7 rise (fix 9, A2)

**Files:**
- Create: `apps/quest/Assets/CutOnce/AR/Rendering/RevealClip.hlsl` (Shader Graph Custom Function, used by `CutOnce/Hologram`)
- Create: `apps/quest/Assets/CutOnce/AR/Rendering/Reveal.cs`
- Test: `apps/quest/Assets/CutOnce/AR/Tests/RevealTests.cs`

**Interfaces:** Produces `Reveal.CutHeight(Bounds worldBounds, float t): float` (t = 0 hides the part, t = 1 shows all of it), and shader property `_RevealY` (default `1e6`, meaning fully shown). `PartView` sets `_RevealY` through its property block only while replaying, and clears the block afterwards (the research's SRP Batcher note).

**Why world height works for every part (logic):** `Renderer.bounds` is the part's box in world space whatever its pivot, and the clip compares each pixel's world Y with a world height. So desk boxes (centre pivots) and E7 floors (pivots at the origin) reveal the same way, with no asset change.

- [ ] **Step 1: Write the failing test**

```csharp
using NUnit.Framework; using UnityEngine; using CutOnce.AR;

public class RevealTests {
    static readonly Bounds Floor3 = new(new Vector3(20, 10.6f, 45), new Vector3(42, 4.2f, 91));   // E7 level 3, pivot irrelevant
    [Test] public void StartsBelowThePart() => Assert.Less(Reveal.CutHeight(Floor3, 0f), Floor3.min.y);
    [Test] public void EndsAtTheTop() => Assert.AreEqual(Floor3.max.y, Reveal.CutHeight(Floor3, 1f), 1e-5f);
    [Test] public void RisesMonotonically() => Assert.Less(Reveal.CutHeight(Floor3, 0.3f), Reveal.CutHeight(Floor3, 0.6f));
}
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `Reveal.cs`**

```csharp
using UnityEngine;
namespace CutOnce.AR {
    public static class Reveal {
        public static readonly int RevealY = Shader.PropertyToID("_RevealY");
        /// <summary>World height of the cut for progress t; everything above it is clipped.</summary>
        public static float CutHeight(Bounds worldBounds, float t) => Mathf.Lerp(worldBounds.min.y - 0.001f, worldBounds.max.y, Mathf.Clamp01(t));
    }
}
```

- [ ] **Step 4: Write `RevealClip.hlsl`** and add it to the Hologram Shader Graph as a Custom Function node (File mode). Inputs: the Position node (World space), `_RevealY`, `_BandWidth` (0.02). Outputs: `Alpha` goes to Alpha Clip Threshold's comparison (turn on Alpha Clipping); `Band` adds HDR edge colour.

```hlsl
// Cut Once: reveal a part bottom-up by world height (idea from daniel-ilett/dissolve-urp, MIT).
void RevealClip_float(float3 WorldPos, float RevealY, float BandWidth, out float Alpha, out float Band)
{
    Alpha = step(WorldPos.y, RevealY);                                              // 1 below the cut, 0 above
    Band = Alpha * saturate(1.0 - (RevealY - WorldPos.y) / max(BandWidth, 1e-4));   // bright strip just under the cut
}
```

- [ ] **Step 5: Run** the tests (3 PASS). Then check by eye in the Editor: load `e7.glb`, drive `t` from 0 to 1 on level 3. It must grow up from its own slab, not squash toward the ground. Repeat on one desk leg.
- [ ] **Step 6: Commit.** `git commit -am "feat(quest): world-height reveal clip for replays and the E7 rise"`

---
# Borrowed code: what this plan covers, and what belongs in each owner's feature work

This plan implements the borrowing that *fixes* something, or that a fix depends on. The rest of each owner's borrow list is how they build their feature, not a fix. Adding it here would mean writing features before their owners reach them (YAGNI). Each row points to the exact source in the report.

| Owner | Covered here | Belongs in the owner's build (report section) | Why it isn't a task here |
|---|---|---|---|
| A1 | C1 scene settings (boundary, world lock, QR off at start); C3 sampler; C4 solver with zalo's Kabsch | `OVRSpatialAnchor` save/load/bind (StarterSamples `SpatialAnchorLoader.cs`); controller-tip offset (`StylusTip.cs` pose chain) | Anchors and touch points are feature code with Meta APIs that only run on the headset |
| A2 | C5 reveal clip | `WsClient` on NativeWebSocket 1.1.6 with Colyseus backoff; Newtonsoft handling (nullable vs optional, `link.xml`); `PcmStreamPlayer` from RageAgainstThePixel's MIT pattern; the Hologram Shader Graph; Litematica-style states and layers (ideas only, LGPL) | Plumbing and look are A2's main build. Nothing in them is broken today, because none of it exists yet |
| Rhythm | C2 projector; B1 strict IDs; B2 marks; B3 speech | The copilot endpoint itself (Responses API, SIGMA prompt order, the `/verify` grader shape, IndustReal accumulation) | The endpoint is its own feature; B1–B3 are the tested parts it will be assembled from |
| Michael | A1–A7 | `search:eval` with recall@3, recall@5 and MRR; pinning the ES client to the cluster's minor version | Both need a live cluster and real documents first (gate G0) |

# Checks for the day (nothing in this plan has run against real services)

| Check | Proves | When | Task |
|---|---|---|---|
| `pnpm elastic:setup` prints `created` ×4 and `smoke ok` ×4 | Fixes 1 and 4 against a real 9.4 cluster; whether `RERANK` accepts `?query` | As soon as the cluster exists | A1, A4 |
| Run the Workflow once from Kibana | Fix 3: headers render, toast appears, one issue document with `@timestamp` | After A5 | A5 |
| Ask a follow-up that triggers `log_issue` while MCP is slow | Fix 2: one annotation, one toast | Rehearsal | A3 |
| `pnpm llm:smoke` | G0: our key, this model, an image, strict JSON; first real latency | When the key is in `.env.local` | A7 |
| `pnpm tts:smoke`, then listen | Speech works; PCM byte order | When the ElevenLabs key is in | B3 |
| Director overlay of `visible_parts` on the JPEG | Fix 6 on the real camera | First camera frame on device | C2 |
| Sample timestamps at G3 | Fix 8: about 1 Hz, all ready in about 5–6 s | G3 | C3 |
| m3 residual on the floor, then with a 5 mm shim | Level check works; three-point fit takes over | G4 | C4 |
| E7 level 3 reveal in the Editor | Fix 9 | After C5 | C5 |

# Self-review

- **Coverage of the nine fixes:** 1 → A1 (+ A4's tool passes the same test) · 2 → A3 · 3 → A5 · 4 → A4 · 5 → A2 · 6 → C1 (text) + C2 (code) · 7 → A7 (openai), B2 (sharp), B3 (ElevenLabs) · 8 → C1 + C3 · 9 → C1 + C5. Report fix 10 → A6. Fixes 12 and 13 → C1.
- **Borrowing:** each owner's list is either a task above or a row in the coverage table, with the reason.
- **Names used across tasks:** `unwrapAgentBuilder`, `REMOTE_SHAPE`, `remoteArgs`, `logIssue`, `renderToolQuery`, `copilotAnswerSchema`, `CopilotAnswer`, `keepKnown`, `annotateFrame`, `streamSpeech`, `PartProjector.TryProject`, `MarkerSampler`, `AlignmentSolver.SolveTwoPoint` / `Residual` / `RefineThreePoint`, `Reveal.CutHeight`. Each is defined in exactly one task.
- **Ordering:** A1 comes before A4 (A4's tool must pass A1's test). A7 comes before B1 (B1 edits `llm.ts`, whose SDK A7 upgrades). Part C is independent of A and B.
- **Known unknowns, each with its own check:** `RERANK ?query` (A4 smoke), how the Workflow templates objects (avoided in A5), PCM byte order (B3), zalo's exact method signature (C4 step 3), the MRUK update rate on our headset (C3 step 5).
