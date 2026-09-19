# Build Mode (Lego Movie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Say "What can I build?", and the Quest scans the room, names every object with its size, offers three designs built from those exact objects, flies their hologram copies into place, and walks you through the build step by step.

**Architecture:** The headset only captures and shows. It casts a 128 × 96 grid of depth rays through the pixels of one passthrough photo, then uploads the points and the photo. The server does the thinking: it finds surfaces and objects (the twins), names them with one vision call, and fixes their sizes. It then turns rule-table designs and AI designs into exact positions, checks that they won't tip, and makes each one a normal Cut Once plan that passes `validatePlan`. Picking a design starts a normal run. The headset locks the hologram where the server says, flies each twin into its ghost, and the existing step engine takes over.

**Tech Stack:** Node 22, Fastify 5, zod 3, vitest 2, `openai` 7 (chat completions + strict JSON schema via `services/api/src/llm.ts`), sharp; Unity 6000.6.2f1, Meta XR Core + MRUK 205, URP, NUnit (`pnpm quest:core-test` runs Core and Net under dotnet).

**Spec:** Claude Doc "Cut Once: Build Mode (Lego Movie) — PRD and technical design" (https://claude.ai/code/artifact/5755f70f-db08-43ef-90ba-614c3206dc42), as corrected by the **Decisions** table below, plus `apps/quest/AGENTS.md`.

## Global Constraints

- **Frames:** plans and everything on the server are right-handed, +Y up, metres. Unity is left-handed. The only conversion is X-mirroring: `AR/ModelSpace` on the way in, `ScanEncoder.HitUnity` / `PlanFromUnity` on the way out.
- **Every build design must pass `validatePlan` with zero errors.** Orientation is expressed by reordering a box's `size` or setting a cylinder's `axis`. **Never write `rotation_quat` in a build plan**: `packages/project-model/src/geometry.ts` ignores rotation.
- **Solver touch tolerance is 2 mm**, the same as `TOUCH_TOLERANCE` in `validate.ts`.
- **Cylinders are placed upright only.** A can on its side rolls.
- **Live scans stay under `cfg.dataDir`** (`data/runtime/build/…`, git-ignored). Commit only kit-pile recordings with no people in the photo, under `data/build/recordings/`: the repo is public.
- **Models:** `OPENAI_ROUTER_MODEL`, `OPENAI_LABEL_MODEL` and `OPENAI_IDEAS_MODEL` each default to `OPENAI_MODEL` (`gpt-5.6-luna`). OpenAI only.
- **No new npm or Unity packages.**
- **Unity 6000.6.2f1 exactly. Commit every `.meta` file**, including those of new folders.
- **Do not edit `apps/quest/Assets/CutOnce/Copilot/`** (Rhythm's). Build mode calls it; it never changes it.
- **Headset code follows AGENTS rules 1–10:** no allocation in `Update`, UnityWebRequest only, and permissions at runtime.
- **E7 and desk flows are unchanged while build mode is off** (FR13). `pnpm test`, `pnpm typecheck` and `pnpm quest:core-test` stay green after every task.
- Server tests: `pnpm -F @cutonce/api test`. Schemas: `pnpm -F @cutonce/schemas test`. Types: `pnpm typecheck`.

## Decisions (what this plan changes from doc rev 19, and why)

| # | Doc rev 19 | This plan | Why |
|---|---|---|---|
| D1 | Picking an idea starts a run; "the existing engine takes over" | Each idea carries `origin` (the design's pose in the room). The headset calls a new `AlignmentController.LockAt(pose)` when that run loads | On a new run the headset rebuilds the hologram at the *old* locked pose (`CutOnceApp.cs:128-141`), or asks the operator to place it (`AlignmentController.cs:38-58`) |
| D2 | "Turns of 0° or 90° pass the checker" | Orientation is set by `size` order and cylinder `axis`, and `rotation_quat` is never written | `partAabb` ignores `rotation_quat` (`geometry.ts:6-27`), so any turn gives false overlap and "floats" errors, and approval fails with a 409 |
| D3 | 64 × 48 rays; points grouped on a 1 cm grid | 128 × 96 rays through the photo's pixels (an organised cloud), spread over frames; points grouped by grid neighbours within `max(3 cm, 2.5 × ray spacing)` | 64 × 48 over the camera's 74° × 59° view is one ray per 2 cm at 1 m, too coarse for ±2 cm. A 1 cm grid leaves every ray in its own cell |
| D4 | Rapier drop test, 3 nudged runs | Static stability check. Where the weight lands must be inside what holds it, with a margin of `max(1 cm, size error)` | Parts only sit flat, at 0° or 90°, so tipping is the only way to fail. This check is exact and deterministic, gives a named reason for the repair round, and adds no dependency |
| D5 | Solver: tops of several supports must match within 5 mm | 2 mm | `validatePlan` V4 rejects a gap over 2 mm |
| D6 | Surfaces found by random plane fitting with a seed | Height histogram of points facing up, then grid-connected regions of at least 60 points and 45 cm × 45 cm | Needs no randomness, and the size limit stops a box top being mistaken for a table |
| D7 | Six router flows | `question`, `build_ideas`, `modify_design`. "What can I build?", "done", "next", "back" and "undo" stay in the instant fast path. Router timeout or error means `question`; confidence under 0.7 asks back | `build_step` was already the fast path, `rescan` is `build_ideas`, and `other` is `question`. Fewer classes are more accurate, and the rehearsed line never depends on a model |
| D8 | Ideas arrive together after the AI call | Rule-table ideas go out the moment labels land (`final: false`); AI ideas follow (`final: true`, with the spoken summary) | Rules need no AI call, so the demo pile never waits on a slow model |
| D9 | Cache keyed on names and sizes, storing plans | Cache stores the AI's placement steps under canonical ids (`c1…`), keyed on names and sizes. A hit is remapped to the new scan's ids and solved again | A cached plan would point at the old scan's object ids and room positions |
| D10 | "Replay the recorded scan" as a headset fallback | Replays run on the server and show on `/director` and in the Editor. In front of judges they are shown on the laptop, and we say so | A replayed scan's twins sit where that pile was when it was recorded, not on today's table |
| D11 | FR3 look-around is P1, but the 0:25 beat needs it | P0: trigger on empty space scans that view too and merges it into the room map. Continuous 2 Hz scanning stays P1 | The demo beat works with P0 work |
| D12 | "Done" or **A** marks the step | "Done" (voice) or **B** with nothing pointed at | A is push-to-talk (`QuestPushToTalk`) |
| D13 | Voice reads each step (listed as reuse) | New: `POST /v1/build/say`, using the copilot's voice through a `ctx.hooks.say` hook | No step narration exists today |
| D14 | Spatial-data permission requested at startup | Plus `sceneSupport` in `QuestSetup.cs` and its check, so the manifest declares `com.oculus.permission.USE_SCENE` | Without the manifest entry the runtime request can't succeed |
| D15 | Elastic: past scans in Elasticsearch | Not in build mode. The Elastic demo uses the existing hybrid search with reranking over E7's drawings | No build requirement uses Elasticsearch, and the doc makes it optional |

## File map

**Server**

| File | Responsibility |
|---|---|
| `packages/schemas/src/ids.ts` | `BuildSessionId`, `ScanId`, `IdeaId` |
| `packages/schemas/src/factory.ts` | Build contracts; `CopilotContext.mode` gains `build`; `CopilotAction` gains `start_scan`; `WsMessage` gains `build_inventory` and `build_ideas` |
| `data/build/vocabulary.json`, `data/build/rules.json`, `data/build/router-eval.json` | Object names and standard sizes, design rules, router test phrases |
| `data/fixtures/build/ws_build_ideas.json` | One message both TypeScript and C# must parse |
| `services/api/src/build/files.ts` | Disk layout for scans, labels, sessions and recordings |
| `services/api/src/build/data.ts` | Loads and validates vocabulary and rules; standard shapes |
| `services/api/src/build/shape.ts` | Shape helpers: height, half extents, volume, text |
| `services/api/src/build/twins.ts` | Organised point cloud to surfaces and twins (pure) |
| `services/api/src/build/merge.ts` | Merges surfaces and twins across scans (pure) |
| `services/api/src/build/sizes.ts` | Snaps to standard sizes; identical objects share one size (pure) |
| `services/api/src/build/poly.ts` | 2D polygons: clip, hull, margin (pure) |
| `services/api/src/build/solver.ts` | Placement steps to exact poses (pure) |
| `services/api/src/build/stability.ts` | Static tipping check (pure) |
| `services/api/src/build/site.ts` | Where the design goes in the room (pure) |
| `services/api/src/build/plan.ts` | Solved design to a Cut Once `Plan` (pure) |
| `services/api/src/build/rules.ts` | Binds rule roles to twins (pure) |
| `services/api/src/build/label.ts` | One vision call: names, split, drop, missed |
| `services/api/src/build/ideas.ts` | Rules first, then AI, repair, cache, rank, summary |
| `services/api/src/build/session.ts` | One build session: scans in, inventory and ideas out, start a run |
| `services/api/src/build/routes.ts` | `/v1/build/*` routes; sets `ctx.hooks.build` |
| `services/api/src/copilot/router.ts` | The small-model flow router |
| `services/api/src/copilot/fastpath.ts`, `pipeline.ts`, `models.ts`, `prompt.ts`, `annotate.ts`, `routes.ts` | Build phrases, step "done", router wiring, `build` mode, neutral mark colour, `say` hook |
| `services/api/src/app.ts`, `plugins.ts` | `Hooks.say` and `Hooks.build`; register `buildRoutes` |
| `services/api/src/cli/build-eval.ts`, `build-record.ts` | `pnpm build:eval`, `pnpm build:record` |
| `apps/web/src/api.ts`, `apps/web/src/director/BuildPanel.tsx`, `DirectorPage.tsx` | Director controls: replay, add object, start idea |

**Headset** (`apps/quest/Assets/CutOnce/…`)

| File | Responsibility |
|---|---|
| `Editor/QuestSetup.cs`, `Editor/QuestChecks.cs`, `Device/QuestPermissions.cs` | Spatial-data permission |
| `Core/Build/BuildDtos.cs`, `Core/Model/EventDtos.cs` | C# mirror of the contracts |
| `Core/Build/ScanEncoder.cs`, `Core/Build/BuildFlow.cs`, `Core/Build/FlyPath.cs` | Pure: grid encoding, build-mode states, flight maths |
| `Net/SyncEngine.cs`, `Net/ApiClient.cs` | `BuildMessage` event; scan upload, start, say |
| `AR/Alignment/AlignmentController.cs` | `LockAt(Pose, method)` |
| `UI/WorldLabel.cs` | A floating label that faces you |
| `Device/Build/BuildScanCapture.cs`, `TwinOverlay.cs`, `IdeaPreviews.cs`, `FlyTogether.cs`, `BuildMode.cs` | Capture, outlines and labels, three previews, the fly-together, the composition |
| `Device/CutOnceApp.cs` | Wires build mode in |

## Order and owners

Server tasks S1–S13 run in order. Headset tasks H1–H8 run in parallel with them after S1, and H3's upload needs S2. **M1** comes when H3 and S2 are done: one real scan is saved on the laptop. **M2** is S8 (labelled inventory on recordings). **M3** is S9 and S10 (three checked ideas per recorded pile). **M4** is H7 and S11 (end to end on the headset).

---

### Task S1: Build contracts

**Files:**
- Modify: `packages/schemas/src/ids.ts`
- Modify: `packages/schemas/src/factory.ts` (copilot section around lines 167-180; `WsMessage` around line 216; return object)
- Modify: `packages/schemas/src/index.ts` (types)
- Modify: `packages/schemas/scripts/export-jsonschema.ts` (`names`)
- Create: `data/fixtures/build/ws_build_ideas.json`
- Test: `packages/schemas/tests/schemas.test.ts`

**Interfaces:**
- Produces: `S.BuildScanUpload`, `S.BuildScan`, `S.TwinShape`, `S.TwinMaterial`, `S.Surface`, `S.Twin`, `S.Inventory`, `S.Orientation`, `S.PlaceStep`, `S.IdeaDraft`, `S.BuildIdea` (and `Strict.*`); types `BuildScanUpload, BuildScan, TwinShape, Surface, Twin, Inventory, Orientation, PlaceStep, IdeaDraft, BuildIdea`; ids `BuildSessionId` (`bsess_…`), `ScanId` (`scan_…`), `IdeaId` (`idea_…`); `CopilotContext.mode` ∈ `upload | overlay | build`; `CopilotAction` `{ type: "start_scan" }`; `WsMessage` `build_inventory { inventory }` and `build_ideas { session_id, ideas, final, audio_url, message }`.

- [ ] **Step 1: Write the fixture** `data/fixtures/build/ws_build_ideas.json`:

```json
{
  "type": "build_ideas",
  "session_id": "bsess_fixture",
  "final": true,
  "audio_url": null,
  "message": "I found a tall can. You could build a can on a stage.",
  "ideas": [
    {
      "idea_id": "idea_fixture",
      "session_id": "bsess_fixture",
      "source": "rule",
      "rule_id": "rule_fixture",
      "title": "Can on a stage",
      "why": "Fixture: one can on the build area.",
      "tools": [],
      "origin": { "position": [0.1, 0.74, 0.5], "rotation_quat": [0, 0.3826834, 0, 0.9238795] },
      "twin_of": { "part_o1": "o1" },
      "score": 101,
      "plan": {
        "plan_id": "plan_build_fixture",
        "project_id": "proj_cutonce_demo",
        "name": "Can on a stage",
        "revision": 1,
        "status": "draft",
        "frame": { "handedness": "right", "up": "+Y", "units": "m", "pose": "design", "origin": "centre of the build area, on the table" },
        "layers": ["build"],
        "parts": [
          { "part_id": "part_surface", "name": "Build area", "aliases": ["table", "build area"], "kind": "surface", "layer": "build",
            "shape": { "type": "box", "size": [0.166, 0.005, 0.166] }, "position": [0, -0.0025, 0],
            "material_id": "mat_surface", "step_id": "step_01", "rests_on": [], "attaches_to": [],
            "verify_hint": "the table under the outline is clear", "install_minutes": 0.2, "doc_refs": [] },
          { "part_id": "part_o1", "name": "tall can", "aliases": ["tall can", "tall can"], "kind": "tall_can", "layer": "build",
            "shape": { "type": "cylinder", "axis": "y", "diameter": 0.066, "length": 0.157 }, "position": [0, 0.0785, 0],
            "material_id": "mat_o1", "step_id": "step_02", "rests_on": ["part_surface"], "attaches_to": [],
            "verify_hint": "tall can upright", "install_minutes": 0.2, "doc_refs": [] }
        ],
        "materials": [
          { "material_id": "mat_surface", "name": "Build area", "spec": "the table under the build", "unit": "area", "quantity": 1, "used_by": ["part_surface"], "doc_refs": [] },
          { "material_id": "mat_o1", "name": "tall can", "spec": "6.6 × 15.7 cm", "unit": "each", "quantity": 1, "used_by": ["part_o1"], "doc_refs": [] }
        ],
        "steps": [
          { "step_id": "step_01", "index": 1, "title": "Clear the build area", "instruction": "Clear the space where the outline glows.",
            "part_ids": ["part_surface"], "requires": [], "layer": "build", "est_minutes": 0.2, "materials": [], "doc_refs": [] },
          { "step_id": "step_02", "index": 2, "title": "Place the tall can", "instruction": "Stand the tall can upright where its outline glows on the table.",
            "part_ids": ["part_o1"], "requires": ["step_01"], "layer": "build", "est_minutes": 0.2,
            "materials": [{ "material_id": "mat_o1", "qty": 1 }], "doc_refs": [] }
        ],
        "markers": [],
        "touch_points": [],
        "provenance": { "source_document_ids": [], "extracted_by": "build mode rule rule_fixture", "assumptions": ["Fixture: one can on the build area."], "validation": [] }
      }
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests.** Append to `packages/schemas/tests/schemas.test.ts` (it already imports `S` and `Strict` from `../src/index.js`; add the `node:fs` import at the top if it is missing):

```ts
import { readFileSync } from "node:fs";

describe("build mode contracts", () => {
  const fixture = () => JSON.parse(readFileSync(new URL("../../../data/fixtures/build/ws_build_ideas.json", import.meta.url), "utf8"));

  it("parses the shared build_ideas fixture strictly", () => {
    const msg = Strict.WsMessage.parse(fixture());
    expect(msg.type).toBe("build_ideas");
  });

  it("accepts build mode in the copilot context and start_scan as an action", () => {
    expect(S.CopilotAction.parse({ type: "start_scan" })).toEqual({ type: "start_scan" });
    expect(S.CopilotContext.shape.mode.parse("build")).toBe("build");
  });

  it("lets a first scan omit its session id", () => {
    const upload = { device_id: "quest", grid: { cols: 8, rows: 6 }, points_mm: new Array(144).fill(0), hit: "0".repeat(48),
      camera: { position: [0, 1.6, 0], forward: [0, 0, 1], intrinsics: { width: 1280, height: 960, fx: 853.6, fy: 853.6, cx: 640, cy: 480 } },
      photo_b64: "x".repeat(200) };
    expect(S.BuildScanUpload.parse(upload).session_id).toBeUndefined();
  });

  it("keeps the AI's placement language free of tuples (strict JSON-schema mode rejects them)", () => {
    const step = Strict.PlaceStep.parse({ place: "o1", orientation: "upright", on: [], at_cm: { x: 0, z: 0 }, next_to: null, side: null, gap_cm: null });
    expect(step.at_cm).toEqual({ x: 0, z: 0 });
  });
});
```

- [ ] **Step 3: Run and see it fail.** Run `pnpm -F @cutonce/schemas test`. Expected: FAIL (`S.CopilotAction` rejects `start_scan`; `Strict.PlaceStep` is undefined).

- [ ] **Step 4: Add the ids.** In `packages/schemas/src/ids.ts`, after `AnchorId`:

```ts
export const BuildSessionId = idOf("bsess");
export const ScanId = idOf("scan");
export const IdeaId = idOf("idea");
```

and add `BuildSessionId, ScanId, IdeaId` to the import from `./ids.js` at the top of `factory.ts`.

- [ ] **Step 5: Extend the copilot contracts** in `factory.ts`:

```ts
    mode: z.enum(["upload", "overlay", "build"]), selected_part_id: PartId.nullable(),
```

and in `CopilotAction` after the `step_nav` member:

```ts
    // "What can I build?": the headset scans the room and uploads it to POST /v1/build/scans.
    o({ type: z.literal("start_scan") }),
```

- [ ] **Step 6: Add the build section** in `factory.ts`, directly above the `// ── jobs, search, director, stream` comment:

```ts
  // ── build mode (the Lego Movie): scans, digital twins, ideas ───────────────
  // Vectors the AI writes are {x, z} objects, not tuples: strict JSON-schema mode rejects tuples.
  const Vec2 = z.tuple([z.number().finite(), z.number().finite()]);
  const BuildGrid = o({ cols: z.number().int().min(8).max(256), rows: z.number().int().min(6).max(192) });
  const BuildCamera = o({ position: Vec3, forward: Vec3, intrinsics: CameraIntrinsics });
  /** One scan as the headset sends it: one point (plan frame, mm) or a miss per cell, row-major from the photo's top-left. */
  const BuildScanUpload = o({
    session_id: BuildSessionId.nullable().optional(), device_id: z.string().min(1), grid: BuildGrid,
    points_mm: z.array(z.number().int()), hit: z.string().regex(/^[01]*$/), camera: BuildCamera, photo_b64: z.string().min(100),
  });
  const BuildScan = o({
    scan_id: ScanId, session_id: BuildSessionId, device_id: z.string(), captured_at: Timestamp,
    grid: BuildGrid, points_mm: z.array(z.number().int()), hit: z.string().regex(/^[01]*$/), camera: BuildCamera,
  });
  const TwinShape = z.discriminatedUnion("type", [
    o({ type: z.literal("box"), size: Size3 }),
    o({ type: z.literal("cylinder"), axis: z.enum(["x", "y", "z"]), diameter: z.number().positive(), length: z.number().positive() }),
  ]);
  const TwinMaterial = z.enum(["cardboard", "metal", "plastic", "glass", "wood", "paper", "fabric", "ceramic", "other"]);
  /** A flat, level surface: its height, and its extent as x/z min and max. */
  const Surface = o({
    surface_id: z.string().regex(/^s[0-9]+$/), kind: z.enum(["floor", "table", "shelf", "other"]),
    y: z.number(), min: Vec2, max: Vec2, points: z.number().int().min(0),
  });
  /** One real object: where it is in the room (plan frame, its centre), how big, what it is. yaw_deg turns its local +X onto its long side. */
  const Twin = o({
    twin_id: z.string().regex(/^o[0-9]+$/), name: z.string(), label: z.string(), shape: TwinShape,
    position: Vec3, yaw_deg: z.number(), sits_on: z.string().nullable(),
    material: TwinMaterial, load_bearing: z.boolean(), cuttable: z.boolean(), confidence: z.number().min(0).max(1),
    error_m: z.number().nonnegative(), points: z.number().int().min(0), distance_m: z.number().nonnegative(),
    bbox_px: BBoxPx.nullable(), snapped: z.boolean(), scan_ids: z.array(ScanId),
  });
  const Inventory = o({
    session_id: BuildSessionId, scan_id: ScanId.nullable(), labelled: z.boolean(),
    surfaces: z.array(Surface), twins: z.array(Twin), message: z.string().nullable(),
  });
  const Orientation = z.enum(["upright", "flat", "on_side"]);
  /** The placement language: the AI (or a rule) says what goes where; the solver decides every number. */
  const PlaceStep = o({
    place: z.string(), orientation: Orientation, on: z.array(z.string()),
    at_cm: o({ x: z.number(), z: z.number() }).nullable(),
    next_to: z.string().nullable(), side: z.enum(["left", "right", "front", "back"]).nullable(), gap_cm: z.number().nullable(),
  });
  const IdeaDraft = o({
    title: z.string().min(1), uses: z.array(z.string()), steps: z.array(PlaceStep).min(1), why: z.string(), tools: z.array(z.string()),
  });
  /** A checked design, ready to start: its plan (design frame) and where that frame sits in the room (plan frame). */
  const BuildIdea = o({
    idea_id: IdeaId, session_id: BuildSessionId, source: z.enum(["rule", "ai"]), rule_id: z.string().nullable(),
    title: z.string(), why: z.string(), tools: z.array(z.string()), plan: Plan,
    origin: o({ position: Vec3, rotation_quat: Quat }), twin_of: z.record(z.string()), score: z.number(),
  });
```

- [ ] **Step 7: Add the stream messages** at the end of the `WsMessage` union:

```ts
    o({ type: z.literal("build_inventory"), inventory: Inventory }),
    o({
      type: z.literal("build_ideas"), session_id: BuildSessionId, ideas: z.array(BuildIdea), final: z.boolean(),
      audio_url: z.string().nullable(), message: z.string().nullable(),
    }),
```

and add to the returned object: `BuildGrid, BuildCamera, BuildScanUpload, BuildScan, TwinShape, TwinMaterial, Surface, Twin, Inventory, Orientation, PlaceStep, IdeaDraft, BuildIdea,`.

- [ ] **Step 8: Export the types** in `packages/schemas/src/index.ts`, after `export type WsMessage`:

```ts
export type BuildScanUpload = z.infer<Sch["BuildScanUpload"]>;
export type BuildScan = z.infer<Sch["BuildScan"]>;
export type TwinShape = z.infer<Sch["TwinShape"]>;
export type Surface = z.infer<Sch["Surface"]>;
export type Twin = z.infer<Sch["Twin"]>;
export type Inventory = z.infer<Sch["Inventory"]>;
export type Orientation = z.infer<Sch["Orientation"]>;
export type PlaceStep = z.infer<Sch["PlaceStep"]>;
export type IdeaDraft = z.infer<Sch["IdeaDraft"]>;
export type BuildIdea = z.infer<Sch["BuildIdea"]>;
```

and in `scripts/export-jsonschema.ts` add `"BuildScanUpload", "Inventory", "BuildIdea", "IdeaDraft"` to `names`.

- [ ] **Step 9: Update the prompt's mode type.** `services/api/src/copilot/prompt.ts:102` types `mode: "upload" | "overlay"` and would now fail typecheck. Change it to `mode: "upload" | "overlay" | "build"`, and line 109 to:

```ts
    `MODE: ${input.mode} (${input.mode === "overlay" ? "building onto something already part-built" : input.mode === "build" ? "building something new from the objects in front of them" : "building from the drawings"})`,
```

- [ ] **Step 10: Run the tests.** Run `pnpm -F @cutonce/schemas test && pnpm typecheck && pnpm -F @cutonce/api test`. Expected: all PASS.

- [ ] **Step 11: Commit.**

```bash
git add packages/schemas data/fixtures/build services/api/src/copilot/prompt.ts
git commit -m "feat(schemas): build-mode contracts: scans, twins, inventory, placement language, ideas, start_scan"
```

---

### Task S2: Scan intake (unblocks M1)

**Files:**
- Create: `services/api/src/build/files.ts`
- Create: `services/api/src/build/routes.ts` (the first two routes; S10 adds the rest)
- Modify: `services/api/src/plugins.ts`
- Test: `services/api/tests/build-intake.test.ts`

**Interfaces:**
- Produces: `newId(prefix: "scan" | "bsess" | "idea"): string`; `class BuildFiles` with `root`, `scanDir(id)`, `saveScan(upload, sessionId): BuildScan`, `readScan(id): { scan: BuildScan; photo: Buffer }`, `readLabels(id): Twin[] | null`, `saveLabels(id, twins)`, `listScans()`, `saveSession(obj: { session_id: string })`; routes `POST /v1/build/scans` → 202 `{ scan_id, session_id }` and `GET /v1/build/scans` → `{ scans: { scan_id, session_id, captured_at, recording }[] }`.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-intake.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { auth, makeApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof makeApp>>;
beforeEach(async () => { t = await makeApp(); });
afterEach(async () => { await t.cleanup(); });

const photoB64 = () => readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg")).toString("base64");
const upload = (over: object = {}) => ({
  device_id: "quest", grid: { cols: 8, rows: 6 }, points_mm: new Array(144).fill(0), hit: "0".repeat(48),
  camera: { position: [0, 1.6, 0], forward: [0, 0, 1], intrinsics: { width: 1280, height: 960, fx: 853.6, fy: 853.6, cx: 640, cy: 480 } },
  photo_b64: photoB64(), ...over,
});
const post = (body: object) => t.app.inject({ method: "POST", url: "/v1/build/scans", headers: auth, payload: body });

describe("POST /v1/build/scans", () => {
  it("saves the scan and its photo under the runtime data folder, and starts a session", async () => {
    const r = await post(upload());
    expect(r.statusCode).toBe(202);
    const { scan_id, session_id } = r.json();
    expect(scan_id).toMatch(/^scan_[a-z0-9]+$/);
    expect(session_id).toMatch(/^bsess_[a-z0-9]+$/);
    const dir = join(t.dataDir, "build", "scans", scan_id);
    expect(existsSync(join(dir, "scan.json")) && existsSync(join(dir, "photo.jpg"))).toBe(true);
  });

  it("keeps the session when the headset sends it back", async () => {
    const first = (await post(upload())).json();
    const second = (await post(upload({ session_id: first.session_id }))).json();
    expect(second.session_id).toBe(first.session_id);
  });

  it("refuses a grid whose arrays do not match its size", async () => {
    const r = await post(upload({ hit: "0".repeat(47) }));
    expect(r.statusCode).toBe(400);
  });

  it("lists saved scans", async () => {
    const { scan_id } = (await post(upload())).json();
    const list = (await t.app.inject({ method: "GET", url: "/v1/build/scans", headers: auth })).json();
    expect(list.scans.some((s: { scan_id: string }) => s.scan_id === scan_id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-intake`. Expected: FAIL with 404 on `/v1/build/scans`.

- [ ] **Step 3: Write `services/api/src/build/files.ts`:**

```ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { S, type BuildScan, type BuildScanUpload, type Twin } from "@cutonce/schemas";
import { notFound } from "../errors.js";
import { ensureDir, readJson, writeJsonAtomic } from "../store/fs.js";

export const newId = (prefix: "scan" | "bsess" | "idea") => `${prefix}_${ulid().toLowerCase()}`;

/**
 * Where build mode keeps things. Live scans go under the runtime data folder (git-ignored: photos of the venue
 * must never reach the public repo). Curated recordings of the kit pile live in data/build/recordings/<name>/ and
 * are addressed as scan_rec_<name>.
 */
export class BuildFiles {
  constructor(private readonly dataDir: string, private readonly repoRoot: string) {}

  get root() { return join(this.dataDir, "build"); }
  get recordingsDir() { return join(this.repoRoot, "data", "build", "recordings"); }

  scanDir(scanId: string): string {
    return scanId.startsWith("scan_rec_") ? join(this.recordingsDir, scanId.slice("scan_rec_".length)) : join(this.root, "scans", scanId);
  }

  saveScan(upload: BuildScanUpload, sessionId: string): BuildScan {
    const scan: BuildScan = {
      scan_id: newId("scan"), session_id: sessionId, device_id: upload.device_id, captured_at: new Date().toISOString(),
      grid: upload.grid, points_mm: upload.points_mm, hit: upload.hit, camera: upload.camera,
    };
    const dir = this.scanDir(scan.scan_id);
    ensureDir(dir);
    writeJsonAtomic(join(dir, "scan.json"), scan);
    writeFileSync(join(dir, "photo.jpg"), Buffer.from(upload.photo_b64, "base64"));
    return scan;
  }

  readScan(scanId: string): { scan: BuildScan; photo: Buffer } {
    const dir = this.scanDir(scanId);
    const raw = readJson<unknown>(join(dir, "scan.json"));
    if (!raw || !existsSync(join(dir, "photo.jpg"))) throw notFound(`build scan ${scanId}`);
    return { scan: S.BuildScan.parse(raw), photo: readFileSync(join(dir, "photo.jpg")) };
  }

  readLabels(scanId: string): Twin[] | null {
    const raw = readJson<unknown[]>(join(this.scanDir(scanId), "labels.json"));
    return raw ? raw.map((t) => S.Twin.parse(t)) : null;
  }

  saveLabels(scanId: string, twins: Twin[]): void { writeJsonAtomic(join(this.scanDir(scanId), "labels.json"), twins); }

  listScans(): { scan_id: string; session_id: string | null; captured_at: string | null; recording: boolean }[] {
    const live = existsSync(join(this.root, "scans")) ? readdirSync(join(this.root, "scans")).filter((d) => d.startsWith("scan_")) : [];
    const recs = existsSync(this.recordingsDir) ? readdirSync(this.recordingsDir).filter((d) => /^[a-z0-9_]+$/.test(d)).map((d) => `scan_rec_${d}`) : [];
    return [...live, ...recs].map((scan_id) => {
      const meta = readJson<{ session_id?: string; captured_at?: string }>(join(this.scanDir(scan_id), "scan.json"));
      return { scan_id, session_id: meta?.session_id ?? null, captured_at: meta?.captured_at ?? null, recording: scan_id.startsWith("scan_rec_") };
    }).sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""));
  }

  saveSession(session: { session_id: string }): void { writeJsonAtomic(join(this.root, "sessions", session.session_id, "session.json"), session); }
}
```

- [ ] **Step 4: Write `services/api/src/build/routes.ts`** (a first version; S10 replaces the session handling):

```ts
import type { FastifyInstance } from "fastify";
import { S } from "@cutonce/schemas";
import type { Ctx, Plugin } from "../app.js";
import { badRequest } from "../errors.js";
import { BuildFiles, newId } from "./files.js";

export const buildRoutes: Plugin = (app: FastifyInstance, ctx: Ctx) => {
  const files = new BuildFiles(ctx.cfg.dataDir, ctx.cfg.repoRoot);
  let sessionId: string | null = null;

  app.post("/v1/build/scans", { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const body = S.BuildScanUpload.safeParse(req.body);
    if (!body.success) throw badRequest("body must be a BuildScanUpload", body.error.issues);
    const { cols, rows } = body.data.grid;
    if (body.data.points_mm.length !== 3 * cols * rows || body.data.hit.length !== cols * rows) {
      throw badRequest(`a ${cols} × ${rows} grid needs ${3 * cols * rows} numbers and ${cols * rows} hit flags`);
    }
    if (!body.data.session_id || body.data.session_id !== sessionId) sessionId = body.data.session_id ?? newId("bsess");
    const scan = files.saveScan(body.data, sessionId);
    return reply.status(202).send({ scan_id: scan.scan_id, session_id: sessionId });
  });

  app.get("/v1/build/scans", async () => ({ scans: files.listScans() }));
};
```

- [ ] **Step 5: Register it.** In `services/api/src/plugins.ts`, add `import { buildRoutes } from "./build/routes.js";` and put `buildRoutes` in the list just before `staticRoutes`.

- [ ] **Step 6: Run the tests.** Run `pnpm -F @cutonce/api test build-intake`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add services/api/src/build services/api/src/plugins.ts services/api/tests/build-intake.test.ts
git commit -m "feat(build): scan intake: POST /v1/build/scans saves points and photo under the runtime folder"
```

---

### Task S3: Vocabulary, rules and shape helpers

**Files:**
- Create: `data/build/vocabulary.json`, `data/build/rules.json`
- Create: `services/api/src/build/data.ts`, `services/api/src/build/shape.ts`
- Test: `services/api/tests/build-data.test.ts`

**Interfaces:**
- Produces (`data.ts`): types `VocabItem`, `Vocab = Map<string, VocabItem>`, `Rule`, `Payload`; `loadVocab(repoRoot): Vocab`; `loadRules(repoRoot, vocab): Rule[]`; `standardShape(item): TwinShape | null` (box sizes sorted largest first; cylinders upright).
- Produces (`shape.ts`): `heightOf(s)`, `halfOf(s): Vec3`, `volumeOf(s)`, `dimsCm(s): number[]` (sorted, largest first, rounded to 0.1 cm), `flatSize(size): Size` (`[longest, shortest, middle]`), `describeShape(s): string`.

- [ ] **Step 1: Write `data/build/vocabulary.json`.** The sizes are typical retail sizes. **Before the demo, measure the actual kit with a tape and update these numbers.**

```json
{
  "version": 1,
  "items": [
    { "name": "pizza_box", "label": "pizza box", "shape": "box", "size_cm": [35, 35, 4], "diameter_cm": null, "height_cm": null, "material": "cardboard", "load_bearing": true, "cuttable": true, "density_kg_m3": 60 },
    { "name": "tall_can", "label": "tall can", "shape": "cylinder", "size_cm": null, "diameter_cm": 6.6, "height_cm": 15.7, "material": "metal", "load_bearing": true, "cuttable": false, "density_kg_m3": 1000 },
    { "name": "drink_can", "label": "drink can", "shape": "cylinder", "size_cm": null, "diameter_cm": 6.6, "height_cm": 12.2, "material": "metal", "load_bearing": true, "cuttable": false, "density_kg_m3": 1000 },
    { "name": "energy_can", "label": "energy drink can", "shape": "cylinder", "size_cm": null, "diameter_cm": 5.3, "height_cm": 13.5, "material": "metal", "load_bearing": true, "cuttable": false, "density_kg_m3": 1000 },
    { "name": "water_bottle", "label": "water bottle", "shape": "cylinder", "size_cm": null, "diameter_cm": 6.5, "height_cm": 21, "material": "plastic", "load_bearing": true, "cuttable": false, "density_kg_m3": 950 },
    { "name": "cardboard_box", "label": "cardboard box", "shape": "box", "size_cm": null, "diameter_cm": null, "height_cm": null, "material": "cardboard", "load_bearing": true, "cuttable": true, "density_kg_m3": 80 },
    { "name": "tape_roll", "label": "tape roll", "shape": "cylinder", "size_cm": null, "diameter_cm": 11, "height_cm": 4.8, "material": "plastic", "load_bearing": true, "cuttable": false, "density_kg_m3": 400 },
    { "name": "book", "label": "book", "shape": "box", "size_cm": null, "diameter_cm": null, "height_cm": null, "material": "paper", "load_bearing": true, "cuttable": false, "density_kg_m3": 600 },
    { "name": "notebook", "label": "notebook", "shape": "box", "size_cm": [21, 14.8, 1.2], "diameter_cm": null, "height_cm": null, "material": "paper", "load_bearing": true, "cuttable": true, "density_kg_m3": 600 },
    { "name": "mug", "label": "mug", "shape": "cylinder", "size_cm": null, "diameter_cm": 8.5, "height_cm": 9.5, "material": "ceramic", "load_bearing": true, "cuttable": false, "density_kg_m3": 700 },
    { "name": "paper_cup", "label": "paper cup", "shape": "cylinder", "size_cm": null, "diameter_cm": 8, "height_cm": 11, "material": "paper", "load_bearing": false, "cuttable": true, "density_kg_m3": 100 },
    { "name": "laptop", "label": "laptop", "shape": "box", "size_cm": [31, 22, 1.6], "diameter_cm": null, "height_cm": null, "material": "metal", "load_bearing": true, "cuttable": false, "density_kg_m3": 1400 },
    { "name": "phone", "label": "phone", "shape": "box", "size_cm": [15, 7.2, 0.8], "diameter_cm": null, "height_cm": null, "material": "glass", "load_bearing": false, "cuttable": false, "density_kg_m3": 2500 }
  ]
}
```

- [ ] **Step 2: Write `data/build/rules.json`.** Every design is authored to be stable: the riser has three supports that are not in a line.

```json
{
  "version": 1,
  "rules": [
    {
      "rule_id": "rule_laptop_riser",
      "title": "Laptop riser",
      "why": "Three cans in a triangle hold the pizza box level, so your laptop sits 16 cm higher and your neck stops complaining.",
      "tools": [],
      "roles": [
        { "role": "can", "any_of": ["tall_can", "drink_can", "energy_can", "water_bottle"], "count": 3, "same_name": true },
        { "role": "board", "any_of": ["pizza_box"], "count": 1, "same_name": false }
      ],
      "steps": [
        { "place": "can#1", "orientation": "upright", "on": [], "at_cm": { "x": -12, "z": -12 }, "next_to": null, "side": null, "gap_cm": null },
        { "place": "can#2", "orientation": "upright", "on": [], "at_cm": { "x": 12, "z": -12 }, "next_to": null, "side": null, "gap_cm": null },
        { "place": "can#3", "orientation": "upright", "on": [], "at_cm": { "x": 0, "z": 12 }, "next_to": null, "side": null, "gap_cm": null },
        { "place": "board#1", "orientation": "flat", "on": ["can#1", "can#2", "can#3"], "at_cm": null, "next_to": null, "side": null, "gap_cm": null }
      ],
      "payload": { "label": "laptop", "size_cm": [31, 1.6, 22], "kg": 1.6 }
    },
    {
      "rule_id": "rule_tiered_stand",
      "title": "Two-tier display stand",
      "why": "The box lifts the pizza box into a stage, and the can on top takes the spotlight: a trophy stand made from leftovers.",
      "tools": [],
      "roles": [
        { "role": "base", "any_of": ["cardboard_box", "book"], "count": 1, "same_name": false },
        { "role": "board", "any_of": ["pizza_box"], "count": 1, "same_name": false },
        { "role": "top", "any_of": ["tall_can", "drink_can", "energy_can", "mug"], "count": 1, "same_name": false }
      ],
      "steps": [
        { "place": "base#1", "orientation": "flat", "on": [], "at_cm": { "x": 0, "z": 0 }, "next_to": null, "side": null, "gap_cm": null },
        { "place": "board#1", "orientation": "flat", "on": ["base#1"], "at_cm": null, "next_to": null, "side": null, "gap_cm": null },
        { "place": "top#1", "orientation": "upright", "on": ["board#1"], "at_cm": null, "next_to": null, "side": null, "gap_cm": null }
      ],
      "payload": null
    }
  ]
}
```

- [ ] **Step 3: Write the failing test** `services/api/tests/build-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { dimsCm, flatSize, heightOf, volumeOf } from "../src/build/shape.js";

describe("build data", () => {
  const vocab = loadVocab(REPO_ROOT);
  it("loads the vocabulary and every rule names only vocabulary objects", () => {
    expect(vocab.get("tall_can")?.label).toBe("tall can");
    expect(loadRules(REPO_ROOT, vocab).map((r) => r.rule_id)).toContain("rule_laptop_riser");
  });
  it("gives standard shapes in metres: boxes largest side first, cylinders upright", () => {
    expect(standardShape(vocab.get("pizza_box")!)).toEqual({ type: "box", size: [0.35, 0.35, 0.04] });
    expect(standardShape(vocab.get("tall_can")!)).toEqual({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 });
    expect(standardShape(vocab.get("cardboard_box")!)).toBeNull();
  });
  it("measures shapes", () => {
    const can = { type: "cylinder" as const, axis: "y" as const, diameter: 0.066, length: 0.157 };
    expect(heightOf(can)).toBeCloseTo(0.157);
    expect(volumeOf({ type: "box", size: [0.1, 0.2, 0.3] })).toBeCloseTo(0.006);
    expect(dimsCm(can)).toEqual([15.7, 6.6, 6.6]);
    expect(flatSize([0.35, 0.04, 0.3])).toEqual([0.35, 0.04, 0.3]);
  });
});
```

- [ ] **Step 4: Run and see it fail.** Run `pnpm -F @cutonce/api test build-data`. Expected: FAIL (the modules don't exist).

- [ ] **Step 5: Write `services/api/src/build/shape.ts`:**

```ts
import type { TwinShape, Vec3 } from "@cutonce/schemas";

export type Size = [number, number, number];

/** Height as it stands (y extent). */
export const heightOf = (s: TwinShape) => (s.type === "box" ? s.size[1] : s.axis === "y" ? s.length : s.diameter);

/** Half extents along x, y, z. */
export function halfOf(s: TwinShape): Vec3 {
  if (s.type === "box") return [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2];
  const r = s.diameter / 2, h = s.length / 2;
  return [s.axis === "x" ? h : r, s.axis === "y" ? h : r, s.axis === "z" ? h : r];
}

export const volumeOf = (s: TwinShape) => (s.type === "box" ? s.size[0] * s.size[1] * s.size[2] : Math.PI * (s.diameter / 2) ** 2 * s.length);

const cm = (m: number) => Math.round(m * 1000) / 10;

/** Dimensions in cm, largest first: the same object measured in any orientation gives the same list. */
export const dimsCm = (s: TwinShape) =>
  (s.type === "box" ? [...s.size] : [s.length, s.diameter, s.diameter]).map(cm).sort((a, b) => b - a);

/** A box lying flat: longest side along x, thinnest up, the middle one along z. */
export function flatSize(size: readonly number[]): Size {
  const [a, b, c] = [...size].sort((x, y) => y - x) as Size;
  return [a, c, b];
}

export const describeShape = (s: TwinShape) =>
  s.type === "cylinder"
    ? `cylinder ${cm(s.diameter)} cm wide, ${cm(heightOf(s))} cm tall`
    : `box ${cm(s.size[0])} × ${cm(s.size[2])} cm, ${cm(s.size[1])} cm tall`;
```

- [ ] **Step 6: Write `services/api/src/build/data.ts`:**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { S, type TwinShape } from "@cutonce/schemas";

const Cm3 = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]);

export const VocabItem = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), shape: z.enum(["box", "cylinder"]),
  size_cm: Cm3.nullable(), diameter_cm: z.number().positive().nullable(), height_cm: z.number().positive().nullable(),
  material: S.TwinMaterial, load_bearing: z.boolean(), cuttable: z.boolean(), density_kg_m3: z.number().positive(),
});
const Vocabulary = z.object({ version: z.literal(1), items: z.array(VocabItem).min(1) });

export const Payload = z.object({ label: z.string(), size_cm: Cm3, kg: z.number().positive() });
const Role = z.object({ role: z.string().regex(/^[a-z_]+$/), any_of: z.array(z.string()).min(1), count: z.number().int().min(1), same_name: z.boolean() });
export const Rule = z.object({
  rule_id: z.string().regex(/^rule_[a-z0-9_]+$/), title: z.string().min(1), why: z.string(), tools: z.array(z.string()),
  roles: z.array(Role).min(1), steps: z.array(S.PlaceStep).min(1), payload: Payload.nullable(),
});
const Rules = z.object({ version: z.literal(1), rules: z.array(Rule) });

export type VocabItem = z.infer<typeof VocabItem>;
export type Vocab = Map<string, VocabItem>;
export type Rule = z.infer<typeof Rule>;
export type Payload = z.infer<typeof Payload>;

const read = (repoRoot: string, file: string) => JSON.parse(readFileSync(join(repoRoot, "data", "build", file), "utf8"));

export function loadVocab(repoRoot: string): Vocab {
  const v = Vocabulary.parse(read(repoRoot, "vocabulary.json"));
  return new Map(v.items.map((i) => [i.name, i]));
}

/** Rules must name only vocabulary objects, and their steps only roles they declare ("can#2" needs count ≥ 2). */
export function loadRules(repoRoot: string, vocab: Vocab): Rule[] {
  const { rules } = Rules.parse(read(repoRoot, "rules.json"));
  for (const rule of rules) {
    const slots = new Set(rule.roles.flatMap((r) => Array.from({ length: r.count }, (_, k) => `${r.role}#${k + 1}`)));
    for (const role of rule.roles) for (const n of role.any_of) {
      if (!vocab.has(n)) throw new Error(`${rule.rule_id}: role ${role.role} names ${n}, which is not in vocabulary.json`);
    }
    for (const s of rule.steps) for (const ref of [s.place, ...s.on, ...(s.next_to ? [s.next_to] : [])]) {
      if (!slots.has(ref)) throw new Error(`${rule.rule_id}: step names ${ref}, which no role declares`);
    }
  }
  return rules;
}

/** The standard size in metres (boxes largest side first, in no particular orientation; cylinders standing), or null when it varies. */
export function standardShape(item: VocabItem): TwinShape | null {
  const m = (cm: number) => Math.round(cm * 10) / 1000;   // 6.6 cm → exactly the double 0.066
  if (item.shape === "cylinder") {
    return item.diameter_cm && item.height_cm ? { type: "cylinder", axis: "y", diameter: m(item.diameter_cm), length: m(item.height_cm) } : null;
  }
  if (!item.size_cm) return null;
  const [a, b, c] = [...item.size_cm].sort((x, y) => y - x) as [number, number, number];
  return { type: "box", size: [m(a), m(b), m(c)] };
}
```

- [ ] **Step 7: Run the tests.** Run `pnpm -F @cutonce/api test build-data`. Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add data/build services/api/src/build/data.ts services/api/src/build/shape.ts services/api/tests/build-data.test.ts
git commit -m "feat(build): object vocabulary with standard sizes, two stable rule designs, shape helpers"
```

---

### Task S4: Twin builder (organised point cloud → surfaces and twins)

**Files:**
- Create: `services/api/src/build/twins.ts`
- Create: `services/api/tests/build-synth.ts` (a synthetic scan generator shared by later tests)
- Test: `services/api/tests/build-twins.test.ts`

**Interfaces:**
- Consumes: `BuildScan`, `Surface`, `Twin` (S1); `halfOf`, `heightOf` (S3).
- Produces: `interface Cloud { cols; rows; width; height; xyz: Float64Array; cam: Vec3; spacingRad }`; `decodeScan(scan): Cloud`; `buildTwins(cloud, scanId): { surfaces: Surface[]; twins: Twin[] }` (twins named `"unknown"`, ids `o1…` nearest first); `minAreaRect(pts): { cx; cz; len; wid; yawDeg }`; `yawQuat(deg): [0, s, 0, c]`.
- Produces (tests, in `build-synth.ts`): `synthScan(prims, cam, lookAt, opts?)`, `FLOOR`, `TABLE`, `CAMERA`, `KIT`, `can(x, z, …)`, `box(cx, cz, sx, sy, sz, y0?)`, `twin(over)` (a Twin with defaults), `photoB64()`.

- [ ] **Step 1: Write the generator** `services/api/tests/build-synth.ts`. It ray-casts a scene of boxes and upright cylinders from a camera, exactly as the headset does: one ray per grid cell through that cell's pixel.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildScan, Twin, Vec3 } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";

/** Shared by the build tests. Kept out of *.test.ts files: importing a test file would register its tests twice. */
export const photoB64 = () => readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg")).toString("base64");

/** A labelled can on the table; override what a test cares about. */
export const twin = (over: Partial<Twin> = {}): Twin => ({
  twin_id: "o1", name: "unknown", label: "object", shape: { type: "cylinder", axis: "y", diameter: 0.06, length: 0.15 },
  position: [0, 0.74 + 0.075, 0.5], yaw_deg: 0, sits_on: "s1", material: "metal", load_bearing: true, cuttable: false,
  confidence: 0.9, error_m: 0.02, points: 30, distance_m: 1.5, bbox_px: [0, 0, 10, 10], snapped: false, scan_ids: ["scan_a"], ...over,
});

export type Prim =
  | { kind: "box"; min: Vec3; max: Vec3 }
  | { kind: "cyl"; x: number; z: number; r: number; y0: number; y1: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

function hitBox(o: Vec3, d: Vec3, b: { min: Vec3; max: Vec3 }): number {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]!) < 1e-12) { if (o[i]! < b.min[i]! || o[i]! > b.max[i]!) return Infinity; continue; }
    let a = (b.min[i]! - o[i]!) / d[i]!, c = (b.max[i]! - o[i]!) / d[i]!;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
  }
  return t0 <= t1 && t0 > 1e-6 ? t0 : Infinity;
}

function hitCyl(o: Vec3, d: Vec3, c: { x: number; z: number; r: number; y0: number; y1: number }): number {
  let best = Infinity;
  const ox = o[0] - c.x, oz = o[2] - c.z;
  const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), C = ox * ox + oz * oz - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (A > 1e-12 && disc >= 0) {
    for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
      const y = o[1] + t * d[1];
      if (t > 1e-6 && y >= c.y0 && y <= c.y1) best = Math.min(best, t);
    }
  }
  if (Math.abs(d[1]) > 1e-12) {
    const t = (c.y1 - o[1]) / d[1], x = o[0] + t * d[0] - c.x, z = o[2] + t * d[2] - c.z;
    if (t > 1e-6 && x * x + z * z <= c.r * c.r) best = Math.min(best, t);
  }
  return best;
}

export interface SynthOptions { cols?: number; rows?: number; noiseM?: number; seed?: number }

/** A BuildScan of the scene: right-handed, +Y up; the camera's right is cross(forward, up), as the headset's mirrored frame gives. */
export function synthScan(prims: Prim[], cam: Vec3, lookAt: Vec3, opts: SynthOptions = {}): BuildScan {
  const cols = opts.cols ?? 128, rows = opts.rows ?? 96, width = 1280, height = 960, fx = 853.6, fy = 853.6, cx = 640, cy = 480;
  const f = unit(sub(lookAt, cam)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f);
  let seed = opts.seed ?? 1;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const noise = () => (rand() + rand() + rand() - 1.5) * (opts.noiseM ?? 0);
  const points_mm: number[] = [];
  let hit = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = ((c + 0.5) * width) / cols, v = ((r + 0.5) * height) / rows;
    const d = unit(add(f, add(mul(right, (u - cx) / fx), mul(up, -(v - cy) / fy))));
    let t = Infinity;
    for (const p of prims) t = Math.min(t, p.kind === "box" ? hitBox(cam, d, p) : hitCyl(cam, d, p));
    if (!Number.isFinite(t) || t > 6) { points_mm.push(0, 0, 0); hit += "0"; continue; }
    const p = add(cam, mul(d, t + noise()));
    points_mm.push(Math.round(p[0] * 1000), Math.round(p[1] * 1000), Math.round(p[2] * 1000));
    hit += "1";
  }
  return {
    scan_id: "scan_synthetic", session_id: "bsess_synthetic", device_id: "synth", captured_at: new Date(0).toISOString(),
    grid: { cols, rows }, points_mm, hit, camera: { position: cam, forward: f, intrinsics: { width, height, fx, fy, cx, cy } },
  };
}

export const FLOOR: Prim = { kind: "box", min: [-5, -0.02, -5], max: [5, 0, 5] };
export const TABLE: Prim = { kind: "box", min: [-0.6, 0.72, 0.2], max: [0.6, 0.74, 1.0] };
export const CAMERA = { cam: [0, 1.6, -1.0] as Vec3, lookAt: [0, 0.6, 0.5] as Vec3 };
export const can = (x: number, z: number, r = 0.033, h = 0.157, y0 = 0.74): Prim => ({ kind: "cyl", x, z, r, y0, y1: y0 + h });
export const box = (cx: number, cz: number, sx: number, sy: number, sz: number, y0 = 0.74): Prim =>
  ({ kind: "box", min: [cx - sx / 2, y0, cz - sz / 2], max: [cx + sx / 2, y0 + sy, cz + sz / 2] });

/** The demo kit on a table: a pizza box lying flat and three tall cans. */
export const KIT = [FLOOR, TABLE, box(-0.2, 0.6, 0.35, 0.04, 0.35), can(0.1, 0.4), can(0.22, 0.4), can(0.16, 0.55)];
```

- [ ] **Step 2: Write the failing test** `services/api/tests/build-twins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTwins, decodeScan, minAreaRect, yawQuat } from "../src/build/twins.js";
import { heightOf } from "../src/build/shape.js";
import { CAMERA, FLOOR, KIT, TABLE, box, can, synthScan } from "./build-synth.js";

const run = (prims: Parameters<typeof synthScan>[0], noiseM = 0) =>
  buildTwins(decodeScan(synthScan(prims, CAMERA.cam, CAMERA.lookAt, { noiseM })), "scan_synthetic");

describe("surfaces", () => {
  it("finds the floor and the table top, and not the box tops", () => {
    const { surfaces } = run([FLOOR, TABLE, box(-0.2, 0.55, 0.3, 0.1, 0.2)]);
    const kinds = surfaces.map((s) => [s.kind, Math.round(s.y * 100)]);
    expect(kinds).toContainEqual(["floor", 0]);
    expect(kinds).toContainEqual(["table", 74]);
    expect(surfaces.every((s) => Math.abs(s.y - 0.84) > 0.02)).toBe(true);   // the 30 × 20 cm box top is an object, not a table
  });
});

describe("objects on the table and the floor", () => {
  const scene = [FLOOR, TABLE, box(-0.2, 0.55, 0.3, 0.1, 0.2), can(0.15, 0.5), box(0.45, 0.02, 0.35, 0.3, 0.25, 0)];

  it("finds each object once, on the right surface, with sizes within 2 cm", () => {
    const { surfaces, twins } = run(scene);
    expect(twins).toHaveLength(3);
    const table = surfaces.find((s) => s.kind === "table")!, floor = surfaces.find((s) => s.kind === "floor")!;
    const theCan = twins.find((t) => t.shape.type === "cylinder")!;
    expect(theCan.sits_on).toBe(table.surface_id);
    expect(theCan.shape.type === "cylinder" && theCan.shape.diameter).toBeCloseTo(0.066, 1);
    expect(heightOf(theCan.shape)).toBeCloseTo(0.157, 1);
    const floorBox = twins.find((t) => t.sits_on === floor.surface_id)!;
    expect(floorBox.shape.type).toBe("box");
    expect(Math.abs(heightOf(floorBox.shape) - 0.3)).toBeLessThan(0.02);
    const tableBox = twins.find((t) => t.shape.type === "box" && t.sits_on === table.surface_id)!;
    const s = tableBox.shape.type === "box" ? [...tableBox.shape.size].sort((a, b) => b - a) : [];
    expect(Math.abs(s[0]! - 0.3)).toBeLessThan(0.02);
    expect(Math.abs(s[1]! - 0.2)).toBeLessThan(0.02);
  });

  it("names nothing yet, numbers nearest first, and gives each twin its box in the photo", () => {
    const { twins } = run(scene);
    expect(twins.map((t) => t.name)).toEqual(["unknown", "unknown", "unknown"]);
    expect(twins.map((t) => t.twin_id)).toEqual(["o1", "o2", "o3"]);
    expect(twins[0]!.distance_m).toBeLessThanOrEqual(twins[1]!.distance_m);
    for (const t of twins) expect(t.bbox_px![2]).toBeGreaterThan(0);
  });

  it("still works with 3 mm of depth noise", () => {
    const { twins } = run(scene, 0.003);
    expect(twins).toHaveLength(3);
  });

  it("separates three cans standing 5 cm apart and the pizza box", () => {
    const { twins } = run(KIT);
    expect(twins.filter((t) => t.shape.type === "cylinder")).toHaveLength(3);
    expect(twins.filter((t) => t.shape.type === "box")).toHaveLength(1);
  });
});

describe("minAreaRect and yaw", () => {
  it("finds a rectangle turned 30° and a yaw that points local +X along its long side", () => {
    const pts: [number, number][] = [];
    const a = (30 * Math.PI) / 180, u: [number, number] = [Math.cos(a), Math.sin(a)], v: [number, number] = [-Math.sin(a), Math.cos(a)];
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 10; j++) {
      const s = (i / 20 - 0.5) * 0.4, t = (j / 10 - 0.5) * 0.1;
      pts.push([1 + s * u[0] + t * v[0], 2 + s * u[1] + t * v[1]]);
    }
    const r = minAreaRect(pts);
    expect(r.len).toBeCloseTo(0.4, 2);
    expect(r.wid).toBeCloseTo(0.1, 2);
    const [, y, , w] = yawQuat(r.yawDeg);
    // rotate (1, 0, 0) about +Y by the quaternion: x' = 1 - 2y², z' = -2wy
    const dir: [number, number] = [1 - 2 * y * y, -2 * w * y];
    expect(Math.abs(dir[0] * u[0] + dir[1] * u[1])).toBeCloseTo(1, 3);
  });
});
```

- [ ] **Step 3: Run and see it fail.** Run `pnpm -F @cutonce/api test build-twins`. Expected: FAIL (`twins.js` doesn't exist).

- [ ] **Step 4: Write `services/api/src/build/twins.ts`:**

```ts
import type { BuildScan, Surface, Twin, TwinShape, Vec3 } from "@cutonce/schemas";

/** One scan as an organised point cloud: cell i is the ray through the photo pixel at the centre of cell i. */
export interface Cloud { cols: number; rows: number; width: number; height: number; xyz: Float64Array; cam: Vec3; spacingRad: number }

export function decodeScan(scan: BuildScan): Cloud {
  const { cols, rows } = scan.grid, n = cols * rows;
  if (scan.points_mm.length !== 3 * n || scan.hit.length !== n) throw new Error(`scan ${scan.scan_id}: a ${cols} × ${rows} grid needs ${n} cells`);
  const xyz = new Float64Array(3 * n).fill(NaN);
  for (let i = 0; i < n; i++) if (scan.hit[i] === "1") for (let k = 0; k < 3; k++) xyz[3 * i + k] = scan.points_mm[3 * i + k]! / 1000;
  const { width, height, fx } = scan.camera.intrinsics;
  return { cols, rows, width, height, xyz, cam: scan.camera.position, spacingRad: (2 * Math.atan(width / 2 / fx)) / cols };
}

export const OPTIONS = {
  surfaceBand: 0.015,        // a surface point is within 1.5 cm of the surface's height
  minSurfacePoints: 60,
  minSurfaceExtent: 0.45,    // tables and floors are big; a box top is not a surface
  minObjectPoints: 6,
  minObjectHeight: 0.015,
  maxObjectSize: 1.5,        // bigger than this is furniture or a wall
};

/** A yaw as a quaternion [x, y, z, w]: a right-handed turn about +Y. */
export const yawQuat = (deg: number): [number, number, number, number] => {
  const h = (deg * Math.PI) / 360;
  return [0, Math.sin(h), 0, Math.cos(h)];
};

/**
 * The smallest rectangle around points in the x/z plane (1° sweep; deterministic). yawDeg is the right-handed turn
 * about +Y that takes local +X onto the long side: a turn θ takes +X to (cos θ, -sin θ) in (x, z).
 */
export function minAreaRect(pts: [number, number][]): { cx: number; cz: number; len: number; wid: number; yawDeg: number } {
  let best = { area: Infinity, deg: 0, minU: 0, maxU: 0, minV: 0, maxV: 0 };
  for (let deg = 0; deg < 90; deg++) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of pts) {
      const u = x * c + z * s, v = -x * s + z * c;
      if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area - 1e-12) best = { area, deg, minU, maxU, minV, maxV };
  }
  const t = (best.deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const u0 = (best.minU + best.maxU) / 2, v0 = (best.minV + best.maxV) / 2;
  let len = best.maxU - best.minU, wid = best.maxV - best.minV, along = best.deg;
  if (wid > len) { [len, wid] = [wid, len]; along += 90; }
  return { cx: u0 * c - v0 * s, cz: u0 * s + v0 * c, len, wid, yawDeg: -along };
}

export function buildTwins(cloud: Cloud, scanId: string, opts = OPTIONS): { surfaces: Surface[]; twins: Twin[] } {
  const { cols, rows, xyz } = cloud, n = cols * rows;
  const ok = (i: number) => !Number.isNaN(xyz[3 * i]!);
  const x = (i: number) => xyz[3 * i]!, y = (i: number) => xyz[3 * i + 1]!, z = (i: number) => xyz[3 * i + 2]!;
  const dist3 = (i: number, j: number) => Math.hypot(x(i) - x(j), y(i) - y(j), z(i) - z(j));

  // 1. Which points face up: the normal from the grid neighbours is within ~25° of vertical.
  const up = new Uint8Array(n);
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const i = r * cols + c, l = i - 1, rt = i + 1, u = i - cols, d = i + cols;
    if (!ok(i) || !ok(l) || !ok(rt) || !ok(u) || !ok(d)) continue;
    const a: Vec3 = [x(rt) - x(l), y(rt) - y(l), z(rt) - z(l)], b: Vec3 = [x(d) - x(u), y(d) - y(u), z(d) - z(u)];
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const len = Math.hypot(nx, ny, nz);
    if (len > 0 && Math.abs(ny) / len > 0.9) up[i] = 1;
  }

  // 2. Candidate heights: peaks in a 1 cm histogram of the upward-facing points.
  const bins = new Map<number, number>();
  for (let i = 0; i < n; i++) if (up[i]) { const b = Math.round(y(i) / 0.01); bins.set(b, (bins.get(b) ?? 0) + 1); }
  const win = (b: number) => (bins.get(b - 1) ?? 0) + (bins.get(b) ?? 0) + (bins.get(b + 1) ?? 0);
  const levels: number[] = [];
  for (const b of [...bins.keys()].sort((p, q) => p - q)) {
    const s = win(b);
    if (s < opts.minSurfacePoints) continue;
    let peak = true;
    for (let k = -3; k <= 3 && peak; k++) if (k !== 0 && (win(b + k) > s || (win(b + k) === s && k < 0))) peak = false;
    if (peak) levels.push(b * 0.01);
  }

  // 3. Surfaces: grid-connected upward points at each level, big enough to be a table, shelf or floor.
  const surfaceOf = new Int32Array(n).fill(-1);
  const found: { y: number; cells: number[]; min: [number, number]; max: [number, number] }[] = [];
  for (const level of levels) {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (seen[s] || !up[s] || surfaceOf[s] >= 0 || Math.abs(y(s) - level) > opts.surfaceBand) continue;
      const cells: number[] = [], stack = [s]; seen[s] = 1;
      while (stack.length) {
        const i = stack.pop()!; cells.push(i);
        const r = Math.floor(i / cols), c = i % cols;
        for (const j of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) {
          if (j < 0 || seen[j] || !up[j] || surfaceOf[j] >= 0 || Math.abs(y(j) - level) > opts.surfaceBand) continue;
          seen[j] = 1; stack.push(j);
        }
      }
      if (cells.length < opts.minSurfacePoints) continue;
      const min: [number, number] = [Infinity, Infinity], max: [number, number] = [-Infinity, -Infinity];
      let sy = 0;
      for (const i of cells) { min[0] = Math.min(min[0], x(i)); min[1] = Math.min(min[1], z(i)); max[0] = Math.max(max[0], x(i)); max[1] = Math.max(max[1], z(i)); sy += y(i); }
      if (max[0] - min[0] < opts.minSurfaceExtent || max[1] - min[1] < opts.minSurfaceExtent) continue;
      for (const i of cells) surfaceOf[i] = found.length;
      found.push({ y: sy / cells.length, cells, min, max });
    }
  }
  const order = found.map((_, k) => k).sort((a, b) => found[b]!.cells.length - found[a]!.cells.length || found[b]!.y - found[a]!.y);
  const surfaces: Surface[] = order.map((k, idx) => {
    const f = found[k]!;
    const kind = f.y < 0.25 ? "floor" : f.y >= 0.55 && f.y <= 1.2 ? "table" : f.y > 1.2 ? "shelf" : "other";
    return { surface_id: `s${idx + 1}`, kind, y: f.y, min: f.min, max: f.max, points: f.cells.length };
  });

  // 4. Objects: grid-connected points that are not surface, linked when closer than 2.5 ray spacings (at least 3 cm).
  const range = (i: number) => Math.hypot(x(i) - cloud.cam[0], y(i) - cloud.cam[1], z(i) - cloud.cam[2]);
  const link = (i: number) => Math.max(0.03, 2.5 * cloud.spacingRad * range(i));
  const taken = new Uint8Array(n);
  const clusters: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (taken[s] || !ok(s) || surfaceOf[s] >= 0) continue;
    const cells: number[] = [], stack = [s]; taken[s] = 1;
    while (stack.length) {
      const i = stack.pop()!; cells.push(i);
      const r = Math.floor(i / cols), c = i % cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr === 0 && dc === 0) || rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const j = rr * cols + cc;
        if (taken[j] || !ok(j) || surfaceOf[j] >= 0 || dist3(i, j) > link(i)) continue;
        taken[j] = 1; stack.push(j);
      }
    }
    if (cells.length >= opts.minObjectPoints) clusters.push(cells);
  }

  // 5. One twin per cluster that stands on a surface.
  const inside = (s: Surface, px: number, pz: number, m: number) => px >= s.min[0] - m && px <= s.max[0] + m && pz >= s.min[1] - m && pz <= s.max[1] + m;
  const raw: Twin[] = [];
  for (const cells of clusters) {
    let minY = Infinity, sx = 0, sz = 0;
    for (const i of cells) { minY = Math.min(minY, y(i)); sx += x(i); sz += z(i); }
    const cxz: [number, number] = [sx / cells.length, sz / cells.length];
    const base = surfaces.filter((s) => s.y <= minY + 0.03 && inside(s, cxz[0], cxz[1], 0.05)).sort((a, b) => b.y - a.y)[0];
    if (!base) continue;                                           // floating: a wall, a person, a lamp
    // Points at the surface's own height are the surface seen at the object's edge, not the object: drop them.
    const body = cells.filter((i) => y(i) - base.y > 0.01);
    if (body.length < opts.minObjectPoints) continue;              // a table rim, a shadow, noise
    const ys = body.map(y).sort((a, b) => a - b);
    const height = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.95))]! - base.y;
    if (height < opts.minObjectHeight) continue;
    const rect = minAreaRect(body.map((i) => [x(i), z(i)] as [number, number]));
    if (rect.len > opts.maxObjectSize || height > opts.maxObjectSize) continue;
    const t = (-rect.yawDeg * Math.PI) / 180, ca = Math.cos(t), sa = Math.sin(t);
    let corner = 0;
    for (const i of body) {
      const dx = x(i) - rect.cx, dz = z(i) - rect.cz;
      const nu = (dx * ca + dz * sa) / (rect.len / 2), nv = (-dx * sa + dz * ca) / Math.max(rect.wid / 2, 1e-6);
      if (nu * nu + nv * nv > 1.15) corner++;
    }
    const round = body.length >= 12 && rect.len / Math.max(rect.wid, 1e-6) < 1.25 && corner / body.length < 0.05;
    const shape: TwinShape = round
      ? { type: "cylinder", axis: "y", diameter: (rect.len + rect.wid) / 2, length: height }
      : { type: "box", size: [rect.len, height, rect.wid] };
    let c0 = cols, c1 = -1, r0 = rows, r1 = -1;
    for (const i of body) { const r = Math.floor(i / cols), c = i % cols; c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
    const cw = cloud.width / cols, ch = cloud.height / rows;
    const distance = Math.hypot(rect.cx - cloud.cam[0], base.y + height / 2 - cloud.cam[1], rect.cz - cloud.cam[2]);
    raw.push({
      twin_id: "o0", name: "unknown", label: "object", shape, position: [rect.cx, base.y + height / 2, rect.cz],
      yaw_deg: round ? 0 : rect.yawDeg, sits_on: base.surface_id, material: "other", load_bearing: false, cuttable: false,
      confidence: 0, error_m: cloud.spacingRad * distance + 0.005 + 0.01 * distance, points: body.length, distance_m: distance,
      bbox_px: [c0 * cw, r0 * ch, (c1 - c0 + 1) * cw, (r1 - r0 + 1) * ch], snapped: false, scan_ids: [scanId],
    });
  }
  const twins = raw.sort((a, b) => a.distance_m - b.distance_m).map((t, k) => ({ ...t, twin_id: `o${k + 1}` }));
  return { surfaces, twins };
}
```

- [ ] **Step 5: Run the tests.** Run `pnpm -F @cutonce/api test build-twins`. Expected: PASS. If one threshold fails on the synthetic scene, change only the value in `OPTIONS` and write the reason in a comment beside it. Don't change the test's tolerances.

- [ ] **Step 6: Commit.**

```bash
git add services/api/src/build/twins.ts services/api/tests/build-synth.ts services/api/tests/build-twins.test.ts
git commit -m "feat(build): twin builder: surfaces from an up-facing height histogram, objects from grid-connected points, box or cylinder fits"
```

---

### Task S5: Merge across scans, and fix sizes

**Files:**
- Create: `services/api/src/build/merge.ts`, `services/api/src/build/sizes.ts`
- Test: `services/api/tests/build-sizes.test.ts`

**Interfaces:**
- Consumes: `Twin`, `Surface` (S1); `Vocab`, `standardShape` (S3); `heightOf`, `flatSize` (S3).
- Produces: `mergeSurfaces(existing, incoming): { surfaces: Surface[]; idMap: Map<string, string> }`; `mergeTwins(existing, incoming): Twin[]` (session ids `o1…`, stable across scans); `appendTwin(existing, twin): Twin[]` (always a new id); `fixSizes(twins, vocab): Twin[]`.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-sizes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Surface } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { loadVocab } from "../src/build/data.js";
import { appendTwin, mergeSurfaces, mergeTwins } from "../src/build/merge.js";
import { fixSizes } from "../src/build/sizes.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT);
const table = (over: Partial<Surface> = {}): Surface => ({ surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1], points: 900, ...over });

describe("fixSizes", () => {
  it("snaps a can measured a little small to the standard size, keeping its base on the table", () => {
    const [t] = fixSizes([twin({ name: "tall_can" })], vocab);
    expect(t!.snapped).toBe(true);
    expect(t!.shape).toEqual({ type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 });
    expect(t!.position[1]).toBeCloseTo(0.74 + 0.0785, 4);
  });
  it("snaps a lump measured as a box when the label says can", () => {
    const [t] = fixSizes([twin({ name: "tall_can", shape: { type: "box", size: [0.07, 0.16, 0.065] } })], vocab);
    expect(t!.shape.type).toBe("cylinder");
  });
  it("keeps a well-measured object that is far from the standard size", () => {
    const [t] = fixSizes([twin({ name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.066, length: 0.30 }, points: 80 })], vocab);
    expect(t!.snapped).toBe(false);
  });
  it("gives a lying pizza box its standard size with the thin side up", () => {
    const [t] = fixSizes([twin({ name: "pizza_box", shape: { type: "box", size: [0.33, 0.045, 0.34] }, position: [0, 0.7625, 0.5] })], vocab);
    expect(t!.shape).toEqual({ type: "box", size: [0.35, 0.04, 0.35] });
  });
  it("makes identical unsized objects share the median size", () => {
    const boxes = [0.19, 0.2, 0.21].map((w, k) => twin({ twin_id: `o${k + 1}`, name: "cardboard_box", shape: { type: "box", size: [0.3, 0.12, w] } }));
    const out = fixSizes(boxes, vocab);
    expect(out.map((t) => (t.shape.type === "box" ? t.shape.size[2] : 0))).toEqual([0.2, 0.2, 0.2]);
  });
});

describe("merging scans", () => {
  it("keeps one twin for the same object seen twice, and adds new ones with new ids", () => {
    const first = mergeTwins([], [twin(), twin({ position: [0.3, 0.815, 0.5] })]);
    expect(first.map((t) => t.twin_id)).toEqual(["o1", "o2"]);
    const second = mergeTwins(first, [twin({ position: [0.005, 0.815, 0.502], points: 60, scan_ids: ["scan_b"] }), twin({ position: [-0.4, 0.815, 0.6] })]);
    expect(second.map((t) => t.twin_id)).toEqual(["o1", "o2", "o3"]);
    expect(second[0]!.scan_ids).toEqual(["scan_a", "scan_b"]);
    expect(second[0]!.points).toBe(60);
  });
  it("keeps the surer name", () => {
    const merged = mergeTwins([twin({ name: "tall_can", label: "tall can", confidence: 0.9 })], [twin({ name: "other", confidence: 0.4 })]);
    expect(merged[0]!.name).toBe("tall_can");
  });
  it("maps a surface seen again onto the same id", () => {
    const { surfaces, idMap } = mergeSurfaces([table()], [table({ surface_id: "s1", min: [-0.8, 0.1], max: [0.5, 1.1] }), table({ surface_id: "s2", kind: "floor", y: 0 })]);
    expect(surfaces.map((s) => s.surface_id)).toEqual(["s1", "s2"]);
    expect(surfaces[0]!.min).toEqual([-0.8, 0.1]);
    expect(idMap.get("s2")).toBe("s2");
  });
  it("appends a Director-added object even where another one stands", () => {
    expect(appendTwin([twin()], twin()).map((t) => t.twin_id)).toEqual(["o1", "o2"]);
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-sizes`. Expected: FAIL (modules missing).

- [ ] **Step 3: Write `services/api/src/build/merge.ts`:**

```ts
import type { Surface, Twin } from "@cutonce/schemas";
import { halfOf, heightOf } from "./shape.js";

const baseY = (t: Twin) => t.position[1] - heightOf(t.shape) / 2;
const narrowest = (t: Twin) => { const h = halfOf(t.shape); return 2 * Math.min(h[0], h[2]); };
const nextId = (twins: Twin[]) => twins.reduce((m, t) => Math.max(m, Number(t.twin_id.slice(1)) || 0), 0) + 1;

/** Same object: bases within 3 cm in height and centres closer than half its narrowest side (at least 4 cm). */
function same(a: Twin, b: Twin): boolean {
  const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
  return Math.abs(baseY(a) - baseY(b)) <= 0.03 && d <= Math.max(0.04, 0.5 * Math.min(narrowest(a), narrowest(b)));
}

/** Twins across scans: geometry from the better look (more points), the name from the surer label. Unseen twins stay. */
export function mergeTwins(existing: Twin[], incoming: Twin[]): Twin[] {
  const out = existing.map((t) => ({ ...t, scan_ids: [...t.scan_ids] }));
  let next = nextId(out);
  for (const t of incoming) {
    const match = out.find((e) => same(e, t));
    if (!match) { out.push({ ...t, twin_id: `o${next++}` }); continue; }
    const geo = t.points > match.points ? t : match;
    const name = t.confidence > match.confidence ? t : match;
    Object.assign(match, {
      shape: geo.shape, position: geo.position, yaw_deg: geo.yaw_deg, points: geo.points, distance_m: geo.distance_m, sits_on: geo.sits_on,
      error_m: Math.min(t.error_m, match.error_m), bbox_px: t.bbox_px ?? match.bbox_px, snapped: false,
      name: name.name, label: name.label, material: name.material, load_bearing: name.load_bearing, cuttable: name.cuttable, confidence: name.confidence,
      scan_ids: [...new Set([...match.scan_ids, ...t.scan_ids])],
    });
  }
  return out;
}

/** A Director-added object: always new, even where something already stands. */
export const appendTwin = (existing: Twin[], t: Twin): Twin[] => [...existing, { ...t, twin_id: `o${nextId(existing)}` }];

/** Surfaces across scans: same kind within 3 cm of height is the same surface (its extent grows); ids stay stable. */
export function mergeSurfaces(existing: Surface[], incoming: Surface[]): { surfaces: Surface[]; idMap: Map<string, string> } {
  const surfaces = existing.map((s) => ({ ...s, min: [...s.min] as [number, number], max: [...s.max] as [number, number] }));
  const idMap = new Map<string, string>();
  let next = surfaces.reduce((m, s) => Math.max(m, Number(s.surface_id.slice(1)) || 0), 0) + 1;
  for (const s of incoming) {
    const match = surfaces.find((e) => e.kind === s.kind && Math.abs(e.y - s.y) <= 0.03);
    if (!match) { const id = `s${next++}`; surfaces.push({ ...s, surface_id: id }); idMap.set(s.surface_id, id); continue; }
    match.min = [Math.min(match.min[0], s.min[0]), Math.min(match.min[1], s.min[1])];
    match.max = [Math.max(match.max[0], s.max[0]), Math.max(match.max[1], s.max[1])];
    match.points = Math.max(match.points, s.points);
    idMap.set(s.surface_id, match.surface_id);
  }
  return { surfaces, idMap };
}
```

- [ ] **Step 4: Write `services/api/src/build/sizes.ts`:**

```ts
import type { Twin, TwinShape } from "@cutonce/schemas";
import { standardShape, type Vocab } from "./data.js";
import { heightOf } from "./shape.js";

const SNAP = 0.25, SHARE = 0.15, TRUST_POINTS = 50;
const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * b;
const reseat = (t: Twin, shape: TwinShape): Twin => {
  const base = t.position[1] - heightOf(t.shape) / 2;
  return { ...t, shape, position: [t.position[0], base + heightOf(shape) / 2, t.position[2]] };
};

/**
 * Known products get their standard size when the measurement is within 25% of it, or when too few points were
 * measured to trust (under 50). Then identical unsized objects within 15% of each other share the median size,
 * so a board resting on "two identical boxes" is level.
 */
export function fixSizes(twins: Twin[], vocab: Vocab): Twin[] {
  const out = twins.map((t) => snap(t, vocab));
  const groups = new Map<string, Twin[]>();
  for (const t of out) if (!t.snapped && t.name !== "unknown" && t.name !== "other" && t.shape.type === "box") groups.set(t.name, [...(groups.get(t.name) ?? []), t]);
  for (const group of groups.values()) if (group.length > 1) share(group, out);
  return out;
}

function snap(t: Twin, vocab: Vocab): Twin {
  const item = vocab.get(t.name);
  const std = item ? standardShape(item) : null;
  if (!std) return t;
  if (std.type === "cylinder") {
    const d = t.shape.type === "cylinder" ? t.shape.diameter : (t.shape.size[0] + t.shape.size[2]) / 2;
    const close = within(d, std.diameter, SNAP) && within(heightOf(t.shape), std.length, SNAP);
    return close || t.points < TRUST_POINTS ? { ...reseat(t, std), snapped: true, error_m: 0.003, yaw_deg: 0 } : t;
  }
  const m = t.shape.type === "box" ? t.shape.size : [t.shape.diameter, heightOf(t.shape), t.shape.diameter];
  const order = [0, 1, 2].sort((i, j) => m[j]! - m[i]!);             // measured axes, largest first
  const close = order.every((axis, k) => within(m[axis]!, std.size[k]!, SNAP));
  if (!close && t.points >= TRUST_POINTS) return t;
  const size: [number, number, number] = [0, 0, 0];
  order.forEach((axis, k) => { size[axis] = std.size[k]!; });        // the largest standard side goes to the largest measured side
  return { ...reseat(t, { type: "box", size }), snapped: true, error_m: 0.003 };
}

function share(group: Twin[], out: Twin[]): void {
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  const sizes = group.map((t) => (t.shape.type === "box" ? t.shape.size : [0, 0, 0]));
  const med: [number, number, number] = [0, 1, 2].map((k) => median(sizes.map((s) => s[k]!))) as [number, number, number];
  if (!sizes.every((s) => s.every((v, k) => within(v, med[k]!, SHARE)))) return;
  for (const t of group) { const i = out.indexOf(t); out[i] = { ...reseat(t, { type: "box", size: med }), error_m: Math.max(...group.map((g) => g.error_m)) / 2 }; }
}
```

- [ ] **Step 5: Run the tests.** Run `pnpm -F @cutonce/api test build-sizes`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add services/api/src/build/merge.ts services/api/src/build/sizes.ts services/api/tests/build-sizes.test.ts
git commit -m "feat(build): merge twins and surfaces across scans; snap to standard sizes; identical boxes share one size"
```

---

### Task S6: Solver and stability check

**Files:**
- Create: `services/api/src/build/poly.ts`, `services/api/src/build/solver.ts`, `services/api/src/build/stability.ts`
- Test: `services/api/tests/build-solver.test.ts`

**Interfaces:**
- Consumes: `IdeaDraft`, `Orientation`, `Twin` (S1); `Vocab`, `Payload` (S3); `aabbOverlapDepth` from `@cutonce/project-model`.
- Produces (`solver.ts`): `interface Placed { twin_id; label; orientation; shape: TwinShape; position: Vec3; rests_on: string[] }` (a design-frame pose; `rests_on` holds twin ids, empty for the table); `oriented(twin, o): TwinShape | string`; `solve(draft, twins: Map<string, Twin>): { ok: true; placed: Placed[] } | { ok: false; reason: string }`; `aabbOfPlaced(p)`.
- Produces (`stability.ts`): `checkStability(placed, twins, vocab, payload): { ok: true } | { ok: false; reason: string }`.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-solver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IdeaDraft, PlaceStep, Twin } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { loadVocab, standardShape } from "../src/build/data.js";
import { solve } from "../src/build/solver.js";
import { checkStability } from "../src/build/stability.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT);
const std = (name: string, id: string): Twin => {
  const item = vocab.get(name)!;
  return twin({ twin_id: id, name, label: item.label, shape: standardShape(item) ?? { type: "box" as const, size: [0.3, 0.2, 0.12] as [number, number, number] }, material: item.material, load_bearing: item.load_bearing, error_m: 0.003, snapped: true });
};
const step = (s: Partial<PlaceStep> & { place: string }): PlaceStep => ({ orientation: "upright", on: [], at_cm: null, next_to: null, side: null, gap_cm: null, ...s });
const draft = (steps: PlaceStep[]): IdeaDraft => ({ title: "t", why: "w", tools: [], uses: steps.map((s) => s.place), steps });
const kit = new Map([std("tall_can", "o1"), std("tall_can", "o2"), std("tall_can", "o3"), std("pizza_box", "o4"), std("drink_can", "o5")].map((t) => [t.twin_id, t]));
const riser = draft([
  step({ place: "o1", at_cm: { x: -12, z: -12 } }), step({ place: "o2", at_cm: { x: 12, z: -12 } }), step({ place: "o3", at_cm: { x: 0, z: 12 } }),
  step({ place: "o4", orientation: "flat", on: ["o1", "o2", "o3"] }),
]);

describe("solve", () => {
  it("stands cans on the table and lays the board flat on their tops, centred", () => {
    const r = solve(riser, kit);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const board = r.placed[3]!;
    expect(board.shape).toEqual({ type: "box", size: [0.35, 0.04, 0.35] });
    expect(board.position[1]).toBeCloseTo(0.157 + 0.02, 6);
    expect(board.position[0]).toBeCloseTo(0, 6);
    expect(board.position[2]).toBeCloseTo(-0.04, 6);
    expect(board.rests_on).toEqual(["o1", "o2", "o3"]);
  });
  it("refuses supports of different heights, with the reason", () => {
    const r = solve(draft([step({ place: "o1", at_cm: { x: -12, z: 0 } }), step({ place: "o5", at_cm: { x: 12, z: 0 } }), step({ place: "o4", orientation: "flat", on: ["o1", "o5"] })]), kit);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/differ by 35 mm/);
  });
  it("refuses a can on its side", () => expect(solve(draft([step({ place: "o1", orientation: "on_side" })]), kit)).toMatchObject({ ok: false }));
  it("refuses overlaps", () => expect(solve(draft([step({ place: "o1", at_cm: { x: 0, z: 0 } }), step({ place: "o2", at_cm: { x: 3, z: 0 } })]), kit)).toMatchObject({ ok: false }));
  it("puts next_to things beside each other with the gap", () => {
    const r = solve(draft([step({ place: "o1" }), step({ place: "o2", next_to: "o1", side: "right", gap_cm: 4 })]), kit);
    expect(r.ok && r.placed[1]!.position[0]).toBeCloseTo(0.066 + 0.04, 6);
  });
});

describe("checkStability", () => {
  const solved = (d: IdeaDraft) => { const r = solve(d, kit); if (!r.ok) throw new Error(r.reason); return r.placed; };
  it("passes the three-can riser, even with a laptop on it", () =>
    expect(checkStability(solved(riser), kit, vocab, { label: "laptop", size_cm: [31, 1.6, 22], kg: 1.6 })).toEqual({ ok: true }));
  it("fails a board resting on one can at its edge, and says by how much", () => {
    const r = checkStability(solved(draft([step({ place: "o1" }), step({ place: "o4", orientation: "flat", on: ["o1"], at_cm: { x: 15, z: 0 } })])), kit, vocab, null);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/pizza box would tip/);
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-solver`. Expected: FAIL (modules missing).

- [ ] **Step 3: Write `services/api/src/build/poly.ts`:**

```ts
/** 2D convex polygons in the x/z plane, counter-clockwise. */
export type P2 = [number, number];

export const rectPoly = (cx: number, cz: number, hx: number, hz: number): P2[] =>
  [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];

export const circlePoly = (cx: number, cz: number, r: number, n = 16): P2[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cz + r * Math.sin((2 * Math.PI * i) / n)] as P2);

const side = (a: P2, b: P2, p: P2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Sutherland–Hodgman: the part of a convex polygon inside another convex polygon. */
export function clip(subject: P2[], clipper: P2[]): P2[] {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length > 0; i++) {
    const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!;
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!, q = input[(j + 1) % input.length]!;
      const pIn = side(a, b, p) >= 0, qIn = side(a, b, q) >= 0;
      if (pIn) out.push(p);
      if (pIn !== qIn) {
        const d1: P2 = [q[0] - p[0], q[1] - p[1]], d2: P2 = [b[0] - a[0], b[1] - a[1]];
        const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / (d1[0] * d2[1] - d1[1] * d2[0]);
        out.push([p[0] + t * d1[0], p[1] + t * d1[1]]);
      }
    }
  }
  return out;
}

/** Monotone-chain convex hull, counter-clockwise. */
export function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const build = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) { while (h.length >= 2 && side(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop(); h.push(p); }
    return h;
  };
  const lower = build(pts), upper = build([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** How far inside a counter-clockwise convex polygon a point is (negative: outside). A point or a line has no inside. */
export function margin(p: P2, poly: P2[]): number {
  if (poly.length < 3) return -Infinity;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) m = Math.min(m, side(a, b, p) / len);
  }
  return m;
}
```

- [ ] **Step 4: Write `services/api/src/build/solver.ts`:**

```ts
import { aabbOverlapDepth, type Aabb } from "@cutonce/project-model";
import type { IdeaDraft, Orientation, Twin, TwinShape, Vec3 } from "@cutonce/schemas";
import { halfOf } from "./shape.js";

/** An object's pose in the design frame: table top at y = 0, x to the viewer's right, z toward the viewer. */
export interface Placed { twin_id: string; label: string; orientation: Orientation; shape: TwinShape; position: Vec3; rests_on: string[] }
export type Solved = { ok: true; placed: Placed[] } | { ok: false; reason: string };

/** validate.ts's TOUCH_TOLERANCE: tops further apart than this fail V4 ("floats"). */
const TOUCH = 0.002;
const mm = (m: number) => Math.round(m * 1000);

/**
 * The shape as it rests. Orientation is expressed by the order of a box's sides and a cylinder's axis — never by a
 * rotation, which validate.ts cannot see.
 */
export function oriented(t: Twin, o: Orientation): TwinShape | string {
  if (t.shape.type === "cylinder") {
    return o === "upright" ? { type: "cylinder", axis: "y", diameter: t.shape.diameter, length: t.shape.length } : `the ${t.label} would roll on its side; stand it upright`;
  }
  const [d0, d1, d2] = [...t.shape.size].sort((a, b) => b - a) as [number, number, number];
  if (o === "flat") return { type: "box", size: [d0, d2, d1] };
  if (o === "upright") return { type: "box", size: [d1, d0, d2] };
  return { type: "box", size: [d0, d1, d2] };
}

export const aabbOfPlaced = (p: Placed): Aabb => {
  const h = halfOf(p.shape);
  return { min: [p.position[0] - h[0], p.position[1] - h[1], p.position[2] - h[2]], max: [p.position[0] + h[0], p.position[1] + h[1], p.position[2] + h[2]] };
};

function beside(other: Placed, half: Vec3, side: "left" | "right" | "front" | "back", gap: number): [number, number] {
  const o = halfOf(other.shape), [x, , z] = other.position;
  if (side === "right") return [x + o[0] + gap + half[0], z];
  if (side === "left") return [x - o[0] - gap - half[0], z];
  if (side === "front") return [x, z + o[2] + gap + half[2]];
  return [x, z - o[2] - gap - half[2]];
}

/** Turns placement steps into exact poses. Every refusal says why, in words the AI's repair round can act on. */
export function solve(draft: IdeaDraft, twins: Map<string, Twin>): Solved {
  const placed = new Map<string, Placed>();
  const order: Placed[] = [];
  let lastOnTable: Placed | null = null;
  const fail = (reason: string): Solved => ({ ok: false, reason });
  for (const [i, s] of draft.steps.entries()) {
    const t = twins.get(s.place);
    if (!t) return fail(`step ${i + 1} places ${s.place}, which is not in the inventory`);
    if (placed.has(t.twin_id)) return fail(`the ${t.label} is placed twice`);
    const shape = oriented(t, s.orientation);
    if (typeof shape === "string") return fail(shape);
    const half = halfOf(shape);
    let x: number, z: number, bottom: number;
    if (s.on.length > 0) {
      const supports: Placed[] = [];
      for (const id of s.on) {
        const p = placed.get(id);
        if (!p) return fail(`the ${t.label} rests on ${id}, which is not placed before it`);
        if (!twins.get(id)!.load_bearing) return fail(`the ${twins.get(id)!.label} cannot hold anything up`);
        supports.push(p);
      }
      const tops = supports.map((p) => p.position[1] + halfOf(p.shape)[1]);
      const hi = Math.max(...tops), lo = Math.min(...tops);
      if (hi - lo > TOUCH) return fail(`the tops of the ${supports.map((p) => p.label).join(" and the ")} differ by ${mm(hi - lo)} mm, so the ${t.label} would rock; use supports of the same height`);
      bottom = hi;
      [x, z] = s.at_cm ? [s.at_cm.x / 100, s.at_cm.z / 100]
        : [supports.reduce((a, p) => a + p.position[0], 0) / supports.length, supports.reduce((a, p) => a + p.position[2], 0) / supports.length];
    } else {
      bottom = 0;
      if (s.at_cm) [x, z] = [s.at_cm.x / 100, s.at_cm.z / 100];
      else if (s.next_to) {
        const other = placed.get(s.next_to);
        if (!other) return fail(`the ${t.label} goes next to ${s.next_to}, which is not placed before it`);
        [x, z] = beside(other, half, s.side ?? "right", (s.gap_cm ?? 2) / 100);
      } else if (lastOnTable) [x, z] = beside(lastOnTable, half, "right", 0.05);
      else [x, z] = [0, 0];
    }
    const p: Placed = { twin_id: t.twin_id, label: t.label, orientation: s.orientation, shape, position: [x, bottom + half[1], z], rests_on: [...s.on] };
    for (const q of order) if (aabbOverlapDepth(aabbOfPlaced(p), aabbOfPlaced(q)) > 0.001) return fail(`the ${t.label} would overlap the ${q.label}`);
    placed.set(t.twin_id, p); order.push(p);
    if (s.on.length === 0) lastOnTable = p;
  }
  return { ok: true, placed: order };
}
```

- [ ] **Step 5: Write `services/api/src/build/stability.ts`:**

```ts
import type { Twin } from "@cutonce/schemas";
import type { Payload, Vocab } from "./data.js";
import { centroid, circlePoly, clip, hull, margin, rectPoly, type P2 } from "./poly.js";
import { halfOf, volumeOf } from "./shape.js";
import type { Placed } from "./solver.js";

const DENSITY: Record<Twin["material"], number> = { cardboard: 60, metal: 1000, plastic: 900, glass: 1200, wood: 600, paper: 700, fabric: 200, ceramic: 1500, other: 300 };
const cm = (m: number) => (m * 100).toFixed(1);

const footprint = (p: Placed): P2[] => p.shape.type === "cylinder" && p.shape.axis === "y"
  ? circlePoly(p.position[0], p.position[2], p.shape.diameter / 2)
  : rectPoly(p.position[0], p.position[2], halfOf(p.shape)[0], halfOf(p.shape)[2]);

/**
 * Static tipping check. Every part rests flat, so sliding is impossible and the only failure is tipping. For each
 * object, the downward forces on it are its own weight at its centre, plus the load of each thing resting on it,
 * applied where they touch. Their combined point must fall inside what holds it up (its contact patches with its
 * supports, or its own footprint on the table) by at least max(1 cm, the size error). Deterministic and exact.
 */
export function checkStability(placed: Placed[], twins: Map<string, Twin>, vocab: Vocab, payload: Payload | null): { ok: true } | { ok: false; reason: string } {
  const byId = new Map(placed.map((p) => [p.twin_id, p]));
  const top = placed.at(-1)!;
  const mass = (p: Placed) => { const t = twins.get(p.twin_id)!; return volumeOf(p.shape) * (vocab.get(t.name)?.density_kg_m3 ?? DENSITY[t.material]); };
  const above = new Map<string, Placed[]>();
  for (const p of placed) for (const s of p.rests_on) above.set(s, [...(above.get(s) ?? []), p]);
  const carried = new Map<string, number>();
  const carriedBy = (p: Placed): number => {
    const hit = carried.get(p.twin_id);
    if (hit !== undefined) return hit;
    let m = mass(p) + (payload && p === top ? payload.kg : 0);
    for (const q of above.get(p.twin_id) ?? []) m += carriedBy(q) / q.rests_on.length;
    carried.set(p.twin_id, m);
    return m;
  };
  for (const p of placed) {
    const t = twins.get(p.twin_id)!;
    let m = mass(p) + (payload && p === top ? payload.kg : 0);
    let sx = m * p.position[0], sz = m * p.position[2];
    for (const q of above.get(p.twin_id) ?? []) {
      const patch = clip(footprint(q), footprint(p));
      if (patch.length === 0) continue;
      const share = carriedBy(q) / q.rests_on.length, c = centroid(patch);
      sx += share * c[0]; sz += share * c[1]; m += share;
    }
    const load: P2 = [sx / m, sz / m];
    const region = p.rests_on.length === 0 ? footprint(p) : hull(p.rests_on.flatMap((id) => clip(footprint(p), footprint(byId.get(id)!))));
    const need = Math.max(0.01, t.error_m, ...p.rests_on.map((id) => twins.get(id)!.error_m));
    const got = margin(load, region);
    if (got < need) {
      return { ok: false, reason: got < 0 || !Number.isFinite(got)
        ? `the ${t.label} would tip: its weight lands ${Number.isFinite(got) ? cm(-got) : "well"} cm outside what holds it up`
        : `the ${t.label} is only ${cm(got)} cm from tipping; it needs ${cm(need)} cm` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 6: Run the tests.** Run `pnpm -F @cutonce/api test build-solver`. Expected: PASS. The tipping reason for the edge case reads "the pizza box would tip…" or "the pizza box is only … from tipping". If it is the second, change the test's regex to `/pizza box (would tip|is only)/`: both are refusals.

- [ ] **Step 7: Commit.**

```bash
git add services/api/src/build/poly.ts services/api/src/build/solver.ts services/api/src/build/stability.ts services/api/tests/build-solver.test.ts
git commit -m "feat(build): placement solver (flat rests, 2 mm tops, no rotations) and a static tipping check with named reasons"
```

---

### Task S7: Rules, site and plan (every rule becomes a valid plan)

**Files:**
- Create: `services/api/src/build/rules.ts`, `services/api/src/build/site.ts`, `services/api/src/build/plan.ts`
- Test: `services/api/tests/build-plan.test.ts`

**Interfaces:**
- Consumes: `Placed`, `solve` (S6); `checkStability` (S6); `Rule`, `Payload`, `Vocab` (S3); `validatePlan` from `@cutonce/project-model`.
- Produces (`rules.ts`): `matchRules(rules, twins): { rule: Rule; draft: IdeaDraft; payload: Payload | null }[]` (role slots such as `can#2` are bound to twin ids).
- Produces (`site.ts`): `chooseSite(surface, pile: { min: [x, z]; max: [x, z] }, design: { w; d }, camera: Vec3): { position: Vec3; rotation_quat: [0, s, 0, c]; yaw_deg }`: the design's +Z faces the viewer, and it goes beside the pile where it fits on the surface.
- Produces (`plan.ts`): `toPlan(input: { ideaId; title; why; tools; source; ruleId; model; placed; twins; projectId }): { plan: Plan; twinOf: Record<string, string>; size: [w, d] }`. `part_surface` is the single base part (`step_01`); every other part is `part_<twin_id>` with one step each, bottom-up. The design is centred at the origin.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePlan } from "@cutonce/project-model";
import type { Surface, Twin } from "@cutonce/schemas";
import { REPO_ROOT } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { toPlan } from "../src/build/plan.js";
import { matchRules } from "../src/build/rules.js";
import { chooseSite } from "../src/build/site.js";
import { solve } from "../src/build/solver.js";
import { checkStability } from "../src/build/stability.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab);
let n = 0;
const std = (name: string, x = 0, z = 0.5): Twin => {
  const item = vocab.get(name)!;
  const shape = standardShape(item) ?? { type: "box" as const, size: [0.3, 0.2, 0.12] as [number, number, number] };
  return twin({ twin_id: `o${++n}`, name, label: item.label, shape, material: item.material, load_bearing: item.load_bearing, error_m: 0.003, snapped: true, position: [x, 0.8, z] });
};
const table: Surface = { surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1.0], points: 900 };

describe("every rule in data/build/rules.json", () => {
  const pile = [std("tall_can"), std("tall_can"), std("tall_can"), std("pizza_box"), std("cardboard_box"), std("drink_can")];
  const matched = matchRules(rules, pile);

  it("matches the demo pile", () => expect(matched.map((m) => m.rule.rule_id).sort()).toEqual(rules.map((r) => r.rule_id).sort()));

  for (const m of matched) {
    it(`${m.rule.rule_id} solves, stands with its payload, and passes the plan checker`, () => {
      const byId = new Map(pile.map((t) => [t.twin_id, t]));
      const solved = solve(m.draft, byId);
      if (!solved.ok) throw new Error(solved.reason);
      expect(checkStability(solved.placed, byId, vocab, m.payload)).toEqual({ ok: true });
      const { plan } = toPlan({ ideaId: "idea_test", title: m.draft.title, why: m.draft.why, tools: m.draft.tools, source: "rule", ruleId: m.rule.rule_id, model: "rules", placed: solved.placed, twins: byId, projectId: "proj_cutonce_demo" });
      expect(validatePlan(plan).filter((i) => i.severity === "error")).toEqual([]);
      expect(plan.parts.filter((p) => p.rests_on.length === 0).map((p) => p.part_id)).toEqual(["part_surface"]);
      expect(plan.parts.some((p) => p.rotation_quat)).toBe(false);
    });
  }
});

describe("matchRules", () => {
  it("needs identical cans for a rule that says same_name", () => {
    expect(matchRules(rules, [std("tall_can"), std("drink_can"), std("energy_can"), std("pizza_box")]).map((m) => m.rule.rule_id)).not.toContain("rule_laptop_riser");
  });
});

describe("chooseSite", () => {
  it("turns the design's front toward the viewer and puts it beside the pile, on the table", () => {
    const site = chooseSite(table, { min: [-0.1, 0.5], max: [0.1, 0.6] }, { w: 0.35, d: 0.35 }, [0, 1.6, -1]);
    expect(site.yaw_deg).toBeCloseTo(180, 0);
    expect(site.position[1]).toBeCloseTo(0.74);
    const [x, , z] = site.position;
    expect(x >= -0.6 + 0.175 && x <= 0.6 - 0.175 && z >= 0.2 && z <= 1.0).toBe(true);
    expect(Math.abs(x)).toBeGreaterThan(0.2);                     // beside the pile, not on it
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-plan`. Expected: FAIL (modules missing).

- [ ] **Step 3: Write `services/api/src/build/rules.ts`:**

```ts
import type { IdeaDraft, Twin } from "@cutonce/schemas";
import type { Payload, Rule } from "./data.js";

const best = (a: Twin, b: Twin) => b.confidence - a.confidence || a.distance_m - b.distance_m || a.twin_id.localeCompare(b.twin_id);

/** Every rule the pile can make, with its role slots ("can#2") bound to twin ids. Most confident, nearest objects first. */
export function matchRules(rules: Rule[], twins: Twin[]): { rule: Rule; draft: IdeaDraft; payload: Payload | null }[] {
  const out: { rule: Rule; draft: IdeaDraft; payload: Payload | null }[] = [];
  for (const rule of rules) {
    const used = new Set<string>(), binding = new Map<string, string>();
    let ok = true;
    for (const role of rule.roles) {
      const pool = twins.filter((t) => role.any_of.includes(t.name) && !used.has(t.twin_id)).sort(best);
      let pick: Twin[] = [];
      if (role.same_name) {
        for (const name of role.any_of) { const same = pool.filter((t) => t.name === name); if (same.length >= role.count) { pick = same.slice(0, role.count); break; } }
      } else pick = pool.slice(0, role.count);
      if (pick.length < role.count) { ok = false; break; }
      pick.forEach((t, k) => { used.add(t.twin_id); binding.set(`${role.role}#${k + 1}`, t.twin_id); });
    }
    if (!ok) continue;
    const id = (ref: string) => binding.get(ref) ?? ref;
    const steps = rule.steps.map((s) => ({ ...s, place: id(s.place), on: s.on.map(id), next_to: s.next_to ? id(s.next_to) : null }));
    out.push({ rule, payload: rule.payload, draft: { title: rule.title, why: rule.why, tools: rule.tools, uses: [...used], steps } });
  }
  return out;
}
```

- [ ] **Step 4: Write `services/api/src/build/site.ts`:**

```ts
import type { Surface, Vec3 } from "@cutonce/schemas";

type P2 = [number, number];

/**
 * Where the design's frame sits in the room. Its +Z (the front) turns toward the viewer; it goes to the right or
 * left of the pile, then in front of it, wherever it fits on the surface with 2 cm to spare. If nothing fits it goes
 * on the pile itself: those objects are about to move anyway. A turn θ about +Y takes design +X to (cos θ, -sin θ)
 * and +Z to (sin θ, cos θ) in the room's (x, z).
 */
export function chooseSite(surface: Surface, pile: { min: P2; max: P2 }, design: { w: number; d: number }, camera: Vec3):
  { position: Vec3; rotation_quat: [number, number, number, number]; yaw_deg: number } {
  const pc: P2 = [(pile.min[0] + pile.max[0]) / 2, (pile.min[1] + pile.max[1]) / 2];
  const theta = Math.atan2(camera[0] - pc[0], camera[2] - pc[1]);
  const right: P2 = [Math.cos(theta), -Math.sin(theta)], toward: P2 = [Math.sin(theta), Math.cos(theta)];
  const corners: P2[] = [[pile.min[0], pile.min[1]], [pile.max[0], pile.min[1]], [pile.max[0], pile.max[1]], [pile.min[0], pile.max[1]]];
  const reach = (dir: P2) => Math.max(...corners.map((c) => Math.abs((c[0] - pc[0]) * dir[0] + (c[1] - pc[1]) * dir[1])));
  const at = (dir: P2, k: number): P2 => [pc[0] + dir[0] * k, pc[1] + dir[1] * k];
  const gap = 0.05;
  const candidates: P2[] = [
    at(right, reach(right) + design.w / 2 + gap), at(right, -(reach(right) + design.w / 2 + gap)),
    at(toward, reach(toward) + design.d / 2 + gap), pc,
  ];
  const fits = (c: P2) => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P2[]).every(([sx, sz]) => {
    const x = c[0] + right[0] * sx * (design.w / 2) + toward[0] * sz * (design.d / 2);
    const z = c[1] + right[1] * sx * (design.w / 2) + toward[1] * sz * (design.d / 2);
    return x >= surface.min[0] + 0.02 && x <= surface.max[0] - 0.02 && z >= surface.min[1] + 0.02 && z <= surface.max[1] - 0.02;
  });
  const c = candidates.find(fits) ?? pc;
  return { position: [c[0], surface.y, c[1]], rotation_quat: [0, Math.sin(theta / 2), 0, Math.cos(theta / 2)], yaw_deg: (theta * 180) / Math.PI };
}
```

- [ ] **Step 5: Write `services/api/src/build/plan.ts`:**

```ts
import type { BuildStep, Material, Part, Plan, Twin } from "@cutonce/schemas";
import { aabbOfPlaced, type Placed } from "./solver.js";
import { dimsCm } from "./shape.js";

export interface PlanInput {
  ideaId: string; title: string; why: string; tools: string[]; source: "rule" | "ai"; ruleId: string | null; model: string;
  placed: Placed[]; twins: Map<string, Twin>; projectId: string;
}

const VERB = { upright: "Stand", flat: "Lay", on_side: "Turn" } as const;
const HOW = { upright: "upright", flat: "flat", on_side: "on its side" } as const;
const stepId = (i: number) => `step_${String(i).padStart(2, "0")}`;
const joinWords = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", the ")} and the ${w.at(-1)}`);

/**
 * A design as a normal Cut Once plan, centred on the origin. One base part, "part_surface" (the patch of table under
 * the build, top at y = 0), so V4's "exactly one datum" holds; the run's seed marks it built. One object per step,
 * bottom-up, so V6 holds. No rotation_quat anywhere (validate.ts ignores it).
 */
export function toPlan(input: PlanInput): { plan: Plan; twinOf: Record<string, string>; size: [number, number] } {
  const boxes = input.placed.map(aabbOfPlaced);
  const minX = Math.min(...boxes.map((b) => b.min[0])), maxX = Math.max(...boxes.map((b) => b.max[0]));
  const minZ = Math.min(...boxes.map((b) => b.min[2])), maxZ = Math.max(...boxes.map((b) => b.max[2]));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, w = maxX - minX, d = maxZ - minZ;

  const counts = new Map<string, number>();
  for (const p of input.placed) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  const label = new Map(input.placed.map((p) => {
    if ((counts.get(p.label) ?? 0) < 2) return [p.twin_id, p.label];
    const k = (seen.get(p.label) ?? 0) + 1; seen.set(p.label, k);
    return [p.twin_id, `${p.label} ${String.fromCharCode(64 + k)}`];       // "tall can A", "tall can B"
  }));

  const parts: Part[] = [{
    part_id: "part_surface", name: "Build area", aliases: ["table", "build area"], kind: "surface", layer: "build",
    shape: { type: "box", size: [w + 0.1, 0.005, d + 0.1] }, position: [0, -0.0025, 0], material_id: "mat_surface", step_id: stepId(1),
    rests_on: [], attaches_to: [], verify_hint: "the table under the outline is clear", install_minutes: 0.2, doc_refs: [],
  }];
  const materials: Material[] = [{ material_id: "mat_surface", name: "Build area", spec: "the table under the build", unit: "area", quantity: 1, used_by: ["part_surface"], doc_refs: [] }];
  const steps: BuildStep[] = [{
    step_id: stepId(1), index: 1, title: "Clear the build area", instruction: "Clear the space where the outline glows.",
    part_ids: ["part_surface"], requires: [], layer: "build", est_minutes: 0.2, materials: [], doc_refs: [],
  }];
  const twinOf: Record<string, string> = {};

  input.placed.forEach((p, i) => {
    const t = input.twins.get(p.twin_id)!, name = label.get(p.twin_id)!, partId = `part_${p.twin_id}`, matId = `mat_${p.twin_id}`, sid = stepId(i + 2);
    twinOf[partId] = p.twin_id;
    parts.push({
      part_id: partId, name, aliases: [t.label, t.name.replace(/_/g, " ")], kind: t.name, layer: "build", shape: p.shape,
      position: [p.position[0] - cx, p.position[1], p.position[2] - cz], material_id: matId, step_id: sid,
      rests_on: p.rests_on.length ? p.rests_on.map((id) => `part_${id}`) : ["part_surface"], attaches_to: [],
      verify_hint: `${name} ${HOW[p.orientation]}`, install_minutes: 0.2, doc_refs: [],
    });
    materials.push({ material_id: matId, name, spec: `${dimsCm(p.shape).join(" × ")} cm`, unit: "each", quantity: 1, used_by: [partId], doc_refs: [] });
    const where = p.rests_on.length ? ` on top of the ${joinWords(p.rests_on.map((id) => label.get(id)!))}` : " where its outline glows on the table";
    steps.push({
      step_id: sid, index: i + 2, title: `Place the ${name}`,
      instruction: `${VERB[p.orientation]} the ${name} ${HOW[p.orientation]}${where}.${i === 0 && input.why ? ` ${input.why}` : ""}`,
      part_ids: [partId], requires: [stepId(i + 1)], layer: "build", est_minutes: 0.2, materials: [{ material_id: matId, qty: 1 }], doc_refs: [],
    });
  });

  const plan: Plan = {
    plan_id: `plan_build_${input.ideaId.replace(/^idea_/, "")}`, project_id: input.projectId, name: input.title, revision: 1, status: "draft",
    frame: { handedness: "right", up: "+Y", units: "m", pose: "design", origin: "centre of the build area, on the table" },
    layers: ["build"], parts, materials, steps, markers: [], touch_points: [],
    provenance: {
      source_document_ids: [], extracted_by: input.source === "rule" ? `build mode rule ${input.ruleId}` : `build mode, ${input.model}`,
      assumptions: [input.why, ...(input.tools.length ? [`tools: ${input.tools.join(", ")}`] : [])], validation: [],
    },
  };
  return { plan, twinOf, size: [w, d] };
}
```

- [ ] **Step 6: Run the tests.** Run `pnpm -F @cutonce/api test build-plan`. Expected: PASS. If V4 reports "floats", the solver let a gap over 2 mm through, so fix the solver, not the checker.

- [ ] **Step 7: Commit.**

```bash
git add services/api/src/build/rules.ts services/api/src/build/site.ts services/api/src/build/plan.ts services/api/tests/build-plan.test.ts
git commit -m "feat(build): bind rules to the pile, place the design beside it facing the viewer, and emit a plan that passes validatePlan"
```

---

### Task S8: Labeller (one vision call names, splits, drops and adds)

**Files:**
- Modify: `services/api/src/copilot/annotate.ts` (a `neutral` mark colour)
- Create: `services/api/src/build/label.ts`
- Test: `services/api/tests/build-label.test.ts`

**Interfaces:**
- Consumes: `annotateFrame`, `Mark` (copilot); `jsonCall` (`services/api/src/llm.ts`); `Cloud` (S4); `Vocab`, `standardShape` (S3); `flatSize`, `heightOf`, `describeShape` (S3).
- Produces: `LabelResult` (zod); `labelTwins(deps: LabelDeps, photo, twins, surfaces, cloud): Promise<Twin[]>`; `applyLabels(marked, result, vocab, surfaces, cloud, scale): Twin[]` (pure); `interface LabelDeps { cfg; call; model; vocab; timeoutMs }`.

- [ ] **Step 1: Add the neutral colour.** In `services/api/src/copilot/annotate.ts`:

```ts
export interface Mark { n: number; bbox_px: [number, number, number, number]; state: "missing" | "built" | "wrong" | "neutral" }
const COLOUR: Record<Mark["state"], string> = { missing: "#00e5ff", built: "#39ff14", wrong: "#ff3b3b", neutral: "#ffd400" };
```

- [ ] **Step 2: Write the failing test** `services/api/tests/build-label.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT, loadConfig } from "../src/config.js";
import { loadVocab } from "../src/build/data.js";
import { applyLabels, labelTwins, type LabelResult } from "../src/build/label.js";
import { buildTwins, decodeScan } from "../src/build/twins.js";
import { CAMERA, FLOOR, TABLE, box, can, synthScan } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT);
const cloud = decodeScan(synthScan([FLOOR, TABLE, box(-0.2, 0.55, 0.13, 0.157, 0.066), can(0.15, 0.5)], CAMERA.cam, CAMERA.lookAt));
const { surfaces, twins } = buildTwins(cloud, "scan_synthetic");
const item = (n: number, over: Partial<LabelResult["objects"][number]> = {}) =>
  ({ n, is_object: true, name: "tall_can", other_name: null, count: 1, material: "metal" as const, load_bearing: true, cuttable: false, confidence: 0.9, ...over });

describe("applyLabels", () => {
  it("names objects from the vocabulary and splits a lump that is two cans side by side", () => {
    const lump = twins.findIndex((t) => t.shape.type === "box") + 1, single = twins.findIndex((t) => t.shape.type === "cylinder") + 1;
    const out = applyLabels(twins, { objects: [item(lump, { count: 2 }), item(single)], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out.filter((t) => t.name === "tall_can")).toHaveLength(3);
    expect(out.every((t) => t.label === "tall can")).toBe(true);
  });
  it("drops what is not an object and calls unknown names 'other' with their own label", () => {
    const out = applyLabels(twins, { objects: [item(1, { is_object: false }), item(2, { name: "banana", other_name: "banana" })], missed: [] }, vocab, surfaces, cloud, 1024 / 1280);
    expect(out).toHaveLength(1);
    expect([out[0]!.name, out[0]!.label]).toEqual(["other", "banana"]);
  });
  it("adds a missed clear bottle on the table at its standard size", () => {
    // A 60 × 160 px box in the 1024-wide annotated image, standing on the table near the image centre.
    const out = applyLabels(twins, { objects: [], missed: [{ name: "water_bottle", other_name: null, x: 482, y: 250, w: 60, h: 160 }] }, vocab, surfaces, cloud, 1024 / 1280);
    const bottle = out.find((t) => t.name === "water_bottle");
    expect(bottle?.sits_on).toBe(surfaces.find((s) => s.kind === "table")!.surface_id);
    expect(bottle?.shape).toEqual({ type: "cylinder", axis: "y", diameter: 0.065, length: 0.21 });
  });
});

describe("labelTwins", () => {
  it("sends the numbered photo and the plain photo, and applies the answer", async () => {
    const call = vi.fn(async (_cfg: unknown, _req: unknown) => ({ objects: twins.map((_, i) => item(i + 1)), missed: [] }));
    const photo = readFileSync(join(REPO_ROOT, "data", "fixtures", "frame_0001.jpg"));
    const out = await labelTwins({ cfg: loadConfig({}, { openaiKey: "k" }), call, model: "m", vocab, timeoutMs: 1000 }, photo, twins, surfaces, cloud);
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0]![1]).toMatchObject({ name: "build_labels", model: "m" });
    expect((call.mock.calls[0]![1] as { images: unknown[] }).images).toHaveLength(2);
    expect(out.every((t) => t.name === "tall_can")).toBe(true);
  });
});
```

The missed-bottle test assumes the table is visible at pixel (512 × 1.25, 410 × 1.25) = (640, 512) in the photo. If it fails on the "sits_on" line, print `cloud` values at that cell and move the box's `y` so that its bottom lands on the table.

- [ ] **Step 3: Run and see it fail.** Run `pnpm -F @cutonce/api test build-label`. Expected: FAIL (module missing).

- [ ] **Step 4: Write `services/api/src/build/label.ts`:**

```ts
import { z, type ZodTypeAny } from "zod";
import { S, type Surface, type Twin } from "@cutonce/schemas";
import type { Config } from "../config.js";
import { annotateFrame, type Mark } from "../copilot/annotate.js";
import type { JsonCall } from "../llm.js";
import { standardShape, type Vocab } from "./data.js";
import { describeShape, flatSize, heightOf } from "./shape.js";
import type { Cloud } from "./twins.js";

const LabelItem = z.object({
  n: z.number().int(), is_object: z.boolean(), name: z.string(), other_name: z.string().nullable(), count: z.number().int(),
  material: S.TwinMaterial, load_bearing: z.boolean(), cuttable: z.boolean(), confidence: z.number(),
});
const Missed = z.object({ name: z.string(), other_name: z.string().nullable(), x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const LabelResult = z.object({ objects: z.array(LabelItem), missed: z.array(Missed) });
export type LabelResult = z.infer<typeof LabelResult>;

/** jsonCall's shape without its generic, so tests can pass a plain mock; results are parsed where they are used. */
export type ModelCall = (cfg: Config, call: JsonCall<ZodTypeAny>) => Promise<unknown>;
export interface LabelDeps { cfg: Config; call: ModelCall; model: string; vocab: Vocab; timeoutMs: number }

const ANNOTATED_WIDTH = 1024;   // annotateFrame's output width: the model's pixel boxes are in this image

const system = (vocab: Vocab) => [
  "You label real objects for a mixed-reality build assistant. Image 1 has numbered yellow boxes around things a depth sensor found; image 2 is the same photo without boxes.",
  "For every number return one entry:",
  "- is_object: false for people, hands, walls, table edges, shadows, reflections, cables, or parts of furniture.",
  `- name: one of ${[...vocab.keys()].join(", ")}, or "other".`,
  "- other_name: a short plain name when name is \"other\", else null.",
  "- count: how many separate, identical objects the box covers (usually 1; 2 when two cans stand touching).",
  "- material, load_bearing (could it hold a pizza box on top without crushing or rolling?), cuttable (card, paper or foam you could cut with scissors), confidence 0–1.",
  "Then list in missed any clearly visible object with no box (clear bottles, glass, very thin things), with its pixel box in image 1. Never invent objects you cannot see.",
].join("\n");

/** One vision call over the numbered photo. Unlabelled twins stay "unknown"; the pipeline never waits twice. */
export async function labelTwins(deps: LabelDeps, photo: Buffer, twins: Twin[], surfaces: Surface[], cloud: Cloud): Promise<Twin[]> {
  const marked = twins.filter((t) => t.bbox_px);
  const marks: Mark[] = marked.map((t, i) => ({ n: i + 1, bbox_px: t.bbox_px!, state: "neutral" }));
  const annotated = await annotateFrame(photo, marks, ANNOTATED_WIDTH);
  const legend = marked.map((t, i) => `#${i + 1}: ${describeShape(t.shape)}, ${t.distance_m.toFixed(1)} m away`).join("\n");
  const result = LabelResult.parse(await deps.call(deps.cfg, {
    name: "build_labels", model: deps.model, schema: LabelResult, system: system(deps.vocab), timeoutMs: deps.timeoutMs,
    text: `Numbered objects (sizes are rough depth measurements):\n${legend || "(none)"}`,
    images: [{ data: annotated, mime: "image/jpeg" }, { data: photo, mime: "image/jpeg" }],
  }));
  return applyLabels(marked, result, deps.vocab, surfaces, cloud, ANNOTATED_WIDTH / cloud.width);
}

export function applyLabels(marked: Twin[], result: LabelResult, vocab: Vocab, surfaces: Surface[], cloud: Cloud, scale: number): Twin[] {
  const out: Twin[] = [];
  marked.forEach((t, i) => {
    const r = result.objects.find((o) => o.n === i + 1);
    if (!r) { out.push(t); return; }                         // skipped by the model: keep it, unnamed
    if (!r.is_object) return;
    const name = vocab.has(r.name) ? r.name : "other";
    const label = vocab.get(name)?.label ?? (r.other_name?.trim() || "object");
    const named: Twin = { ...t, name, label, material: r.material, load_bearing: r.load_bearing, cuttable: r.cuttable, confidence: Math.min(1, Math.max(0, r.confidence)) };
    out.push(...split(named, Math.max(1, Math.min(6, r.count))));
  });
  for (const m of result.missed) { const t = placeMissed(m, vocab, surfaces, cloud, scale); if (t) out.push(t); }
  return out;
}

/** "#4 is two cans": cut the footprint into equal pieces along its long side (local +X after yaw_deg). */
function split(t: Twin, count: number): Twin[] {
  if (count <= 1) return [t];
  const th = (t.yaw_deg * Math.PI) / 180, ax = Math.cos(th), az = -Math.sin(th);
  const len = t.shape.type === "box" ? t.shape.size[0] : t.shape.diameter, piece = len / count;
  return Array.from({ length: count }, (_, k) => {
    const off = (k + 0.5) * piece - len / 2;
    const shape: Twin["shape"] = t.shape.type === "box"
      ? { type: "box", size: [piece, t.shape.size[1], t.shape.size[2]] }
      : { ...t.shape, diameter: Math.min(t.shape.diameter, piece) };
    return { ...t, shape, position: [t.position[0] + ax * off, t.position[1], t.position[2] + az * off], points: Math.round(t.points / count) };
  });
}

/** A missed object (a clear bottle) stands on the surface under the bottom of its box in the photo, at its standard size. */
function placeMissed(m: z.infer<typeof Missed>, vocab: Vocab, surfaces: Surface[], cloud: Cloud, scale: number): Twin | null {
  const item = vocab.get(m.name), std = item ? standardShape(item) : null;
  if (!item || !std) return null;
  const px = (m.x + m.w / 2) / scale, py = (m.y + m.h) / scale;
  const col = Math.min(cloud.cols - 1, Math.max(0, Math.floor((px / cloud.width) * cloud.cols)));
  const row0 = Math.floor((py / cloud.height) * cloud.rows);
  for (let dr = 0; dr <= 3; dr++) {
    const row = Math.min(cloud.rows - 1, Math.max(0, row0 + dr)), i = row * cloud.cols + col;
    const x = cloud.xyz[3 * i]!, y = cloud.xyz[3 * i + 1]!, z = cloud.xyz[3 * i + 2]!;
    if (Number.isNaN(x)) continue;
    const s = surfaces.find((q) => Math.abs(q.y - y) <= 0.03 && x >= q.min[0] - 0.05 && x <= q.max[0] + 0.05 && z >= q.min[1] - 0.05 && z <= q.max[1] + 0.05);
    if (!s) continue;
    const shape: Twin["shape"] = std.type === "cylinder" ? std : { type: "box", size: flatSize(std.size) };
    return {
      twin_id: "o0", name: m.name, label: item.label, shape, position: [x, s.y + heightOf(shape) / 2, z], yaw_deg: 0, sits_on: s.surface_id,
      material: item.material, load_bearing: item.load_bearing, cuttable: item.cuttable, confidence: 0.6, error_m: 0.02, points: 0,
      distance_m: Math.hypot(x - cloud.cam[0], y - cloud.cam[1], z - cloud.cam[2]),
      bbox_px: [m.x / scale, m.y / scale, m.w / scale, m.h / scale], snapped: true, scan_ids: [],
    };
  }
  return null;
}
```

- [ ] **Step 5: Run the tests.** Run `pnpm -F @cutonce/api test build-label && pnpm -F @cutonce/api test annotate`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add services/api/src/copilot/annotate.ts services/api/src/build/label.ts services/api/tests/build-label.test.ts
git commit -m "feat(build): one vision call labels the numbered twins, splits merged ones, drops non-objects and adds missed clear bottles"
```

---

### Task S9: Ideas service (rules first, then AI, one repair round, cache, spoken summary)

**Files:**
- Create: `services/api/src/build/ideas.ts`
- Test: `services/api/tests/build-ideas.test.ts`

**Interfaces:**
- Consumes: `matchRules`, `solve`, `checkStability`, `toPlan`, `chooseSite` (S6, S7); `validatePlan`; `jsonCall`; `newId` (S2).
- Produces: `interface IdeasDeps { cfg; vocab; rules; call; model; cacheDir; timeoutMs; log }`; `interface IdeasInput { sessionId; twins; surfaces; camera: Vec3; photo: Buffer | null; request: string | null }`; `computeIdeas(deps, input, emit: (ideas: BuildIdea[], final: boolean) => void): Promise<BuildIdea[]>`; `summary(twins, ideas): string`; `inventoryText(twins, surfaces): string`; `canonical(twins): { key; toCanon; fromCanon }`.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-ideas.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BuildIdea, Surface, Twin } from "@cutonce/schemas";
import { REPO_ROOT, loadConfig } from "../src/config.js";
import { loadRules, loadVocab, standardShape } from "../src/build/data.js";
import { computeIdeas, summary } from "../src/build/ideas.js";
import { twin } from "./build-synth.js";

const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab);
const std = (id: string, name: string, x: number): Twin => {
  const item = vocab.get(name)!;
  return twin({ twin_id: id, name, label: item.label, shape: standardShape(item)!, material: item.material, load_bearing: item.load_bearing, error_m: 0.003, snapped: true, position: [x, 0.8, 0.5] });
};
const pile = [std("o1", "tall_can", 0.1), std("o2", "tall_can", 0.2), std("o3", "tall_can", 0.3), std("o4", "pizza_box", -0.2)];
const table: Surface = { surface_id: "s1", kind: "table", y: 0.74, min: [-0.6, 0.2], max: [0.6, 1.0], points: 900 };
const aiDraft = { title: "Can tower", why: "One can on another.", tools: [], uses: ["o1"], steps: [{ place: "o1", orientation: "upright" as const, on: [], at_cm: null, next_to: null, side: null, gap_cm: null }] };
const deps = (over: object = {}) => ({
  cfg: loadConfig({}, { openaiKey: "k" }), vocab, rules, model: "m", cacheDir: mkdtempSync(join(tmpdir(), "ideas-")), timeoutMs: 1000,
  log: { warn: () => {} }, call: vi.fn(async (_cfg: unknown, _req: unknown) => ({ ideas: [aiDraft] })), ...over,
});
const input = { sessionId: "bsess_t", twins: pile, surfaces: [table], camera: [0, 1.6, -1] as [number, number, number], photo: null, request: null };

describe("computeIdeas", () => {
  it("sends the rule ideas first, then the final list with the AI's", async () => {
    const emitted: { ideas: BuildIdea[]; final: boolean }[] = [];
    const out = await computeIdeas(deps(), input, (ideas, final) => emitted.push({ ideas, final }));
    expect(emitted.map((e) => e.final)).toEqual([false, true]);
    expect(emitted[0]!.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    expect(out.map((i) => i.title)).toEqual(["Laptop riser", "Can tower"]);
    expect(out[0]!.origin.position[1]).toBeCloseTo(0.74);
    expect(out[0]!.twin_of).toMatchObject({ part_o1: "o1" });
  });

  it("repairs a design that fails a check once, telling the model why", async () => {
    const bad = { ...aiDraft, title: "Rolling can", steps: [{ ...aiDraft.steps[0]!, orientation: "on_side" as const }] };
    const call = vi.fn().mockResolvedValueOnce({ ideas: [bad] }).mockResolvedValueOnce({ ideas: [aiDraft] });
    const out = await computeIdeas(deps({ call }), input, () => {});
    expect(call).toHaveBeenCalledTimes(2);
    expect((call.mock.calls[1]![1] as { text: string }).text).toMatch(/would roll on its side/);
    expect(out.map((i) => i.title)).toContain("Can tower");
  });

  it("reuses the AI's designs for the same pile without calling it again", async () => {
    const d = deps();
    await computeIdeas(d, input, () => {});
    const again = await computeIdeas(d, { ...input, twins: pile.map((t, k) => ({ ...t, twin_id: `o${k + 11}` })) }, () => {});
    expect(d.call).toHaveBeenCalledOnce();
    expect(again.find((i) => i.title === "Can tower")?.twin_of).toMatchObject({ part_o11: "o11" });
  });

  it("offers rule ideas only when there is no key", async () => {
    const d = deps({ cfg: loadConfig({}, { openaiKey: "" }) });
    const out = await computeIdeas(d, input, () => {});
    expect(d.call).not.toHaveBeenCalled();
    expect(out.map((i) => i.source)).toEqual(["rule"]);
  });
});

describe("summary", () => {
  it("says what it found and what you could build", () =>
    expect(summary(pile, [{ title: "Laptop riser" } as BuildIdea])).toBe("I found three tall cans and a pizza box. You could build a laptop riser."));
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-ideas`. Expected: FAIL (module missing).

- [ ] **Step 3: Write `services/api/src/build/ideas.ts`:**

```ts
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { validatePlan } from "@cutonce/project-model";
import { S, Strict, type BuildIdea, type IdeaDraft, type Surface, type Twin, type Vec3 } from "@cutonce/schemas";
import type { Config } from "../config.js";
import { writeJsonAtomic } from "../store/fs.js";
import type { Payload, Rule, Vocab } from "./data.js";
import { newId } from "./files.js";
import type { ModelCall } from "./label.js";
import { toPlan } from "./plan.js";
import { matchRules } from "./rules.js";
import { describeShape, dimsCm, halfOf, volumeOf } from "./shape.js";
import { chooseSite } from "./site.js";
import { solve } from "./solver.js";
import { checkStability } from "./stability.js";

export interface IdeasDeps {
  cfg: Config; vocab: Vocab; rules: Rule[]; call: ModelCall; model: string; cacheDir: string; timeoutMs: number;
  log: { warn: (o: object, m: string) => void };
}
export interface IdeasInput { sessionId: string; twins: Twin[]; surfaces: Surface[]; camera: Vec3; photo: Buffer | null; request: string | null }
type Candidate = { draft: IdeaDraft; source: "rule" | "ai"; ruleId: string | null; payload: Payload | null };

const Out = z.object({ ideas: z.array(S.IdeaDraft) });
const OutStrict = z.object({ ideas: z.array(Strict.IdeaDraft) });

const SYSTEM = [
  "You design small things a person can build right now from the real objects in front of them, like a Master Builder in the Lego Movie.",
  "You get an inventory of objects with measured sizes, and a photo. Return exactly 4 designs, each as bottom-up placement steps:",
  "- place: an object id from the inventory (each at most once).",
  "- orientation: upright (tallest side up), flat (thinnest side up) or on_side (middle side up). Cans, bottles, mugs and other cylinders can only be upright.",
  "- on: [] for the table, or ids already placed that it rests on. Supports must be able to hold weight and be the SAME height: use identical objects as supports.",
  "- at_cm: {x, z} on the table (x to the right, z toward the viewer, origin the centre of the build), or null.",
  "- next_to, side (left/right/front/back), gap_cm: or put it beside an object already on the table.",
  "Something resting on supports needs at least 3 supports that are not in a line, or one support at least as wide as it. Keep weight over what holds it.",
  "At most 6 objects. No cutting in this version. Title: 2–4 words saying what it is for. why: one fun sentence a judge would enjoy.",
].join("\n");

export function inventoryText(twins: Twin[], surfaces: Surface[]): string {
  const s = surfaces.map((x) => `${x.surface_id} ${x.kind} at ${Math.round(x.y * 100)} cm`).join("; ");
  const lines = twins.map((t) => `${t.twin_id} ${t.label}: ${describeShape(t.shape)}; ${t.material}; ${t.load_bearing ? "can hold weight" : "cannot hold weight"}${t.sits_on ? `; on ${t.sits_on}` : ""}`);
  return `Surfaces: ${s || "none"}.\nObjects:\n${lines.join("\n")}`;
}

/** Same names and sizes → same key; canonical ids c1… in name-then-size order, so cached designs map onto a new scan. */
export function canonical(twins: Twin[]) {
  const sorted = [...twins].sort((a, b) => a.name.localeCompare(b.name) || volumeOf(a.shape) - volumeOf(b.shape) || a.twin_id.localeCompare(b.twin_id));
  const key = createHash("sha1").update(sorted.map((t) => `${t.name}:${dimsCm(t.shape).map(Math.round).join("x")}`).join("|")).digest("hex").slice(0, 16);
  return { key, toCanon: new Map(sorted.map((t, i) => [t.twin_id, `c${i + 1}`])), fromCanon: new Map(sorted.map((t, i) => [`c${i + 1}`, t.twin_id])) };
}

const remap = (d: IdeaDraft, m: Map<string, string>): IdeaDraft | null => {
  const id = (x: string) => m.get(x);
  const ids = [...d.uses, ...d.steps.flatMap((s) => [s.place, ...s.on, ...(s.next_to ? [s.next_to] : [])])];
  if (ids.some((x) => !id(x))) return null;
  return { ...d, uses: d.uses.map((x) => id(x)!), steps: d.steps.map((s) => ({ ...s, place: id(s.place)!, on: s.on.map((x) => id(x)!), next_to: s.next_to ? id(s.next_to)! : null })) };
};

function buildSurface(twins: Twin[], surfaces: Surface[]): Surface | null {
  const votes = new Map<string, number>();
  for (const t of twins) if (t.sits_on) votes.set(t.sits_on, (votes.get(t.sits_on) ?? 0) + 1);
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return surfaces.find((s) => s.surface_id === top) ?? surfaces[0] ?? null;
}

function check(c: Candidate, byId: Map<string, Twin>, surface: Surface, input: IdeasInput, deps: IdeasDeps): { idea: BuildIdea } | { reason: string } {
  const missing = c.draft.steps.find((s) => !byId.has(s.place));
  if (missing) return { reason: `${missing.place} is not in the inventory` };
  const solved = solve(c.draft, byId);
  if (!solved.ok) return { reason: solved.reason };
  const stable = checkStability(solved.placed, byId, deps.vocab, c.payload);
  if (!stable.ok) return { reason: stable.reason };
  const ideaId = newId("idea");
  const { plan, twinOf, size } = toPlan({ ideaId, title: c.draft.title, why: c.draft.why, tools: c.draft.tools, source: c.source, ruleId: c.ruleId, model: deps.model, placed: solved.placed, twins: byId, projectId: deps.cfg.projectId });
  const error = validatePlan(plan).find((i) => i.severity === "error");
  if (error) return { reason: `plan check ${error.code}: ${error.message}` };
  const used = solved.placed.map((p) => byId.get(p.twin_id)!);
  const pile = {
    min: [Math.min(...used.map((t) => t.position[0] - Math.max(halfOf(t.shape)[0], halfOf(t.shape)[2]))), Math.min(...used.map((t) => t.position[2] - Math.max(halfOf(t.shape)[0], halfOf(t.shape)[2])))] as [number, number],
    max: [Math.max(...used.map((t) => t.position[0] + Math.max(halfOf(t.shape)[0], halfOf(t.shape)[2]))), Math.max(...used.map((t) => t.position[2] + Math.max(halfOf(t.shape)[0], halfOf(t.shape)[2])))] as [number, number],
  };
  const site = chooseSite(surface, pile, { w: size[0], d: size[1] }, input.camera);
  return { idea: {
    idea_id: ideaId, session_id: input.sessionId, source: c.source, rule_id: c.ruleId, title: c.draft.title, why: c.draft.why, tools: c.draft.tools,
    plan, origin: { position: site.position, rotation_quat: site.rotation_quat }, twin_of: twinOf, score: (c.source === "rule" ? 100 : 50) + used.length,
  } };
}

const top3 = (list: BuildIdea[]) => {
  const seen = new Set<string>();
  return [...list].sort((a, b) => b.score - a.score).filter((i) => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
};

/** Rule ideas go out as soon as they pass (final: false); the AI's join them in the final list. */
export async function computeIdeas(deps: IdeasDeps, input: IdeasInput, emit: (ideas: BuildIdea[], final: boolean) => void): Promise<BuildIdea[]> {
  const usable = input.twins.filter((t) => t.name !== "unknown" && t.confidence >= 0.5);
  const byId = new Map(usable.map((t) => [t.twin_id, t]));
  const surface = buildSurface(usable, input.surfaces);
  if (!surface || usable.length === 0) { emit([], true); return []; }
  const ruleIdeas = matchRules(deps.rules, usable)
    .map((m) => check({ draft: m.draft, source: "rule", ruleId: m.rule.rule_id, payload: m.payload }, byId, surface, input, deps))
    .flatMap((r) => ("idea" in r ? [r.idea] : []));
  if (ruleIdeas.length) emit(top3(ruleIdeas), false);
  let aiIdeas: BuildIdea[] = [];
  if (deps.cfg.openaiKey) {
    try { aiIdeas = await invent(deps, input, usable, byId, surface, ruleIdeas.map((i) => i.title)); }
    catch (err) { deps.log.warn({ err: (err as Error).message }, "AI build ideas failed; offering rule ideas only"); }
  }
  const all = top3([...ruleIdeas, ...aiIdeas]);
  emit(all, true);
  return all;
}

async function invent(deps: IdeasDeps, input: IdeasInput, usable: Twin[], byId: Map<string, Twin>, surface: Surface, offered: string[]): Promise<BuildIdea[]> {
  const canon = canonical(usable), cachePath = join(deps.cacheDir, `${canon.key}.json`);
  const text = inventoryText(usable, input.surfaces)
    + (offered.length ? `\nAlready offered, do not repeat: ${offered.join(", ")}.` : "")
    + (input.request ? `\nThe builder asked: "${input.request}".` : "");
  const ask = async (t: string, photo: Buffer | null) => Out.parse(await deps.call(deps.cfg, {
    name: "build_ideas", model: deps.model, schema: Out, strictSchema: OutStrict, system: SYSTEM, text: t, timeoutMs: deps.timeoutMs,
    images: photo ? [{ data: photo, mime: "image/jpeg" as const }] : [],
  }));
  const cached = !input.request && existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as { drafts: IdeaDraft[] }).drafts.map((d) => remap(d, canon.fromCanon)).filter((d): d is IdeaDraft => d !== null)
    : null;
  const drafts = cached ?? (await ask(text, input.photo)).ideas;
  const ai = (draft: IdeaDraft) => check({ draft, source: "ai", ruleId: null, payload: null }, byId, surface, input, deps);
  const ok: { draft: IdeaDraft; idea: BuildIdea }[] = [], failed: { draft: IdeaDraft; reason: string }[] = [];
  for (const draft of drafts) { const r = ai(draft); if ("idea" in r) ok.push({ draft, idea: r.idea }); else failed.push({ draft, reason: r.reason }); }
  if (!cached && failed.length) {
    const fix = `${text}\n\nThese designs failed a check. Fix each one and return only the fixed designs:\n${failed.map((f) => `- ${JSON.stringify(f.draft)}\n  failed because ${f.reason}`).join("\n")}`;
    for (const draft of (await ask(fix, null)).ideas) { const r = ai(draft); if ("idea" in r) ok.push({ draft, idea: r.idea }); }
  }
  if (!cached && ok.length) writeJsonAtomic(cachePath, { drafts: ok.map((o) => remap(o.draft, canon.toCanon)).filter(Boolean) });
  return ok.map((o) => o.idea);
}

const NUM = ["no", "a", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const list = (w: string[]) => (w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w.at(-1)}`);

/** What the voice says when the final ideas arrive. */
export function summary(twins: Twin[], ideas: Pick<BuildIdea, "title">[]): string {
  const counts = new Map<string, number>();
  for (const t of twins) if (t.name !== "unknown") counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
  const found = list([...counts.entries()].map(([label, n]) => (n === 1 ? `a ${label}` : `${NUM[n] ?? n} ${label}s`)));
  if (!found) return "I couldn't make out any objects. Try looking from a little closer.";
  if (!ideas.length) return `I found ${found}, but nothing I tried stands up. Add something flat to go on top, or three things the same height.`;
  return `I found ${found}. You could build ${list(ideas.map((i) => `a ${i.title.toLowerCase()}`))}.`;
}
```

- [ ] **Step 4: Run the tests.** Run `pnpm -F @cutonce/api test build-ideas`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add services/api/src/build/ideas.ts services/api/tests/build-ideas.test.ts
git commit -m "feat(build): ideas: rule designs stream first; AI designs checked, repaired once and cached by pile; a spoken summary"
```

---

### Task S10: Build sessions, the rest of the routes, and the hooks

**Files:**
- Modify: `services/api/src/app.ts` (`Hooks`)
- Modify: `services/api/src/copilot/routes.ts` (set `ctx.hooks.say`)
- Create: `services/api/src/build/session.ts`
- Modify: `services/api/src/build/routes.ts` (replace S2's version)
- Test: `services/api/tests/build-routes.test.ts`

**Interfaces:**
- Consumes: everything in S2–S9; `store.putDraft`, `store.approve`, `store.putSeed`, `store.createAssembly`; `normalise` from `copilot/fastpath.ts`.
- Produces: `Hooks.say?: (text) => { turn_id; audio_url }`; `Hooks.build?: { rethink(request): Promise<boolean>; startByName(transcript): Promise<string | null>; ideaTitles(): string[]; idle(): Promise<void> }`; `class BuildSessions`. Routes:
  - `POST /v1/build/scans` → 202 `{ scan_id, session_id }`, then asynchronously `build_inventory` (`labelled: false`), `build_inventory` (`labelled: true`), `build_ideas` (`final: false` when rules match), and `build_ideas` (`final: true`, with `audio_url` and `message`)
  - `GET /v1/build/scans`; `POST /v1/build/scans/:scan_id/replay { labels: "saved" | "live" }` → `{ session_id }`
  - `POST /v1/build/sessions` → `{ session_id }`; `GET /v1/build/sessions/current` → `{ session, surfaces, twins, ideas }`
  - `POST /v1/build/ideas/rethink { request }` → `{ accepted }`; `POST /v1/build/ideas/:idea_id/start` → `{ assembly_id, plan_id, revision }`
  - `POST /v1/build/objects { name }` → the added twin; `GET /v1/build/vocabulary`; `POST /v1/build/say { text }` → `{ turn_id, audio_url }`

- [ ] **Step 1: Write the failing test** `services/api/tests/build-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Twin, WsMessage } from "@cutonce/schemas";
import { KIT, CAMERA, photoB64, synthScan } from "./build-synth.js";
import { auth, makeApp } from "./helpers.js";

// The two model calls. Labels: name by shape, like the vision model would for the kit. Ideas: none (rules still apply).
vi.mock("../src/build/label.js", async (orig) => ({
  ...(await orig<object>()),
  labelTwins: vi.fn(async (_d: unknown, _p: unknown, twins: Twin[]) => twins.map((t) => t.shape.type === "cylinder"
    ? { ...t, name: "tall_can", label: "tall can", material: "metal", load_bearing: true, confidence: 0.9 }
    : { ...t, name: "pizza_box", label: "pizza box", material: "cardboard", load_bearing: true, cuttable: true, confidence: 0.9 })),
}));
vi.mock("../src/llm.js", async (orig) => ({ ...(await orig<object>()), jsonCall: vi.fn(async () => ({ ideas: [] })) }));

let t: Awaited<ReturnType<typeof makeApp>>;
let seen: WsMessage[];
beforeEach(async () => {
  t = await makeApp({ openaiKey: "test-key" });
  seen = [];
  t.app.ctx.store.bus.on("broadcast", (m) => seen.push(m));
});
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); });   // no scan may still be writing when the folder goes

const kitUpload = () => {
  const scan = synthScan(KIT, CAMERA.cam, CAMERA.lookAt);
  return { device_id: "quest", grid: scan.grid, points_mm: scan.points_mm, hit: scan.hit, camera: scan.camera, photo_b64: photoB64() };
};
const post = (url: string, payload: object) => t.app.inject({ method: "POST", url, headers: auth, payload });

describe("a scan of the kit", () => {
  it("streams outlines, then names, then the laptop riser, then the final list", async () => {
    expect((await post("/v1/build/scans", kitUpload())).statusCode).toBe(202);
    await t.app.ctx.hooks.build!.idle();
    const kinds = seen.map((m) => (m.type === "build_inventory" ? `inventory:${m.inventory.labelled}` : m.type === "build_ideas" ? `ideas:${m.final}` : m.type));
    expect(kinds).toEqual(["inventory:false", "inventory:true", "ideas:false", "ideas:true"]);
    const last = seen.at(-1)!;
    expect(last.type === "build_ideas" && last.ideas.map((i) => i.title)).toEqual(["Laptop riser"]);
    expect(last.type === "build_ideas" && last.message).toMatch(/You could build a laptop riser/);
  });

  it("starts the picked idea as a normal run with the build area already built", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    const { ideas } = (await t.app.inject({ method: "GET", url: "/v1/build/sessions/current", headers: auth })).json();
    const r = await post(`/v1/build/ideas/${ideas[0].idea_id}/start`, {});
    expect(r.statusCode).toBe(200);
    const { assembly_id, plan_id } = r.json();
    expect(plan_id).toBe(ideas[0].plan.plan_id);
    const state = t.app.ctx.store.getState(assembly_id);
    expect([state.progress.built, state.progress.total, state.current_step_id]).toEqual([1, 5, "step_02"]);
  });

  it("starts an idea by name for the copilot", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    expect(await t.app.ctx.hooks.build!.startByName("let's build the laptop riser")).toBe("Laptop riser");
  });

  it("replays a saved scan into a new session using its saved labels", async () => {
    const { scan_id } = (await post("/v1/build/scans", kitUpload())).json();
    await t.app.ctx.hooks.build!.idle();
    seen = [];
    const r = await post(`/v1/build/scans/${scan_id}/replay`, { labels: "saved" });
    await t.app.ctx.hooks.build!.idle();
    expect(r.json().session_id).toMatch(/^bsess_/);
    expect(seen.some((m) => m.type === "build_ideas" && m.final && m.ideas.length === 1)).toBe(true);
  });

  it("adds a missed object from the Director", async () => {
    await post("/v1/build/scans", kitUpload());
    await t.app.ctx.hooks.build!.idle();
    const r = await post("/v1/build/objects", { name: "drink_can" });
    expect(r.json()).toMatchObject({ name: "drink_can", snapped: true });
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-routes`. Expected: FAIL (`ctx.hooks.build` is undefined).

- [ ] **Step 3: Extend `Hooks`** in `services/api/src/app.ts`:

```ts
export interface Hooks {
  promoteCache?: (turnId: string, scriptedQueryId: string) => Promise<void>;
  /** Live PCM for a turn still being spoken; turns/routes.ts asks here before falling back to the finished file. */
  audioStream?: (turnId: string) => { stream: NodeJS.ReadableStream; contentType: string } | null;
  /** Speaks a sentence in the copilot's voice; the audio is at GET /v1/audio/:turn_id. Set by the copilot. */
  say?: (text: string) => { turn_id: string; audio_url: string };
  /** Build mode, for the copilot (set by build/routes.ts). */
  build?: {
    rethink: (request: string) => Promise<boolean>;
    startByName: (transcript: string) => Promise<string | null>;
    ideaTitles: () => string[];
    /** Resolves once every queued scan has been processed (tests, the eval CLI). */
    idle: () => Promise<void>;
  };
}
```

- [ ] **Step 4: Set the `say` hook** in `services/api/src/copilot/routes.ts`, right after `ctx.hooks.audioStream = …`:

```ts
  ctx.hooks.say = (text) => {
    const turnId = turns.newTurnId();
    speech.start(turnId, text);
    return { turn_id: turnId, audio_url: `/v1/audio/${turnId}` };
  };
```

- [ ] **Step 5: Write `services/api/src/build/session.ts`:**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildIdea, BuildScan, BuildScanUpload, Surface, Twin, Vec3 } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { normalise } from "../copilot/fastpath.js";
import { badRequest, notFound } from "../errors.js";
import { standardShape, type Rule, type Vocab } from "./data.js";
import { BuildFiles, newId } from "./files.js";
import { computeIdeas, summary } from "./ideas.js";
import { labelTwins, type ModelCall } from "./label.js";
import { appendTwin, mergeSurfaces, mergeTwins } from "./merge.js";
import { flatSize, heightOf } from "./shape.js";
import { fixSizes } from "./sizes.js";
import { buildTwins, decodeScan, type Cloud } from "./twins.js";

export interface BuildDeps {
  vocab: Vocab; rules: Rule[]; call: ModelCall; models: { label: string; ideas: string };
  log: { warn: (o: object, m: string) => void; error: (o: object, m: string) => void };
}
export interface Session {
  session_id: string; created_at: string; scans: string[]; surfaces: Surface[]; twins: Twin[]; ideas: BuildIdea[];
  camera: Vec3 | null; photo: string | null;
}

/**
 * One build session at a time (one headset). A scan is saved, answered at once (202), then processed in order:
 * outlines → names → sizes → rule ideas → AI ideas. Every step is broadcast, so the headset and /director update live.
 */
export class BuildSessions {
  readonly files: BuildFiles;
  private session: Session | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly ctx: Ctx, private readonly deps: BuildDeps) { this.files = new BuildFiles(ctx.cfg.dataDir, ctx.cfg.repoRoot); }

  current = () => this.session;
  idle = () => this.queue;
  ideaTitles = () => this.session?.ideas.map((i) => i.title) ?? [];

  newSession(): Session {
    this.session = { session_id: newId("bsess"), created_at: new Date().toISOString(), scans: [], surfaces: [], twins: [], ideas: [], camera: null, photo: null };
    return this.session;
  }

  accept(upload: BuildScanUpload): { scan_id: string; session_id: string } {
    const session = upload.session_id && this.session?.session_id === upload.session_id ? this.session : this.newSession();
    const scan = this.files.saveScan(upload, session.session_id);
    const photo = Buffer.from(upload.photo_b64, "base64");
    this.enqueue(() => this.process(session, scan, photo, "live"));
    return { scan_id: scan.scan_id, session_id: session.session_id };
  }

  replay(scanId: string, labels: "saved" | "live"): { session_id: string } {
    const { scan, photo } = this.files.readScan(scanId);
    const session = this.newSession();
    this.enqueue(() => this.process(session, { ...scan, session_id: session.session_id }, photo, labels));
    return { session_id: session.session_id };
  }

  rethink(request: string): Promise<boolean> {
    const s = this.session;
    if (!s || s.twins.length === 0) return Promise.resolve(false);
    const photo = s.photo && existsSync(s.photo) ? readFileSync(s.photo) : null;
    this.enqueue(() => this.ideas(s, photo, request));
    return Promise.resolve(true);
  }

  async startIdea(ideaId: string): Promise<{ assembly_id: string; plan_id: string; revision: number }> {
    const idea = this.session?.ideas.find((i) => i.idea_id === ideaId);
    if (!idea) throw notFound(`build idea ${ideaId}`);
    const { store } = this.ctx;
    const { revision } = store.putDraft(idea.plan);
    store.approve(idea.plan.plan_id, revision, "build mode");
    store.putSeed({ seed: "build_start", plan_id: idea.plan.plan_id, built: ["part_surface"] });
    const assembly = await store.createAssembly({ plan_id: idea.plan.plan_id, revision, seed: "build_start", name: `Build: ${idea.title}` });
    return { assembly_id: assembly.assembly_id, plan_id: idea.plan.plan_id, revision };
  }

  async startByName(transcript: string): Promise<string | null> {
    const said = normalise(transcript);
    const idea = this.session?.ideas.find((i) => said.includes(normalise(i.title)));
    if (!idea) return null;
    await this.startIdea(idea.idea_id);
    return idea.title;
  }

  /** The Director's "add a missed object": its standard size, standing in the middle of the main surface. */
  addObject(name: string): Twin {
    const item = this.deps.vocab.get(name);
    const std = item ? standardShape(item) : null;
    if (!item || !std) throw badRequest(`${name} is not a vocabulary object with a standard size`);
    const s = this.session ?? this.newSession();
    const surface = s.surfaces.find((x) => x.kind === "table") ?? s.surfaces[0] ?? null;
    const shape: Twin["shape"] = std.type === "cylinder" ? std : { type: "box", size: flatSize(std.size) };
    const [x, z] = surface ? [(surface.min[0] + surface.max[0]) / 2, (surface.min[1] + surface.max[1]) / 2] : [0, 0.5];
    const y = surface?.y ?? 0.74;
    s.twins = appendTwin(s.twins, {
      twin_id: "o0", name, label: item.label, shape, position: [x, y + heightOf(shape) / 2, z], yaw_deg: 0, sits_on: surface?.surface_id ?? null,
      material: item.material, load_bearing: item.load_bearing, cuttable: item.cuttable, confidence: 1, error_m: 0.003, points: 0,
      distance_m: 0, bbox_px: null, snapped: true, scan_ids: [],
    });
    this.broadcastInventory(s, s.twins, null, true, null);
    const photo = s.photo && existsSync(s.photo) ? readFileSync(s.photo) : null;
    this.enqueue(() => this.ideas(s, photo, null));
    return s.twins.at(-1)!;
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(work).catch((err) => this.deps.log.error({ err: (err as Error).message }, "build mode step failed"));
  }

  private async process(session: Session, scan: BuildScan, photo: Buffer, labels: "saved" | "live"): Promise<void> {
    try {
      const cloud = decodeScan(scan);
      const built = buildTwins(cloud, scan.scan_id);
      const { surfaces, idMap } = mergeSurfaces(session.surfaces, built.surfaces);
      const incoming = built.twins.map((t) => ({ ...t, sits_on: t.sits_on ? idMap.get(t.sits_on) ?? t.sits_on : null }));
      session.surfaces = surfaces; session.camera = scan.camera.position; session.scans.push(scan.scan_id);
      session.photo = join(this.files.scanDir(scan.scan_id), "photo.jpg");
      this.broadcastInventory(session, mergeTwins(session.twins, incoming), scan.scan_id, false,
        incoming.length ? null : "I couldn't see any objects. Try looking at them from a little closer.");
      const named = await this.label(scan, photo, incoming, surfaces, cloud, labels);
      session.twins = fixSizes(mergeTwins(session.twins, named), this.deps.vocab);
      this.broadcastInventory(session, session.twins, scan.scan_id, true, null);
      await this.ideas(session, photo, null);
    } catch (err) {
      this.broadcastInventory(session, session.twins, scan.scan_id, true, `I couldn't read that scan: ${(err as Error).message}`);
      throw err;
    } finally {
      this.files.saveSession(session);
    }
  }

  private async label(scan: BuildScan, photo: Buffer, incoming: Twin[], surfaces: Surface[], cloud: Cloud, mode: "saved" | "live"): Promise<Twin[]> {
    if (mode === "saved") { const saved = this.files.readLabels(scan.scan_id); if (saved) return saved; }
    if (!this.ctx.cfg.openaiKey || incoming.length === 0) return incoming;
    const out = await labelTwins({ cfg: this.ctx.cfg, call: this.deps.call, model: this.deps.models.label, vocab: this.deps.vocab, timeoutMs: 15_000 }, photo, incoming, surfaces, cloud);
    this.files.saveLabels(scan.scan_id, out);
    return out;
  }

  private async ideas(session: Session, photo: Buffer | null, request: string | null): Promise<void> {
    await computeIdeas(
      { cfg: this.ctx.cfg, vocab: this.deps.vocab, rules: this.deps.rules, call: this.deps.call, model: this.deps.models.ideas,
        cacheDir: join(this.files.root, "idea-cache"), timeoutMs: 20_000, log: this.deps.log },
      { sessionId: session.session_id, twins: session.twins, surfaces: session.surfaces, camera: session.camera ?? [0, 1.6, 0], photo, request },
      (ideas, final) => {
        session.ideas = ideas;
        const message = final ? summary(session.twins, ideas) : null;
        const audio = message ? this.ctx.hooks.say?.(message) ?? null : null;
        this.ctx.store.bus.emit("broadcast", { type: "build_ideas", session_id: session.session_id, ideas, final, audio_url: audio?.audio_url ?? null, message });
      },
    );
  }

  private broadcastInventory(session: Session, twins: Twin[], scanId: string | null, labelled: boolean, message: string | null): void {
    this.ctx.store.bus.emit("broadcast", { type: "build_inventory", inventory: { session_id: session.session_id, scan_id: scanId, labelled, surfaces: session.surfaces, twins, message } });
  }
}
```

- [ ] **Step 6: Replace `services/api/src/build/routes.ts`:**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { S } from "@cutonce/schemas";
import type { Ctx, Plugin } from "../app.js";
import { ApiError, badRequest } from "../errors.js";
import { jsonCall } from "../llm.js";
import { loadRules, loadVocab } from "./data.js";
import { BuildSessions } from "./session.js";

/** Build mode (the Lego Movie). Models: OPENAI_LABEL_MODEL and OPENAI_IDEAS_MODEL, each defaulting to OPENAI_MODEL. */
export const buildRoutes: Plugin = (app: FastifyInstance, ctx: Ctx) => {
  const vocab = loadVocab(ctx.cfg.repoRoot);
  const rules = loadRules(ctx.cfg.repoRoot, vocab);
  const sessions = new BuildSessions(ctx, {
    vocab, rules, call: jsonCall, log: app.log,
    models: { label: process.env.OPENAI_LABEL_MODEL || ctx.cfg.openaiModel, ideas: process.env.OPENAI_IDEAS_MODEL || ctx.cfg.openaiModel },
  });
  ctx.hooks.build = {
    rethink: (request) => sessions.rethink(request), startByName: (transcript) => sessions.startByName(transcript),
    ideaTitles: () => sessions.ideaTitles(), idle: () => sessions.idle(),
  };

  app.post("/v1/build/scans", { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const body = S.BuildScanUpload.safeParse(req.body);
    if (!body.success) throw badRequest("body must be a BuildScanUpload", body.error.issues);
    const { cols, rows } = body.data.grid;
    if (body.data.points_mm.length !== 3 * cols * rows || body.data.hit.length !== cols * rows) {
      throw badRequest(`a ${cols} × ${rows} grid needs ${3 * cols * rows} numbers and ${cols * rows} hit flags`);
    }
    return reply.status(202).send(sessions.accept(body.data));
  });
  app.get("/v1/build/scans", async () => ({ scans: sessions.files.listScans() }));
  app.post<{ Params: { scan_id: string } }>("/v1/build/scans/:scan_id/replay", async (req) => {
    const body = z.object({ labels: z.enum(["saved", "live"]).default("saved") }).safeParse(req.body ?? {});
    if (!body.success) throw badRequest("body must be { labels: \"saved\" | \"live\" }");
    return sessions.replay(req.params.scan_id, body.data.labels);
  });
  app.post("/v1/build/sessions", async () => ({ session_id: sessions.newSession().session_id }));
  app.get("/v1/build/sessions/current", async () => {
    const s = sessions.current();
    return { session: s ? { session_id: s.session_id, created_at: s.created_at, scans: s.scans } : null, surfaces: s?.surfaces ?? [], twins: s?.twins ?? [], ideas: s?.ideas ?? [] };
  });
  app.post("/v1/build/ideas/rethink", async (req) => {
    const body = z.object({ request: z.string().min(1).max(300) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { request }");
    return { accepted: await sessions.rethink(body.data.request) };
  });
  app.post<{ Params: { idea_id: string } }>("/v1/build/ideas/:idea_id/start", async (req) => sessions.startIdea(req.params.idea_id));
  app.post("/v1/build/objects", async (req) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { name }");
    return sessions.addObject(body.data.name);
  });
  app.get("/v1/build/vocabulary", async () => ({ items: [...vocab.values()].map(({ name, label }) => ({ name, label })) }));
  app.post("/v1/build/say", async (req) => {
    const body = z.object({ text: z.string().min(1).max(400) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { text }");
    const said = ctx.hooks.say?.(body.data.text);
    if (!said) throw new ApiError(503, "tts_unavailable", "the copilot's voice is not running");
    return said;
  });
};
```

- [ ] **Step 7: Let the intake test wait for the queue.** Scans are now processed after the 202. In `services/api/tests/build-intake.test.ts`, change `afterEach` to:

```ts
afterEach(async () => { await t.app.ctx.hooks.build!.idle(); await t.cleanup(); });
```

- [ ] **Step 8: Run the tests.** Run `pnpm -F @cutonce/api test build-routes build-intake`. Expected: PASS. S2's session test ("keeps the session when the headset sends it back") still holds, because `accept` reuses the current session when the ids match.

- [ ] **Step 9: Run everything.** Run `pnpm -F @cutonce/api test && pnpm typecheck`. Expected: PASS (the existing copilot tests don't touch build mode).

- [ ] **Step 10: Commit.**

```bash
git add services/api/src/app.ts services/api/src/copilot/routes.ts services/api/src/build/session.ts services/api/src/build/routes.ts services/api/tests/build-routes.test.ts services/api/tests/build-intake.test.ts
git commit -m "feat(build): sessions and routes: scans stream outlines, names and ideas; start an idea as a normal run; replay; say"
```

---

### Task S11: Copilot: build phrases, "done" for the step, and the router

**Files:**
- Modify: `services/api/src/copilot/fastpath.ts`, `services/api/src/copilot/pipeline.ts`, `services/api/src/copilot/models.ts`
- Create: `services/api/src/copilot/router.ts`
- Test: `services/api/tests/copilot.test.ts` (fast path), `services/api/tests/copilot-router.test.ts` (new), `services/api/tests/copilot-pipeline.test.ts` (mock the router; routing tests)

**Interfaces:**
- Consumes: `ctx.hooks.build` (S10); `CopilotAction` `start_scan` (S1).
- Produces: `FastPathInput.mode?`; `routeTurn(cfg, m, { transcript, mode, ideaTitles }, call?): Promise<{ flow: "question" | "build_ideas" | "modify_design"; confidence } | null>`; `ROUTE_MIN = 0.7`; `CopilotModels.router`, `budgets.route` (default 700 ms, `COPILOT_ROUTE_MS`).

- [ ] **Step 1: Write the failing fast-path tests.** Append inside the fast-path `describe` in `services/api/tests/copilot.test.ts`, which already has `input()`, `plan()`, `t` and `currentId()`:

```ts
  it("'what can I build' starts a scan without the model", () =>
    expect(matchFastPath("What can I build with this?", input())?.action).toEqual({ type: "start_scan" }));

  it("in build mode, 'done' with nothing pointed at marks the current step's parts and reads the next step", () => {
    const state = t.app.ctx.store.getState(currentId());
    const step = plan().steps.find((s) => s.step_id === state.current_step_id)!;
    const fast = matchFastPath("done", input({ mode: "build" }));
    expect(fast?.action).toEqual({ type: "mark_state", part_ids: step.part_ids.filter((id) => state.parts[id]?.state !== "built"), new_state: "built", source: "voice" });
    expect(fast?.answer_text).toMatch(/^Done\. Next: /);
  });
```

- [ ] **Step 2: Write the router's unit test** `services/api/tests/copilot-router.test.ts`:

```ts
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
  it("calls nothing without a key", async () => {
    const call = vi.fn();
    expect(await routeTurn(loadConfig({}, { openaiKey: "" }), m, input, call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Mock the router in the pipeline tests, and add routing tests.** In `services/api/tests/copilot-pipeline.test.ts`, next to the existing hoisted mocks:

```ts
const routeTurn = vi.hoisted(() => vi.fn());
vi.mock("../src/copilot/router.js", async (importOriginal) => ({ ...(await importOriginal<object>()), routeTurn }));
```

In `beforeEach`, after `ask.mockReset();`, add `routeTurn.mockReset(); routeTurn.mockResolvedValue(null);`. Then append:

```ts
describe("build-mode routing", () => {
  it("'what can I build' is instant: start_scan, no router and no answer model", async () => {
    transcribe.mockResolvedValue("what can I build");
    const body = (await query()).json();
    expect(body.action).toEqual({ type: "start_scan" });
    expect(ask).not.toHaveBeenCalled();
    expect(routeTurn).not.toHaveBeenCalled();
  });
  it("the router's build_ideas starts a scan without the answer model", async () => {
    transcribe.mockResolvedValue("could I make something useful out of all this junk");
    routeTurn.mockResolvedValue({ flow: "build_ideas", confidence: 0.9 });
    const body = (await query()).json();
    expect(body.action).toEqual({ type: "start_scan" });
    expect(ask).not.toHaveBeenCalled();
  });
  it("an unsure router asks back instead of guessing", async () => {
    transcribe.mockResolvedValue("could this be a thing");
    routeTurn.mockResolvedValue({ flow: "build_ideas", confidence: 0.4 });
    const body = (await query()).json();
    expect([body.action, body.needs_clarification]).toEqual([null, true]);
  });
  it("a question still goes to the answer model", async () => {
    transcribe.mockResolvedValue("where does this cable go");
    routeTurn.mockResolvedValue({ flow: "question", confidence: 0.95 });
    ask.mockResolvedValue(draft());
    expect((await query()).json().answer_text).toMatch(/cable tray/);
  });
});
```

- [ ] **Step 4: Run and see them fail.** Run `pnpm -F @cutonce/api test copilot`. Expected: FAIL (`router.js` is missing; `start_scan` is not matched).

- [ ] **Step 5: Add the router's settings** in `services/api/src/copilot/models.ts`. Add `router: string;` to `CopilotModels` and `route: number` to `budgets`. In `models()`:

```ts
    // The flow router: a small, fast model. Defaults to the copilot's model so it works before a cheaper one is chosen.
    router: env.OPENAI_ROUTER_MODEL || env.OPENAI_COPILOT_MODEL || cfg.openaiModel,
```

and in `budgets`: `route: num(env.COPILOT_ROUTE_MS, 700),`.

- [ ] **Step 6: Write `services/api/src/copilot/router.ts`:**

```ts
import { z, type ZodTypeAny } from "zod";
import type { Config } from "../config.js";
import { jsonCall, type JsonCall } from "../llm.js";
import type { CopilotModels } from "./models.js";

export const Routed = z.object({ flow: z.enum(["question", "build_ideas", "modify_design"]), confidence: z.number() });
export type Routed = z.infer<typeof Routed>;
/** Below this the copilot asks back rather than guessing a flow. */
export const ROUTE_MIN = 0.7;
export interface RouteInput { transcript: string; mode: string; ideaTitles: string[] }
type Call = (cfg: Config, call: JsonCall<ZodTypeAny>) => Promise<unknown>;

export const ROUTER_SYSTEM = [
  "You route one spoken sentence for Cut Once, a mixed-reality build assistant. Pick exactly one flow:",
  "- build_ideas: they want ideas for what to build or make from the things around them, or want the room scanned again.",
  "  e.g. \"what can I build\", \"what could we make with this stuff\", \"can I build a shelf with these\", \"scan again\", \"look at this too\".",
  "- modify_design: ideas are on show or a build is under way, and they want a different or changed design.",
  "  e.g. \"make it taller\", \"use the other box\", \"something for my phone instead\", \"a smaller one\".",
  "- question: everything else: how to do the current step, where a piece goes, why, what something is, whether it is right.",
  "  e.g. \"how do I build the shelf\", \"where does this go\", \"why the cans at the back\", \"is this straight\", \"what's next\".",
  "If no ideas are on show and no build is under way, modify_design is unlikely. Give your confidence from 0 to 1.",
].join("\n");

/** Which flow a spoken turn wants. Null means "treat it as a question": no key, a timeout, an error or a malformed answer. */
export async function routeTurn(cfg: Config, m: CopilotModels, input: RouteInput, call: Call = jsonCall): Promise<Routed | null> {
  if (!cfg.openaiKey) return null;
  const work = call(cfg, {
    name: "route", model: m.router, schema: Routed, system: ROUTER_SYSTEM, timeoutMs: m.budgets.route,
    text: `MODE: ${input.mode}\nIDEAS ON SHOW: ${input.ideaTitles.join(", ") || "none"}\nSAID: "${input.transcript}"`,
  }).then((r) => Routed.parse(r));
  const timeout = new Promise<null>((resolve) => { const t = setTimeout(() => resolve(null), m.budgets.route); t.unref?.(); });
  try { return await Promise.race([work, timeout]); } catch { return null; }
}
```

- [ ] **Step 7: Add the fast-path build phrases and step "done"** in `services/api/src/copilot/fastpath.ts`. Add `mode?: "upload" | "overlay" | "build"` to `FastPathInput`, and destructure `mode` in `matchFastPath` next to `plan, state, …`. Put this before the `"next" / "back"` block:

```ts
  // "What can I build?": the rehearsed line never depends on a model. The headset scans and uploads.
  if (/^(what can (i|we) (build|make)( with (this|these|that|all this|all of this|this stuff))?|what could (i|we) (build|make)( with (this|these|that))?|help me build something|build something|make something|scan (this|that|again|the table)|look again)$/.test(text)) {
    return { action: { type: "start_scan" }, answer_text: "Let me see what you've got.", highlight_parts: [] };
  }
```

Change the first line inside the `"done"` branch from `if (!selectedPartId) return null;` to:

```ts
    if (!selectedPartId) return mode === "build" ? stepDone(plan, state) : null; // build mode: you're holding the piece, not pointing
```

and add at the end of the file:

```ts
/** Build mode's "done": every part of the current step that is not built yet, then the next step, read out. */
function stepDone(plan: Plan, state: BuildState): FastPath | null {
  const step = plan.steps.find((s) => s.step_id === state.current_step_id);
  const todo = step?.part_ids.filter((id) => state.parts[id]?.state !== "built") ?? [];
  if (!step || todo.length === 0) return null;
  const next = plan.steps.find((s) => s.index === step.index + 1);
  return {
    action: { type: "mark_state", part_ids: todo, new_state: "built", source: "voice" },
    answer_text: next ? `Done. Next: ${next.instruction}` : "Done. That's the whole build!",
    highlight_parts: next?.part_ids ?? [],
  };
}
```

- [ ] **Step 8: Wire the router into `services/api/src/copilot/pipeline.ts`.** Add the imports:

```ts
import { ROUTE_MIN, routeTurn } from "./router.js";
```

Pass the mode into the fast path:

```ts
  const fast = matchFastPath(transcript, { plan: g.plan, state: g.state, selectedPartId: input.context.selected_part_id, recentEvents: g.recentEvents, mode: input.context.mode });
```

Replace the block from `// Retrieval and annotation are independent…` through the closing `]);` of its `Promise.all` with:

```ts
  // Build mode: saying an idea's name starts it. The titles live on the server, so no model is needed.
  if (input.context.mode === "build" && ctx.hooks.build) {
    const title = await ctx.hooks.build.startByName(transcript);
    if (title) return quick(deps, turnId, transcript, `Building the ${title.toLowerCase()}. Watch the pieces.`, null, timings, t0, recordTurn);
  }

  // Retrieval and annotation are independent of each other and of the model, so they overlap — and with the router.
  const { marks, legend } = markUp(input.context.visible_parts);
  const retrieveStart = Date.now();
  const retrieving = retrieve(ctx.cfg, { query: searchQuery(transcript, g.selected), projectId: g.plan.project_id, partId: input.context.selected_part_id, k: 5 }, log)
    .then((c) => { timings.retrieve = since(retrieveStart); return c; });
  retrieving.catch(() => {});      // a build-mode early return must not leave a rejection unhandled; the await below still throws
  const annotating = (async () => {
    if (!input.frame) return null; // no camera frame: the model answers from the tables and documents
    const start = Date.now();
    try {
      const out = await annotateFrame(input.frame, marks);
      timings.annotate = since(start);
      return out;
    } catch (err) {
      // Annotation is an aid, not a requirement: the raw frame and the tables still answer the question.
      log.warn({ err: (err as Error).message }, "frame annotation failed; sending the raw frame only");
      timings.annotate = since(start);
      return null;
    }
  })();

  // The router decides the flow. Anything but a sure "question" skips the answer model entirely.
  const routeStart = Date.now();
  const routed = await routeTurn(ctx.cfg, m, { transcript, mode: input.context.mode, ideaTitles: ctx.hooks.build?.ideaTitles() ?? [] });
  timings.route = since(routeStart);
  if (routed && routed.flow !== "question") {
    if (routed.confidence < ROUTE_MIN) return quick(deps, turnId, transcript, "Do you want ideas for what to build, or an answer about this step?", null, timings, t0, recordTurn, true);
    if (routed.flow === "build_ideas") return quick(deps, turnId, transcript, "Let me see what you've got.", { type: "start_scan" }, timings, t0, recordTurn);
    if (ctx.hooks.build && (await ctx.hooks.build.rethink(transcript))) return quick(deps, turnId, transcript, "Let me rethink that.", null, timings, t0, recordTurn);
  }
  const [chunks, annotated] = await Promise.all([retrieving, annotating]);
```

and add this helper next to `capped`:

```ts
/** A one-line spoken reply that skips the answer model (build-mode routing). */
function quick(
  deps: Deps, turnId: string, transcript: string, text: string, action: CopilotAction | null, timings: Record<string, number>, t0: number,
  recordTurn: (r: CopilotResponse, chunkIds: string[]) => void, clarify = false,
): CopilotResponse {
  deps.speech.start(turnId, text);
  const response: CopilotResponse = {
    ...shell(turnId, transcript), answer_text: text, action, confidence: 1, needs_clarification: clarify,
    audio_url: `/v1/audio/${turnId}`, timings_ms: { ...timings, total_to_response: since(t0) },
  };
  recordTurn(response, []);
  return response;
}
```

- [ ] **Step 9: Run the tests.** Run `pnpm -F @cutonce/api test && pnpm typecheck`. Expected: PASS. The existing pipeline tests still pass because the mocked router returns `null`.

- [ ] **Step 10: Commit.**

```bash
git add services/api/src/copilot services/api/tests/copilot.test.ts services/api/tests/copilot-router.test.ts services/api/tests/copilot-pipeline.test.ts
git commit -m "feat(copilot): build phrases and step 'done' in the fast path; a small-model router (question / build ideas / modify) with a 700 ms budget"
```

---

### Task S12: Recordings, the eval CLI and the router test set

**Files:**
- Create: `services/api/src/cli/build-record.ts`, `services/api/src/cli/build-eval.ts`
- Create: `data/build/router-eval.json`
- Modify: root `package.json` (scripts `build:record`, `build:eval`)
- Test: `services/api/tests/build-eval.test.ts`

**Interfaces:**
- Produces: `pnpm build:record <scan_id> <name>` copies a runtime scan (and its `labels.json`) to `data/build/recordings/<name>/` and writes a `truth.json` to correct by hand. `pnpm build:eval [--live] [--router] [--check]` prints per-recording metrics. `scoreRecording(twins, truth): { found; truth; labelsRight; labelled; sizeErrCm: number[] }` (pure).
- `truth.json`: `{ "objects": [{ "name": "tall_can", "size_cm": [15.7, 6.6, 6.6] }] }`, with sizes in cm in any order, tape-measured.

- [ ] **Step 1: Write the failing test** `services/api/tests/build-eval.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreRecording } from "../src/cli/build-eval.js";
import { twin } from "./build-synth.js";

describe("scoreRecording", () => {
  it("matches twins to the truth by name, closest size first, and reports size errors in cm", () => {
    const twins = [
      twin({ twin_id: "o1", name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.066, length: 0.157 } }),
      twin({ twin_id: "o2", name: "tall_can", shape: { type: "cylinder", axis: "y", diameter: 0.07, length: 0.17 } }),
      twin({ twin_id: "o3", name: "other" }),
    ];
    const s = scoreRecording(twins, { objects: [{ name: "tall_can", size_cm: [15.7, 6.6, 6.6] }, { name: "pizza_box", size_cm: [35, 35, 4] }] });
    expect([s.found, s.truth, s.labelsRight, s.labelled]).toEqual([1, 2, 1, 2]);
    expect(s.sizeErrCm).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm -F @cutonce/api test build-eval`. Expected: FAIL (module missing).

- [ ] **Step 3: Write `services/api/src/cli/build-eval.ts`:**

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Twin } from "@cutonce/schemas";
import { loadConfig, REPO_ROOT } from "../config.js";
import { loadRules, loadVocab } from "../build/data.js";
import { BuildFiles } from "../build/files.js";
import { computeIdeas } from "../build/ideas.js";
import { labelTwins } from "../build/label.js";
import { fixSizes } from "../build/sizes.js";
import { dimsCm } from "../build/shape.js";
import { buildTwins, decodeScan } from "../build/twins.js";
import { routeTurn } from "../copilot/router.js";
import { models } from "../copilot/models.js";
import { jsonCall } from "../llm.js";

export interface Truth { objects: { name: string; size_cm: number[] }[] }

/** found: truth objects matched by a twin of the same name; labelsRight: named twins whose name is in the truth. */
export function scoreRecording(twins: Twin[], truth: Truth) {
  const named = twins.filter((t) => t.name !== "unknown" && t.name !== "other");
  const pool = [...named], sizeErrCm: number[] = [];
  let found = 0;
  for (const o of truth.objects) {
    const want = [...o.size_cm].sort((a, b) => b - a);
    const err = (t: Twin) => Math.max(...dimsCm(t.shape).map((v, k) => Math.abs(v - want[k]!)));
    const cands = pool.filter((t) => t.name === o.name).sort((a, b) => err(a) - err(b));
    if (!cands[0]) continue;
    found++; sizeErrCm.push(Math.round(err(cands[0]) * 10) / 10); pool.splice(pool.indexOf(cands[0]), 1);
  }
  const names = truth.objects.map((o) => o.name);
  const labelsRight = named.filter((t) => { const i = names.indexOf(t.name); if (i < 0) return false; names.splice(i, 1); return true; }).length;
  return { found, truth: truth.objects.length, labelsRight, labelled: named.length, sizeErrCm };
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const q = (v: number[], p: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))]! : NaN);

async function main() {
  const args = new Set(process.argv.slice(2));
  const cfg = loadConfig();
  const vocab = loadVocab(REPO_ROOT), rules = loadRules(REPO_ROOT, vocab), files = new BuildFiles(cfg.dataDir, REPO_ROOT);
  const log = { warn: (o: object, m: string) => console.warn(m, o) };
  let bad = false;

  if (args.has("--router")) {
    const set = JSON.parse(readFileSync(join(REPO_ROOT, "data", "build", "router-eval.json"), "utf8")) as { said: string; mode: string; ideas: string[]; expect: string }[];
    const m = { ...models(cfg), budgets: { ...models(cfg).budgets, route: 5000 } };
    let right = 0;
    for (const c of set) {
      const r = await routeTurn(cfg, m, { transcript: c.said, mode: c.mode, ideaTitles: c.ideas });
      const got = r && r.confidence >= 0.7 ? r.flow : "question";
      if (got === c.expect) right++; else console.log(`  ✗ "${c.said}" → ${got} (${r?.confidence ?? "–"}), expected ${c.expect}`);
    }
    console.log(`router: ${right}/${set.length} = ${pct(right, set.length)} (bar 97%)`);
    if (right / set.length < 0.97) bad = true;
  }

  const dir = files.recordingsDir;
  const recs = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, "truth.json"))) : [];
  const all = { found: 0, truth: 0, labelsRight: 0, labelled: 0, sizeErrCm: [] as number[] };
  for (const name of recs) {
    const { scan, photo } = files.readScan(`scan_rec_${name}`);
    const t0 = Date.now(), cloud = decodeScan(scan), built = buildTwins(cloud, scan.scan_id), msTwins = Date.now() - t0;
    const saved = files.readLabels(scan.scan_id);
    const named = args.has("--live") || !saved
      ? await labelTwins({ cfg, call: jsonCall, model: process.env.OPENAI_LABEL_MODEL || cfg.openaiModel, vocab, timeoutMs: 20_000 }, photo, built.twins, built.surfaces, cloud)
      : saved;
    const twins = fixSizes(named, vocab);
    const ideas = await computeIdeas({ cfg: args.has("--live") ? cfg : { ...cfg, openaiKey: "" }, vocab, rules, call: jsonCall, model: cfg.openaiModel, cacheDir: join(files.root, "idea-cache"), timeoutMs: 20_000, log },
      { sessionId: "bsess_eval", twins, surfaces: built.surfaces, camera: scan.camera.position, photo, request: null }, () => {});
    const s = scoreRecording(twins, JSON.parse(readFileSync(join(dir, name, "truth.json"), "utf8")) as Truth);
    console.log(`${name}: found ${s.found}/${s.truth} (${pct(s.found, s.truth)}), labels ${pct(s.labelsRight, s.labelled)}, size err median ${q(s.sizeErrCm, 0.5)} cm p90 ${q(s.sizeErrCm, 0.9)} cm, ideas ${ideas.length}, twins ${msTwins} ms`);
    all.found += s.found; all.truth += s.truth; all.labelsRight += s.labelsRight; all.labelled += s.labelled; all.sizeErrCm.push(...s.sizeErrCm);
  }
  if (recs.length) {
    console.log(`ALL: found ${pct(all.found, all.truth)} (bar 90%), labels ${pct(all.labelsRight, all.labelled)} (bar 90%), size p90 ${q(all.sizeErrCm, 0.9)} cm (bar 2 cm)`);
    if (all.found / all.truth < 0.9 || all.labelsRight / Math.max(1, all.labelled) < 0.9 || q(all.sizeErrCm, 0.9) > 2) bad = true;
  } else console.log(`no recordings with truth.json in ${dir} yet: record one with pnpm build:record`);
  if (args.has("--check") && bad) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Write `services/api/src/cli/build-record.ts`:**

```ts
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { S, type BuildScan } from "@cutonce/schemas";
import { loadConfig, REPO_ROOT } from "../config.js";
import { BuildFiles } from "../build/files.js";
import { dimsCm } from "../build/shape.js";

/**
 * pnpm build:record <scan_id> <name>: keeps a live scan as a test recording in data/build/recordings/<name>/.
 * Only record the kit pile with no people in the photo: the repo is public. Then correct truth.json with a tape measure.
 */
const [scanId, name] = process.argv.slice(2);
if (!scanId || !name || !/^[a-z0-9_]+$/.test(name)) { console.error("usage: pnpm build:record <scan_id> <name: lower_snake>"); process.exit(1); }
const files = new BuildFiles(loadConfig().dataDir, REPO_ROOT);
const { scan } = files.readScan(scanId);
const out = join(files.recordingsDir, name);
mkdirSync(out, { recursive: true });
const rec: BuildScan = S.BuildScan.parse({ ...scan, scan_id: `scan_rec_${name}` });
writeFileSync(join(out, "scan.json"), JSON.stringify(rec) + "\n");
copyFileSync(join(files.scanDir(scanId), "photo.jpg"), join(out, "photo.jpg"));
const labels = files.readLabels(scanId);
if (labels) writeFileSync(join(out, "labels.json"), JSON.stringify(labels, null, 2) + "\n");
if (!existsSync(join(out, "truth.json"))) {
  const truth = { objects: (labels ?? []).filter((t) => t.name !== "unknown").map((t) => ({ name: t.name, size_cm: dimsCm(t.shape) })) };
  writeFileSync(join(out, "truth.json"), JSON.stringify(truth, null, 2) + "\n");
}
console.log(`saved ${out}. Now tape-measure every object and correct truth.json (add anything the scan missed).`);
```

- [ ] **Step 5: Add the scripts** to the root `package.json`:

```json
    "build:record": "pnpm -F @cutonce/api exec tsx src/cli/build-record.ts",
    "build:eval": "pnpm -F @cutonce/api exec tsx src/cli/build-eval.ts",
```

- [ ] **Step 6: Write `data/build/router-eval.json`.** Grow it to 100 phrasings from real rehearsal transcripts: every misrouted sentence from a rehearsal goes in.

```json
[
  { "said": "what can I build", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "what could we make with all this stuff", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "can I build a shelf with these", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "I want to make something out of this junk", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "give me some ideas for these cans", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "is there anything useful I could put together here", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "scan the table again", "mode": "build", "ideas": ["Laptop riser"], "expect": "build_ideas" },
  { "said": "look at the stuff on the floor too", "mode": "build", "ideas": ["Laptop riser"], "expect": "build_ideas" },
  { "said": "what can I make for my phone", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "Master Builder mode", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "could these become a laptop stand", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "what would you build with a pizza box and three cans", "mode": "overlay", "ideas": [], "expect": "build_ideas" },
  { "said": "make it taller", "mode": "build", "ideas": ["Laptop riser", "Two-tier display stand"], "expect": "modify_design" },
  { "said": "use the other box instead", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "something for my phone instead", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "can you make a smaller one", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "I don't have that many cans, try with two", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "none of those, something fun", "mode": "build", "ideas": ["Laptop riser", "Two-tier display stand"], "expect": "modify_design" },
  { "said": "can it hold a monitor instead", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "use the water bottles", "mode": "build", "ideas": ["Laptop riser"], "expect": "modify_design" },
  { "said": "how do I build the shelf", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "where does this go", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "why are the cans at the back", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "is this straight", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "what's the next step", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "which way up does the box go", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "how much weight can this hold", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "what is this made of", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "where does the cable go", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "what floor are we on", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "how tall is E7", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "which drawing is this from", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "is the left leg in the right place", "mode": "overlay", "ideas": [], "expect": "question" },
  { "said": "how many steps are left", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "why this design", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "what do I need tape for", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "can I build this on the floor", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "how long will this take", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "what did I just do wrong", "mode": "build", "ideas": [], "expect": "question" },
  { "said": "is the pizza box centred", "mode": "build", "ideas": [], "expect": "question" }
]
```

- [ ] **Step 7: Run the tests.** Run `pnpm -F @cutonce/api test build-eval && pnpm build:eval`. Expected: PASS, then "no recordings with truth.json … yet".

- [ ] **Step 8: Commit.**

```bash
git add services/api/src/cli/build-eval.ts services/api/src/cli/build-record.ts data/build/router-eval.json package.json services/api/tests/build-eval.test.ts
git commit -m "feat(build): pnpm build:record and build:eval (found, labels, size error, ideas, router accuracy) and the router test set"
```

---

### Task S13: Director Build panel

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/director/BuildPanel.tsx`
- Modify: `apps/web/src/director/DirectorPage.tsx`

**Interfaces:**
- Consumes: the S10 routes; `useStream` from `apps/web/src/ws.ts`.
- Produces: a Director card that lists the twins (name, size, whether snapped), the ideas with **Start** buttons, recordings with **Replay** buttons, **Add object**, and **New session**.

- [ ] **Step 1: Add the API helpers** at the end of `apps/web/src/api.ts`:

```ts
import type { BuildIdea, Twin } from "@cutonce/schemas";

export interface BuildCurrent { session: { session_id: string; created_at: string; scans: string[] } | null; twins: Twin[]; ideas: BuildIdea[] }
export const getBuildCurrent = () => request<BuildCurrent>("GET", "/v1/build/sessions/current");
export const listBuildScans = () => request<{ scans: { scan_id: string; session_id: string | null; captured_at: string | null; recording: boolean }[] }>("GET", "/v1/build/scans");
export const replayBuildScan = (scanId: string, labels: "saved" | "live") => request<{ session_id: string }>("POST", `/v1/build/scans/${enc(scanId)}/replay`, { body: { labels } });
export const startBuildIdea = (ideaId: string) => request<{ assembly_id: string; plan_id: string; revision: number }>("POST", `/v1/build/ideas/${enc(ideaId)}/start`, { body: {} });
export const addBuildObject = (name: string) => request<Twin>("POST", "/v1/build/objects", { body: { name } });
export const newBuildSession = () => request<{ session_id: string }>("POST", "/v1/build/sessions", { body: {} });
export const getBuildVocabulary = () => request<{ items: { name: string; label: string }[] }>("GET", "/v1/build/vocabulary");
```

(Move the `import type` line up to the file's other imports.)

- [ ] **Step 2: Write `apps/web/src/director/BuildPanel.tsx`:**

```tsx
import { useCallback, useEffect, useState } from "react";
import type { BuildIdea, Twin } from "@cutonce/schemas";
import { addBuildObject, describeError, getBuildCurrent, getBuildVocabulary, listBuildScans, newBuildSession, replayBuildScan, startBuildIdea } from "../api";
import { useStream } from "../ws";

const size = (t: Twin) => (t.shape.type === "cylinder"
  ? `⌀${(t.shape.diameter * 100).toFixed(1)} × ${(t.shape.length * 100).toFixed(1)} cm`
  : t.shape.size.map((v) => (v * 100).toFixed(1)).join(" × ") + " cm");

/** Build mode from the laptop: every live fallback in the demo (replay, add a missed object, pick an idea) is one click. */
export function BuildPanel() {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [ideas, setIdeas] = useState<BuildIdea[]>([]);
  const [scans, setScans] = useState<{ scan_id: string; recording: boolean; captured_at: string | null }[]>([]);
  const [vocab, setVocab] = useState<{ name: string; label: string }[]>([]);
  const [pick, setPick] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const [cur, list, v] = await Promise.all([getBuildCurrent(), listBuildScans(), getBuildVocabulary()]);
      setTwins(cur.twins); setIdeas(cur.ideas); setScans(list.scans); setVocab(v.items);
      setPick((p) => p || v.items[0]?.name || "");
    } catch (e) { setStatus(describeError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useStream((msg) => {
    if (msg.type === "build_inventory") setTwins(msg.inventory.twins);
    if (msg.type === "build_ideas") { setIdeas(msg.ideas); if (msg.message) setStatus(msg.message); }
  });
  const run = (label: string, work: () => Promise<unknown>) => async () => {
    setStatus(`${label}…`);
    try { await work(); setStatus(`${label}: done`); await load(); } catch (e) { setStatus(`${label}: ${describeError(e)}`); }
  };

  return (
    <section className="card">
      <div className="step-title">Build mode</div>
      <div className="label">Objects ({twins.length})</div>
      <ul>{twins.map((t) => <li key={t.twin_id}>{t.twin_id} · {t.label} · {size(t)}{t.snapped ? "" : " (measured)"}</li>)}</ul>
      <div className="label">Ideas</div>
      <ul>{ideas.map((i) => (
        <li key={i.idea_id}>{i.title} <small>({i.source})</small> <button type="button" onClick={run(`start ${i.title}`, () => startBuildIdea(i.idea_id))}>Start</button></li>
      ))}</ul>
      <div className="label">Add a missed object</div>
      <select value={pick} onChange={(e) => setPick(e.target.value)}>{vocab.map((v) => <option key={v.name} value={v.name}>{v.label}</option>)}</select>
      <button type="button" disabled={!pick} onClick={run("add object", () => addBuildObject(pick))}>Add</button>
      <div className="label">Scans</div>
      <ul>{scans.slice(0, 12).map((s) => (
        <li key={s.scan_id}>{s.recording ? "📼 " : ""}{s.scan_id} <button type="button" onClick={run("replay", () => replayBuildScan(s.scan_id, "saved"))}>Replay</button></li>
      ))}</ul>
      <button type="button" onClick={run("new session", () => newBuildSession())}>New session</button>
      <div className="progress-text">{status}</div>
    </section>
  );
}
```

- [ ] **Step 3: Show it.** In `DirectorPage.tsx` add `import { BuildPanel } from "./BuildPanel";` and render `<BuildPanel />` right after `<RunPanel … />` in the Demo tab.

- [ ] **Step 4: Check it.** Run `pnpm -F @cutonce/web build && pnpm typecheck`. Expected: PASS. Then `pnpm dev`, open `/director`, replay a scan, and see the objects and ideas appear. Use the preview browser to take a screenshot.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/api.ts apps/web/src/director/BuildPanel.tsx apps/web/src/director/DirectorPage.tsx
git commit -m "feat(web): Director build panel: objects, ideas with Start, replay a scan, add a missed object"
```

---

## Headset tasks (`apps/quest/Assets/CutOnce/…`)

Every headset task ends with the AGENTS verification ladder. Say which rung it reached: permission, depth and frame-time work isn't done until rung 5 (on the headset). Run `pnpm quest:check` with the Editor closed. New `.cs` files and folders get `.meta` files the first time Unity imports them, so commit those.

### Task H1: Spatial-data permission (depth rays need it)

**Files:**
- Modify: `apps/quest/Assets/CutOnce/Editor/QuestSetup.cs` (`ApplyMetaProjectConfig`, around line 192)
- Modify: `apps/quest/Assets/CutOnce/Editor/QuestChecks.cs` (next to the passthrough-camera check, around line 139)
- Modify: `apps/quest/Assets/CutOnce/Device/QuestPermissions.cs`, `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs` (`Start`, the permission toast in `Update`)

**Interfaces:** Produces `QuestPermissions.Scene = "com.oculus.permission.USE_SCENE"` (the same string as MRUK 205's `OVRPermissionsRequester.ScenePermission`).

- [ ] **Step 1: Declare it in the manifest.** In `QuestSetup.ApplyMetaProjectConfig`, after the `isPassthroughCameraAccessEnabled` line:

```csharp
            config.sceneSupport = OVRProjectConfig.FeatureSupport.Supported; // depth rays (build mode, placing on a table): com.oculus.permission.USE_SCENE
```

- [ ] **Step 2: Check it.** In `QuestChecks.cs`, after the passthrough-camera `Expect`:

```csharp
            Expect(f, "meta", config.sceneSupport != OVRProjectConfig.FeatureSupport.None,
                "Scene support must be on, or USE_SCENE is missing from the manifest and depth rays never start (EnvironmentRaycastManager waits for it).");
```

- [ ] **Step 3: Ask for it at runtime.** In `QuestPermissions.cs`, after `Microphone`:

```csharp
        /// <summary>Spatial data: MRUK's EnvironmentRaycastManager waits for it before any depth ray returns a hit.</summary>
        public const string Scene = "com.oculus.permission.USE_SCENE";
```

In `CutOnceApp.Start`, replace the `if (FindAnyObjectByType<CopilotController>() != null) QuestPermissions.Request(…)` statement with:

```csharp
            // Depth rays (build mode, and pointing at a real table to place a build) need spatial data, copilot or not.
            var wanted = FindAnyObjectByType<CopilotController>() != null
                ? new[] { QuestPermissions.Camera, QuestPermissions.Microphone, QuestPermissions.Scene }
                : new[] { QuestPermissions.Scene };
            QuestPermissions.Request(wanted, (p, ok) => _permissionAnswers.Enqueue((p, ok)));
```

In `Update`, replace the toast expression in the `_permissionAnswers` loop with:

```csharp
                if (!answer.granted) _hud.Toast(answer.permission == QuestPermissions.Camera
                    ? "Camera not allowed: the copilot answers without seeing the desk. Allow it in Settings > Privacy."
                    : answer.permission == QuestPermissions.Scene
                    ? "Spatial data not allowed: build mode can't measure objects. Allow it in Settings > Privacy."
                    : "Microphone not allowed: use the question buttons, or allow it in Settings > Privacy.", 6f);
```

- [ ] **Step 4: Rungs 1–3.** Run **Cut Once > Apply Quest 3 settings**, then close the Editor and run `pnpm quest:check`. Expected: 0 errors, and the new check passes.

- [ ] **Step 5: Rung 5 (headset).** Run `pnpm quest:build && pnpm quest:install`, open the app and allow spatial data, then run `adb shell dumpsys package <bundle id> | grep USE_SCENE`. Expected: `granted=true`. Point at the real table while placing E7: the build should land on the tabletop, not the floor. (This also fixes E7 placement, which today falls back to the floor plane.)

- [ ] **Step 6: Commit.**

```bash
git add apps/quest/Assets/CutOnce/Editor/QuestSetup.cs apps/quest/Assets/CutOnce/Editor/QuestChecks.cs apps/quest/Assets/CutOnce/Device/QuestPermissions.cs apps/quest/Assets/CutOnce/Device/CutOnceApp.cs apps/quest/ProjectSettings apps/quest/Assets/Oculus
git commit -m "feat(quest): ask for spatial data and declare USE_SCENE, so depth rays hit real surfaces"
```

(`git add apps/quest/Assets/Oculus` covers the `OculusProjectConfig.asset` that `CommitProjectConfig` writes. Check `git status` and add whatever that step changed.)

---

### Task H2: C# contracts, the stream event, and API calls

**Files:**
- Create: `apps/quest/Assets/CutOnce/Core/Build/BuildDtos.cs`
- Modify: `apps/quest/Assets/CutOnce/Core/Model/EventDtos.cs` (`WsMessageDto`)
- Modify: `apps/quest/Assets/CutOnce/Net/SyncEngine.cs` (`BuildMessage` event, `Handle`)
- Modify: `apps/quest/Assets/CutOnce/Net/ApiClient.cs` (`Send` timeout; three calls)
- Test: `apps/quest/Assets/CutOnce/Core/Tests/BuildDtoTests.cs`, `apps/quest/Assets/CutOnce/Net/Tests/SyncEngineTests.cs`

**Interfaces:**
- Produces: `BuildScanUploadDto`, `BuildGridDto`, `BuildCameraDto`, `BuildIntrinsicsDto`, `ScanAcceptedDto`, `SurfaceDto`, `TwinDto`, `InventoryDto`, `BuildOriginDto`, `BuildIdeaDto`, `IdeaStartedDto`, `SayDto`; `WsMessageDto.inventory / ideas / session_id / audio_url / message / final`; `SyncEngine.BuildMessage: Action<WsMessageDto>`; `ApiClient.PostBuildScan(dto) → Task<ScanAcceptedDto>`, `StartBuildIdea(id) → Task<IdeaStartedDto>`, `BuildSay(text) → Task<SayDto>`.

- [ ] **Step 1: Write the failing tests.** `Core/Tests/BuildDtoTests.cs`:

```csharp
using System.IO;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class BuildDtoTests
    {
        [Test]
        public void TheSharedBuildIdeasMessageParsesWithItsPlanOriginAndTwinMap()
        {
            var m = CoreJson.Parse<WsMessageDto>(RepoFiles.Read(RepoFiles.Fixture("build", "ws_build_ideas.json")));
            Assert.That(m.type, Is.EqualTo("build_ideas"));
            Assert.That(m.final, Is.True);
            var idea = m.ideas[0];
            Assert.That(idea.title, Is.EqualTo("Can on a stage"));
            Assert.That(idea.plan.parts.Count, Is.EqualTo(2));
            Assert.That(idea.plan.parts[1].shape.axis, Is.EqualTo("y"));
            Assert.That(idea.origin.rotation_quat[1], Is.EqualTo(0.3826834).Within(1e-6));
            Assert.That(idea.twin_of["part_o1"], Is.EqualTo("o1"));
        }

        [Test]
        public void AnUploadLeavesOutAMissingSessionId()
        {
            var json = CoreJson.Write(new BuildScanUploadDto { device_id = "quest", grid = new BuildGridDto { cols = 8, rows = 6 }, hit = "0" });
            Assert.That(json, Does.Not.Contain("session_id"));
        }
    }
}
```

Append to `Net/Tests/SyncEngineTests.cs`:

```csharp
        [Test]
        public void BuildMessagesAreHandedOnAsTheyArrive()
        {
            var got = new System.Collections.Generic.List<string>();
            _sync.BuildMessage += m => got.Add(m.type);
            _sync.Handle(new WsMessageDto { type = "build_inventory", inventory = new InventoryDto { session_id = "bsess_x" } });
            _sync.Handle(new WsMessageDto { type = "build_ideas", session_id = "bsess_x" });
            _sync.Handle(new WsMessageDto { type = "presence" });
            Assert.That(got, Is.EqualTo(new[] { "build_inventory", "build_ideas" }));
        }
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm quest:core-test`. Expected: compile errors (the DTOs don't exist).

- [ ] **Step 3: Write `Core/Build/BuildDtos.cs`:**

```csharp
using System.Collections.Generic;

namespace CutOnce.Core
{
    // C# twins of packages/schemas' build-mode contracts (field names match the JSON). Points and poses are in the
    // plan's frame (right-handed, +Y up): convert with ModelSpace on the way in and ScanEncoder on the way out.

    /// <summary>POST /v1/build/scans. One point per grid cell (mm) or a miss, row-major from the photo's top-left.</summary>
    public sealed class BuildScanUploadDto
    {
        public string session_id, device_id, hit, photo_b64;
        public BuildGridDto grid;
        public int[] points_mm;
        public BuildCameraDto camera;
    }
    public sealed class BuildGridDto { public int cols, rows; }
    public sealed class BuildCameraDto { public double[] position, forward; public BuildIntrinsicsDto intrinsics; }
    public sealed class BuildIntrinsicsDto { public int width, height; public double fx, fy, cx, cy; }
    public sealed class ScanAcceptedDto { public string scan_id, session_id; }

    public sealed class SurfaceDto { public string surface_id, kind; public double y; public double[] min, max; public int points; }

    /// <summary>One real object. yaw_deg is a right-handed turn about +Y taking its local +X onto its long side.</summary>
    public sealed class TwinDto
    {
        public string twin_id, name, label, sits_on, material;
        public ShapeDto shape;
        public double[] position;
        public double yaw_deg, confidence, error_m, distance_m;
        public bool load_bearing, cuttable, snapped;
        public int points;
    }

    public sealed class InventoryDto
    {
        public string session_id, scan_id, message;
        public bool labelled;
        public List<SurfaceDto> surfaces = new List<SurfaceDto>();
        public List<TwinDto> twins = new List<TwinDto>();
    }

    public sealed class BuildOriginDto { public double[] position, rotation_quat; }

    /// <summary>A checked design: its plan (design frame) and where that frame sits in the room.</summary>
    public sealed class BuildIdeaDto
    {
        public string idea_id, session_id, source, rule_id, title, why;
        public List<string> tools = new List<string>();
        public PlanDto plan;
        public BuildOriginDto origin;
        public Dictionary<string, string> twin_of = new Dictionary<string, string>();
        public double score;
    }

    public sealed class IdeaStartedDto { public string assembly_id, plan_id; public int revision; }
    public sealed class SayRequestDto { public string text; }
    public sealed class SayDto { public string turn_id, audio_url; }
}
```

- [ ] **Step 4: Extend `WsMessageDto`** in `Core/Model/EventDtos.cs`:

```csharp
    public sealed class WsMessageDto
    {
        public string type;                         // event_appended | assembly_changed | plan_ready | director_command | build_inventory | build_ideas | …
        public string assembly_id, plan_id;
        public BuildEventDto @event;
        public int head, revision;
        public AssemblyDto assembly;
        public DirectorCommandDto command;
        public InventoryDto inventory;              // build_inventory
        public List<BuildIdeaDto> ideas;            // build_ideas
        public string session_id, audio_url, message;
        public bool final;
    }
```

(Add `using System.Collections.Generic;` at the top if it's missing.)

- [ ] **Step 5: The stream event.** In `Net/SyncEngine.cs`, next to the other events:

```csharp
        /// <summary>build_inventory and build_ideas, on the main thread. Build mode listens; the sync engine keeps no build state.</summary>
        public event Action<WsMessageDto> BuildMessage;
```

and in `Handle`'s `switch`:

```csharp
                case "build_inventory":
                case "build_ideas": BuildMessage?.Invoke(m); break;
```

- [ ] **Step 6: The API calls.** In `Net/ApiClient.cs`, give `Send` a timeout parameter:

```csharp
        Task<HttpResult> Send(string method, string path, string body = null, int timeoutSeconds = 8)
        {
            var request = new HttpRequest { Method = method, Url = _config.BaseUrl + path, Body = body, TimeoutSeconds = timeoutSeconds };
```

(Keep the rest of `Send` as it is.) Then add, after `AppendEvent`:

```csharp
        /// <summary>One build-mode scan (about half a megabyte of JSON). Null when the server did not take it.</summary>
        public async Task<ScanAcceptedDto> PostBuildScan(BuildScanUploadDto scan) =>
            ParseOrNull<ScanAcceptedDto>(await Send("POST", "/v1/build/scans", CoreJson.Write(scan), 20));

        public async Task<IdeaStartedDto> StartBuildIdea(string ideaId) =>
            ParseOrNull<IdeaStartedDto>(await Send("POST", $"/v1/build/ideas/{System.Uri.EscapeDataString(ideaId)}/start", "{}", 15));

        /// <summary>Speaks a sentence in the copilot's voice; play the returned audio_url with the copilot's player.</summary>
        public async Task<SayDto> BuildSay(string text) =>
            ParseOrNull<SayDto>(await Send("POST", "/v1/build/say", CoreJson.Write(new SayRequestDto { text = text }), 10));
```

Check that `Net/Unity/UnityHttpTransport` honours `HttpRequest.TimeoutSeconds`. If it hard-codes a timeout, make it use the request's value.

- [ ] **Step 7: Run the tests.** Run `pnpm quest:core-test`. Expected: PASS (the existing tests plus three new ones).

- [ ] **Step 8: Commit.**

```bash
git add apps/quest/Assets/CutOnce/Core apps/quest/Assets/CutOnce/Net
git commit -m "feat(quest): build-mode DTOs, a BuildMessage stream event, and scan/start/say API calls"
```

---

### Task H3: Scan capture (unblocks M1)

**Files:**
- Create: `apps/quest/Assets/CutOnce/Core/Build/ScanEncoder.cs`
- Create: `apps/quest/Assets/CutOnce/Device/Build/BuildScanCapture.cs`
- Modify: `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs` (the X button starts a scan: the M1 trigger, kept as a manual trigger)
- Test: `apps/quest/Assets/CutOnce/Core/Tests/ScanEncoderTests.cs`

**Interfaces:**
- Produces: `ScanEncoder(cols, rows)` with `Count`, `HitUnity(i, x, y, z)`, `PointsMm`, `HitMask`, `Hits`; `static CellPixel(i, cols, rows, width, height, out u, out v)`; `static PlanFromUnity(x, y, z) → double[]`. `BuildScanCapture.Capture(ICameraFrameSource, ISurfaceRaycaster, sessionId, deviceId, Action<BuildScanUploadDto> done, Action<string> failed)` is a coroutine that casts 128 × 96 rays at up to 1024 per frame.

- [ ] **Step 1: Write the failing test** `Core/Tests/ScanEncoderTests.cs`:

```csharp
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class ScanEncoderTests
    {
        [Test]
        public void CellsMapToPixelCentresRowMajorFromTheTopLeft()
        {
            ScanEncoder.CellPixel(0, 128, 96, 1280, 960, out var u0, out var v0);
            ScanEncoder.CellPixel(128 + 5, 128, 96, 1280, 960, out var u1, out var v1);
            Assert.That(new[] { u0, v0, u1, v1 }, Is.EqualTo(new[] { 5.0, 5.0, 55.0, 15.0 }));
        }

        [Test]
        public void HitsAreMirroredIntoThePlanFrameInMillimetresAndMissesStayZero()
        {
            var e = new ScanEncoder(2, 1);
            e.HitUnity(1, 0.25, 0.74, 1.5);
            Assert.That(e.PointsMm, Is.EqualTo(new[] { 0, 0, 0, -250, 740, 1500 }));
            Assert.That(e.HitMask, Is.EqualTo("01"));
            Assert.That(e.Hits, Is.EqualTo(1));
        }
    }
}
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm quest:core-test`. Expected: compile error (`ScanEncoder` is missing).

- [ ] **Step 3: Write `Core/Build/ScanEncoder.cs`:**

```csharp
using System;

namespace CutOnce.Core
{
    /// <summary>
    /// One scan's grid: a point or a miss per cell, row-major from the photo's top-left, so every point knows its pixel.
    /// Points arrive in Unity's left-handed world and are stored mirrored into the plan's right-handed frame (x → -x), in mm.
    /// </summary>
    public sealed class ScanEncoder
    {
        public readonly int Cols, Rows;
        readonly int[] _mm;
        readonly char[] _hit;
        public int Hits { get; private set; }
        public int Count => Cols * Rows;

        public ScanEncoder(int cols, int rows)
        {
            Cols = cols; Rows = rows;
            _mm = new int[cols * rows * 3];
            _hit = new char[cols * rows];
            for (int i = 0; i < _hit.Length; i++) _hit[i] = '0';
        }

        /// <summary>The photo pixel (origin top-left) at the centre of cell <paramref name="index"/>.</summary>
        public static void CellPixel(int index, int cols, int rows, int width, int height, out double u, out double v)
        {
            int c = index % cols, r = index / cols;
            u = (c + 0.5) * width / cols;
            v = (r + 0.5) * height / rows;
        }

        public static double[] PlanFromUnity(double x, double y, double z) => new[] { -x, y, z };

        public void HitUnity(int index, double x, double y, double z)
        {
            _mm[3 * index] = (int)Math.Round(-x * 1000);
            _mm[3 * index + 1] = (int)Math.Round(y * 1000);
            _mm[3 * index + 2] = (int)Math.Round(z * 1000);
            if (_hit[index] != '1') Hits++;
            _hit[index] = '1';
        }

        public int[] PointsMm => _mm;
        public string HitMask => new string(_hit);
    }
}
```

- [ ] **Step 4: Write `Device/Build/BuildScanCapture.cs`:**

```csharp
using System;
using System.Collections;
using CutOnce.AR;
using CutOnce.Copilot;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// One build-mode scan: grab the passthrough photo, then cast a grid of depth rays through that photo's pixels from
    /// the pose it was taken at, so each point lines up with its pixel. The rays are spread over frames (AGENTS rule 10);
    /// raysPerFrame is tuned on the headset (M1). In the Editor there is no depth, so use a Director replay instead.
    /// </summary>
    public sealed class BuildScanCapture : MonoBehaviour
    {
        public int cols = 128, rows = 96, raysPerFrame = 1024;
        public bool Busy { get; private set; }

        public IEnumerator Capture(ICameraFrameSource frames, ISurfaceRaycaster surface, string sessionId, string deviceId,
                                   Action<BuildScanUploadDto> done, Action<string> failed)
        {
            if (Busy) { failed("already scanning"); yield break; }
            if (frames == null || !frames.IsReady) { failed("the camera is not ready"); yield break; }
            var frame = frames.Capture();
            if (!frame.IsValid) { failed("the camera gave no picture"); yield break; }
            Busy = true;
            BuildScanUploadDto dto = null;
            try
            {
                var k = frame.Intrinsics;
                var enc = new ScanEncoder(cols, rows);
                for (int i = 0; i < enc.Count; i++)
                {
                    ScanEncoder.CellPixel(i, cols, rows, k.width, k.height, out double u, out double v);
                    var dirCam = new Vector3((float)((u - k.cx) / k.fx), (float)(-(v - k.cy) / k.fy), 1f).normalized;
                    if (surface != null && surface.Raycast(new Ray(frame.Position, frame.Rotation * dirCam), out var p)) enc.HitUnity(i, p.x, p.y, p.z);
                    if ((i + 1) % raysPerFrame == 0) yield return null;
                }
                var fwd = frame.Rotation * Vector3.forward;
                dto = new BuildScanUploadDto
                {
                    session_id = sessionId, device_id = deviceId, grid = new BuildGridDto { cols = cols, rows = rows },
                    points_mm = enc.PointsMm, hit = enc.HitMask,
                    camera = new BuildCameraDto
                    {
                        position = ScanEncoder.PlanFromUnity(frame.Position.x, frame.Position.y, frame.Position.z),
                        forward = ScanEncoder.PlanFromUnity(fwd.x, fwd.y, fwd.z),
                        intrinsics = new BuildIntrinsicsDto { width = k.width, height = k.height, fx = k.fx, fy = k.fy, cx = k.cx, cy = k.cy },
                    },
                    photo_b64 = Convert.ToBase64String(frame.Jpeg),
                };
                Debug.Log($"[CutOnce] Scan: {enc.Hits}/{enc.Count} depth hits");
            }
            finally { Busy = false; }
            done(dto);
        }
    }
}
```

- [ ] **Step 5: The M1 trigger.** In `CutOnceApp`, add fields `BuildScanCapture _capture; string _buildSession;`. At the end of `Awake`, add `_capture = gameObject.AddComponent<BuildScanCapture>();`. At the end of `Update`, before `if (_dirty) Refresh();`, add `if (OVRInput.GetDown(OVRInput.RawButton.X)) ScanNow();`. Then add:

```csharp
        /// <summary>X on the left controller: scan this view now (M1's trigger; build mode keeps it as a manual scan).</summary>
        void ScanNow()
        {
            var frames = FindAnyObjectByType<CopilotController>()?.frameSourceBehaviour as ICameraFrameSource;
            _hud.Toast("Scanning… hold still", 2f);
            StartCoroutine(_capture.Capture(frames, GetComponent<QuestSurfaceRaycaster>(), _buildSession, _config.device_id,
                dto => Run(Upload(dto)), error => _hud.Toast("Couldn't scan: " + error, 4f)));
        }

        async Task Upload(BuildScanUploadDto dto)
        {
            var ok = await _api.PostBuildScan(dto);
            if (ok == null) { _hud.Toast("The server didn't get the scan", 4f); return; }
            _buildSession = ok.session_id;
            _hud.Toast("Scan saved: " + ok.scan_id, 3f);
        }
```

(H7 moves this into `BuildMode`, and this code is deleted there.)

- [ ] **Step 6: Rungs 1–2.** Run `pnpm quest:core-test`, then `pnpm quest:check` with the Editor closed. Expected: PASS.

- [ ] **Step 7: M1 on the headset (rung 5).** Start the laptop server (`pnpm serve:local`) and set the headset's `cutonce.config.json` to the laptop's address. Put the kit on a table, press X, and wait for "Scan saved: scan_…". On the laptop:

```bash
curl -s -H "authorization: Bearer $API_TOKEN" http://localhost:8080/v1/build/scans | head
```

Then open `data/runtime/build/scans/<scan_id>/photo.jpg` and check that it shows the table. Record from the headset log: the time from X to "saved", the hit count, and the frame rate while scanning (`BudgetProbe`). If frames drop, halve `raysPerFrame`. If the scan takes over 1 s at 512 rays per frame, set `cols = 96, rows = 72`.

- [ ] **Step 8: Commit.**

```bash
git add apps/quest/Assets/CutOnce/Core/Build apps/quest/Assets/CutOnce/Core/Tests/ScanEncoderTests.cs* apps/quest/Assets/CutOnce/Device/Build apps/quest/Assets/CutOnce/Device/CutOnceApp.cs
git commit -m "feat(quest): scan capture: 128 × 96 depth rays through the photo's pixels, uploaded in the plan's frame; X scans"
```

---

### Task H4: `AlignmentController.LockAt` (the design goes where the server says)

**Files:**
- Modify: `apps/quest/Assets/CutOnce/AR/Alignment/AlignmentController.cs` (after `BeginPlacing`)
- Test: `apps/quest/Assets/CutOnce/AR/Tests/AlignmentLockTests.cs`

**Interfaces:** Produces `public void LockAt(Pose worldPose, string method)`: sets `AssemblyRoot`'s pose, saves an anchor there, and reaches `Locked`. It keeps the rule that only `AlignmentController` moves `AssemblyRoot` (`CutOnceApp.cs:25`).

- [ ] **Step 1: Write the failing test** `AR/Tests/AlignmentLockTests.cs`:

```csharp
using CutOnce.AR;
using NUnit.Framework;
using UnityEngine;

namespace CutOnce.AR.Tests
{
    public class AlignmentLockTests
    {
        [Test]
        public void LockAtPutsTheBuildWhereBuildModeSaysAndLocksIt()
        {
            var go = new GameObject("AssemblyRoot (test)");
            try
            {
                var alignment = go.AddComponent<AlignmentController>();
                alignment.Init(go.AddComponent<AssemblyView>(), null, null, null);
                var pose = new Pose(new Vector3(1f, 0.74f, 2f), Quaternion.Euler(0f, 30f, 0f));
                alignment.LockAt(pose, "build");
                Assert.That(alignment.State, Is.EqualTo(AlignmentState.Locked));
                Assert.That(alignment.Method, Is.EqualTo("build"));
                Assert.That(Vector3.Distance(go.transform.position, pose.position), Is.LessThan(1e-5f));
                Assert.That(Quaternion.Angle(go.transform.rotation, pose.rotation), Is.LessThan(0.01f));
            }
            finally { Object.DestroyImmediate(go); }
        }
    }
}
```

- [ ] **Step 2: Run and see it fail.** In the Editor's Test Runner (EditMode), run `CutOnce.AR.Tests`, or with the Editor closed run `pnpm quest:check`. Expected: compile error (`LockAt` is missing).

- [ ] **Step 3: Add `LockAt`** to `AlignmentController`, after `BeginPlacing`:

```csharp
        /// <summary>
        /// Build mode knows where the design goes (the server chose a spot beside the pile, facing the viewer), so it
        /// locks there directly, with a spatial anchor, like any other lock. Grip + stick nudges still work afterwards.
        /// </summary>
        public void LockAt(Pose worldPose, string method)
        {
            transform.SetParent(null, true);
            transform.SetPositionAndRotation(worldPose.position, worldPose.rotation);
            Lock(method);
        }
```

- [ ] **Step 4: Run the tests.** Run the EditMode tests. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/quest/Assets/CutOnce/AR/Alignment/AlignmentController.cs apps/quest/Assets/CutOnce/AR/Tests/AlignmentLockTests.cs*
git commit -m "feat(quest): AlignmentController.LockAt: lock the hologram at a pose the server chose, with an anchor"
```

---

### Task H5: Build-mode states and the flight maths (pure C#)

**Files:**
- Create: `apps/quest/Assets/CutOnce/Core/Build/BuildFlow.cs`, `apps/quest/Assets/CutOnce/Core/Build/FlyPath.cs`
- Test: `apps/quest/Assets/CutOnce/Core/Tests/BuildFlowTests.cs`

**Interfaces:**
- Produces: `enum BuildPhase { Off, Scanning, Labelled, Ideas, Starting, Assembling, Walkthrough }`; `BuildFlow` with `Phase`, `SessionId`, `Inventory`, `Ideas`, `Chosen`, `Active`, `StartScan()`, `ScanFailed()`, `OnScanAccepted(sessionId)`, `OnInventory(inv)`, `OnIdeas(sessionId, ideas, final)`, `Pick(ideaId)`, `PickFailed()`, `TryPlace(planId)` (also accepts a run the server started by voice or from the Director), `OnPlaced()`, `OnAssembled()`, `Exit()`. `FlyPath.Ease(t)`, `Progress(order, elapsed)`, `Lift(e, distance)`, `TotalSeconds(count)`, `Seconds = 0.7`, `Stagger = 0.3`.

- [ ] **Step 1: Write the failing test** `Core/Tests/BuildFlowTests.cs`:

```csharp
using System.Collections.Generic;
using NUnit.Framework;

namespace CutOnce.Core.Tests
{
    public class BuildFlowTests
    {
        static BuildIdeaDto Idea(string id, string plan) => new BuildIdeaDto { idea_id = id, session_id = "bsess_a", title = id, plan = new PlanDto { plan_id = plan } };
        static InventoryDto Inv(bool labelled) => new InventoryDto { session_id = "bsess_a", labelled = labelled };

        [Test]
        public void ScanToWalkthroughInOrder()
        {
            var f = new BuildFlow();
            f.StartScan();                                  Assert.That(f.Phase, Is.EqualTo(BuildPhase.Scanning));
            f.OnScanAccepted("bsess_a");
            f.OnInventory(Inv(false));                      Assert.That(f.Phase, Is.EqualTo(BuildPhase.Scanning));
            f.OnInventory(Inv(true));                       Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1") }, false);
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Ideas));
            Assert.That(f.Pick("idea_1"), Is.True);         Assert.That(f.Phase, Is.EqualTo(BuildPhase.Starting));
            Assert.That(f.TryPlace("plan_other"), Is.False);
            Assert.That(f.TryPlace("plan_build_1"), Is.True);
            f.OnPlaced();                                   Assert.That(f.Phase, Is.EqualTo(BuildPhase.Assembling));
            f.OnAssembled();                                Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough));
            f.OnInventory(Inv(true));                       Assert.That(f.Phase, Is.EqualTo(BuildPhase.Walkthrough), "a late inventory does not interrupt the build");
        }

        [Test]
        public void ARunStartedByVoiceOrTheDirectorIsPlacedToo()
        {
            var f = new BuildFlow();
            f.OnInventory(Inv(true));
            f.OnIdeas("bsess_a", new List<BuildIdeaDto> { Idea("idea_1", "plan_build_1"), Idea("idea_2", "plan_build_2") }, true);
            Assert.That(f.TryPlace("plan_build_2"), Is.True);
            Assert.That(f.Chosen.idea_id, Is.EqualTo("idea_2"));
        }

        [Test]
        public void IdeasFromAnotherSessionAreIgnoredAndExitResets()
        {
            var f = new BuildFlow();
            f.StartScan(); f.OnScanAccepted("bsess_a"); f.OnInventory(Inv(true));
            f.OnIdeas("bsess_b", new List<BuildIdeaDto> { Idea("idea_x", "plan_x") }, true);
            Assert.That(f.Phase, Is.EqualTo(BuildPhase.Labelled));
            f.Exit();
            Assert.That(new object[] { f.Phase, f.SessionId, f.Active }, Is.EqualTo(new object[] { BuildPhase.Off, null, false }));
        }

        [Test]
        public void FlightsEaseStaggerAndArc()
        {
            Assert.That(new[] { FlyPath.Ease(0), FlyPath.Ease(0.5), FlyPath.Ease(1) }, Is.EqualTo(new[] { 0.0, 0.5, 1.0 }));
            Assert.That(FlyPath.Progress(1, 0.3), Is.EqualTo(0.0));
            Assert.That(FlyPath.Progress(1, 1.0), Is.EqualTo(1.0));
            Assert.That(FlyPath.Lift(0, 1), Is.EqualTo(0.0));
            Assert.That(FlyPath.Lift(0.5, 1), Is.EqualTo(0.4).Within(1e-9));
            Assert.That(FlyPath.TotalSeconds(4), Is.EqualTo(1.6).Within(1e-9));
        }
    }
}
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm quest:core-test`. Expected: compile errors.

- [ ] **Step 3: Write `Core/Build/BuildFlow.cs`:**

```csharp
using System.Collections.Generic;

namespace CutOnce.Core
{
    public enum BuildPhase { Off, Scanning, Labelled, Ideas, Starting, Assembling, Walkthrough }

    /// <summary>
    /// Build mode's states, with no Unity in them, so every transition is unit-tested. Messages that arrive in the wrong
    /// phase are ignored: a late inventory never interrupts a build, and ideas from an old session never replace new ones.
    /// </summary>
    public sealed class BuildFlow
    {
        public BuildPhase Phase { get; private set; } = BuildPhase.Off;
        public string SessionId { get; private set; }
        public InventoryDto Inventory { get; private set; }
        public List<BuildIdeaDto> Ideas { get; private set; } = new List<BuildIdeaDto>();
        public BuildIdeaDto Chosen { get; private set; }
        public bool Active => Phase != BuildPhase.Off;
        bool Building => Phase == BuildPhase.Starting || Phase == BuildPhase.Assembling || Phase == BuildPhase.Walkthrough;

        /// <summary>A new scan: from any phase ("what can I build?" mid-build starts over, keeping the session so views merge).</summary>
        public void StartScan() { Phase = BuildPhase.Scanning; Chosen = null; }

        public void ScanFailed()
        {
            if (Phase != BuildPhase.Scanning) return;
            Phase = Inventory == null ? BuildPhase.Off : Ideas.Count > 0 ? BuildPhase.Ideas : BuildPhase.Labelled;
        }

        public void OnScanAccepted(string sessionId) => SessionId = sessionId;

        public void OnInventory(InventoryDto inventory)
        {
            if (inventory == null || Building) return;
            SessionId = inventory.session_id; Inventory = inventory;
            if (inventory.labelled && Phase != BuildPhase.Ideas) Phase = BuildPhase.Labelled;
            else if (Phase == BuildPhase.Off) Phase = BuildPhase.Scanning;
        }

        public void OnIdeas(string sessionId, List<BuildIdeaDto> ideas, bool final)
        {
            if (Phase == BuildPhase.Off || Building || (SessionId != null && sessionId != SessionId)) return;
            Ideas = ideas ?? new List<BuildIdeaDto>();
            if (Ideas.Count > 0) Phase = BuildPhase.Ideas;
        }

        public bool Pick(string ideaId)
        {
            if (Phase != BuildPhase.Ideas) return false;
            var idea = Ideas.Find(i => i.idea_id == ideaId);
            if (idea == null) return false;
            Chosen = idea; Phase = BuildPhase.Starting;
            return true;
        }

        public void PickFailed() { if (Phase == BuildPhase.Starting) { Chosen = null; Phase = BuildPhase.Ideas; } }

        /// <summary>True when this run is the chosen design: picked here, or started by voice or from the Director.</summary>
        public bool TryPlace(string planId)
        {
            if (Phase == BuildPhase.Ideas)
            {
                var idea = Ideas.Find(i => i.plan != null && i.plan.plan_id == planId);
                if (idea != null) { Chosen = idea; Phase = BuildPhase.Starting; }
            }
            return Phase == BuildPhase.Starting && Chosen?.plan != null && Chosen.plan.plan_id == planId;
        }

        public void OnPlaced() { if (Phase == BuildPhase.Starting) Phase = BuildPhase.Assembling; }
        public void OnAssembled() { if (Phase == BuildPhase.Assembling) Phase = BuildPhase.Walkthrough; }

        public void Exit()
        {
            Phase = BuildPhase.Off; SessionId = null; Inventory = null; Chosen = null;
            Ideas = new List<BuildIdeaDto>();
        }
    }
}
```

- [ ] **Step 4: Write `Core/Build/FlyPath.cs`:**

```csharp
namespace CutOnce.Core
{
    /// <summary>The Lego Movie moment's timing: each piece flies for 0.7 s, starting 0.3 s after the one before, over a raised arc.</summary>
    public static class FlyPath
    {
        public const double Seconds = 0.7, Stagger = 0.3;

        public static double Ease(double t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

        /// <summary>Linear progress 0..1 of the piece at <paramref name="order"/>, <paramref name="elapsed"/> seconds after the start.</summary>
        public static double Progress(int order, double elapsed) { double t = (elapsed - order * Stagger) / Seconds; return t < 0 ? 0 : t > 1 ? 1 : t; }

        /// <summary>Height added at eased progress e on a flight of <paramref name="distance"/> metres: 0 at both ends, 15 cm plus a quarter of the distance mid-flight.</summary>
        public static double Lift(double e, double distance) => 4 * e * (1 - e) * (0.15 + 0.25 * distance);

        public static double TotalSeconds(int count) => count <= 0 ? 0 : (count - 1) * Stagger + Seconds;
    }
}
```

- [ ] **Step 5: Run the tests.** Run `pnpm quest:core-test`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/quest/Assets/CutOnce/Core/Build apps/quest/Assets/CutOnce/Core/Tests/BuildFlowTests.cs*
git commit -m "feat(quest): build-mode state machine and fly-together timing, as pure C# with tests"
```

---

### Task H6: What you see: labels, outlines, three previews, the fly-together

**Files:**
- Create: `apps/quest/Assets/CutOnce/UI/WorldLabel.cs`
- Create: `apps/quest/Assets/CutOnce/Device/Build/TwinOverlay.cs`, `IdeaPreviews.cs`, `FlyTogether.cs`

**Interfaces:**
- Consumes: `PartView.Create(part, ShapeFactory.Build(part), parent, material, pickable: false)`, `PartView.Apply(style)`, `HologramPalette.StyleFor(new PartVisual { Base = … })`, `ModelSpace.Point/Rotation`, `FlyPath` (H5), `AssemblyView.Views`.
- Produces: `WorldLabel.Create(parent, text, worldPosition)`; `TwinOverlay.Init(material, palette)`, `Show(inventory)`, `Clear()`, `TryGetWorldPose(twinId, out pos, out rot)`, `Centre()`; `IdeaPreviews.Show(ideas, pileCentre, viewer, material, palette)`, `Hit(ray) → ideaId | null`, `Highlight(ideaId)`, `Clear()`; `FlyTogether.Play(assembly, plan, idea, twins)`, `Running`, `event Finished`.

- [ ] **Step 1: Write `UI/WorldLabel.cs`:**

```csharp
using UnityEngine;
using UnityEngine.UI;

namespace CutOnce.UI
{
    /// <summary>A small floating label that always faces you: an object's name and size, or an idea's title.</summary>
    public sealed class WorldLabel : MonoBehaviour
    {
        const float MetresPerUnit = 0.0008f;             // 28-unit text ≈ 2.2 cm tall: readable at 1.5 m
        Text _text; Transform _camera;

        public static WorldLabel Create(Transform parent, string text, Vector3 worldPosition)
        {
            var go = new GameObject("[Label]", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            go.transform.position = worldPosition;
            var canvas = go.AddComponent<Canvas>(); canvas.renderMode = RenderMode.WorldSpace;
            go.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = 4f;
            var rect = (RectTransform)go.transform; rect.sizeDelta = new Vector2(420, 48); rect.localScale = Vector3.one * MetresPerUnit;
            var label = go.AddComponent<WorldLabel>();
            var t = new GameObject("text", typeof(RectTransform)).AddComponent<Text>();
            t.rectTransform.SetParent(rect, false);
            t.rectTransform.anchorMin = Vector2.zero; t.rectTransform.anchorMax = Vector2.one; t.rectTransform.offsetMin = t.rectTransform.offsetMax = Vector2.zero;
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = 28; t.alignment = TextAnchor.MiddleCenter; t.color = Color.white;
            t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.text = text;
            label._text = t;
            return label;
        }

        public void Set(string text) => _text.text = text;

        void LateUpdate()
        {
            if (_camera == null) { var c = Camera.main; if (c == null) return; _camera = c.transform; }
            transform.rotation = Quaternion.LookRotation(transform.position - _camera.position);
        }
    }
}
```

- [ ] **Step 2: Write `Device/Build/TwinOverlay.cs`:**

```csharp
using System;
using System.Collections.Generic;
using CutOnce.AR;
using CutOnce.Core;
using CutOnce.UI;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// Outlines and labels over the real objects build mode found: dim while unnamed, glowing once labelled. The root sits
    /// at the world origin, so a twin's plan-frame position becomes its Unity position through ModelSpace alone. Rebuilt
    /// once per inventory message (at most 40 twins), never per frame.
    /// </summary>
    public sealed class TwinOverlay : MonoBehaviour
    {
        public const int MaxShown = 40;
        readonly Dictionary<string, TwinDto> _twins = new Dictionary<string, TwinDto>();
        Material _material; HologramPalette _palette;

        public void Init(Material material, HologramPalette palette) { _material = material; _palette = palette; }

        public void Show(InventoryDto inventory)
        {
            Clear();
            if (inventory?.twins == null) return;
            var style = _palette.StyleFor(new PartVisual { Base = inventory.labelled ? BaseVisual.CURRENT_STEP : BaseVisual.FUTURE });
            int shown = 0;
            foreach (var t in inventory.twins)
            {
                if (shown++ >= MaxShown) break;
                _twins[t.twin_id] = t;
                var part = AsPart(t);
                PartView.Create(part, ShapeFactory.Build(part), transform, _material, pickable: false).Apply(style);
                WorldLabel.Create(transform, Caption(t), ModelSpace.Point(t.position) + Vector3.up * (float)(Height(t.shape) / 2 + 0.05));
            }
        }

        public void Clear()
        {
            _twins.Clear();
            for (int i = transform.childCount - 1; i >= 0; i--) Destroy(transform.GetChild(i).gameObject);
        }

        public bool TryGetWorldPose(string twinId, out Vector3 position, out Quaternion rotation)
        {
            position = default; rotation = Quaternion.identity;
            if (!_twins.TryGetValue(twinId, out var t)) return false;
            position = ModelSpace.Point(t.position);
            rotation = ModelSpace.Rotation(YawQuat(t.yaw_deg));
            return true;
        }

        /// <summary>The middle of the labelled objects (where the previews float), or the origin when there are none.</summary>
        public Vector3 Centre()
        {
            var sum = Vector3.zero; int n = 0;
            foreach (var t in _twins.Values) if (t.name != "unknown") { sum += ModelSpace.Point(t.position); n++; }
            return n > 0 ? sum / n : Vector3.zero;
        }

        static PartDto AsPart(TwinDto t) => new PartDto
        { part_id = "part_" + t.twin_id, name = t.label, kind = t.name, layer = "scan", shape = t.shape, position = t.position, rotation_quat = YawQuat(t.yaw_deg) };

        static double[] YawQuat(double deg) { double h = deg * Math.PI / 360.0; return new[] { 0.0, Math.Sin(h), 0.0, Math.Cos(h) }; }
        static double Height(ShapeDto s) => s.type == "box" ? s.size[1] : s.axis == "y" ? s.length : s.diameter;

        static string Caption(TwinDto t)
        {
            if (t.name == "unknown") return "…";
            string size = t.shape.type == "cylinder"
                ? $"{t.shape.diameter * 100:0.#} × {Height(t.shape) * 100:0.#} cm"
                : $"{t.shape.size[0] * 100:0.#} × {t.shape.size[2] * 100:0.#} × {t.shape.size[1] * 100:0.#} cm";
            return $"{t.label} · {(t.snapped ? "" : "≈")}{size}";
        }
    }
}
```

- [ ] **Step 3: Write `Device/Build/IdeaPreviews.cs`:**

```csharp
using System.Collections.Generic;
using CutOnce.AR;
using CutOnce.Core;
using CutOnce.UI;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// Up to three quarter-scale designs floating above the pile, fronts toward you. Each has a box collider (not on a
    /// PartView, so the part pointer ignores it) for "point and pull the trigger".
    /// </summary>
    public sealed class IdeaPreviews : MonoBehaviour
    {
        public const float Scale = 0.25f, Spacing = 0.4f, Lift = 0.3f;
        struct Item { public string ideaId; public Transform root; public BoxCollider hit; }
        readonly List<Item> _items = new List<Item>();
        string _highlighted;

        public void Show(IReadOnlyList<BuildIdeaDto> ideas, Vector3 pileCentre, Vector3 viewer, Material material, HologramPalette palette)
        {
            Clear();
            var toViewer = viewer - pileCentre; toViewer.y = 0f;
            if (toViewer.sqrMagnitude < 1e-4f) toViewer = Vector3.back;
            toViewer.Normalize();
            var right = Vector3.Cross(toViewer, Vector3.up);                     // the viewer's right in Unity's left-handed frame
            var style = palette.StyleFor(new PartVisual { Base = BaseVisual.CURRENT_STEP });
            int count = Mathf.Min(3, ideas.Count);
            for (int i = 0; i < count; i++)
            {
                var idea = ideas[i];
                var root = new GameObject("[Idea] " + idea.title).transform;
                root.SetParent(transform, false);
                root.position = pileCentre + Vector3.up * Lift + right * ((i - (count - 1) / 2f) * Spacing);
                root.rotation = Quaternion.LookRotation(toViewer);                // plan +Z, the front, faces you
                root.localScale = Vector3.one * Scale;
                var bounds = new Bounds(root.position, Vector3.zero);
                foreach (var part in idea.plan.parts)
                {
                    if (part.part_id == "part_surface") continue;
                    var view = PartView.Create(part, ShapeFactory.Build(part), root, material, pickable: false);
                    view.Apply(style);
                    bounds.Encapsulate(view.WorldBounds);
                }
                var hit = new GameObject("[Idea hit] " + idea.title).AddComponent<BoxCollider>();
                hit.transform.SetParent(transform, false);
                hit.transform.position = bounds.center;
                hit.size = bounds.size + Vector3.one * 0.03f;
                WorldLabel.Create(transform, idea.title, new Vector3(bounds.center.x, bounds.max.y + 0.06f, bounds.center.z));
                _items.Add(new Item { ideaId = idea.idea_id, root = root, hit = hit });
            }
        }

        public string Hit(Ray ray)
        {
            if (!Physics.Raycast(ray, out var h, 6f)) return null;
            for (int i = 0; i < _items.Count; i++) if (h.collider == _items[i].hit) return _items[i].ideaId;
            return null;
        }

        public void Highlight(string ideaId)
        {
            if (ideaId == _highlighted) return;
            _highlighted = ideaId;
            for (int i = 0; i < _items.Count; i++) _items[i].root.localScale = Vector3.one * (Scale * (_items[i].ideaId == ideaId ? 1.2f : 1f));
        }

        public void Clear()
        {
            _items.Clear(); _highlighted = null;
            for (int i = transform.childCount - 1; i >= 0; i--) Destroy(transform.GetChild(i).gameObject);
        }
    }
}
```

- [ ] **Step 4: Write `Device/Build/FlyTogether.cs`:**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using CutOnce.AR;
using CutOnce.Core;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// The Lego Movie moment: each design part starts on its real object (its twin's pose) and flies along a raised arc to
    /// its ghost in the design, in build order, 0.3 s apart. At the end every part is back at its exact rest pose.
    /// </summary>
    public sealed class FlyTogether : MonoBehaviour
    {
        struct Flight { public Transform view; public Vector3 from, toLocal; public Quaternion fromRot, toLocalRot; public int order; public float distance; }
        readonly List<Flight> _flights = new List<Flight>();
        Transform _root; float _started = -1f;
        public event Action Finished;
        public bool Running => _started >= 0f;

        public void Play(AssemblyView assembly, PlanDto plan, BuildIdeaDto idea, TwinOverlay twins)
        {
            _flights.Clear(); _root = assembly.transform;
            int order = 0;
            foreach (var step in plan.steps.OrderBy(s => s.index))
                foreach (var partId in step.part_ids)
                {
                    if (!assembly.Views.TryGetValue(partId, out var view) || !idea.twin_of.TryGetValue(partId, out var twinId)) continue;
                    if (!twins.TryGetWorldPose(twinId, out var p, out var r)) continue;
                    var t = view.transform;
                    _flights.Add(new Flight { view = t, from = p, fromRot = r, toLocal = t.localPosition, toLocalRot = t.localRotation, order = order++, distance = Vector3.Distance(p, t.position) });
                    t.SetPositionAndRotation(p, r);
                }
            _started = _flights.Count > 0 ? Time.time : -1f;
            if (_started < 0f) Finished?.Invoke();
        }

        void Update()
        {
            if (_started < 0f) return;
            float elapsed = Time.time - _started;
            bool done = true;
            for (int i = 0; i < _flights.Count; i++)
            {
                var f = _flights[i];
                double t = FlyPath.Progress(f.order, elapsed);
                if (t < 1) done = false;
                float e = (float)FlyPath.Ease(t);
                var pos = Vector3.LerpUnclamped(f.from, _root.TransformPoint(f.toLocal), e) + Vector3.up * (float)FlyPath.Lift(e, f.distance);
                f.view.SetPositionAndRotation(pos, Quaternion.Slerp(f.fromRot, _root.rotation * f.toLocalRot, e));
            }
            if (!done) return;
            for (int i = 0; i < _flights.Count; i++) { _flights[i].view.localPosition = _flights[i].toLocal; _flights[i].view.localRotation = _flights[i].toLocalRot; }
            _started = -1f;
            Finished?.Invoke();
        }
    }
}
```

- [ ] **Step 5: Rungs 1–2.** Run `pnpm quest:check` with the Editor closed. Expected: compiles, 0 errors. These components are exercised in H7 (a PlayMode test, then the simulator).

- [ ] **Step 6: Commit.**

```bash
git add apps/quest/Assets/CutOnce/UI/WorldLabel.cs* apps/quest/Assets/CutOnce/Device/Build
git commit -m "feat(quest): build-mode visuals: twin outlines with name and size labels, three pickable previews, the fly-together"
```

---

### Task H7: Build mode in the app (M4)

**Files:**
- Create: `apps/quest/Assets/CutOnce/Device/Build/BuildMode.cs`
- Modify: `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs`
- Test: `apps/quest/Assets/CutOnce/Device/Tests/AppSmokeTests.cs`

**Interfaces:**
- Consumes: H2–H6; `CopilotController.frameSourceBehaviour`; `PcmStreamPlayer.Play(baseUrl, url, token)` (Rhythm's; called, not changed); `SyncEngine.Mark(partId, "built")`.
- Produces: `BuildMode.Init(…)`, `Active`, `StartScan()`, `OnHologramBuilt(plan) → bool`, `OnStateChanged()`, `MarkCurrentStep() → bool`, `Exit()`; `CutOnceApp.Mode` returns `"build"` while build mode is active.

The controls in build mode:
- **"What can I build?"** or **X** scans.
- **Trigger** on a preview picks it. Trigger on empty space scans that view too (look-around, D11).
- **"Build the laptop riser"**, or **Start** on `/director`, picks by name.
- **"Done"** or **B** with nothing pointed at marks the step.
- **Next / back / undo** and questions work as today.

- [ ] **Step 1: Write the failing PlayMode test.** Add to `AppSmokeTests` (it already has the same using lines plus `System.Reflection`; add `using CutOnce.Core;` and `using System.IO;`):

```csharp
        [UnityTest]
        public IEnumerator BuildModeShowsTwinsAndIdeasItIsSentAndReportsBuildMode()
        {
            var appType = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
            var buildType = Type.GetType("CutOnce.Device.BuildMode, Assembly-CSharp");
            Assert.That(buildType, Is.Not.Null, "BuildMode is missing from Assembly-CSharp");
            var go = new GameObject("[App] (build smoke test)");
            var app = go.AddComponent(appType);
            appType.GetField("createCopilot").SetValue(app, false);
            yield return null;

            var mode = UnityEngine.Object.FindAnyObjectByType(buildType);
            Assert.That(mode, Is.Not.Null, "the app did not attach BuildMode");
            var handle = buildType.GetMethod("OnBuildMessage", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var can = new TwinDto { twin_id = "o1", name = "tall_can", label = "tall can", snapped = true, material = "metal",
                shape = new ShapeDto { type = "cylinder", axis = "y", diameter = 0.066, length = 0.157 }, position = new[] { 0.1, 0.8185, 0.5 } };
            var inventory = new InventoryDto { session_id = "bsess_fixture", labelled = true };
            inventory.twins.Add(can);
            handle.Invoke(mode, new object[] { new WsMessageDto { type = "build_inventory", inventory = inventory } });
            var fixture = Path.Combine(Application.dataPath, "..", "..", "..", "data", "fixtures", "build", "ws_build_ideas.json");
            handle.Invoke(mode, new object[] { CoreJson.Parse<WsMessageDto>(File.ReadAllText(fixture)) });
            yield return null;

            Assert.That(GameObject.Find("[Idea] Can on a stage"), Is.Not.Null, "the idea preview was not shown");
            Assert.That(appType.GetProperty("Mode").GetValue(app), Is.EqualTo("build"));
            UnityEngine.Object.Destroy(go);
        }
```

Add `typeof(…)` lookups for the build roots to `DestroyWhatTheAppCreated`, so the next test starts clean. Destroy objects named `[BuildTwins]` and `[BuildIdeas]`:

```csharp
            foreach (var name in new[] { "[BuildTwins]", "[BuildIdeas]" }) { var left = GameObject.Find(name); if (left != null) UnityEngine.Object.Destroy(left); }
```

- [ ] **Step 2: Run and see it fail.** Run `pnpm quest:check` (PlayMode runs in the scratch project; see the memory note on `m_InitManagerOnStart: 0`), or use the Editor's Test Runner. Expected: FAIL ("BuildMode is missing").

- [ ] **Step 3: Write `Device/Build/BuildMode.cs`:**

```csharp
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using CutOnce.AR;
using CutOnce.Copilot;
using CutOnce.Core;
using CutOnce.Net;
using CutOnce.UI;
using UnityEngine;

namespace CutOnce.Device
{
    /// <summary>
    /// The Lego Movie mode, composed from the pure BuildFlow and the build visuals. The server does the thinking; this
    /// shows what it sends, lets you pick, locks the chosen design where the server put it, flies the pieces in, and then
    /// hands over to the normal step engine, reading each step aloud.
    /// </summary>
    public sealed class BuildMode : MonoBehaviour
    {
        readonly BuildFlow _flow = new BuildFlow();
        ServerConfig _config; ApiClient _api; SyncEngine _sync; BuildStateStore _store;
        AssemblyView _assembly; AlignmentController _alignment; IOperatorInput _input; ISurfaceRaycaster _surface;
        HudController _hud; Material _material; HologramPalette _palette;
        BuildScanCapture _capture; TwinOverlay _twins; IdeaPreviews _previews; FlyTogether _fly;
        string _hovered, _lastStepId;

        public bool Active => _flow.Active;
        public BuildFlow Flow => _flow;

        public void Init(ServerConfig config, ApiClient api, SyncEngine sync, BuildStateStore store, AssemblyView assembly, AlignmentController alignment,
                         IOperatorInput input, ISurfaceRaycaster surface, HudController hud, Material material, HologramPalette palette)
        {
            _config = config; _api = api; _sync = sync; _store = store; _assembly = assembly; _alignment = alignment;
            _input = input; _surface = surface; _hud = hud; _material = material; _palette = palette;
            _capture = gameObject.AddComponent<BuildScanCapture>();
            _twins = new GameObject("[BuildTwins]").AddComponent<TwinOverlay>(); _twins.Init(material, palette);
            _previews = new GameObject("[BuildIdeas]").AddComponent<IdeaPreviews>();
            _fly = gameObject.AddComponent<FlyTogether>(); _fly.Finished += OnFlown;
            _sync.BuildMessage += OnBuildMessage;
        }

        void OnDestroy()
        {
            if (_sync != null) _sync.BuildMessage -= OnBuildMessage;
            if (_fly != null) _fly.Finished -= OnFlown;
            if (_twins != null) Destroy(_twins.gameObject);
            if (_previews != null) Destroy(_previews.gameObject);
        }

        // ── scanning ──────────────────────────────────────────────────────────────────────────────────────────────
        public void StartScan()
        {
            if (_capture.Busy) return;
            if (!_flow.Active) _assembly.gameObject.SetActive(false);        // hide the old build (E7, the desk) while we look at the room
            _flow.StartScan();
            _previews.Clear();
            _hud.Toast("Scanning… hold still for a second", 3f);
            var frames = FindAnyObjectByType<CopilotController>()?.frameSourceBehaviour as ICameraFrameSource;
            StartCoroutine(_capture.Capture(frames, _surface, _flow.SessionId, _config.device_id, dto => Run(Upload(dto)), ScanFailed));
        }

        void ScanFailed(string error)
        {
            _hud.Toast("Couldn't scan: " + error, 4f);
            _flow.ScanFailed();
            if (!_flow.Active) _assembly.gameObject.SetActive(true);
        }

        async Task Upload(BuildScanUploadDto dto)
        {
            var accepted = await _api.PostBuildScan(dto);
            if (this == null) return;
            if (accepted == null) { ScanFailed("the server didn't get the scan"); return; }
            _flow.OnScanAccepted(accepted.session_id);
        }

        // ── what the server sends ─────────────────────────────────────────────────────────────────────────────────
        void OnBuildMessage(WsMessageDto m)
        {
            if (m.type == "build_inventory" && m.inventory != null)
            {
                bool wasOff = !_flow.Active;
                _flow.OnInventory(m.inventory);
                if (wasOff && _flow.Active) _assembly.gameObject.SetActive(false);    // a Director replay starts build mode too
                if (_flow.Phase == BuildPhase.Scanning || _flow.Phase == BuildPhase.Labelled || _flow.Phase == BuildPhase.Ideas) _twins.Show(m.inventory);
                if (!string.IsNullOrEmpty(m.inventory.message)) _hud.Toast(m.inventory.message, 5f);
            }
            else if (m.type == "build_ideas")
            {
                _flow.OnIdeas(m.session_id, m.ideas, m.final);
                if (_flow.Phase == BuildPhase.Ideas) _previews.Show(_flow.Ideas, _twins.Centre(), Head(), _material, _palette);
                if (m.final && !string.IsNullOrEmpty(m.message)) _hud.ShowAnswer(m.message);
                if (m.final && !string.IsNullOrEmpty(m.audio_url)) Play(m.audio_url);
            }
        }

        // ── picking ───────────────────────────────────────────────────────────────────────────────────────────────
        void Update()
        {
            if (_flow.Phase != BuildPhase.Ideas && _flow.Phase != BuildPhase.Labelled) return;
            if (!_input.TryGetPointer(out var ray)) return;
            string hit = _flow.Phase == BuildPhase.Ideas ? _previews.Hit(ray) : null;
            if (hit != _hovered) { _hovered = hit; _previews.Highlight(hit); }
            if (!_input.TriggerDown) return;
            if (hit != null) Run(Pick(hit));
            else StartScan();                                                // trigger on empty space: add this view (D11)
        }

        async Task Pick(string ideaId)
        {
            if (!_flow.Pick(ideaId)) return;
            _hud.Toast("Building: " + _flow.Chosen.title, 3f);
            var started = await _api.StartBuildIdea(ideaId);
            if (this == null || started != null) return;                     // the run arrives on the stream; OnHologramBuilt places it
            _hud.Toast("Couldn't start that build", 4f);
            _flow.PickFailed();
        }

        /// <summary>CutOnceApp calls this after AssemblyView.Build. True when build mode placed the hologram itself.</summary>
        public bool OnHologramBuilt(PlanDto plan)
        {
            if (plan != null && _flow.TryPlace(plan.plan_id))
            {
                _previews.Clear();
                _assembly.gameObject.SetActive(true);
                var o = _flow.Chosen.origin;
                _alignment.LockAt(new Pose(ModelSpace.Point(o.position), ModelSpace.Rotation(o.rotation_quat)), "build");
                _flow.OnPlaced();
                _fly.Play(_assembly, plan, _flow.Chosen, _twins);
                return true;
            }
            if (_flow.Phase == BuildPhase.Assembling || _flow.Phase == BuildPhase.Walkthrough) Exit();   // another run took over (Director: E7)
            return false;
        }

        void OnFlown()
        {
            _flow.OnAssembled();
            _twins.Clear();
            SpeakCurrentStep();
        }

        // ── the walkthrough ───────────────────────────────────────────────────────────────────────────────────────
        /// <summary>A step changed: read the new one aloud, unless it was a voice "done" (whose answer already said it).</summary>
        public void OnStateChanged()
        {
            if (_flow.Phase != BuildPhase.Walkthrough || !_store.IsLoaded) return;
            var step = _store.Current.current_step_id;
            if (step == _lastStepId) return;
            var last = Reducer.OrderEvents(_store.Events).LastOrDefault();
            if (last != null && last.source == "voice") { _lastStepId = step; return; }
            SpeakCurrentStep();
        }

        void SpeakCurrentStep()
        {
            if (!_store.IsLoaded) return;
            _lastStepId = _store.Current.current_step_id;
            var step = _store.Plan.steps.FirstOrDefault(s => s.step_id == _lastStepId);
            var text = step == null ? "That's the whole build. Nice work!" : step.instruction;
            _hud.ShowAnswer(text);
            Run(Say(text));
        }

        async Task Say(string text)
        {
            var said = await _api.BuildSay(text);
            if (this != null && said?.audio_url != null) Play(said.audio_url);
        }

        void Play(string audioUrl) => FindAnyObjectByType<PcmStreamPlayer>()?.Play(_config.BaseUrl, audioUrl, _config.api_token);

        /// <summary>B with nothing pointed at, mid-build: the whole current step is done.</summary>
        public bool MarkCurrentStep()
        {
            if (_flow.Phase != BuildPhase.Walkthrough || !_store.IsLoaded) return false;
            var step = _store.Plan.steps.FirstOrDefault(s => s.step_id == _store.Current.current_step_id);
            if (step == null) return false;
            foreach (var partId in step.part_ids)
                if (!_store.Current.parts.TryGetValue(partId, out var status) || status.state != "built") _sync.Mark(partId, "built");
            return true;
        }

        public void Exit()
        {
            _flow.Exit();
            _twins.Clear(); _previews.Clear();
            _assembly.gameObject.SetActive(true);
        }

        Vector3 Head() => Camera.main != null ? Camera.main.transform.position : _twins.Centre() + new Vector3(0f, 0.8f, -1f);

        static async void Run(Task task) { try { await task; } catch (System.Exception e) { Debug.LogException(e); } }
    }
}
```

- [ ] **Step 4: Wire it into `CutOnceApp`.** Six edits:
  1. **Remove H3's scan code:** delete the fields `_capture` and `_buildSession`, the `_capture = …` line in `Awake`, and the methods `ScanNow` and `Upload`.
  2. **Create build mode in `Awake`.** Add a field `BuildMode _build;`, and at the end of `Awake`:

     ```csharp
                 _build = gameObject.AddComponent<BuildMode>();
                 _build.Init(_config, _api, _sync, _store, _assembly, _alignment, _input, GetComponent<QuestSurfaceRaycaster>(), _hud, _material, _palette);
     ```

  3. **X scans.** In `Update`, change H3's X line to `if (OVRInput.GetDown(OVRInput.RawButton.X)) _build.StartScan();`.
  4. **Place the design once it's drawn.** In `BuildHologram`, after `_proof.Rebuild(_assembly, _material);`, add `_build.OnHologramBuilt(plan);`.
  5. **Steps are read aloud.** At the end of `OnStateChanged`, add `_build.OnStateChanged();`. Put it before the early `return`s: move the existing body into a local function, or call `_build.OnStateChanged()` as the method's first line. The first line is simplest.
  6. **Build mode in the copilot.** Replace `public string Mode => "overlay";` with:

     ```csharp
             public string Mode => _build != null && _build.Active ? "build" : "overlay";
     ```

     In `OnActionApplied`, as the first line: `if (action?.type == "start_scan") { _build.StartScan(); return; }`. In `ReadMarkButton`, just before the final `if (_input.MarkUp && !_markUsed && partId != null …)` line, add:

     ```csharp
                 if (_input.MarkUp && !_markUsed && partId == null && _build.MarkCurrentStep()) return;   // build mode: B marks the whole step
     ```

- [ ] **Step 5: Rungs 1–2.** Run `pnpm quest:core-test && pnpm quest:check` with the Editor closed. Expected: PASS, including the new PlayMode test and the existing smoke tests (build mode is off, so E7 and the desk behave as before).

- [ ] **Step 6: Rung 4 (simulator).** Start the server with a recording (`pnpm dev`; you need one recording from H8 or M1). Press Play with Meta XR Simulator. On `/director` → Build mode → **Replay**. In the Game view you should see:
  1. dim outlines, then labelled outlines with sizes
  2. three previews above the pile
  3. aiming the controller ray at one and pulling the trigger starts the run: the hologram locks at the server's spot and the pieces fly in
  4. the HUD reads step 2

  Take screenshots with the `meta-xr-operator` MCP. `BudgetProbe` should show no warning.

- [ ] **Step 7: Commit.**

```bash
git add apps/quest/Assets/CutOnce/Device apps/quest/Assets/CutOnce/Device/Tests/AppSmokeTests.cs
git commit -m "feat(quest): build mode in the app: scan, labels, three previews, pick, lock where the server says, fly-together, spoken steps"
```

---

### Task H8: On the headset: M1 recordings, tuning, and M4 (procedure; rung 5)

No new code unless a measurement says so. Each item is done when its number is written in the table at the end of this task.

- [ ] **Step 1: Record the kit.** Record 8 scans with X, all on the laptop's server. Cover:
  - the kit pile on a table at about 1 m and at about 1.5 m
  - the pile with clutter around it
  - a box on the floor
  - a shelf
  - dim light
  - the venue table

  **No people in the photo.** For each one, run:

  ```bash
  pnpm build:record <scan_id> <name>
  ```

  Then tape-measure every object and correct `data/build/recordings/<name>/truth.json`.
- [ ] **Step 2: Label them live once.** Run `pnpm build:eval --live`. This writes `labels.json` in each recording, and later runs replay those labels for free. Commit the recordings, after looking at every photo for people.
- [ ] **Step 3: Tune against the bars.** Run `pnpm build:eval --check`: found ≥ 90%, labels ≥ 90%, size p90 ≤ 2 cm for objects within 1.5 m.
  - If found is low for small objects, raise `cols`/`rows` (if the frame rate allows) or lower `OPTIONS.minObjectPoints`.
  - If one object becomes two, raise the link factor from 2.5 to 3.
  - If two become one, the labeller's `count` should split them; check `labels.json`.
  - If table rims show up as objects, raise `minObjectHeight`.

  Commit every `OPTIONS` change together with the eval output that justified it.
- [ ] **Step 4: Router.** Run `pnpm build:eval --router` with `OPENAI_ROUTER_MODEL` set to the smallest OpenAI model the key lists (`curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`). It needs ≥ 97%. If it misses, add the failures to the prompt's examples, or switch to a bigger model and keep `COPILOT_ROUTE_MS` at 700.
- [ ] **Step 5: M4.** A first-timer builds the laptop riser end to end on the headset, with no help, three times in a row. Measure: seconds from "What can I build?" to the first outlines, to the names, and to the first ideas; and the frame rate during the fly-together (`BudgetProbe`).

| Measure | Bar | Measured |
|---|---|---|
| Depth rays per frame at 72 fps | ≥ 512 | |
| X to "scan saved" | ≤ 1.5 s | |
| Question to outlines | ≤ 3 s | |
| Question to names | ≤ 6 s | |
| Question to first ideas (rules) | ≤ 7 s | |
| Frame rate during the fly-together | 72 fps, no drops | |
| Router accuracy | ≥ 97% | |
| Found / labels / size p90 | 90% / 90% / 2 cm | |

---

## Self-review (done while writing)

- **Spec coverage.** FR1 is S11. FR2 is S4 and H3. FR3 (P0 part) is S5 merging plus H7's trigger on empty space. FR4 is S8. FR5 is S5. FR6 is X or the trigger in H7. FR7 is S6, S7 and S9. FR8 is H6 and H7, plus voice pick in S10 and S11. FR9 is H6 (FlyTogether). FR10 is S11 and H7 (B, "done", spoken steps). FR11 is H3 and S12. FR12 is S13. FR13 is covered by existing tests staying green, with build mode opt-in. FR14 (cuts) and FR15 (photo skins, camera check) are **not in this plan**: they start only after M4, and each needs its own plan.
- **Types.** Twin, Surface and IdeaDraft come from S1 and are used unchanged in S4–S10. `Placed` comes from S6 and is used in S6, S7 and S9. `ModelCall` from S8 is used in S9 and S10. The C# DTO field names match the zod field names. `BuildFlow` method names in H5 match their uses in H7.
- **Known risks.** Quest depth quality on shiny cans (M1 measures it; kit objects snap to standard sizes). Per-ray cost (M1 sets `raysPerFrame`). The OpenAI vision label latency (measured in H8 step 5; outlines and rule ideas don't wait on it).
