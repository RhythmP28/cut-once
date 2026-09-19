import { z } from "zod";
import type { Twin } from "@cutonce/schemas";
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
