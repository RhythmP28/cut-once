import type { RetrievedChunk } from "@cutonce/schemas";
import type { Config } from "../config.js";
import { getEs, INDEX } from "./client.js";

export interface RetrieveQuery { query: string; projectId: string; partId?: string | null; k?: number; docTypes?: string[] }
type Mode = "bm25" | "hybrid";
type Logger = { warn: (o: object, m: string) => void };

const TIMEOUT_MS = 800;
const PART_BOOST = 3;

function bm25(q: RetrieveQuery) {
  return {
    bool: {
      must: [{ multi_match: { query: q.query, fields: ["title^2", "text"] } }],
      // A boost, not a filter: chunks about the part you point at rise, but general answers can still surface.
      should: q.partId ? [{ term: { part_ids: { value: q.partId, boost: PART_BOOST } } }] : [],
      filter: [{ term: { project_id: q.projectId } }, ...(q.docTypes?.length ? [{ terms: { doc_type: q.docTypes } }] : [])],
    },
  };
}

export function buildSearchBody(cfg: Config, q: RetrieveQuery, mode: Mode): Record<string, unknown> {
  const size = q.k ?? 5;
  if (mode === "bm25" || !cfg.jinaEmbedId) return { size, query: bm25(q) };
  const filter = [{ term: { project_id: q.projectId } }];
  const rrf = { rrf: { rank_window_size: 30, retrievers: [
    { standard: { query: bm25(q) } },
    { standard: { query: { bool: { must: [{ semantic: { field: "text_semantic", query: q.query } }], filter } } } },
  ] } };
  if (!cfg.jinaRerankId) return { size, retriever: rrf };
  return { size, retriever: { text_similarity_reranker: { retriever: rrf, field: "text", inference_id: cfg.jinaRerankId, inference_text: q.query, rank_window_size: 30 } } };
}

async function run(cfg: Config, q: RetrieveQuery, mode: Mode): Promise<RetrievedChunk[]> {
  const es = getEs(cfg)!;
  const res = await es.search<Record<string, any>>({ index: INDEX.docs, ...buildSearchBody(cfg, q, mode) }, { requestTimeout: mode === "hybrid" ? TIMEOUT_MS * 3 : TIMEOUT_MS });
  return res.hits.hits.map((h) => ({
    chunk_id: h._source!.chunk_id, document_id: h._source!.document_id, ...(h._source!.sheet_id ? { sheet_id: h._source!.sheet_id } : {}),
    page: h._source!.page, title: h._source!.title ?? "", text: h._source!.text ?? "", part_ids: h._source!.part_ids ?? [],
    score: h._score ?? 0, ...(h._source!.page_image_uri ? { page_image_uri: h._source!.page_image_uri } : {}),
  }));
}

/**
 * Never throws. Hybrid (BM25 + Jina semantic, fused, then reranked) when configured; on any error or timeout it
 * retries once as plain BM25; if that fails too it returns [] and the copilot answers without sources.
 */
export async function retrieve(cfg: Config, q: RetrieveQuery, log?: Logger): Promise<RetrievedChunk[]> {
  if (!getEs(cfg) || !q.query.trim()) return [];
  if (cfg.searchMode === "hybrid") {
    try { return await run(cfg, q, "hybrid"); }
    catch (err) { log?.warn({ err: (err as Error).message, fallback: "bm25" }, "hybrid search failed"); }
  }
  try { return await run(cfg, q, "bm25"); }
  catch (err) { log?.warn({ err: (err as Error).message, fallback: "none" }, "search failed"); return []; }
}
