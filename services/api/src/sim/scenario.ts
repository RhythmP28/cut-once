import { ulid } from "ulid";
import type { Assembly, BuildState, CopilotResponse, Plan } from "@cutonce/schemas";
import { pcmToWav, tone } from "../turns/wav.js";

/**
 * A pretend headset walking the golden path over real HTTP and the real stream, exactly as the Quest will.
 * Runs against any server: the in-process one in CI, or your laptop's with --base. Step names are the
 * report's comparison keys: add steps at the end, never rename one.
 */
export interface ScenarioStep { name: string; ok: boolean; ms: number; detail?: string }
export interface ScenarioResult { ok: boolean; steps: ScenarioStep[] }

interface Msg { type: string; [k: string]: unknown }

export async function runScenario(base: string, token: string): Promise<ScenarioResult> {
  const steps: ScenarioStep[] = [];
  const auth = { Authorization: `Bearer ${token}` };
  const failed = new Set<string>();

  async function step(name: string, needs: string[], body: () => Promise<{ detail?: string; ms?: number } | void>): Promise<boolean> {
    const missing = needs.find((n) => failed.has(n) || !steps.some((s) => s.name === n));
    if (missing) { steps.push({ name, ok: false, ms: 0, detail: `skipped: ${missing} failed` }); failed.add(name); return false; }
    const started = performance.now();
    try {
      const r = (await body()) ?? {};
      steps.push({ name, ok: true, ms: Math.round(r.ms ?? performance.now() - started), ...(r.detail ? { detail: r.detail } : {}) });
      return true;
    } catch (e) {
      steps.push({ name, ok: false, ms: Math.round(performance.now() - started), detail: e instanceof Error ? e.message : String(e) });
      failed.add(name);
      return false;
    }
  }

  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> => {
    const res = await fetch(base + path, {
      method, headers: { ...auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  const expectStatus = (r: { status: number; json: any }, want: number, what: string) => {
    if (r.status !== want) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 200)}`);
  };

  let aid = "";
  let plan: Plan | null = null;
  let partId = "";
  let version = 0;
  let event: Record<string, unknown> = {};
  let socket: WebSocket | null = null;
  const messages: Msg[] = [];
  const waitFor = (test: (m: Msg) => boolean, ms: number, what: string) => new Promise<number>((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (messages.some(test)) return resolve(performance.now() - started);
      if (performance.now() - started > ms) return reject(new Error(`no ${what} on the stream within ${ms} ms`));
      setTimeout(tick, 5);
    };
    tick();
  });
  const ask = async (over: Record<string, unknown>): Promise<CopilotResponse> => {
    const context = {
      context_id: `ctx_sim_${Date.now()}`, assembly_id: aid, plan_revision: plan!.revision, state_version: version, mode: "overlay",
      selected_part_id: "part_power_cable", selection_source: "controller_ray", current_step_id: null,
      visible_parts: [], camera: null, scripted_query_id: null, client_sent_at: new Date().toISOString(), ...over,
    };
    const form = new FormData();
    form.append("context", JSON.stringify(context));
    form.append("audio", new Blob([new Uint8Array(pcmToWav(tone(0.5, 16000), 16000))], { type: "audio/wav" }), "question.wav");
    form.append("frame", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "frame.jpg");
    const res = await fetch(`${base}/v1/assemblies/${aid}/copilot/query`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(15_000) });
    const json = await res.json();
    if (res.status !== 200) throw new Error(`copilot: HTTP ${res.status} ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
    return json as CopilotResponse;
  };

  try {
    await step("health", [], async () => {
      const r = await call("GET", "/health");
      expectStatus(r, 200, "health");
      return { detail: `copilot ${r.json.copilot ?? "unknown"}` };
    });

    await step("new run", ["health"], async () => {
      const r = await call("POST", "/v1/director/command", { type: "new_run", seed: "demo_start" });
      expectStatus(r, 200, "new run");
      const assembly = r.json.assembly as Assembly;
      aid = assembly.assembly_id;
      const p = await call("GET", `/v1/plans/${assembly.plan_id}?revision=${assembly.plan_revision}`);
      expectStatus(p, 200, "plan");
      plan = p.json as Plan;
      return { detail: aid };
    });

    await step("stream connect", ["new run"], async () => {
      socket = new WebSocket(`${base.replace(/^http/, "ws")}/v1/stream?token=${encodeURIComponent(token)}&client=quest&id=sim`);
      socket.addEventListener("message", (ev) => { try { messages.push(JSON.parse(String(ev.data))); } catch { /* not JSON */ } });
      const ms = await waitFor((m) => m.type === "assembly_changed" && (m.assembly as Assembly).assembly_id === aid, 2000, "assembly_changed for the new run");
      return { ms };
    });

    await step("mark built", ["stream connect"], async () => {
      const s = await call("GET", `/v1/assemblies/${aid}/state`);
      expectStatus(s, 200, "state");
      partId = (s.json as BuildState).available_part_ids[0] ?? "";
      if (!partId) throw new Error("no part is available to build");
      const now = new Date().toISOString();
      event = { event_id: `evt_${ulid()}`, assembly_id: aid, version: null, timestamp: now, client_timestamp: now, kind: "part_state",
        part_id: partId, previous_state: "missing", new_state: "built", source: "manual", confidence: 1, actor: "sim" };
      const started = performance.now();
      const r = await call("POST", `/v1/assemblies/${aid}/events`, event);
      expectStatus(r, 201, "append");
      version = r.json.version;
      await waitFor((m) => m.type === "event_appended" && (m.event as { event_id: string }).event_id === event.event_id, 2000, "event_appended");
      return { ms: performance.now() - started, detail: `${partId} at v${version}` };
    });

    await step("idempotent retry", ["mark built"], async () => {
      const r = await call("POST", `/v1/assemblies/${aid}/events`, event);
      expectStatus(r, 200, "retry");
      if (r.json.version !== version) throw new Error(`retry got v${r.json.version}, expected v${version}`);
    });

    await step("no-op rejected", ["mark built"], async () => {
      const r = await call("POST", `/v1/assemblies/${aid}/events`, { ...event, event_id: `evt_${ulid()}` });
      expectStatus(r, 409, "same-state event");
      if (r.json?.error?.code !== "no_op") throw new Error(`expected no_op, got ${r.json?.error?.code}`);
    });

    await step("history", ["mark built"], async () => {
      const before = await call("GET", `/v1/assemblies/${aid}/state?version=${version - 1}`);
      const now = await call("GET", `/v1/assemblies/${aid}/state`);
      const was = (before.json as BuildState).parts[partId]?.state ?? "missing";
      const is = (now.json as BuildState).parts[partId]?.state;
      if (was !== "missing" || is !== "built") throw new Error(`${partId} was ${was} at v${version - 1} and is ${is} now`);
    });

    await step("copilot answer", ["new run"], async () => {
      const r = await ask({});
      const ids = new Set(plan!.parts.map((p) => p.part_id));
      const unknown = r.highlight_parts.filter((id) => !ids.has(id));
      if (unknown.length) throw new Error(`highlights parts not in the plan: ${unknown.join(", ")}`);
      if (!r.audio_url) throw new Error("no audio_url");
      const audio = await fetch(base + r.audio_url, { headers: auth, signal: AbortSignal.timeout(10_000) });
      const bytes = (await audio.arrayBuffer()).byteLength;
      if (audio.status !== 200 || bytes < 22050 * 2) throw new Error(`audio: HTTP ${audio.status}, ${bytes} bytes`);
      return { detail: r.answer_text };
    });

    await step("copilot clarifies", ["new run"], async () => {
      const r = await ask({ selected_part_id: null, selection_source: "none" });
      if (!r.needs_clarification) throw new Error("expected needs_clarification with nothing selected");
    });

    await step("voice command", ["new run"], async () => {
      const r = await ask({ scripted_query_id: "fake_done", selected_part_id: "part_cable_tray" });
      if (r.action?.type !== "mark_state" || r.action.part_ids[0] !== "part_cable_tray") throw new Error(`unexpected action ${JSON.stringify(r.action)}`);
    });

    await step("director force", ["stream connect"], async () => {
      const started = performance.now();
      const r = await call("POST", "/v1/director/command", { type: "force_state", part_id: "part_rear_crossbar", new_state: "wrong" });
      expectStatus(r, 200, "force_state");
      await waitFor((m) => m.type === "event_appended" && (m.event as { part_id?: string; new_state?: string }).part_id === "part_rear_crossbar"
        && (m.event as { new_state?: string }).new_state === "wrong", 2000, "the forced event");
      return { ms: performance.now() - started };
    });
  } finally {
    (socket as WebSocket | null)?.close();
  }
  return { ok: steps.every((s) => s.ok), steps };
}
