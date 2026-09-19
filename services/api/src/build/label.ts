import { z, type ZodTypeAny } from "zod";
import { S, type Surface, type Twin } from "@cutonce/schemas";
import type { Config } from "../config.js";
import { annotateFrame, type Mark } from "../copilot/annotate.js";
import type { JsonCall } from "../llm.js";
import { standardShape, type Vocab } from "./data.js";
import { describeShape, dimsCm, flatSize, heightOf } from "./shape.js";
import type { Cloud } from "./twins.js";

const LabelItem = z.object({
  n: z.number().int(), is_object: z.boolean(), name: z.string(), other_name: z.string().nullable(), count: z.number().int(),
  material: S.TwinMaterial, load_bearing: z.boolean(), cuttable: z.boolean(), confidence: z.number(),
  // Round or boxy, as it looks in the photo. Depth alone cannot tell for a small object seen with noise.
  shape: z.enum(["box", "cylinder"]),
});
const Missed = z.object({ name: z.string(), other_name: z.string().nullable(), x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const LabelResult = z.object({ objects: z.array(LabelItem), missed: z.array(Missed) });
export type LabelResult = z.infer<typeof LabelResult>;

/** jsonCall's shape without its generic, so tests can pass a plain mock; results are parsed where they are used. */
export type ModelCall = (cfg: Config, call: JsonCall<ZodTypeAny>) => Promise<unknown>;
export interface LabelDeps { cfg: Config; call: ModelCall; model: string; vocab: Vocab; timeoutMs: number }

const ANNOTATED_WIDTH = 1024;   // annotateFrame's output width: the model's pixel boxes are in this image
/** More numbered boxes than this make the photo unreadable, for a person and for the model. The nearest come first; the rest stay unnamed until a closer scan. */
export const MAX_MARKS = 24;

/** "tall_can (tall can, 15.7 × 6.6 × 6.6 cm)": the size lets the measured one settle look-alikes (a 12 cm can or a 16 cm one). */
const vocabLine = (vocab: Vocab) => [...vocab.values()].map((v) => {
  const std = standardShape(v);
  return `${v.name} (${v.label}${std ? `, ${dimsCm(std).join(" × ")} cm` : ", any size"})`;
}).join("; ");

const system = (vocab: Vocab) => [
  "You label real objects for a mixed-reality build assistant. Image 1 has numbered yellow boxes around things a depth sensor found; image 2 is the same photo without boxes.",
  "For every number return one entry:",
  "- is_object: false for people, hands, walls, table edges, shadows, reflections, cables, or parts of furniture.",
  `- name: one of these, or "other": ${vocabLine(vocab)}. Use the measured size to choose between look-alikes.`,
  "- other_name: a short plain name when name is \"other\", else null.",
  "- count: how many separate, identical objects the box covers (usually 1; 2 when two cans stand touching).",
  "- shape: cylinder if it is round seen from above (cans, bottles, cups, rolls), else box.",
  "- material, load_bearing (could it hold a pizza box on top without crushing or rolling?), cuttable (card, paper or foam you could cut with scissors), confidence 0–1.",
  "Then list in missed any clearly visible object with no box (clear bottles, glass, very thin things), with its pixel box in image 1. Never invent objects you cannot see.",
].join("\n");

/** One vision call over the numbered photo. Unlabelled twins stay "unknown"; the pipeline never waits twice. */
export async function labelTwins(deps: LabelDeps, photo: Buffer, twins: Twin[], surfaces: Surface[], cloud: Cloud): Promise<Twin[]> {
  const withBox = twins.filter((t) => t.bbox_px);
  const marked = [...withBox].sort((a, b) => a.distance_m - b.distance_m).slice(0, MAX_MARKS);
  const unmarked = twins.filter((t) => !marked.includes(t));
  const marks: Mark[] = marked.map((t, i) => ({ n: i + 1, bbox_px: t.bbox_px!, state: "neutral" }));
  const annotated = await annotateFrame(photo, marks, ANNOTATED_WIDTH);
  const legend = marked.map((t, i) => `#${i + 1}: ${describeShape(t.shape)}, ${t.distance_m.toFixed(1)} m away`).join("\n");
  const result = LabelResult.parse(await deps.call(deps.cfg, {
    name: "build_labels", model: deps.model, schema: LabelResult, system: system(deps.vocab), timeoutMs: deps.timeoutMs,
    text: `Numbered objects (sizes are rough depth measurements):\n${legend || "(none)"}`,
    images: [{ data: annotated, mime: "image/jpeg" }, { data: photo, mime: "image/jpeg" }],
  }));
  return [...applyLabels(marked, result, deps.vocab, surfaces, cloud, ANNOTATED_WIDTH / cloud.width), ...unmarked];
}

export function applyLabels(marked: Twin[], result: LabelResult, vocab: Vocab, surfaces: Surface[], cloud: Cloud, scale: number): Twin[] {
  const out: Twin[] = [];
  marked.forEach((t, i) => {
    const r = result.objects.find((o) => o.n === i + 1);
    if (!r) { out.push(t); return; }                         // skipped by the model: keep it, unnamed
    if (!r.is_object) return;
    const name = vocab.has(r.name) ? r.name : "other";
    const label = vocab.get(name)?.label ?? (r.other_name?.trim() || "object");
    // The shape type: the vocabulary's when it knows the object, else what the model saw.
    const shape = reshape(t.shape, vocab.get(name)?.shape ?? r.shape);
    const named: Twin = { ...t, shape, yaw_deg: shape.type === "cylinder" ? 0 : t.yaw_deg, name, label, material: r.material, load_bearing: r.load_bearing, cuttable: r.cuttable, confidence: Math.min(1, Math.max(0, r.confidence)) };
    out.push(...split(named, Math.max(1, Math.min(6, r.count))));
  });
  for (const m of result.missed) { const t = placeMissed(m, vocab, surfaces, cloud, scale); if (t) out.push(t); }
  return out;
}

/**
 * A measured shape as the other type, same height. A cylinder is rarely seen whole: its visible half fits a rectangle
 * as wide as the cylinder and about half as deep, so the diameter is the LONGER side.
 */
function reshape(shape: Twin["shape"], type: "box" | "cylinder"): Twin["shape"] {
  if (shape.type === type) return shape;
  if (shape.type === "box") return { type: "cylinder", axis: "y", diameter: Math.max(shape.size[0], shape.size[2]), length: shape.size[1] };
  return { type: "box", size: [shape.diameter, heightOf(shape), shape.diameter] };
}

/** "#4 is two cans": cut the footprint into equal pieces along its long side (local +X after yaw_deg). */
function split(t: Twin, count: number): Twin[] {
  if (count <= 1) return [t];
  const th = (t.yaw_deg * Math.PI) / 180, ax = Math.cos(th), az = -Math.sin(th);
  const len = t.shape.type === "box" ? t.shape.size[0] : t.shape.diameter, piece = len / count;
  return Array.from({ length: count }, (_, k) => {
    const off = (k + 0.5) * piece - len / 2;
    const shape: Twin["shape"] = t.shape.type === "box"
      ? { type: "box", size: [piece, t.shape.size[1], t.shape.size[2]] }
      : { ...t.shape, diameter: Math.min(t.shape.diameter, piece) };
    return { ...t, shape, position: [t.position[0] + ax * off, t.position[1], t.position[2] + az * off], points: Math.round(t.points / count) };
  });
}

/** A missed object (a clear bottle) stands on the surface under the bottom of its box in the photo, at its standard size. */
function placeMissed(m: z.infer<typeof Missed>, vocab: Vocab, surfaces: Surface[], cloud: Cloud, scale: number): Twin | null {
  const item = vocab.get(m.name), std = item ? standardShape(item) : null;
  if (!item || !std) return null;
  const px = (m.x + m.w / 2) / scale, py = (m.y + m.h) / scale;
  const col = Math.min(cloud.cols - 1, Math.max(0, Math.floor((px / cloud.width) * cloud.cols)));
  const row0 = Math.floor((py / cloud.height) * cloud.rows);
  for (let dr = 0; dr <= 3; dr++) {
    const row = Math.min(cloud.rows - 1, Math.max(0, row0 + dr)), i = row * cloud.cols + col;
    const x = cloud.xyz[3 * i]!, y = cloud.xyz[3 * i + 1]!, z = cloud.xyz[3 * i + 2]!;
    if (Number.isNaN(x)) continue;
    const s = surfaces.find((q) => Math.abs(q.y - y) <= 0.03 && x >= q.min[0] - 0.05 && x <= q.max[0] + 0.05 && z >= q.min[1] - 0.05 && z <= q.max[1] + 0.05);
    if (!s) continue;
    const shape: Twin["shape"] = std.type === "cylinder" ? std : { type: "box", size: flatSize(std.size) };
    return {
      twin_id: "o0", name: m.name, label: item.label, shape, position: [x, s.y + heightOf(shape) / 2, z], yaw_deg: 0, sits_on: s.surface_id,
      material: item.material, load_bearing: item.load_bearing, cuttable: item.cuttable, confidence: 0.6, error_m: 0.02, points: 0,
      distance_m: Math.hypot(x - cloud.cam[0], y - cloud.cam[1], z - cloud.cam[2]),
      bbox_px: [m.x / scale, m.y / scale, m.w / scale, m.h / scale], snapped: true, scan_ids: [],
    };
  }
  return null;
}
