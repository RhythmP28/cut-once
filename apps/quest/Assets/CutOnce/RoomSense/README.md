# `RoomSense/` — the Zelda room scan (owner: Rhythm, coordinate with A2 before wiring into Main)

Put the headset on and **everything** glows blue — walls, floor, the desk, and the stuff sitting
on the desk — revealed by a sonar pulse from the player, BOTW style.

Two layers from one scan: the **global scene mesh** (a triangle mesh of the whole room, clutter
included) is the base glow, and the labelled anchors (tables, couches, walls) are tinted shapes on
top so furniture reads brighter. `glowEverything` / `glowLabelledShapes` toggle each layer.

Known limit: the scene mesh is a snapshot from scan time — move an object and its glow stays where
it was scanned until a rescan. Live-updating glow on moving objects means a Depth API screen-space
effect instead; that is a bigger build, ask Rhythm first.

## Why there is no ML in here

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
no merge conflicts on a scene several people edit. It no-ops if a `RoomGlow` is already present.
Define `ROOMSENSE_NO_AUTOBOOT` to switch that off and call `RoomSenseBootstrap.Install()` yourself.

The material lives in `Resources/` on purpose: a shader reached only via `Shader.Find` can be
stripped from a player build, and a stripped shader is a pink room on device that looks fine in
the Editor.

Verified on an empty scene (what `Main.unity` is today): MRUK auto-created with `DataSource.Device`,
RoomGlow auto-created with the SheikahGlow material bound, GazeInspector auto-created.

## Manual setup (only if you turn the bootstrap off)

1. Packages: Meta MR Utility Kit (`com.meta.xr.mrutilitykit`) — A1's QuestCameraKit fork already
   pulls the Meta XR SDK.
2. Scene: an `[MRUK]` prefab with **"Load Global Mesh" enabled in its Scene Settings**, plus one
   GameObject with `RoomGlow`.
3. Material: create one from `CutOnce/SheikahGlow`, assign it to `RoomGlow.glowMaterial`.
4. Manifest: `com.oculus.permission.USE_SCENE`. On device, Space Setup must have been run once
   (Settings → Physical Space). In the Editor, MRUK's mock rooms stand in for a scan.
5. `Pulse()` is public — bind it to a controller button or a copilot voice command ("scan the
   room") for the demo beat.

## Demo notes

- The overlay spawns **without colliders**, so it can never eat the controller ray that selects
  parts. Keep it that way.
- Walls are deliberately dimmer than furniture so the desk hologram still dominates.
- Status: written before the Unity project landed in the repo, so **not compiled yet** — same
  caveat as `CutOnce/Copilot/`. Expect small MRUK API renames depending on the SDK version A1 pins.
