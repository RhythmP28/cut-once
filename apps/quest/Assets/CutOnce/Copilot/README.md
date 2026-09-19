# `Copilot/` — pillar C (owner: Rhythm)

Ask a question, get a spoken answer within about 5 seconds that points at the right parts.

Nothing outside this folder should reference the copilot's internals. The seam in both directions is
`ICopilotHost` (in `Interfaces.cs`): A2 implements it, the copilot consumes it.

## What is here

| File | What it does |
|---|---|
| `Interfaces.cs` | `CameraFrame`, `CameraIntrinsics`, `ICameraFrameSource`, `ICopilotHost` — the seams |
| `Schemas/CopilotDtos.cs` | C# mirror of `packages/schemas/dist/jsonschema/CopilotResponse.json` |
| `Capture/PcaFrameSource.cs` | Passthrough Camera API on the device (G2) |
| `Capture/FixtureFrameSource.cs` | Replays `frame_0001.jpg` in the Editor, so the headset is not a blocker |
| `Projection/PartProjector.cs` | Projects every part's box into the frame → `visible_parts` |
| `Voice/MicRecorder.cs` | Push-to-talk, 16 kHz mono, WAV |
| `Voice/PcmStreamPlayer.cs` | Plays the answer while the server is still generating it |
| `Net/CopilotClient.cs` | The context packet, the query, the camera check, the debug capture |
| `CopilotController.cs` | The whole turn. Goes on the `[Copilot]` prefab |

## Setting it up

1. Add a `[Copilot]` prefab with `CopilotController`, `MicRecorder`, `PcmStreamPlayer` and an
   `AudioSource`.
2. Drop `FixtureFrameSource` on it for Editor work, `PcaFrameSource` for the device, and wire whichever
   one you want into `frameSourceBehaviour`.
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

Written against the blueprint before `apps/quest` existed, so **none of this has been compiled yet**.
Expect to fix namespaces and the OVRInput reference when it first lands in the Unity project.
