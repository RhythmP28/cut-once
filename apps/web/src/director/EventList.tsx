import { useMemo } from "react";
import type { BuildEvent, Plan } from "@cutonce/schemas";
import { clock } from "../format";

const MAX_ROWS = 200;

function change(e: BuildEvent): string {
  if (e.kind === "part_state") return `${e.previous_state ?? "?"} → ${e.new_state ?? "?"}`;
  if (e.kind === "verification") return `verification: ${e.verdict ?? "?"}`;
  if (e.kind === "annotation") return e.note ? `note: ${e.note}` : "note";
  return e.kind;
}

export function EventList({ events, plan }: { events: BuildEvent[]; plan: Plan | null }) {
  const names = useMemo(() => new Map((plan?.parts ?? []).map((p) => [p.part_id, p.name])), [plan]);
  const rows = useMemo(
    // Events always carry a version once stored; an unversioned one (should not happen) sorts first.
    () => [...events].sort((a, b) => (b.version ?? Number.MAX_SAFE_INTEGER) - (a.version ?? Number.MAX_SAFE_INTEGER)).slice(0, MAX_ROWS),
    [events],
  );

  return (
    <section className="card event-list">
      <h2>Events <span className="muted small">{events.length} total, newest first</span></h2>
      {rows.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th className="num">v</th><th>Part</th><th>Change</th><th>Source</th><th>Time</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.event_id} className={e.new_state === "wrong" ? "row-wrong" : undefined}>
                  <td className="num mono">{e.version ?? "–"}</td>
                  <td>{e.part_id ? names.get(e.part_id) ?? e.part_id : "–"}</td>
                  <td className={e.kind === "part_state" ? `state-${e.new_state}` : undefined}>{change(e)}</td>
                  <td>{e.source}</td>
                  <td className="mono">{clock(e.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
