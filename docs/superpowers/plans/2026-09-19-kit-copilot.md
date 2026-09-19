# Kit co-pilot Implementation Plan

> **For agentic workers:** executed task by task, test-first, one commit per task (pathspec commits: other sessions share this worktree).

**Goal:** Kit becomes a general co-pilot in build mode: it hears the wish, sees the objects, answers, acts, and designs from whatever is on the table, on Qwen3.5-Omni by default with OpenAI behind a switch.

**Architecture:** One "Kit turn" per build-mode spoken turn (voice clip + photo + the table's twins, designs and step → `heard, intent, wish, pick, answer, objects, confidence`); deterministic code maps the result to actions. The wish lives on the build session and reaches the design model. Designs are live first (8 s), then the rehearsal cache keyed by objects + wish, then the old rules. Tape joins touching pieces into one rigid body that the balance check tests as a whole.

**Tech stack:** Fastify + Zod (services/api), OpenAI SDK against two providers (OpenAI, and yibuapi's OpenAI-compatible Qwen endpoint with streaming), React (apps/web), vitest.

**Spec:** tab "Kit co-pilot: requirements and plan" in https://claude.ai/code/artifact/5755f70f-db08-43ef-90ba-614c3206dc42 (decisions, requirements R1–R11, contracts, risks).

## Global constraints

- E7 and desk turns (overlay/upload modes) behave exactly as before, except the copilot's name is Kit.
- Every path is testable with no keys: stand-in HTTP servers for both providers, fake model calls elsewhere.
- A build-mode turn answers inside the server's 9 s cap (`COPILOT_CAP_MS`); the headset gives up at 12 s.
- The model never places anything: the solver, the balance check and `validatePlan` decide every design.
- New schema fields are optional, so the headset (which ignores unknown fields) and every fixture keep working.
- No new npm packages. Secrets never in git. Don't edit `apps/quest/Assets/CutOnce/Copilot/` (Rhythm's glow is his).
- Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Nothing is pushed.

## File map

| File | Change |
|---|---|
| `packages/schemas/src/factory.ts` | `PlaceStep.taped_to?`, `BuildIdea.made?`, `CopilotResponse.highlight_twins?` |
| `services/api/src/config.ts` | OMNI and Kit settings |
| `services/api/src/omni.ts` (new) | Qwen client: streamed chat, JSON pulled from text, Zod check, one repair retry, images and audio |
| `services/api/src/ai.ts` (new) | Which provider and model does a job (turn, label, ideas) |
| `services/api/src/llm.ts` | `JsonCall.audio?` (refused by the OpenAI helper) |
| `services/api/src/cli/omni-probe.ts` (new) | `pnpm omni:probe` |
| `services/api/src/build/session.ts` | wish, offered titles, expected scan, busy status, background work, context for Kit, progress lines |
| `services/api/src/build/ideas.ts` | live first, cache by objects + wish, Kit's designs first, no repeats, `made`, tape in the prompt |
| `services/api/src/build/label.ts`, `routes.ts` | providers per job |
| `services/api/src/build/solver.ts`, `stability.ts`, `plan.ts` | tape |
| `services/api/src/copilot/kit.ts` (new) | Kit turn schema, prompt, context text, decision |
| `services/api/src/copilot/pipeline.ts` | build mode → Kit turn (with fallback); fast-path wishes and E7; router wish |
| `services/api/src/copilot/fastpath.ts` | wish phrases, E7 phrases |
| `services/api/src/copilot/router.ts` | two flows (overlay/upload only), `wish` |
| `services/api/src/copilot/prompt.ts` | "You are Kit" |
| `services/api/src/cli/build-eval.ts` | `--turns`: the router and the Kit turn on each provider, accuracy and time |
| `apps/web/src/director/BuildPanel.tsx`, `api.ts` | wish, made badges |
| `docs/build-mode.md`, `.env.example` | the new behaviour and keys |

## Tasks

### T1: Schemas and settings
- `taped_to: string[]` optional on PlaceStep; `made: "live" | "cache" | "rule"` optional on BuildIdea; `highlight_twins: string[]` (twin ids) optional on CopilotResponse. Regenerate `dist/jsonschema`.
- Config: `omniKey, omniBaseUrl, omniModel (qwen3.5-omni-flash), omniIdeasModel, omniAudio ("dataurl"|"base64"), kitAi {turn,label,ideas} (KIT_AI default omni, KIT_*_AI overrides), kitTurnMs (6000), buildLiveMs (8000), omniRouteMs (1500)`.
- Tests: schema accepts old and new shapes; config defaults and overrides.

### T2: Qwen client and probe
- `omniJsonCall(cfg, call)`: OpenAI SDK with `baseURL`, `stream: true`, `modalities: ["text"]`; system prompt + "reply with one JSON object matching this JSON Schema"; images as `image_url` data URLs; audio as `input_audio` (data URL or bare base64 per `OMNI_AUDIO`); text pulled out of fences/prose, parsed, Zod-checked; one repair message on failure; a hard deadline by AbortController.
- `pnpm omni:probe [--audio f.wav] [--photo f.jpg]`: text, photo and voice checks; tries both audio encodings; PASS/FAIL/SKIP lines with latency; `--check` exits 1 on a FAIL.
- Tests (stand-in SSE server): parses a streamed, fenced reply; sends stream/model/images/audio in the right shapes; repairs once then throws; honours the deadline; refuses without key or base URL.

### T3: Provider per job
- `aiFor(cfg, job, prefer?) → { provider, model, call } | null`: the configured provider when it has credentials, else the other, else null.
- Label and ideas take the job's `AiCall | null` (null → names by size; designs from cache, then rules).
- Tests: the matrix of keys × settings; label/ideas never call a model without one.

### T4: The wish
- Session `wish`, `offered`, `forward`; `expectScan(wish | null)` (applies to the next scan within 60 s; a scan already being processed takes it at once); a plain "what can I build?" clears wish and offered; X keeps both; rethink replaces the wish.
- Router returns `wish`; fast path returns `wish` for plain asks (null) and for "build/make me a …" (the phrase).
- Tests: session lifecycle; router schema; fast-path wishes.

### T5: "Build E7"
- Fast path: "build/show (me)/open/load E7 / Engineering 7" → `startRun: "e7_start"`; the pipeline starts the run (the Director's code) unless E7 is already the current run.
- Tests: fast path phrases; pipeline starts E7 once, says so the second time.

### T6: Designs
- Live first with `buildLiveMs`; the rehearsal cache keyed by names, counts, sizes (5 cm for unsized), wish, model and prompt version; cached designs re-checked and never repeating offered titles; the old rules only when nothing else stands; `made` on every idea; a late live answer refreshes the cache without replacing the screen; progress lines ("I see…", "Designing…", "Checked N designs: M stand up.").
- Tests: live within the deadline; cache after it; nothing cached → waits for live; no model → cache then rules; wish in key and prompt; offered filtered; background work awaited by `idle()`.

### T7: Kit turn
- `KitTurn` schema, `KIT_SYSTEM`, `kitContextText` (objects with where they are, tools, wish, designs left to right, the build step, status, last turns), `decideKit` (intent → action, with confidence bars and question guard), pick by id, name or position.
- Pipeline: build mode → Kit turn on the turn provider (Qwen: audio in; OpenAI: speech-to-text first); fast path on `heard` first; fallback from a fast Qwen error to OpenAI when ≥ 4 s of the cap remain; `highlight_twins`; timings; the old build-mode router and name-pick paths removed.
- Tests: each intent's action; the fallback; overlay/upload unchanged; wire test for the OpenAI Kit turn and the Qwen Kit turn.

### T8: Director
- Sessions/current returns `wish`; the panel shows it and each idea's made badge (live, from rehearsal, offline rule).

### T9: Tape
- Solver: `taped_to` must name placed, touching pieces, and tape must be on the table. Stability: taped pieces form rigid groups; a group's weight lands ≥ need inside its supports, it tilts ≥ 7° before tipping, it weighs ≤ 1.5 kg; the span rule does not apply inside a group. Plan: "Tape it to the …" in the step, `tape` in tools. Prompt: `taped_to` and TOOLS.
- Tests: a 20 cm box taped onto one can passes, untaped refused; 4 taped cans refused; non-touching tape refused; no roll → refused.

### T10: Review and finish
- An independent review of the whole diff; fix findings test-first; full suite, typecheck, `pnpm sim`, Unity EditMode + PlayMode in the scratch clone; docs; memory.
