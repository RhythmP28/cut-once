import { createHash } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ulid } from "ulid";
import type { Document, Job, JobStage } from "@cutonce/schemas";
import { notFound } from "../errors.js";
import { ensureDir, readJson, writeJsonAtomic } from "./fs.js";

export interface KnownHash { plan_id: string; revision: number; job_id: string | null; processed_at: string; reviewed_by: string }
export interface StoredChunk {
  chunk_id: string; project_id: string; document_id: string; sheet_id?: string; doc_type: string; page: number; title: string; text: string;
  part_ids: string[]; material_ids: string[]; bbox_norm?: [number, number, number, number]; page_image_uri: string;
}

const DOC_TYPES: [RegExp, Document["doc_type"]][] = [
  [/bom|parts.?list|materials/i, "materials"], [/manual|assembly|instruction/i, "assembly"],
  [/wiring|electrical|e-?\d/i, "electrical"], [/drawing|plan|elevation|section|a-?\d/i, "architectural"], [/spec|note/i, "spec"],
];
export const guessDocType = (filename: string): Document["doc_type"] => DOC_TYPES.find(([re]) => re.test(filename))?.[1] ?? "other";
const slug = (name: string) => name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "file";

export class DocumentStore {
  constructor(private dataDir: string) { ensureDir(join(dataDir, "documents")); ensureDir(join(dataDir, "jobs")); }

  dir = (did: string) => join(this.dataDir, "documents", did);
  list = (): Document[] => readdirSync(join(this.dataDir, "documents")).map((d) => readJson<Document>(join(this.dir(d), "meta.json"))).filter((d): d is Document => !!d);
  findBySha = (sha: string) => this.list().find((d) => d.sha256 === sha) ?? null;

  get(did: string): Document {
    const doc = /^doc_[a-z0-9_]+$/.test(did) ? readJson<Document>(join(this.dir(did), "meta.json")) : null;
    if (!doc) throw notFound(`document ${did}`);
    return doc;
  }
  originalPath(did: string): string {
    const f = readdirSync(this.dir(did)).find((n) => n.startsWith("original."));
    if (!f) throw notFound(`the original file of ${did}`);
    return join(this.dir(did), f);
  }

  /** Stores an upload. The same bytes always map to the same document (dedupe by SHA-256). */
  save(input: { filename: string; mime: string; buffer: Buffer; projectId: string; docType?: Document["doc_type"] }): { document: Document; created: boolean; sha256: string } {
    const sha256 = createHash("sha256").update(input.buffer).digest("hex");
    const existing = this.findBySha(sha256);
    if (existing) return { document: existing, created: false, sha256 };
    let id = `doc_${slug(input.filename)}`;
    for (let n = 2; existsSync(this.dir(id)); n++) id = `doc_${slug(input.filename)}_${n}`;
    ensureDir(this.dir(id));
    writeFileSync(join(this.dir(id), `original${extname(input.filename).toLowerCase() || ".bin"}`), input.buffer);
    const document: Document = {
      document_id: id, project_id: input.projectId, filename: input.filename, sha256, mime: input.mime,
      doc_type: input.docType ?? guessDocType(input.filename), page_count: 0, uploaded_at: new Date().toISOString(), sheets: [],
    };
    writeJsonAtomic(join(this.dir(id), "meta.json"), document);
    return { document, created: true, sha256 };
  }
  update = (doc: Document) => writeJsonAtomic(join(this.dir(doc.document_id), "meta.json"), doc);

  writeChunks = (did: string, chunks: StoredChunk[]) => writeJsonAtomic(join(this.dir(did), "chunks.json"), chunks);
  readChunks = (did: string): StoredChunk[] => readJson<StoredChunk[]>(join(this.dir(did), "chunks.json")) ?? [];

  // ── known files: a hash we have already processed and approved maps straight to its plan ──
  private knownPath = () => join(this.dataDir, "known_hashes.json");
  known = (): Record<string, KnownHash> => readJson<Record<string, KnownHash>>(this.knownPath()) ?? {};
  setKnown(sha: string, entry: KnownHash) { writeJsonAtomic(this.knownPath(), { ...this.known(), [sha]: entry }); }
  mergeKnown(entries: Record<string, KnownHash>) { writeJsonAtomic(this.knownPath(), { ...entries, ...this.known() }); }

  // ── jobs ──
  private jobPath = (id: string) => join(this.dataDir, "jobs", `${id}.json`);
  createJob(documentIds: string[], stages: string[]): Job {
    const job: Job = { job_id: `job_${ulid().toLowerCase()}`, document_ids: documentIds, status: "queued", stages: stages.map((name) => ({ name, status: "pending" })), created_at: new Date().toISOString() };
    writeJsonAtomic(this.jobPath(job.job_id), job);
    return job;
  }
  getJob(id: string): Job {
    const job = /^job_[a-z0-9_]+$/.test(id) ? readJson<Job>(this.jobPath(id)) : null;
    if (!job) throw notFound(`job ${id}`);
    return job;
  }
  jobForDocument = (did: string): Job | null =>
    readdirSync(join(this.dataDir, "jobs")).map((f) => readJson<Job>(join(this.dataDir, "jobs", f))).filter((j): j is Job => !!j && j.document_ids.includes(did))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  saveJob = (job: Job) => writeJsonAtomic(this.jobPath(job.job_id), job);

  /** Runs one named stage, recording its status and duration. A thrown error marks the stage and the job failed. */
  async stage<T>(job: Job, name: string, work: () => Promise<{ value: T; stage?: Partial<JobStage> } | "skip">): Promise<T | undefined> {
    const stage = job.stages.find((s) => s.name === name)!;
    stage.status = "running"; job.status = "running"; this.saveJob(job);
    const started = Date.now();
    try {
      const result = await work();
      stage.ms = Date.now() - started;
      if (result === "skip") { stage.status = "skipped"; this.saveJob(job); return undefined; }
      Object.assign(stage, result.stage ?? {}, { status: "done" }); this.saveJob(job);
      return result.value;
    } catch (err) {
      Object.assign(stage, { status: "failed", ms: Date.now() - started, detail: (err as Error).message.slice(0, 300) });
      job.status = "failed"; this.saveJob(job);
      throw err;
    }
  }
}
