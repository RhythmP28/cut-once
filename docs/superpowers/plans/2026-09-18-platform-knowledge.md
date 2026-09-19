# Platform & Knowledge (B + D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything the other three depend on (shared schemas, test fixtures, build-history logic, the events API, live updates, the deployed server, the canonical desk plan, search), then finish the rest of Michael's work: the control page, uploads and extraction, the Elastic prize features, and the E7 data.

**Architecture:** One Node 22 + Fastify + TypeScript service on a Vultr VM. Files on disk are the record (plan JSON, event logs in JSONL). Elasticsearch is a rebuildable search index. Shared schemas and pure logic live in two workspace packages that the server, the web app and the fixtures all use. The E7 pipeline is separate, offline Python.

**Tech stack:** pnpm workspaces · TypeScript (strict) · Zod + zod-to-json-schema · Vitest · Fastify with @fastify/multipart, @fastify/websocket, @fastify/static · ulid · pino · @elastic/elasticsearch v9 · @modelcontextprotocol/sdk · OpenAI Node SDK (Responses API) · pdf-parse and poppler (`pdftoppm`) · Vite + React + three.js · Caddy + systemd · Python 3.11 with numpy, shapely, trimesh, matplotlib, pyyaml, jsonschema.

**Spec:** `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` (sections 3, 4, 6, 7, 9, 12, 14, 15), `docs/superpowers/specs/2026-09-18-cut-once-team-plan.md`, `docs/superpowers/specs/2026-09-18-cut-once-setup.md`.

**Why there is no implementation code in this plan.** HTN rules say all project code must be written between 12:00 AM EDT Saturday and 8:00 AM Sunday. This plan was written at 11:19 PM Friday. It specifies files, signatures, behaviours, test cases and commands; the code is written after T+0, with Codex where marked (the Codex work also feeds the OpenAI prize).

## Global Constraints

- Node **22**, pnpm workspaces, TypeScript `strict: true`, ES modules. Internal packages ship TypeScript source (`"exports": "./src/index.ts"`); the API runs under `tsx`, the web app under Vite. No build step for packages.
- Package names: `@cutonce/schemas`, `@cutonce/project-model`, `@cutonce/api`, `@cutonce/web`.
- Units are **metres and degrees**. Model space is **right-handed, +Y up** (glTF convention). Timestamps are ISO 8601 UTC.
- ID patterns: `proj_` `doc_` `sheet_` `chunk_` `plan_` `asm_` `part_` `mat_` `step_` `job_` `issue_` `turn_` `ver_` `ctx_` `anchor_` followed by `[a-z0-9_]+`. Event IDs are `evt_` + a 26-character ULID.
- **Disk is truth.** Elasticsearch indexing is fire-and-forget with retry. `pnpm reindex` rebuilds every index from disk.
- API base path `/v1`. Every route except `GET /health` needs `Authorization: Bearer <API_TOKEN>`; the WebSocket takes `?token=`.
- **Secrets never enter git.** They live in `/etc/cutonce.env` on the VM and `.env.local` on laptops; `.env.example` lists the names only.
- Models: `gpt-5.6-luna` for vision and structured output, `gpt-5.6-terra` if G0 fails. Elastic **9.4+** with Jina inference IDs recorded at G0.
- `data/e7/raw/` and `data/runtime/` are git-ignored. Binary files (PNG, JPG, PDF, GLB, WAV, MP4) go through Git LFS.
- No project code, JSON plan data, drawings or QR sheets before **T+0 = Sat 00:00 EDT**.

## Timeline at a glance

| Slot | Task | Unblocks |
|---|---|---|
| T+0:00–0:15 | 1 Repo skeleton | Everyone can push |
| T+0:15–0:35 | 2 Schemas, **Tier 1 only** (plan, parts, shapes, events, state) | A2's C# classes |
| T+0:35–0:45 | 3 Fixtures + **Tier 1 contract freeze** (Tier 2 by T+3) | A2's replay tests, Rhythm's mocks |
| T+0:45–1:15 | 4 API skeleton + deploy (G8) · 5 Devpost skeleton | Headset can reach the server |
| T+1:15–2:00 | 6a Replay logic only (`fold`, `derive`), with Codex | The events API; A2's C# mirror |
| T+2:00–3:00 | 7 Store + events API · 8 Live updates + presence + redeploy | A2's network client (G5), Rhythm |
| T+3:00–3:45 | 6b Step order and plan checker (V1–V6), with Codex · Tier 2 schemas (jobs, stream messages, search) | Task 9, E7, extraction |
| T+3:45–4:30 | 9 Canonical `desk.plan.json` + seeds | A2's plan loader, A1's markers |
| T+4:30–5:00 | 10 Desk documents + Elastic indices | Search |
| T+5:00–9:30 | Sleep | |
| T+9:30–11:00 | 11 Ingest + search v0 + events indexing | Rhythm's retrieval (T+11) |
| T+11:00–12:15 | 12 Director page v0 | Demo operations |
| T+12:15–13:30 | 13 Upload intake + known-file replay | Upload beat of the demo |
| T+13:30–14:00 | **Devpost prize check** (locks at T+14) | Prize eligibility |
| T+14:00–15:30 | 17 E7 massing model (**moved up:** it is in the 3-minute demo; the Elastic extras are not) | A2's E7 video |
| T+15:30–17:00 | 14 Hybrid search + rerank | Rhythm (T+17), Elastic prize |
| T+17:00–18:30 | 15 Agent Builder tools + MCP + fallbacks | Rhythm's follow-ups, Elastic prize |
| T+18:30–19:30 | 16 `log_issue` Workflow + ES\|QL panel | Elastic prize |
| T+19:30–21:30 | 18 Drawing extraction (thin) | Honest "processed earlier" |
| T+21:30–23:00 | 19 Review page (read-only + approve) | |
| T+23:00–24:00 | 20 Laptop fallback + backup + docs | Demo safety |
| T+24:00–27:00 | 21 Elastic sponsor script, Devpost write-up, rehearsals (narrator) | |
| T+30:30–32:00 | Final Devpost edits, final backup | |

**One change to the team plan:** A1 and A2 measure the desk at T+0:15 using the measuring sheet in Task 9, while Michael writes the schemas. There isn't time for Michael to do both.

---

# Part 1 — The foundation (what the others build on)

### Task 1: Repo skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `.gitattributes`, `.env.example`, `README.md`, `CODEX_LOG.md`, `SOURCES.md`

**Interfaces:**
- Produces: workspace globs `apps/*`, `services/*`, `packages/*`; root scripts `test` (`pnpm -r test`), `dev`, `reindex`, `pm`, `sync:fixtures`; Git LFS and Unity merge rules in place **before A1 pushes the Unity project**.

- [ ] **Step 1: Create the files**
  - `package.json`: `private: true`, `packageManager: pnpm@9`, `engines.node: ">=22"`, the scripts above, and dev dependencies `typescript`, `tsx`, `vitest`, `@types/node`.
  - `tsconfig.base.json`: `strict`, `target: ES2022`, `module` and `moduleResolution: NodeNext`, `resolveJsonModule`, `skipLibCheck`.
  - `.gitignore`: `node_modules/`, `dist/`, `.env*` except `.env.example`, `data/runtime*/`, `data/e7/raw/`, `data/e7/stages/**/*.overlay.png`, `.DS_Store`, and Unity's `apps/quest/{Library,Temp,Obj,Build,Builds,Logs,UserSettings,MemoryCaptures}/`.
  - `.gitattributes`: LFS for `*.png *.jpg *.jpeg *.psd *.pdf *.glb *.gltf *.fbx *.wav *.mp3 *.mp4 *.apk`. Unity YAML (`*.unity *.prefab *.asset *.mat *.anim *.controller *.meta`) as `merge=unityyamlmerge eol=lf`.
  - `.env.example` names: `PORT HOST DATA_DIR API_TOKEN PUBLIC_BASE_URL ES_URL ES_API_KEY KIBANA_URL AGENT_BUILDER_MCP_URL JINA_EMBED_ID JINA_RERANK_ID SEARCH_MODE OPENAI_API_KEY OPENAI_MODEL ELEVENLABS_API_KEY RECONSTRUCTION`.
  - `CODEX_LOG.md` heading, with a row format: time · who · task · prompt summary · what Codex produced · what we changed.
  - `SOURCES.md`: FMI/PlanGrid 2018, QuestCameraKit (MIT), Perkins&Will drawings via ArchDaily, and the desk manufacturer's manual.
- [ ] **Step 2: Verify.** Run `git lfs install && pnpm install && pnpm test`. Expected: install succeeds; test exits 0 ("No projects matched" is fine).
- [ ] **Step 3: Commit and push.** `git commit -m "chore: monorepo skeleton, LFS and Unity merge rules"`. Post the clone URL in the team chat, and tell A1 the Unity project can now go into `apps/quest`.

---

### Task 2: `@cutonce/schemas`

**Two tiers (critique fix).** Twenty minutes cannot produce 25 schemas and 13 tests. **Tier 1, frozen at T+0:45:** `ids`, `geometry`, `plan`, `assembly`, `events`, `state`. That is everything A2 needs and everything the fixtures use, and blueprint section 4 already spells out the fields, so it is transcription, not design. **Tier 2, by T+3:** `jobs`, `ws`, `search`, `documents`, `anchor` (Michael, in the 6b slot) and `copilot`, `verification` (**Rhythm writes these**, because Rhythm owns both ends of those packets).

**Files:**
- Create: `packages/schemas/package.json`, `src/{ids,geometry,documents,plan,assembly,events,state,anchor,copilot,verification,jobs,ws,search,index}.ts`, `scripts/export-jsonschema.ts`
- Test: `packages/schemas/tests/schemas.test.ts`

**Interfaces:**
- Produces: Zod schemas named `<Name>Schema` and inferred types `<Name>` for `Vec3, DocRef, Project, Document, Sheet, Shape, Part, Material, BuildStep, Marker, TouchPoint, Plan, ValidationIssue, Assembly, PartState, BuildEvent, BuildState, SpatialAnchor, CopilotContext, CopilotResponse, VerificationRequest, VerificationResult, Job, JobStage, RetrievedChunk, DirectorCommand, WsMessage`. Field lists are exactly blueprint section 4, plus:
  - `ValidationIssue = { code: "V1".."V8", severity: "error"|"warning", part_ids: string[], message: string }`
  - `Job = { job_id, document_ids, status: "queued"|"running"|"needs_review"|"approved"|"failed", stages: JobStage[], plan_id?, revision?, issues?, created_at }`, where `JobStage = { name, status: "pending"|"running"|"done"|"failed"|"skipped", ms?, artifact_uri? }`
  - `RetrievedChunk = { chunk_id, document_id, sheet_id?, page, title, text, part_ids, score, page_image_uri? }`
  - `DirectorCommand = { type: "new_run", seed } | { type: "force_state", part_id, new_state } | { type: "goto", demo_state } | { type: "set_flag", flag: "verification"|"offline"|"reconstruction", value: boolean } | { type: "promote_cache", turn_id, scripted_query_id }`
  - `WsMessage` (tagged by `type`): `event_appended {assembly_id, event, head}` · `assembly_changed {assembly}` · `plan_ready {plan_id, revision}` · `director_command {command}` · `copilot_turn {turn}` · `issue_logged {issue_id, part_id, note}` · `presence {clients: {kind: "quest"|"web", id, connected_at}[]}`
- `pnpm -F @cutonce/schemas export` writes `dist/jsonschema/{Plan,BuildEvent,BuildState,CopilotContext,CopilotResponse,VerificationRequest,VerificationResult,Job,WsMessage}.json`. Python and humans validate against these.

- [ ] **Step 1: Write the failing tests** (`schemas.test.ts`, one `it` per row)

| Case | Input | Expect |
|---|---|---|
| valid part | box part from blueprint §4 | parses |
| bad part ID | `part_id: "LeftLeg"` | fails on `part_id` |
| negative size | `size: [-0.1, 0.1, 0.1]` | fails |
| unknown shape | `{ type: "sphere" }` | fails |
| cylinder axis | `axis: "w"` | fails |
| polyline | 2+ points and a diameter | parses |
| event, server version | `version: 4` | parses |
| event, provisional | `version: null` | parses |
| event, bad source | `source: "ai"` | fails |
| event ID | `evt_` + 26-char ULID | parses; `evt_123` fails |
| state enum | `new_state: "done"` | fails (only `missing`, `built`, `wrong`) |
| unknown key | Part with `colour: "red"` | the strict form fails; the runtime form parses and drops `colour` |
| WsMessage | `{ type: "event_appended", ... }` | parses, narrows by `type` |

- [ ] **Step 2: Run the tests.** `pnpm -F @cutonce/schemas test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** One file per group, ID patterns from Global Constraints. Export each object schema twice: a **strict** form (fixture tests and the JSON Schema export, so typos in our own files are caught) and the default **strip** form (the API at runtime, which logs any key it drops). A teammate adding a field at 3 PM must not turn every headset event into a 400 that sits in the outbox. `external_ids` is the only open record.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `pnpm -F @cutonce/schemas export` and check that 9 files appear in `dist/jsonschema/` (commit them).
- [ ] **Step 5: Commit.** `git commit -m "feat(schemas): canonical Zod schemas and JSON Schema export"`

---

### Task 3: Fixtures and the contract freeze

**Files:**
- Create in `data/fixtures/`: `plan_asymmetric.json`, `plan_desk_archetype.json`, `events_to_state/{01_empty,02_demo_start,03_build_next,04_out_of_sequence,05_undo,06_no_op,07_verification,08_history_upto}.json`, `context_packet.json`, `copilot_response.json`, `verification_request.json`, `verification_result.json`, `README.md`
- Create: `scripts/sync-fixtures.mjs` (copies `data/fixtures/` and `data/demo/*.plan.json` to `apps/quest/Assets/CutOnce/Core/Tests/Fixtures/` and `apps/quest/Assets/StreamingAssets/`)
- Test: `packages/schemas/tests/fixtures.test.ts`

**Interfaces:**
- Produces: the shared truth for the C# reducer (A2) and the TypeScript reducer (Task 6). Each `events_to_state/*.json` holds `{ plan: "<fixture file name>", events: BuildEvent[], up_to: number|null, expected: BuildState }`.

- [ ] **Step 1: Write the fixtures**
  - `plan_asymmetric.json`: three 0.1 m boxes, at `[0,0,0]`, `[0.3,0,0]` and `[0,0,0.3]`, with IDs `part_origin`, `part_plus_x`, `part_plus_z`. If this shows mirrored in Unity versus the web viewer, the handedness conversion is wrong.
  - `plan_desk_archetype.json`: the nine-part desk from blueprint §4 with its archetype numbers (Task 9 replaces them with measured values).
  - State cases on the archetype plan:

| File | Events | `up_to` | Expected |
|---|---|---|---|
| 01_empty | none | null | 0/9 built, 0%, `current_step_id` step_01, `available` = [part_tabletop] |
| 02_demo_start | seed events: tabletop, LF leg, RF leg built | null | 3/9, 33%, current step_04, `available` includes LR leg, RR leg, tray |
| 03_build_next | 02 + LR leg built (manual) | null | 4/9, 44%, current step_05 |
| 04_out_of_sequence | 02 + power cable built | null | `out_of_sequence` = [{part_power_cable, "hard"}] |
| 05_undo | 03 + LR leg `built → missing` | null | back to 3/9, current step_04 |
| 06_no_op | 02 + tabletop built again | null | identical to 02 (a same-state event is ignored) |
| 07_verification | 03 + verification of LR leg, present, 0.91 | null | LR leg `verified = {present, 0.91}`; progress unchanged |
| 08_history_upto | 03 | 2 | 2/9 (tabletop and LF leg only) |

  - `context_packet.json`, `copilot_response.json`, `verification_request.json`, `verification_result.json`: the examples in blueprint sections 10 and 14.
- [ ] **Step 2: Write the failing test.** `fixtures.test.ts` parses every fixture with its schema (plans with `PlanSchema`, `expected` with `BuildStateSchema`, and so on). Run `pnpm -F @cutonce/schemas test`. Expected: FAIL until the fixtures are valid.
- [ ] **Step 3: Fix any fixture that fails.** Expected: PASS.
- [ ] **Step 4: Commit and announce the freeze** (T+0:45). `git commit -m "feat(fixtures): shared plan, state and packet fixtures"`, then post:

> **Contracts frozen.** Schemas: `packages/schemas` (JSON Schema in `dist/jsonschema`). Fixtures: `data/fixtures` (A2: run `pnpm sync:fixtures` to copy them into Unity). API base `https://<domain>/v1`, bearer token in the pinned message. Live updates: `wss://<domain>/v1/stream?token=…&client=quest`. Endpoint list: blueprint section 14 plus `/v1/stream`, `/v1/director/command`, `/v1/documents/:did/pages/:page.png`. Any change is announced here before it lands.

---

### Task 4: API skeleton, `/health`, and the first deploy (gate G8)

**Files:**
- Create: `services/api/package.json`, `src/{server.ts,config.ts,app.ts,auth.ts,log.ts}`, `src/routes/health.ts`
- Create: `infra/Caddyfile`, `infra/cutonce.service`, `infra/deploy.sh`, `infra/README.md`
- Test: `services/api/tests/health.test.ts`

**Interfaces:**
- Produces:
  - `buildApp(config: Config): Promise<FastifyInstance>`, used by every API test through `app.inject`.
  - `loadConfig(env): Config`, with fields for every name in `.env.example`. Defaults: `PORT=8080`, `HOST=127.0.0.1`, `DATA_DIR=./data/runtime`, `SEARCH_MODE=bm25`, `RECONSTRUCTION=off`.
  - `GET /health` → `{ ok: true, version: <git sha or "dev">, es: "up"|"down"|"unset", openai: "set"|"unset", tts: "set"|"unset" }`.
  - `auth.ts`: an `onRequest` hook that rejects a missing or wrong bearer with 401 `{error:{code:"unauthorized"}}`, skips `/health` and static web files, and accepts `?token=` on `/v1/stream`.

- [ ] **Step 1: Write the failing tests**

| Case | Request | Expect |
|---|---|---|
| health open | `GET /health`, no token | 200, `ok: true` |
| protected | `GET /v1/assemblies/current`, no token | 401, code `unauthorized` |
| wrong token | same, `Bearer nope` | 401 |

- [ ] **Step 2: Run the tests.** `pnpm -F @cutonce/api test`. Expected: FAIL.
- [ ] **Step 3: Implement** `config.ts`, `auth.ts`, `app.ts` (pino logger; plugin registration order: auth, then routes), `server.ts` (listen on `HOST:PORT`). A stub `/v1/assemblies/current` returning 404 is enough for the auth test.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Write the infra files**
  - `Caddyfile`: the site address is the domain; `reverse_proxy 127.0.0.1:8080`. Caddy gets the HTTPS certificate automatically.
  - `cutonce.service`: `User=cutonce`, `WorkingDirectory=/opt/cutonce`, `EnvironmentFile=/etc/cutonce.env`, `ExecStart=/usr/bin/env pnpm -F @cutonce/api start`, `Restart=always`, `DATA_DIR=/var/lib/cutonce`.
  - `deploy.sh`: over SSH, `cd /opt/cutonce && git pull && pnpm install --frozen-lockfile && pnpm -F @cutonce/web build && sudo systemctl restart cutonce`, then a `curl` of `/health`.
- [ ] **Step 6: Deploy.** First time on the VM: clone to `/opt/cutonce`, create `/var/lib/cutonce` and `/etc/cutonce.env`, install the unit, point Caddy at `infra/Caddyfile`, and reload.
- [ ] **Step 7: Check G8.** `curl https://<domain>/health` from the laptop. Then open the same URL in the **Quest's browser**, on venue Wi-Fi and on the hotspot. If venue Wi-Fi fails, tell the team: hotspot from now on.
- [ ] **Step 8: Commit.** `git commit -m "feat(api): skeleton, bearer auth, health; infra for Vultr"`

---

### Task 5: Devpost skeleton (ops, 10 minutes)

- [ ] Create the project on hackthenorth2026.devpost.com. Add Jerry, Henry and Rhythm as teammates.
- [ ] Enter all four **badge IDs**, exactly as printed under each badge's QR code.
- [ ] Select all six prizes: HTN Finalists, Elastic "Find the Signal", OpenAI API Prizes, MLH ElevenLabs, MLH Vultr, MLH GoDaddy Registry.
- [ ] Add a valid phone number and email for Sunday.
- [ ] Add the repo link, a one-line tagline, and "Built with".
- [ ] **Submit.** It can be edited until T+32; prize choices lock at T+14.

---

### Task 6: `@cutonce/project-model` (build-history logic, with Codex)

**Split (critique fix).** Build **6a** first, at T+1:15: `fold`, `derive` and `fold.test.ts`. The events API needs nothing else. Build **6b** at T+3:00, before Task 9 needs the checker: `orderSteps`, `generateSteps`, `validatePlan` V1–V6, `toPartId`, `plannedEvents` and the CLI. V7 and V8 are warnings; write them only if time is left.

**Files:**
- Create: `packages/project-model/src/{fold.ts,derive.ts,steps.ts,validate.ts,geometry.ts,ids.ts,planned.ts,index.ts,cli.ts}`
- Test: `packages/project-model/tests/{fold.test.ts,steps.test.ts,validate.test.ts,ids.test.ts,planned.test.ts}`
- Create: `.github/workflows/test.yml` (runs `pnpm install` and `pnpm test` on every push)

**Interfaces:**
- Consumes: the `@cutonce/schemas` types and `data/fixtures/events_to_state/*`.
- Produces:
  - `fold(plan: Plan, events: BuildEvent[], upTo?: number): BuildState`. Events are sorted by `version`; provisional events (`version: null`) go last, in arrival order. Rules are exactly blueprint section 9.
  - `orderSteps(plan: Plan): BuildStep[]`. A topological sort over `rests_on`. Ties break by layer (structure, then hardware, then electrical), then smaller x centre first, then larger volume first. Returns steps with fresh `index` and `requires`. Throws `CycleError { part_ids }`.
  - `generateSteps(parts: Part[], materials: Material[]): BuildStep[]`. One step per part, IDs `step_01`… in `orderSteps` order. Used by extraction and E7.
  - `validatePlan(plan: Plan): ValidationIssue[]`. Checks V1–V8 exactly as blueprint section 6.
  - `partAabb(part: Part): { min: Vec3; max: Vec3 }` (box, cylinder, polyline; mesh uses an optional `bounds` field, or is skipped).
  - `toPartId(name: string): string`, e.g. "Left rear leg" → `part_left_rear_leg`. Strips punctuation, and adds `_2` on collision when given the set of existing IDs.
  - `plannedEvents(plan: Plan, assemblyId: string, start: string, secondsPerMinute: number): BuildEvent[]`. Synthetic `missing → built` events, one per part, in step order, spaced by `est_minutes`. Used for E7 and the "prints itself" replay.
  - CLI: `pnpm pm fold <plan.json> <events.jsonl> [--up-to N]` prints state; `pnpm pm validate <plan.json>` prints issues and exits 1 on any error.

- [ ] **Step 1: Write the failing tests**
  - `fold.test.ts`: for every file in `data/fixtures/events_to_state/`, `fold(plan, events, up_to)` deep-equals `expected`, ignoring `as_of`.
  - `steps.test.ts`:

| Case | Expect |
|---|---|
| archetype desk | tabletop first; legs before crossbar; tray before strip; cable last |
| tie between the two front legs | the one with the smaller x centre comes first |
| cycle A rests on B, B rests on A | throws `CycleError` naming both |
| `generateSteps` | nine steps, `step_01`–`step_09`, each with one part |

  - `validate.test.ts`: one minimal failing plan per code, each expecting exactly that code:

| Code | Broken plan |
|---|---|
| V1 | a part with size 0.001 m |
| V2 | overall bounds 1.05 m when the plan claims 1.00 m |
| V3 | two legs overlapping by 5 mm |
| V4 | a leg floating 30 mm above the tabletop |
| V5 | `mat_leg_700.quantity` = 3 while 4 parts use it |
| V6 | a leg's step placed before the tabletop's |
| V7 | the left leg 10 mm further out than the right |
| V8 | a `doc_refs` pointing at `doc_missing` |

  - `ids.test.ts`: "Left rear leg" → `part_left_rear_leg`; "Leg (rear, left)" → `part_leg_rear_left`; a collision gives `part_left_rear_leg_2`.
  - `planned.test.ts`: the archetype plan gives 9 events, versions 1–9, in step order, with non-decreasing timestamps.
- [ ] **Step 2: Run the tests.** `pnpm -F @cutonce/project-model test`. Expected: FAIL.
- [ ] **Step 3: Implement with Codex.** Give Codex the test files, `data/fixtures/`, and blueprint sections 6 and 9 as context. Ask for `fold`, `derive` and `steps` first, then `validate`. Review every diff yourself.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run `pnpm pm validate data/fixtures/plan_desk_archetype.json`: no errors.
- [ ] **Step 5: Log Codex.** Add two rows to `CODEX_LOG.md` with the prompt, what it produced, what you changed, and minutes saved.
- [ ] **Step 6: Commit.** `git commit -m "feat(project-model): fold, steps, validate, planned events (+CI)"`. Tell A2: "TS reducer passes all 8 fixtures. Yours must too."

---

### Task 7: Store and events API

**Files:**
- Create: `services/api/src/store/{fs.ts,plans.ts,assemblies.ts,events.ts,seeds.ts,bus.ts}`, `src/boot.ts`
- Create: `services/api/src/routes/{plans.ts,assemblies.ts,events.ts,state.ts}`
- Test: `services/api/tests/{events.test.ts,plans.test.ts,persistence.test.ts}` (each uses a fresh temp `DATA_DIR`)

**Interfaces:**
- Disk layout under `DATA_DIR`:
  - `plans/<plan_id>/rev-<n>.json` and `plans/<plan_id>/approved.json` (`{revision}`)
  - `assemblies/<aid>/assembly.json` and `assemblies/<aid>/events.jsonl`
  - `assemblies/current.json`
  - `documents/`, `jobs/`, `known_hashes.json` (used from Task 13)
- `fs.ts`: `writeJsonAtomic(path, value)` (write a temp file, then rename); `appendLine(path, line)` (append, then fsync).
- `bus.ts`: a typed `EventEmitter` with `on("event_appended" | "assembly_changed" | "plan_ready", listener)`. The WebSocket (Task 8) and the indexer (Task 11) subscribe to it.
- Store:
  - `appendEvent(aid, e): { status: "created" | "replayed"; event: BuildEvent; head: number }`. Throws `NoOpError` when `new_state` equals the current state.
  - `getEvents(aid, after?: number)`
  - `getState(aid, version?)`, which calls `fold` and caches the head state in memory.
  - `createAssembly({ plan_id, revision, seed })`: writes a `source: "seed"` event for each part in the seed, sets `current`, emits `assembly_changed`.
  - `getPlan(id, rev?)` (defaults to the approved revision), `putDraft(plan)`, `approve(id, rev, by)`.
- Seeds: `data/demo/seeds/<seed>.json = { seed, plan_id, built: string[] }`. Two exist: `empty` and `demo_start`.
- `boot.ts`: at start-up, copies any `data/demo/*.plan.json` and the seeds into `DATA_DIR` if they're missing, so a new VM or laptop starts identical.
- Routes: exactly blueprint section 14 for plans, assemblies, events and state, including the 200-on-replay, 409-no-op and 404 behaviour.

- [ ] **Step 1: Write the failing tests**

| Case | Steps | Expect |
|---|---|---|
| seed run | `POST /v1/assemblies {plan_id: archetype, seed: demo_start}` | 201; `GET …/state` → version 3, 33% |
| append | POST LR-leg-built event with `version: null` | 201 `{version: 4, head: 4}` |
| replay | POST the same `event_id` again | 200 `{version: 4}`; still 4 events on disk |
| no-op | POST tabletop built again | 409 `no_op` |
| history | `GET …/state?version=2` | equals `fold(plan, events, 2)` |
| after | `GET …/events?after=2` | events 3 and 4 only |
| current | `GET /v1/assemblies/current` | the latest run |
| approve blocked | `POST /v1/plans/:id/approve` on a draft with a V3 error | 409, with the issues listed |
| persistence | build app, append, close, build a new app on the same `DATA_DIR` | state unchanged |
| bus | append | `event_appended` emitted once with the version |

- [ ] **Step 2: Run the tests.** `pnpm -F @cutonce/api test`. Expected: FAIL.
- [ ] **Step 3: Implement** `fs`, `seeds`, `plans`, `assemblies`, `events`, `bus`, `boot`, then the routes. Assign the version inside a per-assembly async lock. Node is single-threaded, but a file append can interleave.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): file store, assemblies from seeds, idempotent events, state at version"`

---

### Task 8: Live updates, presence, redeploy

**Files:**
- Create: `services/api/src/ws/hub.ts`, `src/routes/stream.ts`
- Test: `services/api/tests/stream.test.ts` (a real listening server on a random port, and the `ws` client)

**Interfaces:**
- Produces: `GET /v1/stream?token=…&client=quest|web&id=<device>`, one global stream. It deliberately replaces the per-assembly stream in blueprint section 14, so a new run needs no reconnect. Messages are `WsMessage`. On connect, the server sends `presence`, then an `assembly_changed` for the current run, so a reconnecting headset resyncs.
- `hub.broadcast(msg: WsMessage)`, `hub.clients(): Presence[]`. The hub subscribes to `bus`.

- [ ] **Step 1: Write the failing tests**

| Case | Expect |
|---|---|
| bad token | socket closes with code 4401 |
| connect | first message `presence` lists this client; second `assembly_changed` |
| append event over REST | every client receives `event_appended` with the version |
| disconnect | the other clients receive `presence` without it |

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** with `@fastify/websocket`; a 20 s ping keeps the hotspot NAT alive.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Redeploy and check by hand.** Run `infra/deploy.sh`. Then `curl -H "Authorization: Bearer $T" https://<domain>/v1/assemblies/current`, and `npx wscat -c "wss://<domain>/v1/stream?token=$T&client=web"`. Post a test event and watch it arrive.
- [ ] **Step 6: Commit and hand off.** `git commit -m "feat(api): global WebSocket stream with presence"`. Post to A2 and Rhythm: "Events API and stream are live at `<domain>`. Headset connects with `client=quest`."

---

### Task 9: Canonical `desk.plan.json` and seeds

**Files:**
- Create: `data/demo/desk.plan.json`, `data/demo/seeds/{empty,demo_start}.json`, `data/demo/measurements.md` (the filled-in sheet, with a photo of each measurement in `data/demo/measure-photos/`)
- Create: `data/fixtures/events_to_state/09_real_desk_demo_start.json`
- Test: `packages/project-model/tests/real-desk.test.ts`

**Measuring sheet (A1 and A2 fill it in at T+0:15; the desk is upside down on the floor):**

| # | Measure | Model field |
|---|---|---|
| 1 | Tabletop width (x), depth (z), thickness | `part_tabletop.shape.size` |
| 2 | Corner A = the far-left underside corner as the Operator stands | origin `[0,0,0]` |
| 3 | For each leg plate: distance of its centre from the left edge (x) and the far edge (z) | leg `position` x and z |
| 4 | Leg diameter or width, and length | leg `shape` |
| 5 | Crossbar: length, section, and its centre's x, y, z | `part_rear_crossbar` |
| 6 | Cable tray: size and where it mounts | `part_cable_tray` |
| 7 | Power strip: size and where it sits | `part_power_strip` |
| 8 | Cable route: 4–6 points from the strip, through the tray, down the right rear leg | `part_power_cable.shape.points` |
| 9 | Each of the **three** QR sheets (m1 and m2 flush with the near edge; m3 on the far edge, clear of the tray): its marker centre's x, z from A1's print layout (20 mm margin), and the printed code size in mm | `markers[]` |
| 10 | Near-left and near-right corners | `touch_points[]` |

- [ ] **Step 1: Write the failing test.** `real-desk.test.ts`: `validatePlan(desk.plan.json)` has no errors, and `fold` on the `demo_start` seed gives 3 of 9 built with step_04 current.
- [ ] **Step 2: Run it.** Expected: FAIL (the file doesn't exist).
- [ ] **Step 3: Write `desk.plan.json`** from the sheet. Use the archetype's IDs, names, aliases, layers, materials, `rests_on`, `attaches_to` and `verify_hint` (blueprint §4), then replace the numbers. Add the `mat_*` rows from the real parts list. Write `demo_start.json` = tabletop and both front legs.
- [ ] **Step 4: Run `pnpm pm validate data/demo/desk.plan.json` and the test.** Fix until PASS. The usual failures are V4 (a leg a few millimetres off the top) and V2 (overall size).
- [ ] **Step 5: Sync and commit.** Run `pnpm sync:fixtures`. `git commit -m "feat(demo): measured canonical desk plan and seeds"`. Tell A2: "desk.plan.json is in StreamingAssets." Tell A1 the marker positions.

---

### Task 10: Desk documents and Elastic indices

**Files:**
- Create: `data/demo/docs/desk-drawings.pdf`, containing sheet A-1 (three views with dimensions) and sheet E-1 (the wiring route)
- Create: `data/demo/docs/desk-bom.csv`, and the manufacturer's manual as `data/demo/docs/desk-manual.pdf`
- Create: `knowledge/mappings/{cutonce-docs,cutonce-parts,cutonce-materials,cutonce-build-events,cutonce-copilot-turns,cutonce-issues}.json`
- Create: `services/api/src/search/client.ts`, `src/cli/elastic-indices.ts` (`pnpm elastic:indices [--recreate]`)

**Document decisions:**
- **A-1 and E-1 are drawn digitally** (draw.io, Figma or Google Slides, exported to PDF) with typed dimensions, about 25 minutes. Why: the upload story depends on the model reading dimensions. Research found that reading typed dimension text lifts reconstruction accuracy sharply, and handwriting adds errors we would then have to explain to judges. The PDF keeps its text layer, so search works without a vision call.
- **The messy data for the Elastic prize comes from elsewhere:** the manufacturer's manual (a real, image-heavy PDF), the supplier-style BOM, and one phone photo of a handwritten site note, `site-note.jpg` (for example "cable clips every 20 cm, keep clear of the leg thread"). The photo has no text layer, so Task 11's vision transcription still earns its place. Fixed ID: `doc_site_note`.
- **`desk-bom.csv`** has columns `line,item,qty,unit,spec,notes`, 8–12 rows, written the way a supplier would ("Leg Ø40 700mm BLK c/w M8 stud", "Hex bolt M6x12 zinc"). Its quantities must match `materials[]` in the plan.
- **Document IDs are fixed:** `doc_desk_drawings`, `doc_desk_bom`, `doc_desk_manual`. **Sheet IDs:** `sheet_a1`, `sheet_e1`.

**Index fields (keyword unless stated):**

| Index | Fields |
|---|---|
| `cutonce-docs` | chunk_id, project_id, document_id, sheet_id, doc_type, page (integer), title (text), text (text), text_semantic (`semantic_text`, `inference_id` = `JINA_EMBED_ID`, filled by `copy_to` from `text` so ingest writes one field; only if G0 confirmed it), part_ids, material_ids, bbox_norm (float), page_image_uri (not indexed) |
| `cutonce-parts` | part_id, plan_id, revision (integer), name (text + keyword), aliases (text), layer, kind, material_id, step_id, dims_text (text), description_semantic (`semantic_text`, optional), rests_on |
| `cutonce-materials` | material_id, name (text), spec (text), unit, quantity (integer), used_by, raw_text (text) |
| `cutonce-build-events` | @timestamp (date), assembly_id, plan_id, version (integer), kind, part_id, previous_state, new_state, source, confidence (float), step_id, actor, seconds_since_prev (float) |
| `cutonce-copilot-turns` | turn_id, @timestamp (date), transcript (text), answer_text (text), selected_part_id, highlight_parts, chunk_ids, timings_ms (object of long), cached (boolean). Rhythm confirms the fields by T+9 |
| `cutonce-issues` | issue_id, @timestamp (date), assembly_id, part_id, note (text), photo_ref, status |

- [ ] **Step 1: Draw, export and write the documents; photograph the site note.** 30 minutes. Commit them through LFS.
- [ ] **Step 2: Write the mappings and `elastic-indices.ts`.** It creates each index if missing, skips existing ones, and with `--recreate` deletes and recreates. It logs whether `semantic_text` was included.
- [ ] **Step 3: Check it.** Run `pnpm elastic:indices`, then `GET _cat/indices/cutonce-*?v` in Kibana Dev Tools. Expected: 6 indices.
- [ ] **Step 4: Commit.** `git commit -m "feat(knowledge): desk documents and index mappings"`

---

### Task 11: Ingest, search v0, events indexing

**Files:**
- Create: `services/api/src/ingest/{pages.ts,transcribe.ts,chunk.ts,link.ts,bom.ts,ingest.ts}`
- Create: `services/api/src/search/{retrieve.ts,indexEvents.ts}`, `src/cli/{reindex.ts,search-eval.ts}`
- Create: `data/demo/golden_questions.json`
- Test: `services/api/tests/{chunk.test.ts,link.test.ts,indexEvents.test.ts}`; `retrieve.int.test.ts` runs only when `ES_URL` is set

**Interfaces:**
- Produces for Rhythm (**frozen at T+11**):
  - `retrieve(q: { query: string; projectId: string; partId?: string; k?: number; docTypes?: string[] }): Promise<RetrievedChunk[]>`
  - v0 behaviour: BM25 `multi_match` on `title^2` and `text`, plus a `should` term on `part_ids = partId` with a boost of 3, filtered by `project_id`. Default `k = 5`. **Never throws:** it returns `[]` and logs if Elastic fails or takes over 800 ms.
- `ingestDocument(documentId): Promise<{ chunks: number; parts_linked: number }>`, and `reindexAll({ events?: boolean })`.
- `pages.ts`: `rasterise(pdfPath, outDir, dpi = 200): Promise<string[]>` using `pdftoppm -png -r 200`, reused by Task 18. Page images are served by Task 13's route.
- `transcribe.ts`: for pages with no text layer, one vision call per page with strict JSON output `{ items: [{ kind: "dimension"|"note"|"callout"|"title_block"|"table", title, text, bbox_norm }] }`. Results are cached in `documents/<did>/pages/p-<n>.transcript.json`, keyed by the page image's SHA-256, so it's never paid for twice.
- `chunk.ts`:
  - Text pages: split on blank lines, merge pieces to 300–900 characters, title = first line or "Page N".
  - Transcribed pages: one chunk per item.
  - **Chunk IDs are deterministic**, `chunk_<doc>_p<page>_<n>`, so the golden-question file stays valid across re-ingests.
- `link.ts`: `linkParts(text, parts): string[]`. A case-insensitive match of each part's name and aliases, on word boundaries. Model-based linking is P2.
- `bom.ts`: one `cutonce-materials` document per CSV row, matched to `mat_*` IDs by name, plus one chunk per row.
- `indexEvents.ts`: subscribes to `bus` `event_appended` and indexes with `_id = event_id` (idempotent). It computes `seconds_since_prev` from the previous event in the same run, keeps an in-memory retry queue (backoff 1, 2, 4… up to 30 s), and never blocks the request.

- [ ] **Step 1: Write the failing tests**

| Test | Case | Expect |
|---|---|---|
| chunk | 3 paragraphs of 200 characters | 1 chunk (merged to ≤ 900) |
| chunk | one 2,000-character paragraph | split into chunks of 900 or fewer, at sentence ends |
| chunk | same input twice | identical chunk IDs |
| link | "screw the rear left leg into the plate" | contains `part_left_rear_leg` through its alias "rear left leg" |
| link | "legendary" | does not match "leg" (word boundaries) |
| indexEvents | append 3 events with ES mocked to fail once | 3 index calls succeed after a retry; `seconds_since_prev` correct |

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** in the order `pages`, `chunk`, `link`, `bom`, `transcribe`, `ingest`, `retrieve`, `indexEvents`, `reindex`.
- [ ] **Step 4: Run the unit tests.** Expected: PASS.
- [ ] **Step 5: Ingest the real documents.** Run `pnpm reindex`. Check the chunk count per document in Kibana Discover, and read the site-note and manual chunks to confirm the transcription is right.
- [ ] **Step 6: Write `golden_questions.json`.** Ten entries of `{ id, question, part_id|null, expected_chunk_ids }`. They cover: where the cable goes (E-1); what goes here at the LR leg (manual page); how many bolts per leg (BOM); crossbar size (A-1); tray orientation; whether this is the right screw (BOM); the tabletop material; where the clips go; the desk's height; which way the legs screw in.
- [ ] **Step 7: Evaluate.** `pnpm search:eval` prints, per question, whether an expected chunk is in the top 3. **Pass: 8 of 10.** Below that, fix aliases and chunking first.
- [ ] **Step 8: Commit and hand off.** `git commit -m "feat(knowledge): ingest, transcription, part linking, BM25 retrieve, event indexing"`. Tell Rhythm: "`retrieve()` is in `services/api/src/search/retrieve.ts`, 8/10 top-3 on the golden set."

---

# Part 2 — The rest of Platform & Knowledge

### Task 12: Director page v0 (the laptop control page)

**Files:**
- Create: `apps/web/` (Vite + React + TypeScript + react-router), `src/{main.tsx,api.ts,ws.ts,auth.ts}`
- Create: `src/director/{DirectorPage.tsx,Presence.tsx,RunPanel.tsx,EventList.tsx,ForceState.tsx,Commands.tsx,CopilotPanel.tsx}`
- Create: `services/api/src/routes/{director.ts,static.ts}`
- Test: `services/api/tests/director.test.ts`

**Interfaces:**
- Consumes: the REST routes (Task 7), `/v1/stream` (Task 8).
- Produces:
  - `POST /v1/director/command` with a `DirectorCommand` body:
    - `new_run` → `createAssembly`, then broadcasts `assembly_changed`
    - `force_state` → appends an event with `source: "system"`, `actor: "director"`
    - `goto` and `set_flag` → broadcast `director_command` only; the headset acts on them
    - `promote_cache` → forwarded to Rhythm's copilot module (a 501 until Rhythm wires it)
  - Static hosting: `apps/web/dist` served at `/` with a single-page-app fallback, so `/director`, `/upload` and `/review/*` all load the app.
  - Web auth: the token is typed in once, kept in `localStorage`, and sent as the bearer and as the stream's `?token=`.
  - `CopilotPanel.tsx` is an empty component that **Rhythm owns and fills** (transcript, answer, stage timings, retrieved sources, projected boxes on the frame, and playing the answer audio aloud for the room).

- [ ] **Step 1: Write the failing tests**

| Case | Expect |
|---|---|
| `new_run` with `demo_start` | 200; `current` is the new run at 3/9; stream clients get `assembly_changed` |
| `force_state` LR leg `built` | event appended with `source: "system"`; state 4/9 |
| `set_flag` verification off | stream clients get `director_command` |
| unknown `type` | 400 |

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement the routes, then the page.** Presence: a green or grey dot per connected client, with last-seen time. Run panel: ID, version, progress bar, current step, a New run button (seed picker). Live event list, newest first. Force-state form: part dropdown from the plan, and a state. Commands: Replay intro, Jump to history, Verification on/off, Offline on/off.
- [ ] **Step 4: Run the tests** (PASS), then check by hand: open `/director` on the laptop, force a state, and watch the event list update and the headset change.
- [ ] **Step 5: Commit and deploy.** `git commit -m "feat(web): director page and director commands"`, then `infra/deploy.sh`.

---

### Task 13: Upload intake, known-file replay, page images

**Files:**
- Create: `services/api/src/routes/{documents.ts,jobs.ts}`, `src/store/{documents.ts,jobs.ts,knownHashes.ts}`
- Create: `apps/web/src/upload/{UploadPage.tsx,StageList.tsx}`
- Create: `data/demo/known_hashes.json` (written in Step 6)
- Test: `services/api/tests/documents.test.ts`

**Interfaces:**
- Produces:
  - `POST /v1/projects/:pid/documents` (multipart `file`, optional `doc_type`, 25 MB limit):
    - SHA-256 known → **200** `{ document_id, known_plan_id, revision, job_id }`, and broadcasts `plan_ready`, so the headset runs the "prints itself" replay.
    - Unknown → **201** `{ document_id, job_id }`. Stores `documents/<did>/original.<ext>` and `meta.json`, then runs ingest (Task 11) asynchronously. Extraction (Task 18) runs only when `RECONSTRUCTION=on`.
  - `GET /v1/jobs/:job_id` → `Job`.
  - `GET /v1/documents/:did/pages/:page.png` serves the rasterised page. The review page and the copilot's source card can both show the real sheet.
  - `known_hashes.json` maps `sha256 → { plan_id, revision, job_id, processed_at, reviewed_by }`. `boot.ts` seeds it from `data/demo/known_hashes.json`.
- Upload page: drag and drop, a progress bar, and the stage list polled once a second. For a known file it shows **"Matches approved revision 3 · processed <time> · reviewed by @mikey"** and the stored stages with their original timings. It never pretends to be processing live.

- [ ] **Step 1: Write the failing tests**

| Case | Expect |
|---|---|
| upload an unknown small PDF | 201 with `job_id`; job goes `queued` → `running` → `needs_review` (ingest stubbed) |
| upload a file listed in `known_hashes` | 200 with `known_plan_id`; `plan_ready` broadcast |
| same unknown file twice | the second returns the first `document_id` (deduplicated by hash) |
| 26 MB file | 413 |
| page PNG | 200 `image/png` after rasterising |

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement the store, then the routes, then the page.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Check by hand.** Drag `desk-drawings.pdf` onto `/upload`. The headset should replay the desk.
- [ ] **Step 6: Record the hash.** After Task 18 has processed `desk-drawings.pdf` once for real, write its hash into `data/demo/known_hashes.json` with that `job_id`, so the "processed earlier" claim is literally true. Until then, list it with `job_id: null` and the label "reviewed by hand".
- [ ] **Step 7: Commit and deploy.** `git commit -m "feat: document upload, hash dedupe, known-plan replay, page images"`

### T+13:30 Devpost prize check (hard deadline T+14)
- [ ] All six prizes still ticked, all four badge IDs present, submission saved. Screenshot it and post it in the team chat.

---

### Task 14: Hybrid search and reranking

**Files:**
- Modify: `services/api/src/search/retrieve.ts`
- Modify: `services/api/src/cli/search-eval.ts` (add `--mode bm25|hybrid` and a side-by-side table)
- Test: `services/api/tests/retrieve.fallback.test.ts`

**Interfaces:**
- `retrieve()` keeps **exactly the same signature**. With `SEARCH_MODE=hybrid` it sends one retriever tree:
  - `text_similarity_reranker` (`inference_id` = `JINA_RERANK_ID`, field `text`, `rank_window_size` 30)
  - wrapping an `rrf` of two `standard` retrievers: the BM25 `multi_match` with its `part_ids` boost, and a `semantic` query on `text_semantic`
  - returning the top `k`
- On any Elastic error or a timeout over 800 ms, it logs and **retries once in BM25 mode**.

- [ ] **Step 1: Write the failing test.** With the Elastic client mocked to throw on the hybrid request, `retrieve()` returns the BM25 result and logs `fallback: "bm25"`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** If G0 found no Jina IDs, stop here: keep BM25, and tell the Elastic judges honestly.
- [ ] **Step 4: Run the test** (PASS). Then `pnpm search:eval --mode hybrid` against `--mode bm25`. Make hybrid the default only if it scores **at least as well**. Paste the table into `knowledge/README.md` for the sponsor demo.
- [ ] **Step 5: Commit and deploy, then tell Rhythm.** `git commit -m "feat(knowledge): hybrid BM25 + Jina semantic with Jina rerank, BM25 fallback"`

---

### Task 15: Agent Builder tools, MCP client, direct fallbacks

**Files:**
- Create: `knowledge/README.md` (exact Kibana API paths, MCP URL, auth header, as confirmed from Elastic's docs)
- Create: `knowledge/agent-builder/tools/{search_documents,find_parts,lookup_material,build_history}.json`
- Create: `services/api/src/cli/elastic-setup.ts` (`pnpm elastic:setup`, idempotent: creates or updates each tool)
- Create: `services/api/src/search/{mcp.ts,fallbacks.ts,tools.ts}`
- Test: `services/api/tests/tools.test.ts`; `tools.int.test.ts` runs only when `KIBANA_URL` is set

**Interfaces:**
- Produces for Rhythm (**frozen at T+17**):
  - `callKnowledgeTool(name: "search_documents"|"find_parts"|"lookup_material"|"build_history"|"log_issue", args: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<{ ok: true; data: unknown; via: "mcp"|"direct" } | { ok: false; error: string }>`
  - `knowledgeToolSpecs: Array<{ type: "function"; name; description; parameters }>`, ready to pass to the OpenAI Responses API as tools.
- `mcp.ts`: an MCP client using the SDK's streamable HTTP transport, with `Authorization: ApiKey <ES_API_KEY>` set on every request (the reason our server is the MCP client). `listTools()` is cached at boot.
- `fallbacks.ts`: the same five names, run directly against Elastic, with the same argument and result shapes.
  - `build_history` runs ES|QL.
  - `log_issue` calls the server's own webhook path (Task 16).
- `tools.ts`: tries MCP with a 2 s timeout (`opts.timeoutMs`), then falls back to direct and reports `via`.

- [ ] **Step 1: Read Elastic's Agent Builder docs** for the tool-creation API. Already verified from Elastic's docs: the MCP endpoint is `{KIBANA_URL}/api/agent_builder/mcp`, the header is `Authorization: ApiKey <key>`, and the key needs the Kibana privilege `feature_agentBuilder.read` or every call returns 403. Write the tool-creation paths and request shapes into `knowledge/README.md`. **Don't guess endpoints.**
- [ ] **Step 2: Write the failing tests**

| Case | Expect |
|---|---|
| MCP mocked to hang | returns in about 2 s with `via: "direct"` and data |
| MCP mocked to error | `via: "direct"` |
| both fail | `{ ok: false, error }`, never a throw |
| `knowledgeToolSpecs` | 5 entries; every `parameters` is valid JSON Schema with `required` listed |

- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement** the tool JSON files, `elastic-setup.ts`, `fallbacks.ts`, `mcp.ts`, then `tools.ts`.
- [ ] **Step 5: Run the tests** (PASS). Then run `pnpm elastic:setup` twice (the second run changes nothing), and check that `listTools()` over MCP returns the four tools.
- [ ] **Step 6: Commit and deploy, then tell Rhythm.** `git commit -m "feat(knowledge): Agent Builder tools over MCP with direct fallbacks"`

---

### Task 16: `log_issue` Workflow, webhook, ES|QL panel

**Files:**
- Create: `knowledge/workflows/log_issue.yaml` (exported from Kibana after building it in the Workflows UI)
- Create: `knowledge/esql/{step_durations,runs_compared,sources_breakdown}.esql`
- Create: `services/api/src/routes/{webhooks.ts,analytics.ts}`
- Create: `apps/web/src/director/ElasticTab.tsx`
- Test: `services/api/tests/{webhooks.test.ts,analytics.test.ts}`

**Interfaces:**
- Workflow `log_issue(part_id, note, photo_ref?)`:
  1. Index a document into `cutonce-issues`.
  2. `POST https://<domain>/v1/webhooks/issue` with the bearer token and `{ issue_id, part_id, note }`.
  - It's exposed as the Agent Builder workflow tool `log_issue` through `elastic:setup`.
- `POST /v1/webhooks/issue`: appends an `annotation` event (`part_id`, `note`) to the current run, and broadcasts `issue_logged`, which the Director page shows as a toast and the headset as a red badge on that part.
- `GET /v1/analytics/:name` runs the matching `.esql` file with `?assembly_id=`, and returns `{ columns, rows }`.
- The ES|QL files:
  - `step_durations`: median seconds per step across runs (blueprint §12 query)
  - `runs_compared`: total time per run
  - `sources_breakdown`: events counted by `source` (manual, voice, camera, system)

- [ ] **Step 1: Write the failing tests**

| Case | Expect |
|---|---|
| webhook with a valid body | 200; an `annotation` event on the current run; `issue_logged` broadcast |
| webhook without the token | 401 |
| `analytics/step_durations` with Elastic mocked | `{ columns, rows }` passed through |
| unknown analytics name | 404 |

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the routes and `ElasticTab`** (three tables and a "Run log_issue test" button).
- [ ] **Step 4: Build the Workflow in Kibana's UI.** Run it once by hand and watch the toast appear on the Director page. Export the YAML into the repo.
- [ ] **Step 5: Run the tests.** Expected: PASS. **Commit and deploy.** `git commit -m "feat(elastic): log_issue workflow, webhook, ES|QL analytics tab"`

---

### Task 17: E7 massing model (90-minute box)

**Files:**
- Create: `tools/e7/{requirements.txt,common.py,e7_overrides.yaml,00_fetch.py,01_scale.py,02_footprints.py,03_heights.py,04_plan.py,05_mesh.py,06_events.py,check.py,README.md}`
- Outputs (committed): geometry-only stage images `data/e7/stages/**/*.geom.png` (our traced lines on a blank background), `data/e7/out/{e7.plan.json,e7.glb,e7.events.json}`
- Outputs (git-ignored, for the video only): `data/e7/stages/**/*.overlay.png`, which contain the architects' drawing pixels. Those are Perkins&Will's copyright: the video shows them briefly with credit, and the public repo never holds them
- Raw input (git-ignored): `data/e7/raw/`

**Interfaces:**
- Consumes: `packages/schemas/dist/jsonschema/Plan.json`, and `pnpm pm validate` (mesh parts are exempt from V3).
- Produces for A2 (**by T+15:30**):
  - `e7.plan.json`, a valid `Plan`. Parts per level N (1–8): `part_e7_l0N_slab` and `part_e7_l0N_envelope`, plus `part_e7_roof`. All have `shape: { type: "mesh", uri: "e7.glb", node: <part_id> }`.
  - `e7.glb`, with **one node per part, named exactly the part ID**.
  - `e7.events.json`, from `plannedEvents` (one event per part in step order).

| Script | Does | Manual input |
|---|---|---|
| `00_fetch.py` | Downloads the ArchDaily level plans and the E7 section to `raw/`; writes `manifest.json` (URL, SHA-256, date) | none |
| `01_scale.py` | Opens each plan; you click the 0 m and 20 m ticks on the scale bar; saves px-per-metre per sheet and an overlay PNG | 2 clicks per sheet |
| `02_footprints.py` | You click E7's outline corners on each level (E5 and the site are ignored); converts to metres in one shared frame; saves an overlay PNG | ~12 clicks per level |
| `03_heights.py` | On the section, you click the building's two ends (matched to the length measured on the plan, for scale), then the ground line, each floor line and the roof top | ~12 clicks |
| `04_plan.py` | Builds the Plan: slab = footprint × 0.3 m; envelope = footprint × storey height; roof = top footprint × roof height; `rests_on` = the level below; writes `provenance.assumptions` (heights estimated from the section; interiors omitted) | none |
| `05_mesh.py` | Extrudes each polygon with shapely and trimesh; one named node per part; exports GLB | none |
| `06_events.py` | Steps (slab N, then envelope N, level by level, roof last) and the planned events | none |
| `check.py` | Validates against the JSON Schema; node names equal part IDs; prints each level's area and footprint bounds for an eyeball check against the site plan | none |

- [ ] **Step 1: Set up.** `pip install -r tools/e7/requirements.txt`, then run `00_fetch.py`.
- [ ] **Step 2: Clicks.** Run `01`, `02`, `03` (about 40 minutes). Every click lands in `e7_overrides.yaml`, so the hand-entered data is visible and re-runnable.
- [ ] **Step 3: Build.** Run `04`, `05`, `06`, then `check.py`. Expected: "schema ok", "nodes match", and 8 levels with plausible areas.
- [ ] **Step 4: Validate.** `pnpm pm validate data/e7/out/e7.plan.json`. Expected: no errors.
- [ ] **Step 5: Commit and hand off.** `git commit -m "feat(e7): massing model from published drawings, with stages and planned events"`. Tell A2 where the files are and the caption: "Generated from Perkins&Will's published E7 drawings. Heights estimated from the section. Interiors simplified."
- **Stretch, only if everything else is done:** `07_walls.py` (automatic wall extraction, blueprint §7 stages 4–6). It is cut by default.

---

### Task 18: Drawing extraction (thin)

**Files:**
- Create: `services/api/src/reconstruction/{prompts.ts,extract.ts,draftToPlan.ts,runJob.ts}`, `src/cli/extract-eval.ts`
- Modify: `packages/schemas/src/plan.ts`, to add `PlanDraftSchema`
- Test: `services/api/tests/{draftToPlan.test.ts,draftSchema.test.ts}`

**Interfaces:**
- `PlanDraft` (what the model returns) = `{ overall_size: { value: Vec3, evidence: Evidence[] }, parts: DraftPart[], materials: DraftMaterial[], assumptions: string[] }`.
  - `DraftPart = { name, aliases, kind, layer, shape, position, rests_on_names, attaches_to: [{ name, relation }], material_name, verify_hint, evidence: Evidence[], assumptions }`
  - `Evidence = { page: number, text: string }`
- `extractPlan(documentIds: string[]): Promise<PlanDraft>`. One strict-JSON call with the page images and text layers, the frame definition (blueprint §4), one worked bookshelf example, and the rule "every number needs evidence, or it goes in assumptions".
- `draftToPlan(draft, { plan_id, project_id, source_document_ids }): { plan: Plan; issues: ValidationIssue[] }`. It assigns IDs with `toPartId`, resolves names to IDs, runs `generateSteps` then `validatePlan`, and stores the result as a draft revision.
- `runJob(jobId)` records stages `rasterise`, `extract`, `validate`, and `needs_review`, each with timings and an artifact.
- **The repair loop and a separate inventory call are cut** (P2).
- **Structured-output gotcha:** OpenAI's strict JSON-schema mode needs every property listed as required and `additionalProperties: false`; optional fields must be nullable instead. `draftSchema.test.ts` checks the converted schema follows that. Check OpenAI's Structured Outputs docs for which keywords are supported, and strip any others.

- [ ] **Step 1: Write the failing tests**

| Test | Case | Expect |
|---|---|---|
| draftToPlan | a draft with "Left rear leg" resting on "Tabletop" | `part_left_rear_leg.rests_on = ["part_tabletop"]` |
| draftToPlan | `rests_on_names: ["Shelf"]`, which doesn't exist | a V4 issue naming the part; no throw |
| draftToPlan | two parts both named "Leg" | `part_leg` and `part_leg_2` |
| draftToPlan | a part with an empty `evidence` | listed in `provenance.assumptions` |
| draftSchema | converted JSON Schema | every object has `additionalProperties: false`, all keys in `required` |

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `prompts`, `extract`, `draftToPlan`, then `runJob`, and wire it into Task 13's upload path behind `RECONSTRUCTION=on`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Evaluate honestly.** `pnpm extract:eval data/demo/docs/desk-drawings.pdf` matches the draft's parts to `desk.plan.json` by name and prints the millimetre error on each dimension. Record the result in `knowledge/README.md` whatever it is. Then do Task 13 Step 6 with this job's ID.
- [ ] **Step 6: Commit and deploy.** `git commit -m "feat(reconstruction): drawing to plan draft with evidence, validation and job stages"`

---

### Task 19: Review page (read-only, with Approve)

**Files:**
- Create: `apps/web/src/review/{ReviewPage.tsx,PagePreview.tsx,PartsTable.tsx,IssuesList.tsx}`, `apps/web/src/three/PlanViewer.tsx`

**Interfaces:**
- `PlanViewer({ plan, highlight?: string[] })` draws boxes, cylinders along an axis, and polylines as tubes, in the right-handed +Y-up frame (three.js uses the same convention, so no conversion). The upload page reuses it.
- The review page, `/review/:planId?rev=`:
  - left: the page images from `/v1/documents/:did/pages/:n.png`
  - centre: `PlanViewer`
  - right: a parts table with sizes and evidence; assumptions in amber; issues in red with the parts they name highlighted
  - **Approve** is disabled while there are errors, and calls `POST /v1/plans/:id/approve`, which broadcasts `plan_ready`
- **Editing is cut** (P2). Fixes go into the JSON and get re-validated.

- [ ] **Step 1: Build `PlanViewer`.** Check it against `plan_asymmetric.json`: `part_plus_x` sits on +X, as it will in Unity after A2's conversion. This is the mirror test from the web side.
- [ ] **Step 2: Build the page.** Load the draft from Task 18's evaluation run and confirm the issues list matches `pnpm pm validate`.
- [ ] **Step 3: Approve a clean revision.** The headset receives `plan_ready`.
- [ ] **Step 4: Commit and deploy.** `git commit -m "feat(web): plan review page with 3D preview and approve"`

---

### Task 20: Laptop fallback server, backups, docs

**Files:**
- Modify: root `package.json` scripts `serve:local`, `sync:from-vm`, `backup`
- Create: `infra/local.md`
- Modify: `README.md`, `SOURCES.md`, `CODEX_LOG.md`

**Interfaces:**
- `pnpm serve:local`: the same server with `HOST=0.0.0.0`, `DATA_DIR=./data/runtime-local`, and the web app built. It prints the laptop's LAN IP and the URL the headset should switch to.
- `pnpm sync:from-vm`: `rsync -az <vm>:/var/lib/cutonce/ ./data/runtime-local/`.
- `pnpm backup`: the same, into `backups/<timestamp>/` (git-ignored).
- **Tell A1 and A2:** Android blocks plain `http://` by default. The headset needs a network security config that allows cleartext traffic to the laptop's LAN IP, or the fallback won't connect. That file is theirs; this is the reminder.

- [ ] **Step 1: Add the scripts.** Test: stop the VM service; run `serve:local` on the hotspot; switch the headset's server in the operator panel; mark a part built and ask one copilot question.
- [ ] **Step 2: Write the README.** What Cut Once is, the architecture diagram (blueprint §3), how to run each piece, and the environment variable names.
- [ ] **Step 3: Check the logs.** `SOURCES.md` covers every data source and licence. `CODEX_LOG.md` has at least three concrete entries.
- [ ] **Step 4: Commit.** `git commit -m "chore: laptop fallback, backups, README and sources"`

---

### Task 21: Elastic sponsor script, Devpost write-up, narrator (ops)

**Elastic 5-minute slot** (rehearse once):

| Time | Show | Where |
|---|---|---|
| 0:00–1:00 | One copilot question in the headset ("Where does this cable go?"), with the source card | Headset cast |
| 1:00–1:45 | The messy inputs: the handwritten site note, the supplier-style BOM, the manual; the transcribed chunks with their `part_ids` | Kibana Discover on `cutonce-docs` |
| 1:45–2:45 | Hybrid + rerank on the same question, and the BM25-vs-hybrid table from the evaluation | Dev Tools and `knowledge/README.md` |
| 2:45–3:30 | The Agent Builder tools list, and one `build_history` ES\|QL call | Kibana |
| 3:30–4:30 | "Log an issue on the left rear leg": the Workflow runs, and the toast plus the red badge appear | Director page and headset |
| 4:30–5:00 | The ES\|QL tab: seconds per step across today's runs | Director page |

**Devpost write-up (T+24–27):**
- **Sections:** inspiration, what it does, how we built it, challenges, accomplishments, what we learned, what's next.
- **Built with:** Unity, Meta XR SDK, Node, Fastify, Elasticsearch, OpenAI, Codex, ElevenLabs, Vultr, GoDaddy Registry.
- **Links and video:** the demo video from A2, the repo link.
- **Codex:** a paragraph for the OpenAI prize, from `CODEX_LOG.md`.
- **Honesty:** say which features are live, which are precomputed and which are vision, using blueprint Appendix A.

**Narrator:** learn the 3-minute script (blueprint §2) and the agreed line for each fallback (blueprint §20).

---

# Part 3 — Gaps that were not planned anywhere before (now covered)

| Gap | Where it's handled now |
|---|---|
| Nobody had defined how the desk gets measured, or into which fields | Task 9 measuring sheet (A1 and A2 measure, Michael enters) |
| How the desk drawings, wiring sheet and parts list get made | Task 10: drawn digitally with typed dimensions; a supplier-style CSV; a handwritten site note as the messy input |
| Image-only pages (the site note, parts of the manual) have no text for search | Task 11: vision transcription per page, cached |
| Chunk IDs changing on re-ingest would break the golden questions | Task 11: deterministic chunk IDs |
| The WebSocket was per-assembly, so a new run meant reconnecting | Task 8: one global `/v1/stream`, with a resync on connect |
| No way to see whether the headset is connected | Task 8 presence, Task 12 dot |
| The Workflow needs somewhere to send its result | Task 16: `/v1/webhooks/issue` → an annotation event and a toast |
| The `cutonce-issues` index was missing | Task 10 mappings |
| The source card had no page image to show | Task 13: `/v1/documents/:did/pages/:page.png` |
| "Processed earlier" had to be literally true | Tasks 13 and 18: record the real job ID for the desk PDF's hash |
| The laptop fallback had no copy of the data, and Android blocks plain HTTP | Task 20: `sync:from-vm`, and a note to A1 and A2 on cleartext |
| No backups during judging | Task 20: `pnpm backup`, run before each judging slot |
| Server and C# replay logic could silently disagree | Task 3 shared fixtures, Task 6 CI |
| A new VM or laptop starting empty | Task 7 `boot.ts` seeds the plans, seeds and known hashes |
| The Elastic 5-minute slot had no script | Task 21 |
| Agent Builder and Workflow API details are unverified | Tasks 15 and 16 read the docs first and record the paths; no guessing |

## Cut order if behind (Michael)

1. Review-page editing (already cut to read-only)
2. The extraction repair loop and the separate inventory call (already cut)
3. `find_parts` and `lookup_material` tools (keep `search_documents`, `build_history`, `log_issue`)
4. Model-based part linking (keep alias matching)
5. E7 overlay PNG polish
6. Task 19 review page entirely (approve through `curl`)
7. Task 18 extraction entirely. The desk PDF then stays "reviewed by hand" in `known_hashes.json`, and the narrator says so.

**Never cut:** Tasks 1–11, the Devpost check at T+13:30, Task 13's known-file replay, Task 14's BM25 fallback, and Task 20's laptop fallback.

## Self-review against the spec

- Blueprint §4 schemas → Task 2. §6 validator and deterministic bypass → Tasks 6, 9, 13, 18. §7 E7 → Task 17 (massing rung; walls as stretch). §9 reducer, append protocol and replay → Tasks 6–8. §12 indices, retrieval, tools, Workflow, ES\|QL, persistence → Tasks 10, 11, 14, 15, 16, 20. §14 endpoints → Tasks 4, 7, 8, 12, 13, 16 (the stream path changed deliberately; stated in Task 8). §15 repo layout → Task 1 onward. The Devpost deadline → Tasks 5 and the T+13:30 check.
- Endpoints owned by Rhythm (`/copilot/query`, `/verify`, `/audio`) aren't in this plan; they plug into the same app through `routes/`.
- Names used across tasks: `fold`, `orderSteps`, `generateSteps`, `validatePlan`, `plannedEvents`, `toPartId`, `retrieve`, `callKnowledgeTool`, `knowledgeToolSpecs`, `ingestDocument`, `rasterise`, `extractPlan`, `draftToPlan`, `runJob`, `appendEvent`, `createAssembly`, `buildApp`, `loadConfig`. Each is defined once, in the task that produces it.
