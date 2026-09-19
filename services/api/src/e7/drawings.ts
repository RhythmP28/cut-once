import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One published E7 drawing, as listed in data/e7/drawings.json. The image itself is never committed. */
export interface Drawing {
  key: string; title: string; kind: string; level?: number;
  archdaily_id: string; file: string; upload_as: string; document_id: string; sha256: string; bytes: number;
}
export interface DrawingSet { source_page: string; image_url: string; copyright: string; project_id: string; drawings: Drawing[] }

export const readDrawingSet = (repoRoot: string): DrawingSet => JSON.parse(readFileSync(join(repoRoot, "data", "e7", "drawings.json"), "utf8"));

/** Where the full-resolution copy lives on this machine (git-ignored). */
export const localPath = (repoRoot: string, d: Drawing) => join(repoRoot, "data", "e7", "raw", "original", `o_${d.file}`);
export const imageUrl = (set: DrawingSet, d: Drawing) => set.image_url.replace("{archdaily_id}", d.archdaily_id).replace("{file}", d.file);
export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export interface UploadAnswer { status: number; body: { document_id?: string; known_plan_id?: string; revision?: number; job_id?: string; error?: { message?: string } } }

export interface InstallDeps {
  repoRoot: string;
  /** Fetches a URL; null when it could not be fetched. */
  download: (url: string) => Promise<Buffer | null>;
  /** Uploads one file the way the web page does. */
  upload: (filename: string, bytes: Buffer, docType: string, projectId: string) => Promise<UploadAnswer>;
  log: (line: string) => void;
}

export interface InstallResult { installed: number; linked: number; failed: string[]; changed: string[] }

/**
 * Loads every published E7 drawing into a server through the normal upload route: downloads what this machine does
 * not have yet (ArchDaily, full resolution), checks it is the file the E7 plan was made from, and uploads it under the
 * name that gives it the document id the plan's parts cite. A drawing whose bytes are known to the server replays the
 * approved E7 plan instead of starting a new reading job.
 */
export async function installDrawings(deps: InstallDeps): Promise<InstallResult> {
  const set = readDrawingSet(deps.repoRoot);
  const result: InstallResult = { installed: 0, linked: 0, failed: [], changed: [] };
  for (const d of set.drawings) {
    const path = localPath(deps.repoRoot, d);
    let bytes: Buffer | null = existsSync(path) ? readFileSync(path) : null;
    if (!bytes) {
      bytes = await deps.download(imageUrl(set, d));
      if (!bytes) { result.failed.push(d.key); deps.log(`  FAIL  ${d.title}: could not download ${imageUrl(set, d)}`); continue; }
      mkdirSync(join(deps.repoRoot, "data", "e7", "raw", "original"), { recursive: true });
      writeFileSync(path, bytes);
    }
    // A different file than the one the plan was made from still uploads, but it will not replay the E7 plan.
    if (sha256(bytes) !== d.sha256) { result.changed.push(d.key); deps.log(`  note  ${d.title}: not the same file the E7 plan was made from (ArchDaily changed it?)`); }

    const answer = await deps.upload(d.upload_as, bytes, "architectural", set.project_id);
    if (answer.status >= 300 || !answer.body.document_id) {
      result.failed.push(d.key);
      deps.log(`  FAIL  ${d.title}: ${answer.status} ${answer.body.error?.message ?? ""}`);
      continue;
    }
    result.installed += 1;
    if (answer.body.known_plan_id) result.linked += 1;
    const id = answer.body.document_id === d.document_id ? d.document_id : `${answer.body.document_id} (the plan cites ${d.document_id}: this file was uploaded earlier under another name)`;
    deps.log(`  ok    ${d.title} → ${id}${answer.body.known_plan_id ? ` · replays ${answer.body.known_plan_id} rev ${answer.body.revision}` : ""}`);
  }
  return result;
}
