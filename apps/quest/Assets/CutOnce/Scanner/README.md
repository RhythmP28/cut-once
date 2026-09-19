# `Scanner/` — the object scanner (owner: Rhythm)

Put the headset on, look at your desk: the laptop, the bottle, the keyboard and the chair each get a see-through blue
box and their name, fixed to the real object. The names come from **computer vision on the passthrough camera** (YOLO),
not from Scene API labels and not from measuring the room mesh.

```
passthrough camera ─► ObjectDetectionManager ─► Object3DLocator ─► TrackedObjectManager ─► ObjectVisualizer
   GPU texture          YOLOv9, ~10 per second     centre pixel → ray     one object per real      the app's blue hologram
   + the pose it        "chair 0.91" + 2D box      → depth hit            thing, smoothed,         box + WorldLabel:
   was taken from                                  → Vector3 in the room  shown on its 3rd sighting   "CHAIR"
```

It wires itself up in code (like `CutOnceApp`: no prefab, no Inspector references, and **no edit to `Main.unity`**) and
starts by itself **on the headset only**. In the Editor nothing starts by itself, so PlayMode tests and scenes are as
they were; use **Cut Once > Scanner > Detect objects in the fixture photo**. `CUTONCE_NO_SCANNER_AUTOBOOT` switches the
headset auto-start off.

## What is reused, and from where

| | |
|---|---|
| **Camera** | The app's own `PassthroughCameraAccess`, the one `CutOnceApp` creates for the copilot's `PcaFrameSource`. MRUK allows one per eye, so the scanner finds that one and creates its own only if there is none. It reads `GetTexture()` (the image on the GPU: no readback, no JPEG), `GetCameraPose()` and `ViewportPointToRay(point, pose)`. `PcaFrameSource` is not edited. |
| **Depth** | The app's own `ISurfaceRaycaster` (`Device/QuestSurfaceRaycaster` over MRUK's `EnvironmentRaycastManager`), found through its interface because `Device/` compiles into Assembly-CSharp. `DepthSurfaceRaycaster` is the same thing for a scene with no `CutOnceApp`. |
| **Visuals** | The app's own `CutOnce/Hologram` shader through `HologramMaterial` + `ShapeFactory.Box` (already single-pass-instanced and already blending alpha for passthrough: AGENTS rules 4 and 5) and the app's own `UI/WorldLabel`. No new shader. |
| **Inference** | Adapted from Meta's [Unity-PassthroughCameraApiSamples](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples) `MultiObjectDetection` (Oculus SDK License): the coroutine loop in `SentisInferenceRunManager` (`Schedule`, then `ReadbackAndCloneAsync` polled once per frame, one inference in flight, a warm-up inference at launch), its class-agnostic NMS and IoU, its shipped thresholds (score 0.3, IoU 0.4), its CPU/Burst backend, the 2D→3D maths of `SentisInferenceUiManager.DrawUIBoxes`, and its model. |

**Package:** `com.unity.ai.inference` **2.6.1** (namespace `Unity.InferenceEngine`). Meta's sample pins 2.2.1, but Unity
6000.6.2f1's own package manifest sets `minimumVersion` 2.6.1 (and 2.2.1 does not compile here). Same package, same API;
2.6 deprecates `TextureTransform.SetDimensions` (the tensor's shape decides), so `ToTensor` is called without it.

**Model:** `Resources/CutOnce/Scanner/yolov9sentis.sentis` — Meta's sample asset, 2.3 MB, 640×640 input, the 80 COCO
classes. Its graph already decodes corners + best class + score; NMS is in C# (`YoloProcessor`). `coco-labels.txt` is the
same 80 classes in the same order with today's names (`tv`, `couch`) instead of the sample's Darknet-era ones
(`tvmonitor`, `sofa`). It knows 80 things: a laptop, a keyboard, a mouse, a bottle, a cup, a chair, a tv, a book, a
backpack, a cell phone — not "headset", not "screwdriver". YOLOv9 upstream is GPL-3.0: fine for a demo, worth a look
before anything ships.

## The rules the tracker follows (`TrackedObjectManager`, plain C#, 12 tests)

- Same class within **0.3 m** of a known object: that object, seen again. Its position moves 35% of the way to each new
  measurement, so depth noise does not shake the label.
- Shown on its **3rd sighting in a row**: one-image ghosts never appear.
- Dropped after **1.5 s of the camera looking at where it is and not detecting it**. Time spent looking elsewhere does
  not count: a desk you have scanned keeps its labels while you scan the shelf.
- One thing, one name: a different class landing within 12 cm of a known object (the model wavering between "cup" and
  "bowl") updates that object, and the name shown is the class with the most score behind it.

`Object3DLocator` places each object **on the centre pixel's ray**; how far along it is a *near* depth among five rays
(the centre and a quarter of the way in from each side), because a box around a chair has gaps a single ray goes straight
through, to the wall behind. `DepthSamples = 1` is Meta's centre-pixel-only behaviour. No depth hit means no object.

## Checking that it works

**On a laptop, no headset** (what the numbers below come from):

```
Unity -batchmode -projectPath apps/quest -runTests -testPlatform EditMode            # 26 Scanner tests among the suite
Unity -batchmode -projectPath apps/quest -executeMethod CutOnce.Scanner.Editor.ScannerProof.Run
```

The second runs the real model through the real pipeline on `StreamingAssets/frame_0001.jpg` (the copilot's fixture
frame, from `pnpm sync:fixtures`; or any photo via `CUTONCE_SCANNER_PHOTO=/path/to.jpg`), with a flat wall 2 m away
standing in for depth, and writes `Logs/scanner-proof.json` and `Logs/scanner-proof.png` (the photo with the boxes drawn
on it). On COCO val 139 (a living room): `tv 0.62, clock 0.63, refrigerator 0.53, potted plant 0.41, vase 0.37,
chair 0.32`, ~30 ms per inference on a Mac, six objects tracked and shown, none duplicated over 8 inferences.

**On the headset:** build and run as usual, allow the camera and spatial-data permissions, look at a desk, and read

```
adb logcat -s Unity | grep "\[Scanner\]"
```

```
[Scanner] Model ready: 640x640 input, 80 classes, CPU backend.
[Scanner] 4 detected in 95 ms (8.1/s, 31 candidates)
[Scanner] Detected: laptop 0.86
[Scanner] Detected: bottle 0.78
[Scanner] Tracking 3 object(s): laptop @ (0.21, 0.78, 1.10); bottle @ (-0.30, 0.81, 0.95); ...
```

What each silence means: no `Model ready` — the model or labels are missing from the build. `Model ready` but nothing
after — no camera image: `ObjectDetectionManager.Status` says why ("allow camera access", "Waiting for the passthrough
camera…", "Head tracking lost"). Detections but `Tracking 0 object(s) (N detection(s) had no depth)` — the spatial-data
permission (`USE_SCENE`) was refused, or the surface is glass / too dark / out of the depth sensor's reach.

## Not verified yet

Everything above ran in the Editor. **Nothing here has run on a Quest.** Unknown until it does: inference time on the XR2
(the ceiling is 10 per second; expect fewer), whether the frame rate holds with the CPU backend (`backend = GPUCompute` is
the A/B), and whether `GetTexture()`'s texture type is accepted by `TextureConverter.ToTensor` on device as it is in
Meta's sample. Meta themselves call this "a tiny YOLO" that degrades in low light: light the desk.
