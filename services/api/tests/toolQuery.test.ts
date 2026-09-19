import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { renderToolQuery } from "../src/search/toolQuery.js";

const q = JSON.parse(readFileSync(join(REPO_ROOT, "knowledge/agent-builder/tools/cutonce_search_documents.json"), "utf8")).configuration.query as string;

it("with both Jina ids: semantic match and rerank with the real id", () => {
  const r = renderToolQuery(q, { jinaEmbedId: ".jina-embeddings-v5-text-small", jinaRerankId: ".jina-reranker-v3" });
  expect(r).toContain("MATCH(text_semantic, ?query)");
  expect(r).toContain('"inference_id": ".jina-reranker-v3"');
});
it("without a reranker: no RERANK stage, still a valid pipe chain", () => {
  const r = renderToolQuery(q, { jinaEmbedId: "x", jinaRerankId: "" });
  expect(r).not.toContain("RERANK");
  expect(r).toContain("LIMIT 30 | SORT _score DESC | KEEP");
});
it("without embeddings: keyword match only", () => expect(renderToolQuery(q, { jinaEmbedId: "", jinaRerankId: "" })).not.toContain("text_semantic"));
it("never leaves a placeholder", () => {
  for (const cfg of [{ jinaEmbedId: "a", jinaRerankId: "b" }, { jinaEmbedId: "", jinaRerankId: "" }]) expect(renderToolQuery(q, cfg)).not.toContain("${");
});
