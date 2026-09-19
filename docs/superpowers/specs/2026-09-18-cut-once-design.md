# Cut Once: Technical Design

Hack the North 2026 · Draft for team approval · 2026-09-18

> **Superseded (2026-09-18 evening) by `2026-09-18-cut-once-blueprint.md`.** The headset moved from WebXR to Unity, the demo moved from a framed wall to a half-built desk, and the cut list and supplier order were dropped. Kept: the Vultr server and domain, Elasticsearch, OpenAI, ElevenLabs and the four-owner split.

## 1. What "done" looks like

Cut Once shows a building plan as a true-scale hologram in passthrough on a **Meta Quest 3**. It labels whatever you point at, answers spoken questions out loud, flags framing mistakes, and turns the plan into a cut list and a supplier order.

The **golden path** below is the definition of done. Build it first, make it work three times in a row, and only then touch stretch goals.

1. **Place.** Click two corners on the real floor. A framed 8 ft wall with a window opening appears at 1:1 scale.
2. **Inspect.** Point at a stud. The label reads *"King stud · 2×4 SPF · 92⅝″ (2.35 m) · ~6 min · $4.98 at Supplier B"*.
3. **Ask.** "What goes here?" while pointing at the window opening. The answer is spoken and names the header and jack studs, citing the guidance it used. Those parts light up.
4. **Catch.** One stud gap glows red. "What's wrong?" gets: "These studs are 32 inches apart. They should be 16 on center. Add a stud here." A ghost stud appears where the fix goes.
5. **Estimate.** "How long will this take?" gets "About 3¼ hours for a first-timer, 1½ for a pro."
6. **Order.** "Order it." The cut list panel shows each stock board and its cuts. An Elastic Workflow sends the order, and the supplier inbox page on the laptop shows it arrive.

**Demo setup:** the presenter wears the headset and casts it to a laptop, then hands the headset to the judge. Casting shows passthrough and MR on Quest 3.

## 2. Hardware: Meta Quest 3

Each of these is a Quest 3 advantage over the 3S:

- **Sharper labels.** Pancake lenses and 2064×2208 per eye, versus 1680×1870 on the 3S.
- **See a whole wall at 1:1.** About 110° horizontal field of view, versus about 96°.
- **Better room mesh.** The Quest 3 has a dedicated depth projector.
- **Occlusion is possible.** The Depth API lets the hologram hide behind real people and objects (stretch goal).
- **Placement without a room scan.** Hit-test uses live depth in Quest Browser 40.4+, so no Space Setup is required. Run Space Setup at the judging spot anyway, because plane detection needs it.

- **Battery:** about 2.2 hours. Bring a USB-C battery pack to judging.
- **One headset:** Pillar A gets priority. Everyone else tests in the Immersive Web Emulator (IWER) Chrome extension.

## 3. Architecture

```
┌─ Meta Quest 3 · Quest Browser ─────────────────────────┐
│  WebXR immersive-ar + three.js                         │
│  plan.json → part meshes (1:1, one root transform)     │
│  controller ray → part id → label                      │
│  hold trigger → mic (webm/opus)                        │
└──────────────┬─────────────────────────▲───────────────┘
   HTTPS, same │ origin                  │ speech (mp3 stream)
   /api/*      ▼                         │ + highlight ids + action
┌─ Vultr VM · https://<godaddy-domain> · Caddy → Node 22 + Fastify ─┐
│  serves the headset build + /api                                  │
│  engine (in-process): plan · rules · time · cut list · order      │
│  agent loop:                                                      │
│    gpt-transcribe → gpt-5.6-luna + tools → ElevenLabs Flash v2.5  │
│    tools = engine functions + Elastic tools (MCP client)          │
│  supplier stub: POST /api/supplier/orders, GET /supplier (inbox)  │
└──────────────┬────────────────────────────────────────────────────┘
               │ MCP  (Authorization: ApiKey …)
┌─ Elastic Cloud ───────────────────────────────────────────────────┐
│  indices: cutonce-guidance · cutonce-catalog · cutonce-parts ·    │
│           cutonce-orders                                          │
│  Jina embeddings (semantic_text) + Jina reranker                  │
│  hybrid retrievers (BM25 + semantic, RRF) · ES|QL                 │
│  Agent Builder tools + agent · Workflow place_order → webhook ────┼──▶ supplier stub
└───────────────────────────────────────────────────────────────────┘
```

**Key decisions:**

- **The agent loop runs on our server.**
  - **Why:** we control latency and inject headset context (the part you're pointing at). The same loop also scores for both the OpenAI and Elastic prizes.
  - **The server is the MCP client for Agent Builder.** OpenAI's hosted MCP tool only takes an `authorization` token, and its docs show no custom headers. Elastic's MCP endpoint wants `Authorization: ApiKey …`.
  - **Fallback:** if MCP misbehaves, the same tool names call Elasticsearch directly (Pillar C provides `knowledge/queries.ts`).
- **The plan is a single JSON file in plan-local metres.** Alignment moves one root transform and never touches the data. The hologram, labels, rules, cut list and search index all read this file (a pattern taken from xr-drilling-assistant).
- **Alignment is manual, with two clicks.** Scale is locked at 1:1. A 1:10 "tabletop" toggle covers cramped judging tables.
- **API keys never reach the headset.**

| Layer | Choice |
|---|---|
| Headset | WebXR, three.js, troika-three-text for labels, Vite |
| Server | Node 22, TypeScript, Fastify, MCP TypeScript SDK (client), Caddy for HTTPS |
| Engine | Pure TypeScript and Vitest in `packages/engine`, built mainly with Codex |
| Search / agent context | Elastic Cloud (confirm version is 9.4+): Agent Builder, Workflows, Jina via EIS |
| LLM / STT | OpenAI Responses API with `gpt-5.6-luna` (try `gpt-5.6-terra` if answers are weak) and `gpt-transcribe` |
| TTS | ElevenLabs Flash v2.5, streaming |
| Hosting / domain | Vultr VM (MLH credits) and a GoDaddy Registry domain (MLH link) |
| Repo | pnpm workspaces on GitHub. Devpost needs the source link. |

## 4. Contracts (agree in the first hour)

These let four people build in parallel. Change one only by telling the whole team.

### 4.1 Repo layout

```
cut-once/
  apps/headset/      A  Vite + three.js WebXR client
  apps/server/       D  Fastify: /api, agent loop, serves headset build
  packages/engine/   B  schema, generator, rules, time, cut list, order
  knowledge/         C  raw data, ingestion, mappings, tool + workflow defs, queries.ts
  data/              generated plan JSON, fallback audio
  docs/              this file, demo script
  CODEX_LOG.md       everyone: concrete Codex wins (OpenAI prize)
```

### 4.2 Plan schema (`packages/engine/src/schema.ts`; B ships a hand-written sample in hour 1)

```ts
type Vec3 = [number, number, number];          // metres, plan-local, y-up, origin = corner A
type PartKind = "stud" | "king" | "jack" | "cripple" | "plate" | "top-plate"
              | "header" | "sill" | "joist" | "rim" | "sheathing" | "scaffold";
interface Part {
  id: string;            // "stud-07"
  kind: PartKind;
  name: string;          // "King stud, window left"
  nominal: string;       // "2x4"
  materialQuery: string; // "2x4 SPF #2 stud 92-5/8" — what C searches the catalog with
  length: number;        // cut length, m
  position: Vec3;        // box centre
  size: Vec3;            // axis-aligned box extents in plan axes, m (2x4 = 0.038 × 0.089)
  rotation?: Vec3;       // Euler rad, only for angled parts
  group: string;         // "wall-north"
  step: number;          // build order
  minutes: number;       // base install minutes (pro)
}
interface Plan { id: string; name: string; preset: "wall" | "shed"; parts: Part[] }
interface Issue {
  id: string; rule: string; severity: "error" | "warning";
  partIds: string[]; fixAt?: Vec3; fixPart?: Part;   // ghost part to show
  message: string; guidanceQuery: string;           // C's search cites the rule
}
interface CutList {
  boards: { sku: string; stockLength: number; cuts: { partId: string; length: number }[]; waste: number }[];
  wastePct: number;
}
interface Order {
  orderId: string; status: "draft" | "sent";
  lines: { sku: string; description: string; qty: number; unitPrice: number; supplier: string }[];
  subtotal: number; tax: number; total: number;
}
```

### 4.3 HTTP API (server, owned by D)

| Route | Returns |
|---|---|
| `GET /api/plan?preset=wall&mistakes=on` | `{ plan: Plan, issues: Issue[] }` |
| `GET /api/parts/:id/info` | `{ price, supplier, inStock, tip, source }` (Elasticsearch enrichment; the label shows plan data first) |
| `POST /api/ask` (multipart: `audio`, `lookingAt`, `mode`) | `{ transcript, speech, highlight: string[], action?: { type: "show_issue" \| "show_cutlist" \| "order_placed", data }, audioUrl, timings }` |
| `GET /api/audio/:id` | `audio/mpeg` stream |
| `GET /api/cutlist` | `CutList` |
| `POST /api/order` | `Order` (engine builds it, then C's `place_order` workflow sends it) |
| `POST /api/supplier/orders`, `GET /supplier` | stub supplier: webhook target and inbox page |

### 4.4 Agent tools (one flat list for the model; the server routes each call)

| Tool | Backed by | Owner |
|---|---|---|
| `get_part(partId)` | engine | B |
| `check_plan()` → Issue[] | engine | B |
| `estimate_time(partIds?, skill: "pro" \| "first-timer")` | engine | B |
| `cut_list(partIds?)` | engine + catalog prices | B |
| `search_guidance(query)` → cited snippets | Agent Builder tool: hybrid search + Jina rerank | C |
| `find_parts(query)` | Agent Builder tool over `cutonce-parts` | C |
| `find_material(description)` → normalized catalog rows | Agent Builder tool over messy catalog | C |
| `price_materials(skus[])` → cheapest in-stock per SKU | Agent Builder ES\|QL tool | C |
| `place_order(order)` | Agent Builder workflow tool → Workflow → webhook | C |

## 5. The four pillars

Each pillar is owned end to end by one person for the whole hackathon. The owner builds it, tests it, and demos their part.

### Pillar A: Headset (what you see)

**Best owner:** strongest frontend/3D person. **Earns:** Finalists (WOW factor).

**Build order:**
1. Landing page with an Enter AR button. Request mic permission here, before entering XR.
2. Session: `immersive-ar`, `local-floor`, plus optional `hit-test`, `anchors` and `plane-detection`.
3. Render `plan.json`:
   - one mesh per part, with edges and translucent faces
   - colours: default cyan, hover white, issue red (pulsing), voice highlight yellow, ghost fix dashed green
4. Place mode: a hit-test reticle. Click corner A, then corner B, to get position and yaw. Create an anchor. Add a "realign" button and a 1:10 tabletop toggle.
5. Inspect mode:
   - controller ray → part → troika label, showing imperial and metric size, material and minutes
   - then async enrichment from `/api/parts/:id/info`
6. Voice:
   - hold trigger → MediaRecorder (`audio/webm;codecs=opus`) → `POST /api/ask`
   - "listening / thinking" indicator
   - play the audio, then apply `highlight` and `action`
7. Order mode: a cut list panel and a confirm action.

**Exit criteria:**
- **M1:** sample plan renders in passthrough on the Quest, and two-click placement works.
- **M2:** labels and voice round-trip work against the deployed server.
- **M3:** the full golden path works on the headset, and casting to the laptop is tested on venue Wi-Fi.

**Dev loop:** `adb reverse tcp:5173 tcp:5173` makes localhost a secure context (needs developer mode, so enable it tonight). Or test against the deployed domain.

**Stretch:**
- depth occlusion (`THREE.WebXRDepthSensing`; expect flicker at edges)
- persistent anchors
- "show me step 3" build-order playback
- scaffolding layer

**Fallback:** if hit-test fails in the venue, place the plan in front of the user at floor height.

### Pillar B: Plan engine (what's true about the build)

**Best owner:** strongest algorithms person. **Earns:** OpenAI, as the Codex story. Build this pillar mainly with Codex, test-first.

**Build order:**
1. Hour 1: `schema.ts` and a **hand-written** `sample-plan.json` (about 10 parts) so A can start rendering immediately.
2. Parametric generator for real lumber sizes (2×4 is 38×89 mm, studs are 92⅝″):
   - **`wall` preset:** 8 ft wall, 16″ on center, bottom plate, double top plate, and a window with king, jack, header, sill and cripples.
   - **`shed` preset:** an 8×8 floor and walls.
   - **`mistakes=on`:** seeds one missing stud (a 32″ gap) and a missing header.
3. Rules, as pure `Plan → Issue[]` functions: on-center spacing, header over the opening, king/jack pairs, and top-plate splice over a stud. Each rule emits `fixPart` and `guidanceQuery`.
4. `estimate_time`: minutes per kind × skill multiplier (pro 1.0, first-timer 2.2) plus setup time, reported per group and in total.
5. Cut list: first-fit decreasing over 8, 10, 12 and 16 ft stock with a ⅛″ kerf, choosing the cheapest stock using C's prices. Output board-by-board cuts and waste %.
6. Order: cut list → SKUs × qty × price → `Order`, plus CSV and a printable HTML order sheet.

**Exit criteria:**
- **M1:** generator and cut list pass their tests on the demo plan.
- **M2:** rules, time and order are done, and all engine tools are callable from the server.
- **M3:** golden tests pin the demo plan's exact issues, cut list and total.

**After M2, B also owns:**
- the demo script (`docs/demo.md`)
- the pitch (`deck.md`)
- the Devpost write-up and demo video
- `CODEX_LOG.md`

**Stretch:** roof rafters, scaffolding parts, joist-span rule from a span table.

### Pillar C: Knowledge and agent tools, on Elasticsearch (what the world knows)

**Best owner:** data/backend person comfortable with messy data. **Earns:** the Elastic prize.

**Build order:**
1. Hour 0: at the Elastic booth or Discord, get a cluster and confirm the version.
   - **Need 9.4+ for:** Workflows GA and Jina v5 with `semantic_text`.
   - **Also confirm:** the exact Jina embedding and reranker inference IDs.
2. Collect **messy, real** data. Cite every source, and prefer openly licensed ones.
   - **Guidance:** National Building Code of Canada Part 9 excerpts (wall framing, lintels), municipal deck and shed permit guides (PDFs), and DIY Stack Exchange Q&A (CC BY-SA).
   - **Catalog:** 2–3 supplier price lists in inconsistent formats ("2x4x8", "2 X 4 - 8'", "38 x 89 mm x 2.44 m SPF #2&BTR KD"). Where prices are samples, say so in the demo.
   - **Plan parts:** from B's generator.
3. Mappings:
   - `semantic_text` with Jina embeddings on guidance and catalog text
   - normalized catalog fields (nominal, length_m, species, grade, price, supplier, in_stock)
   - an ingest pipeline plus LLM-assisted normalization for supplier names
4. Hybrid search: an `rrf` retriever over BM25 and semantic, wrapped in `text_similarity_reranker` with the Jina reranker. Tune it on 10 demo questions.
5. Agent Builder:
   - create the §4.4 tools from JSON in the repo via the API, so they're reproducible
   - add an ES|QL `price_materials` tool
   - create a "Cut Once Foreman" agent in Kibana (the same tools, usable from the office; a cheap extra for judges)
6. Workflow `place_order` (YAML):
   - index the order into `cutonce-orders`
   - call the webhook to the server's supplier stub
   - expose it as a workflow tool
7. `knowledge/queries.ts`: direct Elasticsearch fallbacks for every tool, with the same inputs and outputs.

**Exit criteria:**
- **M1:** guidance and catalog are indexed, and hybrid search returns sensible hits.
- **M2:** all C tools work over MCP, and the workflow places an order that reaches the stub.
- **M3:** the 10 demo questions get cited, correct retrievals.

**Stretch:** French guidance and questions (the NBC is bilingual, and Jina is multilingual), and a Kibana view of agent traces.

### Pillar D: Voice brain and platform (how it talks and ships)

**Best owner:** backend/devops person, and the integration lead. **Earns:** OpenAI (API use), ElevenLabs, Vultr, GoDaddy Registry.

**Build order:**
1. Hour 0: API keys for OpenAI and ElevenLabs. Vultr credits and the domain through the MLH links (check which TLDs count for GoDaddy Registry). Create the GitHub repo and pnpm workspace.
2. Infra:
   - Vultr VM with Node 22 and Caddy (automatic HTTPS)
   - DNS A record pointing at it
   - one-command deploy (`git pull && pnpm build && restart`)
3. Fastify server: serves the headset build, all §4.3 routes with stubbed data first, and the supplier stub and inbox page.
4. `/api/ask`:
   - transcribe with `gpt-transcribe`
   - build context: plan summary, the part being looked at, open issues, mode
   - call the Responses API with `gpt-5.6-luna` and the §4.4 tools, max 3 tool rounds
   - get structured output `{speech ≤ 2 sentences, highlight, action}`
   - stream it through ElevenLabs Flash v2.5
5. MCP client for Agent Builder, with discovery and the ApiKey header. Switch to `queries.ts` automatically if MCP fails.
6. Latency and robustness:
   - log per-stage timings
   - target first audio in under 3 s
   - 6 s timeout, then **demo-safe mode**: prerecorded answers for the scripted questions
7. Devpost: select all 6 sponsor prizes **before Sat 2:00 PM EDT**, and collect every teammate's badge ID.

**Exit criteria:**
- **M1:** domain serves the headset over HTTPS, and `/api/ask` speaks a real answer end to end.
- **M2:** tools are wired (engine and Elastic), and prizes are selected on Devpost.
- **M3:** the golden path passes 3 times in a row, and demo-safe mode is tested with Wi-Fi off.

**Stretch:** stream model text straight into the ElevenLabs `stream-input` WebSocket to cut latency.

## 6. Timeline

This assumes hacking runs from Friday night to Sunday morning. Adjust to the official schedule.

| When | Milestone | Team-wide exit check |
|---|---|---|
| Fri, first hour | **M0: contracts** | §4 agreed; repo up; all accounts and keys working; Quest in developer mode; B's sample plan exists |
| Fri night | **M1: walking skeleton** | On the Quest: hologram from the server, ask a question, hear an answer (even a dumb one) |
| Sat ~noon | **M2: features** | Every pillar's M2 done. **Before 2:00 PM ET, submit a draft on Devpost** with the final team, every badge ID and every sponsor prize. Prizes added later don't count. |
| Sat night | **M3: integrated** | Golden path passes 3× in a row on the headset, with casting |
| Sun, before 8:00 AM | **M4: freeze** | No new features. **Devpost edits close at 8:00 AM ET.** Finish the write-up, then rehearse. |
| Sun ~8:30 AM onward | **Judging** | See §8.1 |

Sync every ~4 hours: each person runs their exit check live on the golden path. Nobody starts stretch work before M3.

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Venue Wi-Fi is slow or blocks devices | Phone hotspot; demo-safe mode (cached answers and audio); tabletop mode |
| Hologram drifts or is misaligned | Realign button (two clicks); anchors; tabletop mode |
| Elastic version lacks Workflows or Jina v5 | Confirm in hour 0; `queries.ts` direct fallbacks; a plain webhook call from the server |
| Voice is too slow | Short answers; Luna; streaming TTS; a "thinking" sound; cached answers |
| Only one headset | IWER emulator for B, C and D; A has priority; book headset slots |
| Scope creep | Golden path first; stretch only after M3 |
| Headset battery (~2.2 h) | Charge between sessions; battery pack at judging |

## 8. Prize checklist

- **Finalists:** a live demo, not slides. Judged on originality, UX, technical complexity and WOW factor.
- **Elastic, Find the Signal:**
  - messy real data
  - hybrid search (BM25, Jina, rerank)
  - ES|QL
  - Agent Builder tools
  - a Workflow that takes action (`place_order`)
  - show it working in the demo
- **OpenAI:** show the API powering the experience, plus one concrete way Codex improved the build. Codex has to be used for real (Pillar B, logged in `CODEX_LOG.md`). Claude Code work doesn't count.
- **MLH ElevenLabs:** the spoken answers.
- **MLH Vultr:** the backend runs on Vultr.
- **MLH GoDaddy Registry:** the project domain.
- **Everyone:** the source link, all badge IDs, and prize selection before Sat 2:00 PM EDT.

### 8.1 Sunday judging (from the official Judging FAQ)

- **Main judging:**
  - Round 1 is one 5-minute live demo (about 3 min demo, 1 min Q&A, 1 min setup). You're cut off at 5 minutes.
  - Times are posted about 8:30 AM on the hacker dashboard. Be in the waiting room 10 minutes early.
  - Top teams go on to the Science Fair.
- **Sponsor prizes are separate demos:**
  - Each prize gets its own 5-minute slot, including transition.
  - Sign-up links go to each sponsor's Slack channel shortly after 8:30 AM Sunday.
  - One person books one slot per prize. It must not overlap main judging.
  - Most prizes are judged by presentation. Ask in the MLH channel whether the MLH prizes are judged from Devpost instead.
- **One headset means demos can't overlap.** Book slots back to back with at least 10 minutes between them. The headset holder walks it to each room. Charge it between slots.
- **Tailor each sponsor demo:**
  - **Elastic (C presents):** about 1 min in the headset while casting to the laptop (point at a stud, ask "what's wrong?"). Then about 2 min on the laptop:
    - the messy source data
    - the hybrid query with Jina reranking
    - the agent's tool calls in Agent Builder
    - the `place_order` Workflow run
    - the order arriving in `cutonce-orders` and the supplier inbox
  - **OpenAI (B or D presents):** the working product, where the API is used (speech-to-text, tool-calling brain), and one concrete Codex win from `CODEX_LOG.md`.
- **Winners** are contacted by phone or email and must be at Lazaridis Hall by 1:45 PM Sunday. Keep the Devpost phone number reachable.

## 9. Open questions

1. Which teammate owns which pillar?
2. The Elastic cluster version and Jina inference IDs (confirm at the booth).
3. Which domain name and TLD (must be a GoDaddy Registry TLD).
4. Wall or shed for judging: wall by default, shed if there's floor space.

## Sources

- Hardware: UploadVR's Quest 3S specs and Quest Browser depth hit-test coverage; Meta's WebXR mixed reality docs.
- Web tooling: Meta's IWER; three.js `WebXRDepthSensing` docs.
- Elastic: Agent Builder docs (MCP server, programmatic access, models); Workflows GA 9.4; Jina on EIS; hybrid search with `semantic_text`.
- OpenAI docs: `gpt-5.6-luna`, `gpt-transcribe`, and the Responses API MCP tool.
- ElevenLabs docs: models and WebSocket streaming.
- Reference projects: xr-drilling-assistant, SiteXR, QuestCameraKit, passtracing.
