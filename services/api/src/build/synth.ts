import jpeg from "jpeg-js";
import type { BuildScan, Vec3 } from "@cutonce/schemas";

/**
 * Synthetic scans: a scene of boxes and cylinders seen through the headset's camera model, as the organised point cloud
 * the headset uploads, with a depth sensor's noise. The build tests run on these, and `pnpm build:fixtures` records one
 * as data/build/recordings/synthetic_kit, so build mode can be replayed end to end with no headset in the room.
 */
export type Prim =
  | { kind: "box"; min: Vec3; max: Vec3 }
  | { kind: "obox"; centre: Vec3; size: Vec3; yawDeg: number }          // a box turned about +Y (nothing on a real table is square to the room)
  | { kind: "cyl"; x: number; z: number; r: number; y0: number; y1: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

function hitBox(o: Vec3, d: Vec3, b: { min: Vec3; max: Vec3 }): number {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-12) { if (o[i]! < b.min[i]! || o[i]! > b.max[i]!) return Infinity; continue; }
    let a = (b.min[i]! - o[i]!) / d[i]!, c = (b.max[i]! - o[i]!) / d[i]!;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
  }
  return t0 <= t1 && t0 > 1e-6 ? t0 : Infinity;
}

/** A box turned about +Y: turn the ray into the box's own frame, then it is an ordinary box. */
function hitTurnedBox(o: Vec3, d: Vec3, b: { centre: Vec3; size: Vec3; yawDeg: number }): number {
  const t = (-b.yawDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const turn = (v: Vec3): Vec3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const h: Vec3 = [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
  return hitBox(turn(sub(o, b.centre)), turn(d), { min: [-h[0], -h[1], -h[2]], max: h });
}

function hitCyl(o: Vec3, d: Vec3, c: { x: number; z: number; r: number; y0: number; y1: number }): number {
  let best = Infinity;
  const ox = o[0] - c.x, oz = o[2] - c.z;
  const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), C = ox * ox + oz * oz - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (A > 1e-12 && disc >= 0) {
    for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
      const y = o[1] + t * d[1];
      if (t > 1e-6 && y >= c.y0 && y <= c.y1) best = Math.min(best, t);
    }
  }
  if (Math.abs(d[1]) > 1e-12) {
    const t = (c.y1 - o[1]) / d[1], x = o[0] + t * d[0] - c.x, z = o[2] + t * d[2] - c.z;
    if (t > 1e-6 && x * x + z * z <= c.r * c.r) best = Math.min(best, t);
  }
  return best;
}

/** The nearest primitive along a ray: its distance (Infinity for none) and its index. */
function cast(prims: Prim[], o: Vec3, d: Vec3): { t: number; k: number } {
  let t = Infinity, k = -1;
  prims.forEach((p, i) => {
    const hit = p.kind === "box" ? hitBox(o, d, p) : p.kind === "obox" ? hitTurnedBox(o, d, p) : hitCyl(o, d, p);
    if (hit < t) { t = hit; k = i; }
  });
  return { t, k };
}

/** The pinhole camera every synthetic scan and photo uses: 1280 × 960, looking from `cam` at `lookAt`. */
function camera(cam: Vec3, lookAt: Vec3) {
  const width = 1280, height = 960, fx = 853.6, fy = 853.6, cx = 640, cy = 480;
  const f = unit(sub(lookAt, cam)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f);
  const ray = (u: number, v: number): Vec3 => unit(add(f, add(mul(right, (u - cx) / fx), mul(up, -(v - cy) / fy))));
  return { f, ray, intrinsics: { width, height, fx, fy, cx, cy } };
}

/** noiseM: depth noise in metres, the same at every range. sigmaFrac: depth noise whose standard deviation is this fraction of the range, as a real depth sensor's is. */
export interface SynthOptions { cols?: number; rows?: number; noiseM?: number; sigmaFrac?: number; seed?: number }

/** A BuildScan of the scene: right-handed, +Y up; the camera's right is cross(forward, up), as the headset's mirrored frame gives. */
export function synthScan(prims: Prim[], cam: Vec3, lookAt: Vec3, opts: SynthOptions = {}): BuildScan {
  const cols = opts.cols ?? 128, rows = opts.rows ?? 96;
  const { f, ray, intrinsics } = camera(cam, lookAt), { width, height } = intrinsics;
  let seed = opts.seed ?? 1;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // The sum of three uniforms minus 1.5 has a standard deviation of 0.5, hence the factor 2 for sigmaFrac.
  const noise = (t: number) => (rand() + rand() + rand() - 1.5) * ((opts.noiseM ?? 0) + 2 * (opts.sigmaFrac ?? 0) * t);
  const points_mm: number[] = [];
  let hit = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = ((c + 0.5) * width) / cols, v = ((r + 0.5) * height) / rows;
    const d = ray(u, v);
    const { t } = cast(prims, cam, d);
    if (!Number.isFinite(t) || t > 6) { points_mm.push(0, 0, 0); hit += "0"; continue; }
    const p = add(cam, mul(d, t + noise(t)));
    points_mm.push(Math.round(p[0] * 1000) || 0, Math.round(p[1] * 1000) || 0, Math.round(p[2] * 1000) || 0);   // "|| 0": never -0, which JSON cannot carry
    hit += "1";
  }
  return {
    scan_id: "scan_synthetic", session_id: "bsess_synthetic", device_id: "synth", captured_at: new Date(0).toISOString(),
    grid: { cols, rows }, points_mm, hit, camera: { position: cam, forward: f, intrinsics },
  };
}

export const FLOOR: Prim = { kind: "box", min: [-5, -0.02, -5], max: [5, 0, 5] };
export const TABLE: Prim = { kind: "box", min: [-0.6, 0.72, 0.2], max: [0.6, 0.74, 1.0] };
export const CAMERA = { cam: [0, 1.6, -1.0] as Vec3, lookAt: [0, 0.6, 0.5] as Vec3 };
export const can = (x: number, z: number, r = 0.033, h = 0.157, y0 = 0.74): Prim => ({ kind: "cyl", x, z, r, y0, y1: y0 + h });
export const box = (cx: number, cz: number, sx: number, sy: number, sz: number, y0 = 0.74): Prim =>
  ({ kind: "box", min: [cx - sx / 2, y0, cz - sz / 2], max: [cx + sx / 2, y0 + sy, cz + sz / 2] });

/** A box standing on height y0, turned yawDeg about +Y. */
export const turned = (cx: number, cz: number, sx: number, sy: number, sz: number, yawDeg: number, y0 = 0.74): Prim =>
  ({ kind: "obox", centre: [cx, y0 + sy / 2, cz], size: [sx, sy, sz], yawDeg });

/** The demo kit on a table: a pizza box lying flat and three tall cans. */
export const KIT = [FLOOR, TABLE, box(-0.2, 0.6, 0.35, 0.04, 0.35), can(0.1, 0.4), can(0.22, 0.4), can(0.16, 0.55)];

/**
 * The photo that goes with a synthetic scan: the same scene through the same camera, one flat colour per primitive
 * (`colours`, in the primitives' order), darker with distance and on faces turned away from the light. It is a
 * drawing, not a photograph, but the numbered boxes land on the right shapes, which is what a replay needs.
 */
export function renderPhoto(prims: Prim[], colours: [number, number, number][], cam: Vec3, lookAt: Vec3): Buffer {
  const { ray, intrinsics: { width, height } } = camera(cam, lookAt);
  const light = unit([0.4, 1, -0.5]);
  const data = Buffer.alloc(width * height * 4, 255);
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) {
    const d = ray(u + 0.5, v + 0.5), { t, k } = cast(prims, cam, d);
    let rgb: [number, number, number] = [206, 212, 218];                                   // the far wall
    if (Number.isFinite(t) && t <= 6) {
      const p = prims[k]!, at = add(cam, mul(d, t));
      // Which way the face points. A top faces up; a can's side faces outwards; a box's side is drawn facing the camera.
      const topY = p.kind === "cyl" ? p.y1 : p.kind === "box" ? p.max[1] : p.centre[1] + p.size[1] / 2;
      const n: Vec3 = Math.abs(at[1] - topY) < 1e-4 ? [0, 1, 0] : p.kind === "cyl" ? unit([at[0] - p.x, 0, at[2] - p.z]) : [0, 0, -1];
      const shade = (0.55 + 0.45 * Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2])) * Math.max(0.6, 1 - t / 12);
      rgb = colours[k]!.map((c) => Math.round(c * shade)) as [number, number, number];
    }
    const o = (v * width + u) * 4;
    data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2];
  }
  return Buffer.from(jpeg.encode({ data, width, height }, 82).data);
}
