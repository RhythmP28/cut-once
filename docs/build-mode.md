# Build mode ("What can I build?")

Owner: Michael. Server code in `services/api/src/build/`, headset code in `apps/quest/Assets/CutOnce/Device/Build/`
and `Core/Build/`, the Director card in `apps/web/src/director/BuildPanel.tsx`. It registers itself as a `Plugin`
in `services/api/src/plugins.ts`. Nothing is removed: build mode is off until a scan starts it, and E7 and the desk
behave exactly as before.

The plan it was built from is `docs/superpowers/plans/2026-09-19-build-mode.md`. Where the code differs from the
plan, the commit message says why.

## What happens

```
"What can I build?" / X        one photo + 128 × 96 depth rays through its pixels (an organised point cloud)
        │
POST /v1/build/scans ─► 202    saved under the runtime data folder, then processed in order, every step broadcast:
        │
  twins.ts      surfaces (floor, tables, shelves) from a height histogram; objects = connected points above a
        │       surface; each fitted as a box or an upright cylinder, with an error estimate     ─► build_inventory
  label.ts      one vision call names the numbered objects from a fixed vocabulary, splits lumps, drops
        │       non-objects, adds missed clear bottles. No key or no network: names from sizes alone
  sizes.ts      a known object becomes exactly its standard size (a can is 15.7 × 6.6 cm, whatever was measured)
        │                                                                                         ─► build_inventory (labelled)
  rules.ts      x → y: designs that are known to work for the objects found (data/build/rules.json) ─► build_ideas
  ideas.ts      the ideas model writes more designs in a small placement language; each is solved to exact poses
        │       (solver.ts), checked for tipping and for supports that span what rests on them (stability.ts),
        │       repaired once, turned into a Plan (plan.ts) that
        │       passes validatePlan, and placed beside the pile facing you (site.ts)                ─► build_ideas (final)
        │
pick one (trigger, "build the …", or Start on /director)
        │
POST /v1/build/ideas/:id/start  a normal run: putDraft → approve → seed → createAssembly. From here it is the
                                same step engine, copilot, undo and Director as E7 and the desk.
```

The headset locks the hologram where the server put it, flies each piece from the real object to its place in the
design, then reads each step aloud. "Done" (or B with nothing pointed at) marks the whole current step.

## Endpoints

Every route needs the bearer token.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v1/build/scans` | `BuildScanUpload` (8 MB limit; the photo must be a JPEG) | `202 { scan_id, session_id }`; results arrive on the stream |
| `GET /v1/build/scans` | — | live scans and recordings, newest first |
| `POST /v1/build/scans/:scan_id/replay` | `{ labels: "saved" \| "live" }` | `{ session_id }`; replays into a new session |
| `POST /v1/build/sessions` | — | a new, empty session |
| `GET /v1/build/sessions/current` | — | the session's surfaces, twins and ideas |
| `POST /v1/build/ideas/rethink` | `{ request }` | `{ accepted }`; new ideas arrive on the stream |
| `POST /v1/build/ideas/:idea_id/start` | — | `{ assembly_id, plan_id, revision }` |
| `POST /v1/build/objects` | `{ name }` (a vocabulary object with a standard size) | the added twin |
| `GET /v1/build/vocabulary` | — | `{ items: [{ name, label, standard }] }` |
| `POST /v1/build/say` | `{ text }` | `{ turn_id, audio_url }` in the copilot's voice |

Stream messages: `build_inventory { inventory }` (twice per scan: outlines, then named) and
`build_ideas { session_id, ideas, final, audio_url, message }` (rule designs first, then the final list).

## In the copilot's turn

```
stt → fast path → [build mode: is this sentence picking an idea?] → [ retrieve ‖ annotate ‖ route ] → model …
```

- **Fast path, no model:** "what can I build", "what could we make with this", "build something", "scan this / again /
  the table" answer with the action `start_scan`. "Look again" does too, but only in build mode. In a build-mode run,
  "done" with nothing pointed at marks the current step.
- **Picking by name:** only the idea's name plus picking words ("let's build the laptop riser, please"). A question
  that names an idea is a question. Once an idea is started, names are not picks until the next scan.
- **The router** (`copilot/router.ts`) is a small model with `COPILOT_ROUTE_MS` (700 ms) to choose between a question,
  build ideas and a change to the design. It overlaps retrieval and annotation. Too slow, a malformed answer, down, or
  no key: the turn is a question, exactly as before. `routeOutcome()` is the one rule for what a routed turn does,
  shared with `pnpm build:eval --router`: below 0.7 confidence it asks back in build mode, and changes nothing outside
  it, so an E7 or desk question is never met with "do you want ideas for what to build?".

## Things the rest of the team needs to know

- **Frames.** The server is right-handed, +Y up, in metres; the headset mirrors X at the boundary (`ModelSpace`), for
  the scan as for everything else. The camera's right is `cross(forward, up)`.
- **A surface keeps its own outline** (`Surface.rect`). The headset's frame points wherever it started, so a table is
  almost never square to the room's axes, and its `min`/`max` box covers floor the table does not. Ask `onSurface()`
  (`build/twins.ts`), never the box.
- **A build plan never sets `rotation_quat`.** A piece on its side has its `size` reordered instead, and cylinders are
  only ever upright. `partAabb` ignores rotation, so this keeps the plan checker honest.
- **`isBuildPlan(plan)`** (`build/plan.ts`) is how anything tells a build-mode run from E7 or the desk.
- **Sizes are snapped.** Depth measures a can 1 to 3 cm wrong at 1.5 m; the vocabulary's standard size replaces the
  measurement whenever the name is known and the measurement could be that object.
- **The server never writes into `data/build/recordings/`.** Live scans, labels, sessions and the idea cache live
  under the runtime data folder, which git ignores: photos of the room must never reach the public repo.
- **Models.** `OPENAI_ROUTER_MODEL`, `OPENAI_LABEL_MODEL` (must take images) and `OPENAI_IDEAS_MODEL` each default to
  `OPENAI_MODEL`. The router should be the smallest, fastest model the key lists.

## Running it with no headset

```bash
pnpm build:fixtures     # regenerate data/build/recordings/synthetic_kit (a made-up scene: safe in the public repo)
pnpm build:eval         # every recording with a truth.json: found, labels, size error, ideas. No key needed
pnpm sim                # the pretend headset ends with: build scan → build start → build step
pnpm dev                # then /director → Build mode → Replay on scan_rec_synthetic_kit → Start
```

With Unity in Play mode (Meta XR Simulator), the Director's **Replay** shows the outlines, the names, the previews,
the fly-together and the walkthrough. In the Editor a scan of your own fails with "no depth": there is no depth
sensor to cast against.

With a key in `.env.local`:

```bash
pnpm build:eval --live      # name with the vision model and ask the ideas model
pnpm build:eval --router    # the router test set: right, and right within its 700 ms (bar 97%)
```

On the Quest: `pnpm build:record <scan_id> <name>` keeps a live scan as a recording. Look at its `photo.jpg` first
(the kit pile only, no people), then tape-measure every object into `truth.json`.

## Fallback ladder

| If | Then |
|---|---|
| No OpenAI key, no Wi-Fi, or the vision call fails | Objects are named from their sizes alone, and the HUD says so; rule designs still work |
| The ideas model fails or is slow | The rule designs already went out; the final list is just those |
| The scan missed an object | `/director` → Add a missed object (its standard size, in the middle of the table) |
| The scan is unusable | `/director` → Replay a recording, then Start |
| The router is slow or down | Every spoken turn is a question, as before build mode existed |
| A design would tip, balances on too narrow a support, or fails the plan checker | It is repaired once, then dropped: it is never offered |
| The Director starts a new session or a replay mid-scan | The old session stops and says nothing more |

## Known limits

- One session at a time (one headset).
- Mid-build, "make it taller" is answered like a question: the headset shows no new ideas until the next scan.
- While ideas are on show, the copilot still answers from the run that was showing before (E7, the desk). It knows
  the ideas only by title, for routing.
- Picking is by name or trigger, not by "the second one".
- When the table has no free space beside the pile, the design is built where the pile is.
