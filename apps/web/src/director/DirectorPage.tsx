import { useCallback, useEffect, useRef, useState } from "react";
import type { Assembly, BuildEvent, BuildState, Plan, Presence as PresenceClient } from "@cutonce/schemas";
import { ApiError, describeError, getCurrentAssembly, getEvents, getPlan, getState } from "../api";
import { useStream, useStreamStatus } from "../ws";
import { Commands } from "./Commands";
import { CopilotPanel } from "./CopilotPanel";
import { ElasticTab } from "./ElasticTab";
import { EventList } from "./EventList";
import { ForceState } from "./ForceState";
import { Presence } from "./Presence";
import { RunPanel } from "./RunPanel";

const TOAST_MS = 6000;
const POLL_WHILE_OFFLINE_MS = 3000;

interface Toast { key: number; title: string; note: string }

function mergeEvents(prev: BuildEvent[], incoming: BuildEvent[]): BuildEvent[] {
  const byId = new Map(prev.map((e) => [e.event_id, e]));
  for (const e of incoming) byId.set(e.event_id, e);
  return [...byId.values()].sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
}

export function DirectorPage() {
  const [tab, setTab] = useState<"demo" | "elastic">("demo");
  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<BuildState | null>(null);
  const [events, setEvents] = useState<BuildEvent[]>([]);
  const [clients, setClients] = useState<PresenceClient[]>([]);
  const [noRun, setNoRun] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const status = useStreamStatus();

  const assemblyRef = useRef<Assembly | null>(null);
  const planRef = useRef<Plan | null>(null);
  const eventsRef = useRef<BuildEvent[]>([]);
  const loadSeq = useRef(0);
  const toastSeq = useRef(0);
  const toastTimers = useRef<number[]>([]);
  planRef.current = plan;
  eventsRef.current = events;

  /** Load the run (the given one, or whatever the server calls current), then its plan, events and state. */
  const loadRun = useCallback(async (given?: Assembly) => {
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    try {
      const asm = given ?? (await getCurrentAssembly());
      if (stale()) return;
      const switched = assemblyRef.current?.assembly_id !== asm.assembly_id;
      assemblyRef.current = asm;
      setAssembly(asm);
      setNoRun(false);
      if (switched) {
        setEvents([]);
        setState(null);
      }
      const samePlan = planRef.current?.plan_id === asm.plan_id && planRef.current.revision === asm.plan_revision;
      const [p, ev, st] = await Promise.allSettled([
        samePlan && planRef.current ? Promise.resolve(planRef.current) : getPlan(asm.plan_id, asm.plan_revision),
        getEvents(asm.assembly_id),
        getState(asm.assembly_id),
      ]);
      if (stale()) return;
      const failures: string[] = [];
      if (p.status === "fulfilled") setPlan(p.value); else failures.push(`plan: ${describeError(p.reason)}`);
      if (ev.status === "fulfilled") {
        // A full fetch is authoritative up to its head; keep only newer events that arrived on the stream meanwhile.
        const page = ev.value;
        setEvents((prev) => (switched ? page.events : mergeEvents(prev.filter((e) => (e.version ?? 0) > page.head), page.events)));
      } else failures.push(`events: ${describeError(ev.reason)}`);
      if (st.status === "fulfilled") setState(st.value); else failures.push(`state: ${describeError(st.reason)}`);
      setProblem(failures.length ? `Could not load ${failures.join("; ")}` : null);
    } catch (e) {
      if (stale()) return;
      if (e instanceof ApiError && e.status === 404) {
        assemblyRef.current = null;
        setAssembly(null);
        setState(null);
        setEvents([]);
        setNoRun(true);
        setProblem(null);
      } else {
        setProblem(describeError(e));
      }
    }
  }, []);

  const refreshState = useCallback(async (assemblyId: string) => {
    try {
      const s = await getState(assemblyId);
      if (assemblyRef.current?.assembly_id !== assemblyId) return;
      setState((cur) => (cur && cur.assembly_id === assemblyId && cur.version > s.version ? cur : s));
    } catch (e) {
      setProblem(`Could not refresh the state: ${describeError(e)}`);
    }
  }, []);

  useEffect(() => { void loadRun(); }, [loadRun]);

  // The stream is the normal path. While it is down, poll so the page never silently goes stale.
  useEffect(() => {
    if (status === "open") return;
    const t = window.setInterval(() => void loadRun(), POLL_WHILE_OFFLINE_MS);
    return () => window.clearInterval(t);
  }, [status, loadRun]);

  useEffect(() => () => { for (const t of toastTimers.current) window.clearTimeout(t); }, []);

  useStream((msg) => {
    switch (msg.type) {
      case "presence":
        setClients(msg.clients);
        break;
      case "assembly_changed":
        // Also sent right after every (re)connect, which resyncs the page.
        void loadRun(msg.assembly);
        break;
      case "event_appended": {
        const current = assemblyRef.current;
        if (!current || current.assembly_id !== msg.assembly_id) {
          void loadRun();
          break;
        }
        const known = eventsRef.current;
        const lastVersion = known.reduce((m, e) => Math.max(m, e.version ?? 0), 0);
        setEvents((prev) => mergeEvents(prev, [msg.event]));
        if (msg.event.version !== null && msg.event.version > lastVersion + 1) {
          // Missed something (a dropped connection): fetch the gap.
          getEvents(msg.assembly_id, lastVersion).then(
            (page) => { if (assemblyRef.current?.assembly_id === msg.assembly_id) setEvents((prev) => mergeEvents(prev, page.events)); },
            () => { /* the next reload fills it in */ },
          );
        }
        void refreshState(msg.assembly_id);
        break;
      }
      case "issue_logged": {
        const partName = msg.part_id ? planRef.current?.parts.find((p) => p.part_id === msg.part_id)?.name ?? msg.part_id : null;
        const key = ++toastSeq.current;
        setToasts((t) => [...t, { key, title: partName ? `Issue logged on ${partName}` : "Issue logged", note: msg.note }]);
        toastTimers.current.push(window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), TOAST_MS));
        break;
      }
      default:
        break; // plan_ready, director_command, copilot_turn: handled by the components that care.
    }
  });

  const reload = useCallback(() => { void loadRun(); }, [loadRun]);

  return (
    <main className="page director">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "demo"} className={tab === "demo" ? "active" : ""} onClick={() => setTab("demo")}>Demo</button>
        <button type="button" role="tab" aria-selected={tab === "elastic"} className={tab === "elastic" ? "active" : ""} onClick={() => setTab("elastic")}>Elastic</button>
      </div>

      {problem && <p className="banner error-text">{problem}</p>}

      {/* The Demo tab stays mounted while hidden so the copilot panel and flags keep what they have seen. */}
      <div className="director-grid" hidden={tab !== "demo"}>
        <div className="col">
          <Presence clients={clients} status={status} />
          <RunPanel assembly={assembly} plan={plan} state={state} noRun={noRun} onChanged={reload} />
          <ForceState plan={plan} state={state} onChanged={reload} />
          <Commands />
        </div>
        <div className="col">
          <CopilotPanel />
          <EventList events={events} plan={plan} />
        </div>
      </div>

      {tab === "elastic" && <ElasticTab assemblyId={assembly?.assembly_id ?? null} firstPartId={plan?.parts[0]?.part_id ?? null} />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.key}>
            <strong>{t.title}</strong>
            <span>{t.note}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
