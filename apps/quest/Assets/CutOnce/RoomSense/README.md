# `RoomSense/` — the Zelda room scan (owner: Rhythm, coordinate with A2 before wiring into Main)

Put the headset on and every surface the Quest knows about glows blue — walls, floor, tables,
couches — revealed by a sonar pulse from the player, BOTW style.

## Why there is no ML in here

The Quest 3 already knows the room. Space Setup produces **labelled geometry** (MRUK anchors:
`WALL_FACE`, `FLOOR`, `CEILING`, `TABLE`, `COUCH`, `STORAGE`, …), positioned and sized. Rendering
that is instant, deterministic and free — the right base for a live demo. Machine learning only
adds *names for loose objects* (a drill, a screw box) and comes with frame-rate and flakiness costs.

If someone wants that layer later: **QuestCameraKit's "Object Detection" sample (Unity Sentis +
YOLO ONNX)** runs on-device on passthrough frames. Raycast each 2D box against the scene mesh to
place a label in 3D. It is a P2 flourish; this folder does not depend on it.

## Setup

1. Packages: Meta MR Utility Kit (`com.meta.xr.mrutilitykit`) — A1's QuestCameraKit fork already
   pulls the Meta XR SDK.
2. Scene: an `[MRUK]` prefab, plus one GameObject with `RoomGlow`.
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
