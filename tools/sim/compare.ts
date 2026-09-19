import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { ScreenResult } from "./types.js";

/** A scene counts as unchanged when at most this share of its pixels (in %) differs: anti-aliasing noise. */
export const SAME_PCT = 0.05;

export interface ImageDiff { diffPct: number; diff: PNG | null; sizeChanged: boolean }

export function compareImages(a: PNG, b: PNG, threshold = 0.1): ImageDiff {
  if (a.width !== b.width || a.height !== b.height) return { diffPct: 100, diff: null, sizeChanged: true };
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  return { diffPct: Math.round((n / (a.width * a.height)) * 100 * 1000) / 1000, diff, sizeChanged: false };
}

interface SceneEntry { name: string; note: string }

function readScenes(dir: string): SceneEntry[] {
  const file = join(dir, "scenes.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SceneEntry[]) : [];
}
const png = (dir: string, scene: string) => join(dir, "screens", `${scene}.png`);
const readPng = (path: string) => PNG.sync.read(readFileSync(path));

/**
 * Compares this run's scene pictures with the baseline's. Writes a difference image for every scene
 * that changed, to `diffDir/<scene>.png`. Scene names are the key, so a renamed scene shows as new + removed.
 */
export function compareScreens(currentDir: string, baselineDir: string | null, diffDir: string): ScreenResult[] {
  const current = readScenes(currentDir);
  const baseline = baselineDir ? readScenes(baselineDir) : [];
  const results: ScreenResult[] = [];
  for (const s of current) {
    const cur = png(currentDir, s.name);
    const old = baselineDir ? png(baselineDir, s.name) : null;
    if (!existsSync(cur)) continue;
    if (!old || !existsSync(old)) { results.push({ scene: s.name, note: s.note, status: "new", diffPct: null }); continue; }
    const r = compareImages(readPng(old), readPng(cur));
    if (r.sizeChanged) { results.push({ scene: s.name, note: s.note, status: "size_changed", diffPct: 100 }); continue; }
    if (r.diffPct <= SAME_PCT) { results.push({ scene: s.name, note: s.note, status: "same", diffPct: r.diffPct }); continue; }
    mkdirSync(diffDir, { recursive: true });
    writeFileSync(join(diffDir, `${s.name}.png`), PNG.sync.write(r.diff!));
    results.push({ scene: s.name, note: s.note, status: "changed", diffPct: r.diffPct });
  }
  const names = new Set(current.map((s) => s.name));
  for (const s of baseline) if (!names.has(s.name)) results.push({ scene: s.name, note: s.note, status: "removed", diffPct: null });
  return results;
}
