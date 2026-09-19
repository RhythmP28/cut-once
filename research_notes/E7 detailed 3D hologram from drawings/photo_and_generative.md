# Photo-based and generative ways to add real visual detail to the E7 model (alternatives/complements to drawing reconstruction)

Research date: 2026-09-19. Scope: capture (photogrammetry, LiDAR, Gaussian splats), Google 3D Tiles, generative image-to-3D, facade parsing, photo texturing, AI video, and legal/ethical constraints, judged for a team with an Apple M3 Mac, iPhones/Android phones and a Meta Quest 3, about 22 hours before feature freeze, building a Unity (Meta XR) app plus a pre-rendered "vision" video.

Provenance legend used throughout (for the "drawings to 3D to build sequence" pitch):
- **[DRAWINGS]**: geometry comes from the published plans/section (the pitch's claim).
- **[PHOTOS]**: geometry or appearance comes from photos/video/LiDAR of the real building (reality capture). Not "from drawings".
- **[GOOGLE]**: Google's aerial photogrammetry, streamed. Not ours, not from drawings, strict terms.
- **[GENERATIVE]**: invented by a model from a prompt or a photo. Plausible, not measured.

---

## 1. Phone photogrammetry and LiDAR of a large building exterior and atrium (Polycam, Scaniverse, KIRI, RealityScan, Apple Object Capture, Meshroom/COLMAP/OpenMVS); feasibility for an 8-storey building from the ground; drones on UW campus

### Takeaway
Phone apps can capture E7's lower facades and the atrium tonight for free or cheaply, but ground-only capture of an 8-storey, glass-heavy building will give sharp ground floors, blurry upper floors and no roof; drones are effectively ruled out because UW requires a per-flight application 14 days in advance. On the M3 Mac, the open-source mesh route (COLMAP dense / OpenMVS with CUDA) is not practical; phone apps that process on-device or in their cloud are the realistic path.

### Cited Findings
**Polycam (pricing page, fetched 2026-09-19)**
- Free: 150 images per capture, "limited" space/object/AI captures, Gaussian splats listed, export GLTF only. Basic: $150/yr or $30/mo, 300 images per capture, unlimited captures incl. splats, 6 mesh formats (GLTF, OBJ, FBX, DAE, STL, USDZ) plus point-cloud formats. Business: $400/yr/user, 2,000 images per capture, floor plans, measure tools. Enterprise: $1,200/yr/seat, 3-seat minimum. 7-day trial only on annual Basic/Business — [Polycam pricing](https://poly.cam/pricing)
- Third-party reviews still quote an older "Pro" plan at $17.99–$26.99/mo; Polycam's own page no longer lists Pro (conflict; trust the official page) — [SkyeBrowse review](https://www.skyebrowse.com/news/posts/polycam-review); [Polycam pricing](https://poly.cam/pricing)
- Polycam has two core modes: LiDAR (near-instant mesh on LiDAR iPhones) and Photo mode (photogrammetry from overlapping stills) — [SkyeBrowse review](https://www.skyebrowse.com/news/posts/polycam-review)

**Scaniverse (Niantic Spatial)**
- Mobile app is free on iOS and Android; "Processing happens entirely on your phone — most captures finish in under 90 seconds, no connection required"; SPZ export, USDZ mentioned; page updated July 2026 — [Radiance Fields: Scaniverse platform](https://radiancefields.com/platforms/scaniverse)
- April 7, 2026 update added a web workspace that generates VPS maps, meshes and Gaussian splats from one or multiple collaborative captures; downloads as FBX (mesh) or PLY/SPZ (splats); 360-camera input (Insta360 .insv, equirectangular MP4 from DJI Osmo360/Ricoh Theta/GoPro) on a paid tier from $20/mo; cloud processing described as "a couple of hours" for typical scenes; claims scaling to "industrial sites and city scale environments" — [Radiance Fields: Scaniverse update](https://radiancefields.com/niantic-releases-major-scaniverse-update)
- Note the two processing paths conflict in the sources: the phone app is on-device (<90 s), the April 2026 web workspace is cloud (hours). They appear to be different products under one name — [platform page](https://radiancefields.com/platforms/scaniverse) vs [update article](https://radiancefields.com/niantic-releases-major-scaniverse-update)
- SPZ is Niantic's open-source (MIT) splat compression format, about 90% smaller than PLY — [Radiance Fields: SPZ open-sourced](https://radiancefields.com/scaniverse-open-sources-spz-compression-for-3dgs)

**KIRI Engine**
- Free: unlimited scans and exports, up to 150 photos per scan, 2 GB max, photogrammetry + LiDAR + 3DGS. Pro: $79.99/yr or $17.99/mo, 500 photos, 5 GB, featureless-object mode, PBR, quad mesh. iOS, Android and web — [KIRI pricing](https://www.kiriengine.app/pricing)
- "3DGS to Mesh 3.0" released April 2026 (cleaner meshes, 20% faster), converts a splat into an OBJ-style mesh — [KIRI blog](https://www.kiriengine.app/blog/kiri-engine-4.2-release); [KIRI 3DGS-to-mesh explainer](https://www.kiriengine.app/blog/what-is-3dgs-to-mesh)

**RealityScan (Epic)**
- RealityScan Mobile is free on iOS and Android; v1.7 (June 2025) added automatic object masking. Local project files are OBJ on iOS and GLB on Android; Sketchfab export offers FBX, USDZ, GLB/glTF; crop box for export — [CG Channel](https://www.cgchannel.com/2025/06/epic-games-releases-realityscan-2-0-and-realityscan-mobile-1-7/); [Google Play](https://play.google.com/store/apps/details?id=com.epicgames.realityscan)
- The desktop RealityCapture was rebranded RealityScan 2.0 in June 2025; RealityScan 2.1 (Nov 2025) added SLAM scanner data and UV improvements — [Wikipedia: RealityCapture](https://en.wikipedia.org/wiki/RealityCapture)

**Apple Object Capture / RealityKit (area mode, WWDC24)**
- Area mode runs on iPhone 12 Pro and later / iPad Pro 2021 and later; iOS reconstructs on-device at reduced detail; a Mac can reprocess at custom detail up to 16k textures and up to 2,000 images (on Macs with enough unified memory); quad-mesh output option; USDZ output — [WWDC24 "Discover area mode for Object Capture"](https://developer.apple.com/videos/play/wwdc2024/10107/)
- Apple frames area mode for uneven terrain, 2.5D surfaces and objects you cannot walk around, and warns that areas "larger than 6 feet" may have reduced mesh/texture quality unless reprocessed at higher detail on a Mac; outdoors, cloudy days or full shade are best — [WWDC24](https://developer.apple.com/videos/play/wwdc2024/10107/)

**COLMAP / OpenMVS / Meshroom on a Mac**
- COLMAP's dense (multi-view stereo) reconstruction requires CUDA, so Macs cannot run it; sparse SfM works — [COLMAP issue #2390](https://github.com/colmap/colmap/issues/2390); [COLMAP issue #192](https://github.com/colmap/colmap/issues/192)
- OpenMVS v2.0 (Dec 2021) added CUDA to its dense stage for speed and accuracy — [Falkingham, photogrammetry testing](https://peterfalkingham.com/2022/02/05/photogrammetry-testing-colmap-3-7-and-openmvs-v2-0-now-with-cuda/). The search summary claimed this makes OpenMVS CUDA-only; the post describes CUDA as an added speed-up, so a slower CPU path likely remains (unverified).
- In an academic comparison, COLMAP and OpenMVG+MVE produced on average 94x and 49x more points than Meshroom — [NSF PAR comparison paper](https://par.nsf.gov/servlets/purl/10320170)

**Ground-only capture of tall buildings**
- Architectural photogrammetry guides stress convergent images from separated positions, ≥60% overlap (80%+ better), and no tripod panoramas (no parallax); roofs and roof undersides are the commonly missed areas and are why drones are used for roofs — [Billboy heritage survey blog](https://billboyheritagesurvey.wordpress.com/2021/08/10/shooting-for-architectural-photogrammetry/); [3Deling architectural photogrammetry guide](https://3deling.com/architectural-photogrammetry-guide/index.html)

**Drones at UW**
- UW: drones "only permitted to be used on campus for approved University purposes" with approval from the UW Special Constable Service and the Executive Director, Safety, Security and Transportation; an approved application is needed "for each drone flight or flight period", submitted 14 days before use; approval normally notified within 7 days of the use date; cameras only to film outdoors in public spaces; one week's notice to Creative Services; privacy/consent consultation and signage at access points; no flying over crowds or over an advertised event without an SFOC; sub-250 g microdrones have a streamlined application but still need approval. Recreational use is not mentioned — [UW Safety Office: RPAS (Drones)](https://uwaterloo.ca/safety-office/occupational-health-safety/remotely-piloted-aircraft-systems-drones)

### Inferences
- **Drone capture is out** for this weekend: 14-day lead time, per-flight approval, and Hack the North is an advertised event with crowds. Plan for ground-level and in-building capture only.
- **Expected quality from the ground (E7 is ~8 storeys):** ground and first few floors will be sharp; upper floors will be seen at steep angles and at low pixel density, so they will be soft; the roof will be missing. Large glass curtain walls are reflective/transparent, which breaks both photogrammetry (no stable features) and splat training (view-dependent reflections). This is general photogrammetry knowledge, not measured on E7.
- **Best phone targets:** (a) the atrium interior (walkable, bounded, matte surfaces, inside the hackathon venue), (b) one or two short facade bays at ground level as texture/detail references, (c) a walk-around "orbit" video for splats. A full exterior mesh of E7 is not a realistic 22-hour goal.
- **Tool choice given the hardware:** Scaniverse (free, on-device, PLY/SPZ export, iOS + Android) is the lowest-risk splat capture; Polycam Free exports only GLTF and caps at 150 images, so a paid month (Basic $30) is needed for PLY/OBJ/FBX export and 300 images; KIRI Free allows 150 photos with unlimited exports; RealityScan Mobile is free but object-oriented. Apple Object Capture area mode is not building-scale (Apple's own 6 ft warning).
- **Time estimates (not from sources):** atrium splat 5–15 min capture + minutes of on-device processing; a ground-level exterior orbit 15–30 min walking + processing; add time for transfer/cleanup/import into Unity.

### Gaps
- No source gave measured capture minutes, photo counts, or accuracy for a whole 8-storey building captured from the ground with a phone.
- Meshroom's current macOS support was not verified (historically CUDA-dependent for depth maps).
- Whether Polycam's free tier allows exporting splats (vs viewing them) is unclear from the pricing page.
- Scale accuracy of phone splats/meshes (LiDAR vs photo-only) at building scale was not found; photo-only reconstructions are scale-free unless a known dimension is set.
- Whether the RealityScan desktop app runs on macOS was not re-verified (historically Windows-only).

---

## 2. 3D Gaussian Splatting from phone video (Luma, Polycam, Scaniverse, Postshot, gsplat/Nerfstudio, Brush) and rendering splats in Unity on Quest 3 (aras-p, Meta's own splat support, other viewers); realistic splat counts at 72–90 fps

### Takeaway
Capturing splats is easy (Scaniverse/Polycam on phone; Brush or OpenSplat on the M3 Mac), but showing them in a Unity app on a standalone Quest 3 is the risky part: the only mature Unity renderer (aras-p) is "reported" to work on Quest 3 yet has an open Quest sorting bug and a macOS-to-Quest black-screen report, and the numbers found point to a budget of about 150k splats (Meta's guidance) to about 400k (community fork at 72 fps). Rendering a splat inside the pre-rendered video on the Mac is low-risk; putting it in the headset is a stretch goal.

### Cited Findings
**Capture/training options**
- Luma: capture (Interactive Scenes) still free on iOS and web, but the company has pivoted to video generation (Dream Machine); a Radiance Fields profile says it is "unlikely that the team is actively still working on it"; Flythroughs were sunset Jan 1, 2026 — [Radiance Fields: Luma AI](https://radiancefields.com/platforms/luma-ai). A separate source says Luma's generative Genie was sunset from Jan 1, 2026 — [search result: Luma Genie](https://www.aiapps.com/items/genie-by-lumalabs/) (the two sources disagree on which product ended; both indicate 3D is no longer Luma's focus).
- Postshot (Jawset): Windows 10+ with an NVIDIA GPU of compute capability 7.5+; no macOS or Apple Silicon. Tiers: free, Indie €17/mo (€204/yr), Studio €39/mo (€468/yr) — [Radiance Fields: Postshot](https://radiancefields.com/platforms/postshot)
- Brush (Arthur Brussee): Gaussian splat training in Rust on Burn + WebGPU; runs on macOS/Windows/Linux, AMD/Nvidia/Intel, Android and in a browser; no CUDA; dependency-free binaries; takes COLMAP or Nerfstudio-format datasets — [Brush README](https://github.com/ArthurBrussee/brush/blob/main/README.md); [Radiance Fields: Brush](https://radiancefields.com/platforms/brush)
- OpenSplat: C++ 3DGS trainer, fastest on NVIDIA/AMD/Apple Metal GPUs, CPU fallback about 100x slower; inputs COLMAP, OpenSfM, ODX, OpenMVG or nerfstudio projects; outputs .ply, .splat, .spz, .rad — [OpenSplat repo](https://github.com/pierotofy/OpenSplat)
- gsplat/Nerfstudio on Mac: only community ports found, e.g. gsplat-mps (a fork of gsplat 0.1.3 ported to MPS using OpenSplat's Metal code) and metalsplat (a gsplat-equivalent PyTorch rasterizer on MPS) — [gsplat-mps](https://github.com/iffyloop/gsplat-mps); [metalsplat](https://github.com/tchauffi/metalsplat)
- A 2026 Mac splatting guide recommends 16 GB unified memory minimum, 30–200 overlapping photos or a slow video, and COLMAP + Brush or OpenSplat as the DIY pipeline; it gives no M-series training times — [RadianceKit: Gaussian splatting on a Mac](https://www.radiancekit.de/gaussian-splatting-mac/)
- Meta Hyperscape Capture (Quest 3/3S) builds splat worlds on Meta's servers, but Meta offers no export of raw capture data or trained PLY files; from May 12, 2026, Hyperscape worlds are "view only" inside the Hyperscape Capture (Beta) app — [Radiance Fields: OpenQuestCapture](https://radiancefields.com/openquestcapture-for-quest-3-and-3s-capture); [Meta Quest Help: Hyperscape Capture](https://www.meta.com/help/quest/1088536553019177/)

**Rendering in Unity on Quest 3**
- aras-p/UnityGaussianSplatting: works on D3D12, Metal, Vulkan; Quest 3 and Quest Pro "reportedly" work; the same README says OpenGL/GLES, WebGPU and "most mobile platforms (iOS and Android)" have issues. Inputs: 3DGS PLY and Scaniverse SPZ. Compression presets ("Very Low" capture under 8 MB). Bicycle scene, 6.1M splats: 6.8 ms on RTX 3080 Ti, 21.5 ms on M1 Max. Unity 2022.3 recommended; URP needs Unity 6. MIT license. Author (Dec 2023): "not planning any significant further developments" — [aras-p README](https://github.com/aras-p/UnityGaussianSplatting)
- Releases: v1.0.0 added VR support confirmed on Quest 3/Quest Pro/Vive/Varjo with GPU-sort optimizations for VR; v1.1.0 added Scaniverse SPZ and Unity 6 render-graph URP; v1.1.1 fixed SPZ rotation — [aras-p releases](https://github.com/aras-p/UnityGaussianSplatting/releases). (The fetched summary's release dates were internally inconsistent, e.g. SPZ support dated before SPZ existed; treat dates as unverified.)
- Open issue #112 (opened 2024-04-08): on Quest 3 (Vulkan) splats "quickly go from unsorted but visible to a very sparse set of shimmering splats"; disabling sort keeps them but unordered; unresolved — [issue #112](https://github.com/aras-p/UnityGaussianSplatting/issues/112)
- Issue #205 (opened 2025-10-23): project on macOS built for Quest 3 showed a black screen and heavy lag with the updated plugin; closed "not planned", no fix — [issue #205](https://github.com/aras-p/UnityGaussianSplatting/issues/205)
- ninjamode/Unity-VR-Gaussian-Splatting (now upstreamed into aras-p and unmaintained): Quest 3 "72 fps stable until around 400k Gaussians with proper settings"; ships a Quest APK; needs DX12 or Vulkan — [ninjamode repo](https://github.com/ninjamode/Unity-VR-Gaussian-Splatting)
- Meta Spatial SDK splat API (experimental, Kotlin/Android only, not Unity): PLY and SPZ; "avoid using Gaussian splats with a splat count greater than 150k" on Quest 3/3S; only one splat rendered at a time; long load times; page updated 2025-11-10 — [Meta: Use Gaussian splats](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-splats/)
- zachdrouin/GaussianSplatViewer (Unity 6, MIT, 2026): Quest 3 viewer with 72 fps target (90 fps mode), configurable 400k max visible splats, recommends PLY files under 1M Gaussians, binary PLY only, GPU radix sort + frustum culling + single-pass stereo — [GaussianSplatViewer](https://github.com/zachdrouin/GaussianSplatViewer). These are design targets, not published benchmarks.
- GaussPlatUnity (Unity 6000.3.19f1+, URP, MIT, early stage): tested only on Mac Metal; Android/WebGL compile but untested on devices; VR not mentioned; 786k-splat sample in about 6 ms at 1080x1920 on Apple Silicon — [GaussPlatUnity](https://github.com/denisislamov/GaussPlatUnity)
- QuestInfiniteScan (Unity 6 URP package) trains and renders splats on Quest 3 with 0.5x-resolution rendering, partial radix sort and contribution-based culling — [QuestInfiniteScan](https://github.com/fladirm/QuestInfiniteScan) (from search summary; not fetched)
- Commentary: a standalone Quest's practical ceiling is "a few hundred thousand splats" vs about 6M on a strong desktop GPU; Gracia ships splats on Quest 3 with a pipeline it claims is 10x faster — [VR.org, SIGGRAPH 2026](https://vr.org/articles/gaussian-splatting-vr-siggraph-2026); [Mixed News: Gracia](https://mixed-news.com/en/gracia-quest-3-hands-on/)

### Inferences
- **Headset budget:** plan for ≤150k splats (Meta's number) with 400k as an upper bound only if tested on-device; a whole-building splat from phones is typically millions of splats, so it must be cropped (e.g. atrium only, or one facade bay) and decimated.
- **Headset risk is real for this team specifically:** they build from macOS (issue #205) to Quest 3 with Vulkan (issue #112). If a splat must appear in the headset, budget a 1–2 hour spike on day 1 and have a fallback (textured mesh via KIRI "3DGS to Mesh" or a Polycam/Scaniverse mesh export).
- **Video is the safe place for splats:** aras-p renders on Mac Metal, so an atrium or exterior splat can appear in the Unity-rendered "vision" video with no Quest risk.
- The project pins Unity 6000.3.12f1 (per the team blueprint in memory); aras-p's URP path needs Unity 6, which fits; GaussPlatUnity needs 6000.3.19f1+, which would require a Unity patch upgrade.
- Mac training path if needed: sparse COLMAP (CPU) then Brush or OpenSplat on the M3's GPU; but phone-side Scaniverse is faster and avoids this.

### Gaps
- No independent, measured Quest 3 benchmark of aras-p (fps vs splat count) was found; the 400k@72 fps figure is from the ninjamode README without a methodology.
- No measured 90 fps splat count on Quest 3 was found.
- No M3 training-time numbers for Brush/OpenSplat were found.
- Whether Scaniverse/Polycam splats of a large exterior stay under any size limit, and their typical splat counts, were not found.

---

## 3. Google Photorealistic 3D Tiles via Cesium for Unity on Quest 3: coverage of Waterloo, API cost, attribution, and whether the terms allow extracting or displaying tiles

### Takeaway
Google 3D Tiles can be streamed into Unity (and have been shipped on Quest 3 via Cesium), with on-screen attribution, but the terms forbid exactly what would help most: you cannot trace, extract or derive the E7 model from them, cannot use them offline, and a promotional video using them is capped at 30 seconds and must be labelled "for promotional purposes only". They are usable only as a clearly attributed live backdrop.

### Cited Findings
- Attribution: "You must aggregate, sort, and display in a line, all attributions for displayed tiles; usually along the bottom of the rendering"; copyright strings are in each tile's glTF `asset.copyright` — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- Prohibited non-visualization uses: "Image analysis", "Machine interpretation", "Object detection or identification", "Geodata extraction or resale", "Offline uses, including for any of the above"; caching only as HTTP cache headers allow — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- Your own 3D objects may be overlaid on the tiles only if "The 3D objects aren't extracted, traced, or otherwise derived by hand or machine from Photorealistic 3D Tiles" — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- Promotional videos: must be "no more than 30 seconds in length", "clearly marked, 'for promotional purposes only'", follow attribution guidelines, and exclude Street View imagery; applies to Map Tiles API content generally — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- Programmatically reading measurements (heights, distances) from 3D imagery is treated as derivative and prohibited — [Google Maps Platform blog: 3D Tiles FAQ](https://mapsplatform.google.com/resources/blog/commonly-asked-questions-about-our-recently-launched-photorealistic-3d-tiles/) (via search summary)
- Billing/quota: SKU "Map Tiles API: Photorealistic 3D Tiles"; max 10,000 root tileset queries per day; each root request allows up to three hours of renderer tile requests; renderer tile requests unlimited per day; page updated 2026-09-16 — [Map Tiles usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing). A secondary source gives 1,000 free events/month then $6.00 per 1,000 — [AFI blog](https://blog.afi.io/blog/what-is-the-google-photorealistic-3d-tiles-api/) (not confirmed on Google's page as fetched)
- Cesium for Unity: needs a Cesium ion account and token; add "Google Photorealistic 3D Tiles" from Quick Add; enable "Show Credits On Screen" "to comply with the Google Maps Terms of Service"; no separate Google key needed through ion — [Cesium for Unity tutorial](https://cesium.com/learn/unity/unity-photorealistic-3d-tiles/)
- Cesium for Unity supports Windows, macOS, Android and VR including Quest; Cesium ion is free for non-commercial use with monthly streaming limits, commercial from $149/mo — [Cesium for Unity platform page](https://cesium.com/platform/cesium-for-unity/) (via search summary)
- WorldLens streams Google Photorealistic 3D Tiles through Cesium for Unity on Meta Quest 3 (Jan 6, 2026) — [Cesium blog: WorldLens](https://cesium.com/blog/2026/01/06/worldlens-delivers-high-performance-vr-exploration/)
- Coverage: 2,500+ cities in 49 countries, limited to major cities; no source listed Waterloo, Ontario — [AFI blog](https://blog.afi.io/blog/what-is-the-google-photorealistic-3d-tiles-api/)
- Cesium's Google terms appendix applies Google's third-party terms to content streamed through ion — [Cesium: Terms for Google content](https://cesium.com/legal/terms-for-google/)

### Inferences
- **Allowed for this project:** a live, attributed Google 3D backdrop of the UW campus around a drawings-derived E7 (in-headset or in the video), as long as the E7 geometry is not traced from the tiles and the credits line is visible.
- **Not allowed:** exporting E7 from the tiles, measuring its height/footprint from them, caching them for an offline demo, or a >30 s video segment using them without the "for promotional purposes only" label.
- **Demo risk:** tiles need live network streaming in the Hack the North venue; Wi-Fi congestion could make them fail on stage.
- **Honesty:** if Google tiles appear in the "vision" video, the pitch must not imply they came from drawings; label them "Imagery © Google" and "context".
- **Quick check tonight:** open Google Earth/Maps 3D at E7 to see whether photorealistic 3D exists there and at what quality before investing any time.

### Gaps
- Waterloo, Ontario coverage and the quality of E7 in Google's mesh were not confirmed.
- The exact current free cap and price per 1,000 root requests were not shown on Google's page as fetched; the $6/1,000 figure is secondary.
- The Cesium ion free-tier monthly streaming limit for Google tiles was not found.
- The policy does not mention AR/VR specifically.

---

## 4. Single-image / multi-image to 3D generators (TRELLIS/TRELLIS.2, Hunyuan3D 2.x/3.x, TripoSR/Tripo, Meshy, Rodin, SPAR3D) for whole buildings; facade-specific methods (facade parsing, window-grid detection, CMP facade dataset) to turn an E7 photo into a window layout

### Takeaway
Image-to-3D generators are built and benchmarked for objects, not buildings; they would produce a plausible-looking blob, not E7, and running the best open model locally needs 24 GB (NVIDIA or a Mac with 24 GB+ unified memory). The useful "AI from photos" step for E7 is narrower: detect the window/mullion grid in rectified facade photos (CMP-trained segmenters or a YOLO detector) and feed counts and spacings into the procedural facade that sits on drawing-derived floor plates.

### Cited Findings
**Generators**
- TRELLIS.2 (Microsoft): 4B parameters, MIT license (except nvdiffrast/nvdiffrec dependencies); needs an NVIDIA GPU with ≥24 GB, tested only on Linux, CUDA 12.4; on an H100: 512³ ~3 s, 1024³ ~17 s, 1536³ ~60 s; outputs GLB with PBR (base colour, roughness, metallic, opacity); designed for individual objects with complex topology, not scenes — [TRELLIS.2 GitHub](https://github.com/microsoft/TRELLIS.2); release reported Nov/Dec 2025 — [ComfyUI Wiki](https://comfyui-wiki.com/en/news/2025-12-18-microsoft-trellis2-3d-generation)
- A community Mac port (shivampkumar/trellis-mac, March 2026) runs on PyTorch MPS; recommends 24 GB+ unified memory, about 15 GB of weights, and a self-reported ~3.5 minutes per mesh on an M4 Pro; an MLX fork also exists — [The Agent Times](https://theagenttimes.com/articles/trellis-2-mac-port-frees-3d-asset-generation-from-nvidia-dep-1696b24e)
- Hunyuan3D: 2.1 open-sourced June 2025 with PBR materials — [Hunyuan3D-2.1 GitHub](https://github.com/tencent-hunyuan/hunyuan3d-2.1); 3.0 released Sept 2025 at 1536³ geometric resolution — [Baidu wiki](https://baike.baidu.com/en/item/Hunyuan3D/944427); 3.1 adds 8-view reconstruction, cleaner quad meshes, watertight output — [3D AI Studio: Hunyuan3D 3.1](https://www.3daistudio.com/Models/Hunyuan3D-3-1); available as an API on Replicate — [Replicate](https://replicate.com/tencent/hunyuan-3d-3.1). Tencent open-sourced HY-World 2.0 (world/scene generation) on April 16, 2026 — (search summary; primary page not fetched)
- A June 4, 2026 "Meshy vs Tripo vs Rodin for archviz" comparison tested only furniture (chair, lamp, side table, decor), not buildings; it rated Rodin best-looking, Meshy best overall workflow, Tripo for fast blocking, and said models are not dimensionally exact and need verification — [VisioMake](https://visiomake.com/en/blog/best-ai-image-to-3d-tools-2026-comparison-archviz)
- Most AI 3D generators rely on 2D multi-view estimation, which "leads to geometric hallucinations, holes, and non-manifold edges" (vendor comparison page, so biased) — [Neural4D comparison](https://www.neural4d.com/features/neural4d-vs-tripo-vs-meshy-vs-rodin)
- Meshy markets an "AI 3D Architecture Model Generator" use case — [Meshy architecture](https://www.meshy.ai/use-cases/3d-architecture)

**Facade parsing / window grids**
- CMP facade dataset: 606 manually annotated rectified facade images; labels facade, molding, cornice, pillar, window, door, sill, blind, balcony, shop, deco, background — [CMP dataset repo](https://github.com/wohaiyo/cmp_dataset)
- A SegFormer model fine-tuned on CMP is on Hugging Face (Xpitfire/segformer-finetuned-segments-cmp-facade) — [Hugging Face README](https://huggingface.co/Xpitfire/segformer-finetuned-segments-cmp-facade/resolve/main/README.md?download=true)
- "Beyond Segmentation: Structurally Informed Facade Parsing from Imperfect Images" (Janicki, Plocharski, Musialski; Eurographics 2026 short paper, submitted 2026-04-10): YOLOv8 with a pairwise alignment loss for grid-consistent window boxes on single imperfect images, trained on CMP; code not mentioned — [arXiv 2604.09260](https://arxiv.org/abs/2604.09260)
- SI3FP, "Scalable Image-to-3D Facade Parser" (submitted 2025-08-06; accepted in Automation in Construction): models facade primitives in the orthographic image plane, works with sparse Street View or dense hand-held photos, ~5% error in window-to-wall ratio, aimed at LoD3 thermal models; no code link — [arXiv 2508.04406](https://arxiv.org/abs/2508.04406)
- Mask R-CNN window detection in facade imagery (2021) — [arXiv 2107.10006](https://arxiv.org/abs/2107.10006)

### Inferences
- **Do not use image-to-3D generators for E7 itself.** They are object models, tested on objects, and their output would be [GENERATIVE] geometry that contradicts the "from drawings" claim. At most, use them for small props in the video (street furniture, trees) with a label.
- **Hardware fit:** TRELLIS.2 needs 24 GB; unless the M3 Mac has ≥24 GB unified memory, the local route is closed and a hosted API (Replicate etc.) is the option. Hunyuan3D 3.1 via API is similar.
- **Facade grid from photos is the best "AI" contribution** and keeps provenance clean: geometry (floor heights, footprint) [DRAWINGS] plus window rhythm [PHOTOS]. CMP is mostly European masonry facades, so a SegFormer-CMP model may under-detect curtain-wall mullions; for E7 a faster route is manual counting on rectified photos (5–15 min per elevation) or a vision-language model asked to count bays and mullions, then cross-checked against the plans' column grid.

### Gaps
- TripoSR, Tripo's current models, Rodin Gen-2 and SPAR3D were not researched individually (prices, licences, resolution); no source showed any of them producing a faithful whole building.
- No facade-parsing method with public code tuned for glass curtain walls was found.
- Meshy/Tripo/Rodin current prices were not verified from official pricing pages.
- Hunyuan3D local Mac support was not verified.

---

## 5. Texturing a procedural model from photos: projection texturing in Blender, AI texture generation (StableGen, Meshy texturing), tiling curtain-wall materials

### Takeaway
The quickest honest detail boost is to keep the drawing-derived geometry and project or tile real E7 photos onto it: fSpy camera-match plus Blender's UV Project gives real facade imagery on a matching box, and a rectified bay photo can become a tiling curtain-wall texture. AI texture generators (StableGen) can fill gaps, but StableGen targets Windows/Linux with NVIDIA GPUs, so it is a poor fit for the M3 Mac.

### Cited Findings
- fSpy is an open-source still-image camera-matching tool with an official Blender importer add-on — [fSpy](https://fspy.io/); [fSpy-Blender add-on](https://github.com/stuffmatic/fSpy-Blender)
- Workflow: match the photo's perspective in fSpy, import the camera into Blender, model to match, then apply a UV Project modifier with the fSpy camera as projector to put the photo on the geometry — [Blender Secrets: Projection mapping with fSpy](https://www.3dsecrets.com/secrets/projection-mapping-part-1-fspy-to-blender); [coeleveld.com: Blender/fSpy camera matching](https://coeleveld.com/blender-fspy-camera-matching-still-image/)
- StableGen (Blender add-on): SDXL and FLUX.1-dev through a ComfyUI backend; textures all visible meshes from defined cameras (Sequential mode with inpainting/visibility masks, Grid mode for speed); Refine and Local Edit modes; can also generate meshes with TRELLIS.2. Requires Blender 4.2+, Windows 10/11 or Linux, NVIDIA CUDA GPU recommended, 10–50 GB+ of models — [StableGen GitHub](https://github.com/sakalond/StableGen)

### Inferences
- **Recommended E7 texture recipe (estimates, not sourced):** shoot each elevation straight-on at mid-height on an overcast/dusk period; rectify one representative bay per facade type (Blender/fSpy or any perspective-correct tool); make it a tiling texture sized to the drawing's floor-to-floor height and bay width; apply to the procedural facade. Roughly 1–3 hours for 3–4 facade types. Provenance: geometry [DRAWINGS], appearance [PHOTOS].
- Direct projection of whole-facade photos looks best from the projection viewpoint and smears elsewhere; for a hologram viewed from all sides, tiled bay textures are more robust.
- For the Quest, tiled textures plus simple geometry are cheap to render compared with splats or dense photogrammetry meshes.
- StableGen-style AI texturing would add [GENERATIVE] appearance; if used (e.g., for the unseen roof), label it.

### Gaps
- Meshy's texturing feature (pricing, whether it accepts a user mesh and reference photos) was not researched.
- No Mac-native AI multi-view texturing tool was verified.
- Blender's built-in "Project from View" vs UV Project modifier specifics for curtain walls were not sourced beyond tutorials.

---

## 6. AI video generation (Veo, Sora, Runway, Kling) of the building rising floor by floor: feasibility and honesty problems

### Takeaway
First/last-frame video models (e.g., Veo 3.1) can morph an empty site into a finished E7 in 8-second clips, but the in-between frames are invented and will not follow the real build sequence, so such footage cannot be presented as "generated from the drawings". Sora is not an option (app shut down in April; API removed Sept 24, 2026). The honest vision video is a Unity/Blender render of the drawing-derived model rising floor by floor, with any AI video only as a labelled stylistic insert.

### Cited Findings
- Veo 3.1 "first and last frame" mode generates an 8-second clip interpolating between a user's start and end images with a prompt; marketed for "time-lapses, transformations" — [fal.ai: Veo 3.1 first-last frame](https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video); [Eachlabs](https://www.eachlabs.ai/google/veo3-1/veo3-1-first-last-frame-to-video)
- API prices (July 2026, secondary aggregator): Veo 3.1 Standard ~$0.75/s, Veo 3.1 Fast ~$0.15/s, Kling 3.0 ~$0.10/s, Runway Gen-4.5 ~$1.50/clip, Sora 2 ~$0.75/s — [BuildMVPFast AI video pricing](https://www.buildmvpfast.com/api-costs/ai-video); [Tech-Insider comparison](https://tech-insider.org/best-ai-video-generator-2026/)
- Sora: web/app experiences discontinued April 26, 2026; Videos API and all Sora 2 models removed from the API on September 24, 2026 (announced March 24, 2026) — [OpenAI Help: Sora discontinuation](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation); [OpenAI API deprecations](https://developers.openai.com/api/docs/deprecations)
- If Google 3D Tiles appear in a promotional video, it is capped at 30 s and must be marked "for promotional purposes only" — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)

### Inferences
- **Feasibility:** a single clip "empty lot to finished E7" is feasible in minutes for a few dollars, given a good end frame (a photo of E7). A controlled floor-by-floor sequence is not: each clip is ~8 s, models do not keep geometry consistent across clips, and they will invent cranes, floors and facades.
- **Honesty problem:** the pitch says "drawings to 3D to build sequence". AI video derives nothing from the drawings; showing it without a label would misrepresent the product in front of judges. If used, caption it on screen (e.g., "AI-generated illustration, not output of Cut Once").
- **Better option:** render the drawing-derived E7 in Unity (the blueprint already plans a world-height clip plane for the rise) and composite real photos/splats as context, each labelled by source.
- Sora 2 API is removed on Sept 24, 2026, days after the hackathon, and is already gone from the app, so it should not be planned for.

### Gaps
- No source evaluated structural consistency of AI video for construction sequences.
- Veo availability and pricing for users in Canada (Gemini app vs API) was not verified.
- Hack the North rules on AI-generated media in demos were not checked here (see the separate judging-rules note).

---

## 7. Legal/ethical: photographing a university building and publishing a scan; people in captures; UW policies

### Takeaway
Canadian copyright law expressly allows photographs and films of a building, which covers photos, the video, and photo-textures; whether a published 3D scan or model is covered is less clear because the exception names only paintings, drawings, engravings, photographs and cinematographic works, and it excludes copies "in the nature of an architectural drawing or plan". People in the atrium are the bigger practical issue: UW guidance says to get consent before publishing identifiable individuals, so capture at quiet times, crop/blur, and avoid publishing raw captures.

### Cited Findings
- Copyright Act s. 32.2(1)(b): it is not infringement "for any person to reproduce, in a painting, drawing, engraving, photograph or cinematographic work (i) an architectural work, provided the copy is not in the nature of an architectural drawing or plan" — [Justice Laws: Copyright Act s. 32.2](https://laws-lois.justice.gc.ca/eng/acts/C-42/section-32.2.html)
- s. 30.7 permits incidental, non-deliberate inclusion of a work in another work — [Justice Laws: Copyright Act s. 32.2 page / s. 30.7](https://laws-lois.justice.gc.ca/eng/acts/C-42/section-32.2.html)
- "Architectural work" is defined to include any building or structure or any model of a building or structure — [Wikipedia: Authorship and ownership in Canadian copyright law](https://en.wikipedia.org/wiki/Authorship_and_ownership_in_copyright_law_in_Canada) (via search summary; check the Act's s. 2 definition)
- UW Privacy FAQ: "When students or employees participate in a public event on the campus, there is no expectation of privacy and Waterloo may publish photographs that provide evidence of participation at a public event." and "If you wish to publish photographs which feature identifiable individuals, then you should seek consent." (Model Release form) — [UW Privacy FAQ](https://uwaterloo.ca/privacy/frequently-asked-questions-faq)
- UW drone rules require privacy/consent consultation with Creative Services and signage for drone filming — [UW Safety Office: Drones](https://uwaterloo.ca/safety-office/occupational-health-safety/remotely-piloted-aircraft-systems-drones)
- Google 3D Tiles terms forbid deriving models from the tiles and offline use (see section 3) — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)

### Inferences
- **Photos and the video of E7:** covered by s. 32.2(1)(b) (photograph / cinematographic work). Photo textures on the model are photos in a new use; low risk for a hackathon demo.
- **A 3D model or scan of E7 published as a downloadable asset** is not squarely a "photograph or cinematographic work" and a model of a building is itself within "architectural work"; low practical risk for a demo, but do not publish the raw scan or model files publicly (the GitHub repo is public). Keep captures and E7 assets git-ignored like the Perkins&Will overlay images already are. This is not legal advice.
- **Drawings:** the exception excludes copies "in the nature of an architectural drawing or plan", so redistributing the Perkins&Will plans is not covered; the team's existing decision to keep those pixels out of the public repo is consistent with this.
- **People:** Hack the North is a public event inside E7, so incidental attendees will appear. Scan at low-traffic hours, avoid close-ups of faces, blur identifiable people in any published frames, and do not publish raw splats (splats keep people as ghostly figures that are hard to blur).
- **Labelling on screen** (in the app and the video): "Geometry: from published drawings (Perkins&Will via ArchDaily)"; "Textures/scan: team photos, Sept 2026"; "Context: Imagery © Google" if used; "AI-generated" on any generative content.

### Gaps
- No UW policy specifically on photographing or 3D-scanning buildings (as opposed to people or drones) was found.
- No Canadian case law on 3D scans of buildings was found.
- Hack the North's own photography/recording rules for attendees were not checked.

---

## 8. Overall comparison of approaches (objective): tools, cost, platform, time, formats, quality/scale, Quest 3 rendering, provenance

### Takeaway
For a 22-hour window, the best mix is: drawing-derived geometry as the truth model [DRAWINGS]; real photo textures and a window grid counted from photos [PHOTOS] for detail; an optional atrium splat [PHOTOS] in the video (headset only if an early spike passes); Google 3D Tiles only as a labelled live backdrop; no generative 3D for E7 and no unlabelled AI video.

### Cited Findings
- Capture/pricing/format facts are cited in sections 1–2: [Polycam pricing](https://poly.cam/pricing), [Scaniverse platform](https://radiancefields.com/platforms/scaniverse), [Scaniverse update](https://radiancefields.com/niantic-releases-major-scaniverse-update), [KIRI pricing](https://www.kiriengine.app/pricing), [RealityScan Mobile](https://www.cgchannel.com/2025/06/epic-games-releases-realityscan-2-0-and-realityscan-mobile-1-7/), [Apple area mode](https://developer.apple.com/videos/play/wwdc2024/10107/), [Brush](https://github.com/ArthurBrussee/brush/blob/main/README.md), [OpenSplat](https://github.com/pierotofy/OpenSplat), [Postshot](https://radiancefields.com/platforms/postshot)
- Quest splat budgets: 150k (Meta guidance) — [Meta Spatial SDK splats](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-splats/); ~400k at 72 fps (community fork) — [ninjamode](https://github.com/ninjamode/Unity-VR-Gaussian-Splatting)
- Google tiles terms and costs — [Policies](https://developers.google.com/maps/documentation/tile/policies); [Usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
- Generators are object-scale — [TRELLIS.2](https://github.com/microsoft/TRELLIS.2); [VisioMake](https://visiomake.com/en/blog/best-ai-image-to-3d-tools-2026-comparison-archviz)

### Inferences
Comparison table (time and quality columns are team-specific estimates unless a source is cited in sections 1–7):

| Approach | Provenance | Tools (cost) | Platform fit (M3 Mac, iPhone/Android, Quest 3) | Time to usable result (estimate) | Output | Quality / scale | Quest 3 in Unity |
|---|---|---|---|---|---|---|---|
| Procedural facade on drawing massing, window grid counted from photos | DRAWINGS + PHOTOS (counts only) | Blender/Unity, phone camera (free) | All local | 2–4 h | FBX/GLB | Scale from drawings (scale bar); details approximate | Excellent (low poly, instanced windows) |
| Photo textures (fSpy + UV Project, or rectified tiling bays) | DRAWINGS geometry + PHOTOS appearance | fSpy, Blender (free) | Mac-native | 1–3 h | Textures + GLB | Looks real at facade scale; smears off-axis if projected | Excellent |
| Atrium splat from phone | PHOTOS | Scaniverse (free, on-device) or Polycam Basic ($30/mo) | iOS/Android capture; PLY/SPZ into Unity | 30–60 min capture+process; 1–2 h Unity spike | PLY/SPZ | Photoreal, scale-free unless set; people/glass artefacts | Risky: ≤150k–400k splats, open Quest sort bug, macOS build report |
| Exterior splat from ground | PHOTOS | Scaniverse / Polycam / KIRI | As above | 1–2 h | PLY/SPZ | Sharp low floors, blurry top, no roof, glass artefacts | Too many splats unless cropped hard; better in video |
| Phone photogrammetry mesh (exterior bay or atrium) | PHOTOS | KIRI (free 150 photos), Polycam, RealityScan Mobile (free), KIRI 3DGS-to-Mesh | Phone/cloud; Mac dense MVS blocked (CUDA) | 1–3 h | OBJ/GLB/FBX | Decent on matte surfaces; glass fails | Good if decimated |
| Apple Object Capture area mode | PHOTOS | Built-in API (free) | iPhone 12 Pro+, Mac reprocess | 1–2 h | USDZ (convert) | Apple warns >6 ft areas degrade | OK after conversion; not building-scale |
| Google Photorealistic 3D Tiles | GOOGLE | Cesium ion (free non-commercial) + Google tiles | Unity on Android/Quest supported | 1–2 h to integrate | Streamed 3D Tiles | Aerial-mesh quality; Waterloo coverage unverified | Works (WorldLens) but needs live network; no tracing/offline; attribution required |
| Image-to-3D (TRELLIS.2, Hunyuan3D, Meshy, Tripo, Rodin) | GENERATIVE | Open weights (24 GB GPU) or paid APIs | TRELLIS.2 Mac port needs 24 GB+ | Minutes per asset | GLB (PBR) | Object-scale, hallucinated, not E7 | Fine for props only |
| AI video (Veo 3.1, Kling, Runway) | GENERATIVE | ~$0.10–0.75/s | Cloud | Minutes per 8 s clip | MP4 | Plausible, invented sequence | N/A (video only) |

- Honest framing for judges: "Cut Once reconstructs the building from its drawings; for this vision video we dressed the model with our own photos of E7 (and Google context imagery)." Each layer should carry an on-screen source label.

### Gaps
- None of the sources measured end-to-end timings for these pipelines on an M3 Mac or a building like E7; all time estimates above are the researcher's judgement.
- The Quest 3 triangle/draw-call budget for photogrammetry meshes was not researched here.
