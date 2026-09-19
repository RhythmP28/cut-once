import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { models } from "../src/copilot/models.js";
import { routeTurn } from "../src/copilot/router.js";

const cfg = loadConfig({}, { openaiKey: "k" });
const base = models(cfg, {});
const m = { ...base, budgets: { ...base.budgets, route: 50 } };
const input = { transcript: "what could we make with these", mode: "overlay", ideaTitles: [] };

describe("routeTurn", () => {
  it("returns the model's flow", async () =>
    expect(await routeTurn(cfg, m, input, vi.fn(async () => ({ flow: "build_ideas", confidence: 0.93 })))).toEqual({ flow: "build_ideas", confidence: 0.93 }));
  it("gives up at the budget, so the turn is treated as a question", async () =>
    expect(await routeTurn(cfg, m, input, vi.fn(() => new Promise<unknown>(() => {})))).toBeNull());
  it("treats an error or a malformed answer as a question", async () => {
    expect(await routeTurn(cfg, m, input, vi.fn(async () => { throw new Error("down"); }))).toBeNull();
    expect(await routeTurn(cfg, m, input, vi.fn(async () => ({ flow: "dance", confidence: 1 })))).toBeNull();
  });
  it("asks the small model, and tells it the mode, the ideas on show and what was said", async () => {
    const call = vi.fn(async (_cfg: unknown, _req: unknown) => ({ flow: "question", confidence: 0.9 }));
    await routeTurn(cfg, m, { transcript: "make it taller", mode: "build", ideaTitles: ["Laptop riser", "Tiered stand"] }, call);
    expect(call.mock.calls[0]![1]).toMatchObject({ name: "route", model: m.router, timeoutMs: 50 });
    expect((call.mock.calls[0]![1] as { text: string }).text).toBe('MODE: build\nIDEAS ON SHOW: Laptop riser, Tiered stand\nSAID: "make it taller"');
  });
  it("calls nothing without a key", async () => {
    const call = vi.fn();
    expect(await routeTurn(loadConfig({}, { openaiKey: "" }), m, input, call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});
