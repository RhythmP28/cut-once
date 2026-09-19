/**
 * The /preview URL contract. The simulation scenes (tools/sim/scenes.ts) build URLs against it, so
 * a parameter may be added but never renamed.
 */
export type View = "operator" | "top" | "orbit";
export interface PreviewParams {
  planId: string; revision: number | null; built: string[] | "all" | null; replay: number | "play" | null;
  highlight: string[]; selected: string | null; compare: string | null; view: View; fov: number;
  bg: "none" | "webcam" | "image"; bgSrc: string | null; still: boolean; hud: boolean;
}

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function parsePreviewParams(search: string): PreviewParams {
  const q = new URLSearchParams(search);
  const builtRaw = q.get("built");
  const replayRaw = q.get("replay");
  const view = q.get("view");
  const bg = q.get("bg");
  const rev = Number(q.get("rev"));
  const fov = Number(q.get("fov") ?? 90);
  return {
    planId: q.get("plan") || "plan_desk_demo",
    revision: Number.isInteger(rev) && rev > 0 ? rev : null,
    built: builtRaw === null ? null : builtRaw === "all" ? "all" : list(builtRaw),
    replay: replayRaw === null ? null : replayRaw === "play" ? "play" : clamp(Number(replayRaw) || 0, 0, 1),
    highlight: list(q.get("highlight")),
    selected: q.get("selected") || null,
    compare: q.get("compare") || null,
    view: view === "top" || view === "orbit" ? view : "operator",
    fov: Number.isFinite(fov) ? clamp(fov, 30, 120) : 90,
    bg: bg === "webcam" || bg === "image" ? bg : "none",
    bgSrc: q.get("src") || null,
    still: q.get("still") === "1",
    hud: q.get("hud") !== "0",
  };
}
