import { ulid } from "ulid";
import type { Ctx } from "../app.js";
import { directTools, type ToolName } from "./fallbacks.js";
import { mcpCall } from "./mcp.js";

export type ToolResult = { ok: true; data: unknown; via: "mcp" | "direct" } | { ok: false; error: string };
type Remote = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export const timeout = <T>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/** How each tool is named on the Agent Builder side (set by `pnpm elastic:setup`). */
export const REMOTE_NAME: Record<ToolName, string> = {
  search_documents: "cutonce_search_documents", find_parts: "cutonce_find_parts", lookup_material: "cutonce_lookup_material",
  build_history: "cutonce_build_history", log_issue: "cutonce_log_issue",
};

/** Reshape MCP rows into the direct twin's shape, so the copilot sees one format per tool. */
const REMOTE_SHAPE: Record<ToolName, (rows: unknown, sent: Record<string, unknown>) => unknown> = {
  search_documents: (rows) => ({ chunks: rows }),
  find_parts: (rows) => ({ parts: rows }),
  lookup_material: (rows) => ({ materials: rows }),
  build_history: (rows) => ({ report: "events", events: rows }),
  log_issue: (_rows, sent) => ({ ok: true, issue_id: sent.issue_id }),
};

/** The Agent Builder tools take exactly the parameters in knowledge/agent-builder/tools/*.json; adapt ours to theirs. */
function remoteArgs(ctx: Ctx, name: ToolName, args: Record<string, unknown>): Record<string, unknown> {
  if (name === "build_history") return { assembly_id: args.assembly_id ?? ctx.store.currentAssembly()?.assembly_id ?? "" };
  if (name === "lookup_material") return { text: args.text ?? args.material_id ?? "" };
  if (name === "find_parts" || name === "search_documents") return { query: args.query ?? "" };
  if (name === "log_issue") return { issue_id: args.issue_id, part_id: args.part_id ?? "", note: args.note ?? "" };
  return args;
}

/**
 * One entry point for the copilot. Tries Agent Builder over MCP for up to 2 s, then the direct twin.
 * Never throws: a broken cluster must cost the copilot a source, not the answer.
 */
export async function callKnowledgeTool(ctx: Ctx, name: ToolName, args: Record<string, unknown>, opts: { timeoutMs?: number; remote?: Remote } = {}): Promise<ToolResult> {
  if (!(name in directTools)) return { ok: false, error: `unknown tool ${name}` };
  // A mutating tool gets its id once, so the MCP path and the fallback describe the same issue.
  if (name === "log_issue" && typeof args.issue_id !== "string") args = { ...args, issue_id: `issue_${ulid().toLowerCase()}` };
  const remote: Remote | null = opts.remote ?? (ctx.cfg.mcpUrl && ctx.cfg.esApiKey ? (n, a) => mcpCall(ctx.cfg, n, a) : null);
  if (name === "log_issue") {
    // Record locally first: the Workflow reaches us only through a webhook URL that changes with the tunnel.
    // Then let the Elastic Workflow act as well; its webhook arrives later and is ignored as a duplicate.
    try {
      const data = await directTools.log_issue(ctx, args);
      if (remote) void timeout(remote(REMOTE_NAME[name], remoteArgs(ctx, name, args)), opts.timeoutMs ?? 2000).catch(() => undefined);
      return { ok: true, data, via: "direct" };
    } catch (err) { return { ok: false, error: (err as Error).message }; }
  }
  if (remote) {
    const sent = remoteArgs(ctx, name, args);
    try { return { ok: true, data: REMOTE_SHAPE[name](await timeout(remote(REMOTE_NAME[name], sent), opts.timeoutMs ?? 2000), sent), via: "mcp" }; }
    catch { /* fall through to the direct twin */ }
  }
  try { return { ok: true, data: await directTools[name](ctx, args), via: "direct" }; }
  catch (err) { return { ok: false, error: (err as Error).message }; }
}

const fn = (name: ToolName, description: string, properties: Record<string, object>, required: string[]) =>
  ({ type: "function" as const, name, description, parameters: { type: "object", properties, required, additionalProperties: false } });

/** Tool definitions in the shape OpenAI's tool-calling expects. */
export const knowledgeToolSpecs = [
  fn("search_documents", "Search the project's drawings, manual and parts list. Pass part_id to favour passages about one part.", { query: { type: "string" }, part_id: { type: "string" } }, ["query"]),
  fn("find_parts", "Find parts of the plan by name, alias or kind.", { query: { type: "string" } }, ["query"]),
  fn("lookup_material", "Look up a material by id or by words from its name or spec.", { material_id: { type: "string" }, text: { type: "string" } }, []),
  fn("build_history", "Aggregated build history from the event log: step_durations, runs_compared or sources_breakdown.", { assembly_id: { type: "string" }, report: { type: "string", enum: ["step_durations", "runs_compared", "sources_breakdown"] } }, []),
  fn("log_issue", "Log an issue against a part so the site lead sees it.", { part_id: { type: "string" }, note: { type: "string" }, photo_ref: { type: "string" } }, ["note"]),
];
