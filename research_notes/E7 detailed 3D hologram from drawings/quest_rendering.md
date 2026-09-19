# Rendering a detailed E7 building "hologram" on Quest 3 in Unity: budgets, techniques, 4D reveal, tabletop UX, video capture

Research date: 2026-09-19. Repo stats (licence, stars, last push, archived) come from the GitHub REST API, queried today. Package contents come from tarballs downloaded today from packages.unity.com. "Inference" means my own reasoning or arithmetic, not a sourced fact. "Folklore" means a community number with no official source.

Context already covered elsewhere (not repeated here):
- `Blueprint to 3D and 4D reconstruction/mr_overlays_quest_unity.md`: PCA, MRUK, QR, anchors, Depth API, glTFast vs UnityGLTF, IfcConvert.
- `Cut Once reusable open source code/unity_rendering_plumbing.md`: hologram shader recipe (fresnel/box edges/grid), SPI stereo macros, MPB vs SRP Batcher, passthrough-alpha forum report, outlines.
- `Cut Once reusable open source code/build_ux_e7_video.md`: ReplayClock, Bonsai/Zea/LDraw step logic, dissolve-urp, Recorder 5.1.7 setup, URP Bloom values, orbit camera, ffmpeg montage.

Local fact checked today: the current `data/e7/out/e7.glb` has 18 nodes, 17 meshes, 3 materials, **636 triangles**, 36 KB, and no glTF extensions (parsed with Python from the file). The "detailed" E7 will be the first model that puts any real load on the headset.

---

## 1. Quest 3 budgets (triangles, draw calls, textures, transparency, frame rate) and the URP settings Meta and Unity recommend (MSAA, foveation, SpaceWarp)

### Takeaway
Meta's current official Quest 3/3S targets are **1.3M–1.8M triangles** and **200–300 draw calls for a "busy" app** (400–600 medium, 700–1,000 light), at a **minimum of 72 FPS**. A PCA + networking + TTS app like Cut Once counts as busy, so aim for a building that costs **≤ ~150 draw calls and ≤ ~300k triangles**. That leaves headroom for the camera, UI and the transparency, which is the real GPU risk in passthrough.

URP settings to use:
- Vulkan, Forward (or Forward+), multiview/single-pass instanced.
- MSAA 4x (Meta's recommendation; Unity's doc says 2x).
- HDR off, Depth Texture and Opaque Texture off, post-processing off, depth priming off.
- Fixed foveated rendering on (dynamic).

Do **not** turn on Application SpaceWarp: it needs motion vectors, and transparent and custom shaders produce artifacts without them.

### Cited Findings
**Official Meta budgets**
- Meta "Testing and performance analysis" (last updated 2024-10-30):
  - Interactive apps "must achieve a minimum of 72 FPS"; media apps can aim for 60.
  - Quest 3/3S draw calls: Busy 200–300, Medium 400–600, Light 700–1,000 (the "simulation type" column is how much CPU work the app does).
  - Quest 3/3S triangles: "1.3m-1.8m".
  
  — [Meta unity-perf](https://developers.meta.com/horizon/documentation/unity/unity-perf/)
- The page gives **no** official numbers for texture memory, MSAA, foveation, SpaceWarp or overdraw. — [Meta unity-perf](https://developers.meta.com/horizon/documentation/unity/unity-perf/)
- A search-result summary of Meta's guidance puts it as "500-1,000 draw calls" and "1-2 million triangles or vertices" per frame, plus "1-3 ms" for script logic such as `Update()`. It also says "complex meshes with high vertex/triangle counts have a higher impact on GPU draw time than material changes". — [Meta unity-perf (search summary)](https://developers.meta.com/horizon/documentation/unity/unity-perf/)
- **Conflict (older guidance):** Meta's Android/Quest perf intro says "50,000 static triangles per-eye per-view is a conservative target". This is far below the Quest 3 table above and most likely dates from Go/Quest 1. The same page says "Keep alpha blended transparency to a minimum" and "Avoid full screen image effects". — [Meta mobile perf intro](https://developers.meta.com/horizon/documentation/unity/unity-mobile-performance-intro/) (cited via the prior note unity_rendering_plumbing.md)
- Meta's draw-call cost analysis was run "on a Meta Quest 1 with Unity 2018.1.6f1", so it is **old**. Relative costs:
  - switching materials with the same shader: +64% draw-call time;
  - switching shaders: +175%;
  - redrawing the same object: about 25% of the cost of drawing a different object.
  
  Priorities: avoid shader switches, then material switches, then atlas textures. — [Meta draw call cost analysis](https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/)
- Meta best practices (last updated 2024-09-15):
  - "Enable Use Recommended MSAA Levels in OVRManager … the recommended MSAA level is 4x".
  - "Always use the Forward Rendering path or Forward+".
  - Use trilinear or anisotropic filtering.
  - Watch for textures above "2k by 2k on mobile" after LOD bias.
  - "Avoid excessive render passes (>2)".
  
  — [Meta best practices](https://developers.meta.com/horizon/documentation/unity/unity-best-practices-intro/)
- The Meta XR Project Setup Tool recommends 4x MSAA for all Quest devices. URP does not set MSAA automatically; you set it manually. — [Meta Configure camera / setup docs (search summary)](https://developers.meta.com/horizon/documentation/unity/unity-ovrcamerarig/)

**Unity's official URP settings for untethered XR (Unity 6.3 manual)**
- MSAA: "2X MSAA value provides a good balance between visual quality and performance". **Conflicts with Meta's 4x.**
- HDR: off ("requires more bits per pixel to process").
- Rendering path: Forward. Deferred "generates several render targets for the G-buffer", which is slow on tile-based GPUs.
- Depth priming: disable on XR ("XR devices have two views").
- Opaque Texture and Depth Texture: disable (they cause "extra texture copy operations, which requires extra GMEM loads").
- Post-processing: use **on-tile post-processing** in 6.3+, otherwise disable. SSAO off.
- Vulkan over GLES, render graph on, multiview single-pass and foveated rendering on in the OpenXR plugin, and resolution scaling.

— [Unity: Optimize for untethered XR devices in URP](https://docs.unity3d.com/6000.3/Documentation/Manual/xr-untethered-device-optimization.html)
- Search-result summaries of Unity's OpenXR Meta docs add three points: use Vulkan with URP because it "supports the greatest number of configurations with functional Passthrough"; set Intermediate Texture to Auto; turn off Terrain Holes. — [Unity OpenXR Meta: Optimize graphics settings](https://docs.unity3d.com/Packages/com.unity.xr.meta-openxr@2.5//manual/get-started/graphics-settings.html), [Meta Vulkan subpasses](https://developers.meta.com/horizon/documentation/unity/vulkan-subpasses/)
- A Unity Discussions thread is titled "Terrible build performance on Quest 3 with URP and Meta SDK, conflicting information in Meta documentation". This confirms the docs disagree; I did not open the thread. — [Unity Discussions](https://discussions.unity.com/t/terrible-build-performance-on-quest-3-with-urp-and-meta-sdk-conflicting-information-in-meta-documentation/1598096)

**Foveated rendering**
- Meta FFR page (last updated 2026-08-28):
  - Levels are Off, Low, Medium, High, plus HighTop for Quest on the OpenXR backend.
  - "Dynamic foveation" changes the level with GPU load, and the chosen level acts as the maximum.
  - "Subsampled layout" reduces "memory bandwidth and removes pixelated artifacts in the periphery", and needs Vulkan and Unity OpenXR Plugin 1.9.0+.
  
  — [Meta FFR](https://developers.meta.com/horizon/documentation/unity/unity-fixed-foveated-rendering/)
- A search snippet from Meta docs says FFR "can save between 10% and 20% of your GPU cost". "SRP Foveation" is "Recommended for Unity 6+" and applies foveation only to render passes that benefit. The FFR page I fetched did not show the percentage, so treat 10–20% as unconfirmed. — [Meta FFR (search summary)](https://developers.meta.com/horizon/documentation/unity/unity-fixed-foveated-rendering/), [Meta ETFR](https://developers.meta.com/horizon/documentation/unity/unity-eye-tracked-foveated-rendering/)

**Application SpaceWarp (AppSW)**
- Meta ASW guide (last updated 2026-05-13):
  - The app renders at half the display rate (e.g. 36 FPS), for "up to 70 percent additional compute".
  - **Vulkan only**.
  - Works with Meta's URP fork or stock URP in Unity 6000.0.9+; the fork is still recommended for "support for transparent objects".
  - It "requires modifying your app's materials and render pipeline; any materials that have not been modified to support AppSW will produce artifacts".
  - "Possible transparency issues."
  - UI that uses alpha for rounded edges should switch to alpha clipping.
  
  — [Meta AppSW guide](https://developers.meta.com/horizon/documentation/unity/unity-asw/)
- URP writes motion vectors only for opaque materials (including alpha-clipped). Custom shaders need `#define APPLICATION_SPACE_WARP_MOTION` or a manual motion-vector pass. — [Unity URP motion vectors](https://docs.unity3d.com/6000.4/Documentation/Manual/urp/features/motion-vectors.html), [Unity OpenXR SpaceWarp](https://docs.unity3d.com/Packages/com.unity.xr.openxr@1.15//manual/features/spacewarp/spacewarp-overview.html)
- Sample: oculus-samples/Unity-AppSpaceWarp, MIT, 74★, pushed 2026-08-20. — [GitHub](https://github.com/oculus-samples/Unity-AppSpaceWarp)

**GPU Resident Drawer (Unity 6)**
- It uses BatchRendererGroup to instance GameObjects automatically. It requires the **Forward+** path and compute-shader APIs (not GLES). — [Unity GPU Resident Drawer](https://docs.unity3d.com/6000.2/Documentation/Manual/urp/gpu-resident-drawer.html), [performance considerations](https://docs.unity3d.com/6000.4/Documentation/Manual/urp/gpu-resident-drawer-performance.html)
- A Unity issue-tracker entry is titled "Vulkan performing much worse than OpenGLES due to excessive buffer copies on Quest 2/3". I did not open it. — [Unity Issue Tracker](https://issuetracker.unity3d.com/issues/performance-vulkan-performing-much-worse-than-opengles-due-to-excessive-buffer-copies-on-quest-2-slash-3)

### Inferences
- **Frame budget arithmetic:** 72 Hz = 13.9 ms, 90 Hz = 11.1 ms. PCA uses about 1–2% GPU per camera (prior note) and the app also runs networking and audio, so stay at **72 Hz** for the demo.
- **Budget for the hologram**, a conservative share of Meta's "busy" row:

  | Resource | Budget |
  |---|---|
  | Draw calls for the building | ≤ 150 |
  | Triangles | ≤ 300k |
  | Transparent layers per pixel, on average across the model's screen area | ≤ 3–4 |
  | Post-processing on device | none |

  Meta has no overdraw number, so the transparency figure is my heuristic.
- **Which URP asset settings to check in the fork**, for the device quality level:
  - Vulkan (check whether PCA or passthrough samples force GLES).
  - MSAA 4x. Thin hologram lines need it, and Meta's number beats Unity's generic 2x here.
  - HDR off.
  - Depth Texture, Opaque Texture and post-processing off.
  - Render scale 1.0.
  - FFR at Medium with dynamic foveation on. Hologram detail near the edge of view matters little.
- **SpaceWarp: skip.** The hologram is custom transparent shaders over passthrough, which is exactly the case Meta warns about. It needs Vulkan plus motion-vector passes in every custom shader. It's not worth it with 22 hours left.
- **GPU Resident Drawer: skip.** It needs Forward+ and has no Quest-specific evidence. Mesh LOD (section 2) also depends on it for cross-fade. Batch by hand instead (section 2).

### Gaps
- No official Quest 3 texture-memory or app-RAM budget found. Keep the model untextured (colours as material constants or vertex colours) and the question goes away.
- No official overdraw or fill-rate limit for transparent layers on Quest 3; Meta's guidance only says "minimum".
- The FFR 10–20% saving is a search snippet, not a confirmed figure.
- Not verified whether the QuestCameraKit fork's URP asset uses Vulkan, or which MSAA it sets.

---

## 2. Mesh optimisation for a detailed building: merge per floor vs per element, instancing for mullions, LODs, gltfpack/meshopt/Draco in glTFast on Android, simplification

### Takeaway
One GameObject per building element (glTFast's default) is fine up to a few hundred elements. A detailed E7 with curtain wall, mullions, stairs and the atrium will pass Meta's draw-call budget. The robust pattern is to **merge per floor × material**:
- Write each element's ID and build order into a spare UV channel of the merged mesh.
- Drive reveal, state colour and selection in the shader from one global cursor and a small per-element lookup texture.
- Pick elements with a C# ray-vs-AABB test on a per-element bounds list.

The building then costs about 8 floors × 3–5 materials ≈ **30–50 draw calls**, however many elements it has.

At tabletop scale, draw mullions as a **procedural grid in the glass shader**, not as geometry or instances. LODs barely matter for a model that sits at arm's length.

gltfpack is useful offline, but keep node names with `-kn`. Meshopt decoding in glTFast uses a Burst-only package, so it runs on Android. Draco ships an arm64 `.so`. For a local few-MB model neither is needed.

### Cited Findings
**glTFast extension support and Android**
- glTFast feature table:
  - KHR_draco_mesh_compression via DracoForUnity (import and export).
  - EXT_meshopt_compression import via `com.unity.meshopt.decompress`.
  - KHR_mesh_quantization import.
  - KHR_texture_basisu via KtxUnity.
  - KHR_materials_unlit.
  - EXT_mesh_gpu_instancing import, "Without support for custom vertex attributes (e.g. `_ID`)".
  
  — [glTFast features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/features.html)
- Unity registry today:
  - `com.unity.cloud.gltfast`: latest dist-tag **7.0.0-exp.1** (unity 6000.0), depending on Burst 1.8.30, Collections 2.6.8 and Mathematics 1.3.3.
  - `com.unity.meshopt.decompress`: latest **0.2.0-exp.1** (unity 2022.3). Earlier versions are 0.1.0-preview.4–7.
  - `com.unity.cloud.draco`: **5.4.3**.
  
  — [packages.unity.com gltfast](https://packages.unity.com/com.unity.cloud.gltfast), [meshopt](https://packages.unity.com/com.unity.meshopt.decompress), [draco](https://packages.unity.com/com.unity.cloud.draco) (registry JSON)
- Tarball inspection:
  - The meshopt package has **no native plugins**, only Burst C# jobs (`Runtime/Scripts/Decode.cs`, `DecodeVertexJob.cs`, `DecodeIndexTrianglesJob.cs`, …) and depends on `com.unity.burst` 1.8.24 and Mathematics. Its changelog says it is now "Licensed under Unity Terms of Service".
  - The Draco package ships `Runtime/Plugins/Android/libs/arm64-v8a/libdraco_unity.so`, plus armeabi-v7a/x86/x86_64.
  
  — [meshopt tarball](https://download.packages.unity.com/com.unity.meshopt.decompress/-/com.unity.meshopt.decompress-0.2.0-exp.1.tgz), Draco tarball from the registry (inspected locally)
- The original atteneder/DracoUnity repo is Apache-2.0, 273★, last push 2023-11-10. Development moved to the Unity package. — [GitHub](https://github.com/atteneder/DracoUnity)

**gltfpack / meshoptimizer** (MIT, 8,351★, pushed 2026-09-17) — [repo](https://github.com/zeux/meshoptimizer), [gltfpack README](https://raw.githubusercontent.com/zeux/meshoptimizer/master/gltf/README.md)
- `-c`: compressed output via meshopt codecs (needs EXT_meshopt_compression). `-cz` is maximum compression and mentions the newer KHR_meshopt_compression.
- Quantization is on by default; `-noq` turns it off and produces KHR_mesh_quantization otherwise.
- `-si R`: simplify to triangle ratio R.
- `-kn`: "keep named nodes and meshes attached to named nodes so that named nodes can be transformed externally". `-km` keeps named materials; `-ke` keeps extras.
- `-mi`: "use mesh instancing when serializing references to the same meshes (requires EXT_mesh_gpu_instancing)".
- `-tc`: KTX2/BasisU textures.

**Unity-side LOD and simplification**
- Unity 6 Mesh LOD:
  - Generated "on model import" and stored in the original mesh's index buffer.
  - Selected at runtime by screen size.
  - Does **not** support static batching or GPU instancing, is incompatible with LOD Group, and needs GPU Resident Drawer for cross-fade.
  - The manual describes no runtime generation API.
  
  — [Unity Mesh LOD intro (6000.3)](https://docs.unity3d.com/6000.3/Documentation/Manual/lod/mesh-lod-introduction.html), [Generate LODs on import](https://docs.unity3d.com/6000.4/Documentation/Manual/lod/mesh-lod-generate-lods.html)
- A secondary source says generation starts at meshes with ≥ 256 triangles and roughly halves triangles per level, down to about 64. — [search summary of Unity/TheGamedev.Guru pages](https://thegamedev.guru/taskforce/2025-10-mesh-lods-in-unity-6-2/)
- **Whinarn/UnityMeshSimplifier**: MIT, 2,050★, pushed 2026-01-07. Runtime-capable mesh simplification. — [GitHub](https://github.com/Whinarn/UnityMeshSimplifier)
- **Unity-Technologies/AutoLOD**: licence NOASSERTION, 2,056★, last push 2024-02-29 (stale). — [GitHub](https://github.com/Unity-Technologies/AutoLOD)

**Batching constraints**
- The SRP Batcher is disabled for any renderer that uses a MaterialPropertyBlock. — [Unity SRP Batcher materials](https://docs.unity3d.com/6000.3/Documentation/Manual/SRPBatcher-Materials.html) (via prior note)
- Meta: mesh complexity costs more GPU time than material changes, and shader switches are the most expensive CPU state change. — [Meta draw call cost analysis](https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/)

### Inferences
**Rough size of a detailed E7** (my arithmetic, using the prior note's 42 × 91 × 34 m envelope):
- Façade perimeter ≈ 2 × (91 + 42) ≈ 266 m; façade area ≈ 266 m × 34 m ≈ 9,000 m².
- A 1.5 m × 4.2 m mullion grid gives about 180 verticals × 8 floors + 180 × 9 horizontals ≈ 3,000 mullion boxes ≈ 36k triangles, plus about 1,500 glass panels ≈ 3k triangles.
- Slabs, core walls, stairs, atrium and roof are likely 10–50k triangles.
- Total: **< 150k triangles**, well inside 1.3–1.8M. **Triangles are not the problem. Object count is.** About 3,000–5,000 renderers would be 10–20× Meta's busy draw-call row.

**Recommended structure for the detailed GLB** (the team's own generator writes the GLB, so do the work offline in the TS/Python pipeline, not in Unity):
1. Emit **one mesh per (floor, material class)**. For example: `L03_glass`, `L03_frame`, `L03_slab`, `L03_wall`, `L03_stair`.
2. Write per-vertex attributes:
   - `TEXCOORD_1` = (elementIndex, floorIndex)
   - `TEXCOORD_2` = (elementMinY, elementMaxY) in model space
   
   glTF allows extra TEXCOORD sets, and glTFast imports up to several UV channels. Check that UV2/UV3 arrive in Unity.
3. Emit a sidecar JSON with, per element: `{part_id, elementIndex, floor, bbox_min, bbox_max, build_order}`. Elastic/copilot keep using `part_id`; Unity maps `part_id ↔ elementIndex`.
4. Keep the **old per-element GLB** (the current 17-part one, or a per-element export) for any view that needs per-object transforms. Load the merged one for the hologram.

**Runtime control without per-renderer state** (keeps the SRP Batcher on):
- `Shader.SetGlobalFloat("_BuildCursor", c)` drives the reveal (section 4).
- A 1×N or 64×64 `Texture2D` (`RGBA32`, point filtered) holds per-element state colour and flags, indexed by elementIndex in the vertex shader. 5,000 elements ≈ 20 KB. Update it with `SetPixels32` + `Apply(false)` when a build event arrives.
- `Shader.SetGlobalInt("_SelectedElement", i)` drives selection: the shader brightens matching vertices. Zero extra draws, and no QuickOutline.
- These are standard Unity APIs, not re-verified this session. Vertex-texture fetch on Vulkan/Adreno is standard but untested here.

**Picking without MeshColliders:** raycast from the controller against the list of element AABBs in model space (inverse-transform the ray by the model root). 5k slab-tests per click costs nothing. Sort hits by distance and skip elements not yet revealed (`build_order > cursor`). This avoids cooking colliders for 100k-triangle meshes at load time.

**If the team runs out of time**, keep glTFast's one-GameObject-per-element import:
- Share **one material per state** (from the prior note's hybrid-batching advice).
- Use MPB only on the selected element.
- Keep the element count ≤ ~300 by exporting mullions as part of a per-floor "curtain wall" element rather than one element per mullion.

**Mullions and windows at tabletop scale:**
- At 1:200, a 50–75 mm mullion is 0.25–0.4 mm. Viewed from about 0.6 m that is below one pixel on Quest 3; at roughly 25 pixels per degree (folklore, not an official spec), 1 px ≈ 0.4 mm at 0.6 m. So geometric mullions shimmer and alias whatever you do.
- Draw them as an **anti-aliased procedural grid on the glass faces**: Golus "pristine grid" technique, re-implemented (gist has no licence; see prior note). Clamp line width to ≥ 1 px using `fwidth`. Use real geometry only for elements larger than about 2 px at viewing distance, roughly ≥ 150–200 mm real size at 1:200.
- GPU instancing (`Graphics.RenderMeshInstanced`, or gltfpack `-mi` → EXT_mesh_gpu_instancing, which glTFast imports) only pays off for full-scale or close-up walkthroughs.

**LOD:** a tabletop model is at one distance and fills a similar screen area throughout, so LODs give little. Unity Mesh LOD is import-time only, and glTFast runtime meshes won't get it. If the triangle count ever explodes (e.g. an IFC export), pre-simplify offline with `gltfpack -si 0.5 -kn -km`, or call UnityMeshSimplifier (MIT) at load.

**Compression:** skip meshopt/Draco for a local model of a few MB.
- meshopt needs the experimental `com.unity.meshopt.decompress` (Burst-only, so it should work on arm64) under Unity ToS.
- Draco adds a native plugin.
- The gain is load time over the network only.
- If the GLB is served from the backend and passes about 10 MB, `gltfpack -c -kn -km -ke` + meshopt is the lighter option.
- **Warning:** without `-kn`, gltfpack may merge or rename nodes, and the `part_id` names the whole system depends on would be lost.

### Gaps
- Not verified how glTFast instantiates EXT_mesh_gpu_instancing (GameObjects per instance or a single instanced renderer). The docs only say "import".
- Not verified that glTFast maps `TEXCOORD_1/2` to Unity UV1/UV2 (`mesh.uv2/uv3`) without extra settings. Check this in the first test load.
- No measurements of `com.unity.meshopt.decompress` 0.2.0-exp.1 on Quest.
- No official Quest 3 pixels-per-degree figure was retrieved; the ~25 PPD used above is folklore.

---

## 3. Cheap hologram looks on Quest: fresnel/rim, edges/wireframe, x-ray, section planes, transparency sorting, passthrough alpha, open-source shaders

### Takeaway
On Quest the look should come from **edges plus a faint fill, not from post-processing**. Each ingredient and its cost:
- **Fill:** faint additive or alpha fill with a fresnel term. Cheap and per-pixel. Fresnel does little on flat architectural faces.
- **Edges:** precomputed **feature edges** drawn as a line mesh, or thin quads. Barycentric wireframe shows triangle diagonals, which look wrong on buildings. Screen-space edge detection needs the depth texture and a full-screen pass, which both Meta and Unity say to avoid.
- **Curtain wall:** a procedural grid on the glass.
- **Section planes:** one `dot` + `clip` in the shader. Cap cut faces cheaply by shading back faces a solid colour.

For transparency, use **additive blending**, which is order-independent and reads as a hologram over passthrough, **or** a depth-prepass "ghost". Always use **separate alpha blend factors** (Meta's documented passthrough fix).

### Cited Findings
**Passthrough blending (Meta official)**
- Meta passthrough troubleshooting (last updated 2025-12-09): "A typical pitfall uses joint blend factors for color and alpha (e.g., Blend SrcAlpha OneMinusSrcAlpha). This combination causes the src alpha value to be squared…". The fix is "separate blend factors (e.g., Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha)". — [Meta passthrough troubleshooting](https://developers.meta.com/horizon/documentation/unity/unity-pt-troubleshooting/)
- A Quest 3 forum report (Unity 6000.2 / URP 17.2 / Meta v78): transparent objects are invisible where no opaque object is behind them when alpha = 0. The workaround is an alpha floor and `Blend SrcAlpha OneMinusSrcAlpha, SrcAlpha DstAlpha`. — [Unity Discussions](https://discussions.unity.com/t/on-quest-3-when-camera-background-is-set-to-transparent-transparent-material-objects-are-invisible-wherever-theres-no-opaque-object-behind-them/1692803) (via prior note)
- Meta's selective-passthrough material uses multiplicative blending (`BlendOp Add`, `Blend Zero SrcAlpha`). Older guidance set `OVRManager.eyeFovPremultipliedAlphaModeEnabled = false`, which a search summary says is "no longer necessary". — [Meta Passthrough Windows / MRTK3 underlay write-up (search summaries)](https://developers.meta.com/horizon/documentation/unity/unity-customize-passthrough-passthrough-windows/), [localjoost blog](https://localjoost.github.io/Full-underlay-passthrough-transparency-with-MRTK3-on-Quest-2Pro/)

**Open-source shader building blocks** (licence, stars and last push from the GitHub API)
- Hologram looks:
  - **andydbc/HologramShader**: MIT, 989★, 2023-09-07, built-in RP. Rim `pow(1-dot(V,N), p)`, world-direction scanlines, glow sweep and flicker; arithmetic quoted in the prior note. — [GitHub](https://github.com/andydbc/HologramShader)
  - **daniel-ilett/shaders-hologram** (MIT, URP Shader Graph 2019.4): fresnel + scanline. — [GitHub](https://github.com/daniel-ilett/shaders-hologram)
  - **daniel-ilett/dissolve-urp** (MIT, 79★, 2020-04-15): `_CutoffHeight` dissolve. — [GitHub](https://github.com/daniel-ilett/dissolve-urp)
- Wireframes:
  - **kaiware007/UnityBarycentricWireframe**: **no licence**, 20★, 2019. Barycentric wireframe from baked coordinates. Idea only; do not copy. — [GitHub](https://github.com/kaiware007/UnityBarycentricWireframe)
  - **nobnak/WireframeShaderUnity**: MIT, 18★, 2024-02-02 (not inspected). — [GitHub](https://github.com/nobnak/WireframeShaderUnity)
  - Unity's old VR `SpatialMappingWireframe.shader` uses a **geometry shader**. — [mirror](https://github.com/TwoTailsGames/Unity-Built-in-Shaders/blob/master/DefaultResourcesExtra/VR/Shaders/SpatialMappingWireframe.shader)
  - Fragment-only barycentric wireframes need barycentrics in vertex data, or `GL_EXT_fragment_shader_barycentric`. — [rreusser/glsl-solid-wireframe](https://github.com/rreusser/glsl-solid-wireframe), [Wunk: fragment_shader_barycentric wireframe](https://wunkolo.github.io/post/2022/07/gl_ext_fragment_shader_barycentric-wireframe/)
- Cross-section shaders:
  - **dedovskaya/CrossSectionShader**: **MIT**, 28★, 2023-12-17. "URP shader for Unity that shows a cross section of an object using clipping plane", Shader Graph, Unity 2021.3. — [GitHub](https://github.com/dedovskaya/CrossSectionShader)
  - **Dandarawy/Unity3DCrossSectionShader**: **BSD-3-Clause**, 598★, 2019-12-23. CG, built-in RP. Single-plane partitioning, stencil-based hatching of the cut, and three-plane (box) partitioning. — [GitHub](https://github.com/Dandarawy/Unity3DCrossSectionShader)
  - **Z-E-R-0/CrossSectionShader-Unity**: no licence, 6★ (Shader Graph, AR/VR/MR). **JohnGrime/Clipping-Plane-Shader**: no licence. Do not copy either. — [Z-E-R-0](https://github.com/Z-E-R-0/CrossSectionShader-Unity), [JohnGrime](https://github.com/JohnGrime/Clipping-Plane-Shader)
  - **jbltx clipping-plane gist**: a cross-section shader (licence not checked). — [gist](https://gist.github.com/jbltx/22367b46f1d43b4e7ba682fbcf072278)
- Mesh slicing (if actual cut geometry is wanted): **EzySlice**, MIT. — [search result: ezy-slice fork](https://github.com/filkata123/ezy-slice)

**What Meta and Unity say about the costs**
- "Keep alpha blended transparency to a minimum", "Avoid full screen image effects", avoid overlapping alpha-blended geometry. — [Meta mobile perf intro](https://developers.meta.com/horizon/documentation/unity/unity-mobile-performance-intro/) (via prior note)
- Depth and opaque textures cost extra GMEM loads on tile-based GPUs, so screen-space edge detection, which needs the depth/normal texture, goes against Unity's XR guidance. — [Unity untethered XR](https://docs.unity3d.com/6000.3/Documentation/Manual/xr-untethered-device-optimization.html)
- Single-pass instanced stereo is handled automatically by URP Shader Graph. Hand-written shaders need the `UNITY_VERTEX_OUTPUT_STEREO` family of macros. — [Unity SPI manual](https://docs.unity3d.com/Manual/SinglePassInstancing.html) (via prior note)

### Inferences
**Recommended look, cheapest first** (all in one URP Unlit Shader Graph or hand-written HLSL; object-space maths so it survives tabletop scaling):
1. **Fill:** `Blend One One` (additive) with low intensity. The colour is a cyan/teal base × (0.15 + 0.5·fresnel) × a per-floor tint. Additive needs no sorting, so merged-per-floor meshes with arbitrary triangle order never flicker. If additive looks washed out on bright walls, switch to alpha with **separate alpha factors** (`Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha`) and a floor of α ≥ 0.02. **Test both on the headset in the first hour.** The forum report says α = 0 disappears, and it is not documented whether a pure-additive fill with α = 0 composites additively over passthrough.
2. **Feature edges** carry the architectural read:
   - At export (in the generator), or once at load in C#, collect mesh edges whose adjacent face normals differ by more than about 20–30°, plus boundary edges.
   - Emit them per floor as a `MeshTopology.Lines` mesh (1 px lines; MSAA 4x smooths them), or as thin quads if 1 px is too faint.
   - The generator already knows every element is an extrusion or box, so it can emit edge lists directly (12 edges per box, polygon outline × 2 + verticals per extrusion).
   - Colour: HDR-bright for the video, near-white cyan for the headset.
   - Cost: one extra draw per floor.
3. **Curtain-wall grid** on glass faces: an anti-aliased procedural grid in model-space metres (e.g. 1.5 m × floor height), with lines clamped to ≥ 1 px. It replaces thousands of mullion objects (section 2).
4. **Section / "cut the floors open":**
   - Set a global `_SectionPlane` (float4 in model space) and call `clip(dot(float4(posOS,1), _SectionPlane))`.
   - For a horizontal "open the building at level N" cut, the plane is `y = top of floor N`.
   - Cap the cut: render back faces (Two-Sided + Is Front Face node) in a flat darker colour. The inside of the cut walls then reads as a solid "poché" section, with no stencil pass. This is the cheap version of Dandarawy's stencil hatching.
   - For floors above the cut, draw **edges only** at 20–30% brightness. This is the "x-ray / ghosted" look.
5. **X-ray of interiors:** additive fill already gives x-ray. For a solid "physical model" look, use a two-pass ghost: a depth-only pre-pass (ZWrite On, ColorMask 0), then a colour pass with ZTest LEqual. Only the nearest surface draws, which caps overdraw at one layer. It costs one extra vertex pass.
6. **Scanline / pulse:** `frac(posOS.y·k − t·speed)`. Harmless in cost, but keep it subtle on the headset. Strong scanlines at 1:200 alias.
7. **Avoid on device:**
   - bloom and all post-processing (save them for the Editor video);
   - geometry-shader wireframes;
   - screen-space outlines;
   - QuickOutline, which adds 2 extra passes per renderer;
   - depth-texture-based effects;
   - AppSW.

**Overdraw estimate (my heuristic):** with the tabletop model filling about 20–30% of the view, a ray through an 8-storey glass building crosses about 2 glass faces, several slabs and interior walls, roughly 6–12 surfaces. At about 5% alpha each, additive or alpha fill across all of them is probably tolerable at 72 Hz with MSAA 4x, but it is the first knob to turn if the GPU is pegged. Fixes, in order: depth-prepass ghost, fill only on exterior envelope elements, edges-only for interior elements.

**Sorting between merged meshes:**
- Unity sorts transparent renderers by bounds-centre distance.
- Per-floor meshes stack vertically, so order flips as the viewer moves up or down. That only matters for alpha blending; additive is immune.
- For alpha: give floor meshes fixed `renderQueue` offsets, lowest floor first. Render edges in a later queue (Transparent+10) so lines always sit on top of fills.

### Gaps
- It is not documented whether the Quest compositor treats the eye buffer as premultiplied when passthrough is the underlay. That decides whether pure additive with α = 0 shows up. The Meta troubleshooting page doesn't say, and the only evidence is a single forum report. Test on device.
- No measured Quest 3 cost for `MeshTopology.Lines` or 1 px line legibility in the headset.
- dedovskaya's MIT graph targets Unity 2021.3. Not tested on Unity 6000.3.

---

## 4. Revealing the building floor by floor: animation techniques, replay/timeline, 4D BIM examples

### Takeaway
Drive everything from **one global float `_BuildCursor`** (event index, fractional). Each element carries its build order and model-space Y range as vertex data, so the shader does the reveal with no per-object animation, no pivots and no MPB. For each element:
- A **rising clip plane** "prints" it from its base to its top.
- An HDR emissive band sits just under the cut.
- Optionally a short vertical drop-in (vertex offset).

A **floor-level section plane** follows the current floor so the camera can see into the level being built. The replay logic (ReplayClock, fold) from the prior note stays the same; only the renderer changes. The pattern matches commercial 4D (SYNCHRO XR offers "table scale" and immersive scale).

### Cited Findings
- **Pivot problem in the existing E7 export:** every E7 node's pivot is the world origin, with bounds in world metres. `localScale.y` "rise" animations therefore squash toward the ground, which is why a shader clip on `_RevealMinY/_RevealMaxY` was proposed. — local `data/e7` facts in prior note build_ux_e7_video.md
- **dissolve-urp** (MIT): `material.SetFloat("_CutoffHeight", height)` per frame drives a height-based dissolve with noise. — [GitHub](https://github.com/daniel-ilett/dissolve-urp), [DissolveObject.cs](https://github.com/daniel-ilett/dissolve-urp/blob/master/Assets/Scripts/DissolveObject.cs) (via prior note)
- **Bonsai 4D** (GPL-3.0-or-later; take the formula only):
  - frame = start_frame + (t − start)/duration × total_frames;
  - "creation" hides the element until STARTED, tints it at STARTED, and returns it to normal at COMPLETED.
  
  **Zea 4d-schedule-viewer** (MIT): BEFORE is hidden, DURING is highlighted with Synchro yellow `#F9CE03`, AFTER is normal. — [sequence.py](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/bonsai/tool/sequence.py), [Zea Task.js](https://github.com/ZeaInc/4d-schedule-viewer/blob/HEAD/src/Task.js) (via prior note)
- **three.js LDraw steps** (MIT): `c.visible = c.userData.buildingStep <= step`. **buildinginstructions.js** (Unlicense): outline the new parts, draw old parts in one colour, frame the camera on the accumulated bounds. — [three.js example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_loader_ldraw.html), [LDRInstructionsManager.js](https://github.com/LasseD/buildinginstructions.js/blob/master/js/LDRInstructionsManager.js) (via prior note)
- **Bentley SYNCHRO XR** (HoloLens 2, announced MWC Feb 2019):
  - It visualises 4D construction digital twins, and users "plan, visualize, and experience construction sequencing" with gestures.
  - "The '4D' model can be looked at on an immersive scale or a table scale."
  - Royal BAM used it on a Rotterdam museum project.
  
  — [automation.com](https://www.automation.com/products/bentley-systems-introduces-synchro-xr-4d-digital-twins-construction-application-for-microsoft-hololens-2), [Engineering.com](https://www.engineering.com/bentley-takes-4d-to-construction-sites-with-synchro-xr/)
- A 2025 Automation in Construction paper splits BIM models by user-selected timeframes for AR site management and calls optimised split models "crucial" for full-scale overlay. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580525002444) (via prior note mr_overlays_quest_unity.md)
- Timeline tooling: a Recorder Track locks playback to constant frame rate. Timeline 1.8.13 ships TextTrack/TweenTrack samples for captions. — [Recorder Timeline track](https://docs.unity3d.com/Packages/com.unity.recorder@5.1/manual/RecordingTimelineTrack.html), [Timeline samples](https://github.com/needle-mirror/com.unity.timeline/tree/master/Samples~/Customization) (via prior note)

### Inferences
**Shader reveal (our sketch, not from a source).** Model space, so it works at any tabletop scale. UV1 = (order, floor), UV2 = (minY, maxY) in model metres.
```hlsl
float t      = saturate((_BuildCursor - order) / _RiseSpan);        // 0 = not started, 1 = done
float cutY   = lerp(minY, maxY, EaseOutCubic(t));
clip(cutY + 1e-4 - posOS.y);                                         // print upward; t=0 → fully clipped
float band   = saturate(1 - (cutY - posOS.y) / _BandH) * step(t, 0.999);  // glow just under the cut
clip(dot(float4(posOS, 1), _SectionPlane));                          // optional floor/section cut
color       += band * _BandColor;                                    // HDR ×4–8 for video, ×1.5 on device
```
- **Per-floor pacing.** Set `order` so all elements on a floor share a small range. Suggested order within a floor: slab → columns/core → walls → curtain wall → interior. The cursor then crosses a floor in about 1–1.5 s of video, and a "floor N complete" caption or tick can be keyed off `floor(cursor)`.
- **Drop-in variant.** In the vertex stage, `posOS.y += (1 − t) · 0.3 · floorHeight`, with alpha = t. There is no clip, and it looks good for small parts like stairs. Both variants are per-vertex/per-pixel only and cost zero extra draw calls.
- **Current floor highlight.** `_CurrentFloor = floor(cursor-derived)`. Elements on that floor get the Synchro-yellow or cyan "DURING" tint; completed floors fade to the dim "AFTER" colour, following Zea and Bonsai.
- **Camera for the video.** Frame the accumulated bounds (buildinginstructions.js), so the camera rises with the building. The existing orbit maths from the prior note works; lerp the look-at Y toward the current floor.
- **Headset replay.** The same `_BuildCursor` is driven by the ReplayClock from real build events. A thumbstick scrub sets the cursor directly, so "scrub the 4D timeline" is free.
- **Why not scale-up or transform animation:** it needs per-element GameObjects and correct pivots (E7 pivots are at the origin), and it breaks the merged-mesh batching. Only the few "hero" parts, if any, should use transforms.
- **Why not Unity's LOD cross-fade or dithered alpha-to-coverage dissolve:** alpha-to-coverage with MSAA 4x is a valid order-independent option for dissolve noise, but the clip plus band already looks like "construction". Keep it simple.

### Gaps
- No open-source Unity 4D-BIM player was found (same result as the prior note). The pattern above is our own design.
- SYNCHRO XR is HoloLens 2 only in the sources found. I found no Quest version or technical detail about its rendering.
- Not measured: the cost of `clip()` on Adreno for large transparent surfaces. Discard can disable early-Z on tile-based GPUs, which mostly hurts opaque passes. Not verified for this case.

---

## 5. Existing open-source or free BIM/architecture viewers and Meta samples to learn from or reuse

### Takeaway
There is nothing drop-in. Speckle's Unity connector is **archived**, and Speckle's V3 connectors don't include Unity. xeokit is **AGPL**; Bonsai is **GPL** (IfcOpenShell library LGPL). Unity-side IFC plugins are editor-only or stale. The practical path:
- Keep the team's own generator → GLB (with `part_id` names).
- Use IfcConvert (`--use-element-guids`) only if an IFC ever shows up.
- Borrow UX from SYNCHRO XR (table + immersive scale, 4D).
- Borrow MR plumbing from Meta's MIT samples (Discover, Phanto, SharedSpatialAnchors, AppSpaceWarp).

### Cited Findings
- **specklesystems/speckle-unity**: Apache-2.0, 63★, **archived**, last push 2024-11-01. — [GitHub](https://github.com/specklesystems/speckle-unity)
- **specklesystems/speckle-sharp-connectors** ("Speckle Connectors V3"): Apache-2.0, 65★, pushed 2026-09-17. The repo root has solutions for AutoCAD, Civil3D, ETABS, Plant3D, Revit, Rhino (+ importer), Tekla and TSD. **No Unity solution** (root listing checked via GitHub API). — [GitHub](https://github.com/specklesystems/speckle-sharp-connectors)
- **xeokit-sdk**: AGPL-3.0, 934★, pushed 2026-09-08. "3D BIM IFC Viewer SDK … pure WebGL". AGPL makes it a UX and feature reference only (section planes, x-ray, 4D in the web viewer). — [GitHub](https://github.com/xeokit/xeokit-sdk)
- **IfcOpenShell**: LGPL-3.0, 2,793★, pushed 2026-09-19. IfcConvert writes GLB, and `--use-element-guids` puts GlobalIds in node names. **Bonsai files are GPL-3.0-or-later.** — [GitHub](https://github.com/IfcOpenShell/IfcOpenShell), [IfcConvert docs](https://docs.ifcopenshell.org/ifcconvert.html) (prior notes)
- **IFC-Unity-Editor-Plugin**: Apache-2.0, editor-only, last push 2023-07-05. **xBim** is a .NET IFC library, not verified under IL2CPP. — (prior note mr_overlays_quest_unity.md)
- **Meta MR samples** (MIT unless noted):
  - Unity-Discover: 311★, pushed 2026-02-12. Passthrough, scene and shared-anchor showcase.
  - Unity-Phanto: 274★, pushed 2026-05-28. Scene-mesh showcase.
  - Unity-AppSpaceWarp: 74★, pushed 2026-08-20.
  - Unity-SharedSpatialAnchors: MIT, 165★ (prior note).
  
  — [Discover](https://github.com/oculus-samples/Unity-Discover), [Phanto](https://github.com/oculus-samples/Unity-Phanto), [AppSpaceWarp](https://github.com/oculus-samples/Unity-AppSpaceWarp), [SSA](https://github.com/oculus-samples/Unity-SharedSpatialAnchors)
- **Commercial Quest/BIM precedents:**
  - Resolve (colour-passthrough AR on Quest) and SENTIO VR (1:1 BIM overlay on Quest). — [Resolve help](https://support.resolvebim.com/en/articles/6700300-augmented-reality-with-color-passthrough), [SENTIO](https://www.sentiovr.com/post/new-augmented-reality-in-construction-overlay-bim-models-on-site-at-1-1-scale-with-meta-quest) (prior note)
  - SYNCHRO XR (HoloLens 2; table scale and immersive scale, 4D). — [Engineering.com](https://www.engineering.com/bentley-takes-4d-to-construction-sites-with-synchro-xr/)
- **Industry alignment-UX taxonomy** (Arkio = visual/manual drag + gizmo, and others). — [Auganix, Campbell 2024](https://www.auganix.org/xr-in-aec-alignment-ux-methods-for-mr-and-ar-in-construction/) (prior note)
- **Unity Asset Transformer (formerly Pixyz)** has 2026.4 SDK docs with LOD guidelines. It is a commercial licence; pricing was not checked. — [Unity Asset Transformer SDK LOD guidelines](https://docs.unity.com/en-us/asset-transformer-sdk/2026.4/manual/sdktips/lod-guidelines)

### Inferences
- **Reuse candidates, ranked for the next 22 hours:**
  1. Our generator → merged GLB + sidecar (section 2).
  2. glTFast (already in the plan).
  3. dedovskaya CrossSectionShader (MIT) as a Shader Graph reference for the section plane.
  4. andydbc/daniel-ilett maths for rim/scanline (MIT).
  5. Meta Discover/Phanto only for passthrough and scene setup patterns, not rendering.
- **Licence traps:** xeokit (AGPL), Bonsai (GPL), and unlicensed shader repos (kaiware007, Z-E-R-0, JohnGrime, matsu224).
- **UX ideas to copy** (features, not code), from xeokit/SYNCHRO-style viewers:
  - section box/plane;
  - x-ray of everything except the selected element;
  - 4D slider with DURING highlight;
  - table-scale vs 1:1 toggle.

### Gaps
- Did not open Arkio, The Wild or Prospect material in this session. No citable UX details for them, beyond the prior note's Auganix mention of Arkio's manual gizmo alignment.
- Did not inspect Unity-Discover or Phanto shader code for specific rendering tricks (e.g. their passthrough-relighting or scene-mesh shaders).
- Pixyz/Asset Transformer licence cost and hackathon terms not verified.

---

## 6. Tabletop model interaction in MR: placing on a real table, scale gestures, choosing scale, legible labels

### Takeaway
Place the model with a **controller ray hit on the MRUK table surface**, or on the Depth-API environment raycast, then **freeze it with a spatial anchor** (prior note). Scale and rotate with your own **two-grip gesture**: scale = hand distance ratio, yaw only, and snap to 1:500 / 1:200 / 1:100. The Interaction SDK's two-grab transformers do this but are not in the fork.

**Use 1:200 by default:** E7 becomes about 0.46 × 0.21 × 0.17 m and fits any table. Offer 1:100 (about 0.9 m long) for detail.

For legible labels, use TextMeshPro SDF on world-space canvases. Billboard them to yaw toward the head, keep glyph height at 7–10 mm at 0.5–0.7 m, put them outside the massing with leader lines, and use bold weights. Meta's typography guide asks for ≥ 14 px (minimum) and ≥ 18 px (comfortable) in its UI units, and says to test on device.

### Cited Findings
- **Interaction SDK:** `Grabbable` has one-grab and two-grab transformer slots, and switches to the two-grab transformer when a second hand grabs. Two-handed grab can "move, rotate, and optionally scale". "Max grab points" must allow ≥ 2. — [Meta two-handed grab](https://developers.meta.com/horizon/documentation/unity/unity-isdk-two-handed-grab-interaction/), [Grabbable](https://developers.meta.com/horizon/documentation/unity/unity-isdk-grabbable/)
- The fork does **not** include the Interaction SDK. `com.meta.xr.sdk.interaction.ovr` 205.0.0 would be a new dependency. — [prior note unity_rendering_plumbing.md](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Packages/manifest.json)
- **Placement and anchors:**
  - The Depth API supports environment raycasting via `EnvironmentRaycastManager`. It needs Quest 3/3S and passthrough, and its minimum effective range is about 0.2 m.
  - Spatial anchors cover content within 3 m.
  
  — [Meta Depth API](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/), [Meta anchors](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/) (prior note)
- **Table scale precedent:** SYNCHRO XR's 4D model can be viewed "on an immersive scale or a table scale". — [automation.com](https://www.automation.com/products/bentley-systems-introduces-synchro-xr-4d-digital-twins-construction-application-for-microsoft-hololens-2)
- **Meta typography:**
  - "a font size no smaller than 14px is required for minimal legibility"; "use a font size of 18px or larger" for comfortable reading.
  - "Larger weights such as Black, Bold, and Medium are more legible than lighter weights".
  - Typeface: Inter.
  - In MR, typography "will interact with the colors in the user's physical surroundings". Light walls or bright light can "wash out subtle text".
  - The page does not define its px in physical or angular units.
  
  — [Meta typography](https://developers.meta.com/horizon/design/styles_typography/)
- **Research heuristic:** "distance-independent millimetres" (dmm = 1 mm at 1 m). A cited recommendation is text of 41 ± 14 dmm. This comes from a Medium summary of Google's dmm proposal, so it is secondary and weak. Meta's minimum interactive target is about 22 × 22 mm. — [Medium VR UI guide (search summary)](https://medium.com/@reclowill/vr-ui-design-guide-52c5a6510386), [arXiv 2004.01545](https://arxiv.org/pdf/2004.01545) (not opened)
- **World-space canvas sizing in the fork:** 720×640 at scale 0.0012. `OVROverlayCanvas` gives sharper text as a compositor layer but complicates ordering with passthrough. — [SampleMenu.cs](https://github.com/xrdevrob/QuestCameraKit/blob/main/Unity-QuestVisionKit/Assets/Samples/Common/Scripts/SampleMenu.cs) (prior note)

### Inferences
**Scale arithmetic** (E7 ≈ 91 × 42 × 34 m from the prior note; the task says about 100 m long):

| Scale | Footprint | Height | Per-floor height (4.2 m) | Notes |
|---|---|---|---|---|
| 1:500 | 0.18 × 0.08 m | 0.07 m | 8 mm | Toy-sized; floors too thin to point at |
| **1:200** | **0.46 × 0.21 m** | **0.17 m** | **21 mm** | Fits a desk; floors are pickable; façade grid visible, mullions sub-pixel |
| 1:150 | 0.61 × 0.28 m | 0.23 m | 28 mm | Good middle ground if the table is ≥ 1 m |
| 1:100 | 0.91 × 0.42 m | 0.34 m | 42 mm | Needs a big table; best for the atrium and stairs close-up |

**Placement flow** (about 1–2 h, no new packages):
1. Hold trigger. The ray hit on the MRUK table anchor or the environment raycast shows a footprint preview, a model-space rectangle drawn with the edge shader.
2. Release to place, snapped to the surface normal (yaw toward the user).
3. Create the spatial anchor.
4. **Two-grip scale:** both grips down → `s = s0 · |pL − pR| / d0`. Snap to {1:500, 1:200, 1:150, 1:100} when within ±8%. Rotate yaw by the angle change of the hand-to-hand vector projected on the table plane. Keep the model upright.
5. Thumbstick X/Y: yaw and "raise the section plane" (floor N).

**Label legibility maths** (inference; uses the folklore ~25 PPD): at 0.6 m, 1 px ≈ 0.4 mm. An 18–24 px glyph ≈ 7–10 mm tall. At 1:200 that is taller than half a floor (21 mm), so labels **cannot sit inside the model**. Put them on the outside:
- floor tags on a vertical "rail" beside the building, one per floor, at the floor's Y;
- a leader line from the tag to the element;
- billboard the text to face the head (yaw only), so it doesn't tilt.

Keep a **constant angular size**: `labelScale = baseScale · distanceToHead / 0.6`, clamped to 0.5–2×. Use bold Inter or a similar TMP SDF font and a dark semi-opaque backing plate (α about 0.6, separate alpha blend factors) so text holds up against bright passthrough. Render labels in a later queue with ZTest Always only for the selected element, to avoid hiding behind the building. Otherwise keep ZTest on for depth cues.

**Picking at 1:200:** at about 2 cm per floor, controller-ray picking of single elements is fiddly. Pick a **floor** first (ray vs per-floor AABB), which also sets the section plane to open it. Then pick an element within the opened floor.

### Gaps
- No official Meta number for label angular size in degrees or mm. The typography page uses unitless "px".
- MRUK's exact API for table surfaces (scene label names in v205) was not re-checked this session.
- No Quest 3 pixels-per-degree figure from an official source.

---

## 7. Video: high-quality Editor recording (Recorder, URP vs HDRP, bloom) and capturing from the headset (MQDH casting/recording, OBS, adb)

### Takeaway
Render the vision video **in URP**, in the same project, using a separate "Video" quality level or URP asset:
- HDR on, post-processing on (Bloom threshold about 1, ACES, vignette), MSAA 8x or 4x.
- Record at 3840×2160 and downscale with ffmpeg for supersampled edges.
- Recorder 5.1.x in Constant frame-rate mode.

HDRP's advantage is Recorder **accumulation** (sub-frame motion blur and AA), which is **HDRP-only**. That isn't worth converting shaders for with 22 hours left.

For the headset demo footage:
- **MQDH Record** caps at 1080p/36 fps, 40 Mbps, 3 minutes, no audio.
- **MQDH Cast** with "Capture Format: MAX" gives near-lossless files and a "Cinematic 16:9" view about 30° wider. Screen-capture the cast window with OBS if you need audio or overlays.
- adb `setprop` capture overrides (4K) are community folklore; try them only if needed.

### Cited Findings
**Recorder (Editor)**
- Recorder 5.1.7 (unity 6000.0) works in Play mode. `RecorderControllerSettings` has `SetRecordModeToTimeInterval`, `FrameRatePlayback.Constant`, `CapFrameRate` and `ExitPlayMode`. MP4 (H.264) rejects odd resolutions and warns above 2160p. There is an FFmpeg encoder sample. — [needle-mirror com.unity.recorder](https://github.com/needle-mirror/com.unity.recorder), [CoreEncoderSettings.cs](https://github.com/needle-mirror/com.unity.recorder/blob/master/Editor/Sources/Recorders/MovieRecorder/Encoder/CoreEncoderSettings.cs) (prior note)
- **Accumulation is HDRP-only.** "The use of the Accumulation feature requires your project to use High Definition Render Pipeline (HDRP)". It is used for motion blur and path-tracer accumulation. Disable HDRP's own AA and motion blur when accumulating (Recorder 4.0/5.x docs). — [Recorder Accumulation](https://docs.unity.cn/Packages/com.unity.recorder@4.0/manual/RecordingAccumulation.html), [Accumulate motion blur (5.0)](https://docs.unity3d.com/Packages/com.unity.recorder@5.0/manual/RecordingAccumulationMotionBlur.html), [Recorder 5.1 known issues](https://docs.unity3d.com/Packages/com.unity.recorder@5.1/manual/KnownIssues.html)
- **URP Bloom (Unity 6000.0):** threshold defaults to 0.9; intensity is `MinFloatParameter`, with no upper bound; scatter 0–1; max iterations 2–8; High Quality Filtering "can impact performance". — [Bloom.cs](https://github.com/Unity-Technologies/Graphics/blob/6000.0/staging/Packages/com.unity.render-pipelines.universal/Runtime/Overrides/Bloom.cs), [URP Bloom docs](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/post-processing-bloom.html) (prior note)
- **Device quality level must stay lean:** HDR off, post-processing off (or on-tile only in 6.3+). — [Unity untethered XR](https://docs.unity3d.com/6000.3/Documentation/Manual/xr-untethered-device-optimization.html)

**Headset capture**
- MQDH media page (last updated 2025-02-26):
  - Recording offers "Single Eye, Stereo Audio" or "Both Eyes, No Audio".
  - Resolutions include "1024p @ 36fps (1:1)" (default) and "1080p @ 36fps (16:9)".
  - Bitrate runs from "5 Mbps (very low quality)" to "40 Mbps (very high quality)"; default 5 Mbps.
  - **Maximum three minutes**, and "Audio is not recorded with the video".
  - Files go to `~/Library/Application Support/odh/captures` on macOS.
  
  — [MQDH debugging tools / media](https://developers.meta.com/horizon/documentation/unity/ts-mqdh-media/)
- MQDH casting:
  - Aspect ratio "Original (1:1)", "Cropped (16:9)", or "Cinematic (16:9)" (about 30° wider horizontal FOV).
  - Cast recording: "Capture Format" MAX produces "near-lossless video files". Target bitrate and framerate are adjustable, and higher rates may hurt performance.
  - Speaker audio is included when unmuted; "Microphone audio is not yet supported".
  - Files are saved on the headset (File Manager > On Device > Videos).
  
  — [MQDH media](https://developers.meta.com/horizon/documentation/unity/ts-mqdh-media/)
- **Community (folklore) adb capture overrides** for 4K recordings: `debug.oculus.capture.width 3840`, `debug.oculus.capture.height 1920`, `debug.oculus.capture.bitrate 40000000`, `debug.oculus.fullRateCapture`, `debug.oculus.screenCaptureEye`. Posted on TikTok by a creator (Hugh Hou); not Meta documentation. — [TikTok post](https://www.tiktok.com/@hughhou/video/7302058870225030446)
- scrcpy is used for Quest mirroring; a GitHub issue discusses Quest 3. Not verified for quality or MR. — [scrcpy issue #4386](https://github.com/Genymobile/scrcpy/issues/4386)
- Thermal caution: a simulation-only paper predicts Quest 3 throttling after 10–15 min of continuous MR recording and compositing. It is weak evidence. — [arXiv 2509.18929](https://arxiv.org/html/2509.18929v1) (prior note)

### Inferences
**Editor video recipe** (URP; about 1 hour on top of the prior note's Recorder setup):
1. Duplicate the URP asset and renderer as `URP_Video`: HDR on, MSAA 8x (or 4x), post-processing on, render scale 1. Assign it to a "Video" quality level used only in the Editor. The device keeps `URP_Quest`.
2. Volume:
   - Bloom threshold 1.0, intensity 1.5–2.5, scatter about 0.7, High Quality Filtering on.
   - Tonemapping ACES or Neutral.
   - Vignette about 0.25.
   - Optional film grain at 0.1, to hide banding on the dark background.
3. The shader outputs HDR edges and bands ×4–8 in the video only. Make that a global `_HdrBoost` set from the quality level, so both builds share one shader.
4. Recorder: 3840×2160 @ 30 fps, Constant playback, MP4 High (or a PNG sequence). Then `ffmpeg -vf scale=1920:1080:flags=lanczos` gives about 4× supersampled edges, a cheap stand-in for HDRP accumulation AA.
5. Drive `_BuildCursor` and the orbit from Timeline or `Time.time` only; never use wall-clock time.
6. Pure-black background with a faint ground grid. For a "hologram over the real site" shot, composite over a still photo of the E7 site in ffmpeg rather than in Unity.

**Why not HDRP:** it would need an HDRP target in the Shader Graph, new Volume profiles and new materials, and it risks breaking the Quest project (HDRP can't ship to Quest). The only real advantages are accumulation motion blur and AA plus better bloom. Supersampling and URP Bloom get about 90% of the look.

**Headset footage:**
- **Use MQDH Cast, not Record,** for the demo: "Cinematic 16:9", Capture Format MAX, the highest bitrate that stays smooth.
- **OBS** (Window Capture of the MQDH cast window, plus mic or narration) is the fallback for audio.
- Record in short takes, under 3 min for MQDH Record.
- Watch for frame drops: casting and recording cost headset GPU and thermals.
- **Test early whether the system recorder captures passthrough while the app holds the Passthrough Camera API.** Not verified (see gaps).

**Mixed deliverable:** Unity Editor hologram build-up (clean, 4K-supersampled), then a headset cast clip of the same model on a real table. Join them with ffmpeg `xfade` (prior note's tested command).

### Gaps
- Not verified whether MQDH Record/Cast include the passthrough layer, and whether apps using PCA or `HEADSET_CAMERA` are blocked or blacked out in system captures. Test in the first session with the device.
- Did not verify the current MQDH maximum cast resolution or framerate numbers. The page lists options but not the maximum explicitly.
- The adb `debug.oculus.capture.*` properties are community-sourced and may not work on current Horizon OS versions.
- Did not test Recorder 5.1.x on the team's Mac/Unity 6000.3 install (same gap as the prior note).
