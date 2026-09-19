# Reusable open-source code for the Cut Once Quest 3 app: rendering, UI and network plumbing

Scope: code-level sources the team can copy or adapt for `VisualStateResolver`, `PartView`, `HologramPalette`, `HudController`, `TimelineController`, `ApiClient`, `WsClient`, `Outbox`, `Journal`, `MicRecorder` and `PcmStreamPlayer`. Baseline facts about the fork, checked against GitHub on 2026-09-19:

- QuestCameraKit (MIT, 577 stars, last commit 2026-09-08 "Refresh README…") builds on Unity `6000.3.12f1` — [ProjectVersion.txt](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/ProjectSettings/ProjectVersion.txt)
- Its manifest pins `com.meta.xr.sdk.core` 205.0.0, `com.meta.xr.mrutilitykit` 205.0.0, URP 17.3.0, `com.unity.inputsystem` 1.20.0, `com.unity.ugui` 2.0.0, `com.unity.webrtc` 3.0.0, SimpleWebRTC (git) and `com.endel.nativewebsocket` (git, commit `ea014c9…`). Interaction SDK and XR Interaction Toolkit are **not** installed — [manifest.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/manifest.json)
- Player settings: `m_StereoRenderingPath: 2` (single-pass instanced), `scriptingBackend: Android: 1` (IL2CPP), `activeInputHandler: 1` (new Input System only), `ForceInternetPermission: 1`, `insecureHttpOption: 0` (plain-HTTP downloads not allowed), `AndroidMinSdkVersion: 32` — [ProjectSettings.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/ProjectSettings/ProjectSettings.asset)

---

## Hologram look: URP shaders/Shader Graphs (transparent, fresnel, box edges, grid, pulse) that work with single-pass instanced stereo on Quest, overdraw/sorting, and outline options

### Takeaway
No MIT-licensed, Unity-6-ready "ghost/blueprint" shader exists that we can drop in. The only MIT hologram graph found (daniel-ilett) is a 2019.4/URP 7 fresnel + scanline graph, useful as a node recipe. Write `CutOnce/Hologram` ourselves as a URP Unlit Shader Graph with one Custom Function node that computes box edges, corner brackets and the grid from object-space position and object scale. URP Shader Graph handles single-pass instanced stereo on its own. The fork already contains a hand-written URP HLSL shader with correct stereo macros to copy if we fall back to HLSL. Skip QuickOutline and the screen-space outline render features: draw the SELECTED outline as a white-edge setting inside the same shader. Watch out for two Quest problems. `MaterialPropertyBlock` turns the SRP Batcher off for that renderer. Low-alpha transparent pixels over passthrough may show up wrong, so test α=0.05 on the device during the first hour.

### Cited Findings
**Hologram / ghost shader repos**
- `daniel-ilett/shaders-hologram`: **MIT**, 70★, last push 2020-07-20. The single asset is `Assets/Shaders/Hologram.shadergraph`, described as "a fresnel around the outer edge of the object, with a scanline texture projected over the object on the global y-axis, moving slowly downwards". It was made with **Unity 2019.4.0f1 / URP 7.3.1** — [repo README](https://github.com/daniel-ilett/shaders-hologram); walkthrough in the [tutorial](https://danielilett.com/2020-07-12-tut5-9-urp-hologram/)
- The graph's nodes (read from the `.shadergraph` JSON) are Fresnel Effect, Position, Transform, Split, Tiling And Offset, Time, Sample Texture 2D (the scanline texture), 2× Simple Noise (glitch), Add/Multiply, and properties Main Color, Fresnel Color, Scroll Speed, Scanline Offset, Noise Scale/Strength, Glitch Strength. It uses the old **PBR Master** node, so Unity 6 will upgrade it to the Master Stack on import — [Hologram.shadergraph](https://github.com/daniel-ilett/shaders-hologram/blob/master/Assets/Shaders/Hologram.shadergraph)
- `matsu224/shader-hologram-unity-urp` (a hand-written `Assets/_Matsu/Shaders/Hologram.shader`, last push 2026-09-16) has **no licence file**, so legally it cannot be copied — [repo](https://github.com/matsu224/shader-hologram-unity-urp)
- Ben Golus's "Pristine Grid" shader is the reference technique for anti-aliased, moiré-free grid lines. It uses `ddx/ddy` of the grid UV inside a `PristineGrid(float2 uv, float2 lineWidth)` function. The gist (updated 2026-07-24) is **CGPROGRAM, has no stereo macros and carries no licence text**, so re-implement the idea rather than paste the file — [gist](https://gist.github.com/bgolus/d49651f52b1dcf82f70421ba922ed064), [article](https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8)
- Commercial options (Hologram Shaders Pro and others) came up in search. They are not open source — [search result: daniel-ilett tutorial page](https://danielilett.com/2020-07-12-tut5-9-urp-hologram/), [Cyanilux hologram breakdown](https://www.cyanilux.com/tutorials/hologram-shader-breakdown/) (tutorial text; licence of its code not checked)

**Single-pass instanced (SPI) stereo**
- Unity manual: "Unity's Universal Render Pipeline (URP), High Definition Render Pipeline (HDRP), Shader Graph (except in the built-in render pipeline), Surface shaders, and built-in shaders already support single-pass stereo instanced rendering." Hand-written shaders need `UNITY_VERTEX_INPUT_INSTANCE_ID` (input), `UNITY_VERTEX_OUTPUT_STEREO` (v2f), `UNITY_SETUP_INSTANCE_ID` / `UNITY_INITIALIZE_OUTPUT` / `UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO` (vertex) and `UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX` (fragment) — [Unity Manual: Single-pass instanced rendering and custom shaders](https://docs.unity3d.com/Manual/SinglePassInstancing.html)
- The fork already has a working hand-written URP HLSL template with those macros: `Assets/Samples/4 Shaders/Shaders/StereoPassthroughFrostedGlass.shader`. It uses `Tags { "RenderPipeline"="UniversalPipeline" … }`, `#pragma multi_compile_instancing`, `#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"`, `UNITY_VERTEX_INPUT_INSTANCE_ID`, `UNITY_VERTEX_OUTPUT_STEREO`, `UNITY_SETUP_INSTANCE_ID(IN)`, `UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(OUT)` and `UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(IN)` — [StereoPassthroughFrostedGlass.shader](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/4%20Shaders/Shaders/StereoPassthroughFrostedGlass.shader)

**Batching / MaterialPropertyBlock**
- SRP Batcher requirement: "The GameObject mustn't use MaterialPropertyBlocks." URP lit and unlit shaders already meet the shader-side `UnityPerMaterial` CBUFFER requirement — [Unity Manual: SRP Batcher materials](https://docs.unity3d.com/6000.3/Documentation/Manual/SRPBatcher-Materials.html)

**Quest performance guidance (Meta)**
- "Avoid overlapping alpha-blended geometry (e.g., dense particle effects) and full-screen post processing effects." "Keep alpha blended transparency to a minimum." "Avoid full screen image effects." "Keep the total number of draw calls to a minimum." "50,000 static triangles per-eye per-view is a conservative target." — [Meta: Android/Quest performance intro](https://developers.meta.com/horizon/documentation/unity/unity-mobile-performance-intro/)
- Search-result summary of Meta docs: the transparent queue draws back-to-front without depth testing and is prone to overdraw. Unity's Scene View has an Overdraw render mode — [Meta perf docs](https://developers.meta.com/horizon/documentation/unity/unity-perf/) (via search snippet, not fetched in full)

**Transparency over passthrough (MR-specific risk)**
- On Quest 3 with a transparent camera background, Unity 6000.2.6f2 / URP 17.2 / Meta XR v78 / OpenXR 1.15.1, one user reports that "transparent material objects are invisible wherever there's no opaque object behind them". The poster (2025-10-29) says it happens "when alpha on the material is zero" and works around it with a 1 % opacity floor and `Blend SrcAlpha OneMinusSrcAlpha, SrcAlpha DstAlpha` — [Unity Discussions thread](https://discussions.unity.com/t/on-quest-3-when-camera-background-is-set-to-transparent-transparent-material-objects-are-invisible-wherever-theres-no-opaque-object-behind-them/1692803). Related reports: [Unity thread: passthrough shows through opaque when alpha < 1](https://discussions.unity.com/t/meta-quest-passthrough-issue-passthrough-shows-through-opaque-objects-when-object-in-front-has-alpha-1/1598436), [Meta forum: transparent materials render passthrough through them](https://communityforums.atmeta.com/t5/Unity-VR-Development/Transparent-Materials-render-Passthrough-through-them-even/td-p/1060049)

**Outline options**
- `chrisnolet/QuickOutline`: **MIT**, 697★, last push 2024-05-23. Files: `QuickOutline/Scripts/Outline.cs`, `Resources/Shaders/OutlineMask.shader`, `OutlineFill.shader` — [repo](https://github.com/chrisnolet/QuickOutline). The fill shader is CG (built-in `UnityCG.cginc`) but has the SPI macros:
  ```
  "Queue" = "Transparent+110"   Cull Off   ZTest [_ZTest]   ZWrite Off
  Blend SrcAlpha OneMinusSrcAlpha   Stencil { … }
  UNITY_VERTEX_INPUT_INSTANCE_ID … UNITY_VERTEX_OUTPUT_STEREO
  UNITY_SETUP_INSTANCE_ID(input); UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
  ```
  — [OutlineFill.shader](https://github.com/chrisnolet/QuickOutline/blob/master/QuickOutline/Resources/Shaders/OutlineFill.shader)
- QuickOutline's cost model: `Awake` does `Instantiate(Resources.Load<Material>("Materials/OutlineMask"))` and `…OutlineFill`, then bakes smooth normals (`LoadSmoothNormals` / `SmoothNormals(meshFilter.sharedMesh)`). `OnEnable` appends both materials, which adds two extra draws per outlined renderer, and assigns `renderer.materials = materials.ToArray()`. `OnDisable` removes them — [Outline.cs](https://github.com/chrisnolet/QuickOutline/blob/master/QuickOutline/Scripts/Outline.cs)
- QuickOutline issue #46 (2025-09-17): "Outline Won't Toggle Off on Quest 3 Build (URP + Unity 6)" (Unity 6.2, Vulkan, SPI). A 2026-04-27 reply says it works if you use `outline.enabled = false` and don't instantiate the material in code — [issue #46](https://github.com/chrisnolet/QuickOutline/issues/46)
- Do not mix it up with `ririv/QuickOutline`, which is an **AGPL-3.0** PDF-bookmark tool and unrelated (GitHub search result)
- `CristianQiu/Unity-URP-Outline`: **MIT**, last push 2026-03-28, requires Unity **6000.3.0+**. It is a render feature driven by rendering layers `Outline_1..4` and the Volume system, and needs post-processing on in both the camera and the renderer, so it is a screen-space pass — [README](https://github.com/CristianQiu/Unity-URP-Outline)
- `Arvtesh/UnityFx.Outline`: **MIT**, 1,396★, last push 2023-05-07. Screen-space outlines. Its README (per search snippet) claims URP and XR Multi Pass / Single Pass Instanced support — [repo](https://github.com/Arvtesh/UnityFx.Outline)

### Inferences
**Recommended shader architecture (`CutOnce/Hologram`)**
- Build it as a **URP Unlit Shader Graph, Surface = Transparent, Render Face = Front, Depth Write off**. Put the geometry math in one **Custom Function node** (an HLSL file). Shader Graph then supplies SPI stereo, SRP-Batcher CBUFFERs and the URP passes, and the maths stays in plain HLSL we can also reuse from a hand-written fallback. (We did not open the Unity 6 Graph Settings doc page. It returned 404, so check the exact setting names in the Editor.)
- Get **box extents with no per-part data** by having `ShapeFactory` build every box as Unity's unit cube (object-space positions in [-0.5, 0.5]) scaled by `transform.localScale = size`. The shader recovers the size from the object-to-world matrix (Shader Graph's Object node exposes Scale). This removes the need for a `_Size` property per part. Sketch of our own HLSL (not taken from any source):
  ```hlsl
  void BoxEdges_float(float3 posOS, float3 scale, float edgeW, float bracketL, out float edge, out float bracket, out float3 faceUV)
  {
      float3 d  = (0.5 - abs(posOS)) * scale;            // metres to the nearest face on each axis
      float3 fw = max(fwidth(d), 1e-5);                  // screen-space AA (Golus-style)
      float3 n  = 1 - saturate((d - edgeW) / fw);         // 1 when within edgeW of a face
      edge    = saturate(n.x*n.y + n.y*n.z + n.z*n.x);     // two axes near a face = on an edge
      bracket = edge * step(max(d.x, max(d.y, d.z)), bracketL); // edge AND near a corner = corner bracket
      faceUV  = posOS * scale;                           // metres, feed two axes to the grid function
  }
  ```
  Grid: take the two axes of `faceUV` that are not the face normal (the axis with the smallest `d`), divide by `_GridScale`, and run a derivative-based AA line function in the Golus style, re-implemented, not copied. Pulse: `0.5 + 0.5*sin(_Time.y * 2π * _PulseHz)`. Scanning stripe: `frac(posWS.y * k - _Time.y * speed + _StripePhase)`. Cylinders and meshes: `pow(1 - saturate(dot(N, V)), p)` for the fresnel rim, the same recipe as the daniel-ilett graph.
- **Sorting/overdraw.** Front faces only (Cull Back) with ZWrite off means each part adds at most one blended layer per pixel. With about 20–40 parts that stays well inside Meta's "keep alpha blending to a minimum" advice. Unity sorts transparent renderers back-to-front by bounds centre, which works for mostly separate boxes. Parts that touch or pass through each other (leg into panel) can flip order. Two ways to handle it: (a) give CURRENT_STEP / WRONG a higher render queue (e.g. Transparent+10) so the important part always draws last; (b) render edges **additively** (`Blend One One`). Additive blending is order-independent, so the sorting problem goes away for edges, and holograms usually look additive on passthrough anyway. For FUTURE (α 0.05) think about drawing edges only and skipping the fill, which costs almost nothing.
- **MPB versus SRP Batcher.** MPB takes the renderer out of the SRP Batcher (cited). At about 30–60 parts that costs about 30–60 separate draws, which is fine on Quest 3. For a cheaper hybrid, make `HologramPalette` create **one shared material per base state** (SRP-batched) and have `PartView` apply an MPB only to the few parts with SELECTED/HIGHLIGHTED/VERIFYING modifiers. Clear the MPB (`renderer.SetPropertyBlock(null)`) when the modifier goes away. Animated values (pulse, stripe) come from `_Time` in the shader, so they never need per-frame MPB writes.
- **Outline for SELECTED.** Don't use QuickOutline for boxes. Setting `_EdgeColor = white` and a thicker `_EdgeWidth` in the same shader costs nothing more. QuickOutline adds two passes per renderer, a smooth-normal bake hitch, material instantiation, and an open Quest 3 / Unity 6 toggle report. It only makes sense for the rare `mesh` parts. The screen-space outline features (CristianQiu, UnityFx) need post-processing / full-screen passes, which Meta says to avoid. Skip them.
- **Passthrough alpha risk.** Test on device in hour 1. Put a BUILT/FUTURE-style part over bare passthrough and check it is visible. If low-alpha fills disappear, the fixes to try are separate alpha blending (`Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha`), an alpha floor, or additive blending. This rests on one forum report on a slightly older stack (Unity 6000.2 / Meta v78), not a confirmed bug in 205.
- **No bloom, no geometry-shader wireframes.** The blueprint already keeps bloom off. For wireframes, the object-space edge maths above replaces geometry-shader wireframe repos such as `nobnak/WireframeShaderUnity` (MIT, found in search, not inspected).

**Class mapping**
| Class | Borrow |
|---|---|
| `HologramPalette` (SO) | Nothing external. Per-state values follow blueprint §8. Optionally owns one `Material` per base state (hybrid batching). |
| `PartView` | Standard MPB pattern: cached `Shader.PropertyToID`, `GetPropertyBlock → Set* → SetPropertyBlock`. The fork's StereoPassthrough shader is the template for a hand-written fallback. |
| `CutOnce/Hologram` | Our Custom Function HLSL (sketch above) + daniel-ilett fresnel/scanline node chain (MIT, attribution) + Golus-style AA line technique (re-implemented). |
| `VisualStateResolver` | Pure C#. No external code needed. |

### Gaps
- Did not find an open-source Unity 6 URP "box-edge / corner-bracket" shader. The HLSL above is our own sketch and has not been run.
- Did not check the MSAA setting in the fork's URP asset. 4× MSAA helps thin edge lines, but its cost/benefit on Quest 3 was not measured here.
- Did not check the Unity 6000.3 docs for the exact Shader Graph setting names (Depth Write / Render Face / Sorting Priority). The page returned 404.
- UnityFx.Outline's XR claim comes only from a search snippet.

---

## WebSocket in Unity on Android/Quest: NativeWebSocket vs alternatives, main-thread dispatch, auth, reconnect, known Android issues; which NativeWebSocket the fork ships

### Takeaway
The fork pins **NativeWebSocket 1.1.6** (git commit `ea014c9`, Apache-2.0). It wraps `System.Net.WebSockets.ClientWebSocket` and needs `ws.DispatchMessageQueue()` in `Update()`. On native platforms it supports request headers, so either `Authorization: Bearer` or the `?token=` query works. **Keep 1.1.6 for the hackathon.** 2.0.x (current 2.0.7, 2026-08-07) is a breaking rewrite. It auto-dispatches through `SynchronizationContext`, has a different package branch (`#upm-2`), and SimpleWebRTC in the fork was written against 1.x. The library has no reconnect logic, so `WsClient` wraps `await ws.Connect()` in a backoff loop, using Colyseus's MIT constants as the model. Android issues to watch: wss needs the full certificate chain, the INTERNET permission must be present (already forced in the fork), and 1.1.6 collapses custom close codes.

### Cited Findings
- The fork's manifest: `"com.endel.nativewebsocket": "https://github.com/endel/NativeWebSocket.git#ea014c9ae534d56111962d96f89f8a046e302dc9"` — [manifest.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/manifest.json). Lock file source `git`, same hash — [packages-lock.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/packages-lock.json)
- Commit `ea014c9` (2026-03-05, "Update upm to output generated at e51e38a") is on the `upm` branch. Its `package.json` says `"version": "1.1.6"`, `"license": "Apache 2.0"`, `"unity": "2019.1"`. Files: `WebSocket/WebSocket.cs` (848 lines), `WebSocket.jslib`, `WebSocket.jspre`, `endel.nativewebsocket.asmdef`, `Samples~/WebSocketExample/Connection.cs` — [package.json @ ea014c9](https://github.com/endel/NativeWebSocket/blob/ea014c9ae534d56111962d96f89f8a046e302dc9/package.json), [tree](https://github.com/endel/NativeWebSocket/tree/ea014c9ae534d56111962d96f89f8a046e302dc9)
- Repo status: 1,724★, default branch `master`, 57 open issues. GitHub reports the licence as NOASSERTION, but `LICENSE` starts "Copyright 2019 Endel Dreyer / Copyright 2018 Jiri Hybek" and the package.json says Apache 2.0. Releases: 1.1.5 (2025-02-07), 1.1.6 (2026-03-05), 2.0.0 (2026-03-11) … 2.0.7 (2026-08-07) — [repo](https://github.com/endel/NativeWebSocket), [releases](https://github.com/endel/NativeWebSocket/releases)
- 1.1.6 native constructor and header support (non-WebGL path):
  ```csharp
  public WebSocket(string url, Dictionary<string, string> headers = null)
  …
  m_Socket = new ClientWebSocket();
  foreach (var header in headers) m_Socket.Options.SetRequestHeader(header.Key, header.Value);
  await m_Socket.ConnectAsync(uri, m_CancellationToken);
  OnOpen?.Invoke();
  await Receive();          // Connect() only completes when the socket closes
  ```
  Exceptions in `Connect()` are caught and raised as `OnError(ex.Message)` then `OnClose(WebSocketCloseCode.Abnormal)` — [WebSocket.cs @ ea014c9](https://github.com/endel/NativeWebSocket/blob/ea014c9ae534d56111962d96f89f8a046e302dc9/WebSocket/WebSocket.cs)
- 1.1.6 receive/dispatch: `Receive()` switches to a background thread (`await new WaitForBackgroundThread()`), reads 8 KB frames into a MemoryStream until `EndOfMessage`, and adds text and binary messages to `m_MessageList` under `IncomingMessageLock`. Only `DispatchMessageQueue()` calls `OnMessage`:
  ```csharp
  public void DispatchMessageQueue() {
      if (m_MessageList.Count == 0) return;
      List<byte[]> messageListCopy;
      lock (IncomingMessageLock) { messageListCopy = new List<byte[]>(m_MessageList); m_MessageList.Clear(); }
      for (int i = 0; i < messageListCopy.Count; i++) OnMessage?.Invoke(messageListCopy[i]);
  }
  ```
  `OnClose` fires after `await new WaitForUpdate()`, which puts it back on the main thread — [WebSocket.cs @ ea014c9](https://github.com/endel/NativeWebSocket/blob/ea014c9ae534d56111962d96f89f8a046e302dc9/WebSocket/WebSocket.cs)
- In-fork precedent: SimpleWebRTC (MIT) calls it every frame: `private void Update() { #if USE_NATIVEWEBSOCKET && (!UNITY_WEBGL || UNITY_EDITOR) webRTCManager.DispatchMessageQueue();` and builds sockets with `new WebSocket(webSocketUrl, new Dictionary<string,string>{{"user-agent","unity webrtc"}})` — [WebRTCConnection.cs @ d3fc983](https://github.com/FireDragonGameStudio/SimpleWebRTC/blob/d3fc983d0c91c150a41f42e6ceb5124baaba5891/Assets/SimpleWebRTC/Runtime/Scripts/Connections/WebRTCConnection.cs), [WebRTCManager.cs](https://github.com/FireDragonGameStudio/SimpleWebRTC/blob/d3fc983d0c91c150a41f42e6ceb5124baaba5891/Assets/SimpleWebRTC/Runtime/Scripts/Connections/WebRTCManager.cs). The fork's `WebRTCDefineSymbolChecker.cs` manages that define ("Tools/Update WebRTC Define Symbol") — [WebRTCDefineSymbolChecker.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/6%20WebRTC/Scripts/Editor/WebRTCDefineSymbolChecker.cs)
- 2.x breaking changes: "The core library no longer depends on `UnityEngine`." `MainThreadUtil`, `WaitForUpdate` and related classes are removed. "In 2.x, events are automatically dispatched to the main thread via `SynchronizationContext` in Unity … **Remove the `Update()` dispatch call.**" `Close(code, reason)` is new. "In 2.x … Use UPM or the `.unitypackage` instead of copying raw files." The install URL is `…NativeWebSocket.git#upm-2`, and `#upm` still serves 1.x — [README](https://github.com/endel/NativeWebSocket/blob/master/README.md)
- Fixes in 2.0.5 that 1.1.6 lacks. Close codes outside the enum were reported as `1004`, so application codes 3000–4999 couldn't be told apart. And "no closing handshake response was ever sent", so a deliberate close looked to servers like a dropped connection (1006). 2.0.7 fixed event/message ordering for hosts without a `SynchronizationContext` ("With one present (as in Unity) events are posted directly and were already ordered correctly") — [CHANGELOG](https://github.com/endel/NativeWebSocket/blob/master/CHANGELOG.md)
- Android wss: "I fixed the problem by using `fullchain.pem` instead of `cert.pem`" (Unity on Android can't fetch intermediate certificates) — [issue #20 comment](https://github.com/endel/NativeWebSocket/issues/20#issuecomment-856955038). Same fix confirmed in [issue #83](https://github.com/endel/NativeWebSocket/issues/83). The maintainer points Quest 2 users to these answers in [issue #81](https://github.com/endel/NativeWebSocket/issues/81)
- Android INTERNET permission: "on Development build unity add [INTERNET] … but normal build unity does not add internet permition". Fix: Player Settings → Internet Access = Require — [issue #20 comment](https://github.com/endel/NativeWebSocket/issues/20#issuecomment-975018938). The fork already has `ForceInternetPermission: 1` — [ProjectSettings.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/ProjectSettings/ProjectSettings.asset)
- Maintainer: "This library does not have any mechanism to retry on failed connection attempts." — [issue #71](https://github.com/endel/NativeWebSocket/issues/71). Unresolved: Quest 2 build can't reach a LAN (ESP32) WS server — [issue #95](https://github.com/endel/NativeWebSocket/issues/95). Android background plus Wi-Fi off, OnClose not called (closed as the reporter's own bug) — [issue #78](https://github.com/endel/NativeWebSocket/issues/78)
- Reconnect/backoff constants to borrow (Colyseus Unity SDK, **MIT**, last push 2026-09-17): `MaxRetries = 15; MinDelay = 100; MaxDelay = 5000; MinUptime = 5000; Delay = 100; MaxEnqueuedMessages = 10;` and
  ```csharp
  public static int ExponentialBackoff(int attempt, int delay) => (int)Math.Floor(Math.Pow(2, attempt) * delay);
  ```
  — [Room.cs](https://github.com/colyseus/colyseus-unity-sdk/blob/master/Assets/Colyseus/Runtime/Colyseus/Room.cs). Colyseus now ships its own transport (`Transport/WebSocket.cs`, `WebSocketDispatchLoop.cs`) — [colyseus-unity-sdk tree](https://github.com/colyseus/colyseus-unity-sdk)
- `ApiClient` pattern already in the fork (Unity 6 compiles `await request.SendWebRequest()`):
  ```csharp
  using var request = new UnityWebRequest(url, "POST");
  request.timeout = 60;
  request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
  request.downloadHandler = new DownloadHandlerBuffer();
  request.SetRequestHeader("Content-Type", "application/json");
  request.SetRequestHeader("Authorization", "Bearer " + apiKey);
  ```
  — [ImageOpenAIConnector.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/ImageOpenAIConnector.cs), `await request.SendWebRequest()` in [STTManager.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/STTManager.cs)

### Inferences
- **`WsClient` on 1.1.6** (our sketch, built only from the APIs quoted above):
  ```csharp
  async void RunLoop() {                          // started from Start(); main thread throughout
    int attempt = 0;
    while (!destroyCancellationToken.IsCancellationRequested) {
      ws = new WebSocket($"{wssBase}/v1/stream?token={Uri.EscapeDataString(token)}&client=quest",
                         new Dictionary<string,string>{{"Authorization","Bearer "+token}});
      ws.OnOpen    += () => { attempt = 0; Online?.Invoke(true); _ = outbox.FlushAsync(); };
      ws.OnMessage += b => router.Route(Encoding.UTF8.GetString(b));   // runs inside DispatchMessageQueue
      ws.OnClose   += c => Online?.Invoke(false);
      await ws.Connect();                           // returns only after close/failure (1.1.6 semantics)
      int ms = Math.Min(5000, (int)(Math.Pow(2, Math.Min(attempt++, 6)) * 100)) + UnityEngine.Random.Range(0, 250);
      await Task.Delay(ms);                         // blueprint: poll GET events?after= every 2 s meanwhile
    }
  }
  void Update() => ws?.DispatchMessageQueue();
  ```
  A new `WebSocket` object is created per attempt because 1.1.6 disposes `m_Socket` in `finally`. After `OnOpen`, always catch up with `GET /v1/assemblies/:aid/events?after=<head>` because messages sent while the socket was down are gone.
- **Do not upgrade to 2.x mid-hackathon.** SimpleWebRTC's dispatch calls would still compile (the method stays), but 2.x drops `MainThreadUtil`/`WaitForUpdate` and changes packaging. If the WebRTC sample is deleted after gate G4, **keep the `com.endel.nativewebsocket` manifest line**. It is a direct dependency and does not depend on the `USE_NATIVEWEBSOCKET` define.
- **Close codes.** With 1.1.6, any custom server close code (e.g. 4001 bad token) shows up as 1004/Undefined, and the server sees 1006. Signal auth failure some other way, e.g. an HTTP 401 on the upgrade, which ends up in `OnError`, or a JSON `{"type":"error"}` message before closing.
- **TLS / HTTP.** Serve wss with the full chain; Cloudflare/Fly/Render/Railway-style hosts do this by default. For LAN testing against a laptop over plain `http://`, UnityWebRequest calls fail because `insecureHttpOption: 0`. Set "Allow downloads over HTTP" to development builds only, or use a tunnel with TLS. It is unclear whether the managed `ClientWebSocket` `ws://` path is affected by that setting, so test it.
- **Alternatives.** Calling `System.Net.WebSockets.ClientWebSocket` directly is what NativeWebSocket does on native platforms anyway. Colyseus's newer transport is tied to Colyseus. There is no reason to switch.

**Class mapping**
| Class | Borrow |
|---|---|
| `WsClient` | NativeWebSocket 1.1.6 (Apache-2.0, already in the fork) + Colyseus exponential backoff (MIT) + `DispatchMessageQueue()` in `Update()` as in SimpleWebRTC |
| `ApiClient` | UnityWebRequest + `UploadHandlerRaw` + `DownloadHandlerBuffer` + bearer header, copied from `ImageOpenAIConnector.cs` (MIT). `await SendWebRequest()` as in `STTManager.cs` |

### Gaps
- Did not find a 2025–2026 write-up comparing NativeWebSocket with other free Unity WebSocket clients on Quest. Best HTTP/2 and similar paid assets were not assessed.
- It was not verified whether the "Allow downloads over HTTP" setting covers managed `ClientWebSocket` `ws://`.
- Issue #95 (Quest 2 to a LAN server) has no resolution, so the cause is unknown.

---

## JSON in Unity for our schemas: Newtonsoft handling of [x,y,z] tuples, discriminated unions (`shape.type`, `WsMessage.type`), nullable vs optional fields

### Takeaway
Newtonsoft is already in the fork: `com.unity.nuget.newtonsoft-json` 3.2.2 resolved, pulled in by MRUK 205 and `com.unity.ai.inference`. Unity's package is a fork of the IL2CPP-hardened jilleJr fork (Newtonsoft 13.0.2). Tuples: deserialize as `float[]`/`double[]` in the DTOs so `CutOnce.Core` stays free of UnityEngine, and convert in `ModelSpace`. Unions: hand-write one small `JsonConverter` per union (Shape, WsMessage, DirectorCommand, CopilotAction) that reads `JObject["type"]`. Register it in settings with an exact-type `CanConvert`. JsonSubTypes (MIT) is the library alternative. Nullable: keep `NullValueHandling.Include` by default, because zod `.nullable()` keys such as `BuildEvent.version` must be present as `null`. Mark only `.optional()` fields `[JsonProperty(NullValueHandling = Ignore)]`.

### Cited Findings
- The fork's lock resolves `com.unity.nuget.newtonsoft-json` **3.2.2** at depth 1. It is required by `com.meta.xr.mrutilitykit` 205.0.0 (`3.0.2`) and `com.unity.ai.inference` 2.6.1 (`3.2.1`). `com.unity.collections` resolves to 2.6.5 — [packages-lock.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/packages-lock.json)
- The Unity package "corresponds to Newtonsoft.Json version 13.0.2" — [Unity Newtonsoft package docs](https://docs.unity3d.com/Packages/com.unity.nuget.newtonsoft-json@3.2/manual/index.html)
- Unity's package, "since v2.0.0-preview.1, is a fork of this fork of Newtonsoft.Json". It includes the `Newtonsoft.Json.Utilities.AotHelper` type and "All my IL2CPP and managed code stripping specific bugfixes." The jilleJr/applejag repo is archived (last push 2022-03-03) — [applejag/Newtonsoft.Json-for-Unity README](https://github.com/applejag/Newtonsoft.Json-for-Unity)
- `applejag/Newtonsoft.Json-for-Unity.Converters` (MIT, last push 2025-09-27) marks itself **"This project is unmaintained"**. Its `Vector3Converter` writes objects (`{"x":201.0,"y":219.5,"z":0.0}`), not arrays, and exists mainly to avoid "Self referencing loop detected for property 'normalized'" — [converters README](https://github.com/applejag/Newtonsoft.Json-for-Unity.Converters)
- `manuc66/JsonSubTypes` (**MIT**, 434★, last push 2026-09-16) handles unions with attributes: `[JsonConverter(typeof(JsonSubtypes), "Sound")] [JsonSubtypes.KnownSubType(typeof(Dog), "Bark")]` — [JsonSubTypes README](https://github.com/manuc66/JsonSubTypes)
- The fork's own samples use `JsonUtility.ToJson`. JsonUtility cannot handle dictionaries, tuples or polymorphism, so it is not suitable for our schemas — [ImageOpenAIConnector.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/ImageOpenAIConnector.cs) (JsonUtility's limits are general Unity knowledge, not re-verified here)
- The fork builds with IL2CPP (`scriptingBackend: Android: 1`), so stripping matters — [ProjectSettings.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/ProjectSettings/ProjectSettings.asset)
- Schema facts this depends on: `Vec3`/`Size3`/`Quat`/`BBoxPx` are `z.tuple`. `Shape`, `CopilotAction`, `DirectorCommand` and `WsMessage` are `z.discriminatedUnion("type", …)`. `BuildEventBase.version` is `.nullable()` (required key). `BuildState.parts` is `z.record(PartStatus)`. `progress.by_layer` is `z.record(z.tuple([int,int]))`. The server's "strip" mode drops unknown keys — `/Users/michaelmazilu/Projects/hack-the-north/packages/schemas/src/factory.ts` (local file)

### Inferences
- **Tuples.** Declare DTO fields `public double[] position; public double[] size; public double[] rotation_quat;`. Newtonsoft handles JSON arrays with no converter, and `CutOnce.Core` stays pure C#, as the blueprint §13 asmdef table requires. `ModelSpace.ToUnity(double[] v)` converts, and handles the right-handed → Unity left-handed flip in one place (blueprint §5). If Vector3 in DTOs is wanted anyway, an array converter is about 10 lines (`JArray.Load(reader)` → `new Vector3((float)a[0],(float)a[1],(float)a[2])`; write with `WriteStartArray/WriteValue×3/WriteEndArray`). Don't use the applejag object-format converter.
- **Unions, simplest version.** For `Shape`, a flattened superset class with `string type; double[] size; string axis; double? diameter; double? length; double[][] points; string uri; string node; Bounds bounds;` needs no converter and is AOT-safe. `ShapeFactory` switches on `type`. For `WsMessage` use two-phase parsing in `WsClient`/router:
  ```csharp
  var jo = JObject.Parse(text);
  switch ((string)jo["type"]) {
    case "event_appended":   Handle(jo.ToObject<EventAppended>(Json.Serializer)); break;
    case "assembly_changed": Handle(jo.ToObject<AssemblyChanged>(Json.Serializer)); break;
    case "director_command": Handle(jo["command"].ToObject<DirectorCommand>(Json.Serializer)); break;
    default: Debug.Log($"ws: ignoring {(string)jo["type"]}"); break;   // forward-compatible, like zod strip
  }
  ```
  For a real polymorphic `Shape` base class, write a **non-generic** `JsonConverter` with `CanConvert(t) => t == typeof(Shape)`. Register it in `JsonSerializerSettings.Converters`, not as an attribute on the base class. `JsonConverter<T>.CanConvert` accepts subclasses, and an attribute on the base class is picked up by subclasses, so `jo.ToObject<BoxShape>(serializer)` would re-enter the converter and recurse. That behaviour comes from our knowledge of Newtonsoft internals and was not re-verified here.
- **Nullable vs optional.** zod `.nullable()` keys (`version`, `last_event_id`, `verified`, `current_step_id`, `selected_part_id`, `camera`, `audio_url`, `action`) must be serialized as `null`, so keep the default `NullValueHandling.Include`. zod `.optional()` fields (`part_id?`, `previous_state?`, `new_state?`, `step_id?`, `verification_id?`, `turn_id?`, `verdict?`, `note?`, `rotation_quat?`) should carry `[JsonProperty(NullValueHandling = NullValueHandling.Ignore)]`. An explicit `null` for an optional-but-not-nullable zod field is a validation error, even in strip mode.
- **Naming.** Use snake_case field names directly in the DTOs (`public string part_id;`), or set `ContractResolver = new DefaultContractResolver { NamingStrategy = new SnakeCaseNamingStrategy() }` once in a static `Json.Settings`.
- **IL2CPP stripping.** Add `Assets/CutOnce/link.xml` with `<assembly fullname="CutOnce.Core" preserve="all"/>`, or `[Preserve]` on DTOs. That stops stripping of constructors and properties only reached through reflection. Give every DTO a public parameterless constructor.
- **Records.** `Dictionary<string, PartStatus> parts`, `Dictionary<string, int[]> by_layer`, `Dictionary<string, double> timings_ms`.

**Class mapping**
| Class | Borrow |
|---|---|
| DTOs in `CutOnce.Core` | Newtonsoft (already present) + snake_case fields + `double[]` tuples. Optional: JsonSubTypes (MIT) |
| `WsClient` router | Two-phase `JObject` parse on `type` |
| `ApiClient` | `JsonConvert.SerializeObject(dto, Json.Settings)` / `DeserializeObject<T>` |

### Gaps
- The Unity package docs don't say anything about AOT or link.xml. The IL2CPP guidance above relies on the applejag README and general Unity practice.
- We did not test JsonSubTypes under IL2CPP stripping on Quest.

---

## Push-to-talk mic capture to WAV, and streaming PCM playback (ElevenLabs `pcm_22050` from `GET /v1/audio/:id`)

### Takeaway
The fork's ImageLLM sample already does record → OpenAI (Whisper) → TTS → play. Copy `SaveWav.cs` as is. Adapt `STTManager.cs` into `MicRecorder`: it has the Android runtime permission request, `Microphone.Start`, and a `GetPosition` edge case. Its playback (`AudioPlayer.cs`) is **not** streaming: it saves MP3 bytes to a temp file and loads them back. For `PcmStreamPlayer`, combine two MIT sources from RageAgainstThePixel. `DownloadHandlerCallback` subclasses `DownloadHandlerScript` and emits 512-byte-aligned chunks, which keeps int16 samples whole. `StreamAudioSource` is a queue drained in `OnAudioFilterRead`, with PCM16 decode and resampling in `PCMEncoder`. Unity documents that `DownloadHandlerScript` callbacks run on the main thread, `OnAudioFilterRead` runs on the audio thread, and a filter with no clip acts as a procedural source.

### Cited Findings
**Fork's ImageLLM sample** (MIT; `Assets/Samples/5 ImageLLM/Scripts/`: `STTManager.cs` 197 lines, `SaveWav.cs` 41, `AudioPlayer.cs` 72, `TTSManager.cs` 39, `VoiceCommandHandler.cs` 133, `ImageOpenAIConnector.cs` 347; prefabs `Whisper STT.prefab`, `Whisper TTS.prefab`, `OpenAI Manager.prefab`) — [folder](https://github.com/xrdevrob/QuestCameraKit/tree/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM)
- Permission + start (STTManager):
  ```csharp
  #if UNITY_ANDROID && !UNITY_EDITOR
  if (!Permission.HasUserAuthorizedPermission(Permission.Microphone)) {
      var callbacks = new PermissionCallbacks();
      callbacks.PermissionGranted += _ => { if (this && isActiveAndEnabled) StartRecording(); };
      Permission.RequestUserPermission(Permission.Microphone, callbacks); return; }
  #endif
  _clip = Microphone.Start(_selectedMic, false, Mathf.Max(1, recordingMaximum), 44100);   // recordingMaximum = 5 s
  ```
  Stop: `var frames = Microphone.GetPosition(_selectedMic);` and "A non-looping recording can report zero once its full buffer has stopped" → `frames = _clip.samples`. Then `Microphone.End`, `SaveWav.Save("output.wav", _clip, frames)`, and a multipart upload to `https://api.openai.com/v1/audio/transcriptions` (`whisper-1`) with a bearer header. The toggle is on `OVRInput.Button.Start` — [STTManager.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/STTManager.cs)
- WAV encoder (`SaveWav.Save(string, AudioClip, int sampleFrames = -1)`) writes a 44-byte RIFF header, PCM format 1, 16-bit, `clip.frequency`, and trims to `sampleFrames`:
  ```csharp
  writer.Write((ushort)1); writer.Write((ushort)clip.channels); writer.Write(clip.frequency);
  writer.Write(clip.frequency * clip.channels * 2); writer.Write((ushort)(clip.channels * 2)); writer.Write((ushort)16);
  writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(samples.Length * 2);
  foreach (var sample in samples) writer.Write((short)(Mathf.Clamp(sample, -1f, 1f) * short.MaxValue));
  ```
  — [SaveWav.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/SaveWav.cs)
- Playback (AudioPlayer) writes `tts-<guid>.mp3` to `Application.temporaryCachePath`, loads it with `UnityWebRequestMultimedia.GetAudioClip(uri, AudioType.MPEG)`, then plays it. It is not streaming — [AudioPlayer.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/AudioPlayer.cs). TTS requests go to `https://api.openai.com/v1/audio/speech` (`tts-1`) with `DownloadHandlerBuffer` — [ImageOpenAIConnector.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/ImageOpenAIConnector.cs), [TTSManager.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/TTSManager.cs)
- The fork's custom AndroidManifest has no `RECORD_AUDIO` line (it lists head tracking, hand tracking, anchors, `horizonos.permission.HEADSET_CAMERA`, passthrough, scene, boundary, vibrate) — [AndroidManifest.xml](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Plugins/Android/AndroidManifest.xml). Unity: "If the application uses the Microphone class adds the RECORD_AUDIO permission to the Android App Manifest and requests permission from the user the first time that the application uses Microphone." — [Unity Manual: Unity-handled permissions](https://docs.unity3d.com/6000.3/Documentation/Manual/android-permissions-in-unity.html)

**Streaming playback building blocks**
- `RageAgainstThePixel/com.utilities.audio`: **MIT**, v3.0.3 (last commit 2026-01-25), `"unity": "2021.3"`. Depends on `com.utilities.async` 3.0.2, `com.utilities.extensions` 1.3.8, `com.unity.collections` 1.2.4, audio modules. Runtime files include `StreamAudioSource.cs`, `PCMEncoder.cs`, `RecordingManager.cs`, `PCMStreamRecordingBehaviour.cs`, `Microphone.cs` — [package.json](https://github.com/RageAgainstThePixel/com.utilities.audio/blob/main/Utilities.Audio/Packages/com.utilities.audio/package.json), [repo](https://github.com/RageAgainstThePixel/com.utilities.audio)
- `StreamAudioSource` keeps a `NativeQueue<float>` and drains it on the audio thread, writing zeros on underrun:
  ```csharp
  private void OnAudioFilterRead(float[] data, int channels) {
      for (var i = 0; i < data.Length; i += channels) {
          if (audioQueue.TryDequeue(out var sample)) { for (var j = 0; j < channels; j++) data[i + j] = sample; }
          else { Array.Clear(data, i, data.Length - i); break; } } }
  public Task BufferCallbackAsync(NativeArray<byte> pcmData, int inputSampleRate, int outputSampleRate) {
      var samples = PCMEncoder.Decode(pcmData, inputSampleRate: inputSampleRate, outputSampleRate: outputSampleRate, allocator: Allocator.Persistent);
      … Enqueue(samples, samples.Length) … }
  ```
  `PCMEncoder` exposes `Decode(byte[]|NativeArray<byte>, PCMFormatSize, int? inputSampleRate, int? outputSampleRate)`, `Resample(float[], int, int)` and `Encode(float[], …)` — [StreamAudioSource.cs](https://github.com/RageAgainstThePixel/com.utilities.audio/blob/main/Utilities.Audio/Packages/com.utilities.audio/Runtime/StreamAudioSource.cs), [PCMEncoder.cs](https://github.com/RageAgainstThePixel/com.utilities.audio/blob/main/Utilities.Audio/Packages/com.utilities.audio/Runtime/PCMEncoder.cs)
- ElevenLabs Unity SDK (`RageAgainstThePixel/com.rest.elevenlabs`, **MIT**, last push 2026-03-09). Its sample streams PCM into that component: `new TextToSpeechRequest(voice, message, model: Model.FlashV2_5, outputFormat: OutputFormat.PCM_24000)` → `TextToSpeechAsync(request, async partialClip => await streamAudioSource.SampleCallbackAsync(partialClip.ClipSamples))` — [TextToSpeechDemo.cs](https://github.com/RageAgainstThePixel/com.rest.elevenlabs/blob/main/ElevenLabs/Packages/com.rest.elevenlabs/Samples~/TextToSpeech/TextToSpeechDemo.cs)
- `com.utilities.rest` (**MIT**, last push 2026-05-05), `DownloadHandlerCallback : DownloadHandlerScript`. It buffers into a MemoryStream and emits only whole multiples of `kEventChunkSize = 512` bytes, then flushes the remainder in `CompleteContent`:
  ```csharp
  stream.Write(unprocessedData, offset, dataLength);
  if (StreamOffset >= eventChunkSize) {
      var bytesToRead = eventChunkSize * (StreamOffset / eventChunkSize);
      stream.Position = streamPosition; var buffer = new byte[bytesToRead];
      streamPosition += stream.Read(buffer, 0, (int)bytesToRead);
      OnDataReceived?.Invoke(new Response(…, buffer, …)); }
  ```
  — [DownloadHandlerCallback.cs](https://github.com/RageAgainstThePixel/com.utilities.rest/blob/main/Utilities.Rest/Packages/com.utilities.rest/Runtime/DownloadHandlerCallback.cs)
- Unity: "The actual downloads occur on a worker thread, but all `DownloadHandlerScript` callbacks operate on the main thread." The byte-array constructor "reuses the supplied byte array to deliver data. Eliminates memory allocation." — [DownloadHandlerScript](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/Networking.DownloadHandlerScript.html)
- Unity: "OnAudioFilterRead is called on a different thread from the main thread (namely the audio thread)". "If this is the first filter in the chain and a clip isn't attached to the audio source, this filter will be played as the audio source." Multi-channel data is interleaved — [OnAudioFilterRead](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/MonoBehaviour.OnAudioFilterRead.html)
- Unity: with `AudioClip.Create(…, stream: true, pcmreadercallback)`, "streamed clips call this continuously". "If no audio data is available, you must fill the array with zeros." The page doesn't say which thread the callback runs on — [AudioClip.Create](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/AudioClip.Create.html)

### Inferences
- **`MicRecorder` (hold A).** Copy STTManager's permission block and GetPosition fix. Change: `Microphone.Start(null, false, 15, 16000)`. 16 kHz mono is enough for STT, and 15 s × 16 kHz × 2 B ≈ 480 KB, about 2.75× smaller than 44.1 kHz. Start on `OVRInput.GetDown(Button.One, RTouch)` and stop on `GetUp`. Throw away anything shorter than 0.3 s. Encode with the fork's `SaveWav.Save(...)` verbatim (MIT; keep the header). Ask for mic permission at app start, not on the first press, so the system dialog doesn't interrupt the demo. Unity would ask on first use anyway. Test on device that Quest honours 16 kHz; if not, record at 48 kHz and let the server resample.
- **`PcmStreamPlayer` (recommended, about 60 lines, our code).** (1) `UnityWebRequest.Get($"{api}/v1/audio/{turnId}")` with a bearer header and a `PcmDownloadHandler : DownloadHandlerScript` built on a preallocated 16 KB buffer. (2) In `ReceiveData(data, n)`, convert little-endian int16 to float starting at index 0, and carry an odd trailing byte into the next call. Alternatively accumulate and emit only even-length chunks, as DownloadHandlerCallback does. (3) Push into a lock-protected float ring buffer of about 10 s. (4) In `OnAudioFilterRead`, on an `AudioSource` with no clip, `spatialBlend = 0` and `Play()` called, pull samples with linear resampling (step = `22050f / AudioSettings.outputSampleRate`). Output zeros on underrun and set a `Drained` flag once the download is complete and the buffer is empty. Only `ring.Read` runs on the audio thread; everything else stays on the main thread (cited above).
- **Alternative with no resampling code.** `AudioClip.Create("tts", 22050*60, 1, 22050, true, OnPcmRead)` reading from the same ring buffer lets Unity resample 22050 → output rate. It is simpler, but the callback thread is undocumented and the clip has a fixed length. Either works. OnAudioFilterRead is the path proven in shipped MIT code.
- **Don't install `com.utilities.audio` just for this.** It pulls in 3 more OpenUPM packages (`com.utilities.async`, `com.utilities.extensions`, plus rest helpers), and its `NativeQueue` is read and written from two threads with no lock. Copy the pattern into our own class instead, keeping the MIT header.
- **Latency budget.** Start playback after about 150–250 ms of buffered audio (3.3k–5.5k samples at 22.05 kHz) to absorb network jitter. If the stream fails before the first bytes arrive, fall back to showing text only (blueprint §14).

**Class mapping**
| Class | Borrow |
|---|---|
| `MicRecorder` | `STTManager.cs` (permission, Start/End, GetPosition fix) + `SaveWav.cs` verbatim (both MIT, in the fork) |
| `PushToTalk` | `OVRInput.GetDown/GetUp(OVRInput.Button.One)`, the same OVRInput style the fork uses |
| `PcmStreamPlayer` | `DownloadHandlerScript` chunking (com.utilities.rest `DownloadHandlerCallback`, MIT) + `OnAudioFilterRead` queue (com.utilities.audio `StreamAudioSource`, MIT) + `PCMEncoder.Decode/Resample` logic |
| `CopilotClient` upload | `STTManager.SendToOpenAI` multipart pattern (`MultipartFormFileSection("audio", wav, "q.wav", "audio/wav")` + `MultipartFormDataSection("context", json)`) |

### Gaps
- Did not confirm Quest 3's native mic sample rate or whether `Microphone.Start(…, 16000)` gets resampled or rejected on device.
- `AudioSettings.outputSampleRate` on Quest 3 (commonly 48 kHz) was not checked.
- The thread `PCMReaderCallback` runs on is undocumented.

---

## World-locked MR UI on Quest: canvas with ray interaction, sliders, toasts; the simplest working pattern with controllers

### Takeaway
Don't add the Interaction SDK. The fork's QR sample already runs the simplest working pattern: a world-space uGUI canvas with Meta Core SDK's **`OVRRaycaster`** (`pointer` = `RightHandAnchor`) plus an EventSystem with **`OVRInputModule`** (`rayTransform` = `RightHandAnchor`, `joyPadClickButton` = PrimaryIndexTrigger). Both classes ship in `com.meta.xr.sdk.core` 205 and work with the fork's new-Input-System-only setting. The fork's `SampleMenu.cs` shows code-built world-space canvas sizing (720×640 at scale 0.0012). For the HUD, parent the canvas to `AssemblyRoot` instead of the camera. Make the timeline slider display-only and drive it from the thumbstick, as in the blueprint input map. Few widgets then need the ray at all.

### Cited Findings
- QR sample scene `Assets/Samples/3 QRCodeDetection/QRCodeDetection.unity` serializes an `OVRInputModule` with `rayTransform` → the `RightHandAnchor` Transform, `m_Cursor: {fileID: 0}`, `joyPadClickButton: 8192` (= `OVRInput.Button.PrimaryIndexTrigger`), `performSphereCastForGazepointer: 0`. `QRCodeSampleUI.cs` wires `OVRRaycaster.pointer`:
  ```csharp
  var raycaster = GetComponentInChildren<OVRRaycaster>();
  if (raycaster && !raycaster.pointer) raycaster.pointer = GameObject.Find("RightHandAnchor");
  ```
  — [QRCodeDetection.unity](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/QRCodeDetection.unity), [QRCodeSampleUI.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeSampleUI.cs), [QRCodeSampleUI.prefab](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Prefabs/QRCodeSampleUI.prefab)
- `com.meta.xr.sdk.core` 205.0.0 tarball contents: `Scripts/Util/OVRInputModule.cs` (`class OVRInputModule : PointerInputModule`; public `Transform rayTransform`, `OVRCursor m_Cursor`, `OVRInput.Button joyPadClickButton = OVRInput.Button.One`, `bool useRightStickScroll = true`), `Scripts/Util/OVRRaycaster.cs` (`class OVRRaycaster : GraphicRaycaster, IPointerEnterHandler`; `public GameObject pointer`; `RaycastPointer(...)`), `Scripts/Util/OVRRayHelper.cs`, `Prefabs/OVRRayHelper.prefab`, `Prefabs/OVR Sample Canvas.prefab`, `Scripts/Util/OVRGazePointer.cs`, `Scripts/Util/OVRPhysicsRaycaster.cs`, `Scripts/OVROverlayCanvas.cs`. In OVRInputModule, most legacy `Input.*` calls sit inside `#if ENABLE_LEGACY_INPUT_MANAGER`. The one unguarded call (`GetRawMoveVector` → `Input.GetAxisRaw`) is reached only through `SendMoveEventToSelectedObject`. That path first calls `AllowMoveEventProcessing`, which is `#else return false;` without the legacy manager, and it only runs when `eventSystem.sendNavigationEvents` is true. The QR scene's EventSystem also sets `m_sendNavigationEvents: 0` — [Unity registry: com.meta.xr.sdk.core](https://packages.unity.com/com.meta.xr.sdk.core) (tarball inspected), [QRCodeDetection.unity](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/QRCodeDetection.unity)
- `OVRInput.Button.PrimaryIndexTrigger = 0x00002000` (8192) and `Button.One = 0x00000001` ("RTouch: A") — `Scripts/OVRInput.cs` in the same tarball
- Licence: "Licensed under the Oculus SDK License Agreement" (not an OSI licence; free to use in apps for Meta platforms) — `LICENSE.md` in the same tarball; [Oculus SDK License](https://developers.meta.com/horizon/licenses/oculussdk/)
- The fork's input handling is `activeInputHandler: 1` (Input System package only) — [ProjectSettings.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/ProjectSettings/ProjectSettings.asset)
- Interaction SDK would be a new dependency: `com.meta.xr.sdk.interaction.ovr` 205.0.0 depends on `com.meta.xr.sdk.core` 205.0.0 and `com.meta.xr.sdk.interaction` 205.0.0. Neither is in the fork's manifest — [Unity registry: interaction.ovr](https://packages.unity.com/com.meta.xr.sdk.interaction.ovr), [manifest.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/manifest.json)
- Code-built world-space canvas in the fork (head-locked, with no raycasts and navigation on the thumbstick/X/Y):
  ```csharp
  _canvas.renderMode = RenderMode.WorldSpace;
  rect.sizeDelta = new Vector2(720, 640);
  rect.localScale = Vector3.one * 0.0012f;
  …
  _canvas.worldCamera = _camera;
  _canvas.transform.SetPositionAndRotation(_camera.transform.position + _camera.transform.forward * 1.15f, _camera.transform.rotation);
  ```
  — [SampleMenu.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/Common/Scripts/SampleMenu.cs)

### Inferences
- **HUD recipe.** `[HUD]` prefab containing Canvas (World Space, about 0.6 × 0.4 m, e.g. 1200×800 px at 0.0005 scale), `OVRRaycaster` (pointer = right controller anchor), `CanvasGroup`, TextMeshProUGUI (bundled with ugui 2.0 in Unity 6). The scene gets one EventSystem with `OVRInputModule` (`rayTransform` = right controller anchor, `joyPadClickButton` = PrimaryIndexTrigger). Copy the component setup from the QR sample prefab instead of building it by hand. Keep **Send Navigation Events off** on the EventSystem, as the QR scene does. `HudController` re-parents the panel under `AssemblyRoot` at a model-space pose "behind the desk, tilted toward the Operator" (blueprint §8), so it follows alignment nudges.
- **Visible ray.** OVRInputModule does not draw a ray. Either drop in `Prefabs/OVRRayHelper.prefab` from core (not inspected) or put a 2-point `LineRenderer` on the controller anchor, shortened to the hit distance. We would write the LineRenderer ourselves in about 20 lines.
- **Trigger conflict.** The trigger both clicks UI (OVRInputModule) and selects parts (`SelectionController`). In `SelectionController`, skip the physics raycast when the UI raycast hit (`OVRRaycaster`) is closer, or keep HUD buttons out of the desk's line of fire.
- **Widgets.** Progress = `Image` (type Filled) + label. Step card = TMP texts. History = a pooled vertical list of about 10 rows, not a ScrollRect, to avoid layout rebuild cost. Timeline = `Slider` with `interactable = false`, driven by `TimelineController.Cursor` (thumbstick input per blueprint §13). Toasts = a pool of 3 TMP labels on their **own child Canvas** with `CanvasGroup.alpha` fade. A separate canvas keeps frequent toast and pulse updates from dirtying the whole HUD canvas.
- **Text crispness.** `OVROverlayCanvas` (core) renders a canvas as a compositor layer for sharper text. It adds layer-ordering complexity with passthrough and occlusion, so treat it as optional polish.

**Class mapping**
| Class | Borrow |
|---|---|
| `HudController` | QR sample's OVRInputModule + OVRRaycaster wiring (Oculus SDK License, already in the fork); SampleMenu.cs canvas sizing (MIT) |
| `TimelineController` | Pure C# cursor; UI slider display-only; input via `OVRInput.Get(OVRInput.Axis2D.PrimaryThumbstick)` as SampleMenu does with `RawAxis2D.LThumbstick` |

### Gaps
- Did not open `OVRRayHelper.cs` or `OVR Sample Canvas.prefab`, so their exact behaviour is unverified.
- Did not check whether OVRInputModule's drag handling makes `Slider` dragging work smoothly with a controller ray. The recommendation avoids relying on it.
- No Meta ISDK sample code was inspected, because it isn't in the fork and ISDK is a heavier change.

---

## Offline outbox + JSONL journal in Unity (persistentDataPath, retry with backoff): reusable code

### Takeaway
No small Unity-specific outbox library turned up. The best MIT patterns to copy are Sentry .NET's `CachingTransport` and RestClient's retry loop. CachingTransport keeps one file per item plus a processing folder. It deletes a file on success or on permanent server rejection, and keeps it and retries on network-unavailable errors. RestClient's loop takes `Retries`, `RetrySecondsDelay` and "retry only on network errors", with `IsNetworkError = request.result == ConnectionError`. For backoff, use Colyseus's `2^attempt × delay` capped at 5 s. The server's idempotent append (replays return 200 with the original version, same-state → `409 no_op`) makes at-least-once delivery safe. Both `Journal` and `Outbox` can be one append-only JSONL file each under `Application.persistentDataPath`.

### Cited Findings
- `getsentry/sentry-dotnet` (**MIT**, last push 2026-09-19), `src/Sentry/Internal/Http/CachingTransport.cs`. Envelopes are stored as `*.envelope` files in `_isolatedCacheDirectoryPath` with a `ProcessingFolder` subdirectory, capped by `MaxCacheItems`. In the flush loop: a server rejection (`IsRejectedByServer`) discards the item; `IsNetworkUnavailableError` → "retrying after a delay" (rethrow, file kept); other exceptions discard; then `_fileSystem.DeleteFile(file)` — [CachingTransport.cs](https://github.com/getsentry/sentry-dotnet/blob/main/src/Sentry/Internal/Http/CachingTransport.cs)
- `proyecto26/RestClient` (**MIT**, 1,313★, last push 2026-03-22), `src/Proyecto26.RestClient/Helpers/HttpBase.cs`:
  ```csharp
  IsNetworkError = (request.result == UnityWebRequest.Result.ConnectionError);
  …
  else if (!options.IsAborted && retries < options.Retries && (!options.RetryCallbackOnlyOnNetworkErrors || IsNetworkError)) {
      options.RetryCallback?.Invoke(CreateException(options, request), retries);
      yield return new WaitForSeconds(options.RetrySecondsDelay); … }
  ```
  — [HttpBase.cs](https://github.com/proyecto26/RestClient/blob/develop/src/Proyecto26.RestClient/Helpers/HttpBase.cs)
- Colyseus backoff constants and function (MIT): see the WebSocket section — [Room.cs](https://github.com/colyseus/colyseus-unity-sdk/blob/master/Assets/Colyseus/Runtime/Colyseus/Room.cs)
- Unity: on Android `persistentDataPath` "points to `/storage/emulated/<userid>/Android/data/<packagename>/files` on most devices". Files there "can only be erased by users directly and not by any app updates." — [Application.persistentDataPath](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/Application-persistentDataPath.html)
- Blueprint contract: `POST /v1/assemblies/:aid/events` takes a `BuildEvent` with `version: null` → `201 {version, head}`; "replays return `200` with the original version; same-state → `409 no_op`". Network error → "outbox retry with backoff". `GET …/events?after=` is the fallback, and the headset "polls `events?after=` every 2 s while disconnected" — `docs/superpowers/specs/2026-09-18-cut-once-blueprint.md` §14 (local)

### Inferences
- **`Journal`.** `persistentDataPath/journal/<assembly_id>.jsonl`. Append one serialized `BuildEvent` per line through a single long-lived `FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read)` + `StreamWriter`, then call `Flush()` and `fs.Flush(true)` after each line so a crash or battery pull loses at most the event in flight. On load, read line by line and **skip a malformed last line**, which is what a torn write leaves. Replay the lines through `BuildStateStore.Apply` (the same reducer), so the offline state matches what the server would compute. Debug with `adb pull /sdcard/Android/data/<pkg>/files/journal/`.
- **`Outbox`.** A second file, `outbox.jsonl`, holding pending events keyed by `event_id` (the client-generated ULID is the idempotency key), plus an in-memory queue. Flush loop, single-flight: send the head. 201/200 → remove it and record `{event_id → version}`. 409 `no_op` → remove it, since it is already applied. Other 4xx → move to `outbox.rejected.jsonl` and show a toast (Sentry's "rejected by server → discard" rule). Network error or 5xx → wait `min(5 s, 2^attempt × 250 ms) + jitter` and retry (Colyseus/RestClient style). Rewrite the file compactly (temp file + `File.Replace`) whenever the queue drains or every N removals. Trigger a flush on `WsClient.OnOpen`, after every enqueue, and on a 2 s timer while offline.
- **Order.** Send strictly in FIFO order. Parallel sends could reorder `version` assignment, and the reducer depends on order.
- **Threading.** Keep all file I/O on the main thread. The files are tiny (under 100 lines per demo), so this is safe and removes the need for locks. `ApiClient` awaits `UnityWebRequest` on the main thread as in the fork.

**Class mapping**
| Class | Borrow |
|---|---|
| `Outbox` | Sentry `CachingTransport` rules (MIT) + RestClient network-error-only retry (MIT) + Colyseus backoff (MIT) |
| `Journal` | Plain `FileStream` append JSONL under `persistentDataPath` (Unity docs). No library needed |
| `ApiClient` | Fork's `UnityWebRequest` + bearer pattern; classify errors with `request.result == ConnectionError` |

### Gaps
- Found no small, maintained, Unity-specific open-source "offline outbox" package. The recommendation adapts general .NET/Unity patterns.
- Did not measure `Flush(true)` / fsync latency on Quest storage. It is probably negligible at a few events per minute, but that was not measured.
