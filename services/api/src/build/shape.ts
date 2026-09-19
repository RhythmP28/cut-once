import type { TwinShape, Vec3 } from "@cutonce/schemas";

export type Size = [number, number, number];

/** Height as it stands (y extent). */
export const heightOf = (s: TwinShape) => (s.type === "box" ? s.size[1] : s.axis === "y" ? s.length : s.diameter);

/** Half extents along x, y, z. */
export function halfOf(s: TwinShape): Vec3 {
  if (s.type === "box") return [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
  const r = s.diameter / 2, h = s.length / 2;
  return [s.axis === "x" ? h : r, s.axis === "y" ? h : r, s.axis === "z" ? h : r];
}

export const volumeOf = (s: TwinShape) => (s.type === "box" ? s.size[0] * s.size[1] * s.size[2] : Math.PI * (s.diameter / 2) ** 2 * s.length);

const cm = (m: number) => Math.round(m * 1000) / 10;

/** Dimensions in cm, largest first: the same object measured in any orientation gives the same list. */
export const dimsCm = (s: TwinShape) =>
  (s.type === "box" ? [...s.size] : [s.length, s.diameter, s.diameter]).map(cm).sort((a, b) => b - a);

/** A box lying flat: longest side along x, thinnest up, the middle one along z. */
export function flatSize(size: readonly number[]): Size {
  const [a, b, c] = [...size].sort((x, y) => y - x) as Size;
  return [a, c, b];
}

export const describeShape = (s: TwinShape) =>
  s.type === "cylinder"
    ? `cylinder ${cm(s.diameter)} cm wide, ${cm(heightOf(s))} cm tall`
    : `box ${cm(s.size[0])} × ${cm(s.size[2])} cm, ${cm(s.size[1])} cm tall`;
