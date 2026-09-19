import type { BuildEvent, BuildState, BuildStep, PartStatus, Plan } from "@cutonce/schemas";

type Parts = Record<string, PartStatus>;
type Sequence = Map<string, "hard" | "soft">;

/** Events in the order they apply: by server version, then provisional (version null) in arrival order. */
export function orderEvents(events: readonly BuildEvent[]): BuildEvent[] {
  const versioned = events.filter((e) => e.version !== null).sort((a, b) => a.version! - b.version!);
  return [...versioned, ...events.filter((e) => e.version === null)];
}

const isMilestone = (s: BuildStep) => s.part_ids.length === 0;

/**
 * A step is done when all its parts are built. A milestone (a step with no parts, such as "flip the desk upright")
 * has no event that completes it, so it is never done: once everything before it is built it stays the current step.
 */
export function doneSteps(plan: Plan, parts: Parts): Set<string> {
  const done = new Set<string>();
  for (const s of plan.steps) {
    if (!isMilestone(s) && s.part_ids.every((id) => parts[id]?.state === "built")) done.add(s.step_id);
  }
  return done;
}

/**
 * Replays the event log into the current build state. Build state is never stored; this is the only source of it.
 * `upTo` rewinds history: only events with version ≤ upTo apply (provisional events are then excluded).
 */
export function fold(plan: Plan, assemblyId: string, events: readonly BuildEvent[], upTo?: number | null): BuildState {
  const parts: Parts = {};
  for (const p of plan.parts) parts[p.part_id] = { state: "missing", since_version: 0, last_event_id: null, verified: null };
  const partById = new Map(plan.parts.map((p) => [p.part_id, p]));
  const stepById = new Map(plan.steps.map((s) => [s.step_id, s]));
  const sequence: Sequence = new Map();

  let version = 0;
  let asOf: string | null = null;
  const limit = upTo ?? null;

  for (const e of orderEvents(events)) {
    if (limit !== null && (e.version === null || e.version > limit)) continue;
    version = e.version ?? version + 1;
    asOf = e.timestamp;

    if (!e.part_id) continue;
    const cur = parts[e.part_id];
    if (!cur) continue; // an event for a part this plan revision does not have

    if (e.kind === "verification") {
      if (e.verdict) cur.verified = { verdict: e.verdict, confidence: e.confidence };
      continue;
    }
    if (e.kind !== "part_state" || !e.new_state) continue;
    if (e.new_state === cur.state) continue; // same-state events are no-ops (the API also rejects them with 409)
    // A stale previous_state is still applied: the physical world wins over what a client believed.

    if (e.new_state === "built") {
      const part = partById.get(e.part_id)!;
      const unsupported = part.rests_on.some((id) => parts[id]?.state !== "built");
      if (unsupported) sequence.set(e.part_id, "hard");
      else {
        const done = doneSteps(plan, parts);
        const myIndex = stepById.get(part.step_id)?.index ?? Infinity;
        const skipped = plan.steps.some((s) => s.index < myIndex && s.part_ids.length > 0 && !done.has(s.step_id));
        if (skipped) sequence.set(e.part_id, "soft");
      }
    } else sequence.delete(e.part_id);

    parts[e.part_id] = { state: e.new_state, since_version: version, last_event_id: e.event_id, verified: null };
  }

  return derive(plan, assemblyId, parts, version, asOf, sequence);
}

export function derive(plan: Plan, assemblyId: string, parts: Parts, version: number, asOf: string | null, sequence: Sequence = new Map()): BuildState {
  const done = doneSteps(plan, parts);
  const steps = [...plan.steps].sort((a, b) => a.index - b.index);
  const current = steps.find((s) => !done.has(s.step_id) && s.requires.every((r) => done.has(r))) ?? null;

  const available: string[] = [], blocked: string[] = [];
  const byLayer: Record<string, [number, number]> = {};
  let built = 0;
  for (const p of plan.parts) {
    const state = parts[p.part_id]!.state;
    const layer = (byLayer[p.layer] ??= [0, 0]);
    layer[1] += 1;
    if (state === "built") { built += 1; layer[0] += 1; continue; }
    if (state === "missing") (p.rests_on.every((id) => parts[id]?.state === "built") ? available : blocked).push(p.part_id);
  }
  const total = plan.parts.length;

  return {
    assembly_id: assemblyId, plan_id: plan.plan_id, plan_revision: plan.revision, version, as_of: asOf, parts,
    progress: {
      built, total, pct: total === 0 ? 0 : Math.round((100 * built) / total), by_layer: byLayer,
      minutes_left: steps.filter((s) => !done.has(s.step_id)).reduce((sum, s) => sum + s.est_minutes, 0),
    },
    current_step_id: current?.step_id ?? null, available_part_ids: available, blocked_part_ids: blocked,
    out_of_sequence: [...sequence].map(([part_id, kind]) => ({ part_id, kind })),
  };
}
