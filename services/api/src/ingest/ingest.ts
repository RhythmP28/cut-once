import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Material, Part } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { getEs, INDEX } from "../search/client.js";
import type { StoredChunk } from "../store/documents.js";
import { readBom } from "./bom.js";
import { chunkItems, chunkPage, type Chunk } from "./chunk.js";
import { linkParts } from "./link.js";
import { pageText, pdfPageCount, rasterise } from "./pages.js";
import { transcribePage } from "./transcribe.js";

const MIN_TEXT = 40; // fewer characters than this on a page means "no real text layer": read it with the vision model instead

function projectParts(ctx: Ctx): { parts: Part[]; materials: Material[] } {
  const current = ctx.store.currentAssembly();
  try { const plan = ctx.store.getPlan(current?.plan_id ?? "plan_desk_demo"); return { parts: plan.parts, materials: plan.materials }; }
  catch { return { parts: [], materials: [] }; }
}

/** Builds documents/<id>/chunks.json: the on-disk truth that any index can be rebuilt from. */
export async function buildChunks(ctx: Ctx, documentId: string): Promise<StoredChunk[]> {
  const docs = ctx.docs;
  const doc = docs.get(documentId);
  const file = docs.originalPath(documentId);
  const ext = extname(file).toLowerCase();
  const { parts, materials } = projectParts(ctx);
  const pagesDir = join(docs.dir(documentId), "pages");
  const uri = (page: number) => `/v1/documents/${documentId}/pages/${page}.png`;
  let raw: (Chunk & { material_ids?: string[] })[] = [];
  let pageCount = 1;

  if (ext === ".csv") raw = readBom(documentId, readFileSync(file, "utf8"), materials).chunks;
  else if (ext === ".pdf") {
    pageCount = await pdfPageCount(file);
    const images = await rasterise(file, pagesDir);
    for (let page = 1; page <= pageCount; page++) {
      const text = await pageText(file, page);
      if (text.length >= MIN_TEXT) raw.push(...chunkPage(documentId, page, text));
      else if (ctx.cfg.openaiKey && images[page - 1]) {
        const items = await transcribePage(ctx.cfg, images[page - 1]!, join(pagesDir, `p-${page}.transcript.json`), `${doc.filename}, page ${page}`);
        raw.push(...chunkItems(documentId, page, items.map((i) => ({ ...i, bbox_norm: i.bbox_norm ? [i.bbox_norm.x, i.bbox_norm.y, i.bbox_norm.w, i.bbox_norm.h] : null }))));
      }
    }
  } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
    if (ctx.cfg.openaiKey) {
      const items = await transcribePage(ctx.cfg, file, join(docs.dir(documentId), "transcript.json"), doc.filename);
      raw = chunkItems(documentId, 1, items.map((i) => ({ ...i, bbox_norm: i.bbox_norm ? [i.bbox_norm.x, i.bbox_norm.y, i.bbox_norm.w, i.bbox_norm.h] : null })));
    }
  } else if ([".txt", ".md"].includes(ext)) raw = chunkPage(documentId, 1, readFileSync(file, "utf8"));

  const chunks: StoredChunk[] = raw.map((c) => ({
    chunk_id: c.chunk_id, project_id: doc.project_id, document_id: documentId, doc_type: doc.doc_type, page: c.page, title: c.title, text: c.text,
    part_ids: linkParts(`${c.title}\n${c.text}`, parts), material_ids: c.material_ids ?? [], ...(c.bbox_norm ? { bbox_norm: c.bbox_norm } : {}), page_image_uri: uri(c.page),
  }));
  docs.update({ ...doc, page_count: pageCount });
  docs.writeChunks(documentId, chunks);
  return chunks;
}

export async function indexChunks(ctx: Ctx, chunks: StoredChunk[]): Promise<number> {
  const es = getEs(ctx.cfg);
  if (!es || chunks.length === 0) return 0;
  const res = await es.bulk({ refresh: "wait_for", operations: chunks.flatMap((c) => [{ index: { _index: INDEX.docs, _id: c.chunk_id } }, c]) });
  if (res.errors) ctx.store.bus.emit("broadcast", { type: "issue_logged", issue_id: "issue_index_errors", part_id: null, note: "Some chunks failed to index; see the server log" });
  return res.items.filter((i) => !i.index?.error).length;
}

export async function ingestDocument(ctx: Ctx, documentId: string): Promise<{ chunks: number; parts_linked: number; indexed: number }> {
  const chunks = await buildChunks(ctx, documentId);
  return { chunks: chunks.length, parts_linked: chunks.filter((c) => c.part_ids.length > 0).length, indexed: await indexChunks(ctx, chunks) };
}
