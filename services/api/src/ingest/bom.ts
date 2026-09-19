import type { Material } from "@cutonce/schemas";
import type { Chunk } from "./chunk.js";

/** A small CSV reader: quoted fields, doubled quotes, commas inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some((f) => f.trim())) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field); if (row.some((f) => f.trim())) rows.push(row);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length > 1));

/** Matches a supplier-style row ("Leg Ø40 700mm BLK c/w M8 stud") to a material by shared words. */
export function matchMaterial(row: string, materials: readonly Material[]): string | null {
  const want = tokens(row);
  let best: { id: string; score: number } | null = null;
  for (const m of materials) {
    const have = tokens(`${m.name} ${m.spec}`);
    const shared = [...have].filter((t) => want.has(t)).length;
    const score = shared / Math.max(1, Math.min(have.size, want.size));
    if (shared >= 2 && score >= 0.4 && (!best || score > best.score)) best = { id: m.material_id, score };
  }
  return best?.id ?? null;
}

export interface BomRow { line: string; item: string; qty: number; unit: string; spec: string; notes: string; raw_text: string; material_id: string | null }

export function readBom(documentId: string, csv: string, materials: readonly Material[]): { rows: BomRow[]; chunks: (Chunk & { material_ids: string[] })[] } {
  const slug = documentId.replace(/^doc_/, "");
  const rows = parseCsv(csv).map((r, i): BomRow => {
    const raw = [r.item, r.spec, r.notes].filter(Boolean).join(" · ");
    return { line: r.line || String(i + 1), item: r.item ?? "", qty: Number(r.qty) || 0, unit: r.unit ?? "", spec: r.spec ?? "", notes: r.notes ?? "", raw_text: raw, material_id: matchMaterial(raw, materials) };
  });
  const chunks = rows.map((r, i) => ({
    chunk_id: `chunk_${slug}_p1_${i + 1}`, page: 1, title: `Parts list line ${r.line}: ${r.item}`.slice(0, 80),
    text: `${r.item}. Quantity ${r.qty} ${r.unit}. ${r.spec}${r.notes ? `. ${r.notes}` : ""}`, material_ids: r.material_id ? [r.material_id] : [],
  }));
  return { rows, chunks };
}
