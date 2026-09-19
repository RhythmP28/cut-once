# Quest spatial core: open-source code Cut Once can copy or adapt (code-level)

Scope: QR-marker alignment, spatial anchors, passthrough camera frames with pose and intrinsics, 3D→image projection, runtime glTF, boundary suppression, controller-tip touch point. Everything below comes from reading the source files themselves (fetched through the GitHub API or raw.githubusercontent.com on 2026-09-19), not from READMEs. Meta's MRUK and Core SDK sources were read from `darktable-mirror/com.meta.xr.mrutilitykit` and `darktable-mirror/com.meta.xr.sdk.core`. Both are unofficial mirrors of Meta's UPM packages. Their `main` branch is the same commit as tag `v205.0.0` (MRUK `9bb5c92685`, Core `d6dab637df`), which is the version QuestCameraKit pins. Line numbers refer to those commits.

---

## 1. QuestCameraKit: which scripts do QR tracking, frame capture and the ImageLLM voice+vision loop? What classes, events and properties do they use? How do they get intrinsics and the camera pose? Which QR axis is the normal? What is the QR update rate or smoothing?

### Takeaway
QR tracking in QuestCameraKit (QCK) is Meta's own MRUK sample, copied into `Samples/3 QRCodeDetection`. Those files carry the **Oculus SDK License, not MIT**. The MRUK types and members that matter are `MRUK.SceneSettings.TrackerConfiguration.QRCodeTrackingEnabled`, `SceneSettings.TrackableAdded`/`TrackableRemoved` (UnityEvent<MRUKTrackable>), `MRUKTrackable.TrackableType`, `MarkerPayloadString`, `IsTracked` and the inherited `MRUKAnchor.PlaneRect` (nullable).

The code puts the QR plane in the trackable's local **XY** plane. The normal is local **+Z (`transform.forward`)**, facing out of the surface.

QR poses update roughly once a second. MRUK does no smoothing in C#, and neither does QCK.

The ImageLLM loop captures pixels only (`PassthroughCameraAccess.GetColors()`). It discards the pose and intrinsics, and it squashes the frame to 512×512. Cut Once has to add the pose, intrinsics and timestamp itself. They come from the same component: `GetCameraPose()`, `Intrinsics`, `Timestamp`.

### Cited Findings

**Repo facts**
- QuestCameraKit: MIT (repo licence), 577 stars. Last commit 2026-09-08 (`9e10fcc`, "Refresh README…"). The QR sample was rebuilt the same day: `d802117` "Replace the ZXing camera sample with native MRUK QR tracking" and `bedf131` "Handle unavailable native QR bounds…". — [GitHub API commits](https://github.com/xrdevrob/QuestCameraKit/commits/main)
- Packages: `com.meta.xr.mrutilitykit` 205.0.0, `com.meta.xr.sdk.core` 205.0.0, `com.unity.xr.meta-openxr` 2.6.1, `com.unity.xr.openxr` 1.18.0. — [Packages/manifest.json](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/manifest.json)
- C# files by sample:
  - QR: `Samples/3 QRCodeDetection/Scripts/{QRCodeManager, QRCode, Bounded2DVisualizer, QRCodeSampleUI, QRCodeFaceCamera}.cs`, scene `QRCodeDetection.unity`
  - ImageLLM: `Samples/5 ImageLLM/Scripts/{VoiceCommandHandler, ImageOpenAIConnector, STTManager, TTSManager, AudioPlayer, SaveWav}.cs`, scene `ImageLLM.unity`
  - PCA users: `2 ObjectDetection/Scripts/{ObjectDetector, ObjectRenderer}.cs`, `1 ColorPicker/Scripts/ColorPicker.cs`, `4 Shaders/Scripts/StereoCameraMappingController.cs`
  - Source: [repo tree](https://github.com/xrdevrob/QuestCameraKit/tree/main/Unity-QuestVisionKit/Assets/Samples)
- **Licence flag:** all five QR scripts start with "Copyright (c) Meta Platforms… Licensed under the Oculus SDK License Agreement" and carry `[MetaCodeSample("MRUKSample-QRCodeDetection")]`. They are Meta's MRUK sample code, not MIT. The ImageLLM, ObjectDetection, ColorPicker and Shaders scripts have no Meta header, so they fall under the repo's MIT licence. — [QRCodeManager.cs L1-19, L29-31](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeManager.cs)

**QR tracking API (QRCodeManager.cs, Oculus SDK License)**
- To enable or disable tracking, copy the struct, change the flag and write it back. Subscribe in `OnEnable` and filter by type. [QRCodeManager.cs L52-65, L171-172, L189-206](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeManager.cs):
  ```csharp
  var config = _mrukInstance.SceneSettings.TrackerConfiguration;   // struct
  config.QRCodeTrackingEnabled = value;
  _mrukInstance.SceneSettings.TrackerConfiguration = config;
  ...
  _mrukInstance.SceneSettings.TrackableAdded.AddListener(OnTrackableAdded);
  _mrukInstance.SceneSettings.TrackableRemoved.AddListener(OnTrackableRemoved);
  ...
  if (trackable.TrackableType != OVRAnchor.TrackableType.QRCode) return;
  var instance = Instantiate(_qrCodePrefab, trackable.transform);
  ```
- Support and permission checks: `MRUK.Instance.QRCodeTrackingSupported`, and `OVRPermissionsRequester.ScenePermission`, requested through `UnityEngine.Android.Permission.RequestUserPermission`. — [QRCodeManager.cs L37-47, L68-124](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeManager.cs)
- On removal, QCK destroys the trackable's GameObject: `Destroy(trackable.gameObject)`. — [QRCodeManager.cs L208-220](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeManager.cs). MRUK's own doc comment says it takes "no action… by default" on removal. — [MRUK.Trackers.cs L164-174](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Trackers.cs#L164-L174)
- Payload: `trackable.MarkerPayloadString` (null if the payload isn't UTF-8), otherwise `MarkerPayloadBytes`. — [QRCode.cs L47-58](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCode.cs)
- `MRUKTrackable : MRUKAnchor` exposes `TrackableType` (L41), `IsTracked` (L50), `MarkerPayloadString` (L62) and `MarkerPayloadBytes` (L73). `PlaneRect` is declared on the base class as `Rect? PlaneRect` (MRUKAnchor.cs L120). — [MRUKTrackable.cs](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUKTrackable.cs), [MRUKAnchor.cs L120](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUKAnchor.cs#L120)
- MRUK has only two public trackable events, `TrackableAdded` and `TrackableRemoved`. `HandleTrackableUpdated` is private. It just re-runs `UpdateTrackableProperties`, which sets the transform, plane and payload. There is **no public "pose updated" event**. — [MRUK.Trackers.cs L162, L174, L346-352](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Trackers.cs#L346-L352), [MRUK.Shared.cs L996-1007](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Shared.cs#L996-L1007)
- `MRUK.GetTrackables(List<MRUKTrackable>)` returns every trackable detected so far, which is useful for polling. — [MRUK.Trackers.cs L201](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Trackers.cs#L201)
- `PlaneRect` can be null. QCK's `Bounded2DVisualizer` handles that case (`SetBounds(_trackable ? _trackable.PlaneRect : null)`), and the 2026-09-08 commit is titled "Handle unavailable native QR bounds". — [Bounded2DVisualizer.cs L47-54](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/Bounded2DVisualizer.cs)
- QCK's QR scene settings:
  - MRUK: `QRCodeTrackingEnabled: 1` (tracking on from the start), `EnableWorldLock: 1`, `DataSource: 0`, `LoadSceneOnStartup: 0`
  - OVRManager: `isInsightPassthroughEnabled: 1`, `shouldBoundaryVisibilityBeSuppressed: 0`
  - Source: [QRCodeDetection.unity](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/QRCodeDetection.unity) (lines ~2709-2710, ~6760-6788)

**Which axis is the QR normal (from code; Meta's docs don't say)**
- QCK's `Bounded2DVisualizer` draws the `PlaneRect` corners in the trackable's local frame at z = 0: `new Vector3(box.xMin, box.yMin, 0)` and so on. The QR plane is therefore local XY. — [Bounded2DVisualizer.cs L56-61](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/Bounded2DVisualizer.cs)
- MRUK's base class treats local +Z as the plane normal, pointing toward the viewer. [MRUKAnchor.cs L426-449, L502-518](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUKAnchor.cs#L426-L518):
  ```csharp
  Vector3 localPosition = transform.InverseTransformPoint(testPosition);
  localPosition.z = 0;                         // plane = local XY
  ... normal = transform.forward;              // plane normal = local +Z
  // Raycast: "Early rejection if surface isn't facing raycast"
  if (localRay.direction.z >= 0) return false; // surface faces +Z
  ```
- MRUK converts every native pose with `FlipZRotateY180`, commented "Transform from OpenXR Right-handed coordinate system to Unity Left-handed coordinate system with additional 180 rotation around +y". It writes the result straight into the trackable's local transform (`SetLocalTransform`). — [MRUK.Shared.cs L722-727, L827-836](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Shared.cs#L722-L727)
- Independent corroboration: dilmerv's demo places a bounds cube at `localPosition = (PlaneRect.center.x, PlaneRect.center.y, 0)` with scale `(w, h, 0.01)`, which is thin along local Z. — [TrackablesManager.cs](https://github.com/dilmerv/MRUKTrackableDemos/blob/master/Assets/Scripts/TrackablesManager.cs)
- STYLY's LBE alignment package flattens a QR pose to yaw with `rotation * Vector3.forward` projected on the ground plane. When that projection is near zero, which happens when the marker lies flat, it falls back to `rotation * Vector3.up`. That is consistent with forward ≈ vertical for a floor or desk marker. — [OriginMarkerResolver.cs](https://github.com/from2001/QuestLBE-Test/blob/main/Packages/com.styly.lbe.alignment/Runtime/Marker/OriginMarkerResolver.cs)
- Meta's QR doc gives no axis convention. It lists a 6DOF pose, `PlaneRect` and `PlaneBoundary2D`. — [Meta: MRUK QR code detection](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection)

**Update rate and smoothing**
- MRUK source comment: "0.5 seconds because most of our trackers update at about 1 Hz". — [MRUK.Trackers.cs L226-227](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Trackers.cs#L226)
- Meta's doc says the tracker updates poses at a "lower frequency" and is "not frame-perfect". It supports QR up to version 10, no Micro QR, and no design customisations. It needs Core and MRUK v83+ and the Spatial Data permission. — [Meta: MRUK QR code detection](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection)
- MRUK's C# side has no filtering: `UpdateTrackableProperties` sets `IsTracked`, the transform, the plane and the payload directly. QCK adds no smoothing either. — [MRUK.Shared.cs L996-1007](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.Shared.cs#L996-L1007)

**ImageLLM voice+vision loop (MIT scripts)**
- Flow:
  1. `SttManager.OnTranscriptionComplete` fires.
  2. `VoiceCommandHandler.CaptureAndSendImage` waits `WaitForSeconds(1.0f)` ("so we can avoid having our controller or hand in the image") and then `WaitForEndOfFrame()`.
  3. `CapturePassthroughFrame` calls `access.GetColors()` and copies the pixels into a `Texture2D(RGBA32)` with `SetPixelData`.
  4. `ImageOpenAIConnector.SendImage(texture, transcription)` sends the request.
  - Source: [VoiceCommandHandler.cs L41-44, L66-70, L113-131](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/VoiceCommandHandler.cs)
- The capture takes **no pose, intrinsics or timestamp**. It gets pixels only.
- `ImageOpenAIConnector.SendImageRequest` resizes any frame that isn't already 512×512 RGBA32 to **512×512** with `Graphics.Blit`, which changes the 4:3 aspect. It then sends a JPEG as a `data:image/jpeg;base64` `image_url` to `https://api.openai.com/v1/chat/completions` with model default `gpt-4o` and `max_completion_tokens: 300`, and passes the reply to `TtsManager` (`tts-1`, mp3). — [ImageOpenAIConnector.cs L84, L231-234, L272-280, L304-307](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/ImageOpenAIConnector.cs)
- The ImageLLM scene's `PassthroughCameraAccess` is set to `CameraPosition: 0` (Left) and `RequestedResolution: {x: 1280, y: 960}`. — [ImageLLM.unity ~L1050-1051](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/ImageLLM.unity)

**How other QCK samples get the camera pose and intrinsics (same MRUK component)**
- ObjectDetector reads `_cameraAccess.GetTexture()` and `_cameraAccess.GetCameraPose()` at the same moment and passes the pose on as `capturePose`. ObjectRenderer then calls `_cameraAccess.ViewportPointToRay(DetectionToViewport(perX, perY), capturePose)`, where `DetectionToViewport` flips y: `new(x, 1f - y)`. — [ObjectDetector.cs L80-84](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/2%20ObjectDetection/Scripts/ObjectDetector.cs), [ObjectRenderer.cs L73, L159-160](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/2%20ObjectDetection/Scripts/ObjectRenderer.cs)
- ColorPicker projects a world point into the image. It rejects points behind the camera with a dot product, because `WorldToViewportPoint` itself does no such check. It indexes `GetColors()` as `colors[pixel.y * W + pixel.x]` with `pixel.y = viewport.y * (H-1)`, so row 0 is the bottom row. [ColorPicker.cs L143-159](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/1%20ColorPicker/Scripts/ColorPicker.cs):
  ```csharp
  var pose = cameraAccess.GetCameraPose();
  if (Vector3.Dot(worldPoint - pose.position, pose.rotation * Vector3.forward) <= 0f) return false;
  var viewport = cameraAccess.WorldToViewportPoint(worldPoint, pose);
  pixel = new Vector2Int(RoundToInt(viewport.x * (W - 1)), RoundToInt(viewport.y * (H - 1)));
  ```
- StereoCameraMappingController reads `cameraAccess.Intrinsics.FocalLength`, `.PrincipalPoint`, `.SensorResolution` and `cameraAccess.CurrentResolution`, plus `GetCameraPose()`, and passes them to a shader. — [StereoCameraMappingController.cs L90-108](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/4%20Shaders/Scripts/StereoCameraMappingController.cs)

**Project configuration you inherit by forking QCK**
- `OculusProjectConfig.asset`: `anchorSupport: 1`, `sceneSupport: 2`, `boundaryVisibilitySupport: 2`, `isPassthroughCameraAccessEnabled: 1`. — [OculusProjectConfig.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Oculus/OculusProjectConfig.asset)
- The AndroidManifest already declares `com.oculus.permission.USE_ANCHOR_API`, `horizonos.permission.HEADSET_CAMERA`, `com.oculus.permission.USE_SCENE` and `com.oculus.permission.BOUNDARY_VISIBILITY`, with `supportedDevices` set to `quest3|quest3s`. — [AndroidManifest.xml](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Plugins/Android/AndroidManifest.xml)

### Inferences
- **QrAlignmentSource needs de-duplication.** Poses change about once a second and MRUK has no update event. Sampling `transform.TransformPoint(PlaneRect.center)` every frame would log the same pose about 70 times. Record a sample only when the trackable's pose (or `PlaneRect`) has actually changed since the last sample, and only while `IsTracked`. At about 1 Hz, K = 8 distinct samples takes about 8 s per marker. m1 and m2 sample in parallel, so the blueprint's 10 s ideal path is tight. K = 4–5 plus outlier rejection is safer (HoloLab's z-score filter, section 3). Measure the real rate at gate G3 as planned.
- **Normal axis.** Expect `trackable.transform.forward` ≈ world up for a code lying flat on the desk. The 5° sanity check becomes `Vector3.Angle(trackable.transform.forward, Vector3.up) < 5`. Keep the G3 gizmo test: this comes from the shared `MRUKAnchor` convention and matching sample code, and Meta documents it nowhere.
- **Centre point.** `trackable.transform.TransformPoint(PlaneRect.Value.center)` is right, as the blueprint says. Fall back to `transform.position` when `PlaneRect` is null (the case QCK now handles).
- **Enabling code.** Copy the four-line `TrackerConfiguration` read-modify-write and the `TrackableAdded` filter. Set the serialized `QRCodeTrackingEnabled` to **false** in Cut Once's `Main.unity`, because QCK's scene has it on from startup, and switch it on when entering `Scanning`. Don't copy QCK's `Destroy(trackable.gameObject)` on removal. Keep the reference and check `IsTracked` instead.
- **Licence handling.** The QR scripts are Oculus SDK License code, not MIT. They are fine inside a Quest app, but Cut Once should rewrite `QrAlignmentSource` itself rather than vendor these files as "MIT". The API calls are the reusable part.
- **PcaFrameSource.** Don't reuse `ImageOpenAIConnector`'s 512×512 resize for the copilot. It changes the aspect ratio, so projected part boxes would no longer line up. Capture pose, intrinsics and timestamp in the same frame as `GetColors()` (see section 2).

### Gaps
- Meta's native tracker smoothing is closed source. The "about 1 Hz" figure is a comment in MRUK code about trackers in general, not a QR-specific specification.
- The in-plane orientation (which local axis points to the QR's "top") wasn't determined. Cut Once uses centres only, so it doesn't matter for P0.
- I did not read QCK's `STTManager`/`TTSManager` beyond the call chain. Voice is outside this spatial scope.

---

## 2. Meta's CameraToWorld sample and `PassthroughCameraAccess`: exact pixel↔ray and world→pixel code (intrinsics, lens offset, pose timestamp). Is there a documented world-to-image function we can call directly?

### Takeaway
Yes. `Meta.XR.PassthroughCameraAccess.WorldToViewportPoint(Vector3 worldPosition, Pose? cameraPose = null)` is a public method with XML docs in MRUK 205. It is a pure pinhole projection using `Intrinsics.FocalLength` and `PrincipalPoint` in **sensor pixels**, with a sensor-crop correction, returning a viewport with **(0,0) at bottom-left**. `GetCameraPose()` is the headset pose **at the image timestamp** (`GetHeadsetPoseAtTime(_timestampNsMonotonic)`) composed with `Intrinsics.LensOffset`. MRUK exposes no lens-distortion model. Meta's CameraToWorld sample only uses `ViewportPointToRay` and `GetCameraPose`. Its June 2026 commit fixed principal-point-offset handling.

### Cited Findings
- **Repo:** `oculus-samples/Unity-PassthroughCameraApiSamples`
  - Last commit 2026-08-13 (`9105be6`, "update project version and packages"). 2026-06-08 (`ea3ae83`): "Improve PCA plane precision in CameraToWorld sample".
  - Licence: Oculus SDK License, except files explicitly marked MIT.
  - Its manifest pins `com.meta.xr.mrutilitykit` **85.0.0**, older than 205. The README asks for MRUK v81+, Horizon OS v74+ and Unity 6000.0.38f1+.
  - Sources: [commits](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/commits/main), [LICENSE.txt](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/LICENSE.txt), [README](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/README.md), [Packages/manifest.json](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/Packages/manifest.json)
- **CameraToWorld files:** `Assets/PassthroughCameraApiSamples/CameraToWorld/Scripts/{CameraToWorldManager, CameraToWorldCameraCanvas, CameraToWorldRayRenderer}.cs`. The manager builds the four image-corner rays with `m_cameraAccess.ViewportPointToRay(new Vector2(u, v))` and places the camera marker from `m_cameraAccess.GetCameraPose()`. A comment warns: "The optical axis is the camera-local +Z in world space - this is NOT the same as ViewportPointToRay(0.5, 0.5).direction when the principal point is offset." — [CameraToWorldManager.cs L103-128, L155-190](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/Assets/PassthroughCameraApiSamples/CameraToWorld/Scripts/CameraToWorldManager.cs)
- **Snapshot pattern:** `size = m_cameraAccess.CurrentResolution; tex = new Texture2D(size.x, size.y, RGBA32); tex.LoadRawTextureData(m_cameraAccess.GetColors()); tex.Apply();`. The permission gate is `OVRPermissionsRequester.IsPermissionGranted(OVRPermissionsRequester.Permission.PassthroughCameraAccess)`. — [CameraToWorldCameraCanvas.cs L19-39, L55-69](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/Assets/PassthroughCameraApiSamples/CameraToWorld/Scripts/CameraToWorldCameraCanvas.cs)
- **The component (MRUK 205, `Core/Scripts/PassthroughCameraAccess.cs`, namespace `Meta.XR`, Oculus SDK License):**
  - Public API:
    - `CameraPosition` (Left/Right)
    - `RequestedResolution = (1280, 960)` by default
    - `MaxFramerate` (default 60; can only be set while the component is disabled)
    - `IsPlaying`, `Timestamp` (DateTime), `CurrentResolution`, `Intrinsics`, `IsUpdatedThisFrame`
    - `GetColors()`, `GetTexture()`, `ViewportPointToRay`, `WorldToViewportPoint`, `GetCameraPose()`, static `IsSupported`, static `GetSupportedResolutions`
  - Only one instance is allowed per camera position.
  - Source: [PassthroughCameraAccess.cs L53-183, L385-389, L485-590](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs)
- **World → viewport (the function to call).** [L539-557](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L539-L557):
  ```csharp
  Pose camPose = cameraPose ?? GetCameraPose();
  Vector3 p = Quaternion.Inverse(camPose.rotation) * (worldPosition - camPose.position);
  var sensorPoint = new Vector2(
      (p.x / p.z) * focalLength.x + principalPoint.x,
      (p.y / p.z) * focalLength.y + principalPoint.y);
  var crop = CalcSensorCropRegion();
  return new Vector2((sensorPoint.x - crop.x) / crop.width,
                     (sensorPoint.y - crop.y) / crop.height);   // (0,0)=bottom-left
  ```
  Its doc comment: "Viewport-space is normalized and relative to the camera. The bottom-left of the camera is (0,0); the top-right is (1,1)." There is no check for points behind the camera.
- **Viewport → world ray (inverse).** [L508-533](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L508-L533):
  ```csharp
  var dir = new Vector3((crop.x + crop.width  * vp.x - principalPoint.x) / focalLength.x,
                        (crop.y + crop.height * vp.y - principalPoint.y) / focalLength.y, 1);
  return new Ray(camPose.position, camPose.rotation * dir);
  ```
- **Sensor crop.** Intrinsics are for `SensorResolution`, not `CurrentResolution`. [L559-570](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L559-L570):
  ```csharp
  Vector2 s = (Vector2)CurrentResolution / (Vector2)Intrinsics.SensorResolution;
  s /= Mathf.Max(s.x, s.y);
  return new Rect(sensor.x * (1 - s.x) * 0.5f, sensor.y * (1 - s.y) * 0.5f,
                  sensor.x * s.x, sensor.y * s.y);
  ```
- **Pose at frame time.** [L573-590](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L573-L590):
  ```csharp
  MRUKNativeFuncs.GetHeadsetPoseAtTime(_timestampNsMonotonic, ref pos, ref rot);
  var headPose = MRUK.FlipZ(new Pose(pos, rot));
  var lensOffset = Intrinsics.LensOffset;
  return new Pose(headPose.position + headPose.rotation * lensOffset.position,
                  headPose.rotation * lensOffset.rotation);
  ```
  `_timestampNsMonotonic` is commented "same time base as XrTime". It is refreshed in `Update()` whenever `CameraGetLatestImage` returns a new image, and `Timestamp` is set from the microsecond value at the same point. — [L75, L248-260](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L248-L260)
- **Intrinsics.** They are read once in `Play()` from the native `CameraPlay`:
  - `FocalLength`, `PrincipalPoint`, `SensorResolution` as returned
  - `LensOffset = new Pose(MRUK.FlipZ(lensTranslation), Quaternion.Inverse(new Quaternion(-r0, -r1, r2, r3)) * Quaternion.Euler(180, 0, 0))`
  - Doc comment: they "never change after that".
  - `CameraIntrinsics` has only these four fields. There are no distortion coefficients.
  - Source: [L132-133, L422-430, L603-613](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L603-L613)
- **CPU readback cost and timing:**
  - `GetColors()` does `AsyncGPUReadback.RequestIntoNativeArray(ref _colorsBuffer, _texture).WaitForCompletion()`, which blocks. Docs: "this method is expensive" and "Do not cache, modify or dispose the contents of the returned native array".
  - `GetTexture()` docs: "The texture is updated in render thread before the frame is displayed. This means that performing blocking operations such as Graphics.Blit() will pick the texture from the previous frame."
  - Source: [L135-165](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L135-L165)
- **Device and OS gate:** `IsSupported` requires Quest 3 or 3S with `VrosBuild.getSdkVersion() >= 74`. In the Editor, `Play()` failure mentions Link or XR Simulator v85+ and HzOS v85+. — [L186-210, L401-405](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L186-L210)
- **Pixel row order:** QCK's ColorPicker indexes `GetColors()` with bottom-origin rows (section 1). The Editor path fills the texture with `LoadRawTextureData`, which uses Unity's bottom-up row order. — [ColorPicker.cs L151-159](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/1%20ColorPicker/Scripts/ColorPicker.cs), [PassthroughCameraAccess.cs L234-237](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs#L234-L237)

### Inferences
- **PartProjector: call the API, don't re-derive it.** `vp = pca.WorldToViewportPoint(pW, cachedPose)` gives JPEG pixel coordinates with a top-left origin: `u = vp.x * W`, `v = (1 - vp.y) * H`. Keep the blueprint's `p_C.z > 0.1` visibility test (or ColorPicker's dot-product test), because the API doesn't reject points behind the camera.
- **Intrinsics for the backend (Director page, verification).** Send image-space intrinsics derived from the crop, not the raw `Intrinsics`. With `crop = CalcSensorCropRegion()` (private, so re-implement the three lines):
  - `fx' = fx · W / crop.w`
  - `fy' = fy · H / crop.h`
  - `cx' = (cx − crop.x) · W / crop.w`
  - `cy' = H − (cy − crop.y) · H / crop.h`
  - Then the blueprint's `u = cx' + fx'·x/z`, `v = cy' − fy'·y/z` holds, and its minus sign on `v` is right, but only with this `cy'`.
  - If you instead do an aspect-preserving resize before upload, scale `fx'`, `fy'`, `cx'` and `cy'` by the same factor.
- **Lens distortion.** There is nothing to copy. MRUK's projection is pure pinhole with no distortion terms. If the Director overlay shows edge misalignment, the frames may simply not be rectified. The code doesn't settle that.
- **Frame/pose sync in PcaFrameSource.** In one coroutine step, after `yield return new WaitForEndOfFrame()` (QCK's pattern), read `GetColors()`, `GetCameraPose()`, `Intrinsics`, `CurrentResolution` and `Timestamp` together.
  - The GPU texture is written on the render thread, while `Timestamp` and the pose are updated in `Update()`. So a read in the same frame as an update could pair a new pose with the previous image.
  - One option: capture on a frame where `IsUpdatedThisFrame == false`, so both refer to the already-uploaded image.
  - Or: require low head speed (the blueprint's 5 cm/s gate), which makes a one-frame mismatch negligible.
  - This is my reading of the docs, not a tested fact.
- **ExpectedViewRenderer.** When rendering the "expected view" with a Unity `Camera`, build an off-centre projection from the image-space intrinsics above. The sample's comment shows the principal point is offset, so a symmetric FOV is wrong. For example, set `Camera.usePhysicalProperties` with `sensorSize = (W, H)`, `focalLength = fx'`, `lensShift = ((cx' − W/2)/W, −(cy' − H/2)/H)`. Or write `projectionMatrix` directly. Verify on the Director overlay; this formula is not from Meta code.
- **Why these methods are usable from MRUK 205.** The CameraToWorld sample pins MRUK 85, but every method it calls (`ViewportPointToRay`, `GetCameraPose`, `GetColors`, `CurrentResolution`, `IsPlaying`) exists with the same signature in 205.

### Gaps
- Whether Quest PCA frames arrive rectified (undistorted) isn't stated in the code read here. The component has no distortion fields.
- No official public GitHub source for MRUK 205 was found. The mirror used here is unofficial, though its version tag matches the package.

---

## 3. Other Quest repos with QR/marker alignment, and liftable two-/three-point rigid alignment (Kabsch/Horn) in C#

### Takeaway
None of the Quest repos I checked contains a two-point, gravity-constrained (yaw + translation) solver. Write it from the blueprint (about 20 lines). For the three-point fallback, the canonical liftable C# is **zalo/MathUtilities `Assets/Kabsch/Kabsch.cs` (`KabschSolver.SolveKabsch`, Unlicense)**. It is iterative and warm-started, so pre-align with the two-point solution first. HoloLab's **`ZScoreFilterComponent` (MIT)** is a ready outlier filter for QR samples. STYLY's LBE alignment package (no licence) has the closest end-to-end architecture: MRUK QR → yaw-only origin → OVRSpatialAnchor persistence with localise timeouts and retries. Use it as a reference only.

### Cited Findings
- **zalo/MathUtilities, `Assets/Kabsch/Kabsch.cs`:**
  - Unlicense (public domain), 4,753 stars, last push 2024-08-24.
  - `KabschSolver.SolveKabsch(Vector3[] inPoints, Vector4[] refPoints, bool solveRotation = true, bool solveScale = false)` returns a `Matrix4x4` = `T(refCentroid)·R·T(−inCentroid)`. `refPoints[i].w` is a per-point weight, so set it to 1.
  - Rotation comes from `extractRotation` (Müller et al. 2016 stable rotation extraction, cited in the file), `for (int iter = 0; iter < 9; iter++)`, starting from the solver's stored `OptimalRotation`. It warm-starts from the previous call and begins at identity.
  - Needs the `FromMatrixExtension` helpers at the bottom of the file (`FillMatrixFromQuaternion`, `GetQuaternion`, `GetVector3`).
  - Sources: [Kabsch.cs L38-100, L140-157](https://github.com/zalo/MathUtilities/blob/master/Assets/Kabsch/Kabsch.cs), [repo](https://github.com/zalo/MathUtilities)
- A GitHub code search for `Kabsch` in C# returned about 30 files. Many are verbatim copies of zalo's `KabschSolver`. For example, `LennardMarx/MARSS26-Hackathon-EPA/Assets/Scripts/Tracking/Common/Kabsch.cs` (2026-04, no licence) embeds the same `KabschSolver` with a separate `SVD(...)` method. — [GitHub](https://github.com/LennardMarx/MARSS26-Hackathon-EPA/blob/main/Assets/Scripts/Tracking/Common/Kabsch.cs)
- **HoloLabInc/QuestCameraTools-Unity:**
  - MIT (`Copyright (c) 2025 HoloLab Inc.`), last push 2025-05-08. It predates MRUK QR tracking and uses its own PCA + ZXing + `EnvironmentRaycastManager` pipeline.
  - `QRTracker` runs detections through `AbstractFilterComponent`s.
  - `ZScoreFilterComponent`: `windowSize = 16`, `zScoreThreshold = 0.5f`, aggregation `Average` or `Latest`. It keeps positions within the z-score threshold of the window mean and averages them.
  - Its own marker frame is XZ-plane with a Y normal: `GetAnchorPointPose` offsets `(±s/2, 0, ±s/2)`. That differs from MRUK's XY-plane with a +Z normal.
  - Sources: [ZScoreFilterComponent.cs](https://github.com/HoloLabInc/QuestCameraTools-Unity/blob/main/packages/jp.co.hololab.questcameratools.qr/Scripts/Filter/ZScoreFilterComponent.cs), [QRTracker.cs L117-166, L246-258](https://github.com/HoloLabInc/QuestCameraTools-Unity/blob/main/packages/jp.co.hololab.questcameratools.qr/Scripts/QRTracker.cs), [LICENSE.md](https://github.com/HoloLabInc/QuestCameraTools-Unity/blob/main/LICENSE.md)
- **dilmerv/MRUKTrackableDemos:**
  - **No licence** (all rights reserved), last push 2025-09-07.
  - One 40-line `TrackablesManager.cs` that places visuals from `PlaneRect` and payload. It reads `trackable.PlaneRect.Value` without a null guard. No alignment.
  - Source: [TrackablesManager.cs](https://github.com/dilmerv/MRUKTrackableDemos/blob/master/Assets/Scripts/TrackablesManager.cs)
- **JDeffner/xr-drilling-assistant:**
  - MIT, Unity 6000.4.2f1 + Meta XR Core + MRUK, last push 2026-08-22.
  - Aligns to **MRUK scene wall anchors**, not QR codes. `OverlayProjector` parents content under the wall anchor. `WallPlanStore` saves per-wall plans as JSON keyed by `wall.Anchor.Uuid`.
  - No marker fit or Kabsch.
  - Sources: [README](https://github.com/JDeffner/xr-drilling-assistant/blob/main/README.md), [WallPlanStore.cs](https://github.com/JDeffner/xr-drilling-assistant/blob/main/Assets/Scripts/WallPlanStore.cs)
- **STYLY LBE alignment (`from2001/QuestLBE-Test`, package `com.styly.lbe.alignment` 0.2.0):**
  - Unity 6000.3, MRUK/Core 201.0.0, **no licence file** (repo licence null), last push 2026-07-14.
  - `MrukQrMarkerProvider` does the same `TrackerConfiguration` read-modify-write and filters `TrackableAdded` on `MarkerPayloadString`. It takes a **single** pose (`transform.position`/`rotation`) on first detection, with no averaging, and exposes `Task<Pose> WaitForMarkerAsync(string markerId, CancellationToken)`.
  - `OriginMarkerResolver.ComputeVenueOriginPose` flattens the marker rotation to yaw ("so a slanted marker cannot tilt the entire venue space").
  - Sources: [MrukQrMarkerProvider.cs](https://github.com/from2001/QuestLBE-Test/blob/main/Packages/com.styly.lbe.alignment/Runtime/Marker/MrukQrMarkerProvider.cs), [OriginMarkerResolver.cs](https://github.com/from2001/QuestLBE-Test/blob/main/Packages/com.styly.lbe.alignment/Runtime/Marker/OriginMarkerResolver.cs), [README](https://github.com/from2001/QuestLBE-Test/blob/main/Packages/com.styly.lbe.alignment/README.md)
- Other 2026 repos using `MarkerPayloadString` (found by code search, not inspected in depth): `Karl532/PVK_XARA` (`Tracking/Backends/MetaQrCodeBackend.cs`), `curefate/MMYC` (`QRRelocation.cs`), `Kreline1993/gardsbriller` ("digital twin" `QRCodePlacementByManualOffset.cs`), `Fialuxe/CoGaze` (`QRSpatialManager.cs`). The four I checked for a licence have none. — [GitHub code search results, 2026-09-19](https://github.com/search?q=MarkerPayloadString&type=code)

### Inferences
- **AlignmentSolver (two-point).** Implement the blueprint's formulas directly. `Quaternion.AngleAxis` takes **degrees**, so apply `θ·Mathf.Rad2Deg`. In Unity, `AngleAxis(+θ, up)` turns +Z toward +X, the same sense as `atan2(x, z)`, so the blueprint's sign convention is consistent.
- **AlignmentSolver (three-point fallback).** Lift zalo's `KabschSolver` (Unlicense, no attribution needed). Its 9 iterations start from the last solution, beginning at identity, so a one-shot solve with a large yaw may not converge. Two fixes:
  - (a) First apply the two-point `(R₂, t₂)` to the model points and let Kabsch solve only the small residual tilt. Compose `T = K · T₂`.
  - (b) Call `SolveKabsch` repeatedly until it stops changing.
  - The Müller extraction always returns a proper rotation, so there is no reflection case with three points. Horn's closed-form quaternion method would be an alternative, but I found no liftable, licensed C# copy of it in this search.
- **QrAlignmentSource filtering.** HoloLab's z-score filter (MIT) is a drop-in companion to the per-axis median. Tune the window to K instead of 16, because of the ~1 Hz rate.
- **Async shape.** STYLY's `WaitForMarkerAsync(markerId, CancellationToken)` is exactly the pattern `IAlignmentSource.CollectAsync(CancellationToken)` needs, and its yaw-only flattening matches Cut Once's "gravity-constrained" choice. But the repo has no licence, so re-implement rather than copy.

### Gaps
- Two `gh search repos` queries ("quest qr alignment unity", "MRUK QR code anchor") returned nothing. The code search above is the better coverage, but it is not exhaustive.
- I didn't find any Quest repo that already does multi-marker (≥2 QR) centre-based rigid alignment.

---

## 4. Spatial anchors in Meta XR Core 205: create, save, load by UUID, localise with a timeout, and bind

### Takeaway
The current (non-deprecated) API in Core 205:
- **Create and save:** `go.AddComponent<OVRSpatialAnchor>()`, then `await anchor.WhenLocalizedAsync()`, then `await anchor.SaveAnchorAsync()` (returns `OVRResult<OVRAnchor.SaveResult>`), then store `anchor.Uuid`.
- **Load:** `await OVRSpatialAnchor.LoadUnboundAnchorsAsync(IEnumerable<Guid>, List<UnboundAnchor>)`, then `unbound.LocalizeAsync(timeoutSeconds)` (a timeout is built in), then `unbound.TryGetPose`, then `unbound.BindTo(freshAnchor)` on a component that hasn't started creating its own anchor.

Meta's StarterSamples `SpatialAnchor` scene (MIT) is the reference. STYLY's code shows the bind-to-inactive-GameObject trick and a retry loop.

### Cited Findings
- **`OVRSpatialAnchor.cs` (Core 205, Oculus SDK License):**
  - `Uuid` L118; `Created` L126; `WhenCreatedAsync()` L153; `Localized` L170; `IsTracked`; `WhenLocalizedAsync()` L206
  - `SaveAnchorAsync()` → `OVRTask<OVRResult<OVRAnchor.SaveResult>>` L607; static `SaveAnchorsAsync(IEnumerable<OVRSpatialAnchor>)` L579; `EraseAnchorAsync()` L620
  - `UnboundAnchor.Localized` L965; `UnboundAnchor.TryGetPose(out Pose)` L991; `UnboundAnchor.LocalizeAsync(double timeout = 0)` L1034, with doc "The timeout, in seconds, to attempt localization, or zero to indicate no timeout"; `UnboundAnchor.BindTo(OVRSpatialAnchor)` L1068
  - static `LoadUnboundAnchorsAsync(IEnumerable<Guid> uuids, List<UnboundAnchor> unboundAnchors, Action<List<UnboundAnchor>, int> onIncrementalResultsAvailable = null)` → `OVRTask<OVRResult<List<UnboundAnchor>, OVRAnchor.FetchResult>>` L1136
  - Older APIs live in `OVRSpatialAnchor.deprecated.cs`.
  - Sources: [OVRSpatialAnchor.cs](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRSpatialAnchor.cs), [deprecated file](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRSpatialAnchor.deprecated.cs)
- **`BindTo` rules:** the target "should have been recently instantiated, ideally on the same frame as this call". It throws if the target "is pending creation", and an `UnboundAnchor` can be bound only once. — [OVRSpatialAnchor.cs L1052-1068](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRSpatialAnchor.cs#L1052-L1068)
- **Creation idiom from the XML docs:** `var anchor = gameObject.AddComponent<OVRSpatialAnchor>(); await anchor.WhenLocalizedAsync();`. — [OVRSpatialAnchor.cs L140-206](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRSpatialAnchor.cs#L140-L206)
- **Meta StarterSamples** (`oculus-samples/Unity-StarterSamples`, **MIT**, last push 2026-07-28), `Assets/StarterSamples/Usage/SpatialAnchor/Scripts/`:
  - `SpatialAnchorLoader.LoadAnchorsByUuid()` batches UUIDs 50 at a time.
  - `ProcessUnboundAnchors` localises and binds each one.
  - `Anchor.OnSaveLocalButtonPressed()` uses `_spatialAnchor.SaveAnchorAsync().ContinueWith(...)`.
  - `AnchorUuidStore` keeps UUIDs in `PlayerPrefs`.
  - Sources: [SpatialAnchorLoader.cs](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor/Scripts/SpatialAnchorLoader.cs), [Anchor.cs L135-156](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor/Scripts/Anchor.cs), [AnchorUuidStore.cs](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor/Scripts/AnchorUuidStore.cs), [LICENSE](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/LICENSE)
  - Key lines from [SpatialAnchorLoader.cs L46-98](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor/Scripts/SpatialAnchorLoader.cs#L46-L98):
  ```csharp
  var result = await OVRSpatialAnchor.LoadUnboundAnchorsAsync(uuidBatch, _unboundAnchors);
  foreach (var anchor in result.Value)
      if (anchor.Localized) _onAnchorLocalized(true, anchor);
      else if (!anchor.Localizing) anchor.LocalizeAsync().ContinueWith(_onAnchorLocalized, anchor);
  ...
  var isPoseValid = unboundAnchor.TryGetPose(out var pose);
  var spatialAnchor = isPoseValid ? Instantiate(_anchorPrefab, pose.position, pose.rotation)
                                  : Instantiate(_anchorPrefab);
  unboundAnchor.BindTo(spatialAnchor);   // same frame as Instantiate
  ```
- **STYLY `SharedAnchorController`** (no licence; MRUK/Core 201) covers the timeout and bind details:
  - `LocalizeAsync(localizeTimeout)` with a default of 8 s and a retry loop of `AnchorLoadRetryCount` (default 3).
  - To stop `OVRSpatialAnchor.Start()` from creating a new anchor before `BindTo`, it creates the placeholder GameObject **inactive**, adds the component, binds, then activates.
  - Creation is `AddComponent<OVRSpatialAnchor>()`, then `await anchor.WhenLocalizedAsync()`, then `await anchor.SaveAnchorAsync()`, with a check of `saveResult.Status`.
  - Source: [SharedAnchorController.cs L50-90, L102-185](https://github.com/from2001/QuestLBE-Test/blob/main/Packages/com.styly.lbe.alignment/Runtime/Anchor/SharedAnchorController.cs)
- **Prerequisites already in QCK:** `anchorSupport: 1` in OculusProjectConfig and `com.oculus.permission.USE_ANCHOR_API` in the manifest. — [OculusProjectConfig.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Oculus/OculusProjectConfig.asset), [AndroidManifest.xml](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Plugins/Android/AndroidManifest.xml)

### Inferences
- **Lock path (AlignmentController → anchor store).**
  1. `var go = new GameObject("DeskAnchor"); go.transform.SetPositionAndRotation(T_W_L.position, T_W_L.rotation);`
  2. `var a = go.AddComponent<OVRSpatialAnchor>(); if (!await a.WhenLocalizedAsync()) fail;`
  3. `var r = await a.SaveAnchorAsync(); if (!r.Success) warn(r.Status);`
  4. Write `{uuid = a.Uuid, nudge, residuals}` to `persistentDataPath/alignment_plan_desk_demo.json`, as the blueprint says. Using the file rather than PlayerPrefs matches the blueprint.
  5. Parent `AssemblyRoot` under `go` with `localPose = T_nudge`.
- **Restore path.**
  1. `LoadUnboundAnchorsAsync(new[]{uuid}, list)`.
  2. `ok = unbound.Localized || await unbound.LocalizeAsync(5)`. The blueprint's 5 s timeout maps directly onto the `timeout` argument.
  3. Create an inactive GameObject, add `OVRSpatialAnchor`, call `BindTo`, then activate it (STYLY's trick). Or follow Meta's sample and `Instantiate` a prefab with the component and `BindTo` in the same frame.
  4. Reparent `AssemblyRoot`.
- **The MIT code to copy from is Meta's StarterSamples.** STYLY's retry and inactive-GameObject details are patterns to re-implement, since that repo has no licence.

### Gaps
- I didn't find measured localisation times after an app restart on Quest 3. The 5 s budget is still an assumption to test at the rehearsal gate.
- Whether `AddComponent` followed by `BindTo` in the same frame (without deactivating first) is safe in 205 depends on when `Start()` runs. Meta's docs imply same-frame is fine; STYLY's comment says to deactivate. I didn't test either.

---

## 5. Runtime glTF with glTFast: keep node names (node name = part_id) and get each node's Transform after loading

### Takeaway
glTFast (Apache-2.0) keeps glTF node names by default (`ImportSettings.NodeNameMethod = NameImportMethod.Original`). `GameObjectInstantiator.SetNodeName` sets `go.name = name ?? $"Node-{nodeIndex}"`. Load with `GltfImport.Load(byte[] data, Uri uri = null, ImportSettings, CancellationToken)` or `Load(string url, …)`, then `InstantiateMainSceneAsync(Transform parent)` or `(IInstantiator)`.

Two gotchas:
- The `NodeCreated` event fires **before** the name is set.
- Extra primitives become child GameObjects named after the **mesh**.

So build the part_id → Transform map after instantiation, from node GameObjects only.

### Cited Findings
- Repo `Unity-Technologies/com.unity.cloud.gltfast`: package `6.20.1-pre.1` on `main`, `"unity": "6000.0"`, licence Apache-2.0 ("Unity glTFast copyright © 2023 Unity Technologies…"), last commit 2026-08-24. — [package.json](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/package.json), [LICENSE.md](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/LICENSE.md)
- **Load API:** `public async Task<bool> Load(string url, ImportSettings importSettings = null, CancellationToken ct = default)`, `Load(Uri url, …)` and `Load(byte[] data, Uri uri = null, ImportSettings importSettings = null, CancellationToken ct = default)`. — [GltfImport.cs L385-460](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GltfImport.cs#L385-L460)
- **Instantiate API:** `InstantiateMainSceneAsync(Transform parent, CancellationToken)` wraps `new GameObjectInstantiator(this, parent)`; there is also `InstantiateMainSceneAsync(IInstantiator, CancellationToken)`. Other members: `GetSourceRoot()` L116, `GetSourceNode(int index)` L1131, `SceneCount` L872. — [GltfImport.cs L710-735](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GltfImport.cs#L710-L735)
- **Naming:**
  - `NameImportMethod.Original` is described as "Use original node names. Fallback to mesh's name (if present). Fallback to 'Node_<index>' as last resort."
  - `OriginalUnique` appends numbers to make names unique and is forced when the file has animations.
  - The default is `nodeNameMethod = NameImportMethod.Original`.
  - Sources: [NameImportMethod.cs](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/NameImportMethod.cs), [ImportSettings.cs L18-22, L80-81](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/ImportSettings.cs), [GltfImport.cs L2419-2437](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GltfImport.cs#L2419-L2437)
- **Node creation order.** [GameObjectInstantiator.cs L176-209](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GameObjectInstantiator.cs#L176-L209):
  ```csharp
  var go = new GameObject();
  go.SetActive(parentIndex.HasValue);     // root nodes inactive until scene done
  go.transform.localPosition = position; ... m_Nodes[nodeIndex] = go;
  go.transform.SetParent(parentIndex.HasValue ? m_Nodes[parentIndex.Value].transform : SceneTransform, false);
  NodeCreated?.Invoke(nodeIndex, go);     // fired here, name not yet set
  ...
  CreateNode(nodeIndex, parentIndex, position, rotation, scale);
  SetNodeName(nodeIndex, name);           // m_Nodes[nodeIndex].name = name ?? $"Node-{nodeIndex}";
  ```
- **Multi-primitive meshes:** the first primitive goes on the node's GameObject. Later primitives create `new GameObject(meshName)` as **children** of the node. — [GameObjectInstantiator.cs L229-239](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GameObjectInstantiator.cs#L229-L239)
- **Scene root:** `InstantiationSettings.SceneObjectCreation` defaults to `WhenMultipleRootNodes`. With more than one root node, glTFast inserts a `new GameObject(name ?? "Scene")` under the parent. With exactly one root, nodes go directly under the parent. — [InstantiationSettings.cs L54-79](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/InstantiationSettings.cs), [GameObjectInstantiator.cs L105-125](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GameObjectInstantiator.cs#L105-L125)
- `GameObjectInstantiator` exposes `SceneInstance` (a `GameObjectSceneInstance` of cameras, lights and animation) and the `NodeCreated` / `MeshAdded` events. The node dictionary `m_Nodes` is `protected`. — [GameObjectInstantiator.cs L62, L75, L576-605](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GameObjectInstantiator.cs)

### Inferences
- **PlanLoader recipe.**
  1. `var g = new GltfImport(); ok = await g.Load(bytes, null, new ImportSettings{ NodeNameMethod = NameImportMethod.Original });`
  2. `await g.InstantiateMainSceneAsync(assemblyRoot);`
  3. Walk `assemblyRoot.GetComponentsInChildren<Transform>(true)` and map `t.name → t` for names that exist in the plan's `part_id` set. This skips mesh-child GameObjects, whose names are mesh names.
- **Getting the map during instantiation instead.** Subclass `GameObjectInstantiator` and override `SetNodeName(nodeIndex, name)`: call `base`, then record `m_Nodes[nodeIndex].transform`. Or, in `NodeCreated`, look up the name via `g.GetSourceRoot().Nodes[(int)nodeIndex].name`. Don't read `go.name` inside `NodeCreated`.
- **Duplicate names and animations.** If two nodes share a part_id or the file has animations, glTFast switches to `OriginalUnique` and appends numbers, which breaks name matching. Keep part_ids unique and don't export animations.
- **Handedness.** The blueprint's X-negation claim was not re-checked here; it is already recorded as verified in the blueprint. `AssemblyRoot` is the `L` frame, and glTFast's converted node transforms live in it directly (with `SceneObjectCreation = Never` or a single root).

### Gaps
- I didn't check whether the 6.20 pre-release differs from the version on Unity's package registry. The APIs quoted have been stable across 6.x.

---

## 6. Boundary suppression for a sideloaded MR app (OVRManager `shouldBoundaryVisibilityBeSuppressed` + BOUNDARYLESS manifest flag)

### Takeaway
There are two separate mechanisms:
1. **Runtime (already set up in QCK):** the `com.oculus.permission.BOUNDARY_VISIBILITY` permission, added when `OVRProjectConfig.boundaryVisibilitySupport` isn't None (QCK has 2 = Required), plus `OVRManager.shouldBoundaryVisibilityBeSuppressed = true`. It only works while passthrough is initialised and enabled. Both QCK scenes ship with it set to **0**, so Cut Once only needs to flip that field.
2. **Manifest-wide:** `<uses-feature android:name="com.oculus.feature.BOUNDARYLESS_APP" android:required="true"/>`. It applies to the whole app, works only "when they run in headset from a standalone APK" (sideloaded counts), and not over Link.

Meta's docs present these as alternative approaches. Pick the runtime one.

### Cited Findings
- **OVRManager (Core 205), `public bool shouldBoundaryVisibilityBeSuppressed = false;`.** Its doc: "If Passthrough has been initialized, then an attempt will be made every frame to update the boundary state if different from the system state… set boundary suppression to true only when the layer is active". — [OVRManager.cs L1215-1234](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRManager.cs#L1215-L1234)
- **`UpdateBoundary()`.** [OVRManager.cs L3780-3810](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRManager.cs#L3780-L3810):
  ```csharp
  if (shouldBoundaryVisibilityBeSuppressed == isBoundaryVisibilitySuppressed) return;
  var ptSupported = PassthroughInitializedOrPending(_passthroughInitializationState.Value) && isInsightPassthroughEnabled;
  if (!ptSupported) return;
  var result = OVRPlugin.RequestBoundaryVisibility(shouldBoundaryVisibilityBeSuppressed
      ? OVRPlugin.BoundaryVisibility.Suppressed : OVRPlugin.BoundaryVisibility.NotSuppressed);
  if (result == OVRPlugin.Result.Warning_BoundaryVisibilitySuppressionNotAllowed) Debug.LogWarning(...);
  ```
  The static event `OVRManager.BoundaryVisibilityChanged` and the read-only `isBoundaryVisibilitySuppressed` report the system state. — [OVRManager.cs L428-430, L3271-3276](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRManager.cs#L3271-L3276)
- **Manifest permission:** `OVRManifestPreprocessor` adds `com.oculus.permission.BOUNDARY_VISIBILITY` when `OVRProjectConfig.CachedProjectConfig.boundaryVisibilitySupport != FeatureSupport.None` on Quest targets. In Core 205 the preprocessor, `OVRProjectConfig` and `OVRManager` never mention `BOUNDARYLESS_APP`. — [OVRManifestPreprocessor.cs L1027-1039](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Editor/OVRManifestPreprocessor.cs#L1027-L1039), [OVRProjectConfig.cs L170](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Editor/OVRProjectConfig.cs#L170)
- **QCK configuration:** `boundaryVisibilitySupport: 2` and `_insightPassthroughSupport: 1`. The manifest already has `com.oculus.permission.BOUNDARY_VISIBILITY`. The QR and ImageLLM scenes have `isInsightPassthroughEnabled: 1` and `shouldBoundaryVisibilityBeSuppressed: 0`. — [OculusProjectConfig.asset](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Oculus/OculusProjectConfig.asset), [AndroidManifest.xml](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Plugins/Android/AndroidManifest.xml), [ImageLLM.unity ~L3466-3467](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/ImageLLM.unity)
- **Meta "Boundaryless" doc:**
  - Entry: `<uses-feature android:name="com.oculus.feature.BOUNDARYLESS_APP" android:required="true"/>`, which disables the boundary "for the entirety of the experience".
  - "The boundary is disabled for boundaryless apps only when they run in headset from a standalone APK. The boundary is not disabled when boundaryless apps run over PC/Link, as AndroidManifest.xml has no effect."
  - It is presented as separate from the runtime Boundary API (the page's fetch summary described the two as mutually exclusive; I couldn't verify that exact wording).
  - Source: [Meta: Boundaryless mode for MR in Unity](https://developers.meta.com/horizon/documentation/unity/unity-boundaryless/)
- **Unity OpenXR Meta 2.6 (also in QCK's packages) has its own path:** `OpenXRSettings.Instance.GetFeature<BoundaryVisibilityFeature>().TryRequestBoundaryVisibility(XrBoundaryVisibility.VisibilitySuppressed)`, with the "Meta Quest: Boundary Visibility" OpenXR feature. "Boundary visibility can only be suppressed if Passthrough is rendered to the screen." — [Unity OpenXR Meta 2.6 docs](https://docs.unity3d.com/Packages/com.unity.xr.meta-openxr@2.6//manual/features/boundary-visibility.html)
- **Community example:** set `ovrPassthroughLayer.enabled` and `ovrManager.shouldBoundaryVisibilityBeSuppressed` together. — [Meta community forum](https://communityforums.atmeta.com/t5/Unity-Development/Meta-All-in-One-SDK-v66-claims-to-allow-us-to-disable-the/m-p/1215170)

### Inferences
- **Recommended for Cut Once.**
  - Set `shouldBoundaryVisibilityBeSuppressed: 1` on the `OVRManager` in `Main.unity`, or set it at runtime once passthrough is up.
  - Log `OVRManager.BoundaryVisibilityChanged` to confirm it took effect.
  - Don't also add `BOUNDARYLESS_APP`, and don't enable the Unity OpenXR Meta `BoundaryVisibilityFeature`. One mechanism is enough, and QCK is already configured for the OVRManager path.
  - If passthrough is ever turned off (for example, a VR-only E7 view), set the flag back to false first, as the OVRManager docs advise.
- **Link testing.** Over Link the manifest has no effect. The runtime API may still need the permission granted, so expect the boundary to appear in Editor/Link tests. That's fine.

### Gaps
- I didn't find a sample repo that ships `BOUNDARYLESS_APP` in a Unity 6 + Core 205 project. I also couldn't confirm whether Horizon OS rejects combining it with the runtime API; the exact "mutually exclusive" wording came through a page summary.

---

## 7. Controller-tip touch point: sample code for the controller's tip pose (offset from the controller anchor)

### Takeaway
No Meta sample publishes the pose of the Quest 3 Touch Plus controller's front "nose". The closest liftable code is Meta's **StarterSamples `StylusTip.cs` (MIT)**. It builds the controller pose in tracking space with `OVRInput.GetLocalControllerPosition/Rotation`, maps it to world with `Pose.GetTransformedBy(trackingSpace)`, then applies a constant device-to-tip `Pose`. Its constant is the **Touch Pro stylus tip** `(0.0094, −0.07145, −0.07565)`, which is the wrong controller for Quest 3. So the blueprint's plan to calibrate the offset empirically stands. The simplest implementation is a child Transform of `OVRCameraRig.rightControllerAnchor`.

### Cited Findings
- **`StylusTip.cs`** ([L53-56, L99-112](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/TouchPro/Scripts/StylusTip/StylusTip.cs)):
  ```csharp
  Pose T_device = new Pose(OVRInput.GetLocalControllerPosition(m_controller),
                           OVRInput.GetLocalControllerRotation(m_controller));
  Pose T_world_device = T_device.GetTransformedBy(m_trackingSpace);
  Pose T_world_stylusTip = GetT_Device_StylusTip(m_controller).GetTransformedBy(T_world_device);
  ...
  T_device_stylusTip = new Pose(new Vector3(0.0094f, -0.07145f, -0.07565f),
                                Quaternion.Euler(35.305f, 50.988f, 37.901f));
  if (controller == OVRInput.Controller.LTouch) { pos.x *= -1; rot.y *= -1; rot.z *= -1; } // mirror for left
  ```
  Its comment says "Only the next controller supports the stylus tip", meaning the Touch Pro. StarterSamples is MIT. — [LICENSE](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/LICENSE)
- **`OVRCameraRig` (Core 205)** exposes `rightControllerAnchor` / `leftControllerAnchor` (L125-130), `rightControllerInHandAnchor`, `rightHandAnchor` and others. `UpdateAnchors` sets hand anchors from `OVRInput.GetLocalControllerPosition(...)`. — [OVRCameraRig.cs L70-135, L406-457](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRCameraRig.cs#L70-L135)
- **`OVRInput.GetLocalControllerPosition` / `GetLocalControllerRotation`** return `OVRPlugin.GetNodePose(OVRPlugin.Node.ControllerRight, stepType)` in tracking space. — [OVRInput.cs L1042-1085, L1204-1249](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRInput.cs#L1042-L1085)
- **StarterSamples SpatialAnchor placement.** The anchor placement point is a Transform in `DemoAnchorPlacement.prefab`: "Anchor Placement Transform" at local `(0, 0.0985, 0.1157)`, rotated −40° about X. The prefab is parented with local `(0, 0.0555, −0.0465)`. That puts the point about 10–15 cm in front of the controller. It is a floating placement point, not the physical tip. — [DemoAnchorPlacement.prefab](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor/Prefabs/DemoAnchorPlacement.prefab), [SpatialAnchor.unity](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/SpatialAnchor.unity)

### Inferences
- **TouchAlignmentSource.**
  - Put a `TipGizmo` Transform (a small sphere) as a child of `OVRCameraRig.rightControllerAnchor` with a serialized `localPosition` constant. On trigger, record `tip.position` (world).
  - Tune the constant once until the sphere sits on the physical nose in passthrough, as the blueprint says.
  - For a code-only approach, use StylusTip's `T_device.GetTransformedBy(trackingSpace)` chain with your own `T_device_tip`.
- **Averaging.** Take the median of several frames while the trigger is held and the controller is still, matching the QR path's median.
- **Grip vs aim.** I couldn't confirm from the code read here which OpenXR pose (grip or aim) `OVRPlugin.Node.ControllerRight` reports. Empirical calibration makes that irrelevant.

### Gaps
- There is no published Touch Plus nose offset. Calibrate on device.
- Unknown whether the Core 205 controller anchor is the grip or the aim pose.

---

## 8. How the borrowed code maps onto Cut Once's planned classes, and where it contradicts the blueprint (sections 5 and 13)

### Takeaway
Almost everything spatial in the blueprint has a code counterpart in Meta 205 or QCK. The QR enabling and events, the camera pose at frame time, world→image projection, the anchor save/load/localise/bind, glTFast node naming and the boundary flag all exist and match the plan. Seven details change the design: projection intrinsics, QR sampling at ~1 Hz, the QR normal axis, the 512×512 squash, a glTFast event-ordering trap, Kabsch warm-start and licences.

### Cited Findings
(Each row names the planned class, what to borrow, the source file, and its licence.)
- **AlignmentController:**
  - QR on/off via the `TrackerConfiguration` read-modify-write, from `QRCodeManager.TrackingEnabled` (Oculus SDK License). — [QRCodeManager.cs L52-65](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/Scripts/QRCodeManager.cs)
  - Anchor lock and restore via `AddComponent<OVRSpatialAnchor>` → `WhenLocalizedAsync` → `SaveAnchorAsync`; restore with `LoadUnboundAnchorsAsync` → `LocalizeAsync(5)` → `BindTo`, from `SpatialAnchorLoader.cs` and `Anchor.cs` (MIT). — [StarterSamples SpatialAnchor scripts](https://github.com/oculus-samples/Unity-StarterSamples/tree/main/Assets/StarterSamples/Usage/SpatialAnchor/Scripts), [OVRSpatialAnchor.cs](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRSpatialAnchor.cs)
  - Boundary flag on `OVRManager` (Core 205). — [OVRManager.cs L1229](https://github.com/darktable-mirror/com.meta.xr.sdk.core/blob/v205.0.0/Scripts/OVRManager.cs#L1229)
- **QrAlignmentSource:**
  - `TrackableAdded` filter on `TrackableType == QRCode` and `MarkerPayloadString` ("co:desk:m1", "co:desk:m2", "co:desk:m3").
  - Centre = `transform.TransformPoint(PlaneRect.Value.center)`.
  - Normal = `transform.forward`.
  - Sample only on pose change; median plus HoloLab `ZScoreFilterComponent` (MIT).
  - Sources: [MRUKTrackable.cs](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUKTrackable.cs), [MRUKAnchor.cs](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUKAnchor.cs), [ZScoreFilterComponent.cs](https://github.com/HoloLabInc/QuestCameraTools-Unity/blob/main/packages/jp.co.hololab.questcameratools.qr/Scripts/Filter/ZScoreFilterComponent.cs)
- **TouchAlignmentSource:** a tip Transform under `rightControllerAnchor`, or the StylusTip pose chain (MIT) with your own offset. — [StylusTip.cs](https://github.com/oculus-samples/Unity-StarterSamples/blob/main/Assets/StarterSamples/Usage/TouchPro/Scripts/StylusTip/StylusTip.cs)
- **AlignmentSolver:** two-point is custom (none found). Three-point is zalo's `KabschSolver` (Unlicense), applied after two-point pre-alignment. — [Kabsch.cs](https://github.com/zalo/MathUtilities/blob/master/Assets/Kabsch/Kabsch.cs)
- **NudgeController:** no special code needed. It edits `AssemblyRoot.localPosition/localRotation` under the anchor. No borrowed code was identified.
- **PcaFrameSource:** `PassthroughCameraAccess` (`CameraPosition = Left`, `RequestedResolution = 1280×960`). Capture after `WaitForEndOfFrame` as in QCK's `VoiceCommandHandler` (MIT): `GetColors()` together with `GetCameraPose()`, `Intrinsics`, `CurrentResolution`, `Timestamp`. — [VoiceCommandHandler.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/5%20ImageLLM/Scripts/VoiceCommandHandler.cs), [PassthroughCameraAccess.cs](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/PassthroughCameraAccess.cs)
- **PartProjector:** `WorldToViewportPoint(p, cachedPose)`, then `(vp.x·W, (1−vp.y)·H)`, with a behind-camera check as in QCK's ColorPicker (MIT). — [ColorPicker.cs L135-155](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/1%20ColorPicker/Scripts/ColorPicker.cs)
- **ExpectedViewRenderer:** an off-centre projection built from image-space intrinsics. The warning about principal-point offset comes from Meta's CameraToWorld sample. — [CameraToWorldManager.cs L103-128](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples/blob/main/Assets/PassthroughCameraApiSamples/CameraToWorld/Scripts/CameraToWorldManager.cs)
- **PlanLoader:** glTFast `GltfImport.Load` + `InstantiateMainSceneAsync(assemblyRoot)`; map part_id → Transform after instantiation (Apache-2.0). — [GameObjectInstantiator.cs](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Runtime/Scripts/GameObjectInstantiator.cs)

### Inferences (contradictions and corrections to the blueprint)
1. **The projection formula needs converted intrinsics (blueprint §5.5).** `Intrinsics.FocalLength` and `PrincipalPoint` are in **sensor** pixels (`SensorResolution`), relative to a centred crop, with a **bottom-left** origin. Plugging them straight into `u = cx + fx·x/z; v = cy − fy·y/z` for a 1280×960 JPEG is wrong. Either call `WorldToViewportPoint`, or convert with `fx' = fx·W/crop.w`, `cx' = (cx − crop.x)·W/crop.w`, `cy' = H − (cy − crop.y)·H/crop.h`. The blueprint's minus sign on `v` is then correct.
2. **No lens-distortion handling exists (blueprint §5.5).** "The sign of v and any lens-distortion handling come from Meta's CameraToWorld sample": the sample and the component are pure pinhole. There is nothing to copy for distortion.
3. **K = 8 QR samples at ~1 Hz is about 8 s per marker, and only if samples are de-duplicated (blueprint §5 calibration step 2).** MRUK has no update event. Per-frame reads repeat the same pose. Reduce K or accept about 10 s. Sample m1, m2 and m3 in parallel.
4. **The QR normal is almost certainly local +Z (`transform.forward`) (blueprint §5 step 3, "Meta does not document which local axis is the normal").** Code evidence: `MRUKAnchor` uses `normal = transform.forward` and puts the plane in local XY. QCK and dilmerv both draw bounds at z = 0. Keep the G3 gizmo check, but write `forward` into `QrAlignmentSource` as the default.
5. **Don't reuse QCK's 512×512 squash for the copilot (blueprint §10/§13, "one camera frame per question").** QCK's `ImageOpenAIConnector` resizes 4:3 → 1:1, which breaks projected boxes. Send 1280×960, or an aspect-preserving resize with scaled intrinsics.
6. **glTFast `NodeCreated` fires before the node is named.** Map part_id after `InstantiateMainSceneAsync`, or override `SetNodeName`. Keep part_ids unique and don't export animations, which would force `OriginalUnique` renaming.
7. **Kabsch fallback: zalo's solver is iterative and warm-started (9 iterations from identity).** Pre-align with the two-point result, then solve the residual. Otherwise a large yaw may not converge in one call.
8. **Licences.** QCK's QR scripts, the MRUK component source and Meta's PCA samples are Oculus SDK License (proprietary, not copyleft, and limited to use with Meta's platform per the licence text). QCK's own scripts and Meta's StarterSamples are MIT. glTFast is Apache-2.0. zalo is Unlicense. HoloLab is MIT. dilmerv, STYLY LBE, LennardMarx and the other 2026 QR repos have **no licence**, so use them for reading only. **Nothing copyleft was found.**
9. **World lock.** QCK's QR scene has MRUK `EnableWorldLock: 1`. When MRUK has a world-lock offset (normally once a scene room is loaded), it rewrites `OVRCameraRig`'s TrackingSpace every frame and warns if anything else moves it. The PCA pose and trackables come from native code, which reads the tracking-space pose through a callback (`MRUK.GetTrackingSpacePose`). So they should stay in Unity world coordinates, but don't move the rig manually. Unless Cut Once loads an MRUK room, set `EnableWorldLock = false` in `Main.unity` to remove a moving part. — [MRUK.cs L684-760](https://github.com/darktable-mirror/com.meta.xr.mrutilitykit/blob/v205.0.0/Core/Scripts/MRUK.cs#L684-L760), [QRCodeDetection.unity](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/3%20QRCodeDetection/QRCodeDetection.unity)
10. **The boundary is already half-configured.** The BOUNDARY_VISIBILITY permission and `boundaryVisibilitySupport` Required come with the fork. Only `shouldBoundaryVisibilityBeSuppressed` has to change. The blueprint's mention of the BOUNDARYLESS manifest flag is an alternative, not an addition.

### Gaps
- I didn't verify on device that `GetCameraPose()` and the MRUK trackable transforms share one world frame when `EnableWorldLock` is on and no room is loaded. Check at gate G3 by comparing a QR centre projected with `WorldToViewportPoint` against its position in the captured frame.
- There were no ready-made C# implementations of Horn's closed-form quaternion fit with clear licences in this search, beyond zalo's iterative method.
