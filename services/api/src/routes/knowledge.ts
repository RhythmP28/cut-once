import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, badRequest, notFound } from "../errors.js";
import type { Ctx } from "../app.js";
import { logIssue, runEsql } from "../search/fallbacks.js";
import { startEventIndexer } from "../search/indexEvents.js";
import { retrieve } from "../search/retrieve.js";

/** Search, ES|QL analytics and the webhook that Elastic's log_issue Workflow calls. */
export function knowledgeRoutes(app: FastifyInstance, ctx: Ctx) {
  startEventIndexer(ctx);

  app.get<{ Params: { pid: string }; Querystring: { q?: string; part_id?: string; k?: string } }>("/v1/projects/:pid/search", async (req) => {
    if (!req.query.q?.trim()) throw badRequest("q is required");
    const chunks = await retrieve(ctx.cfg, { query: req.query.q, projectId: req.params.pid, partId: req.query.part_id || null, k: Math.min(20, Number(req.query.k) || 5) }, app.log);
    return { mode: ctx.cfg.searchMode, chunks };
  });

  app.get<{ Params: { name: string }; Querystring: { assembly_id?: string } }>("/v1/analytics/:name", async (req) => {
    if (!/^[a-z_]+$/.test(req.params.name) || !existsSync(join(ctx.cfg.repoRoot, "knowledge", "esql", `${req.params.name}.esql`))) throw notFound(`analytics query ${req.params.name}`);
    try { return await runEsql(ctx, req.params.name, req.query.assembly_id ?? ctx.store.currentAssembly()?.assembly_id); }
    catch (err) { throw new ApiError(503, "search_unavailable", (err as Error).message); }
  });

  // Called by the Workflow after it has indexed the issue; also used by the Director page's test button.
  app.post("/v1/webhooks/issue", async (req) => {
    const body = z.object({ issue_id: z.string().regex(/^issue_[a-z0-9_]+$/), part_id: z.string().regex(/^part_[a-z0-9_]+$/).nullable().optional(), note: z.string().min(1).max(500), photo_ref: z.string().optional(), indexed: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { issue_id, part_id?, note }", body.error.issues);
    return logIssue(ctx, { issue_id: body.data.issue_id, part_id: body.data.part_id ?? null, note: body.data.note, photo_ref: body.data.photo_ref }, body.data.indexed ?? false);
  });
}
