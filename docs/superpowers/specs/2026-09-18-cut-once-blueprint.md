# Cut Once: Technical Blueprint (v2)

Hack the North 2026 · 2026-09-18 · Status: for team sign-off
Supersedes `2026-09-18-cut-once-design.md` (WebXR, framed wall, cut list). Research behind the decisions: `reports/Blueprint to 3D and 4D reconstruction.md`.

**Clock.** `T+0` = Sat Sep 19, 00:00 EDT (first moment code or design assets may be created). `T+14` = Sat 2:00 PM (Devpost draft with team, badge IDs and all six prizes). `T+32` = Sun 8:00 AM (final edits close). Judging follows.

**Rule check.** This document is planning, which the rules allow. Nothing in it goes into the repo as source, JSON, drawings or QR sheets before `T+0`. Appendix D lists what we may do tonight.

**Repo evidence.** The project folder holds only `deck.md`, the old design doc, the research report and notes. It is not a git repo and has no implementation, so nothing below has to stay compatible with existing code.

---

## 1. Executive Technical Strategy

| # | Decision | Why |
|---|---|---|
| 1 | **One canonical `Plan` JSON with stable IDs.** Unity, the web viewer, Elasticsearch, the copilot, verification and the E7 pipeline all read the same file format. The desk and E7 are both `Plan`s. | One `part_id` links mesh, step, material, drawing reference, search hit, camera check, spoken answer, highlight and history. Nobody invents a second schema. |
| 2 | **Two kinds of version, kept apart.** A `Plan` has *revisions* (what should exist). An `Assembly` has an append-only *event log* (what physically exists). Build state is never stored; it is `fold(plan, events)`. | Rewind, replay, planned-vs-actual and analytics all fall out of one reducer. It is also the right long-term model. |
| 3 | **Unity 6 + Meta XR SDK, started from QuestCameraKit's pinned project** (Unity 6000.3.12f1, Meta XR Core/MRUK 205.0.0, Meta OpenXR 2.6.1). | Unity is the only documented way to read passthrough camera pixels. QuestCameraKit (MIT) already has working camera capture, MRUK QR tracking and permissions. |
| 4 | **One alignment solver, two input sources.** A gravity-constrained two-point solve (yaw + translation) fed by either two QR marker centres or two controller touches, then a nudge, then a spatial anchor. | A long baseline beats a single marker's noisy rotation. One code path serves the ideal and the fallback. Alignment gets more engineer-hours than any AI feature. |
| 5 | **Assembly pose: the desk is built upside down, as the manufacturer's manual does it.** The tabletop is the datum part. It carries the QR sheets on its underside (facing up) and never moves during the demo. | Legs screw in by hand in about 10 s, the markers face the headset, and nothing that defines the coordinate frame moves. |
| 6 | **The user's tap or voice is the truth. The camera is a second opinion.** A vision verdict can attach to a part or raise a prompt. It can never change state on its own. | Research shows unreliable part recognition; a wrong silent state change would wreck the demo and the product's trust model. |
| 7 | **Copilot = prefetch, then one call.** The headset builds a deterministic context packet (selected part, visible parts with image boxes, step, frame). The server retrieves from Elasticsearch first, then makes one multimodal call with structured output. Tools are for actions and follow-ups only. | Removes tool round-trips from the common path. Budget: first audio in 4–6 s. |
| 8 | **Modular monolith.** One Node 22 + Fastify + TypeScript service on a Vultr VM. Files on disk (JSON, JSONL) are the system of record. Elasticsearch is a rebuildable index plus the retrieval and analytics layer. | An Elastic hiccup can slow the copilot but cannot lose build state or stop the overlay. No microservices. |
| 9 | **E7 is an isolated offline Python pipeline** that emits the same `Plan` schema, a GLB and a planned event stream. The same `TimelinePlayer` replays it. It is time-boxed and owned by one person. | It proves the representation generalises without touching the live demo's critical path. |
| 10 | **A deterministic `DemoDirector`, a fallback at every layer, and an offline bundle on the headset** (canonical plan, cached answers with audio, saved anchor, local event journal). | The live demo never depends on one network call, one model response or one tracking event. |

---

## 2. Golden Demo Flow

### Cast and physical setup

| Role | Does | Holds |
|---|---|---|
| **Operator** | Wears the Quest 3. Points, asks, confirms. Never talks to judges. | Right controller only |
| **Builder** | Installs parts with both hands. | The next part |
| **Narrator** | Tells the story, drives the laptop. | Laptop (drives the room display) |

- The desk lies **upside down** on the floor or judging table. Tabletop, left-front and right-front legs are already on (seed state `demo_start`, 3 of 9 parts).
- The laptop is the only source for the room display. It shows three windows: the headset cast, the **Director page** (transcript, answer, stage timings, retrieved sources, and it plays the answer audio so the room hears it), and the E7 video.
- Headset and laptop share a phone hotspot unless venue Wi-Fi passed gate G8.

### Setup minute (before the judges' clock)

| Step | User action | What appears | Subsystem | Data / network | Budget | If it fails |
|---|---|---|---|---|---|---|
| P1 | Operator launches app | Passthrough, "Connecting…" then plan name | `AppBootstrap`, `ApiClient` | `GET /health`, `GET /v1/assemblies/current` | 8 s | Offline mode: bundled plan + local journal |
| P2 | Narrator clicks **New run** on Director page | HUD shows V3, 33% | `director` route, `BuildStateStore` | `POST /v1/assemblies {seed:"demo_start"}` → WS `assembly_changed` → headset `GET …/events` | 1 s | Operator panel → "New local run" (seeds locally) |
| P3 | Operator looks at the two QR sheets for ~6 s | Marker outlines turn green, residual shown ("1.8 mm ✓"), ghost snaps onto desk | `AlignmentController`, `QrAlignmentSource`, `AlignmentSolver` | None (on-device). Anchor saved locally | 10 s | Saved anchor auto-restores at P1. Else touch two corners. Else manual place + nudge |
| P4 | Operator checks the **alignment proof** (ghost marker squares sit on the printed markers), nudges if needed, presses **Lock** | Proof overlay fades | `NudgeController`, `OVRSpatialAnchor` | `POST …/events {kind:"alignment"}` (fire and forget) | 15 s | Skip nudge |

### The three minutes

| # | Time | User action | What judges see | Subsystem | Data change | Network | Budget | Fallback | Reality |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:20 | Narrator: problem ($177.5B, FMI/PlanGrid 2018) and one-line solution | Cast: ghost parts already on the real desk | none | none | none | n/a | n/a | LIVE view |
| 2 | 0:20–0:50 | Narrator plays E7 video | Drawing → extracted walls → cleaned floor → extruded floor → stacked building → build sequence | none (video file) | none | none | n/a | Skip to beat 3; say the line only | PRECOMPUTED |
| 3 | 0:50–1:10 | Narrator drags `desk-drawings.pdf` onto the upload page | Page: "Matches approved revision 3, reviewed by @mikey", stage ticks replay. Headset: the desk **prints itself** in build order from V0 to complete (6 s), then settles to live state | web `upload`, `reconstruction` (hash dedupe), WS `plan_ready`, `TimelinePlayer` | `Document` row reused; no new plan | `POST /v1/projects/:pid/documents` → 200 `{known_plan_id}` → WS push | 2 s to start replay | Operator presses **Replay** (local, no network) | LIVE replay of a PRECOMPUTED, human-approved extraction. Narrator says so |
| 4 | 1:10–1:25 | Operator looks over the desk | Built parts: thin green outline. Current step (left rear leg): bright pulsing ghost. Other missing parts: steady ghost. Blocked parts: faint. HUD: "3 / 9 · 33% · Step 4: Attach left rear leg" | `VisualStateResolver`, `StepEngine`, `HudController` | none | none | 60+ fps | n/a | LIVE |
| 5 | 1:25–1:40 | Builder screws the leg into the ghost. Operator points at it, presses **B** | Ghost snaps to green outline with a tick sound. HUD: "4 / 9 · 44%". History gains "V4 · Left rear leg built · manual". Next step starts pulsing | `SelectionController`, `BuildStateStore` (local fold), `ApiClient` outbox | `BuildEvent` appended locally, journaled, then sent | `POST …/events` → `{version:4}`; server indexes to ES asynchronously | Visual < 100 ms; POST < 500 ms | POST fails → stays in outbox, retried; demo unaffected | LIVE |
| 6 | 1:40–1:48 | none (automatic) | Part shows a scanning stripe, then toast "Camera check: looks installed (0.91)" | `VerificationClient`, server `verification` | `kind:"verification"` event attached to `part_left_rear_leg` | `POST …/verify` (frame crop + expected render) | 3–6 s, 8 s timeout | Timeout → stripe clears silently. Operator panel can disable verification | LIVE |
| 7 | 1:48–2:20 | Operator points at the ghost power cable, holds **A**: "Where does this cable go?" | Listening ring → "Thinking" with stage ticks on Director page → voice: "Run it through the cable tray to the right rear leg, then clip it down the leg. Sheet E-1." Cable path, tray and leg pulse yellow. Source card: "E-1 Wiring · page 2" | `CopilotClient` (mic, frame, projection), server `copilot` (STT → retrieve → LLM → TTS) | `CopilotTurn` logged | `POST …/copilot/query` (multipart), then `GET /v1/audio/:id` stream | First audio ≤ 5 s target, 9 s hard cap | Cap hit → cached answer for the matched scripted question (bundled audio). Mic dead → query buttons on the HUD | LIVE |
| 8 | 2:20–2:35 | Operator holds **A**: "What's left?" | Voice: "Five parts: right rear leg, crossbar, cable tray, power strip and cable. About eight minutes." Those parts pulse | same; answer comes from `BuildState`, no vision needed | `CopilotTurn` logged | same | ≤ 4 s | Cached | LIVE |
| 9 | 2:35–2:52 | Operator pushes the thumbstick left, then right | Banner "History · V4 → V0": parts vanish in reverse order. Then forward past V4 into the **planned** future until the desk is complete, then back to live | `TimelineController` (local fold at version N; planned events synthesised from steps) | none (view only; input that changes state is disabled) | none | 60+ fps | Director page timeline view on the laptop | LIVE |
| 10 | 2:52–3:00 | Narrator closes | Optional: E7 at 1:200 on the table, building itself (P2) | `TimelinePlayer` on the E7 plan | none | none | n/a | Closing line only | PRECOMPUTED model, LIVE playback |

**Determinism.** Every beat has an operator shortcut that forces the expected state (section 17), and every answer in beats 7–8 exists as a cached response produced earlier by the real pipeline.

---

## 3. Complete Architecture

```
┌──────────────────────── Meta Quest 3 · Unity 6 (apps/quest) ────────────────────────┐
│  CutOnce.Core (pure C#)      CutOnce.AR                  CutOnce.Copilot             │
│  ├ Schemas (DTO mirror)      ├ AlignmentController       ├ PushToTalk + MicRecorder  │
│  ├ BuildStateStore  ◄────────┤ ├ QrAlignmentSource       ├ CameraFrameSource (PCA)   │
│  │  events[] + fold()        │ ├ TouchAlignmentSource    ├ PartProjector (3D→pixels) │
│  ├ StepEngine                │ └ AlignmentSolver+Nudge   ├ ExpectedViewRenderer      │
│  └ TimelineController        ├ PlanLoader + ShapeFactory ├ CopilotClient             │
│                              ├ PartView × N              ├ VerificationClient        │
│  CutOnce.Demo                ├ VisualStateResolver       └ PcmStreamPlayer           │
│  └ DemoDirector              └ SelectionController                                   │
│  CutOnce.Net: ApiClient (HTTP + WS + outbox + local journal)    CutOnce.UI: HUD      │
│  Offline bundle: desk.plan.json · demo_cache/*.json+wav · saved anchor · journal     │
└───────────────┬───────────────────────────────────────────────▲─────────────────────┘
      HTTPS     │  events · copilot query · verify              │  WS: event_appended ·
      (bearer)  ▼                                               │  plan_ready · director_command
┌──────────────────── Vultr VM · Caddy → Node 22 + Fastify (services/api) ─────────────┐
│ routes/        store/ (truth)            copilot/            reconstruction/          │
│  REST + WS     plans/*.json              contextBuilder      rasterise → extract →    │
│  director      assemblies/*.events.jsonl prompts · llm · tts validate → repair →      │
│                documents/ · audio/       cache · fastpath    review → approve         │
│ packages/project-model (shared, pure TS): fold · steps · progress · validate · diff  │
│ packages/schemas (Zod → JSON Schema → fixtures)                                       │
│ search/ (retrieve, tools)  ingest/ (chunk, link part_ids, index)  verification/       │
└──────┬───────────────────────────┬───────────────────────────────┬───────────────────┘
       │ ES client + MCP           │ HTTPS                         │ HTTPS
┌──────▼──────────────┐   ┌────────▼─────────────┐   ┌─────────────▼──────────┐
│ Elastic Cloud       │   │ OpenAI               │   │ ElevenLabs             │
│ docs · parts ·      │   │ gpt-transcribe (STT) │   │ Flash v2.5, PCM stream │
│ materials · events ·│   │ gpt-5.6-luna (vision,│   └────────────────────────┘
│ copilot-turns       │   │  structured output)  │
│ Jina embed + rerank │   └──────────────────────┘
│ Agent Builder tools │
│ Workflow: log_issue │        ┌─ apps/web (Vite + React + three.js) ───────────┐
└─────────────────────┘        │ /upload · /review/:plan · /director · /history │
                               └────────────────────────────────────────────────┘
┌──────────────── OFFLINE · tools/e7 (Python) ────────────────┐
│ fetch → scale → register → walls → clean (Inkscape) →       │
│ heights → e7.plan.json + e7.glb + e7.events.json → video    │
└─────────────────────────────────────────────────────────────┘
```

### Who owns what

| Concern | Runs on | Owner of truth | Persistent? |
|---|---|---|---|
| Alignment transform, nudge, anchor UUID | Quest | Quest (local file). Server gets a copy for the log | Yes, on device |
| Selection, highlights, timeline cursor, visual states | Quest | Quest | No (ephemeral) |
| Event log | Quest (journal + optimistic fold) **and** server | **Server** assigns `version`; Quest keeps provisional events until acknowledged | Yes (JSONL on the VM; JSONL journal on device) |
| Build state | Both, derived | Nobody. Always `fold(plan, events)` | Never stored |
| Plan, documents, materials, steps | Server disk | Server | Yes |
| Projection of parts into the camera image | Quest | n/a | No |
| Retrieval, prompts, model calls, TTS, verification verdicts | Server | Server logs each turn | Turn log yes |
| Search indices | Elastic Cloud | Derived from server disk (`pnpm reindex`) | Rebuildable |
| Drawing extraction, validation, review | Server + web | Server | Yes |
| E7 reconstruction | Laptop, offline | Files in `data/e7/` | Yes |

**Separation rules.** Unity knows no prompts, no search and no model names. The backend knows no transforms, shaders or controller input. The only rendering-adjacent thing the backend returns is a list of `part_id`s and a highlight style.

---

## 4. Canonical Data Model

Source of truth: Zod schemas in `packages/schemas`, exported as JSON Schema. Unity mirrors them as C# DTOs (Newtonsoft JSON). Python validates E7 output against the JSON Schema. **Golden fixtures in `data/fixtures/` are the contract**: a TypeScript test and a Unity EditMode test both load them.

**Conventions**

- IDs are lowercase snake with a type prefix: `proj_`, `doc_`, `sheet_`, `plan_`, `asm_`, `part_`, `mat_`, `step_`, `evt_` (ULID), `anchor_`, `ctx_`, `ver_`, `turn_`.
- Units are metres and degrees. Timestamps are ISO 8601 UTC.
- **Model space is right-handed, Y up, glTF convention.** Unity converts at one place only (section 5).
- A part ID never changes across plan revisions. A renamed part keeps its ID; a genuinely new part gets a new one.

### Entities

```ts
type Vec3 = [number, number, number];
type DocRef = { document_id: string; sheet_id?: string; page: number; chunk_id?: string; bbox_norm?: [number, number, number, number] };

interface Project  { project_id: string; name: string; created_at: string; document_ids: string[]; plan_ids: string[] }

interface Document { document_id: string; project_id: string; filename: string; sha256: string; mime: string;
                     doc_type: "architectural" | "electrical" | "materials" | "assembly" | "spec" | "other";
                     page_count: number; uploaded_at: string; sheets: Sheet[] }

interface Sheet    { sheet_id: string; document_id: string; page: number; title: string; discipline: string;
                     image_uri: string; width_px: number; height_px: number; scale?: { px_per_m?: number; ratio?: string } }

interface Plan     { plan_id: string; project_id: string; name: string; revision: number; status: "draft" | "approved";
                     frame: { handedness: "right"; up: "+Y"; units: "m"; pose: string; origin: string };
                     layers: string[]; parts: Part[]; materials: Material[]; steps: BuildStep[];
                     markers: Marker[]; touch_points: TouchPoint[];
                     provenance: { source_document_ids: string[]; extracted_by: string; approved_by?: string;
                                   assumptions: string[]; validation: ValidationIssue[] } }

type Shape = { type: "box"; size: Vec3 }
           | { type: "cylinder"; axis: "x" | "y" | "z"; diameter: number; length: number }
           | { type: "polyline"; points: Vec3[]; diameter: number }
           | { type: "mesh"; uri: string; node: string };

interface Part     { part_id: string; name: string; aliases: string[]; kind: string; layer: string; parent_id?: string;
                     shape: Shape; position: Vec3; rotation_quat?: [number, number, number, number];
                     material_id: string; step_id: string;
                     rests_on: string[];
                     attaches_to: { part_id: string; relation: "on" | "inside" | "along"; via_material_id?: string }[];
                     verify_hint: string; install_minutes: number; doc_refs: DocRef[];
                     external_ids?: Record<string, string> }

interface Material { material_id: string; name: string; spec: string; unit: string; quantity: number;
                     used_by: string[]; doc_refs: DocRef[] }

interface BuildStep{ step_id: string; index: number; title: string; instruction: string; part_ids: string[];
                     requires: string[]; layer: string; est_minutes: number;
                     materials: { material_id: string; qty: number }[]; doc_refs: DocRef[] }

interface Marker   { marker_id: string; payload: string; size_m: number; position: Vec3; normal: "+Y" }
interface TouchPoint { point_id: string; name: string; position: Vec3 }

interface Assembly { assembly_id: string; plan_id: string; plan_revision: number; name: string;
                     seed: string; created_at: string; status: "active" | "archived" }

type PartState = "missing" | "built" | "wrong";

interface BuildEvent { event_id: string; assembly_id: string; version: number | null;
                       timestamp: string; client_timestamp: string;
                       kind: "part_state" | "verification" | "annotation" | "alignment";
                       part_id?: string; previous_state?: PartState; new_state?: PartState;
                       source: "manual" | "voice" | "camera_verification" | "system" | "seed";
                       confidence: number; actor: string; step_id?: string;
                       verification_id?: string; turn_id?: string; note?: string }

interface BuildState { assembly_id: string; plan_id: string; plan_revision: number; version: number; as_of: string;
                       parts: Record<string, { state: PartState; since_version: number; last_event_id: string | null;
                                               verified: null | { verdict: string; confidence: number } }>;
                       progress: { built: number; total: number; pct: number; by_layer: Record<string, [number, number]>;
                                   minutes_left: number };
                       current_step_id: string | null; available_part_ids: string[]; blocked_part_ids: string[];
                       out_of_sequence: { part_id: string; kind: "hard" | "soft" }[] }

interface SpatialAnchor { anchor_id: string; assembly_id: string; device_id: string;
                          method: "qr_2pt" | "touch_2pt" | "touch_3pt" | "manual" | "restored";
                          meta_anchor_uuid: string; nudge: { dx: number; dy: number; dz: number; dyaw_deg: number };
                          residual_mm: number; level_error_mm: number; locked_at: string }
```

`CopilotContext`, `CopilotResponse`, `VerificationRequest` and `VerificationResult` are defined with their endpoints in sections 10, 11 and 14.

### Example: the desk plan (archetype values; replace with tape-measure values at T+0)

Model origin: corner **A** of the tabletop underside, the far-left corner as the Operator sees the upside-down desk. `+X` runs along the far edge to the right, `+Y` is up (the way the legs point while upside down), `+Z` comes toward the Operator. `Y = 0` is the underside surface. Part names are **assembly-pose names** and are also written on stickers on the desk; the copilot always highlights, so a name is never the only cue.

```json
{
  "plan_id": "plan_desk_demo", "project_id": "proj_cutonce_demo", "name": "Demo desk",
  "revision": 3, "status": "approved",
  "frame": { "handedness": "right", "up": "+Y", "units": "m",
             "pose": "assembly (upside down)", "origin": "underside corner A, far-left" },
  "layers": ["structure", "hardware", "electrical"],
  "parts": [
    { "part_id": "part_tabletop", "name": "Tabletop", "aliases": ["top", "desktop"], "kind": "panel",
      "layer": "structure", "shape": { "type": "box", "size": [1.0, 0.034, 0.6] },
      "position": [0.5, -0.017, 0.3], "material_id": "mat_top_1000x600", "step_id": "step_01",
      "rests_on": [], "attaches_to": [],
      "verify_hint": "white rectangular panel lying flat, underside facing up",
      "install_minutes": 1,
      "doc_refs": [{ "document_id": "doc_desk_drawings", "sheet_id": "sheet_a1", "page": 1 }] },
    { "part_id": "part_left_rear_leg", "name": "Left rear leg", "aliases": ["back left leg"], "kind": "leg",
      "layer": "structure", "shape": { "type": "cylinder", "axis": "y", "diameter": 0.04, "length": 0.70 },
      "position": [0.07, 0.35, 0.07], "material_id": "mat_leg_700", "step_id": "step_04",
      "rests_on": ["part_tabletop"],
      "attaches_to": [{ "part_id": "part_tabletop", "relation": "on", "via_material_id": "mat_mount_plate" }],
      "verify_hint": "black steel tube, 40 mm wide, 70 cm long, standing upright on the panel",
      "install_minutes": 1,
      "doc_refs": [{ "document_id": "doc_desk_manual", "page": 4 }] },
    { "part_id": "part_power_cable", "name": "Power cable", "aliases": ["cord"], "kind": "cable",
      "layer": "electrical",
      "shape": { "type": "polyline", "diameter": 0.008,
                 "points": [[0.65, 0.035, 0.16], [0.90, 0.035, 0.16], [0.93, 0.05, 0.07], [0.93, 0.70, 0.07]] },
      "position": [0, 0, 0], "material_id": "mat_power_cable_2m", "step_id": "step_09",
      "rests_on": ["part_power_strip", "part_right_rear_leg"],
      "attaches_to": [{ "part_id": "part_cable_tray", "relation": "inside" },
                      { "part_id": "part_right_rear_leg", "relation": "along", "via_material_id": "mat_cable_clip" }],
      "verify_hint": "black cable clipped along the right rear leg",
      "install_minutes": 2,
      "doc_refs": [{ "document_id": "doc_desk_drawings", "sheet_id": "sheet_e1", "page": 2 }] }
  ],
  "materials": [
    { "material_id": "mat_leg_700", "name": "Steel leg 700 mm", "spec": "Ø40 × 700 mm, black, M8 stud",
      "unit": "each", "quantity": 4,
      "used_by": ["part_left_front_leg", "part_right_front_leg", "part_left_rear_leg", "part_right_rear_leg"],
      "doc_refs": [{ "document_id": "doc_desk_bom", "page": 1 }] }
  ],
  "steps": [
    { "step_id": "step_04", "index": 4, "title": "Attach left rear leg",
      "instruction": "Screw the leg clockwise into the left rear plate until hand-tight.",
      "part_ids": ["part_left_rear_leg"], "requires": ["step_01"], "layer": "structure", "est_minutes": 1,
      "materials": [{ "material_id": "mat_leg_700", "qty": 1 }],
      "doc_refs": [{ "document_id": "doc_desk_manual", "page": 4 }] }
  ],
  "markers": [
    { "marker_id": "m1", "payload": "co:desk:m1", "size_m": 0.10, "position": [0.20, 0.0, 0.53], "normal": "+Y" },
    { "marker_id": "m2", "payload": "co:desk:m2", "size_m": 0.10, "position": [0.80, 0.0, 0.53], "normal": "+Y" },
    { "marker_id": "m3", "payload": "co:desk:m3", "size_m": 0.10, "position": [0.19, 0.0, 0.08], "normal": "+Y" }
  ],
  "touch_points": [
    { "point_id": "tp_c", "name": "Near-left corner", "position": [0.0, 0.0, 0.6] },
    { "point_id": "tp_d", "name": "Near-right corner", "position": [1.0, 0.0, 0.6] }
  ],
  "provenance": { "source_document_ids": ["doc_desk_drawings", "doc_desk_manual", "doc_desk_bom"],
                  "extracted_by": "gpt-5.6-luna + validator v1", "approved_by": "mikey",
                  "assumptions": ["Cable route is our design, not the manufacturer's"], "validation": [] }
}
```

Full part list (9): `part_tabletop`, `part_left_front_leg`, `part_right_front_leg`, `part_left_rear_leg`, `part_right_rear_leg`, `part_rear_crossbar`, `part_cable_tray`, `part_power_strip`, `part_power_cable`. Fasteners (mounting plates, screws, clips) are **materials consumed by steps**, not tracked parts. Steps: one part per step for `step_01`–`step_09`, then `step_10` "Flip upright" (no part, a milestone). Seed `demo_start` = steps 1–3 done.

### Example: event, state, anchor

```json
{ "event_id": "evt_01J8ZK3V9Q4T7M2A", "assembly_id": "asm_desk_run_017", "version": 4,
  "timestamp": "2026-09-20T13:12:07.412Z", "client_timestamp": "2026-09-20T13:12:07.377Z",
  "kind": "part_state", "part_id": "part_left_rear_leg",
  "previous_state": "missing", "new_state": "built",
  "source": "manual", "confidence": 1.0, "actor": "operator", "step_id": "step_04" }
```

```json
{ "assembly_id": "asm_desk_run_017", "plan_id": "plan_desk_demo", "plan_revision": 3, "version": 4,
  "as_of": "2026-09-20T13:12:07.412Z",
  "parts": { "part_left_rear_leg": { "state": "built", "since_version": 4,
             "last_event_id": "evt_01J8ZK3V9Q4T7M2A",
             "verified": { "verdict": "present", "confidence": 0.91 } } },
  "progress": { "built": 4, "total": 9, "pct": 44, "by_layer": { "structure": [4, 6], "hardware": [0, 1], "electrical": [0, 2] },
                "minutes_left": 8 },
  "current_step_id": "step_05", "available_part_ids": ["part_right_rear_leg", "part_cable_tray"],
  "blocked_part_ids": ["part_rear_crossbar", "part_power_strip", "part_power_cable"], "out_of_sequence": [] }
```

```json
{ "anchor_id": "anchor_desk_run_017", "assembly_id": "asm_desk_run_017", "device_id": "quest3_a",
  "method": "qr_2pt", "meta_anchor_uuid": "7d0c4f1e-…",
  "nudge": { "dx": 0.001, "dy": 0.0, "dz": -0.002, "dyaw_deg": 0.1 },
  "residual_mm": 1.8, "level_error_mm": 2.2, "locked_at": "2026-09-20T13:09:41Z" }
```

---

## 5. Coordinate Systems & Spatial Alignment

### The spaces

| Space | Symbol | Definition |
|---|---|---|
| **Model** | `M` | The `Plan` frame. Right-handed, +Y up, metres. For the desk: origin at underside corner A, attached to the tabletop |
| **Unity-local** | `L` | `M` converted to Unity's left-handed frame. This is the local frame of the `AssemblyRoot` GameObject |
| **Marker** | `Qi` | Frame MRUK reports for QR code *i*. We use only its **centre point** in P0 |
| **World** | `W` | Unity world = Quest tracking space. +Y is gravity-up. Origin arbitrary per session |
| **Anchor** | `A` | The `OVRSpatialAnchor`. The headset keeps it fixed to the room as tracking refines |
| **Camera** | `C` | Passthrough RGB camera (left) at the frame's timestamp |
| **Image** | `I` | Pixels, origin top-left, 1280 × 960 |

### Every transform

1. **`M → L` (handedness, one function, `ModelSpace.cs`).**
   `toUnity(p) = (−p.x, p.y, p.z)`; `toUnity(q) = (q.x, −q.y, −q.z, q.w)`.
   This matches glTFast, which inverts the X axis (verified in glTFast's upgrade guide), so JSON-built parts and GLB-loaded meshes agree. **Test at T+1** with the fixture `plan_asymmetric` (an L-shaped set of three boxes with a labelled box at +X): if the L appears mirrored against the web viewer, the sign is wrong. Desk parts use no rotations at all (axis-aligned boxes, cylinders with an axis letter), so positions are the only thing that can mirror.
2. **`L → W` (alignment).** Unknowns: yaw `θ` about world up, and translation `t`. We assume the tabletop is level. That is an assumption, not a fact: a 0.5° tilt puts the tip of a 0.70 m leg 6 mm off. So a third marker checks it (below), and the desk goes on the **floor**, not on a folding table. Inputs: two model points `a1, a2` (already in `L`) and their measured world positions `w1, w2`.

   ```
   d_a = a2 − a1            d_w = w2 − w1
   θ   = atan2(d_w.x, d_w.z) − atan2(d_a.x, d_a.z)
   R   = AngleAxis(θ, up)
   t   = ½ · [ (w1 − R·a1) + (w2 − R·a2) ]
   T_W_L = (R, t)

   baseline_residual = | |d_w| − |d_a| |                     accept < 4 mm
   level_error       = | (w1.y − a1.y) − (w2.y − a2.y) |     accept < 5 mm
   ```

   Headset scale is metric, so `baseline_residual` catches a misread marker, a sheet stuck in the wrong place, or a printer that scaled the page. `level_error` only sees tilt **along** the m1–m2 line. Both markers sit on the near edge, so front-to-back tilt is invisible to it. **Marker m3, on the far edge, is the check:** after the solve, predict m3's world position and compare it with where MRUK sees it. `m3_residual` under 4 mm → accept. Over → run the three-point rigid fit (Kabsch/Horn on m1, m2, m3, no level assumption). The three-point fit is **P0 as the fallback**, not P1: it is about 40 lines, and it is the only answer to a tilted surface.
3. **`W → A` (anchoring).** At lock time create an `OVRSpatialAnchor` at pose `T_W_L`, make `AssemblyRoot` its child with local pose = `T_nudge`. From then on the OS keeps `A` fixed to the room.
4. **`T_nudge`.** A small local offset `{dx, dy, dz, dyaw}` applied about the desk's centre. Saved with the anchor.
5. **`W → C → I` (projection, for the copilot and verification).** The passthrough camera component gives the camera pose at the frame timestamp and intrinsics `fx, fy, cx, cy`.
   `p_C = T_W_C⁻¹ · p_W`; visible if `p_C.z > 0.1`; `u = cx + fx·p_C.x / p_C.z`; `v = cy − fy·p_C.y / p_C.z`.
   The sign of `v` and any lens-distortion handling come from Meta's CameraToWorld sample. **Test:** the Director page draws the projected boxes over the received JPEG; boxes must sit on the real parts.

**Why two centres and not one marker's rotation.** A 10 cm marker's orientation is noisy: 1° of error moves a point 1 m away by 17 mm. Two centres 0.6 m apart, each good to about 2 mm, give a yaw error of roughly `atan(2.8 / 600) ≈ 0.27°`, which is about 2.5 mm at the far corner of the desk.

### Markers: print layout removes measuring error

- Three QR codes, 100 mm: `co:desk:m1` and `co:desk:m2` on the near edge (the solve), `co:desk:m3` on the far edge, clear of the cable tray (the check). Short payloads keep the code at version 1–2 with big modules. MRUK reads up to version 10, wants codes "relatively large", well lit, no logos.
- Each code is printed on its own sheet with a **20 mm margin to the sheet edge**, and the sheet is stuck **flush with the near edge of the tabletop** at a marked distance from the near-left corner. The marker centre in model space then follows from the print layout, not from a tape measure.
- Print at 100% scale on matte paper. Measure the printed code with a ruler; enter the real size in `markers[].size_m`. Print two spare sets.
- `tools/qr` needs only each marker's payload and size, so A1 can print at T+0:45, before the desk plan exists. Marker positions are recorded after the sheets are stuck on and go into the plan then. Find a printer tonight.

### Calibration procedure (ideal path, about 10 s)

1. `AlignmentController` enters `Scanning`. MRUK QR tracking is switched on (copy the enabling code and the `TrackableAdded` handler from QuestCameraKit's QRCodeDetection scene). Trackables are filtered by `TrackableType == QRCode` and by payload.
2. For each marker collect **K = 8 centre samples** while head speed is under 5 cm/s. Centre = `trackable.transform.TransformPoint(PlaneRect.center)`. Take the per-axis median. MRUK updates QR poses "at a lower frequency"; measure the real rate at gate G3 and tune K.
3. Sanity: each marker's plane normal within 5° of world up. Meta does not document which local axis is the normal, so at G3 drop an axis gizmo on a trackable and record the answer in `QrAlignmentSource`.
4. Solve. Show the ghost, the **alignment proof** (ghost outlines of both marker squares and an "A" cross at the origin corner) and the two residuals.
5. Operator nudges if the proof is visibly off, then presses **Lock**: anchor created and saved, `{uuid, nudge, residuals}` written to `persistentDataPath/alignment_plan_desk_demo.json`, QR tracking switched **off** (saves power, prevents jumps).

**Nudge controls** (only in `Nudging` state): left stick = ±X/±Z at 1 mm per tick (hold for 1 cm/s); right stick X = yaw 0.1° per tick; right stick Y = height 1 mm per tick; grip = ×10.

**Restore.** On launch, if a saved anchor exists: load it (`LoadUnboundAnchorsAsync` → localise → bind), 5 s timeout, then show the proof overlay for a visual check. This is what makes a crash recoverable in under 30 s.

**Drift and re-localisation.** Keep the desk within 3 m of its anchor (Meta's coverage guidance; a desk is well inside). Do not realign automatically. **Realign** on the operator panel re-enters `Scanning`. The proof overlay can be toggled at any time as a drift check.

### Fallback ladder

| Level | Method | Expected error | Time |
|---|---|---|---|
| Ideal | Two QR centres + gravity, checked by the third marker, then nudge | 2–4 mm | 10 s |
| A | Restore saved anchor, check proof | same as when saved | 5 s |
| B | **Touch two points**: controller tip on near-left corner, trigger; near-right corner, trigger. Same solver | 5–8 mm before nudge | 15 s |
| C | Touch three points, full rigid fit (non-level surface) | 5–8 mm | 25 s |
| Emergency | Ray-place the ghost on the surface, rotate with stick, nudge by eye | 1–2 cm | 40 s |

Controller tip offset: a small sphere gizmo is rendered at a constant offset from the controller pose; adjust the constant once until the sphere sits on the physical nose of the controller in passthrough.

### Upload mode without a real object (P1)

Ray from the controller hits a real surface through MRUK's environment raycast (depth-based). The ghost follows the hit point, the stick sets yaw, trigger locks, and the same anchor code saves it.

---

## 6. Desk Reconstruction Pipeline

**Rule:** the live demo loads the approved canonical plan. The AI path is real, runs on the laptop, and ends at the same file format, but no demo beat waits on it.

```
PDF / JPG / PNG / CSV                             data/demo/desk.plan.json  (known-good, hand-checked)
   │ 1 intake: sha256, store, dedupe  ───────────────►  hash known? return approved plan immediately
   ▼
 2 rasterise pages (200 dpi) + pull PDF text layer
   ▼
 3 Call A · inventory     → which page is what, units, overall size, materials table
   ▼
 4 Call B · plan draft    → strict JSON (structured output): parts, shapes, sizes, positions,
   │                        rests_on / attaches_to, layer, material, evidence per number, assumptions
   ▼
 5 validate (pure code)   → ValidationIssue[]
   │      └─ issues? → Call C · repair with the issue list (max 2 rounds)
   ▼
 6 steps (pure code)      → topological sort of the rests_on graph; Call D only writes titles and instructions
   ▼
 7 review page            → human edits table, watches 3D + three orthographic views beside the drawing, clicks Approve
   ▼
 8 approved Plan revision → WS plan_ready → Unity ShapeFactory
```

| Stage | Decision |
|---|---|
| **Inputs** | PDF (multi-page), phone photo (JPG/PNG), optional BOM as CSV or a PDF table. For the demo: `desk-drawings.pdf` (sheet A-1 dimensioned three-view, sheet E-1 wiring), the manufacturer's assembly manual PDF, `desk-bom.csv`. We author A-1, E-1 and the BOM **after T+0** from tape-measure values |
| **Document parsing** | `pdftoppm` for page images; `pdf-parse` for the text layer. Both go to the model: the text layer carries exact dimension strings, which research shows lift accuracy sharply |
| **Model calls** | `gpt-5.6-luna` (OpenAI's model page confirms image input and JSON-schema structured output; G0 only checks that our key has access; else `gpt-5.6-terra`). `strict` JSON schema generated from the Zod `PlanDraft`. The prompt states the model frame and gives one worked example of a *different* object (a bookshelf) |
| **No invented numbers** | Every size and position carries `evidence` (`{page, text}`) or goes into `assumptions[]`. The review page shows assumptions in amber |
| **IDs** | The server assigns `part_id` from the canonical name (`Left rear leg` → `part_left_rear_leg`). On a new revision, parts are matched to the previous revision by name then by position, so IDs survive |
| **Steps** | Deterministic: topological sort of `rests_on`; ties broken by layer order (structure → hardware → electrical), then left to right, then larger first. The build order never depends on a model |
| **Human confirmation** | Required. Only `status: "approved"` plans can be instantiated as an `Assembly` |

### Validator (pure TypeScript, built with Codex, also used on E7 output)

| Code | Check | Severity |
|---|---|---|
| V1 | Schema valid; every size between 5 mm and 3 m; IDs match `^part_[a-z0-9_]+$` and are unique | error |
| V2 | Bounding box of all solid parts equals the stated overall size within 2 mm | error |
| V3 | No two solid parts interpenetrate by more than 1 mm on all three axes, unless linked by `relation: "inside"` or `"along"` | error |
| V4 | Every part except the datum has at least one `rests_on` target whose box is within 2 mm of touching it. The graph is connected and acyclic | error |
| V5 | Every part has a material; `material.quantity` equals the number of parts using it | error |
| V6 | Every part is in exactly one step; a part's step comes after the steps of everything it rests on | error |
| V7 | Pairs of like parts are symmetric about the centre plane | warning |
| V8 | Every `doc_refs` target exists | warning |

Polylines and meshes take part in V4 through their axis-aligned bounds and are exempt from V3.

**Unity generation.** `PlanLoader` parses the plan; `ShapeFactory` builds a unit cube, unit cylinder or generated tube per part, scaled to size, under `AssemblyRoot`; mesh shapes are looked up by node name in a glTFast-loaded GLB. Each part gets a `PartView`, a collider padded by 1 cm (so pointing is forgiving) and its `part_id` as the GameObject name.

**Deterministic bypass.** `data/demo/desk.plan.json` is committed, bundled in `StreamingAssets`, and seeded into the server at boot. Uploading a document whose hash is known returns that plan at once. Setting `RECONSTRUCTION=off` disables the AI path entirely.

---

## 7. E7 Reconstruction Pipeline

Offline, Python, overfit to E7, **time-boxed to 8 engineer-hours**, and started only after the owner's desk deliverables are done. It shares nothing at runtime with the live demo except the `Plan` schema and Unity's `TimelinePlayer`.

**Inputs (public).** Perkins&Will's drawings on ArchDaily: level plans 1–8 at 1:500, each with a 5/10/20 m scale bar; an E7 section; a site plan. `00_fetch.py` downloads them into `data/e7/raw/` (git-ignored) and writes `manifest.json` with URL, hash and date. Credit goes in `SOURCES.md` and on screen. We do not use UW Plant Operations plans (login-gated) and we have no electrical drawings.

| Stage | Script → artifact kept | Automated | AI-assisted | Manual / hard-coded for E7 |
|---|---|---|---|---|
| 1 Scale | `01_scale.py` → `stages/scale.json` | Computes px per metre from two points | none | Two clicks on each sheet's scale bar, stored in `e7_overrides.yaml` |
| 2 Register | `02_register.py` → `stages/registered/L0x.png` | Same-template sheets should already share pixel coordinates; verify with phase correlation on the stair and lift cores | none | Per-floor pixel offsets if needed |
| 3 Isolate E7 | `03_mask.py` → `stages/masked/L0x.png` | Applies a polygon mask | none | One footprint polygon per floor (the sheets also show E5 and the site) |
| 4 Walls | `04_walls.py` → `stages/walls_raw/L0x.svg` + overlay PNG | Threshold; keep thick strokes by morphological opening (walls are drawn heavier than furniture); line-segment detection; snap to the building's two axes; merge collinear; drop segments under 1 m; filled squares become columns | none | Stroke-width threshold tuned per sheet |
| 5 Semantics | `05_labels.py` → `stages/labels/L0x.json` | none | Vision model reads text labels (it reads drawing text about 95% of the time): "open to below", room names | Atrium void polygon if the label read fails |
| 6 Clean | Inkscape round-trip → `stages/walls_clean/L0x.svg` → `06_import.py` → `floors/L0x.json` | Import, snap, close gaps under 0.3 m | none | **Human deletes junk and adds missed walls in Inkscape over the drawing.** Budget 15 min per floor |
| 7 Heights | `07_heights.py` → `stages/heights.json` | Converts clicked pixels to metres using the building length measured on the plan | none | Click each floor line on the section. Provenance recorded as `estimated_from_section` |
| 8 Plan | `08_plan.py` → `out/e7.plan.json` | Builds parts per floor: `part_e7_l03_slab`, `_columns`, `_ext_walls`, `_int_walls`; about 35 parts; validates against the JSON Schema | none | Sawtooth roof as eight hand-entered prisms taken from the section |
| 9 Mesh | `09_mesh.py` → `out/e7.glb` + `stages/extruded/L0x.png` | shapely buffer by wall thickness → trimesh extrusion to floor height → one named node per `part_id` | none | Wall thickness constants |
| 10 Sequence | `10_steps.py` → steps inside the plan + `out/e7.events.json` | Rule-based `requires` graph: columns N → slab N+1 → columns N+1; exterior walls trail structure by two floors; interior walls follow the exterior; roof last. Topological sort. Planned timestamps from step durations | none | The rules themselves |
| 11 Video | Unity `E7Vision` scene (Editor, desktop quality with bloom) + ffmpeg → `out/e7_vision.mp4` | `TimelinePlayer` replays `e7.events.json`; Unity Recorder captures | none | Edit: stage montage (original → walls → cleaned → extruded → stacked) then the 4D build |

**Honesty rules.** Geometry comes from classical image processing plus human cleanup; the model only reads labels. The video carries the caption "Generated from Perkins&Will's published E7 drawings. Heights estimated from the section. Interiors simplified." The overrides file is committed, so anyone can see exactly what was hand-entered. Stage images that contain the architects' drawing pixels stay git-ignored and appear only in the video, with credit; the public repo gets geometry-only versions.

**Fallback ladder.** Full pipeline → exterior walls, slabs and columns only (skip interior walls) → **massing model**: eight hand-traced footprints extruded to the estimated heights, rising floor by floor (about 90 minutes of work) → no video, closing line only.

---

## 8. Litematica / AR Rendering Engine

### Visual state = base state + modifiers

`VisualStateResolver` is the only code that decides how a part looks. It runs whenever build state, step, selection, highlights, verification set or timeline cursor changes, and pushes one `PartVisual` struct to each `PartView`. No part is ever special-cased.

```
base(part) =
  state == "wrong"                          → WRONG
  state == "built"                          → BUILT_LIVE   (or BUILT_REPLAY when the timeline cursor ≠ live)
  part ∈ current step                       → CURRENT_STEP
  all rests_on parts built                  → MISSING      (available, not current)
  otherwise                                 → FUTURE       (blocked)

modifiers(part) ⊆ { SELECTED, HIGHLIGHTED, VERIFYING, UNVERIFIED }     drawn on top of the base
```

| State | Fill | Edges | Animation | Collider | Meaning |
|---|---|---|---|---|---|
| **BUILT_LIVE** | none, so the real part stays visible | Thin green corner brackets; α 0.6 fading to 0.15 after 3 s | Brief flash and tick sound on entry | yes | Confirmed in place |
| **BUILT_REPLAY** | Solid blue, α 0.55 | Bright blue | Rises into place over 0.4 s | no | History or planned playback |
| **CURRENT_STEP** | Cyan, α 0.35 | Thick bright cyan + grid | Pulse at 1.2 Hz | yes | Build this now |
| **MISSING** | Cyan, α 0.18 | Steady cyan | none | yes | Can be built, not the current step |
| **FUTURE** | α 0.05 | Thin dim blue | none | yes (so "what goes here?" still works) | Blocked by an earlier part |
| **WRONG** | Red, α 0.30 | Pulsing red | 2 Hz pulse, "!" badge | yes | Flagged wrong |
| *+ SELECTED* | unchanged | White outline, label card (name, size, material, step, state) | none | n/a | Under the pointer |
| *+ HIGHLIGHTED* | +0.15 α | Yellow sweep | 6 s, then fades | n/a | The copilot is talking about this |
| *+ VERIFYING* | unchanged | Amber scanning stripe | Until the verdict or 8 s | n/a | Camera check running |
| *+ UNVERIFIED* | unchanged | Amber dashed | none | n/a | The camera disagreed; waiting for the user |

Priority when modifiers collide: WRONG > VERIFYING > HIGHLIGHTED > SELECTED.

**Implementation.** One URP Shader Graph, `CutOnce/Hologram`: unlit, transparent, ZWrite off, works with single-pass instanced stereo. Properties set per renderer through `MaterialPropertyBlock`: `_FillColor`, `_FillAlpha`, `_EdgeColor`, `_EdgeWidth`, `_GridScale`, `_PulseHz`, `_StripePhase`. Box edges and the grid come from object-space position against the box extents; cylinders and meshes use a fresnel rim. A `HologramPalette` ScriptableObject maps each state to those values, so design changes never touch code. Bloom is off on device (too costly on the headset); brighter edges stand in for it. The Editor-rendered E7 video uses bloom.

**HUD in model space.** A panel stands behind the desk, tilted toward the Operator: progress bar, step card, history list, timeline slider, status toasts. World-locked UI is stable on the cast; head-locked UI shakes.

**Occlusion (P2).** Meta's Depth API soft occlusion, so ghosts hide behind the Builder's hands. It is unreliable closer than about 0.2 m.

---

## 9. 4D State + Versioning Architecture

### The reducer (implemented twice: TypeScript on the server, C# on the headset; one shared fixture proves they agree)

```
fold(plan, events, upTo = ∞):
  S = { p.part_id: { state: "missing", since_version: 0, last_event_id: null, verified: null } for p in plan.parts }
  for e in events ordered by version where e.version ≤ upTo:
     if e.kind == "verification":  S[e.part_id].verified = { verdict, confidence };  continue
     if e.kind != "part_state":    continue                        # alignment, annotation: timeline only
     cur = S[e.part_id]
     if e.new_state == cur.state:  continue                        # no-op, rejected at append with 409
     if e.previous_state != cur.state:  flag(e, "stale_previous")  # still applied: the physical world wins
     S[e.part_id] = { state: e.new_state, since_version: e.version, last_event_id: e.event_id, verified: null }
  return derive(plan, S)

derive(plan, S):
  built            = parts with state "built"
  step_done(s)     = every part of s is built
  current_step     = first step by index with not step_done(s) and every s.requires done
  available        = missing parts whose rests_on are all built
  blocked          = missing parts not in available
  progress.pct     = round(100 · |built| / |parts|)
  minutes_left     = Σ est_minutes of steps not done
  out_of_sequence  = hard: a part built while something it rests on is not built
                     soft: a part built while an earlier-index step was unfinished
```

Any state may change to any other state. Removing a part is `built → missing`. **Undo** appends the inverse event with `note: "undo of evt_…"`; nothing is ever deleted.

### Append protocol

1. The headset creates the event with a ULID `event_id`, `version: null`, applies it locally, writes it to `journal_<assembly>.jsonl`, and queues it.
2. `POST /v1/assemblies/:aid/events` is idempotent on `event_id`. The server assigns `version = head + 1`, appends to `<aid>.events.jsonl`, updates its in-memory state, broadcasts `event_appended`, and indexes to Elasticsearch in the background.
3. The headset records the returned `version`. Until then the event shows a provisional version (`head + n`).
4. Events from the Director page (force state, reset) take the same route and reach the headset over the WebSocket.
5. Node is single-threaded and there is one writer per assembly in practice, so ordering is trivial. Offline: the outbox flushes in order on reconnect.

### What the log powers

| Feature | How |
|---|---|
| Live progress | `derive()` after each local apply |
| Timeline slider | `fold(plan, events, upTo = N)` on the headset, no network. The cursor is view-only: while it is not at the head, state-changing input is disabled and a banner shows "History · V3 of V7" |
| Planned future and the "print itself" replay | `plan.steps` expanded into synthetic, unsaved events; the same player runs them |
| Planned vs actual | Compare the order of `built` events with step indices; `out_of_sequence` lists deviations |
| Reset for the next judge | A **new `Assembly`** seeded from `demo_start` (`source: "seed"`). Old runs stay in the log |
| Analytics | ES\|QL over `cutonce-build-events`: seconds per step, runs compared, which steps get undone |
| Standards talking point (P3) | Export a run as an IFC "actual" schedule with `ActualFinish` per part through IfcOpenShell |

Version labels on the HUD read `V4 · Left rear leg built · 09:12:07 · manual`.

---

## 10. Copilot Architecture

The advantage over "a chatbot in a headset" is the context packet: the copilot knows which part you point at, which parts are in view and where in the image, what is built, and which step you are on. The headset builds that packet deterministically. The model never has to guess it.

### Headset side (owner: C)

| Moment | What happens |
|---|---|
| **A pressed** | Freeze `selected_part_id` (controller ray → first `PartView` collider hit; ghosts have colliders, so pointing at an empty spot selects the missing part. If the ray hits nothing, use a gaze ray from the centre eye). Grab one camera frame with its pose and intrinsics. Start the mic (16 kHz mono). Show the listening ring |
| **While held** | Nothing else. Max 12 s |
| **A released** | Stop the mic; encode WAV. `PartProjector` projects every part's eight box corners into the frozen frame → `visible_parts`. Encode the JPEG (quality 75, off the main thread). Send one multipart request. Show "Thinking" |
| **Response** | Apply `highlight_parts` at once, show the answer text and source card, stream the audio. A spoken command (`done`, `next`, `mark … built`) arrives as an `action`; apply it and show a 2 s **Undo** toast instead of a confirm dialog, because the user said it |

`ICameraFrameSource` has two implementations: `PcaFrameSource` (device) and `FixtureFrameSource` (Editor; replays a recorded JPEG + pose + intrinsics). That lets C build most of this without the headset.

### The context packet

```json
{
  "context_id": "ctx_01J8ZM…", "assembly_id": "asm_desk_run_017", "plan_revision": 3, "state_version": 4,
  "mode": "overlay",
  "selected_part_id": "part_power_cable", "selection_source": "controller_ray",
  "current_step_id": "step_05",
  "visible_parts": [
    { "part_id": "part_right_rear_leg", "state": "missing", "bbox_px": [812, 210, 96, 540], "in_frame": 1.0,  "distance_m": 1.1 },
    { "part_id": "part_cable_tray",     "state": "missing", "bbox_px": [402, 590, 470, 130], "in_frame": 0.92, "distance_m": 0.9 }
  ],
  "camera": { "width": 1280, "height": 960, "fx": 870.1, "fy": 870.4, "cx": 640.2, "cy": 481.7 },
  "scripted_query_id": null, "client_sent_at": "2026-09-20T13:13:31.020Z"
}
```

Multipart fields: `context` (the JSON above), `audio` (WAV), `frame` (JPEG). The headset sends **no** build state and **no** part metadata: the server already has both, and one source of truth avoids drift. `state_version` lets the server warn if the two sides disagree.

### Server pipeline and latency budget

```
t=0.0  request arrives (≈ 350 KB: upload 0.3–0.8 s on a hotspot)
  ├─ fast path: none yet
t≈0.8  STT  gpt-transcribe                                   0.5–1.0 s    timeout 3 s
  ├─ fast path: transcript matches ^(done|next|undo|mark .+ (built|done|wrong))$ → action, skip the model (total < 1.5 s)
t≈1.0  in parallel (no model involved):
  ├─ retrieve(): Elasticsearch hybrid search on "<transcript> <selected part name and aliases>",
  │              chunks tagged with the selected part boosted; top 5 after rerank      0.2–0.4 s  timeout 0.8 s
  ├─ structured lookups from memory: BuildState, selected Part, its Material, its Step, last 5 events, last 2 turns
  └─ annotate frame: draw visible_parts boxes with short labels on a 1024-px copy (sharp + SVG)
t≈1.4  ONE call: gpt-5.6-luna, images = [annotated frame, raw frame], strict JSON output      1.5–3.0 s  timeout 6 s
         optional: at most one tool round if the model asks (log_issue, build_history, search_documents)
t≈3.5  post-validate: drop any part_id not in the plan; drop any ref not in the retrieved set
t≈3.6  respond to the headset; start ElevenLabs Flash v2.5 PCM stream behind GET /v1/audio/:id   first byte 0.3–0.5 s
t≈4.2  first audio on the headset and on the Director page                    hard cap 9 s → cached answer or text only
```

Every stage time is logged per turn and shown on the Director page. If retrieval times out, the call proceeds without documents and the answer says it has no source.

### What goes where

| Need | Source | Why |
|---|---|---|
| What is built, what is next, time left | `BuildState` from memory | Exact and instant. Never ask a model or a search index for facts we hold |
| Size, material, step, relations of a part | `Plan` from memory | Same |
| What the drawings and manual say | Elasticsearch `cutonce-docs`, hybrid + rerank, boosted by `part_ids` | Messy text, needs ranking, must be citable |
| "Is this the right screw?", "what's in my hand?" | The raw frame | Only the image has it |
| Where things are in the image | The annotated frame with labelled boxes | Lets the model tie pixels to `part_id`s without guessing |
| History questions and analytics | ES\|QL tool over `cutonce-build-events` | Aggregations; also the Elastic story |
| Actions | Agent Builder workflow tool `log_issue` | "Closes the loop" for the Elastic prize |

### Prompt contract (server-side only)

System rules: answer in at most two short spoken sentences; refer to parts only by IDs from the provided table; cite only provided chunks; if the state table says a part is missing, never call it built; if unsure, say so and set `needs_clarification`; never invent a dimension.

### Response

```json
{
  "turn_id": "turn_01J8ZM…", "transcript": "where does this cable go",
  "answer_text": "Run it through the cable tray to the right rear leg, then clip it down the leg. That's on sheet E-1.",
  "highlight_parts": ["part_power_cable", "part_cable_tray", "part_right_rear_leg"], "highlight_style": "path",
  "drawing_refs": [{ "document_id": "doc_desk_drawings", "sheet_id": "sheet_e1", "page": 2, "chunk_id": "chunk_0042",
                     "title": "E-1 Wiring" }],
  "action": null, "confidence": 0.9, "needs_clarification": false,
  "audio_url": "/v1/audio/turn_01J8ZM…", "cached": false,
  "timings_ms": { "upload": 410, "stt": 720, "retrieve": 260, "llm": 2100, "total_to_response": 3540 }
}
```

`action` when present: `{ "type": "mark_state", "part_ids": ["part_left_rear_leg"], "new_state": "built", "source": "voice" }` or `{ "type": "log_issue", "issue_id": "…" }`.

### Cache and offline

Every successful answer to a scripted question can be **promoted** from the Director page into `demo_cache/` (response JSON + WAV). The cache is served when the hard cap hits or when `scripted_query_id` is set by a HUD query button, and a copy ships inside the APK. Cached answers are real pipeline outputs, flagged `cached: true` on the Director page.

Voice: push-to-talk is P0. "Hey copilot" is P3 (Vosk keyword spotting) and is never on the golden path.

---

## 11. Camera Verification

We never ask "what is in this picture?". We ask one narrow question about one part whose identity, location and appearance we already know.

```
trigger: a part was just marked built (automatic), or "Check" on a selected part, or "what's left?" batch (P1)
  │
  ├─ headset: frame F + camera pose + intrinsics
  ├─ headset: bbox of the target part in F (PartProjector), padded 25%, clamped
  │           reject locally if in_frame < 0.6 or bbox area < 40×40 px  → "Look at the part and try again"
  ├─ headset: EXPECTED VIEW: a second Unity camera with the same pose and a projection matrix built from
  │           fx, fy, cx, cy renders AssemblyRoot to a 640×480 texture: built parts grey, target part solid magenta
  ▼
POST /v1/assemblies/:aid/verify   (frame, expected_view, request JSON)
  ├─ server crops both images to the padded bbox
  ├─ one model call, strict JSON:
  │     "Image A is a photo. Image B is a render from the same viewpoint; magenta marks where the
  │      <Left rear leg: black steel tube, 40 mm wide, 70 cm long, standing upright on the panel> must be if installed.
  │      Is that object physically present in Image A at the magenta location?"
  ▼
{ verdict: present | absent | wrong_orientation | unsure, confidence, evidence }
```

### Gating: the verdict never writes state

| Current state | Verdict | What happens |
|---|---|---|
| built (user said so) | `present`, conf ≥ 0.8 | A `verification` event attaches `{present, 0.91}`. Toast: "Camera check: looks installed" |
| built | `absent` or `wrong_orientation`, conf ≥ 0.8 | `+UNVERIFIED` modifier and a prompt: "I can't see it there. Keep it as built?" **Keep** → nothing changes. **Not built** → a new `manual` event `built → missing` |
| missing (batch check) | `present`, conf ≥ 0.8 | Suggestion card: "Looks installed. Mark built?" **Yes** → event with `source: "camera_verification"`, `confidence` = the model's, `actor` = the user who accepted |
| any | `unsure`, low confidence, timeout (8 s), error | Stripe clears. Nothing is shown, nothing changes |

Failure states are logged with the crop so we can tune the prompt. Verification can be switched off from the operator panel; nothing else depends on it.

**P2, deterministic second signal: depth probe.** Cast a few environment raycasts (Depth API) from the head toward sample points on the part's surface. If most hits land within 3 cm of the expected surface, something solid is there. It is instant and offline, but too coarse for thin parts. Build it only after every P0 and P1 is done.

---

## 12. Backend + Elasticsearch Architecture

### Responsibilities

| Module (`services/api/src/`) | Does | Owner |
|---|---|---|
| `routes/`, `ws/` | REST, WebSocket fan-out, bearer-token check, multipart parsing | B |
| `store/` | Plans, documents, assemblies, JSONL event logs, audio files. Atomic writes. In-memory cache of the active assembly | B |
| `director/` | New run from seed, force event, switch headset server URL, promote cache | B |
| `reconstruction/` | Rasterise, extract, validate, repair, review, approve, hash dedupe, job stages | B |
| `copilot/` | Context build, fast path, prompts, model call, post-validation, TTS proxy, cache | C |
| `verification/` | Crop, prompt, verdict | C |
| `search/` | `retrieve(ctx)`, Agent Builder MCP client with direct-query fallbacks, ES\|QL helpers | D |
| `ingest/` | Chunking, part-ID linking, indexing, `reindex` CLI | D |
| `packages/project-model` | `fold`, `derive`, `steps`, `validate`, `diff` (pure, tested, built with Codex) | B |

### Indices

| Index | One document is | Key fields |
|---|---|---|
| `cutonce-docs` | A chunk of an uploaded document (a paragraph, a table row group, a callout) | `chunk_id`, `project_id`, `document_id`, `sheet_id`, `doc_type`, `page`, `title`, `text`, `text_semantic` (`semantic_text`, Jina embeddings), **`part_ids`**, `material_ids`, `bbox_norm`, `page_image_uri` |
| `cutonce-parts` | One part of one plan revision | `part_id`, `plan_id`, `revision`, `name`, `aliases`, `layer`, `kind`, `material_id`, `step_id`, `dims_text`, `description_semantic`, `rests_on` |
| `cutonce-materials` | One BOM row, normalised | `material_id`, `name`, `spec`, `unit`, `quantity`, `used_by`, `raw_text` |
| `cutonce-build-events` | One `BuildEvent` | `@timestamp`, `assembly_id`, `plan_id`, `version`, `kind`, `part_id`, `previous_state`, `new_state`, `source`, `confidence`, `step_id`, `seconds_since_prev` |
| `cutonce-copilot-turns` | One question and answer | `turn_id`, `transcript`, `answer_text`, `selected_part_id`, `highlight_parts`, `chunk_ids`, `timings_ms.*`, `cached` |

**Part linking at ingest** is what makes retrieval spatial. For each chunk, a cheap model call gets the part table and returns which `part_id`s the chunk is about. At query time, chunks tagged with the selected part get a boost (a `should` clause, not a hard filter, so general answers still surface).

### Retrieval

`text_similarity_reranker` (Jina reranker) over an `rrf` retriever that fuses a BM25 `multi_match` on `title^2, text` (with the `part_ids` boost) and a `semantic` query on `text_semantic`. Window 30, return 5. Confirm the Jina inference IDs and that the cluster is 9.4+ at the Elastic booth before writing mappings. If semantic or rerank is unavailable, `retrieve()` degrades to BM25 with the same return type.

### Agent Builder tools and the Workflow

Tools are defined as JSON in `knowledge/agent-builder/` and created through the API, so they are reproducible. Our server is the MCP client (OpenAI's hosted MCP tool cannot send Elastic's `ApiKey` header). Each tool has a direct-query twin in `search/fallbacks.ts` with the same signature.

| Tool | Backing | Used for |
|---|---|---|
| `search_documents(query, part_id?)` | Hybrid retriever above | Follow-up questions the prefetch missed |
| `find_parts(query)` | `cutonce-parts` | "Which part is the stretcher?" |
| `lookup_material(material_id \| text)` | `cutonce-materials` | Sizes, quantities |
| `build_history(assembly_id, question)` | **ES\|QL** | "How long did the legs take?", "What changed since V2?" |
| `log_issue(part_id, note, photo_ref)` | **Workflow**: index an issue doc, then POST a webhook to our Director page | The action that closes the loop |

```esql
FROM cutonce-build-events
| WHERE kind == "part_state" AND new_state == "built"
| STATS runs = COUNT_DISTINCT(assembly_id), median_s = MEDIAN(seconds_since_prev) BY step_id
| SORT step_id
```

### Persistence, hosting, security

- Disk layout on the VM: `data/runtime/{plans,documents,assemblies,audio,uploads}`. Event logs are JSONL, appended with `fs.appendFile`, fsync on each event.
- Elasticsearch indexing is fire-and-forget with a retry queue. `pnpm reindex` rebuilds every index from disk.
- Caddy terminates HTTPS on the GoDaddy Registry domain. One shared bearer token in the headset config and the web app. That is all the auth we build.
- **Laptop fallback:** `pnpm serve:local` runs the same server on a laptop on the hotspot. The headset's operator panel switches between the domain and the laptop's IP. The Android manifest must allow cleartext traffic for that LAN address.

---

## 13. Unity Architecture

**Project.** Fork QuestCameraKit's project so package versions, OpenXR features, permissions and the Android manifest start out working. All our code lives under `Assets/CutOnce/`. Delete unused sample scenes once gate G4 passes. URP, single-pass instanced, force-text serialisation, UnityYAMLMerge, Git LFS for binaries.

**Scenes.** `Main.unity` (device). `E7Vision.unity` (Editor only, for the video). `Main` contains one object, the `[App]` prefab, which nests one prefab per feature. **Only A edits the scene and `[App]`**; everyone else edits their own nested prefab, which is how two Unity developers avoid merge conflicts.

| Prefab | Owner | Holds |
|---|---|---|
| `[XRRig]` | A | Camera rig, passthrough layer, controllers, ray visual |
| `[Assembly]` | A | `AssemblyRoot`, `PlanLoader`, `ShapeFactory`, `PartViewRegistry`, `VisualStateResolver`, `SelectionController` |
| `[Alignment]` | A | `AlignmentController`, the three sources, `NudgeController`, proof overlay, anchor store |
| `[HUD]` | A | Model-space panel: progress, step card, history, timeline, toasts, query buttons, source card |
| `[Copilot]` | C | `PushToTalk`, `MicRecorder`, `PcaFrameSource`, `PartProjector`, `ExpectedViewRenderer`, `CopilotClient`, `VerificationClient`, `PcmStreamPlayer` |
| `[Demo]` | A | `DemoDirector`, operator panel |

**Assemblies (asmdef).**

| Assembly | Depends on | Content |
|---|---|---|
| `CutOnce.Core` | nothing (pure C#, Editor-testable) | DTOs, `ModelSpace`, `BuildStateStore`, `Reducer`, `StepEngine`, `TimelineController`, interfaces |
| `CutOnce.Net` | Core | `ApiClient`, WebSocket, outbox, journal |
| `CutOnce.AR` | Core, Meta XR | Alignment, rendering, selection |
| `CutOnce.Copilot` | Core, Net, Meta XR | Capture, projection, voice, verification |
| `CutOnce.UI`, `CutOnce.Demo` | Core, AR | HUD, director |

**Interfaces agreed at T+0 (in `Core/Interfaces/`)** so A and C never wait on each other:

```csharp
public interface IPartIndex   { Part Get(string partId); Bounds WorldBounds(string partId); IEnumerable<string> AllIds { get; } }
public interface ISelection   { string SelectedPartId { get; } event Action<string> Changed; }
public interface IHighlighter { void Highlight(IReadOnlyList<string> partIds, string style, float seconds); void Clear(); }
public interface IBuildState  { BuildState Current { get; } BuildState At(int version); void Apply(BuildEvent e); event Action Changed; }
public interface IAlignment   { bool IsLocked { get; } Pose WorldFromModel { get; } }
public interface ICameraFrameSource { Task<CameraFrame> CaptureAsync(); }   // texture + pose + intrinsics + timestamp
public interface IAlignmentSource   { Task<AlignmentSample[]> CollectAsync(CancellationToken ct); }  // model point ↔ world point pairs
```

**State ownership inside Unity.** `BuildStateStore` is the only holder of events. `TimelineController` holds the view cursor. `VisualStateResolver` is the only writer of part visuals. `AlignmentController` is the only writer of `AssemblyRoot`'s pose. `DemoDirector` may call the same public methods a user input would; it has no private back doors.

**Input map (right controller unless noted).** Trigger = select / confirm. **A** (hold) = push-to-talk. **B** = mark the selected or current part built. Thumbstick left/right = timeline. Thumbstick click = back to live. Left controller **menu (hold 1 s)** = operator panel.

---

## 14. API / Interface Contracts

All JSON over HTTPS with `Authorization: Bearer <token>`. Errors: `{ "error": { "code": "…", "message": "…" } }`. "Owner" is who implements the server side.

| Endpoint | Request | Response | Sync? | Owner | Failure behaviour |
|---|---|---|---|---|---|
| `GET /health` | none | `{ok, version, es, openai, tts}` | sync | B | Headset shows which dependency is down |
| `POST /v1/projects/:pid/documents` | multipart `file`, `doc_type?` | `201 {document_id, job_id}` or `200 {document_id, known_plan_id, revision}` on a hash hit | sync intake, async job | B | 413 over 25 MB; bad file → 422 |
| `GET /v1/jobs/:job_id` | none | `{status, stages:[{name, status, ms, artifact_uri?}], plan_id?, issues?}` | sync (web polls at 1 Hz) | B | Job failure keeps the artifacts for the review page |
| `GET /v1/plans/:plan_id?revision=` | none | `Plan` | sync | B | 404 → headset loads the bundled plan |
| `PUT /v1/plans/:plan_id/draft` | `Plan` (from the review page) | `{revision, validation}` | sync | B | Validation errors returned, not thrown |
| `POST /v1/plans/:plan_id/approve` | `{revision, approved_by}` | `Plan`; WS `plan_ready` | sync | B | 409 if validation has errors |
| `POST /v1/assemblies` | `{plan_id, revision, seed}` | `Assembly`; WS `assembly_changed` | sync | B | none |
| `GET /v1/assemblies/current` | none | `Assembly` | sync | B | 404 → headset creates a local run |
| `GET /v1/assemblies/:aid/events?after=` | none | `{events, head}` | sync | B | Headset falls back to its journal |
| `POST /v1/assemblies/:aid/events` | `BuildEvent` with `version: null` | `201 {version, head}`; replays return `200` with the original version; same-state → `409 no_op` | sync | B | Network error → outbox retry with backoff |
| `GET /v1/assemblies/:aid/state?version=` | none | `BuildState` | sync | B | Used by web and copilot; the headset folds locally |
| `POST /v1/assemblies/:aid/copilot/query` | multipart `context`, `audio`, `frame` | `CopilotResponse` (section 10) | sync, ≤ 9 s | C | 504 or cap → headset plays the cached or bundled answer |
| `GET /v1/audio/:turn_id` | none | chunked `audio/L16; rate=22050` (PCM) | streaming | C | On failure the headset shows text only |
| `POST /v1/assemblies/:aid/verify` | multipart `request`, `frame`, `expected_view` | `VerificationResult` | sync, ≤ 8 s | C | Timeout → `{verdict:"unsure"}` |
| `GET /v1/projects/:pid/search?q=&part_id=` | none | `{chunks:[…]}` | sync | D | Web search box and the Elastic sponsor demo |
| `POST /v1/director/:aid/command` | `{type:"new_run"\|"force_state"\|"goto"\|"promote_cache"\|"set_flag", …}` | `{ok}`; WS `director_command` | sync | B | none |
| `WS /v1/assemblies/:aid/stream` | none | Server → client: `event_appended`, `assembly_changed`, `plan_ready`, `director_command`, `copilot_turn` (for the Director page) | push | B | Auto-reconnect; headset polls `events?after=` every 2 s while disconnected |

```json
// VerificationRequest
{ "verification_id": "ver_01J8…", "part_id": "part_left_rear_leg", "claimed_state": "built", "state_version": 4,
  "bbox_px": [188, 140, 120, 560], "in_frame": 0.97,
  "camera": { "width": 1280, "height": 960, "fx": 870.1, "fy": 870.4, "cx": 640.2, "cy": 481.7 } }

// VerificationResult
{ "verification_id": "ver_01J8…", "part_id": "part_left_rear_leg",
  "verdict": "present", "confidence": 0.91,
  "evidence": "A black tube stands at the magenta location, on the panel.",
  "model": "gpt-5.6-luna", "ms": 2840 }
```

**Local functions, deliberately not endpoints:** `fold`, `derive`, step generation, validation, retrieval, prompt assembly, cropping. They are imports inside the one service.

---

## 15. Repository Structure

```
cut-once/
├─ apps/
│  ├─ quest/                         Unity 6 project (fork of QuestCameraKit)              A, C
│  │  └─ Assets/
│  │     ├─ CutOnce/
│  │     │  ├─ Core/        Schemas/ ModelSpace.cs State/ Steps/ Timeline/ Interfaces/ Tests/
│  │     │  ├─ Net/         ApiClient, WsClient, Outbox, Journal
│  │     │  ├─ AR/          Alignment/ Rendering/ Selection/ Shaders/
│  │     │  ├─ Copilot/     Capture/ Projection/ Voice/ Verification/                       C
│  │     │  ├─ UI/  Demo/
│  │     │  ├─ Prefabs/     [App] [XRRig] [Assembly] [Alignment] [HUD] [Copilot] [Demo]
│  │     │  └─ Scenes/      Main.unity  E7Vision.unity
│  │     ├─ StreamingAssets/  config.json  desk.plan.json  e7.plan.json  demo_cache/
│  │     └─ ThirdParty/QuestCameraKit/   (kept subset, MIT licence file retained)
│  └─ web/                           Vite + React + three.js                               B
│     └─ src/pages/  Upload  Review  Director  History
├─ services/
│  └─ api/src/   server.ts routes/ ws/ store/ director/ reconstruction/ copilot/ verification/ search/ ingest/
├─ packages/
│  ├─ schemas/          Zod source → dist/jsonschema/*.json → types          ◄── the shared schemas live here
│  └─ project-model/    fold · derive · steps · validate · diff · cli
├─ knowledge/           mappings/ ingest-pipelines/ agent-builder/ workflows/ esql/        D
├─ tools/
│  ├─ e7/               00_fetch.py … 10_steps.py  e7_overrides.yaml  requirements.txt     D
│  └─ qr/               marker sheet generator (reads plan.markers)                       A
├─ data/
│  ├─ demo/             desk.plan.json  desk-drawings.pdf  desk-bom.csv  seeds/demo_start.json
│  ├─ fixtures/         plan_asymmetric.json  events_to_state/*.json  context_packet.json
│  │                    copilot_response.json  frame_0001.jpg + frame_0001.pose.json
│  ├─ e7/               raw/ (git-ignored)  stages/  floors/  out/
│  └─ runtime/          (git-ignored)
├─ infra/               Caddyfile  deploy.sh  cutonce.service
├─ docs/                this blueprint · demo-script.md · rehearsal-checklist.md
├─ CODEX_LOG.md  SOURCES.md  README.md  .gitattributes  pnpm-workspace.yaml
```

- **Schemas flow one way:** `packages/schemas` → JSON Schema → TypeScript types (server, web), hand-mirrored C# DTOs (`Core/Schemas`), `jsonschema` validation in Python. `pnpm sync:fixtures` copies `data/fixtures` into `Core/Tests/Fixtures` (Unity and symlinks do not mix well).
- **Directory ownership is the merge strategy.** A schema or interface change is announced to all four before it lands.

---

## 16. Four-Person Ownership Plan

> **Named owners (2026-09-18):** see `2026-09-18-cut-once-team-plan.md`. Jerry Chen and Henry Cai split column **A** into A1 Spatial and A2 Rendering & State; Michael holds **B + D**; Rhythm holds **C**. The generic table below and the column headers in section 18 stay valid; read A as A1+A2, B and D as Michael, and C as Rhythm. Where the two differ, the team plan wins (it moves the C# state code and the E7 video scene to A2, and submits the Devpost skeleton at T+1 instead of T+13).

The split is by **vertical slice, not by layer**: C owns the copilot on both the headset and the server, so nobody waits on a hand-off in the middle of the riskiest feature.

| | **A · Spatial** | **B · State & Platform** | **C · Copilot** | **D · Knowledge & Reconstruction** |
|---|---|---|---|---|
| **Best fit** | Whoever has shipped Unity to a Quest | Strongest TypeScript/backend person; integration lead | Comfortable in both C# and TypeScript, good with prompts | Data person; patient with messy documents; some Python |
| **Owns** | `apps/quest` scene, `[App]`, `Core/` (C# side), `AR/`, `UI/`, `Demo/`, `tools/qr` | `packages/*`, `services/api` core (`routes store ws director reconstruction`), `apps/web`, `infra/`, Devpost, `CODEX_LOG.md` | `Assets/CutOnce/Copilot/`, `[Copilot]` prefab, `services/api/src/{copilot,verification}` | `knowledge/`, `services/api/src/{search,ingest}`, `data/demo/*` (the desk documents and the canonical plan), `tools/e7`, the videos |
| **Depends on** | `Plan` fixture (B, T+0:30); canonical desk plan (D, T+3) | Nothing to start. Later: D's `retrieve()` only through C | `IPartIndex`, `ISelection`, `IHighlighter`, `IAlignment` stubs (A, T+0:45); `retrieve()` (D); `BuildState` (B) | Part table from the plan (own work); `TimelinePlayer` and the hologram shader for the E7 video (A, by T+20) |
| **Mocks to start with** | `EditorFixedAlignmentSource`; bundled fixture plan; no server needed | In-memory store; `curl` scripts for events | `FixtureFrameSource` (recorded JPEG + pose); laptop mic in the Editor; `retrieve()` returning fixture chunks; stub `BuildState` | None needed; works against Elastic directly |
| **P0 deliverables** | G1, G3, G4; plan → parts on the real desk; visual states; select + mark built; HUD progress and step; timeline scrub and replay; anchor save/restore; touch-point fallback; nudge; `DemoDirector` | Monorepo, schemas, fixtures; reducer/steps/validator (with Codex); events API + JSONL + WebSocket; Vultr + Caddy + domain; Director page; Devpost draft by T+13 | G2, G6, G7; context packet; `/copilot/query` end to end; structured answer → highlights; streamed audio; cached answers + offline bundle; timeouts | Measured canonical `desk.plan.json` + A-1/E-1/BOM documents (T+0 to T+3); indices + ingest + part linking; `retrieve()` BM25 then hybrid + rerank; events indexed |
| **P1 deliverables** | Print-itself replay; history panel; proof overlay; upload-mode surface placement; label card polish | Upload → extraction → validation → review → approve; hash dedupe; job stages UI; History page; laptop-fallback server | Verification (expected view, crop, verdict, prompts); voice fast-path commands; follow-up context; "what's left?" | Agent Builder tools over MCP with fallbacks; `log_issue` Workflow; ES\|QL panel; E7 pipeline and video (8 h box) |
| **Integration point** | `IBuildState.Apply` ↔ B's events API (G5) | Same, plus WS to the headset | `IHighlighter` ↔ A's renderer; `retrieve()` ↔ D (T+11) | `retrieve()` signature; `e7.plan.json` loads in A's `PlanLoader` (T+20) |

**The one headset.** Until T+14: **A has it on odd hours, C on even hours**, swaps on the hour, the holder's build wins. After T+14 it lives on the integration bench and anyone may deploy `main`. **Ask the HTN hardware desk for a second Quest 3/3S tonight**; it removes the biggest logistics risk we have.

**Codex for the OpenAI prize.** B builds `packages/project-model` test-first with Codex (reducer, step sort, validator) and D uses it on the E7 scripts. Each concrete win goes into `CODEX_LOG.md` with the prompt and the diff. Work done with other assistants does not count for that prize.

---

## 17. Dependency Graph

```
T+0  CONTRACTS: Zod schemas · C# interfaces · fixtures (plan_asymmetric, events→state, context packet)
        │
        ├────────────────────────┬──────────────────────────────┬─────────────────────────────┐
        ▼                        ▼                              ▼                             ▼
  A: Unity on Quest (G1)   B: reducer + events API        C: frame + audio → server (G2) D: measure desk →
        │                        │  + deploy (G8)               │                           canonical desk.plan.json
        ▼                        │                              ▼                             │      + A-1 / E-1 / BOM
  A: QR poses (G3)               │                        C: PTT → STT → model → TTS (G6)     ▼
        │                        │                              │                         D: indices + ingest
        ▼                        │                              │                             │
  A: fixture parts aligned ◄─────┼──── desk.plan.json (D) ──────┤                             ▼
     on the real desk (G4)       │                              │                         D: retrieve() v0 (BM25)
        │                        ▼                              │                             │
        └──────────► G5: mark built → event → version → HUD ◄───┘                             │
                                 │                                                            │
                                 ▼                                                            ▼
                     VERTICAL SLICE (T+11): aligned ghost · mark built · ask one question with retrieval · highlight
                                 │
        ┌────────────────────────┼──────────────────────────────┬─────────────────────────────┐
        ▼                        ▼                              ▼                             ▼
  visual states · timeline   upload → extract → review     verification · cache ·        hybrid + rerank · tools ·
  replay · restore · touch   Director · History            fast path · follow-ups        Workflow · ES|QL
        │                        │                              │                             │
        └────────────────────────┴──────────────┬───────────────┴─────────────────────────────┤
                                                ▼                                             ▼
                                  DemoDirector + rehearsal (T+24)                 E7 pipeline → video (needs A's
                                                                                  TimelinePlayer + shader, T+20)
```

**What truly blocks what**

- Nothing blocks A, B and C in the first hour except the contracts.
- G4 needs only a fixture plan, not the real one. The real `desk.plan.json` swaps in when D delivers it.
- The copilot's first end-to-end run (G6) needs neither retrieval nor build state.
- Verification needs G2 **and** G4 (projection is meaningless without alignment).
- E7 blocks nothing and is blocked only by D's own P0s and, for the video, A's player.

---

## 18. Hour-by-Hour Build Plan

Priority = demo importance × technical risk. **P0** the demo cannot succeed without it · **P1** major improvement · **P2** polish · **P3** cut first.

### Gates (anything that can kill the demo gets tested first)

| Gate | By | Pass condition | Owner | If it fails |
|---|---|---|---|---|
| G0 | T+0:30 | `gpt-5.6-luna` accepts an image and returns strict JSON; Elastic cluster is 9.4+ with Jina inference IDs known | C, D | Use `gpt-5.6-terra`; BM25 only; plain webhook instead of a Workflow |
| G1 | T+1:00 | The forked project builds to the Quest; passthrough shows; a test cube floats | A | Match QuestCameraKit's exact Unity version; rebuild from its sample scene |
| G8 | T+1:30 | Headset reaches our domain on venue Wi-Fi | B | Phone hotspot for headset + laptop, from now on |
| G2 | T+2:00 | A camera JPEG and a WAV recorded on the headset show up on the Director page | C | Copilot runs **without pixels** (selected part and visible parts still come from geometry); verification is cut |
| G3 | T+2:30 | MRUK returns poses for two printed codes. Record: update rate, stationary jitter in mm, which local axis is the normal | A | Touch-point alignment becomes the primary method |
| G7 | T+3:00 | Wired cast shows passthrough + holograms **while** the camera and mic are in use | C, A | Wireless browser cast → scrcpy → open the camera only during a query → hand a judge the headset for the vision beat |
| G4 | T+4:00 | Fixture boxes sit on the real tabletop: corner error ≤ 10 mm before nudge, ≤ 3 mm after | A | Spend more hours here, not elsewhere. Three-point solve |
| G5 | T+4:00 | Press B → event → server version → Elasticsearch document → HUD percentage | A, B | Local-only state; sync later |
| G6 | T+5:00 | Hold A, ask a question → answer audio plays in the headset. Log every stage time | C | Text answers only; WAV download instead of streaming |

### Schedule

| Window | A · Spatial | B · State & Platform | C · Copilot | D · Knowledge & Reconstruction | Exit check |
|---|---|---|---|---|---|
| **T+0 → T+0:45** all hands | Fork QuestCameraKit; asmdefs; C# interfaces | `git init`, pnpm workspace, Zod schemas, fixtures | G0 model check; read the ImageLLM sample | G0 Elastic check; tape-measure the desk | Contracts frozen **P0** |
| **T+0:45 → T+2:30** | G1, then G3. Generate and print QR sheets | Reducer, steps, validator (Codex). Events API, JSONL store. Vultr + Caddy + domain (G8) | G2: `PcaFrameSource`, `MicRecorder`, `POST /debug/frame` | Canonical `desk.plan.json`; stick the QR sheets; start A-1, E-1, BOM | G1 G2 G3 G8 **P0** |
| **T+2:30 → T+5** | `PlanLoader` + `ShapeFactory`; `AlignmentSolver`; G4; first hologram shader | WebSocket; `/assemblies`, `/state`; Director page v0 (heartbeat, new run, received frame) | G7, then G6: STT → model with image → PCM TTS → `PcmStreamPlayer` | Finish documents; indices + mappings; ingest; `retrieve()` BM25 | G4 G5 G6 G7 **P0** |
| **T+5 → T+9:30** | **Sleep.** Anyone whose gate failed fixes it first | | | | |
| **T+9:30 → T+11** | `VisualStateResolver` + `PartView` states; selection ray; mark built | Outbox/idempotency hardening; seeds; Devpost draft text | Context packet; `PartProjector`; box overlay on the Director page | Part linking at ingest; parts + materials indices; events indexing | **Vertical slice at T+11** **P0** |
| **T+11 → T+14** | HUD panel (progress, step, history); anchor save/restore; nudge | **Devpost draft submitted by T+13** (team, badge IDs, all six prizes). Upload intake + hash dedupe | Retrieval in the prompt; strict response; highlights + source card; timeouts | Hybrid + rerank; tune on 10 golden questions | Devpost in. Slice repeatable 3× **P0** |
| **T+14 → T+17** | Timeline scrub + planned future; print-itself replay; proof overlay | Extraction calls + validator loop; job stages | Verification: expected view, crop, verdict, gating UX | Agent Builder tools over MCP + fallbacks; `log_issue` Workflow | **P1** |
| **T+17 → T+20** | Touch-point fallback; `DemoDirector` + operator panel; label card | Review page (three.js viewer, editable table, approve) | Fast-path voice commands; cache promote + offline bundle; "what's left?" | **E7 stages 0–7** (fetch → heights) | **P1** |
| **T+20 → T+24** | Shader and HUD polish; upload-mode surface placement (P1); depth occlusion (P2) | Laptop-fallback server; History page; README, SOURCES | Latency tuning; follow-up context; depth probe (P2); wake word (P3) | **E7 stages 8–11** → video. ES\|QL panel for the Elastic slot | E7 video exists or drops a rung **P1/P2** |
| **T+24 FEATURE FREEZE** | | | | | Only bug fixes after this |
| **T+24 → T+27** | Five full rehearsals with a stopwatch, on the hotspot, with the cast running. Promote cached answers. Record the Devpost demo video. Fix only what breaks the script | | | | Golden path 3× in a row **P0** |
| **T+27 → T+30:30** | **Sleep**, staggered: one person stays up to keep the server and the submission safe | | | | |
| **T+30:30 → T+32** | Final APK on the headset; charge everything | Final Devpost edits before T+32; tag the release | Warm the caches; check API credit | Check the index; load the videos on the laptop | Section 23 all ticked |

**If we are behind at T+14:** cut in this order: wake word, depth probe, depth occlusion, upload-mode placement, E7 interiors, review-page editing (approve only), "what's left?" batch check, verification. Never cut alignment quality, the event log, or the cached-answer fallback.

---

## 19. Risk Register

| # | Risk | Likelihood | Impact | Earliest test | Fallback |
|---|---|---|---|---|---|
| 1 | One headset, two Unity developers; camera features do not run in the simulator | Certain | High | Tonight | Borrow a second Quest; hour-by-hour swap; Editor fixtures for frames, mic and alignment |
| 2 | Unity or SDK version mismatch; slow build-deploy loop | Medium | High | G1 | Use QuestCameraKit's exact versions; incremental builds; one person owns the scene |
| 3 | Camera frames unavailable, or casting conflicts with camera or mic | Medium | High | G2, G7 | Copilot without pixels; camera opened only during a query; judge wears the headset |
| 4 | QR tracking slow, jittery, or fails under venue lighting | Medium | High | G3 | Larger codes; more samples; touch-point alignment as primary |
| 5 | Alignment visibly off (> 1 cm) or drifts | Medium | **Critical** | G4 | Nudge; proof overlay; realign; keep the desk still; three-point solve |
| 6 | Mirrored model from the handedness conversion | Medium | High | T+1, asymmetric fixture | One conversion function; fix the sign once |
| 7 | Venue Wi-Fi isolates devices or needs a portal | High | High | G8 | Phone hotspot; laptop-hosted server |
| 8 | Copilot slower than 6 s | Medium | Medium | G6 | Prefetch design; PCM streaming; shorter answers; narrator talks over the wait; cached answers |
| 9 | Model rejects images or strict JSON; API credit runs out | Low | High | G0 | `gpt-5.6-terra`; text-only context; second API key |
| 10 | Elastic cluster lacks Jina, reranking or Workflows | Medium | Medium | G0 | BM25; direct queries; webhook from our server |
| 11 | Loud hall breaks speech recognition | High (round 2) | Medium | T+24 rehearsal with noise | Hold the controller near the mouth; HUD query buttons; cached answers |
| 12 | No suitable desk, or no printer for the QR sheets | Medium | **Critical** | Tonight | Any panel with four hand-screw legs; QR on a phone screen taped down as an emergency marker |
| 13 | E7 consumes the owner's time | High | Medium | T+20 checkpoint | 8 h box; fallback ladder down to a massing model |
| 14 | Unity scene or prefab merge conflicts | Medium | Medium | T+0 | Prefab-per-feature; only A edits the scene; YAML smart merge |
| 15 | A rules breach (assets made before T+0, committed drawings) | Low | **Critical** | Now | Appendix D; `data/e7/raw` git-ignored; SOURCES.md |
| 16 | Battery or heat during back-to-back judging | Medium | Medium | T+24 | Battery pack on the strap; QR tracking off after lock; app closed between slots |
| 17 | Exhaustion causes late breakage | High | High | n/a | Freeze at T+24; two sleep blocks; nobody merges after T+27 |
| 18 | **First launch in a room the headset has never seen** (every judging room): the saved anchor will not localise, a boundary prompt can appear, the headset slept in the waiting room | **Certain** | **Critical** | T+14, in a different room | QR scan is the default path in a new room (anchor restore is only for crashes); suppress the boundary (`shouldBoundaryVisibilityBeSuppressed` on OVRManager plus the boundaryless manifest flag, which sideloaded builds may use); proximity sensor off in MQDH; rehearse the 60 s room entry |
| 19 | The surface is not level, so the gravity-constrained solve is wrong at the leg tips | Medium | High | T+14, shim test | Third-marker check, then the three-point rigid fit; desk on the floor |

---

## 20. Demo Failure Matrix

| System | Ideal | Fallback A | Fallback B | Emergency |
|---|---|---|---|---|
| **Desk reconstruction** | AI extracts, validator passes, human approves | Human fixes the draft on the review page | Hash hit returns the approved revision | Bundled `desk.plan.json` on the headset |
| **Alignment** | Two QR centres + nudge | Restore the saved anchor | Touch two corners | Ray-place and nudge by eye |
| **Drift mid-demo** | None | Toggle the proof overlay, nudge | Realign (10 s) | Carry on; narrator explains realignment |
| **Build state sync** | Event → server → Elasticsearch | Outbox retries | Headset-only state from its journal | Operator forces the expected state |
| **Plan load** | From the server | From the headset's cache | Bundled plan | n/a |
| **Voice in** | Push-to-talk | Retry closer to the mic | HUD query buttons (`scripted_query_id`) | Narrator triggers the query from the Director page |
| **Copilot answer** | Live, ≤ 5 s | Live without retrieval | Cached answer from the server | Bundled cached answer and audio, fully offline |
| **Voice out** | Streamed PCM | Whole WAV, then play | Text card only | Narrator reads the card |
| **Room audio** | Director page plays the answer | Headset speaker at full volume | Narrator repeats it | n/a |
| **Camera frames** | Frame per query | Camera opened only during the query | Copilot from geometry only | n/a |
| **Verification** | Verdict in 3–6 s | User confirmation only | Switched off in the operator panel | n/a |
| **Casting** | Wired cast with passthrough | Wireless browser cast | scrcpy | Judges take turns in the headset; laptop shows the Director page |
| **Network** | Hotspot to the Vultr domain | Laptop-hosted server on the hotspot | Headset offline mode | n/a |
| **Elasticsearch** | Hybrid + rerank through Agent Builder | Direct queries | BM25 | Answer without citations |
| **E7** | Pipeline-generated model and video | Exterior + slabs only | Hand-traced massing model | Closing line, no video |
| **App crash** | Relaunch: plan, anchor and journal restore in < 30 s | New run from seed + force state | Second APK build on the headset (previous known-good) | Show the recorded demo video |
| **Physical part jams** | Builder installs it | Builder holds it in place | Operator marks a different available part | Skip to the copilot beat |

---

### Demo state machine (`DemoDirector`): how the fallbacks are driven

```
BOOT → CONNECT → LOAD_PLAN → ALIGN → READY → REPLAY_INTRO → OVERLAY → STEP_ACTIVE ⇄ STEP_CONFIRMED
                                        ▲                                   │
                                        │                                   ▼
                                     RESET ◄── COMPLETE ◄── HISTORY ◄── COPILOT (⇄ VERIFY)
```

- The director only **watches** normal app events and offers shortcuts. It calls the same public methods that user input calls.
- **Operator panel** (left menu, hold 1 s): *New run* · *Skip alignment (restore anchor)* · *Force current step built* · *Replay intro* · *Jump to history* · *Verification on/off* · *Offline mode on/off* · *Server: domain / laptop* · *Reload plan*.
- **Director page** mirrors those as buttons and shows the headset heartbeat, current demo state, last event, last turn with timings, and the last received frame with projected boxes.
- **Reset between judges (target 20 s):** Narrator clicks *New run* (new `Assembly` from `demo_start`). Builder unscrews the one leg. Alignment persists because the tabletop has not moved. Operator glances at the proof overlay.
- **Recover after a crash (target < 30 s):** relaunch (8 s) → bundled or cached plan → saved anchor restores (5 s) → events reload from the server or the journal → state matches the moment of the crash.

---

## 21. Testing & Rehearsal Checklist

### Validation matrix (no big test suite; these are the demo-killers)

| # | Test | Pass condition | When |
|---|---|---|---|
| 1 | Reducer fixtures, TypeScript **and** C# | Same events → byte-identical `BuildState` JSON | T+3, then in CI on every push |
| 2 | Asymmetric plan in the web viewer vs the headset | Not mirrored | T+1 |
| 3 | QR alignment, 5 runs from different standing positions | Far-corner error ≤ 5 mm each time; residual shown < 4 mm | G4, T+14, T+24 |
| 4 | Alignment survives app restart and headset sleep | Proof overlay still on the printed markers | T+14 |
| 5 | Hologram stays aligned while walking a full circle | Visible drift ≤ 5 mm | T+14 |
| 6 | Touch-point fallback | ≤ 10 mm before nudge | T+20 |
| 7 | Event replay | `fold(events, N)` on the headset equals `GET …/state?version=N` for every N | T+11 |
| 8 | Event idempotency and offline outbox | Pull the network mid-step; events arrive once, in order, after reconnect | T+14 |
| 9 | Copilot names the selected part | 10/10 on the golden questions with the right `highlight_parts` | T+14, T+24 |
| 10 | Copilot latency on the hotspot | Median first audio ≤ 5 s; none over 9 s without falling back to cache | T+20, T+24 |
| 11 | Retrieval | The expected chunk is in the top 3 for all 10 golden questions | T+14 |
| 12 | Projection | Boxes drawn on the received JPEG sit on the real parts | T+11 |
| 13 | Verification | 5 true "present" and 5 true "absent" cases: no confident wrong verdict | T+20 |
| 14 | Cast + camera + mic together, 10 minutes | No dropout, no permission prompt | G7, T+24 |
| 15 | Demo reset | New run to ready in ≤ 20 s, five times in a row | T+24 |
| 16 | Crash recovery | Kill the app mid-demo; back at the same state in < 30 s | T+24 |
| 17 | Full offline | Hotspot off: overlay, mark built, timeline and cached copilot answers all still work | T+24 |
| 18 | **New-room cold start** | Carry everything into a room the headset has never seen. From walking in to a locked, aligned hologram with the cast running: ≤ 60 s, with no boundary or space-setup prompt | T+14, T+24 |
| 19 | Tilt check | Shim one side of the desk by 5 mm: `m3_residual` fails, the three-point fit takes over, and the ghost leg tips land within 5 mm | T+14 |

### Physical rehearsal checklist

- [ ] Desk parts, stickers on the underside (LF, RF, LR, RR, corner A), QR sheets flat and unscuffed, two spare sets
- [ ] The live leg screws in by hand in under 15 s; threads pre-run once
- [ ] Headset at 100%, battery pack on the strap, controllers with fresh batteries, lens cloth
- [ ] USB-C cable long enough for the wired cast; HDMI and USB-C adapters for the room display
- [ ] Phone hotspot on, headset and laptop joined, hotspot phone on charge
- [ ] Laptop: cast window, Director page, E7 video, upload page with the PDF ready to drag; notifications off; volume up
- [ ] Boundary suppressed in the build and confirmed in a new room; proximity sensor off so the headset stays awake in the waiting room; desk on the floor, floor clear for the Builder
- [ ] Who carries what between rooms; desk reassembly to seed state in under 60 s
- [ ] Stopwatch run: beats land at 0:20, 0:50, 1:10, 1:40, 2:20, 2:52
- [ ] One rehearsal with loud background noise playing
- [ ] Lines agreed for each fallback, so nobody improvises an apology
- [ ] Sponsor variants rehearsed once each (Elastic: search + ES|QL + Workflow on the laptop. OpenAI: one concrete Codex win from the log)

---

## 22. Cut List

Do **not** build these this weekend:

| Cut | Why |
|---|---|
| General building reconstruction from arbitrary drawings | Research-grade; E7 is an honest, overfit, offline pipeline instead |
| Automatic construction scheduling beyond a topological sort | Papers only; the sort is enough for a desk and for E7's rules |
| Continuous real-time vision or part tracking | No on-device model knows our parts; seconds of latency; one frame per question is enough |
| MEP or electrical drawing → 3D | No public code exists; the desk's cable is typed into the plan |
| Reliable wrong-orientation detection | Benchmarks show models miss it; `wrong` is set by the user |
| Wake word on the golden path | No supported Unity binding; misfires in loud rooms |
| Hand tracking, pinch UI | Controllers are faster to build and more reliable; the Builder has the free hands |
| Multi-user or multi-headset sync | One headset; the WebSocket already mirrors state to the web |
| Accounts, roles, production auth | One bearer token |
| Microservices, queues, a database server | One process, files on disk, Elasticsearch as an index |
| Cut list, supplier order, framing rules (old design) | Dropped with the wall demo; `log_issue` covers the "take action" requirement |
| Plan revision diff colouring (green/red/yellow) | P3; only if everything else is done |
| IFC import or export | P3 talking point only |
| On-device bloom and heavy post-processing | Frame rate matters more than glow; the E7 video gets the glow |
| A generalised cleanup editor for floor plans | Inkscape already exists |
| Persisting alignment across different rooms | We realign per room in 10 s |

---

## 23. Definition of Done

The product is demo-ready when every box is ticked on the **release APK**, on the **hotspot**, with the **cast running**.

**Spatial**
- [ ] App launches to a usable state in ≤ 10 s, online or offline
- [ ] QR alignment locks in ≤ 15 s with far-corner error ≤ 5 mm, five times in a row
- [ ] Saved anchor restores after an app restart; touch-point fallback works
- [ ] New-room cold start in ≤ 60 s with no system prompts, in two different rooms
- [ ] The third-marker check passes on the floor and fails on a shimmed desk, where the three-point fit takes over
- [ ] All nine desk parts render from `desk.plan.json` with no per-part code
- [ ] Every visual state in section 8 is reachable and distinguishable on the cast

**State and 4D**
- [ ] Marking a part built updates the hologram in < 100 ms and the server in < 1 s
- [ ] The headset's folded state equals the server's at every version
- [ ] Timeline scrubs to V0 and forward to planned completion, then returns to live
- [ ] Events appear in `cutonce-build-events`; the ES|QL query returns rows
- [ ] New run from seed works from the Director page and from the operator panel

**Copilot**
- [ ] Three scripted questions and two unscripted ones answered correctly with the right parts highlighted and a source card
- [ ] Median first audio ≤ 5 s; the 9 s cap falls back to a cached answer without anyone noticing
- [ ] Every answer's `part_id`s exist in the plan; every citation exists in the index
- [ ] Verification shows a verdict in ≤ 8 s and never changes state without a user action
- [ ] Hotspot off: cached answers still play

**Pipelines**
- [ ] The upload page accepts the desk PDF and either returns the approved plan (hash hit) or produces a draft that passes the validator after review
- [ ] `out/e7_vision.mp4` exists at some rung of the ladder, captioned honestly, with every intermediate artifact kept in `data/e7/stages/`

**Demo operations**
- [ ] Golden path run three times in a row inside 3:00
- [ ] Reset ≤ 20 s; crash recovery < 30 s
- [ ] Every row of the failure matrix has been tried once on purpose
- [ ] Devpost: draft in by T+14 with team, badge IDs, six prizes; final by T+32 with repo link, SOURCES.md, video
- [ ] `CODEX_LOG.md` has at least three concrete entries
- [ ] Physical checklist in section 21 complete; everything charged

---

## Appendix A. Three Levels of Reality

| Feature | Level | Note for the pitch |
|---|---|---|
| Ghost overlay aligned to the real desk | **LIVE** | |
| Part states, progress, current step | **LIVE** | |
| Mark built by button or voice; event log; version history | **LIVE** | |
| Timeline rewind and planned-future playback | **LIVE** | |
| Copilot: speech, camera frame, selected part, retrieval, spoken answer, highlights | **LIVE** | Cached answers are a fallback and are labelled on the Director page |
| Camera verification as a second opinion | **LIVE** | "Suggests; you confirm" |
| Elasticsearch hybrid search, ES\|QL history, `log_issue` Workflow | **LIVE** | Shown in the Elastic slot |
| Desk plan extracted from drawings | **PRECOMPUTED** by our real pipeline, human-approved; the upload beat replays it | Say: "processed and reviewed earlier" |
| E7 model, stages and build sequence | **PRECOMPUTED** offline, overfit, with human cleanup | Caption on the video |
| E7 on the table in the headset (P2) | PRECOMPUTED model, LIVE playback | |
| Whole-building drawings → accurate 3D, automatically | **VISION** | |
| Electrical/MEP drawings → 3D routes | **VISION** | |
| Site-scale tracking across floors; outdoor use; hard-hat hardware | **VISION** | |
| Automatic detection of every placed part | **VISION** | |
| Automatic scheduling for real buildings | **VISION** | |

Nothing on the golden path depends on a VISION item.

---

## Appendix B. After the Hackathon: desk → room → building → site

What has to be right **now** so none of this needs a rewrite later:

| Abstraction | What we fix today | What it enables later |
|---|---|---|
| **Stable IDs** | `part_id` never changes across revisions; `external_ids` reserved | Mapping to IFC GUIDs; links from RFIs, photos, punch lists |
| **Part hierarchy** | Optional `parent_id` | Site → building → level → zone → assembly → part. E7 already uses level-grouped parts |
| **Plan vs Assembly** | Design revisions and physical event logs are separate objects | Many crews building many instances of one design; re-issuing drawings mid-build |
| **Event model** | Append-only; `source`, `confidence`, `actor` on every event | Swap the JSONL file for a real event store; add sensor, drone and scanner sources without a schema change |
| **Coordinate frames** | Every `Plan` declares its frame; alignment is per assembly, stored as an anchor with its method and residual | A site control network: one anchor per zone, each with a known transform to the site frame (surveyed QR points, as industry tools do) |
| **Document references** | `DocRef` down to page, chunk and box | Click from a part to the exact callout on the sheet; re-ingest a new drawing issue and diff the references |
| **Search** | Chunks tagged with `part_ids`; disk is truth and the index is rebuildable | Per-project indices; permissions; multilingual specs |
| **Verification** | A narrow, per-part question with an expected view | Replace the model with scan-vs-BIM or a trained detector behind the same request and verdict |
| **Reconstruction** | Propose → validate → human approve, ending in the same `Plan` | Swap the desk extractor for DXF/IFC import or a commercial drawing-to-BIM service |

We build none of these now. We only avoid choices that would block them.

---

## Appendix C. Architecture Audit

| Question | Answer |
|---|---|
| Can four engineers work in parallel? | Yes. Ownership is by directory and prefab; contracts are fixed in the first 45 minutes; each person has mocks |
| Is there an early end-to-end slice? | Yes. Gates by T+5, the vertical slice at T+11 |
| One canonical representation? | Yes. `Plan` + `BuildEvent`, from `packages/schemas`, enforced by fixtures |
| Does Unity know little backend logic? | Yes, with one deliberate exception: a ~60-line reducer duplicated in C# so the overlay and timeline work offline. A shared fixture keeps the two in step |
| Does the backend know little rendering logic? | Yes. It returns `part_id`s and a highlight style |
| Is every physical component addressable by a stable ID? | Yes. Fasteners are materials by design |
| Can we replay any build state? | Yes. `fold(plan, events, upTo)` on both sides |
| Can the copilot reference exact parts? | Yes. It may use only IDs from the provided table; the server strips anything else |
| Can we bypass AI reconstruction? | Yes. Hash hit, `RECONSTRUCTION=off`, bundled plan |
| Can we bypass camera verification? | Yes. One switch; nothing depends on it |
| Can we recover quickly after a crash? | Yes. Bundled plan, saved anchor, journal: under 30 s |
| More effort on alignment than on vision? | Yes. A spends roughly T+1 to T+5 and again T+11 to T+20 on it; vision is one narrow prompt |
| Is E7 isolated? | Yes. Offline Python, separate owner, separate scene, time-boxed |
| Are LIVE, PRECOMPUTED and VISION separated? | Yes. Appendix A, and the Reality column in section 2 |
| Is every P0 individually testable? | Yes. Each has a gate or a row in section 21 |
| Minimum technology for a complete feel? | Three things carry that: real alignment, a real event log with rewind, and a copilot that points at real parts. Everything else is cut or precomputed |

---

## Appendix D. Tonight, Before T+0 (allowed: installing, planning, gathering data)

- [ ] Install Unity 6000.3.12f1 with Android Build Support on both Unity machines; Meta Quest Developer Hub; `adb`
- [ ] Quest: developer mode on, OS updated (needs v74+ for the camera API), paired with the Unity machines
- [ ] Toolchain check: clone QuestCameraKit and build **its** sample to the headset. This validates the install; it is a public library, not our project. If unsure whether this is fine, ask an organiser
- [ ] Ask the hardware desk for a **second Quest 3 or 3S**
- [ ] Accounts and keys: OpenAI, ElevenLabs, Elastic (cluster from the booth or Slack), Vultr credits, the GoDaddy Registry domain
- [ ] Node 22, pnpm, Python 3.11, poppler, Inkscape, ffmpeg installed
- [ ] **Get the desk**: a flat top with four legs that screw in by hand, light enough for one person to carry, plus a power strip, a cable, clips, and something to act as a crossbar and a cable tray
- [ ] **Find a printer** and matte paper for the QR sheets (generate and print after T+0)
- [ ] Download the public E7 drawings (gathering data is allowed); do not process them yet
- [ ] USB-C cable for the wired cast, battery pack, adapters, tape, ruler, tape measure, stickers
- [ ] Everyone reads sections 1, 4, 14 and their own column of section 16
- [ ] Sleep before midnight if you can
