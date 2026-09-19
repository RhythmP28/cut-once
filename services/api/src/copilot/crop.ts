import jpeg from "jpeg-js";

export type BBox = [number, number, number, number];

/** Grows a box by `pad` on every side and clamps it to the image. 25% padding gives the model context around the part. */
export function padded(bbox: BBox, width: number, height: number, pad = 0.25): BBox {
  const [x, y, w, h] = bbox;
  const dx = w * pad;
  const dy = h * pad;
  const x0 = Math.max(0, Math.round(x - dx));
  const y0 = Math.max(0, Math.round(y - dy));
  const x1 = Math.min(width, Math.round(x + w + dx));
  const y1 = Math.min(height, Math.round(y + h + dy));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}

/**
 * Cuts one region out of a JPEG. Verification asks a narrow question about one part, so the model
 * sees only that part's neighbourhood — a full frame invites it to answer about something else.
 * `bbox` is in the source image's pixels; a different-sized image is scaled to match first.
 */
export function cropJpeg(source: Buffer, bbox: BBox, reference: { width: number; height: number }, quality = 85): Buffer {
  const decoded = jpeg.decode(source, { useTArray: true });
  const data = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length);
  const sx = decoded.width / reference.width;
  const sy = decoded.height / reference.height;
  const [bx, by, bw, bh] = padded([bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy] as BBox, decoded.width, decoded.height);
  const out = Buffer.alloc(bw * bh * 4);
  for (let row = 0; row < bh; row++) {
    const from = ((by + row) * decoded.width + bx) * 4;
    data.copy(out, row * bw * 4, from, from + bw * 4);
  }
  return Buffer.from(jpeg.encode({ data: out, width: bw, height: bh }, quality).data);
}
