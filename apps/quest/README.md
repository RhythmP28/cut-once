# Cut Once on the Quest 3: open, simulate, check, build

This folder is the Unity project for the headset app. It is the same project on every machine: Michael's Mac and
the Windows laptops. [AGENTS.md](AGENTS.md) has the rules every change follows so that what works on a laptop also
works on the Quest.

## One-time setup (Mac or Windows)

1. **Unity Hub.** Install **Unity 6000.6.2f1** exactly, with **Android Build Support**, and under it **OpenJDK** and
   **Android SDK & NDK Tools**. If Unity is already installed, go to Installs, click the gear on 6000.6.2f1, then
   Add modules. On a Mac, Meta's SDK does not compile without the Android module, even just for the simulator.
2. **Meta XR Simulator** v205, the standalone app. There is a
   [Mac (Apple Silicon)](https://developers.meta.com/horizon/downloads/package/meta-xr-simulator-mac-arm/) build
   and a [Windows](https://developers.meta.com/horizon/downloads/package/meta-xr-simulator-windows/) build. On a Mac
   it must end up at `/Applications/MetaXRSimulator.app`. Do not install the old `com.meta.xr.simulator` package.
3. **Git LFS:** `git lfs install && git lfs pull`. Without it, the E7 model is a text file.
4. In Unity Hub, click **Add → Add project from disk** and pick `apps/quest`. The first open imports packages for a
   few minutes.
5. Check that it is right with **Cut Once > Check Quest readiness**. If anything is red, run
   **Cut Once > Apply Quest 3 settings**.

## The laptop loop: Meta XR Simulator

1. Choose **Meta > Meta XR Simulator > Activate**, or click the simulator icon beside Play. The Console says
   `[Meta XR Simulator is activated]`.
2. In the simulator window, **Choose environment** and pick a room. The room stands in for passthrough.
3. Open `Assets/CutOnce/Scenes/QuestBaseline.unity`, or the scene you're working on, and press **Play**. The
   simulator uses the **Quest 3** device profile by default: the Quest 3's per-eye resolution, field of view and
   refresh rate.
4. The simulator window lists the keyboard and mouse controls for the head, the controllers and the hands. Leave the
   simulator running between Play sessions; the next one starts faster.

`QuestBaseline` shows one box for each hologram state (built, replay, current step, missing, future, wrong) in the
shared palette at true scale: 15 cm boxes on a table-height row, 80 cm in front of you. Compare it with `/preview`
in the web app and with the headset.

## What the laptop shows truthfully, and what only the headset shows

| | On the laptop (simulator) | Only on the headset |
|---|---|---|
| Code and settings | The same project, the same C# and the same OpenXR calls. `pnpm quest:check` compiles the code as the Android build does and runs Meta's own checks | Code behind `#if UNITY_ANDROID && !UNITY_EDITOR`, and the permission prompts |
| What you see | Quest 3 resolution, field of view and refresh rate; real scale in metres; hologram colours and see-through fills over a room | Lens clarity, the Quest display's colour and contrast |
| The room behind | A synthetic room (game room, living room, bedroom) | Real passthrough: grain, exposure, your actual desk |
| Aligning to the desk | Controller touches and hand placement work with the simulated controllers. The simulator's rooms have no desk of ours in them | Your real desk, and your real hand |
| Copilot photo | MRUK's `PassthroughCameraAccess` gets frames from the simulator's room, with the Quest 3 lens's pose and focal length (MRUK 205 requires simulator v85 or newer; `pnpm quest:sim` confirms it on your machine) | The real camera's grain and exposure |
| Controllers and hands | Keyboard, mouse or a gamepad. Meta lists some controller-input limits on macOS | The real feel |
| Mic and network | The laptop mic; the server on `localhost` | The Quest mic; Wi-Fi to the laptop |
| Depth occlusion | Windows only | Yes |
| How much it draws | Draw calls and triangles: **the same numbers as the headset** (`BudgetProbe`) | — |
| How fast it runs | No: the laptop is several times faster | Frame time, heat, throttling |
| Comfort | No | Yes |

The web app's `/sim` is for the server and copilot loop without Unity. This simulator runs the actual headset app.

## Checks before pushing

- **Editor open:** use **Cut Once > Check Quest readiness**, and the EditMode tests in Window > General > Test
  Runner.
- **Editor closed:**
  - `pnpm quest:check` compiles for the Quest (Android), checks the settings and every build scene against the
    Quest 3 budget, runs Meta's Project Setup Tool, and runs the EditMode tests. It exits 1 if the Quest would break.
    Logs are in `Logs/cli/`.
  - `pnpm quest:setup` puts the Quest 3 settings back and applies Meta's automatic fixes.

## On the headset

- **Windows:** use Quest Link. Deactivate the simulator first (Meta > Meta XR Simulator > Deactivate), connect
  Link, and press Play. Same project, same scene.
- **Mac or Windows:** run `pnpm quest:build`, then `pnpm quest:install` with the Quest plugged in by USB-C and USB
  debugging allowed. Frame times: `adb logcat -s Unity | grep Budget`.

Check on the headset before the demo:

- **Passthrough:** the room shows, not black. The hologram sits on the desk at the right size.
- **Alignment:** the hologram sits on the real desk, with the far corner off by at most 5 mm.
- **Copilot:** it asks for the camera and microphone once, and its answers point at the right part.
- **Frame rate:** no `[Budget]` warning in logcat with the full desk plan, then with E7 loaded.
- **Legibility:** the palette states can be told apart over the real room at arm's length.

## AI agents (Claude Code, Codex)

Meta's SDK has two MCP servers. Connect them once in Unity: **Meta > Tools > AI Tools**, pick
your assistant, then run the connection command it shows.

- **`meta-xr-unity-runtime`** (Editor): compile, compile errors, run tests, and Meta's Project Setup Tool checks and
  fixes.
- **`meta-xr-operator`** (Play mode with the simulator): screenshots, head pose, controller input and the scene
  hierarchy. It is also in `.mcp.json` here (`http://localhost:8720/sse`).

Unity registers them for this folder, so start the assistant in `apps/quest` for Unity work.
