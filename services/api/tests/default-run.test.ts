import { expect, it } from "vitest";
import { auth, makeApp } from "./helpers.js";

it("a fresh server starts on E7 unless told otherwise", async () => {
  const t = await makeApp({ defaultSeed: "e7_start" });
  try {
    const r = await t.app.inject({ method: "GET", url: "/v1/assemblies/current", headers: auth });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ plan_id: "plan_e7_massing", seed: "e7_start" });
    const state = (await t.app.inject({ method: "GET", url: `/v1/assemblies/${r.json().assembly_id}/state`, headers: auth })).json();
    expect(state.progress.built).toBe(0);
    expect(state.current_step_id).toBe("step_01");
  } finally { await t.cleanup(); }
});

it("an unknown default seed falls back to the desk instead of starting with no run", async () => {
  const t = await makeApp({ defaultSeed: "no_such_seed" });
  try {
    const r = await t.app.inject({ method: "GET", url: "/v1/assemblies/current", headers: auth });
    expect(r.json()).toMatchObject({ seed: "demo_start" });
  } finally { await t.cleanup(); }
});
