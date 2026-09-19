import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Assembly, BuildEvent, BuildState, PartState, Plan } from "@cutonce/schemas";
import { ApiError, describeError, getCurrentAssembly, getEvents, getPlan, getState } from "../api";
import { clock } from "../format";
import { PlanViewer } from "../three/PlanViewer";
import { useStream } from "../ws";

export function HistoryPage() {
  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [events, setEvents] = useState<BuildEvent[]>([]);
  const [head, setHead] = useState(0);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<BuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noRun, setNoRun] = useState(false);
  const followHead = useRef(true);
  const loadSeq = useRef(0);

  const load = useCallback(async (given?: Assembly) => {
    const seq = ++loadSeq.current;
    try {
      const asm = given ?? (await getCurrentAssembly());
      const [p, ev] = await Promise.all([getPlan(asm.plan_id, asm.plan_revision), getEvents(asm.assembly_id)]);
      if (seq !== loadSeq.current) return;
      setAssembly(asm);
      setPlan(p);
      setEvents(ev.events);
      setHead(ev.head);
      setVersion(ev.head);
      followHead.current = true;
      setNoRun(false);
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (e instanceof ApiError && e.status === 404) setNoRun(true);
      else setError(describeError(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useStream((msg) => {
    if (msg.type === "assembly_changed") {
      if (msg.assembly.assembly_id !== assembly?.assembly_id) void load(msg.assembly);
    } else if (msg.type === "event_appended" && msg.assembly_id === assembly?.assembly_id) {
      setEvents((prev) => (prev.some((e) => e.event_id === msg.event.event_id) ? prev : [...prev, msg.event]));
      setHead((h) => Math.max(h, msg.head));
      if (followHead.current) setVersion((v) => Math.max(v, msg.head));
    }
  });

  // State at the chosen version, fetched shortly after the slider stops moving.
  const assemblyId = assembly?.assembly_id;
  useEffect(() => {
    if (!assemblyId) return;
    let alive = true;
    const t = window.setTimeout(() => {
      getState(assemblyId, version).then(
        (s) => { if (alive) { setState(s); setError(null); } },
        (e) => { if (alive) setError(describeError(e)); },
      );
    }, 120);
    return () => { alive = false; window.clearTimeout(t); };
  }, [assemblyId, version]);

  const states = useMemo(() => {
    const out: Record<string, PartState> = {};
    if (state) for (const [id, s] of Object.entries(state.parts)) out[id] = s.state;
    return out;
  }, [state]);

  const event = events.find((e) => e.version === version);
  const partName = (id?: string) => (id ? plan?.parts.find((p) => p.part_id === id)?.name ?? id : "–");
  const stale = state !== null && state.version !== version;

  if (noRun) return <main className="page"><h1>History</h1><p className="muted">There is no run yet. Start one from the Director page.</p></main>;

  return (
    <main className="page history">
      <h1>History</h1>
      {error && <p className="banner error-text">{error}</p>}

      <section className="card">
        <div className="row">
          <button type="button" disabled={version <= 0} onClick={() => { followHead.current = false; setVersion((v) => Math.max(0, v - 1)); }}>Back</button>
          <input
            type="range" min={0} max={Math.max(head, 0)} step={1} value={version} aria-label="Version"
            onChange={(e) => { const v = Number(e.target.value); followHead.current = v >= head; setVersion(v); }}
          />
          <button type="button" disabled={version >= head} onClick={() => { const v = Math.min(head, version + 1); followHead.current = v >= head; setVersion(v); }}>Forward</button>
          <span className="history-version">v{version} <span className="muted">/ {head}</span></span>
        </div>
        <div className="history-event">
          {version === 0 && <span className="muted">Version 0: before any event.</span>}
          {version > 0 && !event && <span className="muted">No event loaded for this version.</span>}
          {event && (
            <>
              <strong>{partName(event.part_id)}</strong>{" "}
              {event.kind === "part_state" ? <span>{event.previous_state} → <span className={`state-${event.new_state}`}>{event.new_state}</span></span> : <span>{event.kind}{event.verdict ? `: ${event.verdict}` : ""}{event.note ? `: ${event.note}` : ""}</span>}
              <span className="muted"> · {clock(event.timestamp)}</span>
            </>
          )}
        </div>
        <div className="muted small">
          {state ? `${state.progress.built} / ${state.progress.total} built · ${state.progress.pct}%${stale ? " (loading this version…)" : ""}` : "Loading state…"}
        </div>
      </section>

      <section className="history-viewer">
        {plan ? <PlanViewer plan={plan} states={states} /> : <p className="muted">Loading the plan…</p>}
      </section>
    </main>
  );
}
