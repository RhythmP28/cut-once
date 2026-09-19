import { execFile } from "node:child_process";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureDir } from "../store/fs.js";

const run = promisify(execFile);

/** Page count from poppler's pdfinfo. */
export async function pdfPageCount(pdf: string): Promise<number> {
  const { stdout } = await run("pdfinfo", [pdf]);
  return Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 0);
}

/** Rasterises every page to <outDir>/p-<n>.png with poppler. Skips pages that already exist. */
export async function rasterise(pdf: string, outDir: string, dpi = 200): Promise<string[]> {
  ensureDir(outDir);
  const pages = await pdfPageCount(pdf);
  const want = Array.from({ length: pages }, (_, i) => join(outDir, `p-${i + 1}.png`));
  if (want.every(existsSync)) return want;
  await run("pdftoppm", ["-png", "-r", String(dpi), pdf, join(outDir, "raw")], { maxBuffer: 1 << 26 });
  for (const f of readdirSync(outDir)) { // pdftoppm zero-pads page numbers by page count: raw-01.png → p-1.png
    const n = /^raw-0*(\d+)\.png$/.exec(f)?.[1];
    if (n) renameSync(join(outDir, f), join(outDir, `p-${n}.png`));
  }
  return want.filter(existsSync);
}

/** The text layer of one page, in reading order. Empty for scans and photos. */
export async function pageText(pdf: string, page: number): Promise<string> {
  const { stdout } = await run("pdftotext", ["-f", String(page), "-l", String(page), "-layout", pdf, "-"], { maxBuffer: 1 << 24 });
  return stdout.replace(/\f/g, "").trim();
}
