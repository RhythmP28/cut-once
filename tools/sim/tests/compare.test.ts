import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compareImages, compareScreens } from "../compare.js";

function solid(w: number, h: number, rgb: [number, number, number], paint?: (x: number, y: number) => boolean): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = paint?.(x, y) ? [255, 255, 255] : rgb;
    png.data[i] = c[0]!; png.data[i + 1] = c[1]!; png.data[i + 2] = c[2]!; png.data[i + 3] = 255;
  }
  return png;
}
const write = (dir: string, name: string, png: PNG) => { mkdirSync(join(dir, "screens"), { recursive: true }); writeFileSync(join(dir, "screens", `${name}.png`), PNG.sync.write(png)); };
const scenesFile = (dir: string, names: string[]) => writeFileSync(join(dir, "scenes.json"), JSON.stringify(names.map((n) => ({ name: n, url: "/", note: n }))));

describe("compareImages", () => {
  it("measures the share of pixels that changed", () => {
    const a = solid(10, 10, [0, 0, 0]);
    const b = solid(10, 10, [0, 0, 0], (x, y) => x < 5 && y < 2); // 10 of 100 pixels
    expect(compareImages(a, a).diffPct).toBe(0);
    expect(compareImages(a, b).diffPct).toBe(10);
  });
  it("flags a size change without comparing pixels", () => {
    expect(compareImages(solid(10, 10, [0, 0, 0]), solid(12, 10, [0, 0, 0]))).toEqual({ diffPct: 100, diff: null, sizeChanged: true });
  });
});

describe("compareScreens", () => {
  it("classifies same, changed, new and removed scenes and writes diff images", () => {
    const cur = mkdtempSync(join(tmpdir(), "cur-")), base = mkdtempSync(join(tmpdir(), "base-")), diff = join(cur, "diff");
    write(cur, "same", solid(8, 8, [10, 10, 10])); write(base, "same", solid(8, 8, [10, 10, 10]));
    write(cur, "changed", solid(8, 8, [10, 10, 10], (x) => x === 0)); write(base, "changed", solid(8, 8, [10, 10, 10]));
    write(cur, "new", solid(8, 8, [0, 0, 0]));
    write(base, "gone", solid(8, 8, [0, 0, 0]));
    scenesFile(cur, ["same", "changed", "new"]); scenesFile(base, ["same", "changed", "gone"]);
    const r = Object.fromEntries(compareScreens(cur, base, diff).map((s) => [s.scene, s.status]));
    expect(r).toEqual({ same: "same", changed: "changed", new: "new", gone: "removed" });
    expect(existsSync(join(diff, "changed.png"))).toBe(true);
  });
  it("marks everything new when there is no baseline", () => {
    const cur = mkdtempSync(join(tmpdir(), "cur-"));
    write(cur, "a", solid(4, 4, [0, 0, 0])); scenesFile(cur, ["a"]);
    expect(compareScreens(cur, null, join(cur, "diff"))).toEqual([{ scene: "a", note: "a", status: "new", diffPct: null }]);
  });
});
