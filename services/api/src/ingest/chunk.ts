export interface Chunk { chunk_id: string; page: number; title: string; text: string; bbox_norm?: [number, number, number, number] }

const MIN = 300, MAX = 900;

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= MAX) return [paragraph];
  const out: string[] = [];
  let current = "";
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    for (const piece of sentence.length > MAX ? sentence.match(new RegExp(`.{1,${MAX}}`, "gs"))! : [sentence]) {
      if (current && current.length + 1 + piece.length > MAX) { out.push(current); current = ""; }
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Paragraphs merged up to 300–900 characters; long ones split at sentence ends.
 * Chunk ids are deterministic (chunk_<doc>_p<page>_<n>) so the golden-question file survives a re-ingest.
 */
export function chunkPage(documentId: string, page: number, text: string): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, " ").trim()).filter(Boolean).flatMap(splitLong);
  const merged: string[] = [];
  for (const p of paragraphs) {
    const last = merged.at(-1);
    // Merge while either side is still short and the result fits: no tiny trailing chunks.
    if (last !== undefined && (last.length < MIN || p.length < MIN) && last.length + 2 + p.length <= MAX) merged[merged.length - 1] = `${last}\n\n${p}`;
    else merged.push(p);
  }
  const slug = documentId.replace(/^doc_/, "");
  return merged.map((t, i) => ({
    chunk_id: `chunk_${slug}_p${page}_${i + 1}`, page, text: t,
    title: (t.split("\n")[0] ?? "").slice(0, 80).trim() || `Page ${page}`,
  }));
}

/** One chunk per transcribed item (scans, photos, handwritten notes). */
export function chunkItems(documentId: string, page: number, items: { title: string; text: string; bbox_norm?: [number, number, number, number] | null }[]): Chunk[] {
  const slug = documentId.replace(/^doc_/, "");
  return items.filter((i) => i.text.trim()).map((item, i) => ({
    chunk_id: `chunk_${slug}_p${page}_${i + 1}`, page, title: item.title || `Page ${page}`, text: item.text.trim(),
    ...(item.bbox_norm ? { bbox_norm: item.bbox_norm } : {}),
  }));
}
