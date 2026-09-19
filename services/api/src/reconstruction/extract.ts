import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { S, Strict, type PlanDraft } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { pageText, pdfPageCount, rasterise } from "../ingest/pages.js";
import { jsonCall } from "../llm.js";
import { EXTRACT_SYSTEM, extractUserText } from "./prompts.js";

const MAX_PAGES = 8; // drawings first; a long manual would swamp the context and the bill

/** One strict-JSON call: page images plus text layers in, a PlanDraft with evidence out. */
export async function extractPlan(ctx: Ctx, documentIds: string[]): Promise<PlanDraft> {
  const docs: { filename: string; pages: { page: number; text: string }[] }[] = [];
  const images: { data: Buffer; mime: "image/png" | "image/jpeg" }[] = [];
  for (const did of documentIds) {
    const doc = ctx.docs.get(did), file = ctx.docs.originalPath(did), ext = extname(file).toLowerCase();
    const pages: { page: number; text: string }[] = [];
    if (ext === ".pdf") {
      const pngs = await rasterise(file, join(ctx.docs.dir(did), "pages"), 150);
      for (let page = 1; page <= Math.min(await pdfPageCount(file), MAX_PAGES - images.length); page++) {
        pages.push({ page, text: await pageText(file, page) });
        images.push({ data: readFileSync(pngs[page - 1]!), mime: "image/png" });
      }
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) { pages.push({ page: 1, text: "" }); images.push({ data: readFileSync(file), mime: ext === ".png" ? "image/png" : "image/jpeg" }); }
    else if ([".csv", ".txt", ".md"].includes(ext)) pages.push({ page: 1, text: readFileSync(file, "utf8").slice(0, 6000) });
    if (pages.length) docs.push({ filename: doc.filename, pages });
  }
  return jsonCall(ctx.cfg, { name: "plan_draft", schema: S.PlanDraft, strictSchema: Strict.PlanDraft, system: EXTRACT_SYSTEM, text: extractUserText(docs), images, timeoutMs: 180_000 });
}
