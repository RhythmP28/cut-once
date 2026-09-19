import type { BuildState, Plan } from "@cutonce/schemas";
import { fold } from "./fold.js";
import { plannedEvents } from "./planned.js";

/**
 * How every part looks, decided in one place (blueprint §8). The web preview and the Unity headset both
 * read these values; Unity through data/fixtures/hologram-palette.json, which `pnpm gen:fixtures` writes.
 */
export type BaseVisual = "BUILT_LIVE" | "BUILT_REPLAY" | "CURRENT_STEP" | "MISSING" | "FUTURE" | "WRONG";
export type Modifier = "SELECTED" | "HIGHLIGHTED";
export interface PartVisual { base: BaseVisual; modifiers: Modifier[] }
export interface VisualStyle {
  fill: string; fillAlpha: number; edge: string; edgeAlpha: number; edgeWidthPx: number;
  pulseHz: number; brackets: boolean; grid: boolean;
}

export const HOLOGRAM_PALETTE: {
  bases: Record<BaseVisual, VisualStyle>;
  modifiers: Record<Modifier, Partial<VisualStyle> & { fillAlphaAdd?: number }>;
} = {
  bases: {
    BUILT_LIVE:   { fill: "#3DDC84", fillAlpha: 0,    edge: "#3DDC84", edgeAlpha: 0.6,  edgeWidthPx: 1.5, pulseHz: 0,   brackets: true,  grid: false },
    BUILT_REPLAY: { fill: "#4DA3FF", fillAlpha: 0.55, edge: "#8CC4FF", edgeAlpha: 1,    edgeWidthPx: 1.5, pulseHz: 0,   brackets: false, grid: false },
    CURRENT_STEP: { fill: "#22D3EE", fillAlpha: 0.35, edge: "#67E8F9", edgeAlpha: 1,    edgeWidthPx: 3,   pulseHz: 1.2, brackets: false, grid: true },
    MISSING:      { fill: "#22D3EE", fillAlpha: 0.18, edge: "#22D3EE", edgeAlpha: 0.9,  edgeWidthPx: 1.5, pulseHz: 0,   brackets: false, grid: false },
    FUTURE:       { fill: "#4DA3FF", fillAlpha: 0.05, edge: "#4DA3FF", edgeAlpha: 0.35, edgeWidthPx: 1,   pulseHz: 0,   brackets: false, grid: false },
    WRONG:        { fill: "#FF5252", fillAlpha: 0.3,  edge: "#FF5252", edgeAlpha: 1,    edgeWidthPx: 2.5, pulseHz: 2,   brackets: false, grid: false },
  },
  modifiers: {
    SELECTED:    { edge: "#FFFFFF", edgeAlpha: 1, edgeWidthPx: 2.5 },
    HIGHLIGHTED: { edge: "#FFD84D", edgeAlpha: 1, edgeWidthPx: 3, fillAlphaAdd: 0.15 },
  },
};

export function resolveVisuals(
  plan: Plan, state: BuildState,
  opts: { selected?: string | null; highlighted?: readonly string[]; replay?: boolean } = {},
): Record<string, PartVisual> {
  const current = new Set(plan.steps.find((s) => s.step_id === state.current_step_id)?.part_ids ?? []);
  const available = new Set(state.available_part_ids);
  const lit = new Set(opts.highlighted ?? []);
  const out: Record<string, PartVisual> = {};
  for (const part of plan.parts) {
    const s = state.parts[part.part_id]?.state ?? "missing";
    const base: BaseVisual =
      s === "wrong" ? "WRONG"
      : s === "built" ? (opts.replay ? "BUILT_REPLAY" : "BUILT_LIVE")
      : current.has(part.part_id) ? "CURRENT_STEP"
      : available.has(part.part_id) ? "MISSING"
      : "FUTURE";
    const modifiers: Modifier[] = [];
    if (opts.selected === part.part_id) modifiers.push("SELECTED");
    if (lit.has(part.part_id)) modifiers.push("HIGHLIGHTED");
    out[part.part_id] = { base, modifiers };
  }
  return out;
}

export function styleFor(v: PartVisual): VisualStyle {
  const style: VisualStyle = { ...HOLOGRAM_PALETTE.bases[v.base] };
  if (v.base === "WRONG") return style; // WRONG outranks every modifier (§8)
  for (const m of ["SELECTED", "HIGHLIGHTED"] as const) { // applied in order, so HIGHLIGHTED wins
    if (!v.modifiers.includes(m)) continue;
    const { fillAlphaAdd = 0, ...rest } = HOLOGRAM_PALETTE.modifiers[m];
    Object.assign(style, rest);
    style.fillAlpha = Math.min(1, style.fillAlpha + fillAlphaAdd);
  }
  return style;
}

/** A BuildState with exactly these parts built, in plan order. Used by /preview and the simulations. */
export function stateForBuilt(plan: Plan, built: readonly string[] | "all", assemblyId = "asm_preview"): BuildState {
  const wanted = built === "all" ? null : new Set(built);
  const events = plannedEvents(plan, assemblyId, "2026-01-01T00:00:00.000Z")
    .filter((e) => wanted === null || wanted.has(e.part_id ?? ""))
    .map((e, i) => ({ ...e, version: i + 1 }));
  return fold(plan, assemblyId, events);
}
