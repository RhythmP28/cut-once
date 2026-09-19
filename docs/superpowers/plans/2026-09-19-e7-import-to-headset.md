# E7 Drawings → Detailed, Anchored Hologram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the whole Litematica flow on a real building: import the published E7 floor plans, turn them into a plan with every room, wall, door (leaf, frame, handle), column, stair, curtain-wall bay and the roof, and show it in the headset twice: as a tabletop 4D model and as a 1:1 overlay of one surveyed zone inside the real E7, aligned well enough that a hologram door handle sits on the real one.

**Architecture:** Detail is *detected* from the plates by classical image processing (proved in this session, numbers below), *corrected* by a person through a committed corrections file, *generated* into meshes by rules, and *tagged* per part with where each number came from and how far off it can be. One plan file feeds three exports: a per-part GLB (web, search, zone), a merged tabletop GLB (few draw calls), and a zone GLB (full door hardware). The headset places the tabletop model with a ray and an anchor, and the zone with a long-baseline two-point touch alignment. Drawings alone cannot reach door-handle accuracy (one pixel is 42 mm), so the zone is refined from a 15-minute on-site survey and the residual is measured and shown.

**Tech stack:** Python 3.11 · numpy · OpenCV (`opencv-python-headless`) · shapely 2 · trimesh 4 · pytest · existing `tools/e7` · Node 22 / Fastify / Vitest · three.js 0.171 · Unity 6000.6.2f1, URP 17.6, Meta XR Core + MRUK 205, glTFast.

**Spec:** `reports/E7 detailed 3D hologram from drawings.md` (sources, lidar, draw-call budgets), `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` §5 (alignment), §7 (E7), §8 (visual states), §14 (API), and the scope decisions of 2026-09-19 ~04:00 (no QR sheets; tap/voice is truth; per-part `source` + `tolerance_m` tags).

## Global Constraints

- **Feature freeze Sun 2026-09-20 00:00 EDT. E7 model freeze Sat 19:00.** If a gate below fails, the fallback listed beside it ships. The 17-part massing model (`data/e7/out/e7.plan.json`) is never deleted: it is Tier 0.
- **Perkins&Will pixels never enter git.** Plates live in `data/e7/raw/` (git-ignored). Committed outputs are geometry only. Tests run on synthetic plates drawn by our own code.
- **No schema change.** Tags go in `Part.external_ids` (string → string): `source` ∈ `drawings | lidar | photos | measured | assumed | inferred`, `tolerance_m` (decimal string or `unknown`), `basis` (one sentence), `reviewed` (`auto` | `reviewed`).
- **IDs** match `^part_[a-z0-9_]+$`, are unique, and are stable across re-runs (room and door ids come from centroid position, not detection order).
- **Frame** is the existing one: right-handed, +Y up, metres, origin at plate pixel (802, 445) in the 2000 px frame; +X = drawing right, +Z = drawing down. On the 3438 px originals multiply pixel coordinates by `width / 2000` (≈ 1.719).
- **Every hand-entered number is in a committed YAML file** (`e7_overrides.yaml`, `e7_corrections.yaml`, `e7_zone_survey.yaml`). Re-running the pipeline re-detects and then re-applies them.
- **Quest 3 budgets** (Meta's guidance for a busy app: 200–300 draw calls; the research report's allowance for the building: 150 draw calls, 300k triangles): tabletop GLB ≤ 80 nodes and ≤ 150k triangles; zone GLB ≤ 150 nodes and ≤ 100k triangles. `check_detail.py` asserts both.
- **`apps/quest` belongs to the Sim session until its scaffold is committed.** Unity tasks here (U1–U5) start only after that commit lands on `main`.
- **Codex:** Tasks 1–7 are self-contained with tests. Implement them with Codex and log each in `CODEX_LOG.md` (OpenAI prize; the log has 0 entries and `codex` is not installed on this Mac: `npm install -g @openai/codex`, sign in with ChatGPT). For that reason this plan gives each of those tasks its failing tests, interfaces and algorithm, and leaves the implementation to Codex. That is a deliberate departure from "code in every step".

---

## 1. What the other two sessions are doing (Sat 04:45)

> **Update, Sat 09:50:** the Unity project and the headset build guide are now on `main` (`apps/quest`, see `apps/quest/Assets/CutOnce/README.md`): hologram, point-and-place with a saved anchor, part states, HUD, sync. So the "after the scaffold lands" condition on tasks U1–U5 is met, and U2–U4 build on `AssemblyView`, `AlignmentController` and `PlacementMath` instead of starting from nothing. A mesh part currently draws as its bounds box; U1 (glTFast) replaces that.

| Session | State | Owns | Boundary for this plan |
|---|---|---|---|
| **Infra** | Idle. Merged Rhythm's copilot into `main` (`dc87c79`), fixed 14 audit findings, compiled the headset copilot code against Meta XR Core + MRUK 205 inside a QuestCameraKit clone with 0 errors. CI green | `services/api`, copilot server, repo hygiene | Free to take Tasks 8–9 (server). Its one open item needs people: API keys in `.env.local`, then `pnpm g0` |
| **Sim** | Running. Building the real Unity project in the `quest-foundation` worktree (`.claude/worktrees/sim-reports/apps/quest`): Unity **6000.6.2f1**, Meta XR Core + MRUK 205, URP 17.6, editor scripts (`QuestSetup`, `QuestChecks`, `QuestBaselineScene`, `Batch`), `BudgetProbe`, `pnpm quest:check / quest:build / quest:install / quest:sim`, a `QuestBaseline` scene with one box per hologram state, Meta XR Simulator as the laptop loop. Android module installed; setup pass re-running. **Nothing committed yet** | `apps/quest`, `tools/quest`, the team plan's Unity version | Do not write under `apps/quest`. glTFast is not in its manifest yet (Task U1 adds it) |
| **This session** | E7 research done; lidar, OSM extracts, full-resolution plates and a generator prototype saved; detection probe run | `tools/e7`, `data/e7`, this plan | Tasks 1–7, 10 |

Loose ends nobody owns: `My project/` (Unity's default template, 1.9 GB, not git-ignored; the disk has 17 GB free); `CODEX_LOG.md` is empty; no OpenAI, ElevenLabs or Elastic keys on this laptop; Jerry and Henry have no commits and have not confirmed their Unity version.

## 2. What "accurate to the door handles" can and cannot mean

Two different things are being asked for, and they have different ceilings.

**A. Content fidelity: every door has a leaf, a frame and a handle, on the correct side.** Achievable for the whole building. The plates draw each door as a leaf line plus a swing arc. The arc's centre is the hinge; the leaf's free end is where the handle goes; the side the arc is on gives the swing. Handle height is not on any drawing, so it is a rule (1.0 m, inside the 900–1100 mm barrier-free range used in Ontario) tagged `assumed` until one is taped on site.

**B. Registration: the hologram handle lands on the real handle at 1:1.** The error chain, link by link:

| Link | Size | Basis |
|---|---|---|
| One plate pixel | **42 mm** | measured: 23.64 px/m on the 3438 px originals |
| Door position along a wall from the plate | ±40–80 mm | ±1–2 px on the swing's bounding box |
| Drawing vs as-built | unknown, typically tens of mm | a 1:500 presentation plan is not a survey |
| Two-point alignment, yaw error | θ ≈ √2·e / b | e = touch error per point, b = distance between the two points |
| … with e = 5 mm, b = 0.9 m (one door) | 7.9 mrad → **79 mm at 10 m** | too coarse |
| … with e = 5 mm, b = 8.7 m (two columns, one bay apart) | 0.8 mrad → **8 mm at 10 m** | good |
| Headset tracking away from its anchor | grows with distance; Meta advises keeping content within about 3 m of its anchor | one anchor per door cluster |

**Conclusion (logic, not opinion):** the information needed for ±1 cm is not in the pixels, so no vectorizer, model or amount of compute can produce it from these drawings. Door-handle registration is reachable only where we add measurements. So: the whole building is drawn-accurate (±0.1 m, tagged), and **one zone** (a corridor stretch with 3–5 doors near the judging table) is survey-accurate (±5–10 mm, tagged `measured`), aligned on two far-apart column corners, and proven by touching the controller tip to three real handles and showing the residual in the HUD. That residual is the accuracy demo.

## 3. Decisions at a glance

Every row: the options considered, the pick, why, and how the pick is validated.

| # | Decision | Options considered | Pick | Why (evidence) | Validated by |
|---|---|---|---|---|---|
| D1 | Source pixels | 2000 px `large_jpg` · 3438 px `original` · super-resolution · UW Plant Ops CAD | **Originals** | 1.72× for free (door 21 px instead of 12). Super-resolution only helped CubiCasa under 800 px and has no evidence on line drawings. Plant Ops needs a WatIAM login | `load_plate` asserts width ≥ 3400 |
| D2 | Vectorizer | Classical CV · learned (CubiCasa5K, Raster2Seq, Yytsi UNet) · frontier VLM · full manual trace | **Classical + human corrections**; VLM only to suggest room types | **Probe, this session, Level 3, 40 lines:** 88 rooms ≥ 2 m², 46 door swings with widths 0.80–1.10 m, no false doors visible, about half the doors found, in under 2 s. Learned models expect 256–512 px residential plans, need CUDA, door IoU 53.6. VLMs: wall F1 0.47 at tight tolerance, door counts right 39% of the time. Manual: 4–7 person-hours | Tasks 1–3 tests; acceptance run on real plates |
| D3 | Rooms | Free-space connected components · wall-centreline graph + polygonize | **Components** | A door drawn as leaf + arc seals its opening, so rooms come out closed with no gap-bridging step. Seen in the probe: offices, labs, tiers of the lecture hall all separate | Room area sum within 25% of footprint minus voids |
| D4 | Walls | Centreline + assumed thickness · **footprint − rooms − swings − voids** | **Subtraction** | Wall thickness and door openings come from the drawing for free; no skeleton or Hough step. Thin regions between a wall's two drawn lines are classed `wall_cavity` by thickness (2·area/perimeter < 0.35 m) and folded into the wall | Wall mass area 8–20% of floor area |
| D5 | Doors | Swing components · arc detection (Hough) · template match · VLM count | **Swing components first, arc detector for the rest, clicks for leftovers** | Probe failure mode: light-grey arcs that do not seal (offices west of the east corridor). An arc of radius 0.75–1.1 m is a strong, rotation-limited shape | ≥ 85% of hand-counted Level 3 doors after both detectors; the rest are `add_doors` clicks |
| D6 | Stairs, elevators | Tread-line detection · **grey fill** | **Grey fill (value 200–230)** then tread count | Cores are the only light-grey fills on the plates | Level 3 finds 5 stair cores and the elevator bank |
| D7 | Windows | Per-window detection · **mullion rule on exterior wall runs** | **Rule**: bay ÷ n, n from photo count, else 6 (≈ 1.45 m) | The envelope is a unitized curtain wall; there are no discrete windows to detect | Tag `photos` when counted, else `assumed` |
| D8 | Heights | Section only · **section checked by Ontario lidar** | **Both** | Lidar (0.5 m, OGL-Ontario) reads terrace ≈ 31.0 m and penthouse ≈ 36.5 m; today's model top is ≈ 3 m low | `check_detail.py`: roofs within 1 m of lidar |
| D9 | Room types | Rules · VLM on crops · none | **Rules**, VLM optional behind a key | The plates carry no room names. Rules cover corridor (largest connected), office (6–20 m² on the perimeter), lecture tier, core, void. VLM crop labelling is unmeasured, so it may only fill `kind` with `source: inferred` | Spot check 20 rooms on Level 3 |
| D10 | Human correction | React editor · Inkscape SVG round trip · **corrections YAML + matplotlib clicks** | **YAML + clicks** | Same mechanism as `e7_overrides.yaml`: deterministic re-runs, every human edit visible (the honesty story), no SVG parsing risk, no UI to build | Re-run yields identical ids; corrections re-apply |
| D11 | Level of detail | One GLB · **three exports from one plan** | **parts / tabletop / zone** | At 1:200 a door handle is 0.6 mm and a mullion 0.35 mm: below a pixel, they shimmer. One GameObject per part would be ~2,500 draw calls against a 150 budget | Node and triangle asserts |
| D12 | Tabletop per-part state | Element id in UV2 + lookup texture · **group nodes only** | **Group nodes** (floor × system, ~60) for reveal; per-part *picking* by AABB in C# | glTFast keeping a second UV set is unverified; group reveal needs no new shader. Per-part colour at tabletop is P2 | `BudgetProbe` ≤ 80 draw calls for E7 |
| D13 | Import path | Offline + boot seed · **upload → server runs the pipeline → review → approve → `plan_ready`** | **Boot seed is P0; live upload job is P1** | The probe runs a floor in < 2 s and the mesh prototype builds in 0.24 s, so the full pipeline fits in about a minute: it can honestly run live on upload, with committed corrections re-applied | Task 9 test with a fake spawn; manual run |
| D14 | Headset load | Bundle in StreamingAssets · **HTTP from `/v1/plans/:id/assets/:name`, bundle as fallback** | **Both** | Route and bearer auth exist; offline mode is a demo requirement | Simulator loads with the server stopped |
| D15 | Tabletop placement | Ray-place + anchor | same | Blueprint §5 "upload mode without a real object" | Walk 5 m away and back: ≤ 2 cm |
| D16 | Zone alignment | QR (dropped) · two-point touch on a door · **two-point touch on two column corners ≥ 8 m apart + third-point check** · MRUK room-scan fit · vision PnP | **Long-baseline touch**; MRUK fit is P2 | §2 arithmetic: 8 mm vs 79 mm at 10 m. The solver (`SolveTwoPoint`, `RefineThreePoint`, `WorstResidual`) already exists. MRUK fit needs Space Setup and cannot scan an atrium. PnP is research-grade | Third-point residual ≤ 20 mm; handle residuals shown |
| D17 | Zone accuracy source | Drawings only · phone RoomPlan scan · controller-tip survey tool · **tape measure → YAML** | **Tape** (15 min, deterministic); controller-tip survey is P2 | §2: the pixels cannot give ±1 cm. RoomPlan needs a LiDAR iPhone and an export path we have not tested | Handle residual ≤ 15 mm on 3 doors |

## 4. Output contract

```
data/e7/floors/L0N.detail.json      geometry only, committed        (Task 3)
tools/e7/e7_corrections.yaml        every human edit                (Task 4)
tools/e7/e7_zone_survey.yaml        the taped numbers               (Task 7)
data/e7/out/e7_detail.plan.json     plan_id plan_e7_detail, ~2,500 parts, ~60 steps
data/e7/out/e7_parts.glb            one node per part_id (shape.uri of every part)
data/e7/out/e7_tabletop.glb         ≤ 80 nodes named grp_l03_walls …; no handles, frames, mullion geometry
data/e7/out/e7_tabletop.index.json  {groups: {grp: [part_id…]}, parts: {part_id: {group, aabb: [[x,y,z],[x,y,z]]}}}
data/e7/out/e7_zone.glb             per-part nodes inside the zone box, with leaf, frame and handle
data/e7/out/e7_detail.events.json   one planned event per part, in step order
data/e7/out/e7_detail.assets.json   ["e7_tabletop.glb","e7_tabletop.index.json","e7_zone.glb"]
```

Part ids (N = level, two digits): `part_e7_lNN_slab`, `…_col_<gx><gz>`, `…_wall_<gx><gz>` (wall mass cut by grid bay), `…_room_x<dm>_z<dm>` (centroid in decimetres), `…_door_x<dm>_z<dm>`, `…_door_x<dm>_z<dm>_handle` (zone doors only), `…_stair_<k>`, `…_cw_<side>_<bay>_frame|glass`, `part_e7_roof_penthouse`, `part_e7_roof_tooth_<k>_frame|glass`.

Steps are per floor × system in construction order (columns N → slab N+1; walls and stairs follow their slab; curtain wall trails structure by two floors; doors after walls; roof last). `rests_on` follows the same graph, and each part's bounds touch its target within 2 mm (validator V4).

## 5. File structure

```
tools/e7/detail/__init__.py
tools/e7/detail/plate.py        load a plate, px ↔ metres
tools/e7/detail/components.py   ink mask, free-space components, classes
tools/e7/detail/doors.py        doors from swings, doors from arcs
tools/e7/detail/rooms.py        room polygons, stable ids, type rules
tools/e7/detail/structure.py    columns + grid lines, grey cores, wall mass
tools/e7/detail/corrections.py  apply e7_corrections.yaml
tools/e7/detail/lidar.py        zone heights from the lidar grid
tools/e7/detail/elements.py     mesh builders (slab, wall, door family, stair, curtain wall, roof)
tools/e7/detail/planbuild.py    parts, steps, tags
tools/e7/07_detect.py           stage: plates → floors/L0N.detail.json + overlays
tools/e7/08_review.py           stage: click tool that writes corrections
tools/e7/09_heights_lidar.py    stage: lidar check → stages/heights/lidar.json
tools/e7/10_detail_plan.py      stage: → e7_detail.plan.json + events
tools/e7/11_detail_mesh.py      stage: → three GLBs + index
tools/e7/check_detail.py        gates
tools/e7/tests/synth.py         synthetic plate + ground truth
tools/e7/tests/test_*.py
services/api/src/boot.ts                       seed every data/e7/out/*.plan.json + extra assets   (Task 8)
services/api/src/reconstruction/buildingJob.ts upload → pipeline → draft                            (Task 9)
apps/quest/Assets/CutOnce/Building/*           U1–U5, after the scaffold lands
```

## 6. Schedule, gates, fallbacks

| Gate | By (Sat) | Pass condition | If it fails |
|---|---|---|---|
| E1 | 08:00 | Tasks 1–3 green on synthetic plates; Level 3 real plate: ≥ 80 rooms, ≥ 40 doors | Ship Tier 1 "shell" from the research report (no rooms) |
| E2 | 11:00 | All levels detected; Level 3 and Level 1 corrected; `check_detail.py` passes; `/preview` shows the per-part GLB | Rooms and doors on Level 3 only; other floors shell |
| — | 14:00 | **Devpost prize lock** (people) | — |
| E3 | 13:00 | Tabletop GLB loads in the Meta XR Simulator from the server, reveals by group, ≤ 80 draw calls | Tabletop shows the massing model; detailed model appears in the video and on `/preview` |
| E4 | 16:00 | Zone surveyed, zone GLB built, long-baseline alignment on the device, third-point residual ≤ 20 mm | Zone becomes a ray-placed 1:1 walk-in with no accuracy claim |
| E5 | 19:00 | **Model freeze.** Handle residuals recorded on 3 doors | Whatever passed last ships |

People, in parallel: tape survey (15 min, anyone), one riser and one mullion count (photo walk, 25 min), choose the zone (Michael), keys in `.env.local`, install Codex.

---

## Tasks

### Task 1: Synthetic plate and free-space components

**Files:** Create `tools/e7/detail/__init__.py`, `tools/e7/detail/plate.py`, `tools/e7/detail/components.py`, `tools/e7/tests/__init__.py`, `tools/e7/tests/synth.py`, `tools/e7/tests/test_components.py`. Modify `tools/e7/requirements.txt` (add `opencv-python-headless>=4.9`, `pytest>=8`).

**Interfaces — Produces:**
```python
# plate.py
@dataclass(frozen=True)
class Plate: level: int; gray: np.ndarray; px_per_m: float; origin_px: tuple[float, float]
def load_plate(level: int) -> Plate            # RAW/original/o_LEVEL_0N_PLAN_1-500-01.jpg; asserts width >= 3400
def to_m(plate: Plate, x_px: float, y_px: float) -> tuple[float, float]   # (x_m, z_m)
# components.py
KINDS = ("room", "door_swing", "wall_cavity", "tiny", "outside")
@dataclass
class Component: label: int; kind: str; area_m2: float; bbox_px: tuple[int, int, int, int]; thickness_m: float
def ink_mask(gray: np.ndarray, thresh: int = 150) -> np.ndarray          # uint8 0/1, dilated 2x2
def free_components(gray: np.ndarray, px_per_m: float) -> tuple[np.ndarray, list[Component]]
```
Algorithm (from the probe, `tools/e7/proto/probe_rooms.py`): ink = gray < 150, dilate 2×2; label the complement with 4-connectivity; a component touching the image border is `outside`; area < 0.15 m² is `tiny`; thickness = 2·area/perimeter < 0.35 m is `wall_cavity`; area 0.25–1.0 m², bounding box 0.6–1.25 m on both sides, aspect 0.75–1.33, fill 0.62–0.90 is `door_swing`; area ≥ 2 m² is `room`; anything else is `tiny`.

- [ ] **Step 1: Write the synthetic plate** (`tools/e7/tests/synth.py`). It is our own drawing, so it can be committed and run in CI.

```python
"""A small plan drawn the way the E7 plates are drawn: thin dark lines, doors as leaf + arc, dark column squares,
light-grey cores, a dashed void. Returns the image and what a perfect detector would find."""
import numpy as np
from PIL import Image, ImageDraw

PXM = 24.0  # px per metre, close to the real plates' 23.64

def m(v: float) -> int: return int(round(v * PXM))

def plate():
    W, H = m(34), m(20)
    im = Image.new("L", (W, H), 255); d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = m(2), m(2), m(32), m(18)
    for off in (0, 5):                                   # exterior wall: two lines 5 px apart (a wall cavity)
        d.rectangle([x0 - off, y0 - off, x1 + off, y1 + off], outline=40, width=2)
    yc0, yc1 = m(9), m(11)                               # corridor 2 m wide through the middle
    doors = []
    for side, yw, into in (("n", yc0, -1), ("s", yc1, +1)):
        for k in range(3):                               # three offices per side, 10 m wide
            xa, xb = x0 + m(10) * k, x0 + m(10) * (k + 1)
            if k: d.line([xa, y0 if into < 0 else yw, xa, yw if into < 0 else y1], fill=40, width=2)
            xh, w = xa + m(1.0), m(0.9)                  # door: gap, leaf, arc
            d.line([xa, yw, xh, yw], fill=40, width=2); d.line([xh + w, yw, xb, yw], fill=40, width=2)
            d.line([xh, yw, xh, yw + into * w], fill=40, width=2)
            if not (side == "s" and k == 2):             # the plates draw a threshold across most openings, which seals
                d.line([xh, yw, xh + w, yw], fill=40, width=1)   # the swing; the last door has none (the probe's failure mode)
            box = [xh - w, yw - w, xh + w, yw + w]
            d.arc(box, 0, 90, fill=40, width=2) if into > 0 else d.arc(box, 270, 360, fill=40, width=2)
            doors.append({"hinge_px": (xh, yw), "width_m": 0.9})
    cols = [(x0 + m(10) * i, y) for i in range(4) for y in (yc0, yc1)]
    for cx, cy in cols: d.rectangle([cx - 8, cy - 8, cx + 8, cy + 8], fill=90)
    core = [x1 - m(4), y0 + m(1), x1 - m(1), y0 + m(6)]  # grey stair core with treads, inside office n3
    d.rectangle(core, fill=215, outline=40, width=2)
    for t in range(1, 10): d.line([core[0], core[1] + t * m(0.5), core[2], core[1] + t * m(0.5)], fill=40, width=1)
    truth = {"rooms": 7, "doors": 6, "sealed_doors": 5, "door_width_m": 0.9, "columns": 8, "cores": 1,
             "office_area_m2": 10 * 7, "corridor_area_m2": 30 * 2}
    return np.array(im), truth
```

- [ ] **Step 2: Write the failing test** (`tools/e7/tests/test_components.py`)

```python
from tools.e7.detail.components import free_components, ink_mask
from tools.e7.tests.synth import plate, PXM

def test_rooms_swings_and_cavity_are_separated():
    gray, truth = plate()
    labels, comps = free_components(gray, PXM)
    kinds = [c.kind for c in comps]
    assert kinds.count("door_swing") == truth["sealed_doors"]
    assert kinds.count("room") == truth["rooms"] - 1      # the unsealed office is still joined to the corridor; Task 3 seals it
    assert kinds.count("wall_cavity") >= 1                # the gap between the exterior wall's two lines
    assert labels.shape == gray.shape

def test_door_swings_are_door_sized():
    gray, truth = plate()
    _, comps = free_components(gray, PXM)
    for c in (c for c in comps if c.kind == "door_swing"):
        w = max(c.bbox_px[2], c.bbox_px[3]) / PXM
        assert abs(w - truth["door_width_m"]) < 0.12

def test_ink_mask_is_binary():
    gray, _ = plate()
    mask = ink_mask(gray)
    assert set(map(int, set(mask.ravel().tolist()))) <= {0, 1}
```

- [ ] **Step 3: Run it and see it fail.** `tools/e7/.venv/bin/pip install -r tools/e7/requirements.txt && tools/e7/.venv/bin/python -m pytest tools/e7/tests/test_components.py -q` → `ModuleNotFoundError: tools.e7.detail.components`. The grey core's tread strips are under 2 m², so they fall to `tiny` here; Task 3 owns cores.
- [ ] **Step 4: Implement with Codex** to the interface and algorithm above; re-run until green. Log it in `CODEX_LOG.md`.
- [ ] **Step 5: Commit.** `git add tools/e7/detail tools/e7/tests tools/e7/requirements.txt && git commit -m "feat(e7): free-space components on a synthetic plate"`

### Task 2: Doors (swings, arcs, hinge and handle side)

**Files:** Create `tools/e7/detail/doors.py`, `tools/e7/tests/test_doors.py`.

**Interfaces — Consumes:** `free_components`, `ink_mask`. **Produces:**
```python
@dataclass
class Door: door_id: str; hinge_px: tuple[float, float]; strike_px: tuple[float, float]; width_m: float; swing: str; source: str
# swing in {"cw", "ccw"} seen from above; source in {"swing", "arc", "manual"}
def doors_from_swings(labels: np.ndarray, comps: list[Component], px_per_m: float) -> list[Door]
def doors_from_arcs(ink: np.ndarray, px_per_m: float, known: list[Door]) -> list[Door]
def door_id(hinge_m: tuple[float, float]) -> str        # "x123_z045": hinge position in decimetres, zero-padded to 3
```
Algorithm: a swing component is a quarter disc. Its hinge is the bounding-box corner whose two adjacent edges are both fully inside the component (the right angle); the strike is the far end of the straight edge that lies along the wall (the edge with ink beyond it for ≥ 0.3 m on both sides of the opening); `width_m` = hinge→strike distance. `doors_from_arcs`: `cv2.HoughCircles` on the ink for radii 0.75–1.10 m, keep circles where 20–30% of the circumference is ink (a quarter arc) and a straight ink line of the same length leaves the centre; drop any whose hinge is within 0.4 m of a known door.

- [ ] **Step 1: Failing test**

```python
import math
from tools.e7.detail.components import free_components, ink_mask
from tools.e7.detail.doors import doors_from_swings, doors_from_arcs, door_id
from tools.e7.tests.synth import plate, PXM

def test_hinges_land_on_the_drawn_hinges():
    gray, truth = plate()
    labels, comps = free_components(gray, PXM)
    doors = doors_from_swings(labels, comps, PXM)
    assert len(doors) == truth["sealed_doors"]
    doors += doors_from_arcs(ink_mask(gray), PXM, doors)
    assert len(doors) == truth["doors"]
    for want in truth_hinges():
        assert min(math.dist(want, d.hinge_px) for d in doors) <= 3          # pixels
    assert all(abs(d.width_m - 0.9) < 0.1 for d in doors) and sorted(d.source for d in doors) == ["arc"] + ["swing"] * 5

def truth_hinges():
    from tools.e7.tests.synth import m
    return [(m(2) + m(10) * k + m(1.0), y) for y in (m(9), m(11)) for k in range(3)]

def test_arc_detector_never_duplicates_a_known_door():
    gray, _ = plate()
    labels, comps = free_components(gray, PXM)
    known = doors_from_swings(labels, comps, PXM)
    extra = doors_from_arcs(ink_mask(gray), PXM, known)
    assert len(extra) == 1 and all(math.dist(extra[0].hinge_px, k.hinge_px) > 0.4 * PXM for k in known)

def test_ids_are_stable_and_valid():
    assert door_id((12.34, 4.56)) == "x123_z046" and door_id((12.34, 4.56)) == door_id((12.341, 4.559))
```

- [ ] **Step 2: Run, see it fail** (`ModuleNotFoundError`). **Step 3: Implement with Codex.** **Step 4: Green.** **Step 5: Commit** `feat(e7): doors from swing regions and arcs`.

### Task 3: Rooms, columns, cores, wall mass → `L0N.detail.json`

**Files:** Create `tools/e7/detail/rooms.py`, `tools/e7/detail/structure.py`, `tools/e7/07_detect.py`, `tools/e7/tests/test_rooms_structure.py`.

**Produces:**
```python
@dataclass
class Room: room_id: str; polygon_px: list[tuple[float, float]]; area_m2: float; kind: str; source: str
def seal_openings(gray: np.ndarray, doors: list[Door]) -> np.ndarray      # draws hinge→strike in ink for every door whose source is not "swing"
def rooms_from_components(labels, comps, px_per_m) -> list[Room]      # cv2.findContours → approxPolyDP(eps = 0.08 m) → shapely valid
def classify(room: Room, footprint, cores) -> str                     # corridor | office | lecture_tier | core | room
def columns(gray, px_per_m) -> list[tuple[float, float, float]]       # (x_px, y_px, size_m): solid squares, value < 120, 0.4–1.0 m
def grid_lines(cols_m: list[tuple[float, float]]) -> tuple[list[float], list[float]]   # cluster within 0.5 m
def cores_from_grey(gray, px_per_m) -> list[dict]                     # value 200–230, area >= 6 m2: {"bbox_px", "kind", "treads"}
def wall_mass(footprint, rooms, swings, voids) -> shapely.MultiPolygon # footprint − everything free, opened by 0.12 m
```
`07_detect.py --level N` writes `data/e7/floors/L0N.detail.json` (metres, keys `rooms, doors, columns, grid, cores, wall_mass, voids`), a geometry-only `stages/detail/L0N.geom.png` (committable) and `raw/probe/L0N.overlay.png` (plate pixels, ignored).

- [ ] **Step 1: Failing test**

```python
from tools.e7.detail.components import free_components
from tools.e7.detail.rooms import rooms_from_components
from tools.e7.detail.structure import columns, grid_lines, cores_from_grey
from tools.e7.tests.synth import plate, PXM

def test_sealing_the_arc_door_separates_the_last_office():
    from tools.e7.detail.components import ink_mask
    from tools.e7.detail.doors import doors_from_swings, doors_from_arcs
    from tools.e7.detail.rooms import seal_openings
    gray, truth = plate()
    labels, comps = free_components(gray, PXM)
    doors = doors_from_swings(labels, comps, PXM); doors += doors_from_arcs(ink_mask(gray), PXM, doors)
    labels, comps = free_components(seal_openings(gray, doors), PXM)          # second pass
    rooms = rooms_from_components(labels, comps, PXM)
    assert len(rooms) == truth["rooms"]
    areas = sorted(r.area_m2 for r in rooms)
    assert abs(areas[-1] - truth["office_area_m2"]) / truth["office_area_m2"] < 0.15        # largest is an office, not corridor+office
    assert len({r.room_id for r in rooms}) == len(rooms)
    assert all(r.room_id.startswith("x") and "_z" in r.room_id for r in rooms)

def test_columns_and_grid():
    gray, truth = plate()
    cols = columns(gray, PXM)
    assert len(cols) == truth["columns"]
    xs, zs = grid_lines([(x / PXM, y / PXM) for x, y, _ in cols])
    assert len(xs) == 4 and len(zs) == 2

def test_grey_core_found_with_treads():
    gray, truth = plate()
    cores = cores_from_grey(gray, PXM)
    assert len(cores) == truth["cores"] and cores[0]["treads"] >= 8
```

- [ ] **Step 2–4:** run (fails) → Codex implements → green.
- [ ] **Step 5: Acceptance on the real plate** (local only): `tools/e7/.venv/bin/python tools/e7/07_detect.py --level 3` prints `rooms ≥ 80, doors ≥ 40, columns 36–40, stair cores ≥ 4`. Open `data/e7/raw/probe/L03.overlay.png` and hand-count the doors in the top half; record found / total in the commit message.
- [ ] **Step 6: Commit** `feat(e7): rooms, columns, cores and wall mass per level`.

### Task 4: Corrections file and click tool

**Files:** Create `tools/e7/detail/corrections.py`, `tools/e7/08_review.py`, `tools/e7/e7_corrections.yaml`, `tools/e7/tests/test_corrections.py`.

**Produces:** `apply(detail: dict, corrections: dict) -> dict` supporting `delete_rooms`, `merge_rooms`, `split_rooms` (`{room, line_m}`), `add_doors` (`{hinge_m, strike_m, swing}`), `delete_doors`, `set_kind`, `add_voids` (polygon), and `reviewed_by` / `reviewed_at`. Every touched element gets `source: "manual"` or `reviewed: true`; every untouched one keeps `reviewed: false`. `08_review.py --level N` shows the overlay with `plt.ginput` (same interaction as `01_scale.py --click`): `d` + two clicks adds a door, `x` + click deletes the element under the cursor, `m` + two clicks merges two rooms, `v` + polygon adds a void; it appends to the YAML.

- [ ] **Step 1: Failing test**

```python
from tools.e7.detail.corrections import apply

DETAIL = {"rooms": [{"room_id": "x010_z010", "polygon_m": [[0,0],[2,0],[2,2],[0,2]], "area_m2": 4, "kind": "room", "source": "auto"},
                    {"room_id": "x030_z010", "polygon_m": [[2,0],[4,0],[4,2],[2,2]], "area_m2": 4, "kind": "room", "source": "auto"}],
          "doors": [{"door_id": "x020_z000", "hinge_m": [2, 0], "strike_m": [2.9, 0], "width_m": 0.9, "swing": "cw", "source": "swing"}], "voids": []}

def test_merge_delete_add_and_review_flags():
    out = apply(DETAIL, {"merge_rooms": [["x010_z010", "x030_z010"]], "delete_doors": ["x020_z000"],
                         "add_doors": [{"hinge_m": [1, 2], "strike_m": [1.9, 2], "swing": "ccw"}], "reviewed_by": "rhythm"})
    assert len(out["rooms"]) == 1 and abs(out["rooms"][0]["area_m2"] - 8) < 1e-6 and out["rooms"][0]["reviewed"] is True
    assert [d["source"] for d in out["doors"]] == ["manual"] and abs(out["doors"][0]["width_m"] - 0.9) < 1e-6

def test_unknown_ids_fail_loudly():
    import pytest
    with pytest.raises(KeyError): apply(DETAIL, {"delete_rooms": ["x999_z999"]})
```

- [ ] **Step 2–4:** fails → Codex → green. **Step 5: Commit** `feat(e7): corrections file and click review`.
- [ ] **Step 6 (person, not Michael): review Level 3 then Level 1**, about 30 minutes each: add the missed doors, merge split rooms, draw the three atrium voids. Commit the YAML.

### Task 5: Heights checked against lidar

**Files:** Create `tools/e7/detail/lidar.py` (the functions), `tools/e7/09_heights_lidar.py` (the stage that calls them), `tools/e7/tests/test_lidar.py`. Commit `data/e7/lidar/*` and `data/e7/context/*` (open licences) and add to `SOURCES.md`: "Contains information licensed under the Open Government Licence – Ontario" and "© OpenStreetMap contributors (ODbL)".

**Produces:** `zone_heights(ndsm: np.ndarray, zones: dict[str, Polygon], affine) -> dict[str, float]` (median of the pixels inside each polygon); the stage writes `stages/heights/lidar.json` `{terrace_m, penthouse_m, sawtooth_ridge_m, sawtooth_valley_m}`. Registration: two control points shared by the OSM outline (way 382735686) and the plate, stored in `e7_overrides.yaml` under `lidar_control`.

- [ ] **Step 1: Failing test**

```python
import numpy as np
from shapely.geometry import box
from tools.e7.detail import lidar as L

def test_zone_median_ignores_outliers():
    grid = np.full((40, 40), 31.0); grid[10:20, 10:20] = 36.5; grid[0, 0] = 99
    got = L.zone_heights(grid, {"terrace": box(0, 0, 8, 8), "penthouse": box(10, 10, 20, 20)}, affine=(1, 0, 0, 1, 0, 0))
    assert abs(got["terrace"] - 31.0) < 0.01 and abs(got["penthouse"] - 36.5) < 0.01
```

- [ ] **Step 2–4:** fails → Codex → green. **Step 5:** run on the real crop; expect terrace 30–32 m and penthouse 35.5–37.5 m; this settles the research note's conflicting sawtooth reading (22–30.5 m vs 32–35 m). **Step 6: Commit** `feat(e7): roof heights checked against Ontario lidar`.

### Task 6: Elements, plan and the three GLBs

**Files:** Create `tools/e7/detail/elements.py`, `tools/e7/detail/planbuild.py`, `tools/e7/10_detail_plan.py`, `tools/e7/11_detail_mesh.py`, `tools/e7/tests/fixtures.py` (`tiny_building() -> tuple[dict, dict, None]`), `tools/e7/tests/test_planbuild.py`, `tools/e7/tests/test_mesh_exports.py`. Start from `tools/e7/proto/proto_e7.py` (curtain wall, stairs, sawtooth already work there).

**Produces (all return `trimesh.Trimesh` in the plan frame, coordinates baked):**
```python
def slab(outline: Polygon, voids: list[Polygon], y_top: float, t: float = 0.3)
def wall_tile(mass: Polygon, y0: float, y1: float)                       # 2D gaps at doors come from the mass itself
def door_family(width_m: float, height_m: float = 2.1, handle_h_m: float = 1.0, setback_m: float = 0.07, swing: str = "cw") -> dict[str, Trimesh]   # {"frame","leaf","handle"}
def place(mesh, hinge_m, strike_m, y0)                                   # rotate about +Y so local +X runs hinge → strike
def lintel(hinge_m, strike_m, wall_t: float, y_head: float, y_top: float)
def stair(core_bbox_m, y0: float, y1: float, riser_m: float = 0.175)
def curtain_wall(run: LineString, y0: float, y1: float, n_per_bay: int, bay_m: float) -> dict[str, Trimesh]   # {"frame","glass"}
def sawtooth(strip: Polygon, n: int, y_valley: float, y_ridge: float) -> dict[str, Trimesh]
def build_plan(details: dict[int, dict], heights: dict, survey: dict | None) -> dict   # the Plan JSON            (planbuild.py)
def export_all(plan: dict, out_dir: Path) -> None   # e7_parts.glb, e7_tabletop.glb, e7_tabletop.index.json, e7_zone.glb   (planbuild.py)
```
Tags written by `build_plan`: outlines, columns, rooms, walls, doors → `drawings`, `tolerance_m "0.1"`; storey heights → `drawings` + basis "section, checked against lidar", `"1.0"`; roofs → `lidar`, `"0.5"`; mullion count → `photos` or `assumed`; handle height, slab thickness, riser → `assumed`, `"unknown"`; anything in the survey → `measured`, `"0.005"`. Handles are separate parts (`parent_id` = the door, `rests_on` = the door) **only** for doors named in the survey; elsewhere the handle is part of the door's node in `e7_parts.glb` and absent from the tabletop.

- [ ] **Step 1: Failing tests**

```python
import json, re, struct
from pathlib import Path
from tools.e7.detail.planbuild import build_plan
from tools.e7.tests.fixtures import tiny_building      # two levels made from synth.plate() run through Tasks 1–4

ID = re.compile(r"^part_[a-z0-9_]+$")

def test_plan_is_tagged_stable_and_grounded():
    plan = build_plan(*tiny_building())
    ids = [p["part_id"] for p in plan["parts"]]
    assert len(ids) == len(set(ids)) and all(ID.match(i) for i in ids)
    assert [p for p in plan["parts"] if not p["rests_on"]] == [plan["parts"][0]]            # one datum: the L1 slab
    for p in plan["parts"]:
        x = p["external_ids"]
        assert x["source"] in {"drawings", "lidar", "photos", "measured", "assumed", "inferred"} and "tolerance_m" in x and x["basis"]
        assert p["shape"] == {"type": "mesh", "uri": "e7_parts.glb", "node": p["part_id"], "bounds": p["shape"]["bounds"]}
    assert build_plan(*tiny_building())["parts"] == plan["parts"]                          # deterministic
    kinds = {p["kind"] for p in plan["parts"]}
    assert {"slab", "column", "wall", "room", "door", "stair"} <= kinds

def glb_nodes(path: Path):
    b = path.read_bytes(); n = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20 + n])
    tris = sum(j["accessors"][pr["indices"]]["count"] // 3 for m in j["meshes"] for pr in m["primitives"])
    return [x.get("name") for x in j["nodes"] if "mesh" in x], tris

def test_three_exports(tmp_path):
    from tools.e7.detail.planbuild import export_all
    plan = build_plan(*tiny_building()); export_all(plan, tmp_path)
    parts, _ = glb_nodes(tmp_path / "e7_parts.glb"); assert sorted(parts) == sorted(p["part_id"] for p in plan["parts"])
    groups, tris = glb_nodes(tmp_path / "e7_tabletop.glb"); assert len(groups) <= 80 and tris <= 150_000 and all(g.startswith("grp_") for g in groups)
    index = json.loads((tmp_path / "e7_tabletop.index.json").read_text())
    assert set(index["parts"]) == {p["part_id"] for p in plan["parts"] if p["kind"] != "door_handle"}
```

- [ ] **Step 2–4:** fails → Codex → green. Write `tools/e7/tests/fixtures.py` first (it only chains Tasks 1–4 on `synth.plate()` for two levels with heights `{1: 0.0, 2: 4.5, "top": 9.0}`).
- [ ] **Step 5:** `pnpm pm validate data/e7/out/e7_detail.plan.json` → `ok`. Add a Vitest case in `packages/project-model/tests/validate.test.ts` that builds 2,500 mesh parts and asserts `validatePlan` returns in under 2 s (meshes skip the pairwise V3 loop, so it should).
- [ ] **Step 6: Commit** `feat(e7): detailed plan and parts/tabletop/zone exports`.

### Task 7: Zone survey and gates

**Files:** Create `tools/e7/e7_zone_survey.yaml`, `tools/e7/check_detail.py`, `data/e7/zone/README.md` (the one-page tape sheet).

Survey sheet, per door in the zone, all from **datum A** (the chosen corner of the first column), along the wall: hinge-side jamb distance, clear width, leaf height, handle height, handle setback from the leaf edge, handing, frame depth. Plus the A→B distance (the second column corner) and one stair riser. `build_plan` replaces the drawn values for those doors and moves them so that the measured jamb distances hold.

`check_detail.py` fails the build when: a part lacks tags; ids repeat; any level has < 40 rooms or < 25 doors; room area sum is outside 60–95% of the level outline; columns on consecutive levels fail to stack within 0.3 m; a roof differs from lidar by > 1 m; the tabletop or zone exceed the node and triangle budgets; the surveyed A→B distance differs from the model's by > 0.15 m (that difference is reported: it is the measured accuracy of the drawings).

- [ ] Steps: write `check_detail.py` with each rule as a function and a pytest per rule on a hand-made bad plan (one test per rule, asserting the message names the part) → Codex → green → run on real data → commit `feat(e7): survey file and detail gates`.

### Task 8 (server, Infra session): seed every E7 plan and its extra files

**Files:** Modify `services/api/src/boot.ts:16-17` (seed each `data/e7/out/*.plan.json`), `services/api/src/store/store.ts` and `routes/core.ts:22` (allow `.json` asset names), add `services/api/tests/boot-e7.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";
import { auth, makeApp } from "./helpers.js";

it("boot imports every plan in data/e7/out and serves the files its assets list names", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cutonce-repo-")); const out = join(repo, "data", "e7", "out"); mkdirSync(out, { recursive: true });
  cpSync(join(REPO_ROOT, "data", "fixtures", "plan_desk_archetype.json"), join(out, "e7_detail.plan.json"));
  writeFileSync(join(out, "e7_tabletop.index.json"), "{}"); writeFileSync(join(out, "e7_detail.assets.json"), '["e7_tabletop.index.json"]');
  const t = await makeApp({ repoRoot: repo });
  const id = "plan_desk_archetype";
  const res = await t.app.inject({ method: "GET", url: `/v1/plans/${id}/assets/e7_tabletop.index.json`, headers: auth });
  expect(res.statusCode).toBe(200); expect(res.headers["content-type"]).toContain("application/json");
  await t.cleanup();
});
```

- [ ] **Step 2–5:** fails (404) → implement (glob `*.plan.json`; read `<stem>.assets.json` beside the plan and `syncAsset` each name; extend the name pattern to `(glb|gltf|png|jpg|json)` and the content type) → green → commit `feat(api): seed every E7 plan with its extra asset files`.

### Task 9 (server, P1): upload the plates, run the pipeline live

**Files:** Create `services/api/src/reconstruction/buildingJob.ts`, `services/api/tests/building-job.test.ts`; modify `routes/documents.ts` (`POST /v1/reconstructions/building`, multipart, many files), `apps/web/src/upload` (a "Building set" drop zone).

Behaviour: save the uploaded plates into `data/e7/raw/original/`; spawn `tools/e7/.venv/bin/python tools/e7/run_detail.py --json-progress`; each stdout line `{"stage","detail"}` becomes a job stage broadcast on the stream; on exit 0 register `e7_detail.plan.json` as a **draft**, status `needs_review`; approval emits `plan_ready`. The job view states how many committed corrections were re-applied. The spawn function is injected so the test passes a fake that prints three progress lines.

- [ ] Test asserts: three stages recorded in order, draft revision created, non-zero exit marks the job `failed` with the last stderr line, files with names outside `^[A-Za-z0-9_.-]+\.(jpg|png)$` are rejected with 400. Then implement, green, commit `feat(api): building upload runs the E7 pipeline as a job`.

### Task 10: Web preview of the detailed model

**Files:** Modify `apps/web/src/preview/*` to load `e7_tabletop.glb` when the plan has more than 300 parts (one draw call per group, not per part), colour by `external_ids.source` behind a toggle, and show the selected part's tags. Test: `previewParams.test.ts` gains a case for `?plan=plan_e7_detail&tint=source`.

### Unity tasks (after the Sim session's scaffold is on `main`)

**U1 Load.** Add `com.unity.cloud.gltfast` to `Packages/manifest.json`. `BuildingLoader.LoadAsync(planId)`: GET plan, tabletop GLB and index with the bearer token; fall back to `StreamingAssets/e7/`. Build the name → `Transform` map **after** `InstantiateMainSceneAsync` returns. glTFast mirrors X: parent everything under a root whose X is already flipped, the same convention as `AlignmentSolver` ("model points must already be in Unity space").
**U2 Tabletop.** `TabletopView`: ray-place on a surface (MRUK environment raycast), yaw with the stick, lock, `OVRSpatialAnchor`. Scale 1:200 (0.46 m long), 1:100 on a toggle. `GroupReveal` replays `e7_detail.events.json` by mapping each event's part to its group and driving `_RevealY` per group with `Reveal.CutHeight`. `AabbPicker` (pure C#, EditMode-tested): controller ray against the index's AABBs, nearest hit wins → label card with name, kind, area, source, tolerance. "Peel" = hide groups above level N with the thumbstick.
**U3 Zone.** `ZoneView` instantiates `e7_zone.glb` at 1:1 with one `PartView` per node and the normal hologram states; tap marks a part built.
**U4 Long-baseline alignment.** Touch datum A, touch datum B (≥ 8 m apart), `AlignmentSolver.SolveTwoPoint`; touch a third surveyed point, `RefineThreePoint`; accept when `WorstResidual` ≤ 0.020 m (the desk's 0.004 m becomes a parameter). Save one anchor per door cluster so content stays within about 3 m of an anchor.
**U5 Accuracy proof.** `HandleProbe`: controller tip to the nearest `door_handle` part; HUD line "handle 9 mm"; the three readings are posted as `alignment` events so the Director page and Elasticsearch have them.

EditMode tests to write first: `AabbPickerTests` (nearest of two overlapping boxes; miss returns null), `GroupRevealTests` (events for parts in three groups produce three ascending cut heights), `AlignmentToleranceTests` (a 5 mm perturbation at 8.7 m baseline moves a point 10 m away by < 12 mm; at 0.9 m baseline by > 60 mm: the §2 arithmetic as a regression test).

## Risks

| Risk | Likelihood | Response |
|---|---|---|
| Unity scaffold lands late, so E3/E4 slip | High | The model still ships in the video and `/preview`; tabletop falls back to massing |
| Codex not set up, so no OpenAI-prize evidence | High | Install now; if skipped, any agent implements Tasks 1–7 and the prize claim is dropped |
| Light-grey arcs and partitions defeat the threshold on some levels | Medium | Second threshold pass (< 200) excluding the 200–230 core band; then clicks |
| Levels are not registered to each other | Medium | Column stacking check gives a per-level offset |
| The judging spot is far from any surveyed zone | Medium | Pick the zone after the expo map is known; the survey takes 15 minutes |
| 2,500 parts slow the copilot's context packet or the review table | Medium | Packet takes the 40 nearest parts; review table filters by level |
| Public repo + detailed model of a copyrighted building | Low–medium | Keep the repo private until submission, or git-ignore the detailed GLBs. Not legal advice |
| Disk fills (17 GB free, Unity Library folders) | Medium | Move `My project/` out of the repo |

## Only people can do these

Choose the zone · tape survey and riser · mullion count photos · review corrections for Levels 3 and 1 · install Codex and sign in · API keys · confirm Jerry's and Henry's Unity version · Devpost by 14:00.
