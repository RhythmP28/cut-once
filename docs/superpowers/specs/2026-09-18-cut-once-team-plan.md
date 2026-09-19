# Cut Once: Team Plan (who does what)

2026-09-18 · Applies the blueprint (`2026-09-18-cut-once-blueprint.md`) to the real team. Times use the same clock: **T+0 = Sat 00:00 EDT**, feature freeze T+24, final edits T+32.

## The team

| Person | Workstream | In one line |
|---|---|---|
| **Jerry Chen** and **Henry Cai** | **A**, split into **A1 Spatial** and **A2 Rendering & State** | The Unity app: the hologram sits on the real desk, changes state, and replays history |
| **Michael** | **B + D** | The server and history, the desk documents, Elasticsearch, and the E7 data |
| **Rhythm** | **C** | The copilot, on the headset and on the server, plus the camera check |

**Jerry and Henry decide who is A1.** A1 is the hardest job in the project (alignment, and getting builds onto the Quest). Whoever has shipped a Unity app to a Quest before takes it. If neither has, take whoever is more comfortable with 3D rotations and transforms. Nobody is assumed here; swap the names if that fits better.

## How the Unity work is split

| | **A1 Spatial** | **A2 Rendering & State** |
|---|---|---|
| **Owns** | Getting the ghost exactly onto the real desk | Everything the ghost looks like and what state it shows |
| **Code** | `AR/Alignment/`, `[Alignment]`, `[XRRig]`, `Main.unity` (**only A1 edits the scene**), `tools/qr` | `Core/` (data classes, replay logic, steps, timeline), `AR/Rendering/`, `AR/Selection/`, `Net/`, `UI/`, `Demo/`, prefabs `[Assembly]` `[HUD]` `[Demo]`, `E7Vision.unity` |
| **Interfaces they provide** | `IAlignment`, `IAlignmentSource` | `IPartIndex`, `ISelection`, `IHighlighter`, `IBuildState` |
| **Gates** | G1 (build runs on Quest), G3 (QR poses), G4 (alignment accuracy) | G5 (mark built → event → HUD), tests #1, #2, #7 |
| **Works mostly in** | The headset | The Unity Editor with fixtures, so it does not compete for the one Quest |

**Rules so three Unity people don't collide:** one person per prefab; A2 works in a `Sandbox_A2` scene; Rhythm owns the `[Copilot]` prefab; pull before every push; nobody else touches `Main.unity`.

## Per-person task lists (in order)

### A1 · Spatial

| When | Task |
|---|---|
| T+0 → 0:45 | Fork QuestCameraKit's project. Agree the C# interfaces with A2 and Rhythm. **At T+0:15, measure the desk with A2 using the sheet in the Platform & Knowledge plan (Task 9), stick the QR sheets on**, and send Michael the numbers and marker positions |
| T+0:45 → 2:30 | **G1:** build to the Quest, see passthrough. **G3:** QR poses on two printed codes. Record the update rate, the jitter and which axis points out of the page |
| T+2:30 → 5 | Two-point alignment solver with the third-marker check (see blueprint section 5). QR source. Proof overlay (marker squares and an origin cross). **G4:** ≤ 10 mm before nudge, ≤ 3 mm after |
| T+9:30 → 14 | Nudge controls. Save and restore the anchor. **Three-point rigid fit as the tilt fallback. Boundary suppression and the proximity-sensor setting. New-room cold start in ≤ 60 s.** **Touch two corners** as the backup. Alignment tests: five runs from different spots, restart, walk a full circle |
| T+14 → 20 | Stress tests and a second new-room run. **Build captain:** cuts the release APK. Place the ghost on a table with no real desk (P1) |
| T+20 → 24 | Depth occlusion, only if everything else is done. Battery and heat check |

### A2 · Rendering & State

| When | Task |
|---|---|
| T+0 → 0:45 | Data classes and the coordinate conversion; test the mirror check with the asymmetric fixture |
| T+0:45 → 2:30 | Replay logic (state from events) and the step engine, **built with Codex** against Michael's fixtures in the Editor. Log each Codex win in `CODEX_LOG.md` |
| T+2:30 → 5 | Plan loader and shape factory (boxes, cylinders, cable). First hologram look. Network client (send events, receive updates, retry, local journal). **G5** with Michael |
| T+9:30 → 11 | Visual states (missing, built, current step, wrong, selected) and the pointing ray. Press B to mark built. **Vertical slice at T+11** |
| T+11 → 14 | HUD panel: progress, step card, history list, pop-up messages, query buttons, source card |
| T+14 → 17 | Timeline slider, planned-future playback, "desk prints itself" replay, history panel |
| T+17 → 20 | Demo director and operator panel. Offline bundle. **E7 scene with a placeholder massing model**, to prove recording works early |
| T+20 → 24 | Swap in the real E7 data. Record `e7_vision.mp4` with glow on. Polish |
| T+24 → 27 | Record the Devpost demo video and screenshots during rehearsal |

### Rhythm · C (Copilot)

| When | Task |
|---|---|
| T+0 → 0:45 | **G0:** confirm the AI model accepts an image and returns strict JSON (else fall back to the second model). Read the ImageLLM sample in QuestCameraKit |
| T+0:45 → 2:30 | Camera frame source, mic recorder, and a small `/debug` page that shows the received frame and plays the audio. **Write the copilot and verification schemas in `packages/schemas` (Tier 2 contracts, by T+3): you own both ends of those packets** |
| T+2 → 3 (headset window) | **G2:** photo and audio reach the server. **G7:** casting works while the camera and mic are in use |
| T+2:30 → 5 | **G6:** speech to text → AI → voice → headset speaker. Log every stage's time |
| T+9:30 → 11 | Context packet. Part projector (3D boxes onto the photo). Draw the boxes on the `/debug` page |
| T+11 → 14 | Plug in Michael's search. Structured answer → highlights → source card. Timeouts |
| T+14 → 17 | Camera verification (suggest only) |
| T+17 → 20 | Spoken commands ("done", "next", "undo"). Cached answers and the offline bundle. "What's left?" |
| T+20 → 24 | Latency tuning. Follow-up questions. Depth probe or wake word only if ahead |
| Also | The copilot panel on the Director page (transcript, answer, timings, sources) |

### Michael · B + D

| When | Task |
|---|---|
| T+0 → 0:45 | Repo, schemas, fixtures. **Freeze the contracts.** Collect all four badge IDs. (A1 and A2 measure the desk; Michael enters the numbers at T+3:45.) Full task list: `docs/superpowers/plans/2026-09-18-platform-knowledge.md` |
| T+0:45 → 2 | **Devpost skeleton submitted early** (team, all four badge IDs, all six prizes). Only the description can wait; this removes a 2 PM deadline scramble |
| T+0:45 → 2:30 | Replay logic in TypeScript (state from events, steps, validator) **with Codex**. Events API and storage. Vultr, domain, HTTPS (**G8**) |
| T+2:30 → 5 | Live updates channel. Director page shell. **Known-good `desk.plan.json`.** Desk documents (drawing, wiring sheet, parts list). Elasticsearch indices and ingest |
| T+9:30 → 14 | Link each document chunk to its parts. **Search v0 (keyword) ready by T+11 for Rhythm.** Index events. Upload page with duplicate-file detection |
| T+14 → 20 | **E7 massing model first (T+14 → 15:30): it is in the 3-minute demo and A2 needs it for the video.** Then hybrid search with reranking (Rhythm gets it by T+17). Elastic tools and the `log_issue` Workflow. Thin extraction: AI reads the drawing, code validates, read-only review page with Approve |
| T+20 → 24 | Extraction and review page spill-over, laptop fallback, backups. E7 auto-extracted walls only if ahead. Elastic sponsor demo. `README`, `SOURCES.md`, `CODEX_LOG.md` |

**Michael's cut order if behind:** History page → review-page editing → repair loop on extraction → the `find_parts` and `lookup_material` tools → E7 auto-walls. **Never cut:** the event log, `desk.plan.json`, search v0, the deploy.

## Handoffs (who needs what, by when)

| From → To | What | By |
|---|---|---|
| Michael → A2, Rhythm | **Tier 1 contracts:** plan, parts, events, state, and the fixtures | T+0:45 |
| Rhythm and Michael → everyone | **Tier 2 contracts:** copilot and verification packets (Rhythm); jobs, stream messages, search results (Michael) | T+3 |
| Michael → A2, Rhythm | Events API and state endpoint live | T+3 |
| Michael → A2 | Known-good `desk.plan.json` | T+4:30 |
| A1 → A2, Rhythm | Working alignment (G4) | T+5 |
| A2 → Rhythm | Selection and highlight interfaces | T+11 |
| Michael → Rhythm | Search v0 (T+11), hybrid and reranking (T+17) | as listed |
| Rhythm → Michael | Copilot turn log format, for indexing | T+9 |
| Michael → A2 | E7 massing plan, model and events | T+15:30 |

## The one headset

Three Unity people share one Quest. **A1 holds it by default.** Rhythm has T+2 → 3 for G2 and G7. A2 works in the Editor and takes short on-device checks at T+5 and T+9:30. From T+14, it lives on the integration bench. **Ask the hardware desk for a second Quest tonight.**

## Honest load check (my rough estimates)

Each person has about 19–20 real build hours before feature freeze (T+0 to T+24, minus sleep).

| Person | Work if everything is built | P0 only | Verdict |
|---|---|---|---|
| A1 | ~17 h | ~14 h | Fits. Hardest work, not the most work |
| A2 | ~18 h | ~14 h | Fits, with about 2 h spare |
| Rhythm | ~25 h | ~15 h | P0 fits; verification and polish are the flex |
| Michael | ~40 h originally, ~28 h after the moves and cuts above | ~18 h | **P0 alone fills the whole weekend.** Every P1 is a bonus |

**Consequences to accept now:** the desk demo and the copilot are safe. E7 will most likely be the massing model, extraction will be the thin version, and the Elastic tools will be the minimal set. If Jerry or Henry has spare time and knows web code, the best things to take from Michael are the review page and the History page.

---

## Feature allocation (every feature, every owner)

**Owner key:** **A1 / A2** = Jerry and Henry (they pick who is A1) · **B + D** = Michael · **C** = Rhythm. The first owner leads; the second supports.
**Status:** ✅ can build · 🟡 smaller version · ❌ not this weekend (`—` = nobody, on purpose).

### Pitch and story
| Feature | Can? | What we build | In the demo? | Owner |
|---|---|---|---|---|
| Problem statistic | ✅ | **$177.5B** a year (FMI/PlanGrid 2018), not the unsourced $140B | Yes, the opener | B |
| Hardware limits | ✅ | One honest line: about 2–3 h battery, camera can't read small print | Yes | B |
| E7 video: drawings to a building rising on a field | 🟡 | Precomputed. Massing model by default; auto-extracted walls only if ahead | Yes, the solution beat | D (data) · A2 (records the video) |
| Demo script and stopwatch rehearsals | ✅ | Beat-by-beat script, five timed runs | Yes | A2 |

### Litematica: Upload (drawings to 4D)
| Feature | Can? | What we build | In the demo? | Owner |
|---|---|---|---|---|
| Upload page (PDF, photo, parts CSV) | ✅ | Web page on our domain | Yes | B |
| Desk drawing to 3D parts | 🟡 | AI proposes, code checks, a person approves. Known-good `desk.plan.json` as the bypass | Yes (replays the approved version) | B (pipeline) · D (desk documents, known-good file) |
| Review and approve page | 🟡 | Read-only 3D preview plus an Approve button | No | B |
| Materials list | ✅ | Indexed so the copilot can find it | Via the copilot | D |
| 1:1 see-through ghost hologram | ✅ | Glowing parts built from the plan | Yes | A2 |
| Pinned in place | ✅ | Saved spatial anchor | Yes | A1 |
| Build from zero (the 4D part) | ✅ | Steps ordered by what rests on what; timeline replay | Yes | A2 (headset) · B (server) |
| Version history | ✅ | Every "built" is an event; rewind to any version | Yes | B (log) · A2 (headset copy) |
| Real-time updates | 🟡 | About 1 s after a tap or voice command; it can't notice by itself | Yes | B (live channel) · A2 |
| Timeline slider and "desk prints itself" replay | ✅ | | Yes | A2 |
| Layer toggles (structure, hardware, electrical) | 🟡 | P2 | Optional | A2 |
| Revised drawing shows added/removed/moved parts | ❌ | P3, only if everything else is done | No | A2 |
| Electrical diagrams to 3D | 🟡 | Not automatic. The desk's power cable route is typed into the plan | Yes (the cable question) | D |
| Automatic build order for a building | ❌ | E7 uses hand-written rules only | No | D |
| Full building drawings to accurate 3D, automatically | ❌ | Vision. E7 is the precomputed stand-in | No | — |

### Litematica: Overlay (build on what's there)
| Feature | Can? | What we build | In the demo? | Owner |
|---|---|---|---|---|
| Line up with the half-built desk | ✅ | Two QR codes, or touch two corners. Nudge. Saved anchor | Yes, must work | A1 |
| Missing / built / wrong / current-step looks | ✅ | Ghost = missing, thin outline = built, red = wrong, pulsing = current | Yes | A2 |
| Mark a part built | ✅ | Controller button; spoken "done" through the copilot | Yes | A2 (button) · C (voice) |
| Camera suggests what's built | 🟡 | Suggests only, takes 3–6 s, a person confirms | Yes, framed as "suggests" | C |
| Ghost hides behind hands | 🟡 | Depth occlusion, P2 | Optional | A1 |
| Place the ghost with no real desk | 🟡 | Point at a table and click, P1 | No | A1 |
| Detect every part automatically, live | ❌ | Vision | No | — |
| Half-built construction site | ❌ | One anchor covers about 3 m. Vision | No | — |

### Copilot
| Feature | Can? | What we build | In the demo? | Owner |
|---|---|---|---|---|
| Push-to-talk | ✅ | Hold a controller button while asking | Yes | C |
| "Hey copilot" wake word | 🟡 | P3, after everything else | No (button in the demo) | C |
| Understand the question | ✅ | Speech to text | Yes | C |
| See what you see | 🟡 | One camera photo per question, not video. Needs Unity | Yes | C |
| Know what you're pointing at | ✅ | Controller ray gives a part ID | Yes | A2 (selection) · C (uses it) |
| Know which parts are in view | ✅ | Project each part's box onto the photo. Needs good alignment | Yes | C · A1 (alignment) |
| Search drawings and materials | ✅ | Elasticsearch, chunks linked to parts | Yes | D |
| Hybrid search, reranking, Elastic tools, Workflow, ES\|QL | 🟡 | Minimal set: hybrid + rerank, search and history tools, `log_issue` workflow | Sponsor slot | D |
| Spoken answer | ✅ | ElevenLabs voice, streamed | Yes | C |
| Highlight the parts it talks about | ✅ | The answer lists part IDs and the renderer pulses them | Yes | A2 (renderer) · C (answer) |
| Source card (document and page) | ✅ | Small card naming the sheet and page | Yes | A2 (UI) · C |
| Fast answers | 🟡 | Target first audio within 5 s | Yes | C |
| Saved answers if the network fails | ✅ | Real answers cached from earlier runs | Fallback | C |
| "Where does this cable go?" | ✅ | Works because the cable route is in the plan | Yes | C · D (wiring sheet) |
| "Is this the right screw?" | 🟡 | Camera can't read small print. Test first, keep only if it passes | Only if it passes | C |
| Follow-up questions ("and after that?") | 🟡 | P1 | Optional | C |
| Continuous video understanding | ❌ | One photo per question | No | — |

### Running the demo
| Feature | Can? | What we build | In the demo? | Owner |
|---|---|---|---|---|
| Demo controller (reset, force a step, replay, offline mode) | ✅ | Panel in the headset and a control page on the laptop | Yes | A2 (headset) · B (laptop) |
| Reset in 20 s, crash recovery in 30 s | ✅ | New run from a seed; saved anchor restores | Yes | A2 · A1 |
| Casting the headset to the room display | 🟡 | Must be tested with camera and mic on | Yes | C · A1 |
| Laptop backup server | ✅ | Same server code, run on the laptop | Fallback | B |

### Vision (pitch lines only)
| Feature | Can? | Note | Owner |
|---|---|---|---|
| Site-scale tracking across floors | ❌ | One anchor covers about 3 m | — |
| Hard hats, outdoor sunlight, all-shift battery | ❌ | Named as hardware limits in the pitch | B |

### Setup, prizes and tonight
| Job | Owner |
|---|---|
| Repo, schemas, shared test files. Contracts frozen by T+0:45 | B |
| Vultr server, GoDaddy domain, HTTPS (Vultr and GoDaddy prizes) | B |
| Devpost skeleton at about T+1 (team, badge IDs, six prizes); final by T+32 | B |
| Codex log for the OpenAI prize (B tracks it; A2 and D add entries) | B |
| OpenAI and ElevenLabs keys, before T+0 | C |
| Elastic cluster: confirm 9.4+ and the Jina IDs at the booth | D |
| Measure the desk and stick the QR sheets (T+0:15, using the Task 9 sheet) | A1 · A2 |
| Print the QR sheets. Find a printer tonight | A1 |
| Get the desk and parts (power strip, cable, clips). Legs must screw in by hand | A2 |
| Ask the hardware desk for a second Quest | B |
| Install Unity 6000.3.12f1 and put the Quest in developer mode | A1 · A2 |

### Demo-day roles (suggested; swap freely)
- **Operator** (wears the headset): A1, who can nudge or re-align in seconds.
- **Builder** (hands on the desk): A2.
- **Narrator** (talks to the judges): Michael.
- **Laptop and safety net** (control page, cached answers, sees the stage timings): Rhythm.
