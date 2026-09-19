# `Copilot/` — pillar C (owner: Rhythm)

Ask a question, get a spoken answer within about 5 seconds that points at the right parts.

Nothing outside this folder should reference the copilot's internals. The seam in both directions is
`ICopilotHost` (in `Interfaces.cs`): A2 implements it, the copilot consumes it.

## What is here

| File | What it does |
|---|---|
| `Interfaces.cs` | `CameraFrame`, `CameraIntrinsics`, `ICameraFrameSource`, `IPushToTalk`, `Selection`, `ICopilotHost` — the seams |
| `Schemas/CopilotDtos.cs` | C# mirror of `packages/schemas/dist/jsonschema/CopilotResponse.json` |
| `../Device/PcaFrameSource.cs` | Meta's `PassthroughCameraAccess` on the device (G2): the colour camera's own pose and Meta's projection |
| `../Device/QuestPushToTalk.cs` | The A button through `OVRInput` |
| `Capture/FixtureFrameSource.cs` | Replays `frame_0001.jpg` in the Editor, so the headset is not a blocker |
| `Projection/PartProjector.cs` | Projects every part's box into the frame → `visible_parts` |
| `Voice/MicRecorder.cs` | Push-to-talk, 16 kHz mono, WAV |
| `Voice/PcmStreamPlayer.cs` | Plays the answer while the server is still generating it |
| `Net/CopilotClient.cs` | The context packet, the query, the camera check, the debug capture |
| `CopilotController.cs` | The whole turn. Goes on the `[Copilot]` prefab |

## Setting it up

1. Add a `[Copilot]` prefab with `CopilotController`, `MicRecorder`, `PcmStreamPlayer` and an
   `AudioSource`.
2. Drop `FixtureFrameSource` on it for Editor work, `CutOnce.Device.PcaFrameSource` for the device (point its
   `cameraAccess` at the scene's `PassthroughCameraAccess`), and wire whichever one you want into
   `frameSourceBehaviour`. Put `CutOnce.Device.QuestPushToTalk` into `pushToTalkBehaviour`.
3. Wire A2's `ICopilotHost` into `hostBehaviour`.
4. Set `baseUrl` and `apiToken` to the tunnel address and the token in `.env.local`.
5. Run `pnpm copilot:fixtures && pnpm sync:fixtures` so `frame_0001.jpg` is in StreamingAssets.

## Two things that will bite you

- **The frame and the selection freeze on button PRESS, not release.** People move while they talk.
- **A `mark_state` action has already been written by the server.** Show a 2 s Undo toast; do not append
  an event for it, or the same command lands twice.

## Permissions and OS

The camera needs Horizon OS v74+ and `horizonos.permission.HEADSET_CAMERA`; the mic needs `RECORD_AUDIO`.
Check both in the first hour — G2 depends on them and there is no workaround on the day.

## Status

`CutOnce.Copilot` and `CutOnce.AR` compile and their EditMode tests pass in Unity. `pnpm quest:check` (Editor
closed) compiles everything in `apps/quest`, the real project with Meta XR Core and MRUK 205.0.0 on Unity
6000.6.2f1, for the Editor and for the Android build, and runs the tests.
Anything that touches Meta's packages (`OVRInput`, `PassthroughCameraAccess`) lives in `../Device/`, which has
no asmdef, so Unity's default assembly compiles it. What only the headset can show is G2 on `/debug`: the frame
is upright and the boxes sit on the parts. In Meta XR Simulator on a Mac, `PassthroughCameraAccess` starts and
reports the Quest 3 lens (1280x960, focal 853.6 px) but sends no pixels while a room is connected
(`pnpm quest:sim`).
