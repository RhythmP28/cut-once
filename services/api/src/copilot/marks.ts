import type { VisiblePart } from "@cutonce/schemas";
import type { Mark } from "./annotate.js";

export interface LegendRow { n: number; part_id: string; state: VisiblePart["state"]; in_frame: number; distance_m: number }

/**
 * Numbers the visible parts for Set-of-Mark annotation. Farthest first, so when boxes overlap the
 * nearer part is drawn last and its number stays readable on top. The legend goes into the prompt;
 * the marks go onto the frame; the numbers tie them together.
 */
export function markUp(visible: readonly VisiblePart[]): { marks: Mark[]; legend: LegendRow[] } {
  const ordered = [...visible].sort((a, b) => b.distance_m - a.distance_m);
  const marks: Mark[] = [];
  const legend: LegendRow[] = [];
  ordered.forEach((v, i) => {
    marks.push({ n: i + 1, bbox_px: v.bbox_px, state: v.state });
    legend.push({ n: i + 1, part_id: v.part_id, state: v.state, in_frame: v.in_frame, distance_m: v.distance_m });
  });
  return { marks, legend };
}
