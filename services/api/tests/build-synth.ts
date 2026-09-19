import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildScan, Twin, Vec3 } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";

/** Shared by the build tests. Kept out of *.test.ts files: importing a test file would register its tests twice. */
export const photoB64 = () => readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg")).toString("base64");

/** A labelled can on the table; override what a test cares about. */
export const twin = (over: Partial<Twin> = {}): Twin => ({
  twin_id: "o1", name: "unknown", label: "object", shape: { type: "cylinder", axis: "y", diameter: 0.06, length: 0.15 },
  position: [0, 0.74 + 0.075, 0.5], yaw_deg: 0, sits_on: "s1", material: "metal", load_bearing: true, cuttable: false,
  confidence: 0.9, error_m: 0.02, points: 30, distance_m: 1.5, bbox_px: [0, 0, 10, 10], snapped: false, scan_ids: ["scan_a"], ...over,
});

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

/** noiseM: depth noise in metres, the same at every range. sigmaFrac: depth noise whose standard deviation is this fraction of the range, as a real depth sensor's is. */
export interface SynthOptions { cols?: number; rows?: number; noiseM?: number; sigmaFrac?: number; seed?: number }

/** A BuildScan of the scene: right-handed, +Y up; the camera's right is cross(forward, up), as the headset's mirrored frame gives. */
export function synthScan(prims: Prim[], cam: Vec3, lookAt: Vec3, opts: SynthOptions = {}): BuildScan {
  const cols = opts.cols ?? 128, rows = opts.rows ?? 96, width = 1280, height = 960, fx = 853.6, fy = 853.6, cx = 640, cy = 480;
  const f = unit(sub(lookAt, cam)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f);
  let seed = opts.seed ?? 1;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // The sum of three uniforms minus 1.5 has a standard deviation of 0.5, hence the factor 2 for sigmaFrac.
  const noise = (t: number) => (rand() + rand() + rand() - 1.5) * ((opts.noiseM ?? 0) + 2 * (opts.sigmaFrac ?? 0) * t);
  const points_mm: number[] = [];
  let hit = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = ((c + 0.5) * width) / cols, v = ((r + 0.5) * height) / rows;
    const d = unit(add(f, add(mul(right, (u - cx) / fx), mul(up, -(v - cy) / fy))));
    let t = Infinity;
    for (const p of prims) t = Math.min(t, p.kind === "box" ? hitBox(cam, d, p) : p.kind === "obox" ? hitTurnedBox(cam, d, p) : hitCyl(cam, d, p));
    if (!Number.isFinite(t) || t > 6) { points_mm.push(0, 0, 0); hit += "0"; continue; }
    const p = add(cam, mul(d, t + noise(t)));
    points_mm.push(Math.round(p[0] * 1000), Math.round(p[1] * 1000), Math.round(p[2] * 1000));
    hit += "1";
  }
  return {
    scan_id: "scan_synthetic", session_id: "bsess_synthetic", device_id: "synth", captured_at: new Date(0).toISOString(),
    grid: { cols, rows }, points_mm, hit, camera: { position: cam, forward: f, intrinsics: { width, height, fx, fy, cx, cy } },
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
