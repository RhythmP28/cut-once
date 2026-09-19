import { useEffect, useState } from "react";
import type { BuildState, PartState, Plan } from "@cutonce/schemas";
import { useCommand } from "./useCommand";

const STATES: PartState[] = ["missing", "built", "wrong"];

export function ForceState({ plan, state, onChanged }: { plan: Plan | null; state: BuildState | null; onChanged: () => void }) {
  const [partId, setPartId] = useState("");
  const [newState, setNewState] = useState<PartState>("built");
  const { send, busy, error, sent } = useCommand(onChanged);

  // Keep the selection valid when a different plan loads.
  useEffect(() => {
    if (!plan) return;
    if (!plan.parts.some((p) => p.part_id === partId)) setPartId(plan.parts[0]?.part_id ?? "");
  }, [plan, partId]);

  const current = partId ? state?.parts[partId]?.state : undefined;

  return (
    <section className="card">
      <h2>Force a part's state</h2>
      <div className="row wrap">
        <select value={partId} onChange={(e) => setPartId(e.target.value)} disabled={!plan} aria-label="Part">
          {!plan && <option value="">no plan loaded</option>}
          {plan?.parts.map((p) => (
            <option key={p.part_id} value={p.part_id}>
              {p.name}{state?.parts[p.part_id] ? ` (${state.parts[p.part_id]!.state})` : ""}
            </option>
          ))}
        </select>
        <select value={newState} onChange={(e) => setNewState(e.target.value as PartState)} aria-label="New state">
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          type="button" disabled={!partId || busy}
          onClick={() => void send({ type: "force_state", part_id: partId, new_state: newState }, `${partId} → ${newState}`)}
        >
          {busy ? "Sending…" : "Force"}
        </button>
      </div>
      {current === newState && !error && !sent && <p className="muted small">This part is already {newState}; the server will answer "no change".</p>}
      {error && <p className="error-text">{error}</p>}
      {sent && !error && <p className="ok-text small">Sent: {sent}</p>}
    </section>
  );
}
