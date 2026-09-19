# E7 massing model (offline pipeline)

Turns Perkins&Will's published floor plans of the University of Waterloo Engineering 7 building into a stacked
3D massing model and a floor-by-floor build sequence, for the pre-rendered "vision" video. It shares nothing
with the live demo at runtime except the `Plan` and `BuildEvent` schemas.

**Caption that must be on screen whenever this model is shown:**

> Generated from Perkins&Will's published E7 drawings. Heights estimated from the section. Interiors simplified.

## Run it

```bash
python3.11 -m venv tools/e7/.venv            # once; .venv is git-ignored (about 160 MB)
tools/e7/.venv/bin/pip install --no-cache-dir -r tools/e7/requirements.txt
tools/e7/.venv/bin/python tools/e7/run_all.py
```

`run_all.py` runs `00` to `03`, the benchmark, `04` to `06`, and then `check.py`. Nothing is interactive: every hand-entered number is read
from `e7_overrides.yaml`. Expected last lines: `schema ok`, `rests_on ok`, `nodes match`, a table of 8 levels,
`CHECK PASSED`. Then, from the repo root: `pnpm pm validate data/e7/out/e7.plan.json`.

| Script | Does | Writes |
|---|---|---|
| `00_fetch.py` | downloads the 8 level plans, the section and the site plan (skips files already there) | `data/e7/raw/*` + `manifest.json` (url, sha256, bytes, retrieved_at) |
| `01_scale.py` | px per metre per sheet from the 0 m and 20 m ticks of the scale bar | `stages/scale/scale.json`, `L0N.overlay.png` |
| `02_footprints.py` | E7 outline per level, pixels to metres in one shared frame; shapely validity and area checks | `floors/L0N.json`, `stages/footprints/L0N.geom.png` + `L0N.overlay.png` |
| `03_heights.py` | floor-to-floor heights from the section (`estimated_from_section`) | `stages/heights/heights.json`, `heights.geom.png` + `heights.overlay.png` |
| `04_plan.py` | the `Plan`: 8 slabs, 8 envelopes, 1 roof; one step per part | `out/e7.plan.json` |
| `05_mesh.py` | extrudes each footprint; one GLB node per part, **node name = part_id**, coordinates baked into vertices | `out/e7.glb`, `stages/mesh/massing.geom.png` |
| `06_events.py` | one planned `missing -> built` event per part, spaced by the step minutes | `out/e7.events.json` (JSON array) |
| `check.py` | JSON Schema validation, `rests_on` and step logic, GLB node names and bounds, per-level table | exit code |

## Accuracy benchmark

`benchmark.py` (also `pnpm e7:benchmark`) measures the model against sources that did not produce it: OpenStreetMap's
outline of the building (way 382735686) and the Ontario lidar roof heights, both committed with their licences. It
never reads the drawings, so CI runs it (`--check` fails when the committed numbers no longer match the model). Its
errors become each part's accuracy tags in `04_plan.py` (`source`, `tolerance_m`, `basis`), which the headset draws
(dashed when the tolerance is above 5 cm) and the copilot can quote. Current score:

| Measure | Model | Reference | Error |
|---|---|---|---|
| Outline overlap (IoU) after a rigid fit | | OpenStreetMap | 0.887 |
| Outline edge distance | | OpenStreetMap | mean 2.81 m, 90% within 4.34 m |
| Outline area | 3584 m² | 3877 m² | -7.6% |
| Scale (if left free) | | | 1.006 (the scale bars were read well) |
| Roof heights, 12,055 lidar pixels | | Ontario lidar, 0.5 m | median 2.25 m, bias -2.21 m |
| Main roof | 30.11 m | 30.62 m | |
| Penthouse | 34.18 m | 36.47 m | the section does not show it |
| Levels | 8 | 8 | |
| Gross floor area | 27304 m² | 21368–22483 m² | +21.4% (atrium and voids counted as floor) |

What it shows: the west edge sits about 5 m inside the real one (the atrium is traced too narrow), the penthouse is
about 2 m too low, and the main roof is right to half a metre. Pictures: `data/e7/stages/benchmark/`.

## Loading the drawings into the server

`pnpm e7:install` uploads all 14 published drawings (the 8 level plans, the section, the site and context plans and
three Engineering 5 sheets) through the normal upload route, downloading any this machine lacks, and makes E7 the
current run. `data/e7/drawings.json` lists them with their hashes; their hashes are in
`data/demo/known_hashes.json`, so each upload replays the approved E7 plan, whose parts cite these documents.

## Re-click (about 40 minutes for everything)

```bash
tools/e7/.venv/bin/python tools/e7/01_scale.py --click            # 2 clicks per sheet: 0 m tick, 20 m tick
tools/e7/.venv/bin/python tools/e7/02_footprints.py --click       # E7's outline corners, in order, per level
tools/e7/.venv/bin/python tools/e7/02_footprints.py --click --level 8   # just one level
tools/e7/.venv/bin/python tools/e7/03_heights.py --click          # 2 scale points on the section, the same 2 on the L03 plan, then 10 y clicks
tools/e7/.venv/bin/python tools/e7/run_all.py                     # rebuild everything from the new numbers
```

A matplotlib window opens (`plt.ginput`): left click adds a point, right click undoes, Enter finishes. The
clicks are written back into `e7_overrides.yaml`, the stage is time-stamped under `clicked_by_person`, and
from then on the plan's `provenance` says the numbers were clicked by a person. You can also just edit the YAML.

What to click in `02`: **E7 is the EAST bar plus the atrium.** The sheets never label Engineering 5; the only
label is "EXISTING ENGINEERING 6" on the far right. The WEST wing of the main complex is the existing
Engineering 5 (the Level 7 sheet marks it "existing roof"). Leave out the west wing, the box north of it, the
bridge to Engineering 6 and the curved footbridge.

What to click in `03`: the section is a perspective render. Click the two scale points on the **back wall**
(two column centre-lines far apart), then the same two columns on the plan, and read every floor line on that
same back wall (bottom edge of each storey's glazing). Do not use the cut end walls for scale: they are closer
to the camera and about 10 % larger.

## What is hand-entered (all of it is in `e7_overrides.yaml`)

- the two scale-bar points per sheet, and the shared pixel origin `(802, 445)`
- the E7 outline corners on each of the 8 levels, and the decision about which wing is E7
- the section's scale reference points, ground line, 7 floor lines, roof base and roof top
- assumptions that no drawing gives us: slab thickness 0.3 m (`common.py`), the level 8 / roof split, the planned
  durations and start date (they only space the animation)

**Status of the numbers right now:** first pass, estimated by eye by an AI assistant from zoomed, gridded crops
and snapped to the nearest heavy wall line. No person has clicked them yet, and the plan's `provenance` says so.

## Frame

Right-handed, +Y up, metres. Image x (right) -> model +X, image y (down) -> model +Z, height -> +Y, so the plan
is not mirrored when seen from above. Origin: plan pixel `(802, 445)` (E5/E7 party-wall line x north face of the
E7 bar), Y = 0 at Level 1 finished floor. The sheets' north arrow points about 25 degrees clockwise from "up", so +X is
roughly east-south-east. Slab N spans `[E_N - 0.3, E_N]`, envelope N spans `[E_N, E_(N+1) - 0.3]`, where `E_N` is the
floor line read from the section.

## Copyright rule

The drawings are (c) Perkins&Will, published on ArchDaily. They are inputs, never outputs.

| Path | In git? |
|---|---|
| `data/e7/raw/**` (the downloaded drawings, `manifest.json`) | **no** (git-ignored) |
| `data/e7/stages/**/*.overlay.png` (our lines over their drawing pixels) | **no** (git-ignored; shown briefly in the video with credit) |
| `data/e7/stages/**/*.geom.png`, `*.json` (our geometry on a blank background) | yes |
| `tools/e7/e7_overrides.yaml`, `data/e7/floors/`, `data/e7/out/` | yes |
