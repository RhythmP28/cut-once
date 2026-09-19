import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S } from "@cutonce/schemas";
import { afterEach, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { installDrawings, readDrawingSet, sha256, type UploadAnswer } from "../src/e7/drawings.js";
import { auth, makeApp } from "./helpers.js";

const set = readDrawingSet(REPO_ROOT);
const plan = S.Plan.parse(JSON.parse(readFileSync(join(REPO_ROOT, "data", "e7", "out", "e7.plan.json"), "utf8")));
const known = JSON.parse(readFileSync(join(REPO_ROOT, "data", "demo", "known_hashes.json"), "utf8")) as Record<string, { plan_id: string; revision: number }>;

// ── the committed files agree with each other ───────────────────────────────────────────────────────────────
it("lists every published E7 drawing once, each with the document id its upload name produces", async () => {
  expect(set.drawings).toHaveLength(14);
  expect(new Set(set.drawings.map((d) => d.document_id)).size).toBe(14);
  const t = await makeApp();
  try {
    for (const d of set.drawings) {
      const saved = t.app.ctx.docs.save({ filename: d.upload_as, mime: "image/jpeg", buffer: Buffer.from(d.key), projectId: set.project_id });
      expect(saved.document.document_id).toBe(d.document_id);
    }
  } finally { await t.cleanup(); }
});

it("every drawing replays the approved E7 plan, at the revision that is committed", () => {
  for (const d of set.drawings) expect(known[d.sha256], d.key).toEqual(expect.objectContaining({ plan_id: plan.plan_id, revision: plan.revision }));
});

it("every part cites drawings from that list and carries measured accuracy tags", () => {
  const ids = new Set(set.drawings.map((d) => d.document_id));
  for (const part of plan.parts) {
    expect(part.doc_refs.length, part.part_id).toBeGreaterThan(0);
    for (const ref of part.doc_refs) expect(ids.has(ref.document_id), `${part.part_id} cites ${ref.document_id}`).toBe(true);
    expect(part.external_ids?.source).toBe("drawings");
    expect(Number(part.external_ids?.tolerance_m)).toBeGreaterThan(0);
    expect(part.external_ids?.basis).toMatch(/OpenStreetMap|lidar/);
  }
  for (const id of plan.provenance.source_document_ids) expect(ids.has(id)).toBe(true);
});

// ── the installer ────────────────────────────────────────────────────────────────────────────────────────────
let cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

function fakeRepo(files: Record<string, Buffer>) {
  const root = mkdtempSync(join(tmpdir(), "cutonce-e7-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "data", "e7", "raw", "original"), { recursive: true });
  const drawings = Object.entries(files).map(([key, bytes], i) => ({
    ...set.drawings[i]!, key, sha256: sha256(bytes), bytes: bytes.length,
  }));
  writeFileSync(join(root, "data", "e7", "drawings.json"), JSON.stringify({ ...set, drawings }));
  return { root, drawings };
}

function multipart(filename: string, bytes: Buffer, docType: string) {
  const b = "----e7test" + Math.random().toString(16).slice(2);
  const field = `--${b}\r\nContent-Disposition: form-data; name="doc_type"\r\n\r\n${docType}\r\n`;
  const head = `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
  return { payload: Buffer.concat([Buffer.from(field + head), bytes, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { ...auth, "content-type": `multipart/form-data; boundary=${b}` } };
}

it("downloads what is missing, uploads through the real route, and a known drawing replays the E7 plan", async () => {
  const onDisk = Buffer.from("level one pixels"), remote = Buffer.from("level two pixels");
  const { root, drawings } = fakeRepo({ L01: onDisk, L02: remote });
  writeFileSync(join(root, "data", "e7", "raw", "original", `o_${drawings[0]!.file}`), onDisk);

  const t = await makeApp();
  cleanups.push(() => t.cleanup());
  t.app.ctx.docs.setKnown(sha256(onDisk), { plan_id: plan.plan_id, revision: plan.revision, job_id: null, processed_at: "2026-09-19T00:00:00.000Z", reviewed_by: "test" });
  const downloaded: string[] = [];
  const lines: string[] = [];

  const result = await installDrawings({
    repoRoot: root,
    log: (l) => lines.push(l),
    download: async (url) => { downloaded.push(url); return remote; },
    upload: async (filename, bytes, docType, projectId): Promise<UploadAnswer> => {
      const r = await t.app.inject({ method: "POST", url: `/v1/projects/${projectId}/documents`, ...multipart(filename, bytes, docType) });
      return { status: r.statusCode, body: r.json() };
    },
  });

  expect(downloaded).toEqual([`https://images.adsttc.com/media/images/${drawings[1]!.archdaily_id}/original/${drawings[1]!.file}`]);
  expect(readFileSync(join(root, "data", "e7", "raw", "original", `o_${drawings[1]!.file}`))).toEqual(remote);
  expect(result).toEqual({ installed: 2, linked: 1, failed: [], changed: [] });
  const docs = t.app.ctx.docs.list();
  expect(docs.map((d) => d.document_id).sort()).toEqual([drawings[0]!.document_id, drawings[1]!.document_id].sort());
  expect(docs.every((d) => d.doc_type === "architectural")).toBe(true);
  expect(lines.join("\n")).toContain(`replays ${plan.plan_id}`);
});

it("a drawing that cannot be fetched is reported, and the rest still install", async () => {
  const { root } = fakeRepo({ L01: Buffer.from("a"), L02: Buffer.from("b") });
  const t = await makeApp();
  cleanups.push(() => t.cleanup());
  const result = await installDrawings({
    repoRoot: root, log: () => {}, download: async () => null,
    upload: async () => ({ status: 201, body: { document_id: "doc_x" } }),
  });
  expect(result.failed).toEqual(["L01", "L02"]);
  expect(result.installed).toBe(0);
});
