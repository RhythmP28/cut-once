import sharp from "sharp";
import { expect, it } from "vitest";
import { annotateFrame } from "../src/copilot/annotate.js";

const frame = () => sharp({ create: { width: 1280, height: 960, channels: 3, background: "#202020" } }).jpeg().toBuffer();
async function pixels(jpeg: Buffer) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  return { info, px: (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)) };
}

it("resizes to 1024 wide, keeps 4:3, and draws the box in its state colour", async () => {
  const out = await annotateFrame(await frame(), [{ n: 1, bbox_px: [640, 480, 200, 200], state: "missing" }]);
  const { info, px } = await pixels(out);
  expect([info.width, info.height]).toEqual([1024, 768]);
  const [r, g, b] = px(Math.round(640 * 0.8), Math.round(580 * 0.8)); // centre of the box's left edge (x = 512), half-way down
  expect(r).toBeLessThan(90); expect(g).toBeGreaterThan(150); expect(b).toBeGreaterThan(150); // cyan (#00e5ff), allowing JPEG blur
  expect(px(10, 10)[0]).toBeLessThan(60); // the background is untouched
});

it("colours by state: a wrong part is red", async () => {
  const { px } = await pixels(await annotateFrame(await frame(), [{ n: 2, bbox_px: [100, 400, 200, 200], state: "wrong" }]));
  const [r, g, b] = px(80, 400); // left edge at x = 100 * 0.8, half-way down (y = 500 * 0.8)
  expect(r).toBeGreaterThan(150); expect(g).toBeLessThan(110); expect(b).toBeLessThan(110);
});
