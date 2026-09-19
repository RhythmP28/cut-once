import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { runScenario } from "../src/sim/scenario.js";
import { TOKEN, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => { await t?.cleanup(); t = undefined; });

it("walks the whole golden path against a real server", async () => {
  t = await makeApp({ copilotMode: "fake", fakeCopilotDelayMs: 0 });
  await t.app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  const result = await runScenario(base, TOKEN);
  const failed = result.steps.filter((s) => !s.ok);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(result.steps.map((s) => s.name)).toEqual([
    "health", "new run", "stream connect", "mark built", "idempotent retry", "no-op rejected",
    "history", "copilot answer", "copilot clarifies", "voice command", "director force",
    "build scan", "build start", "build step",
  ]);
  // Build mode over real HTTP and the real stream: the kit is named, the riser offered, started and walked.
  expect(result.steps.find((s) => s.name === "build scan")!.detail).toBe("4 objects → Laptop riser");
  expect(result.steps.find((s) => s.name === "build step")!.detail).toMatch(/^step_02 → step_03, 2\/5 built$/);
  expect(result.ok).toBe(true);
}, 30_000);

it("reports a broken server as failed steps instead of throwing", async () => {
  const result = await runScenario("http://127.0.0.1:9", "nope");
  expect(result.ok).toBe(false);
  expect(result.steps[0]).toMatchObject({ name: "health", ok: false });
  expect(result.steps.at(-1)!.detail).toMatch(/skipped/);
});
