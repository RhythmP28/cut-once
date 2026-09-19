import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "@cutonce/project-model";
import { auth, builtEvent, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });
const get = (url: string) => t.app.inject({ method: "GET", url, headers: auth });
const post = (url: string, payload: unknown) => t.app.inject({ method: "POST", url, headers: auth, payload: payload as object });

describe("auth and health", () => {
  it("serves /health without a token", async () => {
    const r = await t.app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, es: "unset", openai: "unset" });
  });
  it("rejects /v1 without a token", async () => {
    const r = await t.app.inject({ method: "GET", url: "/v1/assemblies/current" });
    expect([r.statusCode, r.json().error.code]).toEqual([401, "unauthorized"]);
  });
  it("rejects a wrong token", async () =>
    expect((await t.app.inject({ method: "GET", url: "/v1/assemblies/current", headers: { authorization: "Bearer nope" } })).statusCode).toBe(401));
});

describe("runs, events and state", () => {
  it("boots with a first run from demo_start at 3 of 9", async () => {
    const current = (await get("/v1/assemblies/current")).json();
    expect(current).toMatchObject({ plan_id: "plan_desk_demo", seed: "demo_start" });
    const state = (await get(`/v1/assemblies/${current.assembly_id}/state`)).json();
    expect([state.version, state.progress.built, state.progress.pct, state.current_step_id]).toEqual([3, 3, 33, "step_04"]);
  });

  it("creates a new run from a seed", async () => {
    const r = await post("/v1/assemblies", { seed: "empty" });
    expect(r.statusCode).toBe(201);
    expect((await get(`/v1/assemblies/${r.json().assembly_id}/state`)).json().progress.built).toBe(0);
    expect((await get("/v1/assemblies/current")).json().assembly_id).toBe(r.json().assembly_id);
  });

  it("appends an event, is idempotent on event_id, and rejects a no-op", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    const e = builtEvent(aid, "part_left_rear_leg");
    const first = await post(`/v1/assemblies/${aid}/events`, e);
    expect([first.statusCode, first.json().version, first.json().head]).toEqual([201, 4, 4]);
    const again = await post(`/v1/assemblies/${aid}/events`, e);
    expect([again.statusCode, again.json().version]).toEqual([200, 4]);
    expect(readFileSync(join(t.dataDir, "assemblies", aid, "events.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
    const noop = await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_tabletop"));
    expect([noop.statusCode, noop.json().error.code]).toEqual([409, "no_op"]);
    expect((await get(`/v1/assemblies/${aid}/state`)).json().progress.pct).toBe(44);
  });

  it("records what was true when the client's previous_state is stale", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    const r = await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_left_rear_leg", "wrong", "built"));
    expect(r.json().event).toMatchObject({ previous_state: "missing", note: "stale_previous:wrong" });
  });

  it("rejects unknown parts and malformed events", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    expect((await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_nope"))).json().error.code).toBe("unknown_part");
    expect((await post(`/v1/assemblies/${aid}/events`, { ...builtEvent(aid, "part_cable_tray"), source: "ai" })).statusCode).toBe(422);
    expect((await get("/v1/assemblies/asm_missing/state")).statusCode).toBe(404);
  });

  it("drops unknown keys instead of failing", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    const r = await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_cable_tray", "missing", "built", { gaze_dir: [0, 0, 1] }));
    expect(r.statusCode).toBe(201);
    expect(r.json().event.gaze_dir).toBeUndefined();
  });

  it("serves history: state at a version equals a fold up to it, and events after a version", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_left_rear_leg"));
    const { events } = (await get(`/v1/assemblies/${aid}/events`)).json();
    const plan = (await get("/v1/plans/plan_desk_demo")).json();
    expect((await get(`/v1/assemblies/${aid}/state?version=2`)).json()).toEqual(fold(plan, aid, events, 2));
    expect((await get(`/v1/assemblies/${aid}/events?after=2`)).json().events.map((e: { version: number }) => e.version)).toEqual([3, 4]);
  });

  it("keeps concurrent appends in order with unique versions", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    const parts = ["part_left_rear_leg", "part_right_rear_leg", "part_cable_tray"];
    const results = await Promise.all(parts.map((p) => post(`/v1/assemblies/${aid}/events`, builtEvent(aid, p))));
    expect(results.map((r) => r.json().version).sort()).toEqual([4, 5, 6]);
  });

  it("survives a restart on the same data directory", async () => {
    const aid = (await get("/v1/assemblies/current")).json().assembly_id;
    await post(`/v1/assemblies/${aid}/events`, builtEvent(aid, "part_left_rear_leg"));
    await t.app.close();
    const again = await makeApp({ dataDir: t.dataDir });
    const state = (await again.app.inject({ method: "GET", url: `/v1/assemblies/${aid}/state`, headers: auth })).json();
    expect([state.version, state.progress.built]).toEqual([4, 4]);
    await again.app.close();
  });
});

describe("plans", () => {
  it("refuses to approve a draft with validation errors, and approves a clean one", async () => {
    const plan = (await get("/v1/plans/plan_desk_demo")).json();
    const broken = structuredClone(plan);
    broken.parts.find((p: { part_id: string }) => p.part_id === "part_left_rear_leg").position = [0.07, 0.38, 0.07];
    const draft = await t.app.inject({ method: "PUT", url: "/v1/plans/plan_desk_demo/draft", headers: auth, payload: broken });
    expect(draft.json().validation.some((i: { code: string }) => i.code === "V4")).toBe(true);
    const blocked = await post("/v1/plans/plan_desk_demo/approve", { revision: draft.json().revision, approved_by: "mikey" });
    expect([blocked.statusCode, blocked.json().error.code]).toEqual([409, "validation_errors"]);

    const clean = await t.app.inject({ method: "PUT", url: "/v1/plans/plan_desk_demo/draft", headers: auth, payload: plan });
    const ok = await post("/v1/plans/plan_desk_demo/approve", { revision: clean.json().revision, approved_by: "mikey" });
    expect([ok.statusCode, ok.json().status, ok.json().provenance.approved_by]).toEqual([200, "approved", "mikey"]);
    expect((await get("/v1/plans/plan_desk_demo")).json().revision).toBe(clean.json().revision);
  });
});

describe("director", () => {
  it("starts a new run and forces a state", async () => {
    const run = await post("/v1/director/command", { type: "new_run", seed: "demo_start" });
    expect(run.json().assembly.seed).toBe("demo_start");
    const forced = await post("/v1/director/command", { type: "force_state", part_id: "part_left_rear_leg", new_state: "built" });
    expect(forced.json().version).toBe(4);
    const { events } = (await get(`/v1/assemblies/${run.json().assembly.assembly_id}/events?after=3`)).json();
    expect(events[0]).toMatchObject({ source: "system", actor: "director" });
  });
  it("rejects an unknown command and reports the missing cache hook", async () => {
    expect((await post("/v1/director/command", { type: "dance" })).statusCode).toBe(400);
    expect((await post("/v1/director/command", { type: "promote_cache", turn_id: "turn_x1", scripted_query_id: "q1" })).statusCode).toBe(501);
  });
});

describe("ids from URLs never reach the file system unchecked", () => {
  it("rejects path traversal in every id", async () => {
    for (const url of ["/v1/plans/..%2F..%2Fsecrets", "/v1/assemblies/..%2F..%2Fx/state", "/v1/jobs/..%2Fx", "/v1/documents/..%2Fx/pages/1.png", "/v1/analytics/..%2Fx"]) {
      expect((await get(url)).statusCode, url).toBe(404);
    }
    expect((await post("/v1/assemblies", { seed: "../../x" })).statusCode).toBe(404);
  });
});
