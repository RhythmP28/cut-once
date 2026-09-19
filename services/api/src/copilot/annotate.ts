import jpeg from "jpeg-js";
import type { PartState, VisiblePart } from "@cutonce/schemas";

/** 3×5 bitmaps, one row per line, used for the box numbers. A font file would be overkill for ten glyphs. */
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

/** Colour carries the part's state, so the model sees status and location in one glance. */
const COLOUR: Record<PartState, [number, number, number]> = {
  missing: [0, 230, 118],  // green: still to install
  built: [255, 255, 255],  // white: already in
  wrong: [255, 64, 64],    // red: flagged
};

export interface LegendRow { n: number; part_id: string; state: PartState; in_frame: number; distance_m: number }
export interface Annotated { jpeg: Buffer; legend: LegendRow[]; width: number; height: number }

interface Raster { data: Buffer; width: number; height: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Nearest-neighbour downscale. The model reads boxes and shapes, not fine detail, so quality here is free to lose. */
function resize(src: Raster, width: number, height: number): Raster {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      src.data.copy(data, (y * width + x) * 4, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4);
    }
  }
  return { data, width, height };
}

function px(img: Raster, x: number, y: number, [r, g, b]: [number, number, number]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}

function rect(img: Raster, x: number, y: number, w: number, h: number, colour: [number, number, number], thickness: number) {
  for (let t = 0; t < thickness; t++) {
    for (let i = x - t; i <= x + w + t; i++) { px(img, i, y - t, colour); px(img, i, y + h + t, colour); }
    for (let j = y - t; j <= y + h + t; j++) { px(img, x - t, j, colour); px(img, x + w + t, j, colour); }
  }
}

function fill(img: Raster, x: number, y: number, w: number, h: number, colour: [number, number, number]) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(img, i, j, colour);
}

/** Draws `n` at (x, y) as 3×5 glyphs scaled by `scale`, on a filled badge so it reads over any background. */
function label(img: Raster, n: number, x: number, y: number, colour: [number, number, number], scale = 3) {
  const glyphs = String(n).split("").map((d) => DIGITS[Number(d)]!);
  const pad = scale;
  const w = glyphs.length * (3 * scale + scale) + pad;
  const h = 5 * scale + pad * 2;
  fill(img, x, y, w, h, colour);
  const ink: [number, number, number] = [16, 16, 16];
  let ox = x + pad;
  for (const g of glyphs) {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (g[row * 3 + col] !== "1") continue;
      fill(img, ox + col * scale, y + pad + row * scale, scale, scale, ink);
    }
    ox += 4 * scale;
  }
}

/**
 * Draws one numbered box per visible part on a downscaled copy of the frame and returns the legend that
 * maps each number back to its part_id. Section 10: this is what lets the model tie pixels to part ids
 * without guessing. Boxes arrive in the original frame's pixels and are scaled with the image.
 *
 * Best effort by design — the caller treats a throw as "send the raw frame only".
 */
export function annotateFrame(frame: Buffer, visible: VisiblePart[], maxWidth = 1024): Annotated {
  const decoded = jpeg.decode(frame, { useTArray: true });
  const src: Raster = { data: Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length), width: decoded.width, height: decoded.height };
  const scale = src.width > maxWidth ? maxWidth / src.width : 1;
  const img = scale < 1 ? resize(src, Math.round(src.width * scale), Math.round(src.height * scale)) : src;

  // Nearest first: a small far box drawn last stays readable on top of the big near one behind it.
  const ordered = [...visible].sort((a, b) => b.distance_m - a.distance_m);
  const legend: LegendRow[] = [];
  const thickness = Math.max(2, Math.round(img.width / 400));

  ordered.forEach((v, i) => {
    const n = i + 1;
    const [bx, by, bw, bh] = v.bbox_px;
    const x = clamp(Math.round(bx * scale), 0, img.width - 1);
    const y = clamp(Math.round(by * scale), 0, img.height - 1);
    const w = clamp(Math.round(bw * scale), 1, img.width - x);
    const h = clamp(Math.round(bh * scale), 1, img.height - y);
    const colour = COLOUR[v.state] ?? COLOUR.missing;
    rect(img, x, y, w, h, colour, thickness);
    label(img, n, x, Math.max(0, y - (5 * 3 + 6)), colour);
    legend.push({ n, part_id: v.part_id, state: v.state, in_frame: v.in_frame, distance_m: v.distance_m });
  });

  const out = jpeg.encode({ data: img.data, width: img.width, height: img.height }, 80);
  return { jpeg: Buffer.from(out.data), legend, width: img.width, height: img.height };
}
