import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import type { Ctx } from "../app.js";
import { getEs, INDEX } from "./client.js";
import { retrieve } from "./retrieve.js";

export type ToolName = "search_documents" | "find_parts" | "lookup_material" | "build_history" | "log_issue";
type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const esqlFile = (ctx: Ctx, name: string) => readFileSync(join(ctx.cfg.repoRoot, "knowledge", "esql", `${name}.esql`), "utf8");

/** Runs a named ES|QL file. `?assembly_id` in the file is bound as a parameter, never pasted in. */
export async function runEsql(ctx: Ctx, name: string, assemblyId?: string): Promise<{ columns: { name: string; type: string }[]; rows: unknown[][] }> {
  const es = getEs(ctx.cfg);
  if (!es) throw new Error("Elasticsearch is not configured");
  const query = esqlFile(ctx, name);
  const res = (await es.esql.query({ query, ...(query.includes("?assembly_id") ? { params: [{ assembly_id: assemblyId ?? "" }] } : {}) } as never)) as unknown as
    { columns: { name: string; type: string }[]; values: unknown[][] };
  return { columns: res.columns, rows: res.values };
}

/**
 * One row shape per tool, applied to both paths (Agent Builder over MCP and the direct twins),
 * so the copilot reads the same fields whichever path answered. Missing fields become null.
 */
type Row = Record<string, unknown>;
const pick = (row: Row, keys: readonly string[]): Row => Object.fromEntries(keys.map((k) => [k, row[k] ?? null]));
export const ROWS = {
  part: (r: Row) => pick(r, ["part_id", "name", "layer", "step_id"]),
  material: (r: Row) => pick(r, ["material_id", "name", "spec", "unit", "quantity", "used_by"]),
  event: (r: Row) => pick({ ...r, timestamp: r.timestamp ?? r["@timestamp"] }, ["version", "part_id", "previous_state", "new_state", "source", "step_id", "seconds_since_prev", "timestamp"]),
  chunk: (r: Row) => ({
    ...pick(r, ["chunk_id", "document_id", "page", "title", "text", "part_ids"]),
    score: r.score ?? r._score ?? null,
    page_image_uri: r.page_image_uri ?? `/v1/documents/${String(r.document_id)}/pages/${String(r.page)}.png`,
  }),
};

/** The same tools as Agent Builder exposes over MCP, run straight against Elasticsearch. Same names, same arguments. */
export const directTools: Record<ToolName, (ctx: Ctx, args: Args) => Promise<unknown>> = {
  search_documents: async (ctx, a) => ({ chunks: (await retrieve(ctx.cfg, { query: str(a.query), projectId: ctx.cfg.projectId, partId: str(a.part_id) || null, k: 5 }, ctx.cfg.logLevel === "silent" ? undefined : console)).map((c) => ROWS.chunk(c as unknown as Row)) }),
  find_parts: async (ctx, a) => {
    const es = getEs(ctx.cfg);
    if (!es) { // no cluster: the plan on disk still knows its own parts. Score by shared words; keep only the best matches.
      const words = str(a.query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
      const plan = ctx.store.getPlan(ctx.store.currentAssembly()?.plan_id ?? "plan_desk_demo");
      const scored = plan.parts.map((p) => {
        const have = new Set([p.name, ...p.aliases, p.kind].join(" ").toLowerCase().split(/[^a-z0-9]+/));
        return { p, score: words.filter((w) => have.has(w) || have.has(w.replace(/s$/, ""))).length };
      });
      const best = Math.max(0, ...scored.map((x) => x.score));
      return { parts: best === 0 ? [] : scored.filter((x) => x.score === best).map(({ p }) => ROWS.part(p as unknown as Row)) };
    }
    const res = await es.search<Record<string, unknown>>({ index: INDEX.parts, size: 5, query: { multi_match: { query: str(a.query), fields: ["name^3", "aliases^2", "dims_text", "description", "kind"] } } });
    return { parts: res.hits.hits.map((h) => ROWS.part(h._source ?? {})) };
  },
  lookup_material: async (ctx, a) => {
    const plan = ctx.store.getPlan(ctx.store.currentAssembly()?.plan_id ?? "plan_desk_demo");
    const q = (str(a.material_id) || str(a.text)).toLowerCase();
    return { materials: plan.materials.filter((m) => m.material_id === q || `${m.name} ${m.spec}`.toLowerCase().includes(q)).map((m) => ROWS.material(m as unknown as Row)) };
  },
  // The event log of one run, read from disk (exact, no cluster needed): the same rows the ES|QL tool returns.
  // Aggregated reports (step_durations, runs_compared, sources_breakdown) stay on GET /v1/analytics/:name.
  build_history: async (ctx, a) => {
    const aid = str(a.assembly_id) || ctx.store.currentAssembly()?.assembly_id;
    if (!aid) return { report: "events", events: [] };
    const { events } = ctx.store.getEvents(aid);
    return { report: "events", events: events.filter((e) => e.kind === "part_state").map((e, i, all) => ROWS.event({ ...e,
      seconds_since_prev: i === 0 ? 0 : Math.max(0, (Date.parse(e.timestamp) - Date.parse(all[i - 1]!.timestamp)) / 1000) } as unknown as Row)) };
  },
  log_issue: async (ctx, a) => logIssue(ctx, { issue_id: str(a.issue_id) || `issue_${ulid().toLowerCase()}`, part_id: str(a.part_id) || null, note: str(a.note) || "Issue logged", photo_ref: str(a.photo_ref) || undefined }),
};

const issuesSeen = new Set<string>();

/**
 * Records an issue: an annotation on the current run, a document in cutonce-issues, and a toast on every screen.
 * Idempotent on issue_id: the Workflow's HTTP step retries, and it arrives after our own local record.
 * The check and the mark are synchronous, so two calls cannot interleave between them.
 */
export async function logIssue(ctx: Ctx, issue: { issue_id: string; part_id: string | null; note: string; photo_ref?: string }) {
  const current = ctx.store.currentAssembly();
  const onDisk = current ? ctx.store.getEvents(current.assembly_id).events.some((e) => e.kind === "annotation" && e.note?.startsWith(`${issue.issue_id}:`)) : false;
  const duplicate = issuesSeen.has(issue.issue_id) || onDisk;
  const now = new Date().toISOString();
  if (!duplicate) {
    issuesSeen.add(issue.issue_id);
    try {
      if (current) {
        await ctx.store.appendEvent(current.assembly_id, {
          event_id: `evt_${ulid()}`, assembly_id: current.assembly_id, version: null, timestamp: now, client_timestamp: now, kind: "annotation",
          ...(issue.part_id && ctx.store.getState(current.assembly_id).parts[issue.part_id] ? { part_id: issue.part_id } : {}),
          source: "system", confidence: 1, actor: "workflow", note: `${issue.issue_id}: ${issue.note}`,
        });
      }
    } catch (err) { issuesSeen.delete(issue.issue_id); throw err; } // not recorded, so a retry must not count as a duplicate
  }
  // Always (re)write the full record: the Workflow indexes a partial copy before it calls us, so the last write must be ours.
  const es = getEs(ctx.cfg);
  if (es) {
    await es.index({ index: INDEX.issues, id: issue.issue_id, document: { "@timestamp": now, ...issue, assembly_id: current?.assembly_id, status: "open" } }).catch(() => undefined);
  }
  if (duplicate) return { ok: true, issue_id: issue.issue_id, duplicate: true };
  ctx.store.bus.emit("broadcast", { type: "issue_logged", issue_id: issue.issue_id, part_id: issue.part_id, note: issue.note });
  return { ok: true, issue_id: issue.issue_id };
}
