import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { models } from "../src/copilot/models.js";
import { routeOutcome, routeTurn } from "../src/copilot/router.js";

const cfg = loadConfig({}, { openaiKey: "k" });
const base = models(cfg, {});
const m = { ...base, budgets: { ...base.budgets, route: 50 } };
const input = { transcript: "what could we make with these", mode: "overlay", ideaTitles: [] };

describe("routeTurn", () => {
  it("returns the model's flow, and what they want built", async () =>
    expect(await routeTurn(cfg, m, input, vi.fn(async () => ({ flow: "build_ideas", confidence: 0.93, wish: "a birdhouse" })))).toEqual({ flow: "build_ideas", confidence: 0.93, wish: "a birdhouse" }));
  it("reads a missing wish as none", async () =>
    expect(await routeTurn(cfg, m, input, vi.fn(async () => ({ flow: "question", confidence: 0.9 })))).toEqual({ flow: "question", confidence: 0.9, wish: null }));
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

describe("routeOutcome: what a routed turn does", () => {
  const overlay = { mode: "overlay", canRethink: false }, picking = { mode: "build", canRethink: true }, building = { mode: "build", canRethink: false };

  it("treats no answer, and 'question', as a question", () => {
    expect(routeOutcome(null, picking)).toBe("question");
    expect(routeOutcome({ flow: "question", confidence: 0.2 }, picking)).toBe("question");
  });
  it("scans for build ideas and rethinks a design when it is sure", () => {
    expect(routeOutcome({ flow: "build_ideas", confidence: 0.9 }, overlay)).toBe("scan");
    expect(routeOutcome({ flow: "modify_design", confidence: 0.9 }, picking)).toBe("rethink");
  });
  it("outside build mode an unsure router changes nothing: E7 and the desk are answered as they always were", () => {
    // "can we move this bracket up" misread as a design change at 0.6 must not get "Do you want ideas for what to build…?"
    expect(routeOutcome({ flow: "modify_design", confidence: 0.6 }, overlay)).toBe("question");
    expect(routeOutcome({ flow: "build_ideas", confidence: 0.6 }, overlay)).toBe("question");
  });
  it("in build mode an unsure router asks back instead of guessing", () =>
    expect(routeOutcome({ flow: "build_ideas", confidence: 0.6 }, picking)).toBe("clarify"));
  it("with no design on show to change, 'change the design' is a question however sure the router is", () => {
    expect(routeOutcome({ flow: "modify_design", confidence: 0.95 }, building)).toBe("question");
    expect(routeOutcome({ flow: "modify_design", confidence: 0.4 }, building)).toBe("question");
  });
});
