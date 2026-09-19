import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ApiError, badRequest, notFound } from "../errors.js";
import type { Ctx } from "../app.js";
import { rasterise } from "../ingest/pages.js";
import { runJob, STAGES } from "../reconstruction/runJob.js";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const ALLOWED = [".pdf", ".png", ".jpg", ".jpeg", ".csv", ".txt", ".md"];

export function documentRoutes(app: FastifyInstance, ctx: Ctx) {
  const { docs, store } = ctx;

  app.post<{ Params: { pid: string } }>("/v1/projects/:pid/documents", async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest("send the file as multipart field `file`");
    if (!ALLOWED.includes(extname(file.filename).toLowerCase())) throw new ApiError(422, "unsupported_file", `supported types: ${ALLOWED.join(" ")}`);
    const buffer = await file.toBuffer(); // throws FST_REQ_FILE_TOO_LARGE past 25 MB → 413
    const docType = (file.fields.doc_type as { value?: string } | undefined)?.value as never;
    const { document, created, sha256 } = docs.save({ filename: file.filename, mime: file.mimetype, buffer, projectId: req.params.pid, docType });

    // A file we have already processed and approved maps straight to its plan. The headset replays that plan.
    const known = docs.known()[sha256];
    if (known) {
      let job = known.job_id ? (() => { try { return docs.getJob(known.job_id!); } catch { return null; } })() : null;
      job ??= docs.jobForDocument(document.document_id);
      if (!job) { job = docs.createJob([document.document_id], ["reviewed by hand"]); Object.assign(job, { status: "approved", plan_id: known.plan_id, revision: known.revision }); job.stages[0]!.status = "done"; docs.saveJob(job); }
      store.bus.emit("plan_ready", { plan_id: known.plan_id, revision: known.revision });
      return reply.status(200).send({ document_id: document.document_id, known_plan_id: known.plan_id, revision: known.revision, job_id: job.job_id, processed_at: known.processed_at, reviewed_by: known.reviewed_by });
    }
    if (!created) {
      const job = docs.jobForDocument(document.document_id);
      if (job) return reply.status(200).send({ document_id: document.document_id, job_id: job.job_id });
    }
    const job = docs.createJob([document.document_id], STAGES);
    void runJob(ctx, job, document.document_id);
    return reply.status(201).send({ document_id: document.document_id, job_id: job.job_id });
  });

  app.get("/v1/documents", async () => ({ documents: docs.list() }));
  app.get<{ Params: { job_id: string } }>("/v1/jobs/:job_id", async (req) => docs.getJob(req.params.job_id));

  app.get<{ Params: { did: string; page: string } }>("/v1/documents/:did/pages/:page", async (req, reply) => {
    const page = Number(/^(\d+)\.png$/.exec(req.params.page)?.[1]);
    if (!Number.isInteger(page) || page < 1) throw badRequest("page must look like 1.png");
    const original = docs.originalPath(docs.get(req.params.did).document_id);
    const ext = extname(original).toLowerCase();
    if (MIME[ext]) { if (page !== 1) throw notFound(`page ${page}`); return reply.type(MIME[ext]!).send(createReadStream(original)); }
    if (ext !== ".pdf") throw notFound("a page image for this kind of file");
    const dir = join(docs.dir(req.params.did), "pages");
    if (!existsSync(join(dir, `p-${page}.png`))) await rasterise(original, dir);
    if (!existsSync(join(dir, `p-${page}.png`))) throw notFound(`page ${page}`);
    return reply.type("image/png").header("cache-control", "private, max-age=3600").send(createReadStream(join(dir, `p-${page}.png`)));
  });
}
