import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Config } from "../config.js";
import { jsonCall } from "../llm.js";
import { readJson, writeJsonAtomic } from "../store/fs.js";

const Item = z.object({
  kind: z.enum(["dimension", "note", "callout", "title_block", "table", "step"]), title: z.string(), text: z.string(),
  bbox_norm: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict().nullable(),
}).strict();
const Transcript = z.object({ items: z.array(Item) }).strict();
export type TranscriptItem = z.infer<typeof Item>;

/**
 * Reads a page that has no text layer (a scan, a phone photo, a handwritten note) with the vision model.
 * Cached beside the page, keyed by the image's SHA-256, so we never pay for the same page twice.
 */
export async function transcribePage(cfg: Config, imagePath: string, cachePath: string, context: string): Promise<TranscriptItem[]> {
  const data = readFileSync(imagePath);
  const sha = createHash("sha256").update(data).digest("hex");
  const cached = readJson<{ sha256: string; items: TranscriptItem[] }>(cachePath);
  if (cached?.sha256 === sha) return cached.items;
  const result = await jsonCall(cfg, {
    name: "page_transcript", schema: Transcript, timeoutMs: 60_000,
    system: "You transcribe construction and furniture documents for a search index. Copy text exactly as written, including dimensions and units. Never invent text. One item per distinct note, dimension group, table or instruction step. bbox_norm is the item's box as fractions of the page (x, y from the top-left), or null if unsure.",
    text: `Transcribe everything legible on this page. Context: ${context}`,
    images: [{ data, mime: imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }],
  });
  writeJsonAtomic(cachePath, { sha256: sha, items: result.items });
  return result.items;
}
