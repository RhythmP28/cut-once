import { z } from "zod";
import type { Twin } from "@cutonce/schemas";
import { reshape } from "./label.js";
import { dimsCm } from "./shape.js";

/** A recording's truth.json: every vocabulary object in view, tape-measured, sizes in cm in any order. Corrected by hand, so it is checked. */
export const Truth = z.object({ objects: z.array(z.object({ name: z.string().min(1), size_cm: z.array(z.number().positive()).length(3) })) });
export type Truth = z.infer<typeof Truth>;

export interface Score { found: number; truth: number; labelsRight: number; labelled: number; sizeErrCm: number[] }

/**
 * found: truth objects matched by a twin of the same name, closest size first; sizeErrCm: each match's worst side.
 * labelsRight: named twins whose name is in the truth (each truth object counts once). "unknown" and "other" are not
 * names, so they are neither right nor wrong.
 */
export function scoreRecording(twins: Twin[], truth: Truth): Score {
  const named = twins.filter((t) => t.name !== "unknown" && t.name !== "other");
  const pool = [...named], sizeErrCm: number[] = [];
  let found = 0;
  for (const o of truth.objects) {
    const want = [...o.size_cm].sort((a, b) => b - a);
    const err = (t: Twin) => Math.max(...dimsCm(t.shape).map((v, k) => Math.abs(v - want[k]!)));
    const best = pool.filter((t) => t.name === o.name).sort((a, b) => err(a) - err(b))[0];
    if (!best) continue;
    found++; sizeErrCm.push(Math.round(err(best) * 10) / 10); pool.splice(pool.indexOf(best), 1);
  }
  const names = truth.objects.map((o) => o.name);
  const labelsRight = named.filter((t) => { const i = names.indexOf(t.name); if (i < 0) return false; names.splice(i, 1); return true; }).length;
  return { found, truth: truth.objects.length, labelsRight, labelled: named.length, sizeErrCm };
}

/**
 * A recording's saved names on THIS build's measurements. The saved twins were measured the day the scan was recorded,
 * so scoring them would never notice the twin builder getting worse. Each saved twin hands its name (and the shape type
 * the labeller gave it) to the fresh twin standing within 10 cm of it, nearest first. A saved twin with no fresh one
 * near it is kept as saved (a clear bottle the labeller added; the second can of a split lump), and a fresh twin nobody
 * claims stays unnamed (the labeller dropped it as not an object).
 */
export function carryNames(fresh: Twin[], saved: Twin[]): Twin[] {
  const free = new Set(fresh), out: Twin[] = [];
  for (const s of saved) {
    const near = [...free].map((f) => ({ f, d: Math.hypot(f.position[0] - s.position[0], f.position[2] - s.position[2]) })).filter((c) => c.d <= 0.1).sort((a, b) => a.d - b.d)[0];
    if (!near) { out.push(s); continue; }
    free.delete(near.f);
    out.push({
      ...near.f, shape: reshape(near.f.shape, s.shape.type), yaw_deg: s.shape.type === "cylinder" ? 0 : near.f.yaw_deg,
      name: s.name, label: s.label, material: s.material, load_bearing: s.load_bearing, cuttable: s.cuttable, confidence: s.confidence,
    });
  }
  return [...out, ...free];
}
