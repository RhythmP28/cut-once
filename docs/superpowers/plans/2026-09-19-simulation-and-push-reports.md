# Simulation and Push-to-Push Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** See the hologram on the laptop exactly as the headset will draw it (including drawings read by the AI), drive a pretend headset from the laptop, and get a report on every push that shows what changed since the previous push: pictures, plan geometry and behaviour.

**Architecture:** The look of every part is decided once, by a pure function and a colour table in `@cutonce/project-model`. The web app draws it (`/preview`, then `/sim`), and Unity reads the same table from `data/fixtures/hologram-palette.json`. A throwaway server (`sim-server`: temp data folder, no API keys, fake copilot) serves the web app. Playwright photographs a fixed list of scenes, a scripted "fake headset" walks the golden path over HTTP and WebSocket, and a report script compares everything with the previous run. The comparison runs on GitHub on every push (baseline = the run for the commit before the push) and locally with `pnpm sim` (baseline = your last local run).

**Tech stack:** three.js 0.171 (`LineSegments2` fat lines, `GLTFLoader`) · React 18 · `@cutonce/project-model` · Fastify · Playwright (Chromium, SwiftShader WebGL) · pngjs + pixelmatch · tsx · Vitest · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` §8 (visual states: the look), §10 (context packet), §14 (API contracts). The requirement, in the user's words: "simulate end to end and see what our changes actually impact from push to push", "see how the holograms look, especially after processing the 2D blueprints".

## Global Constraints

- Node 22, pnpm workspaces, TypeScript `strict`, ES modules. Relative imports inside `services/` and `packages/` end in `.js`.
- The hologram's colours, alphas, pulse rates and edge widths live **only** in `HOLOGRAM_PALETTE` (Task 1). Components never hard-code a hologram colour.
- Simulations need **no API keys** and no Elasticsearch. Anything that needs a key runs only when the key is present and reports "skipped" otherwise.
- Reports **inform, they do not block.** Changed pictures or plans never fail CI. A failing scenario step does.
- Pixels are only compared between runs on the same kind of machine: GitHub with GitHub, laptop with laptop.
- IDs are lowercase. Turn IDs are `turn_` + a lowercase ULID (the `TurnId` schema is `^turn_[a-z0-9_]+$`).
- Don't touch Unity files (`apps/quest/`), and don't write Rhythm's real copilot. `COPILOT_MODE=fake` is opt-in and is never the default.
- **Codex:** Tasks 4, 6, 8, 9 and 11 are self-contained with tests. Implement them with Codex and log each one in `CODEX_LOG.md` (OpenAI prize). Code Claude writes does not count.
- Output folder `sim-out/` is git-ignored.

## Phases (stop after any phase and you still have something useful)

| Phase | Tasks | You get | Rough time |
|---|---|---|---|
| 1. See it | 1–3 | `/preview` shows the desk and E7 in the headset's look, at head height, with any build state | 3.5 h |
| 2. Every push, pictures and plans | 4–7 | A report on GitHub and locally: which scenes changed and by how much, which parts moved | 3.5 h |
| 3. Behaviour end to end | 8–9 | A pretend headset runs the golden path on every push, including the copilot (fake answers) | 3 h |
| 4. After reading blueprints | 10 | The AI-read desk drawn over the known-good desk, with per-part error in mm, on every push that has the key | 1 h |
| 5. Drive it yourself | 11 | `/sim`: mouse as the controller ray, B to mark built, hold Space to ask, webcam as the camera | 3 h |

---

## File map

| File | Responsibility |
|---|---|
| `packages/project-model/src/visual.ts` | Base state and modifiers per part (§8), `styleFor`, `stateForBuilt`, `HOLOGRAM_PALETTE` |
| `packages/project-model/src/diff.ts` | `diffPlans(from, to)`: added, removed, moved, resized parts in mm |
| `data/fixtures/hologram-palette.json` | Generated copy of the palette, for Unity |
| `services/api/src/store/store.ts`, `boot.ts`, `routes/core.ts` | Plan assets (the E7 GLB) copied at boot and served |
| `apps/web/src/preview/{previewParams.ts,PreviewPage.tsx}` | `/preview` URL contract and page |
| `apps/web/src/three/hologram/{materials.ts,cameras.ts,meshAssets.ts,HologramView.tsx}` | Draws parts in the headset's look |
| `services/api/src/cli/sim-server.ts` | Throwaway server for simulations |
| `tools/sim/` (new workspace package `@cutonce/sim`) | Scenes, Playwright capture, image compare, report, orchestrator, CI baseline fetch |
| `services/api/src/turns/{wav.ts,turns.ts,routes.ts,fake.ts}` | Answer log, audio serving, fake copilot |
| `services/api/src/sim/scenario.ts`, `src/cli/sim-run.ts` | The pretend headset's golden path |
| `apps/web/src/sim/*` | `/sim` interactive page |
| `.github/workflows/sim.yml` | Runs everything on each push and posts the report |

---

# Phase 1: See it

### Task 1: The hologram look, defined once

**Files:**
- Create: `packages/project-model/src/visual.ts`
- Modify: `packages/project-model/src/index.ts` (export it)
- Modify: `packages/project-model/scripts/gen-fixtures.ts` (write the palette for Unity)
- Create (generated): `data/fixtures/hologram-palette.json`
- Test: `packages/project-model/tests/visual.test.ts`

**Interfaces:**
- Consumes: `fold(plan, assemblyId, events, upTo?)`, `plannedEvents(plan, assemblyId, start)` from this package.
- Produces:
  - `type BaseVisual = "BUILT_LIVE" | "BUILT_REPLAY" | "CURRENT_STEP" | "MISSING" | "FUTURE" | "WRONG"`
  - `type Modifier = "SELECTED" | "HIGHLIGHTED"`
  - `interface PartVisual { base: BaseVisual; modifiers: Modifier[] }`
  - `interface VisualStyle { fill: string; fillAlpha: number; edge: string; edgeAlpha: number; edgeWidthPx: number; pulseHz: number; brackets: boolean; grid: boolean }`
  - `HOLOGRAM_PALETTE: { bases: Record<BaseVisual, VisualStyle>; modifiers: Record<Modifier, Partial<VisualStyle> & { fillAlphaAdd?: number }> }`
  - `resolveVisuals(plan: Plan, state: BuildState, opts?: { selected?: string | null; highlighted?: readonly string[]; replay?: boolean }): Record<string, PartVisual>`
  - `styleFor(v: PartVisual): VisualStyle`
  - `stateForBuilt(plan: Plan, built: readonly string[] | "all", assemblyId?: string): BuildState`

- [ ] **Step 1: Write the failing test** in `packages/project-model/tests/visual.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOLOGRAM_PALETTE, resolveVisuals, stateForBuilt, styleFor } from "../src/index.js";
import { FIXTURES, clone, desk } from "./helpers.js";

describe("resolveVisuals", () => {
  const plan = desk();
  const state = stateForBuilt(plan, ["part_tabletop", "part_left_front_leg", "part_right_front_leg"]);

  it("starts from the state these cases assume", () => {
    expect(state.progress.built).toBe(3);
    expect(state.current_step_id).toBe("step_04");
    expect(state.available_part_ids).toContain("part_right_rear_leg");
    expect(state.available_part_ids).not.toContain("part_power_cable");
  });

  it("gives every part one base state, following blueprint §8", () => {
    const v = resolveVisuals(plan, state);
    expect(Object.keys(v).sort()).toEqual(plan.parts.map((p) => p.part_id).sort());
    expect(v.part_tabletop!.base).toBe("BUILT_LIVE");
    expect(v.part_left_rear_leg!.base).toBe("CURRENT_STEP");
    expect(v.part_right_rear_leg!.base).toBe("MISSING");
    expect(v.part_power_cable!.base).toBe("FUTURE");
  });

  it("marks wrong parts WRONG and replayed parts BUILT_REPLAY", () => {
    const s = clone(state);
    s.parts.part_right_front_leg!.state = "wrong";
    expect(resolveVisuals(plan, s).part_right_front_leg!.base).toBe("WRONG");
    expect(resolveVisuals(plan, state, { replay: true }).part_tabletop!.base).toBe("BUILT_REPLAY");
  });

  it("adds SELECTED and HIGHLIGHTED on top without changing the base", () => {
    const v = resolveVisuals(plan, state, { selected: "part_power_cable", highlighted: ["part_power_cable"] });
    expect(v.part_power_cable).toEqual({ base: "FUTURE", modifiers: ["SELECTED", "HIGHLIGHTED"] });
  });
});

describe("stateForBuilt", () => {
  it("builds nothing, a list, or everything", () => {
    const plan = desk();
    expect(stateForBuilt(plan, []).progress.built).toBe(0);
    expect(stateForBuilt(plan, "all").progress.built).toBe(plan.parts.length);
  });
});

describe("styleFor", () => {
  it("lets HIGHLIGHTED beat SELECTED and adds 0.15 fill", () => {
    const s = styleFor({ base: "MISSING", modifiers: ["SELECTED", "HIGHLIGHTED"] });
    expect(s.edge).toBe(HOLOGRAM_PALETTE.modifiers.HIGHLIGHTED.edge);
    expect(s.fillAlpha).toBeCloseTo(HOLOGRAM_PALETTE.bases.MISSING.fillAlpha + 0.15);
  });
  it("never lets a modifier repaint a WRONG part", () => {
    expect(styleFor({ base: "WRONG", modifiers: ["HIGHLIGHTED"] })).toEqual(HOLOGRAM_PALETTE.bases.WRONG);
  });
  it("keeps built parts see-through so the real wood shows", () => {
    expect(HOLOGRAM_PALETTE.bases.BUILT_LIVE.fillAlpha).toBe(0);
    expect(HOLOGRAM_PALETTE.bases.BUILT_LIVE.brackets).toBe(true);
  });
});

it("the palette file Unity reads matches the code", () => {
  const file = JSON.parse(readFileSync(join(FIXTURES, "hologram-palette.json"), "utf8"));
  expect(file).toEqual(HOLOGRAM_PALETTE);
});
```

- [ ] **Step 2: Run it.** `pnpm -F @cutonce/project-model test -- visual`. Expected: FAIL, `resolveVisuals` is not exported.

- [ ] **Step 3: Implement** `packages/project-model/src/visual.ts`:

```ts
import type { BuildState, Plan } from "@cutonce/schemas";
import { fold } from "./fold.js";
import { plannedEvents } from "./planned.js";

export type BaseVisual = "BUILT_LIVE" | "BUILT_REPLAY" | "CURRENT_STEP" | "MISSING" | "FUTURE" | "WRONG";
export type Modifier = "SELECTED" | "HIGHLIGHTED";
export interface PartVisual { base: BaseVisual; modifiers: Modifier[] }
export interface VisualStyle {
  fill: string; fillAlpha: number; edge: string; edgeAlpha: number; edgeWidthPx: number;
  pulseHz: number; brackets: boolean; grid: boolean;
}

/** Blueprint §8 in numbers. Unity's HologramPalette reads data/fixtures/hologram-palette.json, generated from this. */
export const HOLOGRAM_PALETTE: {
  bases: Record<BaseVisual, VisualStyle>;
  modifiers: Record<Modifier, Partial<VisualStyle> & { fillAlphaAdd?: number }>;
} = {
  bases: {
    BUILT_LIVE:   { fill: "#3DDC84", fillAlpha: 0,    edge: "#3DDC84", edgeAlpha: 0.6,  edgeWidthPx: 1.5, pulseHz: 0,   brackets: true,  grid: false },
    BUILT_REPLAY: { fill: "#4DA3FF", fillAlpha: 0.55, edge: "#8CC4FF", edgeAlpha: 1,    edgeWidthPx: 1.5, pulseHz: 0,   brackets: false, grid: false },
    CURRENT_STEP: { fill: "#22D3EE", fillAlpha: 0.35, edge: "#67E8F9", edgeAlpha: 1,    edgeWidthPx: 3,   pulseHz: 1.2, brackets: false, grid: true },
    MISSING:      { fill: "#22D3EE", fillAlpha: 0.18, edge: "#22D3EE", edgeAlpha: 0.9,  edgeWidthPx: 1.5, pulseHz: 0,   brackets: false, grid: false },
    FUTURE:       { fill: "#4DA3FF", fillAlpha: 0.05, edge: "#4DA3FF", edgeAlpha: 0.35, edgeWidthPx: 1,   pulseHz: 0,   brackets: false, grid: false },
    WRONG:        { fill: "#FF5252", fillAlpha: 0.3,  edge: "#FF5252", edgeAlpha: 1,    edgeWidthPx: 2.5, pulseHz: 2,   brackets: false, grid: false },
  },
  modifiers: {
    SELECTED:    { edge: "#FFFFFF", edgeAlpha: 1, edgeWidthPx: 2.5 },
    HIGHLIGHTED: { edge: "#FFD84D", edgeAlpha: 1, edgeWidthPx: 3, fillAlphaAdd: 0.15 },
  },
};

export function resolveVisuals(
  plan: Plan, state: BuildState,
  opts: { selected?: string | null; highlighted?: readonly string[]; replay?: boolean } = {},
): Record<string, PartVisual> {
  const current = new Set(plan.steps.find((s) => s.step_id === state.current_step_id)?.part_ids ?? []);
  const available = new Set(state.available_part_ids);
  const lit = new Set(opts.highlighted ?? []);
  const out: Record<string, PartVisual> = {};
  for (const part of plan.parts) {
    const s = state.parts[part.part_id]?.state ?? "missing";
    const base: BaseVisual =
      s === "wrong" ? "WRONG"
      : s === "built" ? (opts.replay ? "BUILT_REPLAY" : "BUILT_LIVE")
      : current.has(part.part_id) ? "CURRENT_STEP"
      : available.has(part.part_id) ? "MISSING"
      : "FUTURE";
    const modifiers: Modifier[] = [];
    if (opts.selected === part.part_id) modifiers.push("SELECTED");
    if (lit.has(part.part_id)) modifiers.push("HIGHLIGHTED");
    out[part.part_id] = { base, modifiers };
  }
  return out;
}

export function styleFor(v: PartVisual): VisualStyle {
  const style: VisualStyle = { ...HOLOGRAM_PALETTE.bases[v.base] };
  if (v.base === "WRONG") return style; // WRONG outranks every modifier (§8)
  for (const m of ["SELECTED", "HIGHLIGHTED"] as const) { // applied in order, so HIGHLIGHTED wins
    if (!v.modifiers.includes(m)) continue;
    const { fillAlphaAdd = 0, ...rest } = HOLOGRAM_PALETTE.modifiers[m];
    Object.assign(style, rest);
    style.fillAlpha = Math.min(1, style.fillAlpha + fillAlphaAdd);
  }
  return style;
}

/** A BuildState with exactly these parts built, in plan order. Used by /preview and the simulations. */
export function stateForBuilt(plan: Plan, built: readonly string[] | "all", assemblyId = "asm_preview"): BuildState {
  const wanted = built === "all" ? null : new Set(built);
  const events = plannedEvents(plan, assemblyId, "2026-01-01T00:00:00.000Z")
    .filter((e) => wanted === null || wanted.has(e.part_id ?? ""))
    .map((e, i) => ({ ...e, version: i + 1 }));
  return fold(plan, assemblyId, events);
}
```

Add to `src/index.ts`: `export { HOLOGRAM_PALETTE, resolveVisuals, styleFor, stateForBuilt, type BaseVisual, type Modifier, type PartVisual, type VisualStyle } from "./visual.js";`

- [ ] **Step 4: Generate the palette file.** In `scripts/gen-fixtures.ts`, add `import { HOLOGRAM_PALETTE } from "../src/visual.js";` at the top and `write("hologram-palette.json", HOLOGRAM_PALETTE);` before the final `console.log`. Run `pnpm gen:fixtures`. `scripts/sync-fixtures.mjs` already copies `data/fixtures/` into Unity, so nothing else is needed for Unity.

- [ ] **Step 5: Run the tests.** `pnpm -F @cutonce/project-model test`. Expected: PASS (all old tests too). Then `pnpm typecheck`.

- [ ] **Step 6: Commit.** `git add packages/project-model data/fixtures/hologram-palette.json && git commit -m "feat(project-model): hologram look defined once (visual states, palette for web and Unity)"`. Tell Jerry and Henry: "Unity's HologramPalette should read `hologram-palette.json` from the synced fixtures. Change colours in `visual.ts`, never in Unity."

---

### Task 2: Serve plan assets (the E7 model file)

**Files:**
- Modify: `services/api/src/store/store.ts` (add asset methods)
- Modify: `services/api/src/boot.ts` (copy each mesh part's file next to its plan)
- Modify: `services/api/src/routes/core.ts` (add the route)
- Test: `services/api/tests/assets.test.ts`

**Interfaces:**
- Produces:
  - `Store.putAssetIfMissing(planId: string, name: string, sourcePath: string): boolean`
  - `Store.assetPath(planId: string, name: string): string | null` (null when the name is invalid or the file is missing)
  - `GET /v1/plans/:plan_id/assets/:name` → the file. `.glb` is `model/gltf-binary`. Bad name → 400, missing → 404, bearer required.

- [ ] **Step 1: Write the failing test** `services/api/tests/assets.test.ts`:

```ts
import { afterEach, beforeEach, expect, it } from "vitest";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

it("serves the E7 model that boot copied next to its plan", async () => {
  const r = await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb", headers: auth });
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toBe("model/gltf-binary");
  expect(r.rawPayload.subarray(0, 4).toString()).toBe("glTF");
});

it("rejects odd names, reports missing files and needs the token", async () => {
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/..%2F..%2Fsecret.glb", headers: auth })).statusCode).toBe(400);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/nope.glb", headers: auth })).statusCode).toBe(404);
  expect((await t.app.inject({ method: "GET", url: "/v1/plans/plan_e7_massing/assets/e7.glb" })).statusCode).toBe(401);
});
```

- [ ] **Step 2: Run it.** `pnpm -F @cutonce/api test -- assets`. Expected: FAIL (404 on the first case).

- [ ] **Step 3: Implement.**

In `store.ts` (next to the plan methods; `planDir` already validates the plan ID):

```ts
  private static ASSET_NAME = /^[a-z0-9][a-z0-9_-]*\.(glb|gltf|png|jpg)$/;

  putAssetIfMissing(planId: string, name: string, sourcePath: string): boolean {
    if (!Store.ASSET_NAME.test(name) || !existsSync(sourcePath)) return false;
    const target = join(this.planDir(planId), "assets", name);
    if (existsSync(target)) return false;
    ensureDir(dirname(target));
    copyFileSync(sourcePath, target);
    return true;
  }

  assetPath(planId: string, name: string): string | null {
    if (!Store.ASSET_NAME.test(name)) return null;
    const p = join(this.planDir(planId), "assets", name);
    return existsSync(p) ? p : null;
  }
```

(Add `copyFileSync`, `existsSync` and `dirname` to the imports if they are missing.)

In `boot.ts`, inside the `for (const file of planFiles)` loop, after the import line:

```ts
    for (const part of parsed.data.parts) {
      const shape = part.shape as { type: string; uri?: string };
      if (shape.type === "mesh" && shape.uri) store.putAssetIfMissing(parsed.data.plan_id, shape.uri, join(dirname(file), shape.uri));
    }
```

In `routes/core.ts`:

```ts
  app.get<{ Params: { plan_id: string; name: string } }>("/v1/plans/:plan_id/assets/:name", async (req, reply) => {
    const { plan_id, name } = req.params;
    if (!/^[a-z0-9][a-z0-9_-]*\.(glb|gltf|png|jpg)$/.test(name)) throw badRequest("asset names are lowercase file names");
    const path = store.assetPath(plan_id, name);
    if (!path) throw notFound(`asset ${name} of ${plan_id}`);
    const type = name.endsWith(".glb") ? "model/gltf-binary" : name.endsWith(".gltf") ? "model/gltf+json" : name.endsWith(".png") ? "image/png" : "image/jpeg";
    return reply.type(type).header("cache-control", "no-store").send(readFileSync(path));
  });
```

- [ ] **Step 4: Run the tests.** `pnpm -F @cutonce/api test`. Expected: PASS. (The E7 GLB is in Git LFS: run `git lfs pull` first if the file is a pointer.)

- [ ] **Step 5: Commit.** `git commit -am "feat(api): copy mesh assets beside their plans and serve them"`

---

### Task 3: `/preview`, the hologram as the headset draws it

**Files:**
- Create: `apps/web/src/preview/previewParams.ts`, `apps/web/src/preview/PreviewPage.tsx`
- Create: `apps/web/src/three/hologram/materials.ts`, `cameras.ts`, `meshAssets.ts`, `HologramView.tsx`
- Modify: `apps/web/src/App.tsx` (route `/preview`), `apps/web/src/api.ts` (`planAssetUrl`), `apps/web/package.json` (add `@cutonce/project-model: "workspace:*"`; dev `vitest`; script `"test": "vitest run"`)
- Test: `apps/web/src/preview/previewParams.test.ts`

**Interfaces:**
- Consumes: `resolveVisuals`, `styleFor`, `stateForBuilt`, `partAabb`, `union`, `plannedEvents`, `fold` from `@cutonce/project-model`. `getPlan`, `getCurrentAssembly`, `getState`, `useStream` from the web app. `GET /v1/plans/:id/assets/:name` from Task 2.
- Produces:
  - The URL contract below. Tasks 5, 10 and 11 build URLs against it.
  - `window.__previewReady = true` once every part (including GLB meshes) is drawn and two frames have rendered.
  - `<HologramView>` (props below), reused by `/sim` in Task 11.

**URL contract (`/preview?…`):**

| Param | Values | Default | Meaning |
|---|---|---|---|
| `plan` | plan ID | `plan_desk_demo` | Which plan |
| `rev` | integer | approved | Plan revision |
| `built` | empty, `all`, or comma-separated part IDs | absent | Exactly these parts built. Absent = follow the live run (current assembly, updated by the stream) |
| `replay` | `0`–`1`, or `play` | absent | Planned build to this fraction (`BUILT_REPLAY` look); `play` animates it over 10 s, looping |
| `highlight` | part IDs | none | The copilot is talking about these |
| `selected` | part ID | none | Under the pointer |
| `compare` | plan ID | none | Draw that plan too, as thin white outlines (used for extracted vs known-good) |
| `view` | `operator`, `top`, `orbit` | `operator` | Operator = standing at the near edge at eye height |
| `fov` | 30–120 | 90 | Vertical field of view in degrees (the Quest 3 is about 96°) |
| `bg` | `none`, `webcam`, `image` | `none` | Passthrough stand-in. `image` uses `src` |
| `src` | URL | — | Background image for `bg=image` |
| `still` | `1` | off | Freeze pulses and sweeps (for screenshots) |
| `hud` | `0` | on | Hide the progress panel |

- [ ] **Step 1: Add the web test runner.** In `apps/web/package.json` add `"test": "vitest run"`, dev dependency `"vitest": "^2.1.9"` and dependency `"@cutonce/project-model": "workspace:*"`. Run `pnpm install`.

- [ ] **Step 2: Write the failing test** `apps/web/src/preview/previewParams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePreviewParams } from "./previewParams";

describe("parsePreviewParams", () => {
  it("defaults to the live desk from the operator's eye height", () => {
    expect(parsePreviewParams("")).toEqual({
      planId: "plan_desk_demo", revision: null, built: null, replay: null, highlight: [], selected: null,
      compare: null, view: "operator", fov: 90, bg: "none", bgSrc: null, still: false, hud: true,
    });
  });
  it("reads an explicit build state", () => {
    expect(parsePreviewParams("?built=").built).toEqual([]);
    expect(parsePreviewParams("?built=all").built).toBe("all");
    expect(parsePreviewParams("?built=part_tabletop,part_left_front_leg").built).toEqual(["part_tabletop", "part_left_front_leg"]);
  });
  it("reads replay, highlight, compare and the camera", () => {
    const p = parsePreviewParams("?plan=plan_e7_massing&replay=0.5&highlight=a,b&compare=plan_desk_demo&view=orbit&fov=200&still=1&hud=0");
    expect(p).toMatchObject({ planId: "plan_e7_massing", replay: 0.5, highlight: ["a", "b"], compare: "plan_desk_demo", view: "orbit", fov: 120, still: true, hud: false });
    expect(parsePreviewParams("?replay=play").replay).toBe("play");
    expect(parsePreviewParams("?replay=7").replay).toBe(1);
    expect(parsePreviewParams("?view=sideways").view).toBe("operator");
  });
});
```

- [ ] **Step 3: Run it.** `pnpm -F @cutonce/web test`. Expected: FAIL (module missing).

- [ ] **Step 4: Implement `previewParams.ts`:**

```ts
export type View = "operator" | "top" | "orbit";
export interface PreviewParams {
  planId: string; revision: number | null; built: string[] | "all" | null; replay: number | "play" | null;
  highlight: string[]; selected: string | null; compare: string | null; view: View; fov: number;
  bg: "none" | "webcam" | "image"; bgSrc: string | null; still: boolean; hud: boolean;
}

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function parsePreviewParams(search: string): PreviewParams {
  const q = new URLSearchParams(search);
  const builtRaw = q.get("built");
  const replayRaw = q.get("replay");
  const view = q.get("view");
  const bg = q.get("bg");
  const rev = Number(q.get("rev"));
  const fov = Number(q.get("fov") ?? 90);
  return {
    planId: q.get("plan") || "plan_desk_demo",
    revision: Number.isInteger(rev) && rev > 0 ? rev : null,
    built: builtRaw === null ? null : builtRaw === "all" ? "all" : list(builtRaw),
    replay: replayRaw === null ? null : replayRaw === "play" ? "play" : clamp(Number(replayRaw) || 0, 0, 1),
    highlight: list(q.get("highlight")),
    selected: q.get("selected") || null,
    compare: q.get("compare") || null,
    view: view === "top" || view === "orbit" ? view : "operator",
    fov: Number.isFinite(fov) ? clamp(fov, 30, 120) : 90,
    bg: bg === "webcam" || bg === "image" ? bg : "none",
    bgSrc: q.get("src") || null,
    still: q.get("still") === "1",
    hud: q.get("hud") !== "0",
  };
}
```

- [ ] **Step 5: Run it.** Expected: PASS.

- [ ] **Step 6: Implement the drawing modules.** Each small and single-purpose:

`three/hologram/materials.ts`: turns a `VisualStyle` into three.js materials, and animates them.

```ts
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { VisualStyle } from "@cutonce/project-model";

export interface PartMaterials { fill: THREE.MeshBasicMaterial; edge: LineMaterial; style: VisualStyle }

export function makeMaterials(style: VisualStyle, resolution: THREE.Vector2): PartMaterials {
  const fill = new THREE.MeshBasicMaterial({ color: style.fill, transparent: true, opacity: style.fillAlpha, depthWrite: false, side: THREE.DoubleSide });
  const edge = new LineMaterial({ color: new THREE.Color(style.edge).getHex(), linewidth: style.edgeWidthPx, transparent: true, opacity: style.edgeAlpha, resolution });
  return { fill, edge, style };
}

/** Pulses fill and edge at the style's rate. `still` keeps the rest value so screenshots are stable. */
export function animate(m: PartMaterials, tSeconds: number, still: boolean): void {
  const k = still || m.style.pulseHz === 0 ? 1 : 0.6 + 0.4 * Math.sin(2 * Math.PI * m.style.pulseHz * tSeconds);
  m.fill.opacity = m.style.fillAlpha * k;
  m.edge.opacity = m.style.edgeAlpha * (0.7 + 0.3 * k);
}
```

`three/hologram/cameras.ts`: places the camera for each view from the plan's bounds (`union(parts.map(partAabb))`).

```ts
import * as THREE from "three";
import type { Aabb } from "@cutonce/project-model";
import type { View } from "../../preview/previewParams";

export function placeCamera(camera: THREE.PerspectiveCamera, box: Aabb, view: View): THREE.Vector3 {
  const min = new THREE.Vector3(...box.min), max = new THREE.Vector3(...box.max);
  const centre = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);
  const radius = Math.max(size.length() / 2, 0.05);
  if (view === "operator") {
    // Standing at the near (+Z) edge, eyes at 1.6 m or 0.6 m above the top of the model, whichever is higher.
    camera.position.set(centre.x, Math.max(1.6, max.y + 0.6), max.z + Math.max(0.6, size.z * 0.5));
  } else if (view === "top") {
    camera.position.set(centre.x, max.y + radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1, centre.z + 0.001);
  } else {
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15;
    camera.position.copy(centre).addScaledVector(new THREE.Vector3(0.75, 0.7, 1).normalize(), dist);
  }
  camera.near = Math.max(radius / 500, 0.01);
  camera.far = radius * 60;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  return centre;
}
```

`three/hologram/meshAssets.ts`: loads a plan's GLB once and returns the node named by `shape.node`.

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const cache = new Map<string, Promise<THREE.Group>>();

export function loadMeshNode(url: string, node: string, headers: Record<string, string>): Promise<THREE.Object3D | null> {
  let scene = cache.get(url);
  if (!scene) {
    const loader = new GLTFLoader();
    loader.setRequestHeader(headers);
    scene = loader.loadAsync(url).then((g) => g.scene);
    cache.set(url, scene);
  }
  return scene.then((s) => s.getObjectByName(node)?.clone(true) ?? null);
}
```

`three/hologram/HologramView.tsx`: the component. Props:

```ts
export interface HologramViewProps {
  plan: Plan;
  visuals: Record<string, PartVisual>;
  compare?: Plan | null;
  view: View;
  fov: number;
  background: { kind: "none" } | { kind: "webcam" } | { kind: "image"; src: string };
  still: boolean;
  assetUrl: (planId: string, name: string) => string;
  authHeaders: Record<string, string>;
  onReady?: () => void;
  onPoint?: (partId: string | null) => void;   // Task 11 uses this
  cameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>; // Task 11 projects parts with it
}
```

Behaviour (write it as one `useEffect` for the renderer, one for building parts when `plan` or `compare` changes, and one for applying `visuals`):
1. Renderer as in `PlanViewer.tsx` (pixel ratio capped at 2, `ResizeObserver`). Scene background: `none` → `#0b1017`; `image` → `THREE.TextureLoader` texture with `colorSpace = SRGBColorSpace`; `webcam` → `getUserMedia({ video: true })` into a `<video>`, then a `THREE.VideoTexture`. If the webcam is refused, fall back to `none` and show a one-line notice.
2. Faint floor grid at y = 0 (`THREE.GridHelper`, 0.1 m cells for plans under 5 m, 5 m cells otherwise, opacity 0.25).
3. For each part, geometry comes from the existing `buildPartObject` in `three/buildPart.ts`, so shapes match the review page exactly. Fill mesh uses `materials.fill`. Edges use `LineSegments2` + `LineSegmentsGeometry.fromEdgesGeometry(new THREE.EdgesGeometry(geometry, 20))` with `materials.edge`. For `mesh` parts with `shape.uri`, replace the placeholder box with `loadMeshNode(assetUrl(plan.plan_id, uri), shape.node, authHeaders)`. If that fails, keep the wireframe box and log once.
4. `brackets: true` (BUILT_LIVE): skip the fill and draw corner brackets instead of full edges. At each of the 8 AABB corners, 3 segments along the box edges, each 15% of that edge's length.
5. `grid: true` (CURRENT_STEP): add a second `LineSegments2` of the box faces subdivided every 5 cm, at 40% of the edge opacity.
6. `compare` plan: edges only, `#FFFFFF`, opacity 0.5, width 1, no fill, never pickable.
7. Every frame: `animate(materials, t, still)` for every part, then render. After all parts (and GLB loads) are added and two frames have rendered, call `onReady()`.
8. Picking: raycast the fill meshes on pointer move and call `onPoint(partId | null)`.
9. `placeCamera(camera, box, view)` on build and resize. `view` and `fov` changes re-place it.

`preview/PreviewPage.tsx`:
1. `parsePreviewParams(location.search)`, then `getPlan(planId, revision)` (and `getPlan(compare)` when set).
2. State source, in priority order:
   - `replay` number → `fold(plan, "asm_preview", plannedEvents(plan, "asm_preview", T0).slice(0, Math.ceil(n * fraction)))` with `replay: true`
   - `replay=play` → the same, with a fraction that grows over 10 s and loops
   - `built` present → `stateForBuilt(plan, built)`
   - otherwise the live run: `getCurrentAssembly()` → `getState(aid)`, re-fetched on each `event_appended` / `assembly_changed` from `useStream`
3. `visuals = resolveVisuals(plan, state, { selected, highlighted: highlight, replay: replay !== null })`.
4. HUD (unless `hud=0`), in the corner: plan name, "`built` of `total` built", current step title, the minutes left, and a legend drawn from `HOLOGRAM_PALETTE` (never hard-coded colours).
5. `onReady={() => { (window as any).__previewReady = true; }}`.

Add the route in `App.tsx`: `<Route path="/preview" element={<PreviewPage />} />`, and a "Preview" link in the nav. Add `export const planAssetUrl = (planId: string, name: string) => \`/v1/plans/${planId}/assets/${name}\`;` to `api.ts`, plus a helper that returns `{ Authorization: \`Bearer ${getToken()}\` }`.

- [ ] **Step 7: Check it by eye.** `pnpm serve:local`, then open each of these and compare against the table in blueprint §8:
  - `/preview?built=part_tabletop,part_left_front_leg,part_right_front_leg`: the tabletop and two legs show only green corner brackets, the left rear leg pulses cyan, the power cable is barely visible
  - `/preview?built=all&view=top`
  - `/preview?plan=plan_e7_massing&replay=play&view=orbit`: E7 rises floor by floor, drawn from its real model (not boxes)
  - `/preview?highlight=part_power_cable,part_cable_tray`: yellow edges
  - `/preview?bg=webcam`: the desk ghost over your webcam
  - `/preview` with no params, then force a part built on `/director`: the preview follows within a second

- [ ] **Step 8: Typecheck, test, commit.** `pnpm typecheck && pnpm test`, then `git commit -m "feat(web): /preview draws plans in the headset's hologram look"`

---

# Phase 2: Every push, pictures and plans

### Task 4: `diffPlans`: what moved, in millimetres (Codex)

**Files:**
- Create: `packages/project-model/src/diff.ts`; modify `src/index.ts`
- Test: `packages/project-model/tests/diff.test.ts`

**Interfaces:**
- Consumes: `partAabb(part): Aabb | null`.
- Produces:
  - `interface PartChange { part_id: string; name: string; change: "added" | "removed" | "changed"; moved_mm: number | null; resized_mm: number | null; fields: string[] }`
  - `interface PlanDiff { from: { plan_id: string; revision: number }; to: { plan_id: string; revision: number }; changes: PartChange[]; unchanged: number }`
  - `diffPlans(from: Plan, to: Plan, toleranceMm = 0.5): PlanDiff`. Parts match by `part_id`, then by name (case-insensitive), so an AI-read plan with its own IDs still lines up. `moved_mm` is the distance between bounding-box centres, and `resized_mm` the largest size difference on any axis. Both are rounded to 0.1 mm and are null for meshes without bounds. `fields` lists which of `kind, layer, material_id, step_id, rests_on, attaches_to` differ, compared only when the IDs match (name-matched parts compare `kind` and `layer` only). A part counts as changed when `fields` is non-empty or either distance exceeds `toleranceMm`.

- [ ] **Step 1: Write the failing test** `packages/project-model/tests/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffPlans } from "../src/index.js";
import { clone, desk } from "./helpers.js";

describe("diffPlans", () => {
  it("finds nothing between identical plans", () => {
    const d = diffPlans(desk(), desk());
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(desk().parts.length);
  });

  it("reports a move and a resize in millimetres", () => {
    const b = clone(desk());
    const top = b.parts.find((p) => p.part_id === "part_tabletop")!;
    top.position = [top.position[0] + 0.01, top.position[1], top.position[2]];
    (top.shape as { size: number[] }).size[0]! += 0.02;
    const [c] = diffPlans(desk(), b).changes;
    expect(c).toMatchObject({ part_id: "part_tabletop", change: "changed", moved_mm: 10, resized_mm: 20, fields: [] });
  });

  it("ignores movement under the tolerance", () => {
    const b = clone(desk());
    const leg = b.parts.find((p) => p.part_id === "part_left_front_leg")!;
    leg.position = [leg.position[0] + 0.0003, leg.position[1], leg.position[2]];
    expect(diffPlans(desk(), b).changes).toEqual([]);
  });

  it("lists added, removed and field changes", () => {
    const b = clone(desk());
    b.parts = b.parts.filter((p) => p.part_id !== "part_power_cable");
    b.parts.push({ ...clone(desk().parts[0]!), part_id: "part_shelf", name: "Shelf" });
    b.parts.find((p) => p.part_id === "part_rear_crossbar")!.step_id = "step_07";
    const changes = diffPlans(desk(), b).changes;
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_shelf", change: "added" }));
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_power_cable", change: "removed" }));
    expect(changes).toContainEqual(expect.objectContaining({ part_id: "part_rear_crossbar", change: "changed", fields: ["step_id"] }));
  });

  it("matches AI-read parts by name when their IDs differ", () => {
    const b = clone(desk());
    for (const p of b.parts) p.part_id = p.part_id.replace("part_", "part_x_");
    const d = diffPlans(desk(), b);
    expect(d.changes).toEqual([]);
    expect(d.unchanged).toBe(desk().parts.length);
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement with Codex.** Prompt: "Implement `packages/project-model/src/diff.ts` so `tests/diff.test.ts` passes, following the Interfaces block in docs/superpowers/plans/2026-09-19-simulation-and-push-reports.md Task 4. Use `partAabb` from `./geometry.js`. Don't change the tests." Review the diff yourself.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then add a `CODEX_LOG.md` row.
- [ ] **Step 5: Commit.** `git commit -am "feat(project-model): diffPlans reports moved, resized, added and removed parts"`

---

### Task 5: Throwaway server and scene photographs

**Files:**
- Create: `services/api/src/cli/sim-server.ts`
- Modify: `pnpm-workspace.yaml` (add `"tools/*"`), `.gitignore` (add `sim-out/`)
- Create: `tools/sim/package.json`, `tools/sim/tsconfig.json`, `tools/sim/paths.ts`, `tools/sim/scenes.ts`, `tools/sim/playwright.config.ts`, `tools/sim/capture.spec.ts`

**Interfaces:**
- Produces:
  - `sim-server`: listens on `127.0.0.1:${SIM_PORT ?? 8787}` with token `sim-token`, a temp data folder, no keys, no Elasticsearch. If `sim-out/current/extracted.plan.json` exists, it imports that plan as `plan_desk_extracted` (Task 10).
  - `tools/sim/paths.ts`: `ROOT`, `OUT = sim-out`, `CURRENT = sim-out/current`, `BASELINE = sim-out/baseline`, `SIM_PORT = 8787`, `SIM_TOKEN = "sim-token"`.
  - `scenes(): Scene[]` where `interface Scene { name: string; url: string; note: string }`.
  - `sim-out/current/screens/<scene>.png` (1280×720) and `sim-out/current/scenes.json`.

- [ ] **Step 1: `sim-server.ts`:**

```ts
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S } from "@cutonce/schemas";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { plugins } from "../plugins.js";

/** A server for simulations: fresh temp data, no keys, no Elasticsearch. Never point a headset at it. */
const dataDir = mkdtempSync(join(tmpdir(), "cutonce-sim-"));
const cfg = loadConfig({}, {
  dataDir, apiToken: "sim-token", host: "127.0.0.1", port: Number(process.env.SIM_PORT ?? 8787), logLevel: "warn",
  esUrl: "", esApiKey: "", kibanaUrl: "", mcpUrl: "", openaiKey: "", elevenKey: "", reconstruction: false,
});
const app = await buildApp(cfg, plugins);
const extracted = join(cfg.repoRoot, "sim-out", "current", "extracted.plan.json");
if (existsSync(extracted)) {
  const plan = S.Plan.parse(JSON.parse(readFileSync(extracted, "utf8")));
  app.ctx.store.importApproved({ ...plan, plan_id: "plan_desk_extracted", revision: 1 });
}
await app.listen({ port: cfg.port, host: cfg.host });
console.log(`sim server on http://${cfg.host}:${cfg.port} (data ${dataDir})`);
```

- [ ] **Step 2: The package.** `tools/sim/package.json`:

```json
{
  "name": "@cutonce/sim",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "typecheck": "tsc -p tsconfig.json", "capture": "playwright test" },
  "dependencies": { "@cutonce/project-model": "workspace:*", "@cutonce/schemas": "workspace:*", "pixelmatch": "^7.1.0", "pngjs": "^7.0.0" },
  "devDependencies": { "@playwright/test": "^1.55.0", "@types/pngjs": "^6.0.5", "tsx": "^4.19.0", "vitest": "^2.1.9" }
}
```

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["*.ts", "tests"] }`. Then run `pnpm install` and `pnpm -F @cutonce/sim exec playwright install chromium` (about 150 MB; your disk can take it).

- [ ] **Step 3: `paths.ts` and `scenes.ts`:**

```ts
// paths.ts
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(ROOT, "sim-out");
export const CURRENT = join(OUT, "current");
export const BASELINE = join(OUT, "baseline");
export const SIM_PORT = 8787;
export const SIM_TOKEN = "sim-token";
```

```ts
// scenes.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENT, ROOT } from "./paths.js";

export interface Scene { name: string; url: string; note: string }

/** The fixed set of pictures taken on every run. Add scenes at the end; never rename one (names are the comparison key). */
export function scenes(): Scene[] {
  const demoStart = (JSON.parse(readFileSync(join(ROOT, "data/demo/seeds/demo_start.json"), "utf8")) as { built: string[] }).built.join(",");
  const p = (q: string) => `/preview?${q}&still=1`;
  const list: Scene[] = [
    { name: "desk-empty", url: p("plan=plan_desk_demo&built="), note: "Nothing built: every ghost" },
    { name: "desk-demo-start", url: p(`plan=plan_desk_demo&built=${demoStart}`), note: "The state the live demo starts in" },
    { name: "desk-all-built", url: p("plan=plan_desk_demo&built=all"), note: "Finished: brackets only" },
    { name: "desk-top", url: p(`plan=plan_desk_demo&built=${demoStart}&view=top`), note: "From above: layout and alignment" },
    { name: "desk-cable-answer", url: p(`plan=plan_desk_demo&built=${demoStart}&highlight=part_power_cable,part_cable_tray`), note: "What 'where does this cable go?' lights up" },
    { name: "e7-full", url: p("plan=plan_e7_massing&built=all&view=orbit"), note: "E7 massing, complete" },
    { name: "e7-half", url: p("plan=plan_e7_massing&replay=0.5&view=orbit"), note: "E7 halfway through its build" },
  ];
  if (existsSync(join(CURRENT, "extracted.plan.json"))) {
    list.push({ name: "extracted-vs-known", url: p("plan=plan_desk_extracted&built=&compare=plan_desk_demo"), note: "AI-read desk (ghost) over the known-good desk (white)" });
  }
  return list;
}
```

- [ ] **Step 4: Playwright config and capture.**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { ROOT, SIM_PORT } from "./paths.js";

export default defineConfig({
  testDir: ".", testMatch: "capture.spec.ts", workers: 1, retries: 0, reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${SIM_PORT}`, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: "pnpm -F @cutonce/api exec tsx src/cli/sim-server.ts", cwd: ROOT,
    url: `http://127.0.0.1:${SIM_PORT}/health`, timeout: 60_000, reuseExistingServer: !process.env.CI,
  },
});
```

```ts
// capture.spec.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { CURRENT, SIM_TOKEN } from "./paths.js";
import { scenes } from "./scenes.js";

const list = scenes();
mkdirSync(join(CURRENT, "screens"), { recursive: true });
writeFileSync(join(CURRENT, "scenes.json"), JSON.stringify(list, null, 2));

test.beforeEach(async ({ context }) => {
  await context.addInitScript((t) => localStorage.setItem("cutonce.api_token", t), SIM_TOKEN);
});

for (const scene of list) {
  test(scene.name, async ({ page }) => {
    await page.goto(scene.url);
    await page.waitForFunction(() => (window as unknown as { __previewReady?: boolean }).__previewReady === true, null, { timeout: 30_000 });
    await page.screenshot({ path: join(CURRENT, "screens", `${scene.name}.png`) });
  });
}
```

- [ ] **Step 5: Run it.** `pnpm -F @cutonce/web build && pnpm -F @cutonce/sim capture`. Expected: 7 passed, 7 PNGs in `sim-out/current/screens/`. Open two of them and check the look matches Step 7 of Task 3. If a picture is black, WebGL failed: run `pnpm -F @cutonce/sim exec playwright test --headed` once to see it.
- [ ] **Step 6: Commit.** `git add -A tools/sim services/api/src/cli/sim-server.ts pnpm-workspace.yaml pnpm-lock.yaml .gitignore && git commit -m "feat(sim): throwaway server and scene photographs"`

---

### Task 6: Compare with the previous run and write the report (Codex)

**Files:**
- Create: `tools/sim/types.ts`, `tools/sim/compare.ts`, `tools/sim/report.ts`
- Test: `tools/sim/tests/compare.test.ts`, `tools/sim/tests/report.test.ts`

**Interfaces:**
- Consumes: `diffPlans` (Task 4), `scenes.json` and `screens/` (Task 5).
- Produces (in `types.ts`, shared by Tasks 7, 9 and 10):

```ts
export interface RunMeta { sha: string; dirty: boolean; created_at: string; ci: boolean }
export interface ScenarioStep { name: string; ok: boolean; ms: number; detail?: string }
export interface ScenarioResult { ok: boolean; steps: ScenarioStep[] }
export type ScreenStatus = "same" | "changed" | "new" | "removed" | "size_changed";
export interface ScreenResult { scene: string; note: string; status: ScreenStatus; diffPct: number | null }
export interface PlanReport { file: string; diff: import("@cutonce/project-model").PlanDiff | null; note?: string }
export interface ReportInput {
  current: RunMeta; baseline: RunMeta | null; screens: ScreenResult[]; plans: PlanReport[];
  scenario: { current: ScenarioResult | null; baseline: ScenarioResult | null };
  extraction: { diff: import("@cutonce/project-model").PlanDiff | null; skipped: string | null };
}
```

  - `compareImages(a: PNG, b: PNG, threshold = 0.1): { diffPct: number; diff: PNG | null; sizeChanged: boolean }`. `diffPct` is the share of pixels that differ, 0–100, rounded to 3 decimals.
  - `compareScreens(currentDir: string, baselineDir: string | null, diffDir: string): ScreenResult[]`. `same` when `diffPct <= 0.05`. Writes `diffDir/<scene>.png` for changed scenes.
  - `buildMarkdown(input: ReportInput): string` and `buildHtml(input: ReportInput): string` (pure).
  - CLI `tsx tools/sim/report.ts` reads `sim-out/current` and `sim-out/baseline`, then writes `sim-out/report.md`, `sim-out/report.html` and `sim-out/diff/`. Plan diffs compare each tracked plan file at `baseline.sha` (`git show <sha>:<file>`) with the working copy. Tracked files: `data/demo/desk.plan.json`, `data/e7/out/e7.plan.json`. Exit code 1 only if `scenario.current.ok === false`.

- [ ] **Step 1: Write the failing tests.**

`tools/sim/tests/compare.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compareImages, compareScreens } from "../compare.js";

function solid(w: number, h: number, rgb: [number, number, number], paint?: (x: number, y: number) => boolean): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = paint?.(x, y) ? [255, 255, 255] : rgb;
    png.data[i] = c[0]!; png.data[i + 1] = c[1]!; png.data[i + 2] = c[2]!; png.data[i + 3] = 255;
  }
  return png;
}
const write = (dir: string, name: string, png: PNG) => { mkdirSync(join(dir, "screens"), { recursive: true }); writeFileSync(join(dir, "screens", `${name}.png`), PNG.sync.write(png)); };
const scenesFile = (dir: string, names: string[]) => writeFileSync(join(dir, "scenes.json"), JSON.stringify(names.map((n) => ({ name: n, url: "/", note: n }))));

describe("compareImages", () => {
  it("measures the share of pixels that changed", () => {
    const a = solid(10, 10, [0, 0, 0]);
    const b = solid(10, 10, [0, 0, 0], (x, y) => x < 5 && y < 2); // 10 of 100 pixels
    expect(compareImages(a, a).diffPct).toBe(0);
    expect(compareImages(a, b).diffPct).toBe(10);
  });
  it("flags a size change without comparing pixels", () => {
    expect(compareImages(solid(10, 10, [0, 0, 0]), solid(12, 10, [0, 0, 0]))).toEqual({ diffPct: 100, diff: null, sizeChanged: true });
  });
});

describe("compareScreens", () => {
  it("classifies same, changed, new and removed scenes and writes diff images", () => {
    const cur = mkdtempSync(join(tmpdir(), "cur-")), base = mkdtempSync(join(tmpdir(), "base-")), diff = join(cur, "diff");
    write(cur, "same", solid(8, 8, [10, 10, 10])); write(base, "same", solid(8, 8, [10, 10, 10]));
    write(cur, "changed", solid(8, 8, [10, 10, 10], (x) => x === 0)); write(base, "changed", solid(8, 8, [10, 10, 10]));
    write(cur, "new", solid(8, 8, [0, 0, 0]));
    write(base, "gone", solid(8, 8, [0, 0, 0]));
    scenesFile(cur, ["same", "changed", "new"]); scenesFile(base, ["same", "changed", "gone"]);
    const r = Object.fromEntries(compareScreens(cur, base, diff).map((s) => [s.scene, s.status]));
    expect(r).toEqual({ same: "same", changed: "changed", new: "new", gone: "removed" });
    expect(existsSync(join(diff, "changed.png"))).toBe(true);
  });
  it("marks everything new when there is no baseline", () => {
    const cur = mkdtempSync(join(tmpdir(), "cur-"));
    write(cur, "a", solid(4, 4, [0, 0, 0])); scenesFile(cur, ["a"]);
    expect(compareScreens(cur, null, join(cur, "diff"))).toEqual([{ scene: "a", note: "a", status: "new", diffPct: null }]);
  });
});
```

`tools/sim/tests/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMarkdown } from "../report.js";
import type { ReportInput } from "../types.js";

const base: ReportInput = {
  current: { sha: "abc1234def", dirty: false, created_at: "2026-09-19T12:00:00Z", ci: true },
  baseline: { sha: "9f8e7d6c5b", dirty: false, created_at: "2026-09-19T11:00:00Z", ci: true },
  screens: [
    { scene: "desk-demo-start", note: "demo start", status: "changed", diffPct: 3.2 },
    { scene: "e7-full", note: "E7", status: "same", diffPct: 0 },
  ],
  plans: [{ file: "data/demo/desk.plan.json", diff: { from: { plan_id: "plan_desk_demo", revision: 1 }, to: { plan_id: "plan_desk_demo", revision: 2 },
    changes: [{ part_id: "part_tabletop", name: "Tabletop", change: "changed", moved_mm: 10, resized_mm: 0, fields: [] }], unchanged: 8 } }],
  scenario: { current: { ok: true, steps: [{ name: "mark built", ok: true, ms: 40 }] }, baseline: { ok: true, steps: [{ name: "mark built", ok: true, ms: 35 }] } },
  extraction: { diff: null, skipped: "no OPENAI_API_KEY" },
};

describe("buildMarkdown", () => {
  it("summarises pictures, plans, behaviour and extraction against the baseline", () => {
    const md = buildMarkdown(base);
    expect(md).toContain("abc1234 vs 9f8e7d6");
    expect(md).toContain("1 of 2 scenes changed");
    expect(md).toContain("| desk-demo-start | 3.2% of pixels |");
    expect(md).toContain("Tabletop moved 10 mm");
    expect(md).toContain("1/1 steps pass");
    expect(md).toContain("Blueprint reading: skipped (no OPENAI_API_KEY)");
  });
  it("says so when there is nothing to compare against", () => {
    expect(buildMarkdown({ ...base, baseline: null })).toContain("No earlier run to compare with");
  });
  it("puts newly failing steps first", () => {
    const md = buildMarkdown({ ...base, scenario: { current: { ok: false, steps: [{ name: "copilot answer", ok: false, ms: 9000, detail: "504" }] }, baseline: base.scenario.baseline } });
    expect(md.indexOf("FAILING: copilot answer")).toBeGreaterThan(-1);
    expect(md.indexOf("FAILING")).toBeLessThan(md.indexOf("Pictures"));
  });
});
```

- [ ] **Step 2: Run them.** `pnpm -F @cutonce/sim test`. Expected: FAIL.

- [ ] **Step 3: Implement with Codex.** Prompt: "Implement `tools/sim/compare.ts`, `tools/sim/types.ts` and `tools/sim/report.ts` so the tests in `tools/sim/tests` pass, following Task 6 of docs/superpowers/plans/2026-09-19-simulation-and-push-reports.md exactly (interfaces, statuses, the 0.05% same threshold, exit code rule). Use pngjs and pixelmatch. The HTML report shows baseline, current and diff images side by side for each scene, with relative paths (`baseline/screens/x.png`, `current/screens/x.png`, `diff/x.png`), and the plan and scenario tables. Don't change the tests." Markdown sections, in order:
  1. failing steps (if any)
  2. the header `## Simulation report · <current sha7> vs <baseline sha7>` (or "No earlier run to compare with")
  3. Behaviour
  4. Pictures (table of changed, new and removed scenes only)
  5. Plans (one line per file: "no change" or "N changed: Tabletop moved 10 mm, …")
  6. Blueprint reading
  7. the footer "Full report with images: artifact `sim-out` → report.html"

- [ ] **Step 4: Run the tests.** Expected: PASS. Add a `CODEX_LOG.md` row.
- [ ] **Step 5: Commit.** `git commit -am "feat(sim): compare runs and write the push report"`

---

### Task 7: `pnpm sim` locally and on every push

**Files:**
- Create: `tools/sim/run.ts`, `tools/sim/fetch-baseline.sh`, `.github/workflows/sim.yml`
- Modify: root `package.json` (script `"sim": "tsx tools/sim/run.ts"`; add root dev dependency `tsx` if it's not already there)

**Interfaces:**
- Consumes: Tasks 5 and 6. Tasks 9 and 10 plug in later: `run.ts` runs a stage only if its script exists.
- Produces:
  - `pnpm sim`: **locally**, moves `sim-out/current` to `sim-out/baseline`, then runs every stage and prints the report path.
  - `pnpm sim --ci`: the same, but leaves `sim-out/baseline` alone (CI downloads it).
  - Flags: `--skip-screens`, `--skip-scenario`.
  - `sim-out/current/meta.json` (`RunMeta`).

- [ ] **Step 1: `run.ts`:**

```ts
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASELINE, CURRENT, OUT, ROOT } from "./paths.js";
import type { RunMeta } from "./types.js";

const args = new Set(process.argv.slice(2));
const ci = args.has("--ci");
const sh = (cmd: string) => execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
const stage = (name: string, cmd: string, optionalFile?: string) => {
  if (optionalFile && !existsSync(join(ROOT, optionalFile))) { console.log(`skip ${name}: ${optionalFile} not built yet`); return true; }
  console.log(`\n▶ ${name}`);
  return spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true }).status === 0;
};

if (!ci) {
  rmSync(BASELINE, { recursive: true, force: true });
  if (existsSync(CURRENT)) renameSync(CURRENT, BASELINE);
}
rmSync(CURRENT, { recursive: true, force: true });
rmSync(join(OUT, "diff"), { recursive: true, force: true });
mkdirSync(CURRENT, { recursive: true });
const meta: RunMeta = { sha: sh("git rev-parse HEAD"), dirty: sh("git status --porcelain") !== "", created_at: new Date().toISOString(), ci };
writeFileSync(join(CURRENT, "meta.json"), JSON.stringify(meta, null, 2));

let ok = true;
// Task 10 adds the blueprint-reading stage here, before the server starts (sim-server imports its output).
if (!args.has("--skip-scenario")) ok = stage("scenario", "pnpm -F @cutonce/api exec tsx src/cli/sim-run.ts --out ../../sim-out/current/scenario.json", "services/api/src/cli/sim-run.ts") && ok;
if (!args.has("--skip-screens")) {
  ok = stage("web build", "pnpm -F @cutonce/web build") && ok;
  ok = stage("photographs", "pnpm -F @cutonce/sim capture") && ok;
}
const reported = stage("report", "pnpm -F @cutonce/sim exec tsx report.ts");
console.log(`\nreport: ${join(OUT, "report.html")}`);
process.exit(ok && reported ? 0 : 1);
```

- [ ] **Step 2: `fetch-baseline.sh`** (used only on GitHub):

```bash
#!/usr/bin/env bash
# Puts the previous push's sim results in sim-out/baseline. Needs GH_TOKEN, GH_REPO, BEFORE, GITHUB_REF_NAME.
set -euo pipefail
mkdir -p sim-out/baseline
run_id=""
if [ -n "${BEFORE:-}" ] && [ "$BEFORE" != "0000000000000000000000000000000000000000" ]; then
  run_id=$(gh run list --workflow sim.yml --commit "$BEFORE" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')
fi
if [ -z "$run_id" ]; then
  run_id=$(gh run list --workflow sim.yml --branch "$GITHUB_REF_NAME" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')
fi
if [ -z "$run_id" ]; then echo "no earlier sim run: this report has no baseline"; exit 0; fi
tmp=$(mktemp -d)
if ! gh run download "$run_id" --name sim-out --dir "$tmp"; then echo "run $run_id has no sim-out artifact"; exit 0; fi
cp -R "$tmp/current/." sim-out/baseline/
echo "baseline: run $run_id"
```

- [ ] **Step 3: `.github/workflows/sim.yml`:**

```yaml
name: sim
on:
  push:
  workflow_dispatch:
permissions:
  contents: read
  actions: read
concurrency:
  group: sim-${{ github.ref }}
  cancel-in-progress: true
jobs:
  sim:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
        with: { lfs: true, fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: sudo apt-get update && sudo apt-get install -y poppler-utils
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @cutonce/sim exec playwright install --with-deps chromium
      - name: Fetch the previous push's results
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          BEFORE: ${{ github.event.before }}
        run: bash tools/sim/fetch-baseline.sh
      - name: Simulate
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: pnpm sim --ci
      - name: Post the report
        if: always()
        run: cat sim-out/report.md >> "$GITHUB_STEP_SUMMARY" || echo "no report was written" >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: sim-out, path: sim-out/, retention-days: 14 }
```

- [ ] **Step 4: Check it locally.** Run `pnpm sim` twice. The second report should say "0 of 7 scenes changed". Then change `MISSING.fillAlpha` in `visual.ts` to `0.3`, run `pnpm gen:fixtures && pnpm sim`, and check that the report lists the desk scenes as changed and `report.html` shows the difference. Revert.
- [ ] **Step 5: Check it on GitHub.** Commit, push, open the run's summary. The first run says "No earlier run". Push again: the second compares with the first. Then turn on the OpenAI key for Phase 4 later: GitHub → Settings → Secrets → Actions → `OPENAI_API_KEY`.
- [ ] **Step 6: Commit.** `git add -A tools/sim .github/workflows/sim.yml package.json pnpm-lock.yaml && git commit -m "ci: simulate on every push and report what changed since the last one"`

---

# Phase 3: Behaviour end to end

### Task 8: Fake copilot, answer log and audio (Codex)

**Files:**
- Modify: `services/api/src/config.ts` (`copilotMode: "off" | "fake" | "live"` from `COPILOT_MODE`, default `off`; `fakeCopilotDelayMs` from `FAKE_COPILOT_DELAY_MS`, default 1200)
- Modify: `services/api/src/routes/health.ts` (add `copilot: cfg.copilotMode`), `services/api/src/app.ts` (`Ctx.turns: TurnLog`), `services/api/src/plugins.ts` (register `turnRoutes`, `fakeCopilotRoutes` before `staticRoutes`), `services/api/src/cli/sim-server.ts` (`copilotMode: "fake", fakeCopilotDelayMs: 0`), `.env.example`
- Create: `services/api/src/turns/wav.ts`, `turns.ts`, `routes.ts`, `fake.ts`, `README.md`
- Test: `services/api/tests/wav.test.ts`, `services/api/tests/fake-copilot.test.ts`

**Interfaces:**
- Produces:
  - `wav.ts`:
    - `SAMPLE_RATE = 22050`
    - `pcmToWav(pcm: Buffer, rate = 22050): Buffer` (canonical 44-byte header, 16-bit mono)
    - `wavToPcm(wav: Buffer): { pcm: Buffer; sampleRate: number }` (throws `/canonical/` on anything else)
    - `tone(seconds: number, rate = 22050, hz = 440): Buffer` (s16le, 10 ms fades, peak about 8000)
  - `class TurnLog(dataDir: string, bus: Bus)`:
    - `newTurnId(): string` (`turn_` + lowercase monotonic ULID)
    - `record(r: CopilotResponse, context?: CopilotContext | null): void` (writes `copilot/turns/<id>/response.json`; broadcasts `{ type: "copilot_turn", turn: r }`)
    - `saveAudio(turnId, pcm): void` (writes `audio.wav`)
    - `get(turnId): CopilotResponse | null`
    - `list(limit = 20): CopilotResponse[]` (newest first)
    - `audioFile(turnId): string | null`

    Malformed IDs throw `badRequest`.
  - Routes (always on):
    - `GET /v1/audio/:turn_id?format=pcm|wav`. PCM is the default, with `content-type: audio/L16; rate=22050; channels=1` and `x-audio-format: s16le; rate=22050; channels=1`. WAV is `audio/wav`. Unknown → 404, malformed → 400.
    - `GET /v1/copilot/turns?limit=` → `{ turns }`
  - Fake (only when `COPILOT_MODE=fake`): `POST /v1/assemblies/:aid/copilot/query`, multipart `context` (JSON, validated with `S.CopilotContext`), `audio` and `frame` (read and ignored). Behaviour:
    - bad or missing context → 400 with the schema issues
    - `context.assembly_id` ≠ `:aid` → 400
    - unknown run → 404
    - `scripted_query_id === "fake_error"` → 500 `fake_error`
    - `"fake_slow"` → waits 10 s (tests the headset's 9 s cap by hand)
    - `"fake_done"` with a selection → `action: { type: "mark_state", part_ids: [sel], new_state: "built", source: "voice" }`
    - no or unknown selection → `needs_clarification: true`, "Point at a part and ask again."
    - otherwise the answer is `"<Part name>: step <index>, <step title>."`, `highlight_parts: [sel]`, `highlight_style` `path` for `kind: "cable"` else `pulse`, `drawing_refs` from the part's `doc_refs` (title = `sheet_id ?? document_id`), and `transcript: "[fake] no speech recognition in fake mode"`

    Every answer gets a tone of `clamp(words × 0.3, 1, 4)` seconds saved as its audio, `audio_url: /v1/audio/<turn_id>`, is recorded in the log, and is returned after `fakeCopilotDelayMs`.
  - `README.md` for Rhythm: the real copilot registers its route only when `COPILOT_MODE=live`, calls `ctx.turns.record()` and `saveAudio()`, and never re-registers `GET /v1/audio/:turn_id` (it may extend it for streaming).

- [ ] **Step 1: Write the failing tests.**

`services/api/tests/wav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SAMPLE_RATE, pcmToWav, tone, wavToPcm } from "../src/turns/wav.js";

describe("wav", () => {
  it("writes a canonical 44-byte header", () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(52);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(44);
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect([wav.readUInt32LE(16), wav.readUInt16LE(20), wav.readUInt16LE(22)]).toEqual([16, 1, 1]);
    expect([wav.readUInt32LE(24), wav.readUInt32LE(28), wav.readUInt16LE(32), wav.readUInt16LE(34)]).toEqual([SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16]);
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.subarray(44)).toEqual(pcm);
  });
  it("round-trips and rejects anything else", () => {
    const pcm = tone(0.5);
    expect(wavToPcm(pcmToWav(pcm, 16000))).toEqual({ pcm, sampleRate: 16000 });
    expect(() => wavToPcm(Buffer.from("definitely not a wav file, not even close"))).toThrow(/canonical/);
    const stereo = pcmToWav(Buffer.alloc(8)); stereo.writeUInt16LE(2, 22);
    expect(() => wavToPcm(stereo)).toThrow(/canonical/);
  });
  it("makes a tone that starts silent and is audible", () => {
    const pcm = tone(1);
    expect(pcm.length).toBe(SAMPLE_RATE * 2);
    expect(pcm.readInt16LE(0)).toBe(0);
    let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    expect(peak).toBeGreaterThan(5000);
  });
});
```

`services/api/tests/fake-copilot.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { Strict } from "@cutonce/schemas";
import { wavToPcm } from "../src/turns/wav.js";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => { await t?.cleanup(); t = undefined; });
const fake = async () => (t = await makeApp({ copilotMode: "fake", fakeCopilotDelayMs: 0 }));

function form(context: unknown) {
  const b = "----cutonce" + Math.random().toString(16).slice(2);
  const file = (name: string, bytes: Buffer) => [Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from("\r\n")];
  const payload = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="context"\r\n\r\n${typeof context === "string" ? context : JSON.stringify(context)}\r\n`),
    ...file("audio", Buffer.from("RIFF")), ...file("frame", Buffer.from([0xff, 0xd8])), Buffer.from(`--${b}--\r\n`),
  ]);
  return { payload, headers: { ...auth, "content-type": `multipart/form-data; boundary=${b}` } };
}
const packet = (aid: string, over: Record<string, unknown> = {}) => ({
  context_id: "ctx_test_1", assembly_id: aid, plan_revision: 1, state_version: 3, mode: "overlay",
  selected_part_id: "part_left_rear_leg", selection_source: "controller_ray", current_step_id: "step_04",
  visible_parts: [], camera: null, scripted_query_id: null, client_sent_at: new Date().toISOString(), ...over,
});
const ask = (aid: string, context: unknown) => t!.app.inject({ method: "POST", url: `/v1/assemblies/${aid}/copilot/query`, ...form(context) });
const aidOf = () => t!.app.ctx.store.currentAssembly()!.assembly_id;

describe("fake copilot", () => {
  it("is off unless COPILOT_MODE=fake", async () => {
    t = await makeApp();
    expect((await ask(aidOf(), packet(aidOf()))).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: "/health" })).json().copilot).toBe("off");
  });

  it("answers about the selected part with a valid response, a logged turn and playable audio", async () => {
    await fake();
    const r = await ask(aidOf(), packet(aidOf()));
    expect(r.statusCode).toBe(200);
    const body = Strict.CopilotResponse.parse(r.json());
    expect(body.highlight_parts).toEqual(["part_left_rear_leg"]);
    expect(body.answer_text).toMatch(/Left rear leg/);
    expect(body.drawing_refs.length).toBeGreaterThan(0);
    expect(body.audio_url).toBe(`/v1/audio/${body.turn_id}`);
    const pcm = await t!.app.inject({ method: "GET", url: body.audio_url!, headers: auth });
    expect(pcm.headers["content-type"]).toMatch(/^audio\/L16; rate=22050/);
    expect(pcm.rawPayload.length).toBeGreaterThanOrEqual(22050 * 2);
    const wav = await t!.app.inject({ method: "GET", url: `${body.audio_url}?format=wav`, headers: auth });
    expect(wavToPcm(wav.rawPayload).pcm.length).toBe(pcm.rawPayload.length);
    const turns = (await t!.app.inject({ method: "GET", url: "/v1/copilot/turns", headers: auth })).json().turns;
    expect(turns[0].turn_id).toBe(body.turn_id);
  });

  it("draws cables as a path and asks for a selection when there is none", async () => {
    await fake();
    expect((await ask(aidOf(), packet(aidOf(), { selected_part_id: "part_power_cable" }))).json().highlight_style).toBe("path");
    const none = (await ask(aidOf(), packet(aidOf(), { selected_part_id: null, selection_source: "none" }))).json();
    expect(none).toMatchObject({ needs_clarification: true, highlight_parts: [] });
  });

  it("returns an action for fake_done and a 500 for fake_error", async () => {
    await fake();
    expect((await ask(aidOf(), packet(aidOf(), { scripted_query_id: "fake_done" }))).json().action)
      .toEqual({ type: "mark_state", part_ids: ["part_left_rear_leg"], new_state: "built", source: "voice" });
    const err = await ask(aidOf(), packet(aidOf(), { scripted_query_id: "fake_error" }));
    expect([err.statusCode, err.json().error.code]).toEqual([500, "fake_error"]);
  });

  it("rejects bad packets clearly", async () => {
    await fake();
    expect((await ask(aidOf(), "{not json")).statusCode).toBe(400);
    const bad = await ask(aidOf(), { ...packet(aidOf()), assembly_id: undefined });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.details).toBeDefined();
    expect((await ask(aidOf(), packet("asm_someone_else"))).statusCode).toBe(400);
    expect((await ask("asm_nope", packet("asm_nope"))).statusCode).toBe(404);
    expect((await t!.app.inject({ method: "GET", url: "/v1/audio/turn_BAD", headers: auth })).statusCode).toBe(400);
    expect((await t!.app.inject({ method: "GET", url: "/v1/audio/turn_missing", headers: auth })).statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run them.** `pnpm -F @cutonce/api test -- wav fake`. Expected: FAIL.
- [ ] **Step 3: Implement with Codex.** Prompt: "Implement Task 8 of docs/superpowers/plans/2026-09-19-simulation-and-push-reports.md (the Files and Interfaces blocks are binding) so `tests/wav.test.ts` and `tests/fake-copilot.test.ts` pass and every existing test still passes. Follow the codebase's patterns: `writeJsonAtomic` for JSON, write-temp-then-rename for audio, `ApiError`/`badRequest`/`notFound` for errors, plugins as `(app, ctx) => void`. Read multipart with `for await (const part of req.parts())`, draining file parts with `toBuffer()`. Use `monotonicFactory` from `ulid` for turn IDs. Add `COPILOT_MODE=off` and `FAKE_COPILOT_DELAY_MS=1200` to `.env.example` with a one-line comment." Review every file.
- [ ] **Step 4: Run all tests and typecheck.** Expected: PASS. Add a `CODEX_LOG.md` row.
- [ ] **Step 5: Commit.** `git commit -am "feat(api): answer log, audio serving and a fake copilot for simulations"`

---

### Task 9: The pretend headset walks the golden path (Codex)

**Files:**
- Create: `services/api/src/sim/scenario.ts`, `services/api/src/cli/sim-run.ts`
- Test: `services/api/tests/scenario.test.ts`

**Interfaces:**
- Consumes: the running API (any base URL), `COPILOT_MODE=fake` (Task 8), Node 22's global `WebSocket`.
- Produces:
  - `runScenario(base: string, token: string): Promise<ScenarioResult>`, with the same JSON shape as `tools/sim/types.ts` `ScenarioResult`. Each step is `{ name, ok, ms, detail? }`, and a failed step records its error and the run carries on, so one report shows every break.
  - `sim-run.ts --out <file> [--base <url> --token <t>]`: without `--base`, it starts an in-process app (temp data, fake copilot, delay 0) on a random port. With `--base`, it tests a real server, such as your laptop's tunnel. It writes the result and exits 1 if any step failed.

Steps, in order (names are the report keys; never rename them):
1. `health`: `GET /health` ok. Report `copilot` in `detail`.
2. `new run`: `POST /v1/director/command {type:"new_run", seed:"demo_start"}` → an assembly.
3. `stream connect`: WebSocket `/v1/stream?token=…&client=quest&id=sim` receives `assembly_changed` for that run within 2 s.
4. `mark built`: POST the first of `state.available_part_ids` as `built` → 201. `ms` = until the stream delivers `event_appended` for it (the latency the headset would feel).
5. `idempotent retry`: the same event again → 200, same version.
6. `no-op rejected`: the same state change with a new event ID → 409 `no_op`.
7. `history`: `GET state?version=<v-1>` shows that part `missing`; `GET state` shows it `built`.
8. `copilot answer`: fake query about `part_power_cable` → 200, every `highlight_parts` ID exists in the plan, `audio_url` returns ≥ 1 s of PCM.
9. `copilot clarifies`: a query with no selection → `needs_clarification`.
10. `voice command`: `scripted_query_id: "fake_done"` → the action names the selected part.
11. `director force`: `force_state` on `part_rear_crossbar` `wrong` → the stream shows it.

- [ ] **Step 1: Write the failing test** `services/api/tests/scenario.test.ts`:

```ts
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { runScenario } from "../src/sim/scenario.js";
import { TOKEN, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => { await t?.cleanup(); });

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
  ]);
  expect(result.ok).toBe(true);
}, 30_000);

it("reports a broken server as failed steps instead of throwing", async () => {
  const result = await runScenario("http://127.0.0.1:9", "nope");
  expect(result.ok).toBe(false);
  expect(result.steps[0]).toMatchObject({ name: "health", ok: false });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement with Codex.** Prompt: "Implement `services/api/src/sim/scenario.ts` and `src/cli/sim-run.ts` per Task 9 of docs/superpowers/plans/2026-09-19-simulation-and-push-reports.md so `tests/scenario.test.ts` passes. Use `fetch`, `FormData` and `Blob`, and Node's global `WebSocket`, with no new dependencies. Each step is wrapped in a helper that times it, catches errors into `{ ok: false, detail }` and continues. A step whose prerequisite failed is recorded as `{ ok: false, detail: "skipped: <which> failed" }`. Build copilot packets exactly like `tests/fake-copilot.test.ts` does." Review every file.
- [ ] **Step 4: Run tests, then the whole loop.** `pnpm -F @cutonce/api test`, then `pnpm sim`. The report now has a Behaviour section with 11/11 passing. Add a `CODEX_LOG.md` row.
- [ ] **Step 5: Test your real server the same way.** With `pnpm serve:local` running: `pnpm -F @cutonce/api exec tsx src/cli/sim-run.ts --base http://127.0.0.1:8080 --token <your API_TOKEN> --out /tmp/real.json`. Expect everything to pass except the copilot steps, unless that server also runs with `COPILOT_MODE=fake`.
- [ ] **Step 6: Commit.** `git commit -am "feat(sim): scripted headset runs the golden path on every push"`

---

# Phase 4: After reading blueprints

### Task 10: The AI-read desk on every push that has the key

**Files:**
- Modify: `services/api/src/cli/extract-eval.ts` (accept `--plan-out <file>`)
- Modify: `tools/sim/run.ts` (new first stage), `tools/sim/report.ts` (fill `extraction`)

**Interfaces:**
- Consumes: `extractPlan`, `draftToPlan` (existing), `diffPlans` (Task 4), the `extracted-vs-known` scene (Task 5 adds it when the file exists), `sim-server` importing it as `plan_desk_extracted` (Task 5).
- Produces:
  - `sim-out/current/extracted.plan.json`, and `extraction` in the report: parts within 5 mm / total, the worst three parts with their mm error, added and missing parts.
  - When there's no key or no drawing: `extraction.skipped = "no OPENAI_API_KEY"` or `"no data/demo/docs/desk-drawings.pdf yet"`.

- [ ] **Step 1: `extract-eval.ts`.** After `const { plan, issues } = draftToPlan(…)`, add:

```ts
const outIdx = process.argv.indexOf("--plan-out");
if (outIdx > 0 && process.argv[outIdx + 1]) {
  const out = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[outIdx + 1]!);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(`wrote the extracted plan to ${out}`);
}
```

(Import `mkdirSync`, `writeFileSync` and `dirname`. The usage line becomes `pnpm extract:eval <drawing.pdf> [--plan-out <file>]`.)

- [ ] **Step 2: `run.ts`,** before the scenario stage:

```ts
const drawing = "data/demo/docs/desk-drawings.pdf";
if (process.env.OPENAI_API_KEY && existsSync(join(ROOT, drawing))) {
  stage("blueprint reading", `pnpm extract:eval ${drawing} --plan-out sim-out/current/extracted.plan.json`);
} else {
  writeFileSync(join(CURRENT, "extraction-skipped.txt"), process.env.OPENAI_API_KEY ? `no ${drawing} yet` : "no OPENAI_API_KEY");
}
```

- [ ] **Step 3: `report.ts`.**
  - If `current/extracted.plan.json` exists: `extraction.diff = diffPlans(knownGood, extracted)`, where `knownGood` is `data/demo/desk.plan.json`.
  - Otherwise: `extraction.skipped` = the text of `extraction-skipped.txt`.
  - In Markdown: "Blueprint reading: 7/9 parts within 5 mm; worst: Cable tray 23 mm off, Power strip 11 mm; missing: Power cable".
  - When the baseline also has an extracted plan, add "(was 6/9)". Add a test case for this line in `tests/report.test.ts` before implementing it.
- [ ] **Step 4: Check it.** With your key in `.env.local` and the desk drawing made (the Platform plan's Task 10), run `pnpm sim`. Open `report.html`: the `extracted-vs-known` picture shows the AI-read ghost against the white known-good outline, and the table lists each part's error.
- [ ] **Step 5: Commit.** `git commit -am "feat(sim): read the desk drawing on every push and show the error per part"`

---

# Phase 5: Drive it yourself

### Task 11: `/sim`, a pretend headset in the browser (Codex)

**Files:**
- Create: `apps/web/src/sim/SimPage.tsx`, `apps/web/src/sim/contextPacket.ts`, `apps/web/src/sim/micWav.ts`, `apps/web/src/sim/frameGrab.ts`
- Modify: `apps/web/src/App.tsx` (route `/sim`), `apps/web/src/api.ts` (`askCopilot(aid, context, wav, jpeg)`, `postEvent(aid, event)`, `fetchAudioBlob(url)`)
- Test: `apps/web/src/sim/contextPacket.test.ts`

**Interfaces:**
- Consumes: `<HologramView>` (Task 3) with `onPoint` and `cameraRef`; `resolveVisuals`, `partAabb`; the fake or real copilot endpoint; `useStream`.
- Produces:
  - `projectBox(camera: THREE.PerspectiveCamera, box: Aabb, width: number, height: number): { bbox_px: [number, number, number, number]; in_frame: number; distance_m: number } | null`. It projects the 8 corners; `in_frame` is the share of the box's screen rectangle inside the frame; null if the box is behind the camera.
  - `buildContextPacket(args: { assemblyId; planRevision; stateVersion; selected: string | null; currentStepId: string | null; parts: { part_id; state; box: Aabb }[]; camera; width: 1280; height: 960; scriptedQueryId?: string | null }): CopilotContext`. It drops parts with `in_frame < 0.05`, and fills `camera` intrinsics from the three.js camera (`fy = height / 2 / tan(fov/2)`, `fx = fy`, `cx = width/2`, `cy = height/2`). The fields the arguments don't cover are filled like this:
    - `context_id`: `ctx_` + 12 random lowercase hex characters
    - `mode`: `"overlay"`
    - `selection_source`: `"controller_ray"` when something is selected, else `"none"`
    - `scripted_query_id`: the argument, or null
    - `client_sent_at`: now, as ISO 8601

Controls:

| Key or input | Does | Quest equivalent |
|---|---|---|
| Mouse move | Pointing ray (`onPoint`) | Controller ray |
| B | Mark the pointed part built | B button |
| W | Mark it wrong | Operator panel |
| Hold Space | Record from the laptop mic (16 kHz mono WAV); on release, grab the frame and ask | Hold A |
| 1 / 2 / 3 | Ask scripted questions q1–q3 with no audio | HUD query buttons |
| F | Frame source: webcam, the hologram render, or a still photo | Passthrough camera |

The answer card shows the transcript, the answer and a source chip. The audio plays as WAV (`?format=wav`), and `highlight_parts` pulse for 6 s. The page follows the stream, so a force-state from `/director` appears within a second.

- [ ] **Step 1: Write the failing test** `apps/web/src/sim/contextPacket.test.ts`:

```ts
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Strict } from "@cutonce/schemas";
import { buildContextPacket, projectBox } from "./contextPacket";

const cam = () => {
  const c = new THREE.PerspectiveCamera(90, 1280 / 960, 0.01, 100);
  c.position.set(0, 0, 2); c.lookAt(0, 0, 0); c.updateMatrixWorld(); c.updateProjectionMatrix();
  return c;
};

describe("projectBox", () => {
  it("puts a centred box in the middle of the frame", () => {
    const p = projectBox(cam(), { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] }, 1280, 960)!;
    const [x, y, w, h] = p.bbox_px;
    expect(x + w / 2).toBeCloseTo(640, 0);
    expect(y + h / 2).toBeCloseTo(480, 0);
    expect(p.in_frame).toBe(1);
    expect(p.distance_m).toBeCloseTo(2, 1);
  });
  it("returns null for a box behind the camera and a partial share at the edge", () => {
    expect(projectBox(cam(), { min: [-0.1, -0.1, 2.5], max: [0.1, 0.1, 2.7] }, 1280, 960)).toBeNull();
    const edge = projectBox(cam(), { min: [2.3, -0.1, -0.1], max: [2.9, 0.1, 0.1] }, 1280, 960)!;
    expect(edge.in_frame).toBeGreaterThan(0);
    expect(edge.in_frame).toBeLessThan(1);
  });
});

describe("buildContextPacket", () => {
  it("builds a packet the server's schema accepts", () => {
    const packet = buildContextPacket({
      assemblyId: "asm_demo_1", planRevision: 1, stateVersion: 3, selected: "part_a", currentStepId: "step_04",
      parts: [
        { part_id: "part_a", state: "missing", box: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] } },
        { part_id: "part_b", state: "built", box: { min: [-0.1, -0.1, 2.5], max: [0.1, 0.1, 2.7] } },
      ],
      camera: cam(), width: 1280, height: 960,
    });
    expect(Strict.CopilotContext.parse(packet).visible_parts.map((v) => v.part_id)).toEqual(["part_a"]);
    expect(packet.camera!.cx).toBe(640);
  });
});
```

- [ ] **Step 2: Run it.** `pnpm -F @cutonce/web test`. Expected: FAIL.
- [ ] **Step 3: Implement with Codex.** Prompt: "Implement Task 11 of docs/superpowers/plans/2026-09-19-simulation-and-push-reports.md. First make `apps/web/src/sim/contextPacket.test.ts` pass. Then build `SimPage.tsx` with the controls table, reusing `<HologramView>` and the web app's `api.ts` and `ws.ts`. `micWav.ts` records with an `AudioContext({ sampleRate: 16000 })` and returns a 16-bit mono WAV. `frameGrab.ts` returns a 1280×960 JPEG (quality 0.75) from the webcam, the WebGL canvas, or `/v1/…` page image. Never hard-code hologram colours." Review every file.
- [ ] **Step 4: Check it by hand** with `COPILOT_MODE=fake` in `.env.local` and `pnpm serve:local`:
  1. Open `/sim` and `/director` side by side.
  2. Point at the left rear leg and press B: both pages show it built within a second.
  3. Hold Space, say anything, release: an answer card appears, the leg pulses, and a tone plays.
  4. Force the crossbar wrong on `/director`: it turns red in `/sim`.
  5. Press F until the webcam shows.

  Add a `CODEX_LOG.md` row.
- [ ] **Step 5: Add one scene** to `tools/sim/scenes.ts`, at the end: `{ name: "sim-idle", url: "/sim?still=1&frame=render", note: "The pretend headset at rest" }`. `/sim` sets `__previewReady` like `/preview` does.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): /sim, a pretend headset driven by mouse, keyboard, mic and webcam"`

---

## What this plan leaves out, on purpose

- **Unity.** Building the Quest app on GitHub would need a Unity licence and 20+ minutes a push. Jerry and Henry check their C# against the same fixtures and the same palette file in the Editor.
- **Elasticsearch and the real copilot in CI.** They need keys and live services. `sim-run --base <url>` tests them against your laptop server instead.
- **Blocking on visual changes.** Pictures change whenever the look improves. The report shows them; a person decides.
- **Streaming audio.** The fake answer's audio is complete before it's served. When Rhythm streams ElevenLabs, she extends `GET /v1/audio/:turn_id` (see `services/api/src/turns/README.md`).

## Self-review

- **Coverage of the ask:**
  - seeing the hologram look → Tasks 1 and 3
  - seeing it after blueprint processing → Task 10 plus the `extracted-vs-known` scene
  - simulating end to end → Tasks 8, 9 and 11
  - push-to-push impact → Tasks 4–7 (pictures, plans), 9 (behaviour) and 10 (extraction)
- **Names used across tasks,** each defined once: `resolveVisuals`, `styleFor`, `stateForBuilt`, `HOLOGRAM_PALETTE` (Task 1); `diffPlans`, `PlanDiff` (4); `ROOT`, `CURRENT`, `BASELINE`, `SIM_PORT`, `SIM_TOKEN`, `scenes()` (5); `RunMeta`, `ScenarioResult`, `ScreenResult`, `ReportInput`, `compareImages`, `compareScreens`, `buildMarkdown` (6); `TurnLog`, `pcmToWav`, `wavToPcm`, `tone` (8); `runScenario` (9); `projectBox`, `buildContextPacket` (11).
- **Order dependencies:**
  - Task 5's `sim-server` gains `copilotMode` in Task 8, so Task 5 doesn't pass it.
  - Task 7's `run.ts` skips the scenario stage until Task 9 exists, and Task 10 adds its stage before the scenario.
  - The `extracted-vs-known` scene appears only when Task 10 has produced a file.
