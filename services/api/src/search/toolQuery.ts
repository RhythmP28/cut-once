import type { Config } from "../config.js";

/** Fits a tool's ES|QL to the cluster: drops the semantic branch or the rerank stage when their Jina endpoint is not configured. */
export function renderToolQuery(query: string, cfg: Pick<Config, "jinaEmbedId" | "jinaRerankId">): string {
  let q = query;
  if (!cfg.jinaEmbedId) q = q.replace(/ OR MATCH\(text_semantic, \?query\)/, "");
  if (!cfg.jinaRerankId) q = q.replace(/ \| RERANK [^|]+?(?= \||$)/, "");
  return q.replaceAll("${JINA_RERANK_ID}", cfg.jinaRerankId);
}
