# `RoomSense/` — the Zelda room scan (owner: Rhythm, coordinate with A2 before wiring into Main)

Put the headset on and **everything** glows blue — walls, floor, the desk, and the stuff sitting
on the desk — revealed by a sonar pulse from the player, BOTW style.

Two layers from one scan: the **global scene mesh** (a triangle mesh of the whole room, clutter
included) is the base glow, and the labelled anchors (tables, couches, walls) are tinted shapes on
top so furniture reads brighter. `glowEverything` / `glowLabelledShapes` toggle each layer.

Known limit: the scene mesh is a snapshot from scan time — move an object and its glow stays where
it was scanned until a rescan. Live-updating glow on moving objects means a Depth API screen-space
effect instead; that is a bigger build, ask Rhythm first.

## Look at something and it names itself (`GazeInspector`)

Gaze at an object and it lights up hotter than the room glow, with a floating label beside it
giving its name and its measured size in centimetres.

The hard part: the scan is **one mesh** — there is no "bottle object" in it to highlight. So on
load the scan is split into **connected islands** (triangle groups sharing welded vertices). A
bottle standing on a desk is its own island, so gazing at it isolates exactly that bottle.

Real Quest scans are messier: the mesher often fuses the whole room into one island. When the
island being hit is implausibly large (`islandIsObjectBelow`), the component carves out the
triangles whose vertices all sit within `fallbackRadius` of the gaze point instead. Both paths
are covered by the tests below. Selecting by *vertex* distance rather than triangle centroid is
load-bearing: one big desktop triangle has its centre near everything on it, and letting a single
one in drags metres of geometry into a bottle-sized selection.

Colliders live on layer 2 (`Ignore Raycast`) so the gaze never competes with the controller ray.

### Naming is pluggable — this is where ML goes

`IObjectNamer` is the seam. `DefaultNamer` ships today and does two honest things:

- **Furniture gets real names** from MRUK's own labels — Desk, Monitor, Shelf, Couch, Bed, Lamp,
  Plant, Door, Window. Ground truth from the scan.
- **Loose objects get a size heuristic.** A 7×25cm upright thing is called "Bottle" because that
  is what such a thing usually is. It is measuring a bounding box, *not* recognising an object,
  and it answers "Object" rather than inventing a name when it does not know.

It will never say "headset" or "screwdriver" on its own — that needs a model. Implement
`IObjectNamer` around Sentis+YOLO and call `GazeInspector.SetNamer(...)`; nothing else changes.

## Why there is no ML in the base layer

The Quest 3 already knows the room. Space Setup produces **labelled geometry** (MRUK anchors:
`WALL_FACE`, `FLOOR`, `CEILING`, `TABLE`, `COUCH`, `STORAGE`, …), positioned and sized. Rendering
that is instant, deterministic and free — the right base for a live demo. Machine learning only
adds *names for loose objects* (a drill, a screw box) and comes with frame-rate and flakiness costs.

If someone wants that layer later: **QuestCameraKit's "Object Detection" sample (Unity Sentis +
YOLO ONNX)** runs on-device on passthrough frames. Raycast each 2D box against the scene mesh to
place a label in 3D. It is a P2 flourish; this folder does not depend on it.

## It installs itself

`RoomSenseBootstrap` installs the scan, the glow and the gaze inspector at app start via
`[RuntimeInitializeOnLoadMethod]`, so **nothing needs wiring into `Main.unity`** — which also means
no merge conflict on a scene several people edit. It no-ops if a `RoomGlow` is already present.
Define `ROOMSENSE_NO_AUTOBOOT` to switch it off and call `RoomSenseBootstrap.Install()` yourself.

The material lives in `Resources/` on purpose: a shader reached only through `Shader.Find` can be
stripped from a player build, and a stripped shader is a pink room on device that looked perfect
in the Editor.

Verified on an empty scene — which is what `Main.unity` is today: MRUK auto-created with
`DataSource.Device`, RoomGlow auto-created with the SheikahGlow material bound, GazeInspector
auto-created.

This folder has its own `CutOnce.RoomSense.asmdef` (referencing `meta.xr.mrutilitykit` and
`Unity.InputSystem`) matching the per-folder assembly layout here, and the editor rig lives under
`Editor/` behind `CutOnce.RoomSense.Editor.asmdef`.

## Manual setup (only needed if you turn the bootstrap off)

1. Packages: Meta MR Utility Kit (`com.meta.xr.mrutilitykit`) — A1's QuestCameraKit fork already
   pulls the Meta XR SDK.
2. Scene: an `[MRUK]` prefab with **"Load Global Mesh" enabled in its Scene Settings**, plus one
   GameObject with `RoomGlow`.
3. Material: create one from `CutOnce/SheikahGlow`, assign it to `RoomGlow.glowMaterial`.
4. Manifest: `com.oculus.permission.USE_SCENE`. On device, Space Setup must have been run once
   (Settings → Physical Space). In the Editor, MRUK's mock rooms stand in for a scan.
5. `Pulse()` is public — bind it to a controller button or a copilot voice command ("scan the
   room") for the demo beat.
6. Add `GazeInspector` next to `RoomGlow` for the look-at-it-to-name-it layer (it defaults to
   RoomGlow's material).

## Testing it without a headset

`Editor/RoomSenseSetup.cs` builds the whole test scene headlessly and
`Editor/RoomSensePlayTest.cs` runs it in play mode and asserts on the result — no clicking, no Quest:

```
Unity -batchmode -nographics -projectPath <proj> -executeMethod RoomSenseSetup.Build -quit
Unity -batchmode -nographics -projectPath <proj> -executeMethod RoomSensePlayTest.Run
```

Rooms to test against: `MockRooms/HackDesk.json` is a synthesised scan — a desk buried in water
bottles, mugs, a laptop and screwdrivers — generated by `apps/quest/Tools/generate_hackdesk.py`.
**None of the small objects are labelled anchors**, so if they glow it proves the global mesh
alone is doing the work, with no detection involved. MRUK also bundles 8 real scans under
`Packages/com.meta.xr.mrutilitykit/Core/Rooms/Json`; `RoomCycler` cycles all of them on **N**.

`Editor/BootstrapTest.cs` covers the auto-install path on a bare scene, and
`Editor/ShaderCheck.cs` compile-checks SheikahGlow against this project's URP (0 errors on 17.6.0).

Verified on MRUK 205.0.0 / Unity 6000.6.2f1:

```
[RoomGlow] overlay built: 15 surfaces glowing.
scene mesh: 1290 verts, 1916 tris, bounds size (5.00, 2.70, 4.00)
gaze bottle on desk:  "Bottle" 7x25x7cm, 112 tris  OK
gaze mug on desk:     "Cup"     9x10x9cm,  56 tris  OK
gaze bottle on floor: "Bottle" 7x22x7cm,  56 tris  OK
gaze the desk itself: "Desk" 180x4x80cm,  12 tris  OK
gaze fused-scan fallback: carved 130 tris, 0.48m across  OK
```

## Demo notes

- The overlay spawns **without colliders**, so it can never eat the controller ray that selects
  parts. Keep it that way.
- Walls are deliberately dimmer than furniture so the desk hologram still dominates.
- Status: **compiles and runs** against MRUK 205.0.0 on Unity 6000.6.2f1, verified headlessly
  (see above). No MRUK API renames were needed.
- **Still unverified: how it actually looks.** All of the above is batch-mode, which renders
  nothing. Pixels, frame rate and on-device behaviour are untested — and Space Setup must be run
  on the headset right before a demo, since the mesh is a scan-time snapshot.
