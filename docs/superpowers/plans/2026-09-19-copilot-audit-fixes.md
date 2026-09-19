# Copilot Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 17 problems the audit of Rhythm's copilot branch (`rhythm/main` @ `7b28b04`) confirmed, so the copilot builds, answers every question in front of judges, and never changes the build on its own.

**Architecture:** Server fixes are small edits inside `services/api/src/copilot/` plus one optional `model` on the shared `jsonCall`. Headset fixes keep `CutOnce.Copilot` free of Meta types: the two Meta-touching scripts move to `Assets/CutOnce/Device/` (no asmdef, so Unity's default assembly compiles them exactly as QuestCameraKit compiles its own scripts). Each fix is proved by a test that fails first; the audit probes are re-run at the end as independent acceptance.

**Tech Stack:** Node 22, pnpm 9.15.9, Fastify, vitest, OpenAI SDK v7; Unity 6000.3.12f1 (team) with Meta XR SDK and MRUK 205.0.0; Unity 6000.6.2f1 on Michael's Mac for headless EditMode checks.

**Spec:** the audit findings (conversation of 2026-09-19) and `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` (§5 projection, §550 undo, §587 spoken commands).

## Global Constraints

- Work on branch `fix/copilot-audit`, cut from `rhythm/main` so Rhythm's three commits keep their authorship. Never push to Rhythm's fork.
- `pnpm -r typecheck` and `pnpm -r test` stay green after every task. Tests use stand-in servers only: no real keys, no real API calls.
- `packages/schemas` does not change: the context, response and event shapes are a frozen contract with the headset.
- `CutOnce.Copilot` and `CutOnce.AR` reference no Meta assembly. Anything that touches `OVRInput` or `Meta.XR.PassthroughCameraAccess` lives in `apps/quest/Assets/CutOnce/Device/`.
- Meta API used, from MRUK 205.0.0 `PassthroughCameraAccess.cs` (namespace `Meta.XR`): `IsPlaying`, `CurrentResolution`, `Intrinsics {FocalLength, PrincipalPoint, SensorResolution}`, `GetColors()`, `GetCameraPose()`, `Vector2 WorldToViewportPoint(Vector3, Pose?)` (origin bottom-left).
- Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions (what, which alternative lost, why)

| # | Problem | Fix | Alternatives and why they lost | Proof |
|---|---|---|---|---|
| 1 | Headset won't compile | Define `ProjectedPart` + `PartProjector.Project` in `CutOnce.Copilot`; frames carry their own `WorldToViewport`; push-to-talk behind `IPushToTalk`; Meta scripts move to `Device/` | Add `Oculus.VR`/MRUK names to the asmdef: assembly names unverified, and the copilot assembly could no longer be tested without Meta's packages. QuestCameraKit has **no** asmdefs, so the default assembly is the proven route | Unity EditMode run: compile errors before, 0 after |
| 2 | `pnpm g0` always fails | Use the loaded `cfg`; `jsonCall` takes an optional `model`; skipped ≠ failed | Delete g0 in favour of `llm:smoke`: g0 also checks STT and TTS, and Rhythm's docs point at it | CLI against stand-in OpenAI: `PASS G0`, the stand-in sees the copilot's model with 1 image |
| 3 | Boxes misplaced | `PcaFrameSource` on `PassthroughCameraAccess`: pose from `GetCameraPose()`, projection through Meta's `WorldToViewportPoint` with that pose, intrinsics converted from sensor to image pixels | Keep WebCamTexture + a hand offset: the README already expects a "constant offset" fix, but the error is not constant (lens offset and crop differ per resolution) | C# test: our pinhole equals Meta's formula; Python check; on-device `/debug` overlay |
| 4 | No frame → 400, 0-byte image to model | Headset sends `"camera": null` and no frame part; server treats a missing or empty frame as "no images" and tells the model | Loosen the shared schema to accept width 0: breaks the frozen contract to hide a client bug | Pipeline tests with no frame / empty frame / HUD button; wire test sees 0 images |
| 5 | Answers change the build | Apply a model-proposed `mark_state` only for a non-question, `needs_clarification` false, confidence ≥ 0.8; log the model's confidence and the words | Drop model actions entirely: loses "the left leg is on" style commands the fast path cannot parse. 0.8 is the bar `verify.ts` already uses | Pipeline tests for question / unsure / sure |
| 6 | Verification ignores the backup model | `verify.ts` passes `model: m.chat` to `jsonCall` (same change as #2) | A second setting just for verification: two knobs for one "which model sees images" question | Wire test: verification call uses `OPENAI_COPILOT_MODEL` |
| 7 | Press-time state unused | Capture frame + `Selection` on press, pass them explicitly, clear after use; HUD button captures its own | Keep reading host at send time: breaks the file's own rule 1 | EditMode tests on `BuildContextJson` |
| 8 | Empty/failed transcription → 503 | Spoken "I didn't catch that / couldn't hear that" (200, `needs_clarification`); a missing key stays a 503 | Keep 503 (Rhythm's choice): a judge sees an error instead of a reply | Pipeline tests (Rhythm's 503 test is rewritten) |
| 9 | Tool calls sequential | `Promise.all` over the model's tool calls | Lower the per-tool timeout: hides slow MCP, still sums | Wire test with a stuck MCP: gap < 3.5 s (was 6.1 s) |
| 10 | Undo twice redoes | Undo skips undo events and events already undone, only reverses a person's changes (`voice`, `manual`), notes `undo of evt_…` (§550); nothing left → "There's nothing to undo." | Full undo stack in memory: lost on restart, the log already has it | Unit + pipeline tests |
| 11 | Speech never freed | Drop a job `COPILOT_AUDIO_RETAIN_MS` (60 s) after it finishes; the route already falls back to the saved file | LRU by count: needs a size guess; time matches how audio is used (played once, now) | Test: stream gone after retention, file still served |
| 12 | Cache name path traversal | `promote()` accepts only `^[a-z0-9_]{1,64}$` → 400 | Schema regex on `scripted_query_id`: contract change for a server-side sink bug | Test: 400 and no file outside the data folder |
| 13 | Fixture photo not in LFS | `.gitattributes`: `data/fixtures/** -filter -diff -merge binary` | Put it in LFS: CI's test job checks out without LFS and Rhythm's tests read this JPEG, so CI would get a 130-byte pointer; `lfs: true` would also spend LFS bandwidth on every run | `git status` clean; attr `unset`; other JPGs still LFS |
| 14 | Cached replay reports an action | `DemoCache.lookup` returns `action: null` | Re-apply the recorded action: state has moved on since rehearsal, a stale write is worse than none | Pipeline test |
| 15 | "done" on unknown part → 503 | Fast path answers "That part isn't in this plan…" with no action | Let the store error through: a judge hears nothing | Unit + pipeline tests |
| 16 | Headset silent on failure | `OnFailed` shows a short answer card through `ShowAnswer` | New `ShowError` on `ICopilotHost`: changes A2's interface for one message | Compile (EditMode run); on-device check |
| 17 | No wire-level test | `tests/copilot-wire.test.ts`: stand-in OpenAI + stuck MCP, drives the real `transcribe()`, `ask()`, verification and `pnpm g0` | Mock the OpenAI SDK: would not catch request-shape or base-URL mistakes | The file itself |

## File Structure

- `services/api/src/llm.ts` — `JsonCall.model?`.
- `services/api/src/cli/g0-check.ts` — real cfg, copilot model, SKIP ≠ FAIL.
- `services/api/src/copilot/{verify,answer,pipeline,fastpath,cache,tts,models,routes}.ts` — the server fixes.
- `services/api/tests/copilot-wire.test.ts` (new), `copilot-speech.test.ts` (new), `copilot-pipeline.test.ts`, `copilot.test.ts`.
- `apps/quest/Assets/CutOnce/Copilot/{Interfaces.cs, Projection/PartProjector.cs, Net/CopilotClient.cs, CopilotController.cs, Capture/FixtureFrameSource.cs, README.md}`.
- `apps/quest/Assets/CutOnce/Device/{PcaFrameSource.cs, QuestPushToTalk.cs}` (new folder, default assembly).
- `apps/quest/Assets/CutOnce/Copilot/Tests/{PartProjectorTests.cs, CameraIntrinsicsTests.cs, CopilotClientTests.cs}`.
- `tools/quest-check/run-editmode.sh` (new) — headless Unity EditMode run in a throwaway project.
- `tools/quest-math/validate.py` — Meta intrinsics conversion check.
- `.gitattributes`, `docs/copilot.md`.

---

### Task 1: Fixture photo out of LFS

**Files:** Modify `.gitattributes`.

- [ ] **Step 1: See the problem.** `git status --short data/fixtures` → ` M data/fixtures/frame_0001.jpg`.
- [ ] **Step 2: Append the exception.**

```
# Test fixtures stay in plain git: every checkout, CI's test job included, must have the real bytes
data/fixtures/** -filter -diff -merge binary
```

- [ ] **Step 3: Verify.** `git status --short data/fixtures` → empty. `git check-attr filter -- data/fixtures/frame_0001.jpg` → `unset`. `git check-attr filter -- data/e7/x.jpg` → `lfs`.
- [ ] **Step 4: Commit.** `git commit -am "fix(repo): test fixtures stay in plain git so every checkout and CI get the real JPEG"`

### Task 2: Wire-level tests against a stand-in OpenAI

**Files:** Create `services/api/tests/copilot-wire.test.ts`.

**Interfaces:** Produces the helpers `question(t, opts?)`, `multipart(parts)`, `g0(env)`, the `seen` log and `stand.toolRound`, used by Tasks 3–5.

- [ ] **Step 1: Write the file** (stand-in OpenAI answering `/audio/transcriptions` and `/chat/completions`; a TCP server that accepts and never answers, standing in for a hung Kibana MCP; two characterization tests: one question → transcription + one chat call with 2 images, 5 tools, schema `copilot_answer`; with a tool round → second call has 0 tools and 3 tool results).
- [ ] **Step 2: Run.** `pnpm -F @cutonce/api exec vitest run tests/copilot-wire.test.ts` → 2 PASS (characterization of current behaviour).
- [ ] **Step 3: Commit.** `git commit -m "test(copilot): drive the real transcribe() and ask() over HTTP against a stand-in OpenAI"`

### Task 3: One model setting for every image call; `pnpm g0` works

**Files:** Modify `services/api/src/llm.ts`, `services/api/src/copilot/verify.ts`, `services/api/src/cli/g0-check.ts`; Test `copilot-wire.test.ts`.

**Interfaces:** Produces `JsonCall.model?: string` (`jsonCall` sends `call.model ?? cfg.openaiModel`).

- [ ] **Step 1: Failing tests** in `copilot-wire.test.ts`: verification with `OPENAI_COPILOT_MODEL=vision-backup` → result `model` and the stand-in's verification call both `vision-backup`; `pnpm g0` with key → exit 0, `PASS  G0`, `SKIP  TTS`, stand-in saw `g0` with model `vision-backup` and 1 image; `pnpm g0` with no keys → exit 0 and 3 `SKIP` lines.
- [ ] **Step 2: Run** → the three fail (verification model `gpt-5.6-luna`; G0 "OPENAI_API_KEY is not set"; exit 1).
- [ ] **Step 3: Implement.** `llm.ts`: add `model?: string` to `JsonCall`, send `model: call.model ?? cfg.openaiModel`. `verify.ts`: pass `model: m.chat`. `g0-check.ts`: `jsonCall(cfg, { model: m.chat, … })`; results carry `skipped`; print `SKIP`/`PASS`/`FAIL`; exit 1 only when a check that ran failed; the G0 hint names the model it tested.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): OPENAI_COPILOT_MODEL reaches verification and g0; g0 uses the loaded config and treats skipped checks as skipped`

### Task 4: Tool calls run together

**Files:** Modify `services/api/src/copilot/answer.ts:38-48`; Test `copilot-wire.test.ts`.

- [ ] **Step 1: Failing test:** tool round with `mcpUrl` = the stuck server → `timings_ms.tool_calls === 3` and the gap between the two chat calls < 3500 ms. **Step 2: Run** → FAIL (~6100 ms).
- [ ] **Step 3: Implement:** keep only function calls (`flatMap`), `Promise.all` the `callKnowledgeTool` calls, push tool messages in call order.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `perf(copilot): run the model's tool calls together, so stuck MCP costs one timeout, not three`

### Task 5: Questions without a camera frame

**Files:** Modify `copilot/routes.ts`, `copilot/pipeline.ts`, `copilot/answer.ts`; Test `copilot-pipeline.test.ts`, `copilot-wire.test.ts`.

**Interfaces:** `QueryInput.frame: Buffer | null`; `AskInput.frames: { annotated: Buffer | null; raw: Buffer | null }`.

- [ ] **Step 1: Failing tests:** no frame part + `camera: null` → 200 and `ask` got `frames {annotated: null, raw: null}`; zero-byte frame → same; HUD scripted id with no frame → cached answer; wire: no frame → the chat call has 0 images. **Step 2: Run** → FAIL (400 "multipart file `frame` is required").
- [ ] **Step 3: Implement:** route reads `parsed.files.frame` only when it has bytes; pipeline annotates only with a frame; `ask` adds images only when present and appends "NO CAMERA FRAME this turn…" to the text.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): a question with no camera frame is answered from the tables and documents, and the HUD cache still works`

### Task 6: Transcription problems are answered, not 503

**Files:** Modify `copilot/pipeline.ts`; Test `copilot-pipeline.test.ts` (Rhythm's "503s … when transcription itself fails" is rewritten).

- [ ] **Step 1: Failing tests:** rejected transcription → 200, `needs_clarification`, "I couldn't hear that. Hold A and ask again.", audio URL, model not called; empty transcript → "I didn't catch that. Hold A and ask again."; missing key → still 503 mentioning `OPENAI_API_KEY`. **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:** key check before STT (after the scripted-cache path, so the HUD works without a key); try/catch around `transcribe`; `unheard()` builds, speaks and records the reply.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): a failed or empty transcription gets a spoken "ask again", not a 503`

### Task 7: Only commands change the build

**Files:** Modify `copilot/fastpath.ts` (`isQuestion`), `copilot/pipeline.ts` (`applyAction(…, how)`, gate), `copilot/cache.ts` (`action: null` on replay); Test `copilot-pipeline.test.ts`.

**Interfaces:** `isQuestion(s: string): boolean`; `applyAction(deps, assemblyId, action, actor, how: { confidence: number; note: string })`.

- [ ] **Step 1: Failing tests:** question + confident action → no event, `action: null`; unsure statement → no event; sure statement "the left rear leg is on" (0.9) → event with confidence 0.9 and note `model, from: "the left rear leg is on"`; cached replay → `action: null`. **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the gate (`MODEL_ACTION_MIN = 0.8`), the `how` argument (fast path passes `{ confidence: 1, note: "spoken command" }`), and `action: null` in `DemoCache.lookup`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): only commands change the build; the log records the model's own confidence; cached replays carry no action`

### Task 8: Fast path — undo steps back, unknown part answered

**Files:** Modify `copilot/fastpath.ts`, `copilot/pipeline.ts`; Test `copilot.test.ts`, `copilot-pipeline.test.ts`.

**Interfaces:** `FastPath { action: CopilotAction | null; answer_text; highlight_parts; note?: string }`.

- [ ] **Step 1: Failing tests:** undo notes `undo of <evt>`; [mark A, mark B, undo B] + "undo" → reverses A; [mark, undo] + "undo" → `{ action: null, answer_text: "There's nothing to undo." }`; seed events are never undone; "done" on `part_from_another_revision` → "isn't in this plan", no action; pipeline: mark, undo, undo → leg stays `missing`; "done" on unknown part → 200. **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as in the Decisions table; pipeline applies `fast.action` only when present, with `note: fast.note ?? "spoken command"`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): undo steps back through a person's changes and says when there is nothing left; "done" on an unknown part answers`

### Task 9: Speech audio leaves memory

**Files:** Modify `copilot/models.ts` (`budgets.retainAudio`, env `COPILOT_AUDIO_RETAIN_MS`, default 60000), `copilot/tts.ts`, `.env.example`; Create `tests/copilot-speech.test.ts`.

- [ ] **Step 1: Failing test** (ElevenLabs stubbed to one second of PCM, retention 100 ms): right after `/debug/say` the live stream exists; 300 ms later `hooks.audioStream(id)` is null and `GET /v1/audio/:id` returns the 44 100 bytes from the saved file. **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `forget(turnId, job)` (timer, `unref`, deletes only the same job) called when a job finishes and in `adopt()`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): finished answer audio leaves memory after a minute and is served from the saved file`

### Task 10: Cache names cannot climb out of the cache folder

**Files:** Modify `copilot/cache.ts`; Test `copilot-pipeline.test.ts`.

- [ ] **Step 1: Failing test:** promote with `../../cutonce_escape` → 400 and no `cutonce_escape.json` beside the data folder. **Step 2: Run** → FAIL (200, file written).
- [ ] **Step 3: Implement** `SAFE_ID = /^[a-z0-9_]{1,64}$/` check at the top of `promote()`, `badRequest` otherwise. **Step 4: Run** → PASS. **Step 5: Commit** `fix(copilot): promote_cache only accepts plain scripted ids`

### Task 11: Headset compiles

**Files:** Create `tools/quest-check/run-editmode.sh`, `apps/quest/Assets/CutOnce/Device/QuestPushToTalk.cs`, `Copilot/Tests/CameraIntrinsicsTests.cs`; Modify `Copilot/Interfaces.cs`, `Copilot/Projection/PartProjector.cs`, `Copilot/CopilotController.cs`, `Copilot/Net/CopilotClient.cs`, `Copilot/Capture/FixtureFrameSource.cs`, `Copilot/Tests/PartProjectorTests.cs`, `Copilot/README.md`; Move `Copilot/Capture/PcaFrameSource.cs` → `Device/PcaFrameSource.cs`.

**Interfaces (produced):** `struct ProjectedPart { PartId, State, X, Y, W, H, InFrame, DistanceM }`; `PartProjector.Project(IReadOnlyList<IProjectablePart>, CameraFrame) : List<ProjectedPart>`; `CameraFrame(..., Func<Vector3, Vector3> worldToViewport)` with field `WorldToViewport`; `CameraIntrinsics.Pinhole(Vector3 world, Vector3 camPos, Quaternion camRot) : Vector3` (viewport, bottom-left, z = depth); `interface IPushToTalk { bool Down; bool Up; }`.

- [ ] **Step 1: Write the runner** and run it on the current code → compile errors `CS0234` (Projection), `CS0246` (ProjectedPart, OVRInput) — the audit finding, now proven in Unity.
- [ ] **Step 2: Failing tests:** `Project` keeps only in-frame parts with pixel boxes and near-face distance; `Pinhole` maps straight ahead to (0.5, 0.5) and up to up.
- [ ] **Step 3: Implement** the interfaces above; remove the two `using CutOnce.Copilot.Projection;`; controller reads `IPushToTalk`; move `PcaFrameSource` to `Device/` (namespace `CutOnce.Device`); add `QuestPushToTalk`; fixture frames project with `Pinhole`.
- [ ] **Step 4: Run the runner** → 0 compile errors, all EditMode tests pass. **Step 5: Commit** `fix(quest): the copilot compiles: projector output type and Project(), push-to-talk and camera behind interfaces, Meta code in Device/`

### Task 12: Boxes use the colour camera's own pose and Meta's projection

**Files:** Modify `Copilot/Interfaces.cs` (`CameraIntrinsics.FromMeta`), `Device/PcaFrameSource.cs`, `tools/quest-math/validate.py`; Create test in `Copilot/Tests/CameraIntrinsicsTests.cs`.

- [ ] **Step 1: Failing test:** for three points, `FromMeta(...).Pinhole` equals Meta's `WorldToViewportPoint` formula (copied from MRUK 205 into the test) within 1e-4, sensor 1280×1280 → image 1280×960. **Step 2: Run** → FAIL (no `FromMeta`).
- [ ] **Step 3: Implement** `FromMeta` (centred crop, sensor → image pixels, bottom-left → top-left) and rewrite `PcaFrameSource` on `PassthroughCameraAccess`. Add the same check to `validate.py`.
- [ ] **Step 4: Run** runner + `python3 tools/quest-math/validate.py` → PASS. **Step 5: Commit** `fix(quest): frames from PassthroughCameraAccess: the colour camera's pose at the image timestamp, Meta's projection, intrinsics in image pixels`
- [ ] **On device (G2):** press A, open `/debug`: the frame is upright and the drawn boxes sit on the physical parts.

### Task 13: Press-time state, no-frame packet, visible failure

**Files:** Modify `Copilot/Interfaces.cs` (`Selection`), `Copilot/Net/CopilotClient.cs`, `Copilot/CopilotController.cs`; Create `Copilot/Tests/CopilotClientTests.cs`.

**Interfaces:** `readonly struct Selection(partId, source, stepId)` with `Selection.Of(ICopilotHost)`; `CopilotClient.BuildContextJson(ICopilotHost host, Selection selection, List<ProjectedPart> visible, CameraIntrinsics k, string scriptedQueryId)`.

- [ ] **Step 1: Failing tests:** the JSON uses the passed selection, not the host's current one; with no intrinsics it writes `"camera":null`; no part → `"selection_source":"none"`. **Step 2: Run** → FAIL (signature).
- [ ] **Step 3: Implement:** press captures frame + selection; release sends them and clears the frame; HUD button captures its own; `Query` omits the frame section when there is none; `OnFailed` shows "I couldn't answer that. Hold A and ask again."
- [ ] **Step 4: Run** the runner → PASS. **Step 5: Commit** `fix(quest): the question uses what was pointed at on press, sends camera null without a frame, and shows a failure instead of going silent`

### Task 14: Acceptance, docs, merge

- [ ] `pnpm -r typecheck && pnpm -r test` — zero failures.
- [ ] Re-run the audit probes (`scratchpad/rhythm-wt/services/api/tests/zz-audit-*.test.ts`, copied in temporarily, never committed). Expected: P1 leg stays `missing`; P2 200/200; P3 200; P4 `missing` then "nothing to undo"; P5 400 and no file; P6 0 held after retention; P7 `action: null`; W1 gap ≈ 2 s; W2 verification on the override model; W3 `PASS G0`.
- [ ] `bash tools/quest-check/run-editmode.sh` → 0 compile errors, all pass.
- [ ] `Device/` compiles against Meta's packages when A1's QuestCameraKit fork lands (Unity console: no `error CS`); until then it is checked by reading against MRUK 205's source.
- [ ] Docs: `docs/copilot.md` (commands change the build, unheard questions, g0), Copilot `README.md` (status, Device/ wiring).
- [ ] Merge `fix/copilot-audit` into `main`, re-run the suite on the merge, push.
