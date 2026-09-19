import type { Assembly, BuildEvent, BuildState, BuildStep, CopilotContext, Material, Part, Plan, VisiblePart } from "@cutonce/schemas";
import type { Store } from "../store/store.js";

export interface VisibleRow { visible: VisiblePart; part: Part | null }

/** Everything the answer needs that we already hold. No model, no search, no network: microseconds. */
export interface Gathered {
  assembly: Assembly; plan: Plan; state: BuildState;
  selected: Part | null; material: Material | null; step: BuildStep | null; nextStep: BuildStep | null;
  visible: VisibleRow[]; recentEvents: BuildEvent[]; staleBy: number;
}

export function gather(store: Store, assemblyId: string, context: CopilotContext): Gathered {
  const assembly = store.getAssembly(assemblyId);
  const plan = store.getPlan(assembly.plan_id, assembly.plan_revision);
  const state = store.getState(assemblyId);
  const byId = new Map(plan.parts.map((p) => [p.part_id, p]));

  const selected = context.selected_part_id ? byId.get(context.selected_part_id) ?? null : null;
  const material = selected ? plan.materials.find((m) => m.material_id === selected.material_id) ?? null : null;
  // The step the user is on comes from the headset; if it did not send one, fall back to the state's.
  const stepId = context.current_step_id ?? state.current_step_id;
  const step = stepId ? plan.steps.find((s) => s.step_id === stepId) ?? null : null;
  const nextStep = step ? plan.steps.find((s) => s.index === step.index + 1) ?? null : null;

  const { events } = store.getEvents(assemblyId);
  return {
    assembly, plan, state, selected, material, step, nextStep,
    visible: context.visible_parts.map((visible) => ({ visible, part: byId.get(visible.part_id) ?? null })),
    recentEvents: events.slice(-5),
    // How far behind the headset's picture is. Section 10: the server warns, it does not refuse.
    staleBy: state.version - context.state_version,
  };
}

/** The search query: what they said, plus the selected part's name and aliases so the index can find it. */
export function searchQuery(transcript: string, selected: Part | null): string {
  if (!selected) return transcript;
  return [transcript, selected.name, ...selected.aliases].join(" ").trim();
}

export const stepSummary = (step: BuildStep | null) => (step ? `${step.title} — ${step.instruction}` : "no step in progress");
