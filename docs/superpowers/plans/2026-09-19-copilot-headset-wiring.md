# Copilot ↔ Headset App Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three gaps left in the copilot's wiring into the headset app, so a push-to-talk question works in the Editor and on the Quest: the right camera in each place, runtime permissions, and the source card.

**Architecture:** The wiring already exists on `main`: `Device/CutOnceApp` implements `ICopilotHost` and builds the `[Copilot]` object at runtime (`TryCreateCopilot`). This plan changes only that composition point and one pure text helper. The camera choice and the permission prompts stay in `Device/` (the headset side, AGENTS rule 1); the answer card's text is a pure function in `Core/Hud/HudText` so it is unit-tested without Unity.

**Tech Stack:** Unity 6000.6.2f1, Meta XR Core + MRUK 205.0.0, NUnit (Unity Test Framework), `pnpm quest:core-test` (dotnet, no Unity), `pnpm quest:check` (Unity batchmode: Android compile, Quest checks, EditMode tests).

**Spec:** `apps/quest/AGENTS.md` (rules 1, 3, 10 and the verification ladder), `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` (copilot response §10; source card), `docs/superpowers/specs/2026-09-18-cut-once-team-plan.md` ("Source card (document and page): small card naming the sheet and page").

## Global Constraints

- Unity **6000.6.2f1 exactly**; no package or Unity upgrades.
- **Commit every new asset's `.meta` file** (Unity writes them on import; `pnpm quest:check` imports).
- `Assets/CutOnce/Copilot/` is Rhythm's: this plan does **not** edit it. Changes go in `Device/`, `Core/Hud/` and `Device/Tests/`.
- Headset-only code (`#if UNITY_ANDROID && !UNITY_EDITOR`) only inside a headset-side implementation in `Device/`.
- No allocation per frame in `Update` (AGENTS rule 10).
- Never run `pnpm quest:check` with the Unity Editor open on this project.
- Say which rung of the verification ladder each change reached. Permissions need rung 5 (the headset).

## What exists and what is missing

| Piece | State on `main` |
|---|---|
| `CutOnceApp : ICopilotHost` (selection, projection parts, highlights, answer, Undo toast, step nav) | Done |
| `TryCreateCopilot()`: `[Copilot]` with AudioSource, camera, `CopilotController` (server address from the app's config), `QuestPushToTalk`, `MicRecorder`, `PcmStreamPlayer` | Done |
| **Camera in the Editor** | Missing: always `PcaFrameSource`, which in the simulator on a Mac gives a pose but no pixels; AGENTS rule 1 says the Editor uses `FixtureFrameSource` |
| **Runtime permissions** | Missing: nothing asks for `horizonos.permission.HEADSET_CAMERA` or `android.permission.RECORD_AUDIO`. Meta's `PassthroughCameraAccess` only *waits* for the camera grant (MRUK 205 `WaitForPermissionsAndPlay`); `MicRecorder` just fails with no device |
| **Source card** | Missing: `ShowAnswer` shows `answer_text` only; `drawing_refs` are dropped |
| Test that the copilot comes up | Missing: `AppSmokeTests` sets `createCopilot = false` |

## Decisions

| Gap | Choice | Alternative and why it lost |
|---|---|---|
| Editor camera | `Application.isEditor` picks `FixtureFrameSource`, else `PcaFrameSource` + `PassthroughCameraAccess`, in one Device-side helper | `#if UNITY_EDITOR` in `CutOnceApp`: rule 1 keeps `#if` out of shared code. Over Quest Link the passthrough camera API is not available either, so "Editor ⇒ fixture" holds on Windows too |
| Permissions | `Device/QuestPermissions.Request(string[], Action<string,bool>)` with Unity's `Permission.RequestUserPermissions` (both at once, one dialog sequence); answers queued and shown in `Update` | OVRManager's "request on startup" flags: set in the scene/Inspector, not in code, and give no "denied" hook for the HUD. Requesting one by one: Android drops a second dialog while the first is up |
| Denied | HUD toast saying what still works | Blocking the app: the build guide works without the copilot |
| Source card | `HudText.AnswerCard(answer, title, sheetId, page)` in Core; `CutOnceApp.ShowAnswer` maps the first `drawing_ref` | A second HUD text field: a layout change for one line; the answer label already wraps |

---

### Task 1: The Editor asks with the stored photo, the headset with its camera

**Files:**
- Modify: `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs` (usings; `TryCreateCopilot`; new `AddCameraSource`)
- Modify: `apps/quest/Assets/CutOnce/Device/Tests/CutOnce.Device.PlayTests.asmdef` (add `CutOnce.Copilot`)
- Test: `apps/quest/Assets/CutOnce/Device/Tests/AppSmokeTests.cs`

**Interfaces:** Produces `static MonoBehaviour CutOnceApp.AddCameraSource(GameObject go)`.

- [ ] **Step 1: Failing test** — append to `AppSmokeTests`:

```csharp
        [UnityTest]
        public IEnumerator TheCopilotComesUpInsideTheAppWithTheStoredPhotoInTheEditor()
        {
            var type = Type.GetType("CutOnce.Device.CutOnceApp, Assembly-CSharp");
            var go = new GameObject("[App] (copilot smoke test)");
            var app = go.AddComponent(type);                                   // createCopilot defaults to true

            CutOnce.Copilot.CopilotController copilot = null;
            for (float waited = 0f; waited < 5f && copilot == null; waited += Time.unscaledDeltaTime)
            {
                copilot = UnityEngine.Object.FindAnyObjectByType<CutOnce.Copilot.CopilotController>();
                yield return null;
            }

            Assert.That(copilot, Is.Not.Null, "the app did not create the copilot");
            Assert.That(copilot.hostBehaviour, Is.SameAs(app), "the app is the copilot's host");
            Assert.That(copilot.frameSourceBehaviour, Is.InstanceOf<CutOnce.Copilot.Capture.FixtureFrameSource>(),
                "the Editor asks with the stored photo, never the headset camera (AGENTS rule 1)");
            Assert.That(copilot.pushToTalkBehaviour, Is.InstanceOf<CutOnce.Copilot.IPushToTalk>());
            Assert.That(copilot.mic, Is.Not.Null);
            Assert.That(copilot.speaker, Is.Not.Null);

            UnityEngine.Object.Destroy(copilot.gameObject);
            UnityEngine.Object.Destroy(go);
        }
```

  and add `"CutOnce.Copilot"` to the `references` of `CutOnce.Device.PlayTests.asmdef`.

- [ ] **Step 2: Run** (Editor closed): `"$UNITY" -batchmode -nographics -projectPath apps/quest -runTests -testPlatform PlayMode -testFilter CutOnce.Device.PlayTests -testResults /tmp/device-play.xml -logFile /tmp/device-play.log` → the new test FAILS (`frameSourceBehaviour` is `PcaFrameSource`).
- [ ] **Step 3: Implement** in `CutOnceApp`: add `using CutOnce.Copilot.Capture;`; in `TryCreateCopilot` replace the two `frames` lines and the `frameSourceBehaviour = frames` assignment with `controller.frameSourceBehaviour = AddCameraSource(go);`; add:

```csharp
        /// <summary>
        /// The copilot's camera (AGENTS rule 1). On the headset, Meta's PassthroughCameraAccess. In the Editor, the stored
        /// photo: the simulator's camera gives a pose but no pixels on a Mac, and the API does not run over Quest Link.
        /// `pnpm sync:fixtures` puts the photo in StreamingAssets; without it the copilot asks with no frame.
        /// </summary>
        static MonoBehaviour AddCameraSource(GameObject go)
        {
            if (Application.isEditor) return go.AddComponent<FixtureFrameSource>();
            var frames = go.AddComponent<PcaFrameSource>();
            frames.cameraAccess = go.AddComponent<Meta.XR.PassthroughCameraAccess>();
            return frames;
        }
```

- [ ] **Step 4: Run** the Step 2 command → both Device PlayMode tests PASS.
- [ ] **Step 5: Commit** (with the asmdef change): `feat(quest): the copilot asks with the stored photo in the Editor and the passthrough camera on the headset`

### Task 2: Ask for the camera and the microphone on the headset

**Files:**
- Create: `apps/quest/Assets/CutOnce/Device/QuestPermissions.cs` (+ its `.meta` after import)
- Modify: `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs` (request after creating the copilot; drain answers in `Update`)

**Interfaces:** Produces `QuestPermissions.Camera`, `QuestPermissions.Microphone`, `QuestPermissions.Request(string[] permissions, Action<string, bool> answered)`.

- [ ] **Step 1: Create `QuestPermissions.cs`:**

```csharp
using System;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace CutOnce.Device
{
    /// <summary>
    /// Runtime permissions (AGENTS rule 3). On the headset: ask for the ones not yet granted, in one request, and report
    /// each answer (dismissing the dialog counts as "not now"). The Editor never asks, so there everything is granted.
    /// Meta's PassthroughCameraAccess waits for the camera grant by itself; the microphone works once granted.
    /// Answers can arrive off Unity's main thread: callers must not touch Unity objects in the callback.
    /// </summary>
    public static class QuestPermissions
    {
        public const string Camera = "horizonos.permission.HEADSET_CAMERA";
        public const string Microphone = "android.permission.RECORD_AUDIO";

        public static void Request(string[] permissions, Action<string, bool> answered)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            var missing = Array.FindAll(permissions, p => !Permission.HasUserAuthorizedPermission(p));
            foreach (var p in permissions) if (Array.IndexOf(missing, p) < 0) answered(p, true);
            if (missing.Length == 0) return;
            var callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += p => answered(p, true);
            callbacks.PermissionDenied += p => answered(p, false);
            callbacks.PermissionRequestDismissed += p => answered(p, false);
            Permission.RequestUserPermissions(missing, callbacks);
#else
            foreach (var p in permissions) answered(p, true);
#endif
        }
    }
}
```

- [ ] **Step 2: Wire it** in `CutOnceApp`: field `readonly System.Collections.Concurrent.ConcurrentQueue<(string permission, bool granted)> _permissionAnswers = new System.Collections.Concurrent.ConcurrentQueue<(string, bool)>();`; at the end of the `try` in `TryCreateCopilot`: `QuestPermissions.Request(new[] { QuestPermissions.Camera, QuestPermissions.Microphone }, (p, ok) => _permissionAnswers.Enqueue((p, ok)));`; in `Update`, before `if (_dirty) Refresh();`:

```csharp
            while (_permissionAnswers.TryDequeue(out var answer))                     // answers may come from Android's thread
                if (!answer.granted) _hud.Toast(answer.permission == QuestPermissions.Camera
                    ? "Camera not allowed: the copilot answers without seeing the desk. Allow it in Settings > Privacy."
                    : "Microphone not allowed: use the question buttons, or allow it in Settings > Privacy.", 6f);
```

- [ ] **Step 3: Verify** (Editor closed): `pnpm quest:check` → 0 compile errors for Android, readiness 0 errors, EditMode tests pass; then the Task 1 PlayMode command → still PASS (the Editor grants everything, no toast).
- [ ] **Step 4: Commit** (with `QuestPermissions.cs.meta`): `feat(quest): ask for the camera and microphone on the headset and say what still works if refused`
- [ ] **Rung 5 (headset, by whoever holds the Quest):** fresh install → press A → Android asks for camera and microphone once; allow → answer with boxes; reinstall and deny → the two toasts show and the build guide still works.

### Task 3: The source card

**Files:**
- Modify: `apps/quest/Assets/CutOnce/Core/Hud/HudText.cs` (add `AnswerCard`)
- Test: `apps/quest/Assets/CutOnce/Core/Tests/HudTextTests.cs`
- Modify: `apps/quest/Assets/CutOnce/Device/CutOnceApp.cs` (`ShowAnswer`)

**Interfaces:** Produces `HudText.AnswerCard(string answer, string sourceTitle, string sheetId, int page): string`.

- [ ] **Step 1: Failing tests** — append to `HudTextTests`:

```csharp
        [Test] public void TheAnswerCardNamesTheDrawingItCameFrom() =>
            Assert.That(HudText.AnswerCard("Run it through the tray.", "E-1 Wiring", "sheet_e1", 2),
                Is.EqualTo("Run it through the tray.\nSource: E-1 Wiring · sheet E1 · page 2"));

        [Test] public void AnAnswerWithNoSourceIsJustTheAnswer()
        {
            Assert.That(HudText.AnswerCard("Not in the drawings.", null, null, 0), Is.EqualTo("Not in the drawings."));
            Assert.That(HudText.AnswerCard(null, null, null, 0), Is.EqualTo(""));
        }

        [Test] public void ASourceWithNoSheetNamesThePage() =>
            Assert.That(HudText.AnswerCard("See the manual.", "Assembly manual", "", 4), Is.EqualTo("See the manual.\nSource: Assembly manual · page 4"));
```

- [ ] **Step 2: Run** `pnpm quest:core-test` → FAIL (`AnswerCard` does not exist).
- [ ] **Step 3: Implement** in `HudText`:

```csharp
        /// <summary>The copilot's answer card: the answer, then the drawing it came from (the "source card").</summary>
        public static string AnswerCard(string answer, string sourceTitle, string sheetId, int page)
        {
            if (string.IsNullOrEmpty(sourceTitle) && string.IsNullOrEmpty(sheetId)) return answer ?? "";
            string sheet = string.IsNullOrEmpty(sheetId) ? "" : $"sheet {(sheetId.StartsWith("sheet_") ? sheetId.Substring(6) : sheetId).ToUpperInvariant()} · ";
            string title = string.IsNullOrEmpty(sourceTitle) ? "" : sourceTitle + " · ";
            return $"{answer}\nSource: {title}{sheet}page {page}";
        }
```

  and in `CutOnceApp` replace `ShowAnswer`:

```csharp
        public void ShowAnswer(CopilotResponseDto response)
        {
            var source = response?.drawing_refs != null && response.drawing_refs.Length > 0 ? response.drawing_refs[0] : null;
            _hud.ShowAnswer(HudText.AnswerCard(response?.answer_text, source?.title, source?.sheet_id, source?.page ?? 0));
        }
```

- [ ] **Step 4: Run** `pnpm quest:core-test` → PASS; `pnpm quest:check` (Editor closed) → PASS.
- [ ] **Step 5: Commit:** `feat(quest): the answer card names the drawing and page it came from`

### Task 4: Ladder and hand-off

- [ ] `pnpm quest:check` → 0 errors (rungs 1–3); Device PlayMode tests pass.
- [ ] Rung 4 (optional, Editor open): Play with Meta XR Simulator, `pnpm dev` running with `COPILOT_MODE=fake`, hold A → the fake answer shows with its source line on the HUD and the parts pulse.
- [ ] Rung 5 on the headset: the Task 2 check, plus one real question with the server on the tunnel.
- [ ] Merge to `main` (fast-forward), push, CI green.
