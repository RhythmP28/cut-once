# Object placement demo (Quest 3)

This feature checks whether an identified object's observed 3D pose matches its assembly target.
`Confirmed` currently means **pose alignment confirmed**, not physical pickup/release or task completion.
The stronger product architecture and research decisions are documented in `RESEARCH.md`.
The demo supplies observations from movable Unity transforms. It does **not** recognize objects in
the simulator's room or track real camera pixels. The fixture objects can be moved with either Touch
controller, which stands in for moving a detected real object until the detector is integrated.

## Run the simulation

1. Open `apps/quest` with **Unity 6000.6.2f1**. Let script compilation finish.
2. Choose **Cut Once > Placement Demo > Open demo scene**. This opens
   `Assets/CutOnce/Placement/PlacementDemo.unity` (the menu generates it if missing).
3. Choose **Meta > Meta XR Simulator > Activate**. Open the installed standalone Meta XR Simulator
   if it is not already visible. Use its Quest 3 profile and choose a synthetic room through the
   environment control at the top right. The existing project README covers simulator installation.
4. Press **Play** in Unity. Three fixture objects and three target outlines appear, approximately
   one metre forward from the rig's origin, at table height. If they are outside your view, use the
   simulator's **Inputs / Input Bindings** controls to look down and toward them. Inspect the
   simulator window to see the synthetic passthrough room; Unity's Game view may show black behind
   the holograms because passthrough is composited separately.
5. For the fastest demonstration, choose **Cut Once > Placement Demo > Snap all objects to targets**.
   They become yellow while aligning, then green after **0.5 seconds** of fresh aligned observations.
   The separate target outlines disappear, leaving the green assembled shelf.
6. Choose **Reset demo** from the same menu to return the objects to their starting positions.

To move objects with a Quest controller, bring either Touch controller within about 16 cm of an object,
hold its **grip/hand trigger**, and move the controller. Release the grip to drop it. Both controllers are
enabled. The controller moves only the simulated object; its target outline stays fixed. The same input
path works in Quest Link and Meta XR Simulator. The object is not physically colliding with the room yet;
this is a direct pose-grab fixture for testing placement feedback.

All demo control menus below are under **Cut Once > Placement Demo** and operate during Play mode.

## Move an individual object yourself

1. Choose **Select box 1**, **Select box 2**, or **Select plank**.
2. In the Unity **Scene** tab, press **F** to frame the selection, then **W** to move or **E** to rotate.
   Alternatively edit its **Transform** in the Inspector. Move the child named
   `Simulated object - move me`, not its parent or `Target - keep fixed`.
3. Align it with its target outline. Or choose **Snap selected object to target** to align that object
   exactly and observe the transition.
4. Choose **Print placement status** and inspect the Console for the state, distance in metres,
   angle in degrees, and hold progress.

The default target transforms below are local to each identity parent; the generated demo's parents
have identity transforms, so these are also world positions:

| Object | Target position (X, Y, Z), metres | Target rotation |
|---|---|---|
| `box_01` | (-0.24, 0.85, 1.00) | (0, 0, 0) |
| `box_02` | (0.24, 0.85, 1.00) | (0, 0, 0) |
| `plank_01` | (0.00, 0.97, 1.00) | (0, 0, 0) |

## What to test

| Action | Expected result |
|---|---|
| Stay farther than 10 cm from target | Cyan, Misplaced |
| Move within 10 cm and 24 degrees | Yellow, Near |
| Stay within 5 cm and 12 degrees for 0.5 s | Yellow Aligning, then green Confirmed; target hides |
| Move a confirmed object more than 7.5 cm or 18 degrees away | Confirmation clears; target reappears |
| Select object, then **Toggle selected object tracking** | Grey, TrackingLost; target reappears |
| Toggle tracking back while aligned | Must complete a new hold before confirming |
| **Reset demo** | All objects misplaced, tracking restored |

At `[Placement Demo]`, the `SimulatedObjectPoseSource` Inspector exposes each object's **Tracked** and
**Confidence** fields. Confidence below 0.7 loses tracking. The boxes and plank accept a 180-degree
turn about their local Y axis. Other integrations can choose exact rotation or ignore it for a sphere.
Position and rotation must both satisfy a threshold; distance alone does not confirm a rotated plank.
These are adjustable prototype tolerances, not claims about detector accuracy or structural safety.

## Integrate the real detector later

The dependency boundary is `IObjectPoseSource.TryGetObservation(objectId, out observation)`.
`PlacementBinding` consumes it and checks its assigned `target`. `PlacementFeedback` is the visual
owner and reacts to the binding's `StateChanged` event. No changes to Copilot are required for this demo.

1. Your assembly plan assigns each target a **stable physical-object ID**, position, and orientation.
   Create one target Transform and one PlacementBinding for each assigned object.
2. Add `BufferedObjectPoseSource` to your integration GameObject. Assign it to each binding's
   `poseSource`. Configure the binding while its GameObject is inactive, then activate it. Set
   settings and object ID before enabling; disable/re-enable after changing identity/configuration.
3. Your friend calls `Submit` on that component for each new detection, **on Unity's main thread**:

```csharp
// worldPosition/worldRotation refer to this object's agreed centre in the shared room frame.
// captureTime is expressed on Time.unscaledTimeAsDouble's clock.
source.Submit(new ObjectObservation(
    "box_01", new Pose(worldPosition, worldRotation), confidence, captureTime));
```

4. Convert camera coordinates into the same Unity world/anchor frame as the targets. Use the
   camera pose **at capture time**, metres, and the same object centre and local axes. A 2D image
   rectangle alone is insufficient: 3D pose estimation/tracking must happen before this boundary.
5. Preserve the timestamp of the actual observation. Do not refresh its timestamp just because
   another Unity frame passed. Convert external timestamps into the Unity monotonic clock; neither
   Unix time nor an unsynchronised server clock is valid. Account for processing latency.
6. Submit confidence in [0, 1]. The checker rejects stale (>0.25 s), future, low-confidence, invalid,
   and wrong-ID poses. The buffer rejects duplicate/out-of-order timestamps. `Forget(id)` immediately
   removes an explicitly lost object. `Clear()` resets the buffer after changing tracking sessions.
7. Recenter the shared world frame consistently for both targets and observations. Disable bindings
   during relocalization and enable them after the frame is stable, requiring a fresh hold.

The buffer holds at most 256 IDs; remove obsolete objects with `Forget`. There is no per-frame LINQ,
scene lookup, material creation, or list allocation in the placement checker/feedback. The simulated
source uses a small array; a real detector should use the buffer or implement the interface directly.

## Verification

EditMode tests: **Window > General > Test Runner > EditMode**, select `CutOnce.Placement.Tests`, Run.
Tests cover stable dwell, frozen frames, missing/stale/future/low-confidence observations, wrong IDs,
out-of-order frames, invalid poses, target changes, rotation symmetry, and exit hysteresis.

The demo uses the existing stereo hologram shader, transparent camera background, passthrough rig,
and BudgetProbe. It is separate from Main and QuestBaseline and is not added to APK build scenes.
For a headset demo, include this scene deliberately in your build profile, or use Quest Link on Windows
with the simulator deactivated. Real detector integration, real passthrough readability and headset
frame time still require the project's step-5 headset verification.
