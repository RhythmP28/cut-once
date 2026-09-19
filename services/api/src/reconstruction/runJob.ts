import type { Job } from "@cutonce/schemas";
import { hasErrors } from "@cutonce/project-model";
import type { Ctx } from "../app.js";
import { ingestDocument } from "../ingest/ingest.js";
import { draftToPlan } from "./draftToPlan.js";
import { extractPlan } from "./extract.js";

export const STAGES = ["store", "index", "extract", "validate", "review"];

/**
 * What happens after an upload. Indexing always runs. Drawing extraction runs only when RECONSTRUCTION=on and only
 * for drawings; its result is a DRAFT that a person must approve. Nothing here ever feeds the headset directly.
 */
export async function runJob(ctx: Ctx, job: Job, documentId: string): Promise<Job> {
  const { docs, store, cfg } = ctx;
  try {
    await docs.stage(job, "store", async () => ({ value: true, stage: { detail: docs.get(documentId).filename } }));
    await docs.stage(job, "index", async () => {
      const r = await ingestDocument(ctx, documentId);
      return { value: r, stage: { detail: `${r.chunks} passages, ${r.parts_linked} linked to parts, ${r.indexed} indexed` } };
    });

    const doc = docs.get(documentId);
    const isDrawing = ["architectural", "electrical"].includes(doc.doc_type);
    const draft = await docs.stage(job, "extract", async () => {
      if (!cfg.reconstruction || !cfg.openaiKey || !isDrawing) return "skip";
      const value = await extractPlan(ctx, [documentId]);
      return { value, stage: { detail: `${value.parts.length} parts, ${value.materials.length} materials proposed by ${cfg.openaiModel}` } };
    });
    if (!draft) {
      for (const s of job.stages) if (s.status === "pending") s.status = "skipped";
      job.status = "indexed"; docs.saveJob(job);
      return job;
    }

    const planId = `plan_${documentId.replace(/^doc_/, "")}`;
    const saved = await docs.stage(job, "validate", async () => {
      const { plan } = draftToPlan(draft, { plan_id: planId, project_id: doc.project_id, source_document_ids: [documentId], extracted_by: `${cfg.openaiModel} + validator` });
      const value = store.putDraft(plan);
      const errors = value.validation.filter((i) => i.severity === "error").length;
      return { value, stage: { detail: `${errors} errors, ${value.validation.length - errors} warnings`, artifact_uri: `/v1/plans/${planId}?revision=${value.revision}` } };
    });
    Object.assign(job, { plan_id: planId, revision: saved!.revision, issues: saved!.validation, status: "needs_review" });
    const review = job.stages.find((s) => s.name === "review")!;
    review.status = "running"; review.detail = hasErrors(saved!.validation) ? "fix the errors, then approve" : "waiting for a person to approve";
    docs.saveJob(job);
  } catch (err) {
    ctx.store.bus.emit("broadcast", { type: "issue_logged", issue_id: "issue_job_failed", part_id: null, note: `Processing ${documentId} failed: ${(err as Error).message.slice(0, 120)}` });
  }
  return docs.getJob(job.job_id);
}
