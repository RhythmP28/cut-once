import type { PlanDiff } from "@cutonce/project-model";

/** One simulation run. Written to sim-out/current/meta.json. */
export interface RunMeta { sha: string; dirty: boolean; created_at: string; ci: boolean }

/** The pretend headset's walk through the golden path (services/api/src/sim/scenario.ts writes the same shape). */
export interface ScenarioStep { name: string; ok: boolean; ms: number; detail?: string }
export interface ScenarioResult { ok: boolean; steps: ScenarioStep[] }

export type ScreenStatus = "same" | "changed" | "new" | "removed" | "size_changed";
export interface ScreenResult { scene: string; note: string; status: ScreenStatus; diffPct: number | null }

export interface PlanReport { file: string; diff: PlanDiff | null; note?: string }

export interface ReportInput {
  current: RunMeta;
  baseline: RunMeta | null;
  screens: ScreenResult[];
  plans: PlanReport[];
  scenario: { current: ScenarioResult | null; baseline: ScenarioResult | null };
  extraction: { diff: PlanDiff | null; skipped: string | null };
}
