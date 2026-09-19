import sharp from "sharp";

/** bbox_px is [x, y, w, h] in the camera frame's pixels, top-left origin: the order the context packet uses. */
export interface Mark { n: number; bbox_px: [number, number, number, number]; state: "missing" | "built" | "wrong" | "neutral" }
const COLOUR: Record<Mark["state"], string> = { missing: "#00e5ff", built: "#39ff14", wrong: "#ff3b3b", neutral: "#ffd400" };

/**
 * Draws numbered part boxes on the frame (Set-of-Mark prompting). The number → part_id table goes in the prompt text,
 * and the raw frame is sent too, because a mark can hide the part it points at.
 * sharp resizes before it composites, so the SVG is drawn at the resized size.
 */
export async function annotateFrame(jpeg: Buffer, marks: Mark[], width = 1024): Promise<Buffer> {
  const meta = await sharp(jpeg).metadata();
  const scale = width / (meta.width ?? width);
  const height = Math.round((meta.height ?? width) * scale);
  const shapes = marks.map(({ n, bbox_px, state }) => {
    const [x, y, w, h] = bbox_px.map((v) => Math.round(v * scale));
    const c = COLOUR[state], ty = Math.max(0, y - 22);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${c}" stroke-width="3"/>` +
      `<rect x="${x}" y="${ty}" width="30" height="22" fill="${c}"/>` +
      `<text x="${x + 7}" y="${ty + 17}" font-size="17" font-family="Helvetica, Arial, sans-serif" fill="#000">${n}</text>`;
  }).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`);
  return sharp(jpeg).resize(width, height).composite([{ input: svg }]).jpeg({ quality: 80 }).toBuffer();
}
