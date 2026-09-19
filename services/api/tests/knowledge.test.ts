import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { startEventIndexer } from "../src/search/indexEvents.js";
import { buildSearchBody } from "../src/search/retrieve.js";
import { callKnowledgeTool, knowledgeToolSpecs } from "../src/search/tools.js";
import { unwrapAgentBuilder } from "../src/search/mcp.js";
import { logIssue } from "../src/search/fallbacks.js";
import { auth, builtEvent, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });
const post = (url: string, payload: unknown, headers = auth) => t.app.inject({ method: "POST", url, headers, payload: payload as object });

describe("search request", () => {
  const q = { query: "where does the cable go", projectId: "proj_cutonce_demo", partId: "part_power_cable" };
  it("BM25: boosts the pointed part, filters the project", () => {
    const body = buildSearchBody(loadConfig({}), q, "bm25") as any;
    expect(body.query.bool.should[0].term.part_ids).toEqual({ value: "part_power_cable", boost: 3 });
    expect(body.query.bool.filter[0]).toEqual({ term: { project_id: "proj_cutonce_demo" } });
  });
  it("hybrid: reranker around RRF of BM25 and semantic", () => {
    const body = buildSearchBody(loadConfig({ JINA_EMBED_ID: "jina-embed", JINA_RERANK_ID: "jina-rerank" }), q, "hybrid") as any;
    const rr = body.retriever.text_similarity_reranker;
    expect([rr.inference_id, rr.field, rr.retriever.rrf.retrievers.length]).toEqual(["jina-rerank", "text", 2]);
    expect(rr.retriever.rrf.retrievers[1].standard.query.bool.must[0].semantic.field).toBe("text_semantic");
  });
  it("hybrid: both branches filter by project and document type", () => {
    const body = buildSearchBody(loadConfig({ JINA_EMBED_ID: "e" }), { ...q, docTypes: ["electrical"] }, "hybrid") as any;
    for (const r of body.retriever.rrf.retrievers) expect(r.standard.query.bool.filter).toContainEqual({ terms: { doc_type: ["electrical"] } });
  });
  it("hybrid without Jina ids degrades to BM25", () => expect(buildSearchBody(loadConfig({}), q, "hybrid")).toHaveProperty("query"));
  it("search route answers with no cluster configured", async () => {
    const r = await t.app.inject({ method: "GET", url: "/v1/projects/proj_cutonce_demo/search?q=cable", headers: auth });
    expect(r.json()).toEqual({ mode: "bm25", chunks: [] });
  });
});

describe("event indexer", () => {
  it("retries a failed write and computes seconds_since_prev", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const seen: any[] = [];
    let failOnce = true;
    const indexer = startEventIndexer(t.app.ctx, async (id, doc) => { if (failOnce) { failOnce = false; throw new Error("cluster down"); } seen.push({ id, doc }); });
    const aid = t.app.ctx.store.currentAssembly()!.assembly_id;
    for (const p of ["part_left_rear_leg", "part_right_rear_leg", "part_cable_tray"]) await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, p));
    await vi.advanceTimersByTimeAsync(1500);
    await indexer.flush();
    vi.useRealTimers();
    expect(seen.map((s) => s.doc.version)).toEqual([4, 5, 6]);
    expect(seen.every((s) => s.doc.seconds_since_prev >= 0 && s.doc.plan_id === "plan_desk_demo")).toBe(true);
    expect(indexer.pending()).toBe(0);
  });
});

describe("knowledge tools", () => {
  it("falls back to the direct twin when MCP hangs", async () => {
    const started = Date.now();
    const r = await callKnowledgeTool(t.app.ctx, "find_parts", { query: "rear leg" }, { timeoutMs: 150, remote: () => new Promise(() => undefined) });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(r).toMatchObject({ ok: true, via: "direct" });
    expect((r as any).data.parts.map((p: any) => p.part_id).sort()).toEqual(["part_left_rear_leg", "part_right_rear_leg"]);
  });
  it("falls back when MCP errors, and uses MCP when it answers", async () => {
    expect(await callKnowledgeTool(t.app.ctx, "lookup_material", { material_id: "mat_leg_700" }, { remote: async () => { throw new Error("403"); } })).toMatchObject({ ok: true, via: "direct" });
    expect(await callKnowledgeTool(t.app.ctx, "find_parts", { query: "x" }, { remote: async (name) => [{ part_id: name }] })).toEqual({ ok: true, via: "mcp", data: { parts: [{ part_id: "cutonce_find_parts", name: null, layer: null, step_id: null }] } });
  });
  it("never throws", async () => expect(await callKnowledgeTool(t.app.ctx, "nope" as never, {})).toMatchObject({ ok: false }));
  it("answers build_history from disk with no cluster", async () =>
    expect(((await callKnowledgeTool(t.app.ctx, "build_history", {})) as any).data.events).toHaveLength(3));
  it("exposes five well-formed tool specs", () => {
    expect(knowledgeToolSpecs.map((s) => s.name)).toEqual(["search_documents", "find_parts", "lookup_material", "build_history", "log_issue"]);
    for (const s of knowledgeToolSpecs) expect(s.parameters).toMatchObject({ type: "object", additionalProperties: false });
  });
});

describe("issue webhook and analytics", () => {
  it("records an annotation on the current run", async () => {
    const r = await post("/v1/webhooks/issue", { issue_id: "issue_test_1", part_id: "part_left_rear_leg", note: "Thread is damaged" });
    expect(r.json()).toEqual({ ok: true, issue_id: "issue_test_1" });
    const { events } = t.app.ctx.store.getEvents(t.app.ctx.store.currentAssembly()!.assembly_id, 3);
    expect(events[0]).toMatchObject({ kind: "annotation", part_id: "part_left_rear_leg", note: "issue_test_1: Thread is damaged" });
    expect(t.app.ctx.store.getState(events[0]!.assembly_id).progress.built).toBe(3);
  });
  it("needs the token and a valid body", async () => {
    expect((await post("/v1/webhooks/issue", { issue_id: "issue_x", note: "n" }, {} as never)).statusCode).toBe(401);
    expect((await post("/v1/webhooks/issue", { issue_id: "bad id", note: "n" })).statusCode).toBe(400);
  });
  it("analytics: unknown name is 404, no cluster is 503", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/analytics/nope", headers: auth })).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: "/v1/analytics/step_durations", headers: auth })).statusCode).toBe(503);
  });
});

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
    expect(viaMcp).toMatchObject({ ok: true, via: "mcp" });
    expect(Object.keys((viaMcp as any).data)).toEqual(Object.keys((direct as any).data));
  });
});

describe("log_issue is idempotent", () => {
  it("both paths carry the same issue_id", async () => {
    let sent: any;
    const r = await callKnowledgeTool(t.app.ctx, "log_issue", { part_id: "part_left_rear_leg", note: "thread damaged" },
      { timeoutMs: 50, remote: (_n, a) => { sent = a; return new Promise(() => undefined); } });
    expect(r).toMatchObject({ ok: true, via: "direct" });
    expect((r as any).data.issue_id).toBe(sent.issue_id);
    expect(sent.issue_id).toMatch(/^issue_[a-z0-9]+$/);
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

describe("review fixes: log_issue never depends on the webhook", () => {
  it("records locally even when the MCP call 'succeeds' but the Workflow never calls back", async () => {
    const r = await callKnowledgeTool(t.app.ctx, "log_issue", { note: "desk wobbles" }, { remote: async () => ({ results: [{ type: "other", data: {} }] }) });
    const aid = t.app.ctx.store.currentAssembly()!.assembly_id;
    expect(r).toMatchObject({ ok: true });
    expect(t.app.ctx.store.getEvents(aid).events.filter((e) => e.note?.startsWith(`${(r as any).data.issue_id}:`))).toHaveLength(1);
  });
  it("the webhook accepts an issue with no part (the Workflow sends an empty string)", async () => {
    const res = await post("/v1/webhooks/issue", { issue_id: "issue_no_part_1", part_id: "", note: "desk wobbles" });
    expect(res.statusCode).toBe(200);
  });
  it("a failed write does not mark the issue as seen", async () => {
    const store = t.app.ctx.store as any;
    const original = store.appendEvent.bind(store);
    store.appendEvent = async () => { throw new Error("disk full"); };
    await expect(logIssue(t.app.ctx, { issue_id: "issue_retry_1", part_id: null, note: "n" })).rejects.toThrow(/disk full/);
    store.appendEvent = original;
    expect(await logIssue(t.app.ctx, { issue_id: "issue_retry_1", part_id: null, note: "n" })).not.toHaveProperty("duplicate");
  });
});

describe("review fixes: MCP and direct rows have the same fields", () => {
  // Rows as Agent Builder's ES|QL tools return them (after unwrap), extra columns included.
  const REMOTE_ROWS: Record<string, unknown[]> = {
    find_parts: [{ part_id: "part_left_rear_leg", name: "Left rear leg", layer: "structure", step_id: "step_04", dims_text: "40 mm" }],
    lookup_material: [{ material_id: "mat_leg_700", name: "Steel leg 700 mm", spec: "x", unit: "each", quantity: 4, used_by: ["part_left_rear_leg"] }],
    build_history: [{ version: 1, part_id: "part_tabletop", previous_state: "missing", new_state: "built", source: "seed", step_id: "step_01", seconds_since_prev: 0, "@timestamp": "2026-09-19T00:00:00Z" }],
  };
  const firstRow = (data: any) => (data.parts ?? data.materials ?? data.events)[0];
  for (const [tool, rows] of Object.entries(REMOTE_ROWS)) {
    it(`${tool}: identical row keys on both paths`, async () => {
      const args = tool === "find_parts" ? { query: "rear leg" } : tool === "lookup_material" ? { material_id: "mat_leg_700" } : {};
      const viaMcp = await callKnowledgeTool(t.app.ctx, tool as any, args, { remote: async () => rows });
      const direct = await callKnowledgeTool(t.app.ctx, tool as any, args);
      expect(viaMcp).toMatchObject({ via: "mcp" }); expect(direct).toMatchObject({ via: "direct" });
      expect(Object.keys((viaMcp as any).data)).toEqual(Object.keys((direct as any).data));
      expect(Object.keys(firstRow((viaMcp as any).data)).sort()).toEqual(Object.keys(firstRow((direct as any).data)).sort());
    });
  }
  it("search_documents: MCP rows get score and page_image_uri like retrieve() results", async () => {
    const r = await callKnowledgeTool(t.app.ctx, "search_documents", { query: "cable" }, { remote: async () => [{ chunk_id: "chunk_desk_drawings_p2_1", document_id: "doc_desk_drawings", page: 2, title: "E-1", text: "t", part_ids: ["part_power_cable"], _score: 1.5 }] });
    expect((r as any).data.chunks[0]).toEqual({ chunk_id: "chunk_desk_drawings_p2_1", document_id: "doc_desk_drawings", page: 2, title: "E-1", text: "t", part_ids: ["part_power_cable"], score: 1.5, page_image_uri: "/v1/documents/doc_desk_drawings/pages/2.png" });
  });
});
