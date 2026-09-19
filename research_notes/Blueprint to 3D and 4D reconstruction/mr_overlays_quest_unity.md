# Full-scale MR/AR plan overlays and camera-checked assembly guidance (Quest 3 + Unity focus)

Research date: 2026-09-18. GitHub star counts, licenses and "last push" dates come from the GitHub REST API, queried 2026-09-18/19 UTC. "Unverified" means I could not open a primary source.

Out of scope (covered by other researchers): converting drawings to 3D, 4D scheduling, and assembly-sequencing algorithms.

---

## 1. Open-source AR/MR BIM and construction overlay projects: what they achieved, how they align, how accurate they are

### Takeaway
Public code for full-scale BIM overlays is thin. Most of it is student or academic prototypes: HoloLens 1/2 apps from 2020–2022, the ETH/Princeton COMPAS XR timber-assembly stack, a few 2025–2026 Quest repos with 0–2 stars, and a handful of research-code dumps. The strongest measured accuracy comes from the fabrication research line, not the construction-site line. Multiple QR/fiducial markers reached under 2 mm on HoloLens 2 when markers were spaced 0.38 m or closer. Site-scale alignment still relies on markers, manual picking, or commercial VPS/SLAM tools. No open project I found checks progress against the model with the headset camera on a Quest.

### Cited Findings

**Construction / BIM overlay repos (open code)**
- **Tianyu-Wu/HoloInspect**: ETH Zurich course project (Fall 2020) for HoloLens 1. Unity 2019.4.12f1, MRTK 2.5.1, Azure Spatial Anchors 2.7.0. Features: tap-to-place, layer toggles, per-element progress ("time management"), budget highlighting, 1:1 inspection, georeference. 16 stars, no license, last push 2021-04-29. — [GitHub](https://github.com/Tianyu-Wu/HoloInspect)
- **autodesk-platform-services/poc-hololens-bim360**: Autodesk prototype that connects BIM 360 to HoloLens. Archived; 4 stars; last push 2022-12-10. — [GitHub](https://github.com/autodesk-platform-services/poc-hololens-bim360)
- **shylux/HoloLens-BIM**: thesis project for HoloLens BIM (Genecand & Knöpfel), 5 stars. — [GitHub](https://github.com/shylux/HoloLens-BIM)
- **compas-dev/compas_xr** (ETH Zurich Gramazio Kohler + Princeton): an open-source XR framework for AEC with a Python package (PyPI, runs in Rhino 8) and Unity phone apps. MIT, 17 stars, pushed 2026-09-10. — [GitHub](https://github.com/compas-dev/compas_xr), [ETH page](https://designplusplus.ethz.ch/research/Software/compas-xr.html). Its Unity visualizer app is **compas-dev/compas_xr_unity_assembly** ("Visualizer app for collaborative robotic assembly"), MIT, 3 stars, pushed 2026-07-20. — [GitHub](https://github.com/compas-dev/compas_xr_unity_assembly)
  - COMPAS XR computes the inverse camera-to-target transform when it detects an image target, and uses QR markers to overlay the model. The timber work reports drift errors under 2 mm. (This comes from search-result summaries of the ETH pages and user guide; I could not see these details in the parts of the docs I fetched, so treat it as partly unverified.) — [COMPAS XR user guide](https://compas.dev/compas_xr/0.9.4/userguide.html)
  - Used in "Interactive Digital Twins" (ACM SCF 2025). That system combined motion-capture marker tracking with XR for timber assembly, and the authors state it "reduced assembly time and errors" (qualitative in the abstract). — [ACM DL](https://dl.acm.org/doi/10.1145/3745778.3766661)
- **BoanTao/MR-Real-Time-Construction-Inspection**: code and dataset for "Autonomous Mixed Reality Framework for Real-Time Construction Inspection" (Tao, Li, Bosché, ITcon vol. 30, 2025, pp. 852–874). It combines MR, BIM-supported object localization and validation, and AI object detection for progress monitoring. MIT, 0 stars. — [GitHub](https://github.com/BoanTao/MR-Real-Time-Construction-Inspection), [DOI](https://doi.org/10.36680/j.itcon.2025.035)
- **ibois-epfl/augmented-carpentry**: EPFL's open-source AR software for manual timber fabrication. It tracks tools with a tool-mounted camera rather than a headset, and gives feedback for saw cuts and drilling. It was evaluated by scanning 1:1 mock-ups against the execution models. GPL-3.0, 15 stars. — [GitHub](https://github.com/ibois-epfl/augmented-carpentry), [arXiv 2503.07473](https://arxiv.org/abs/2503.07473)
- **ailton-santos/BIM_AR_Precision**: says it is a "C++ framework for large-scale BIM visualization with high-precision" for Quest 2/3. 2 stars, no license. Claims not verified. — [GitHub](https://github.com/ailton-santos/BIM_AR_Precision)
- **EternaArenaOfficial/DifferencesDetectionForConstructionSitesXR**: Unity XR app that compares the site with the model and tracks progress. 0 stars, no license, last push 2025-08-26. Maturity unknown. — [GitHub](https://github.com/EternaArenaOfficial/DifferencesDetectionForConstructionSitesXR)
- **Mercer-S/MR-visual-warning**: code for an Automation in Construction 2022 paper on real-time MR visual warnings for construction workers. 3 stars. — [GitHub](https://github.com/Mercer-S/MR-visual-warning)

**The team's already-known repos (status check)**
- **JDeffner/xr-drilling-assistant**: final assignment for a Trier University VR course (summer 2026). Unity 6000.4.2f1, Meta XR Core SDK and MRUK. The left controller simulates a stud finder near a real wall. The user plans drill holes and cables in VR on a grabbable copy of the wall, then projects the plan back onto the physical wall in AR. MIT, 1 star. — [GitHub](https://github.com/JDeffner/xr-drilling-assistant)
- **BehradBeheshti/sitexr**: "Meta Quest 3 WebXR walkthrough of a Gaussian-splat construction site." 0 stars, no license, pushed 2026-09-19 UTC. Only hours old, so it may be another team's HTN 2026 project. — [GitHub](https://github.com/BehradBeheshti/sitexr)
- **fabio914/passtracing**: WebXR app for drawing and tracing in passthrough. 39 stars, MIT, last push 2022-12-21 (inactive). — [GitHub](https://github.com/fabio914/passtracing)
- **xrdevrob/QuestCameraKit**: details in section 3. 577 stars, MIT, pushed 2026-09-08. — [GitHub](https://github.com/xrdevrob/QuestCameraKit)

**Accuracy and alignment evidence from papers**
- Kyaw et al., "Augmented Reality for high precision fabrication of Glued Laminated Timber beams" (Automation in Construction 152, 2023). Using multiple QR codes with the Fologram plug-in on HoloLens 2, alignment between static beams and the execution model was under 2 mm when markers were at most 0.38 m apart. Marker placement, frequency and size drive the precision. — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580523001723) (numbers come from search-result summaries of the paper; full text not opened)
- The follow-up "AR Glulam" (Kyaw, Xu, Zivkovic, Jahn; arXiv, Feb 2025) moved the multi-fiducial method into an industrial glulam factory (Unalam). It notes that glulam needs tolerances under 2 mm and reports lab-validated "precision of 0.97" (units not given in the abstract). — [arXiv 2502.08566](https://arxiv.org/abs/2502.08566)
- In construction, HoloLens spatial mapping alone is described as not accurate enough to align a BIM model: meshes are often not flush with walls and cover only fragments of a building. — [TNOCS HoloLens projects wiki](https://github.com/TNOCS/WorldExplorer/wiki/Interesting-HoloLens-projects) (search-result summary)
- HoloLens 2 marker-based BIM registration has been used to inspect prefabricated bridge decks for dimensional and positional deviations and tolerance compliance (MDPI Buildings). — [MDPI](https://www.mdpi.com/2075-5309/16/12/2337) (page returned 403; summary from search snippet; accuracy figures unverified)
- For comparison, medical HoloLens 2 studies report 1–2 cm depth-based registration in under 4 s, and manual registration averaging within 10 mm. These are medical settings, not construction. — [PMC12055921](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12055921/)
- A 2025 Automation in Construction paper on AR site management splits the BIM model by user-selected timeframes. It calls optimized, split models "crucial for accurate overlaying at full scale." — [ScienceDirect S0926580525002444](https://www.sciencedirect.com/science/article/abs/pii/S0926580525002444)
- Industry survey (not peer-reviewed; Dace Campbell, Auganix, Aug 2024) groups MR alignment UX into four families:
  - visual/manual drag plus gizmo (e.g., Arkio)
  - machine-readable QR fiducials at known site points (BIM Holoview, Connect AR, vGIS, XYZ Reality)
  - geometric feature matching such as wall corners (Argyle, GAMMA AR)
  - algorithmic SLAM/CV auto-alignment (vGIS, BIM Holoview)
  
  It gives no accuracy numbers. — [Auganix](https://www.auganix.org/xr-in-aec-alignment-ux-methods-for-mr-and-ar-in-construction/)
- Commercial Quest precedent: Resolve documents AR with color passthrough on Quest, and SENTIO VR overlays BIM 1:1 on site with Quest. — [Resolve help](https://support.resolvebim.com/en/articles/6700300-augmented-reality-with-color-passthrough), [SENTIO](https://www.sentiovr.com/post/new-augmented-reality-in-construction-overlay-bim-models-on-site-at-1-1-scale-with-meta-quest)

**IFC / BIM loading options for Unity (and web)**
- **IfcOpenShell / IfcConvert**: converts IFC geometry to GLB, OBJ, DAE, STP and more. LGPL-3.0, 2,793 stars, active. — [IfcConvert docs](https://docs.ifcopenshell.org/ifcconvert.html), [GitHub](https://github.com/IfcOpenShell/IfcOpenShell)
  - `--use-element-guids` puts IFC GlobalIds into GLB node names (e.g., `product-<guid>-body`), which lets a runtime map meshes back to BIM elements. — [IfcOpenShell discussion #5430](https://github.com/IfcOpenShell/IfcOpenShell/discussions/5430) (search summary)
  - Known issue: direct IFC→GLB can produce too many vertices; some users go IFC→DAE→GLB via COLLADA2GLTF to keep hierarchy. — [Issue #4718](https://github.com/IfcOpenShell/IfcOpenShell/issues/4718), [Issue #790](https://github.com/IfcOpenShell/IfcOpenShell/issues/790)
- **Chair-Intelligent-Technical-Design/IFC-Unity-Editor-Plugin**: loads IFC at design time only, not at runtime. Apache-2.0, 20 stars, last push 2023-07-05. A third-party "IFC-fix" repo exists for its import problems. — [GitHub](https://github.com/Chair-Intelligent-Technical-Design/IFC-Unity-Editor-Plugin)
- **specklesystems/speckle-unity**: AEC interoperability connector. Archived (last push 2024-11-01), so don't depend on it. — [GitHub](https://github.com/specklesystems/speckle-unity)
- **xBimTeam/XbimEssentials**: .NET IFC library, 576 stars, active. Unity/Android (IL2CPP) compatibility not verified. — [GitHub](https://github.com/xBimTeam/XbimEssentials)
- Web route: **ThatOpen/engine_web-ifc** (MPL-2.0, 1,046 stars) and **ThatOpen/engine_components** (MIT, 703 stars) read IFC in JavaScript. — [web-ifc](https://github.com/ThatOpen/engine_web-ifc), [components](https://github.com/ThatOpen/engine_components)

### Inferences
- Nothing open-source already combines the team's pieces (full-scale overlay, per-part built/missing state, camera checking, voice) on Quest 3. HoloInspect's per-element progress coloring and COMPAS XR's built/unbuilt assembly state are the closest ideas, but neither checks with a camera and neither targets Quest.
- For a desk-sized object, marker-based alignment (multiple QR codes close together) is the only method with published millimetre-level accuracy, although that result is on HoloLens 2 with Fologram. For the team, the model size question barely matters (a desk is tens of parts). It matters for the "campus building" vision, where the literature splits or optimizes models before overlay.
- The least risky path for any IFC input is offline IFC→GLB via IfcConvert with `--use-element-guids`, then a runtime glTF loader. Keep node names equal to part IDs so Elasticsearch hits, voice answers and highlights all use the same key.

### Gaps
- I found no open-source Quest 3 BIM overlay with published accuracy numbers or a field test.
- Model-size and polygon limits for Quest 3 BIM overlays: no primary source with numbers.
- Couldn't open the MDPI bridge-deck paper (403) or the Remote Sensing "Two-step alignment of MR devices to existing building data" paper for their accuracy figures ([MDPI](https://www.mdpi.com/2072-4292/14/11/2680)).
- COMPAS XR's device support (Android/iOS only, or also HoloLens/Quest) wasn't confirmed from the docs pages I opened.

---

## 2. AR assembly guidance research: does overlay guidance reduce errors or time vs paper? Any open-source furniture/LEGO AR guides?

### Takeaway
The evidence consistently says in-situ 3D overlays **reduce errors**. Tang et al. 2003 measured 82% fewer errors, and a 2025 full-scale MEP study found AR LOD 400 beat paper isometrics. The evidence on **time is mixed**: paper was fastest in Blattgerste 2017, and HMD instructions were slower and caused more errors than paper or projection in Büttner 2016. Detail level and display quality matter. Open-source LEGO/furniture AR guides with released code are rare. The best open resources for "is this step done?" are assembly-state datasets and code (IndustReal) and research systems (Microsoft SIGMA), not finished apps.

### Cited Findings

**Controlled studies with numbers**
- **Tang, Owen, Biocca, Mou (CHI 2003)**: compared a printed manual, CAI on a monitor, CAI on an HMD, and registered 3D AR overlays. Overlaying 3D instructions on the work pieces "reduced the error rate for an assembly task by 82%," mostly by cutting cumulative errors (errors caused by earlier mistakes). AR also lowered mental effort. 686 citations. — [ACM DL](https://dl.acm.org/doi/10.1145/642611.642626), abstract via [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1145/642611.642626)
- **Hou, Wang, Bernold, Love (J. Computing in Civil Engineering, 2013)**: animated AR vs paper manual for a LEGO model. Two experiments, 50 participants. AR gave shorter completion times, fewer errors, lower total task load, and a shorter learning curve for novices. — [DOI](https://doi.org/10.1061/(asce)cp.1943-5487.0000184)
- **Blattgerste, Strenge, Renner, Pfeiffer (PETRA 2017)**: in-situ AR on a smartphone, HoloLens and Epson Moverio BT-200 vs paper pictorial instructions. **Paper was fastest; HoloLens produced the fewest errors.** — [OpenAlex abstract](https://api.openalex.org/works/https://doi.org/10.1145/3056540.3056547)
  - A related Blattgerste/Renner paper, "In-Situ Instructions Exceed Side-by-Side Instructions in AR Assisted Assembly," found in-situ beat side-by-side on errors, time and perceived load. — [Semantic Scholar](https://www.semanticscholar.org/paper/In-Situ-Instructions-Exceed-Side-by-Side-in-Reality-Blattgerste-Renner/ca0040e29710d5b41a99525d30f3e48fa1bf99b3)
- **Büttner, Funk, Sand, Röcker (PETRA 2016)**: at a manual assembly workstation, in-situ projection and paper both gave significantly faster times and fewer errors than HMD instructions. — [OpenAlex abstract](https://api.openalex.org/works/https://doi.org/10.1145/2910674.2910679)
- **Chaudhari, Goodrum, Brady, Jones (J. Construction Engineering & Management 151(12), 2025)**: full-scale MEP assembly, novices and industry workers, AR HMD at LOD 300 and LOD 400 vs isometric paper plans. AR LOD 400 significantly improved **all** metrics (time, rework, errors) in both groups, except error rate among industry professionals. LOD 300 mainly cut rework. Paper was least effective. Some participants reported the AR as distracting. — [ASCE](https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-16726), abstract via [OpenAlex](https://api.openalex.org/works/https://doi.org/10.1061/JCEMD4.COENG-16726)
- **Warden, Wickens, Clegg, Ortega (HFES 2023 meta-analysis)**: 82 effect sizes from 17 studies. Overlaid displays sped up responses on integration tasks without hurting accuracy, which supports HMDs for tasks that combine display information with the real world. — [SAGE](https://doi.org/10.1177/21695067231192430) (search summary; full text not opened)
- **Byers et al. (arXiv, May 2025)**: classroom (dis)assembly study with graduate civil engineering and architecture students. AR scored highest on SUS; MR had the best (lowest) NASA-TLX. Devices and completion-time/error data weren't in the abstract. — [arXiv 2505.07154](https://arxiv.org/abs/2505.07154)
- **Han, Wang, Dong, Búš (Architectural Intelligence, 2025)**: HMD AR guidance for self-builders assembling CLT timber modules. Continuous QR-marker tracking and snap-to-place, tested on a 1:5 scale model. Evaluated by user survey (perception/UX), not time or error metrics. — [Springer](https://link.springer.com/article/10.1007/s44223-025-00091-6)

**LEGO / furniture AR guides and "is it done?" detection**
- **BRICKxAR** (Wei Yan, arXiv 2019/2020): marker-based AR LEGO instructions with average registration error under 1 mm, virtual–physical brick occlusion and hand occlusion. Prototype built the LEGO Arc de Triomphe. No code release indicated. — [arXiv 1907.12549](https://arxiv.org/abs/1907.12549)
- **BrickPal** (Shi et al., arXiv 2023): AR HMD brick-assembly instructions with NLP-generated sequences; its user study found them as usable as manually adapted sequences. Code release not found. — [arXiv 2307.03162](https://arxiv.org/abs/2307.03162)
- **Kyaw, Ma, Zivkovic, Sabin**: "AI Assisted AR Assembly" (arXiv Nov 2025) and "Augmented Assembly" (arXiv 2601.11535). Deep-learning object recognition finds LEGO and 3D-printed parts. The system draws a bounding box on the part to pick and on where it goes, and uses hand tracking to verify interactions. LEGO case study; no quantitative user study in the abstract; code not found. — [arXiv 2511.05394](https://arxiv.org/abs/2511.05394), [arXiv 2601.11535](https://arxiv.org/abs/2601.11535)
- **IKEA AssembleAR / IKEA-Assemble**: concept and proof-of-concept apps (2018, Behance). Not open source, no study. — [Dezeen](https://www.dezeen.com/2018/03/23/ikea-assembly-made-easier-through-augmented-reality-app/), [Behance](https://www.behance.net/gallery/79250897/IKEA-Assemble-AR-Furniture-Assembly)
- **IndustReal** (Schoonbeek et al., WACV 2024): 84 egocentric videos of 27 participants assembling and maintaining a STEMFIE construction-toy car. Labels cover action recognition, **assembly state detection (COCO format)** and procedure step recognition, including omission and execution errors. Code and model weights are released. Apache-2.0, 31 stars, last push 2024-08-19. — [GitHub](https://github.com/TimSchoonbeek/IndustReal), [arXiv 2310.17323](https://arxiv.org/abs/2310.17323)
- **ASDF** assembly state detection with 6D pose late fusion (arXiv 2403.16400), and **GBOT** graph-based 3D object tracking for AR assembly guidance. — [ASDF](https://arxiv.org/pdf/2403.16400), [GBOT](https://www.researchgate.net/publication/379856913_GBOT_Graph-Based_3D_Object_Tracking_for_Augmented_Reality-Assisted_Assembly_Guidance) (code availability not checked)
- **SIGMA** (Microsoft Research; Bohus, Andrist et al., arXiv 2024): an open-source "Situated Interactive Guidance, Monitoring, and Assistance" system. It uses a mixed-reality headset with LLMs and vision models to guide procedural tasks step by step. Code lives at `microsoft/psi/Applications/Sigma` (SigmaApp, SigmaComputeServer, UWP client, so HoloLens 2 / Windows rather than Quest). — [arXiv 2405.13035](https://arxiv.org/abs/2405.13035), [GitHub microsoft/psi](https://github.com/microsoft/psi/tree/master/Applications/Sigma)
- "Teaching LLMs to See and Guide" (arXiv 2511.00730): a context-aware GPT-4o assistant for AR task guidance. Richer prompts (task description, current step, hand actions, dialogue history) scored 4.41/5 as judged by an LLM and 4.39±0.73 by humans, winning 81.4% of human comparisons. Evaluated offline on HoloAssist; latency not reported. — [arXiv 2511.00730](https://arxiv.org/html/2511.00730)

### Inferences
- For the pitch, the defensible line is "AR overlays cut assembly errors, by up to 82% in controlled studies (Tang 2003), and beat paper isometrics at full scale (Chaudhari 2025)." Don't promise faster builds, because the time results conflict. Most gains come from preventing cumulative errors, which matches the "Cut Once" framing.
- Overlay quality (LOD 400 vs 300) and in-situ registration drove the benefit, and a poorly registered HMD overlay can be worse than paper (Büttner 2016). Good alignment matters more than extra features.
- Nobody publishes a ready-made "verify this build step from a headset camera" component for Quest. The practical 36-hour approach is to ask a VLM about specific parts rather than train a detector. IndustReal shows that training an assembly-state detector needs dedicated labeled data.

### Gaps
- Numbers for Kolla et al. (paper vs AR; [SSRN](https://ssrn.com/abstract=3859970)) and for AR furniture studies specifically were not retrieved.
- No peer-reviewed Quest 3 passthrough assembly-guidance study with time/error numbers turned up.
- Whether BrickPal, BRICKxAR or the Kyaw LEGO systems released code is unconfirmed.

---

## 3. Quest 3 + Unity building blocks: camera API, samples, MRUK, anchors, detection, glTF/IFC loading, voice and wake word

### Takeaway
Everything needed exists as maintained Meta or community code.
- **Camera frames:** Passthrough Camera API (PCA), shippable in Store apps since Meta XR SDK v76 (Apr 2025).
- **Starting points:** Meta's PCA samples (Unity 6, MRUK v81+, Horizon OS v74+) and QuestCameraKit (MIT). QuestCameraKit already bundles MRUK QR tracking, YOLO detection, WebRTC streaming, and an OpenAI Whisper → Vision → TTS loop.
- **Markers:** MRUK native QR tracking (v78+, no camera permission).
- **Anchors and occlusion:** spatial anchors (3 m coverage guidance) and the Depth API.
- **Models:** glTFast or UnityGLTF for runtime `.glb` loading.

The weak spots are the wake word (Porcupine dropped its Unity binding; openWakeWord's pretrained models are non-commercial and have no Unity port) and WebXR camera access, which was announced for v77 but is unverified.

### Cited Findings

**Passthrough Camera API (PCA)**
- Current Meta docs:
  - Horizon OS v74+; v83 adds 1280×1280.
  - Quest 3 / 3S only.
  - Resolutions 1280×960 (4:3) and 1280×1280 (1:1); 60 Hz; image capture latency 20–40 ms.
  - About 1–2% GPU per camera, about 45 MB memory, YUV420 internally.
  - Permission `horizonos.permission.HEADSET_CAMERA` (or `android.permission.CAMERA`); passthrough must be enabled.
  - Not supported in XR Simulator. The camera covers a smaller rectangle than the user's view.
  - Meta advises against hard-coding 1280×960.
  
  — [Meta PCA overview (Unity)](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview)
- **Conflicting specs:** UploadVR (v74 experimental launch and v76 Store launch, 30 Apr 2025) reported 30 FPS, a 1280×960 maximum and 40–60 ms latency. It also said the latency "isn't suitable for tracking fast moving objects," small text can't be read, and Unity's WebCamTexture reads only one camera at a time. The current docs list 60 Hz and 20–40 ms, so specs likely improved in later OS releases. — [UploadVR v74](https://www.uploadvr.com/quest-passthrough-camera-api-experimental-out-now/), [UploadVR v76 Store](https://www.uploadvr.com/quest-passthrough-camera-api-now-shippable-on-store/)
- Meta blog (30 Apr 2025): PCA is built on Android Camera2 and available in Unity, Unreal, Native and Spatial SDK at v76. "Stay tuned for WebXR support and accompanying documentation launching with v77." — [Meta blog](https://developers.meta.com/horizon/blog/new-era-mixed-reality-passthrough-camera-api-machine-learning-computer-vision/)

**Meta's Unity PCA sample project**
- **oculus-samples/Unity-PassthroughCameraApiSamples** has five scenes:
  - CameraViewer
  - CameraToWorld (camera pose, and mapping 2D pixels to 3D world)
  - BrightnessEstimation
  - MultiObjectDetection
  - ShaderSample
- Requirements: Unity 6000.0.38f1+, MRUK v81+, Inference Engine (Sentis) 2.2.1 for detection, Quest 3/3S on Horizon OS v74+, or Link v2.1+.
- License: Oculus License, with MIT on marked files including the YOLO model. 508 stars, pushed 2026-08-13.

— [GitHub](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples)
- **MultiObjectDetection details:**
  - Model: YOLOv9t quantized to uint8, 80 classes, about 2.3 MB `.sentis` file. The medium YOLO (146 MB) "performs worse."
  - Runtime: GPU Compute backend recommended; inference is split layer-by-layer across frames (`K_Layers Per Frame`).
  - Known issues: accuracy "not 100%," some objects misclassified (phones seen as TV/monitor), boxes don't align perfectly.
  - Meta advises avoiding large generative models and LLMs on-device.
  - No FPS figure is published.
  
  — [Meta Inference Engine for PCA](https://developers.meta.com/horizon/documentation/unity/unity-pca-sentis/)
- Package naming: Unity Sentis was renamed "Inference Engine" (`com.unity.ai.inference`, 2.2, with Unity 6.2 in Aug 2025; namespace `Unity.Sentis` → `Unity.InferenceEngine`). The display name went back to "Sentis" from package 2.4. — [Unity upgrade guide](https://docs.unity3d.com/Packages/com.unity.ai.inference@2.2/manual/upgrade-guide.html), [Unity Discussions](https://discussions.unity.com/t/did-inference-engine-package-revert-to-the-old-sentis-name/1695183)

**QuestCameraKit (xrdevrob)**
- Samples:
  1. Color Picker (environment raycast to pixel)
  2. Object Detection (YOLO via Unity Inference Engine, detections placed in 3D)
  3. **Native QR Tracking via MRUK** (payload and bounds)
  4. Camera Shaders
  5. **Image + Voice AI**: records a question, transcribes with OpenAI Whisper, sends camera frames to OpenAI Vision, speaks the answer with TTS
  6. WebRTC streaming (SimpleWebRTC + Unity WebRTC; needs a signaling server)
- Requirements: Unity 6000.3.12f1, Meta XR Core/MRUK 205.0.0, Meta OpenXR 2.6.1, Quest 3/3S, Android ARM64 IL2CPP.
- MIT, 577 stars, active.
- No latency numbers published. Noted caveats: QR tracking needs good light; OpenAI calls cost money.

— [GitHub](https://github.com/xrdevrob/QuestCameraKit)

**Other PCA community packages**
- **TakashiYoshinaga/QuestArUcoMarkerTracking**: ArUco (single and multi) and ChArUco tracking through PCA. Requires the **paid** OpenCV for Unity asset, v3.0.3+; the free trial runs only in the Editor. MIT, 181 stars, pushed 2026-09-16. — [GitHub](https://github.com/TakashiYoshinaga/QuestArUcoMarkerTracking)
- **HoloLabInc/QuestCameraTools-Unity**: spatial alignment through PCA using **QR codes** (track any code, or specific predefined payloads) or **Immersal** VPS localization. Unity 6000.0+, needs Meta Core + MRUK and the Depth API enabled. Installs as UPM git packages. 24 stars, last push 2025-05-08. — [GitHub](https://github.com/HoloLabInc/QuestCameraTools-Unity)
- **danieloquelis/Unity-QuestVuforia ("Quforia")**: experimental Vuforia Engine 11.4.4 on Quest 3 through the Vuforia Driver Framework. Image Targets and **Model Targets** work, but tracking is image-only: device pose fusion is disabled, no lens distortion is passed, and frames are limited to 1280×960. Works with the free Vuforia license. MIT, 60 stars. — [GitHub](https://github.com/danieloquelis/Unity-QuestVuforia)
- Official Vuforia does not list Quest 3 as supported; PTC forum posts say passthrough headsets are not yet supported. — [PTC community](https://community.ptc.com/t5/Vuforia-Studio/Support-for-further-XR-Headsets/td-p/998505), [Vuforia recommended devices](https://developer.vuforia.com/library/platform-support/recommended-devices)
- **danieloquelis/Unity-QuestVisionStream**: streams PCA frames over WebRTC for real-time server-side CV. MIT, 51 stars, last push 2025-08-25. — [GitHub](https://github.com/danieloquelis/Unity-QuestVisionStream)
- **Uralstech/UXR.QuestCamera**: Unity package for PCA. Apache-2.0, 32 stars, active. — [GitHub](https://github.com/Uralstech/UXR.QuestCamera)
- **arghyasur1991/QuestRoomScan**: real-time room reconstruction on Quest 3 (GPU TSDF + Surface Nets, passthrough texturing). 64 stars. — [GitHub](https://github.com/arghyasur1991/QuestRoomScan)

**MRUK, QR codes, anchors, depth**
- **MRUK QR tracking**: MRUK v78 for Unity, 27 Aug 2025; Quest 3/3S and future Horizon OS headsets.
  - Supports QR codes up to version 10.
  - Returns a 6DoF pose, 2D bounding box, boundary polygon and payload (`MRUKTrackable.MarkerPayloadString`).
  - Update rate is "relatively low": not for moving objects, and there is a performance cost, so enable it only when needed.
  - Uses the **Spatial Data permission, not the headset camera permission**.
  
  — [UploadVR](https://www.uploadvr.com/quest-3-mruk-update-decode-track-qr-codes-unity/), [Meta docs](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection/)
  - Demo repo: **dilmerv/MRUKTrackableDemos** (QR and keyboard). — [GitHub](https://github.com/dilmerv/MRUKTrackableDemos)
- **Spatial anchors**: world-locked poses that persist locally or on Meta servers and can be shared with co-located users. Several objects can share one anchor if they are "within its coverage area of three meters." — [Meta anchors overview](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/)
  - Samples: Unity-SharedSpatialAnchors (MIT, 165 stars), Unity-MRUtilityKitSample (MIT, 83 stars), Unity-Discover (MIT, 311 stars). — [SSA](https://github.com/oculus-samples/Unity-SharedSpatialAnchors), [MRUK sample](https://github.com/oculus-samples/Unity-MRUtilityKitSample), [Discover](https://github.com/oculus-samples/Unity-Discover)
- **Depth API**:
  - Quest 3/3S only; needs passthrough.
  - Handles dynamic occlusion (hands, people), which the Scene API cannot.
  - Minimum effective range about 0.2 m; hand occlusion is less accurate up close.
  - Supports raycasting via `EnvironmentRaycastManager`.
  - Sample: Unity-DepthAPI (288 stars, pushed 2026-09-17).
  
  — [Meta Depth API](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/), [GitHub](https://github.com/oculus-samples/Unity-DepthAPI)

**Runtime glTF loaders**
- **glTFast** (`com.unity.cloud.gltfast`): runtime loading by script or the `GltfAsset` component, plus editor import and export. Supports KTX/Basis, Draco and meshoptimizer on "all platforms," in URP, HDRP and Built-in. — [Unity docs](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/index.html)
  - Repos: Unity-Technologies/com.unity.cloud.gltfast (127 stars) and the original atteneder/glTFast (1,489 stars), both active, license NOASSERTION (Apache-style per repo; not verified). — [Unity repo](https://github.com/Unity-Technologies/com.unity.cloud.gltfast), [atteneder](https://github.com/atteneder/glTFast)
- **KhronosGroup/UnityGLTF**: runtime glTF 2.0 loader and exporter. MIT, 2,232 stars, pushed 2026-09-10. — [GitHub](https://github.com/KhronosGroup/UnityGLTF)

**Voice and wake word**
- **Picovoice Porcupine**:
  - Engine is Apache-2.0 (4,939 stars). Every use needs an **AccessKey** from Picovoice Console, which is "free, no credit card required." Custom wake words are trained in Console. — [GitHub](https://github.com/Picovoice/porcupine), [Picovoice docs](https://picovoice.ai/docs/porcupine/)
  - As of 2026-09-18, `binding/` in the repo holds android, dotnet, flutter, ios, java, nodejs, python, react-native, react and web, with **no Unity binding** (checked via the GitHub API).
  - A search snippet quoting Picovoice says "Unity SDKs will no longer be maintained after December 15, 2025" (the Unity quick-start page wouldn't load, so unverified). — [Picovoice Unity quick start](https://picovoice.ai/docs/quick-start/porcupine-unity/)
  - Another snippet, from a fork README, says free-tier custom models are only for x86_64 and other platforms need an enterprise license. This conflicts with the "non-commercial and personal use free" wording. Unverified; check Picovoice Console for an Android `.ppn` before relying on it. — [musistudio/porcupine fork](https://github.com/musistudio/porcupine)
- **openWakeWord**: code Apache-2.0 (2,780 stars, last push 2025-12-30). **All pretrained models are CC BY-NC-SA 4.0**. There is an open issue about licensing of the shared feature models for commercial use. — [GitHub](https://github.com/dscripka/openWakeWord), [HF model card](https://huggingface.co/davidscripka/openwakeword), [Issue #348](https://github.com/dscripka/openWakeWord/issues/348)
- **Vosk**: offline ASR, Apache-2.0 (15,135 stars). Unity wrapper **alphacep/vosk-unity-asr** (Apache-2.0, 128 stars, pushed 2026-03-07). — [vosk-api](https://github.com/alphacep/vosk-api), [vosk-unity-asr](https://github.com/alphacep/vosk-unity-asr)
- **Macoron/whisper.unity**: whisper.cpp inside Unity. MIT, 751 stars, last push 2025-04-17. — [GitHub](https://github.com/Macoron/whisper.unity)
- **Meta Voice SDK (Wit.ai)**: cloud NLU with dictation. A "wake word" can be built as a Wit.ai intent (e.g., utterances like "hey quest"). Sample: oculus-samples/voicesdk-samples-whisperer (MIT, 82 stars). — [Meta Voice SDK](https://developers.meta.com/horizon/documentation/unity/voice-sdk-overview/), [XR Dev Rob tutorial](https://blackwhale.dev/use-metas-voice-sdk-for-wake-word-detection-speech-to-text-stt/), [sample](https://github.com/oculus-samples/voicesdk-samples-whisperer)

**WebXR (relevant because the team's design doc currently plans WebXR + three.js)**
- Meta's Quest Browser MR doc lists immersive-ar passthrough, plane detection and persistent anchors (max 8 per session). It states: "There is no way to get to the pixels of the passthrough content." — [Meta WebXR MR doc](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)
- Conflicts with: Meta's April 2025 blog, which promised WebXR PCA support with v77. A later Meta forum thread still asks for WebXR Raw Camera Access (`camera-access`) in Quest Browser. — [Meta blog](https://developers.meta.com/horizon/blog/new-era-mixed-reality-passthrough-camera-api-machine-learning-computer-vision/), [Meta forum](https://communityforums.atmeta.com/discussions/Questions_Discussions/request-webxr-raw-camera-access-camera-access-feature-in-quest-browser/1367463), [immersive-web issue #21](https://github.com/immersive-web/raw-camera-access/issues/21)

### Inferences
- QuestCameraKit is the closest ready-made base for Cut Once. It already contains camera frame → OpenAI Vision → spoken answer, MRUK QR tracking, and YOLO. Meta's CameraToWorld sample provides the camera intrinsics/extrinsics math needed to project 3D model parts into the camera image.
- Wake-word verdict for 36 hours:
  1. Ship **push-to-talk** (controller button or pinch) as the main path.
  2. If "Hey copilot" is needed, the lowest-friction offline option is Vosk (Apache-2.0, Unity wrapper exists) restricted to a small phrase list. Vosk supports grammar-limited recognition, but I did not verify that from a source in this session.
  3. Porcupine now means wrapping the Android AAR yourself (no Unity binding) plus an AccessKey and a Console-trained `.ppn`.
  4. openWakeWord's pretrained models are non-commercial (fine for a hackathon) and have no Unity or Android binding.
- WebXR camera access is the biggest risk for a WebXR+three.js build. If `getUserMedia` on the headset can't return passthrough pixels, the camera-check feature fails. Test it in the first hour, or move the headset client to Unity, where PCA is documented and shippable.

### Gaps
- Unverified: whether WebXR/browser PCA actually shipped in v77+, and by what mechanism (`getUserMedia` vs WebXR `camera-access`).
- No official FPS or latency for YOLO on Quest 3 in Meta's sample.
- Depth API resolution and frame rate are not in the overview page.
- Porcupine's current free-tier Android terms and the Unity end-of-maintenance date: see conflicts above.
- The Meta XR SDK version jump (samples say MRUK v81+; QuestCameraKit says 205.0.0; Quforia says 203.0.0) suggests Meta changed version numbering in 2026. I didn't find the release note.

---

## 4. Alignment: how people register a virtual model to a real object or site, and what's realistic for a half-built desk in 36 hours

### Takeaway
Methods, most to least practical for Quest in 36 hours:
1. Fiducials: **MRUK QR (native, v78+)**, or ArUco via OpenCV.
2. **Manual 2–3-point placement** plus a nudge gizmo.
3. Spatial anchors to persist the result.
4. VPS (Immersal) for buildings.
5. Model tracking (Vuforia Model Targets via the experimental Quforia, or research trackers).

For a desk: tape 1–2 printed QR codes at known model coordinates, compute the transform from MRUK's QR pose, fine-tune by hand, then freeze it into a spatial anchor. Keep manual two-point placement as the fallback.

### Cited Findings
- Methods in industry: visual/manual, QR/fiducial at known points, geometric feature matching, algorithmic SLAM/CV. — [Auganix (Campbell 2024)](https://www.auganix.org/xr-in-aec-alignment-ux-methods-for-mr-and-ar-in-construction/)
- Multiple closely spaced QR markers keep drift and registration error under 2 mm on HoloLens 2 (markers at most 0.38 m apart), and marker size, frequency and placement drive precision. — [Kyaw et al. 2023](https://www.sciencedirect.com/science/article/abs/pii/S0926580523001723) (via search summary); [AR Glulam arXiv 2502.08566](https://arxiv.org/abs/2502.08566)
- MRUK QR on Quest: 6DoF pose and payload; low update rate (fine for static targets, not moving ones); Spatial Data permission only. — [UploadVR](https://www.uploadvr.com/quest-3-mruk-update-decode-track-qr-codes-unity/)
- A Unity × Quest 3S guide to "stable QR code detection and placement" exists (Zenn, Dec 2025; not read in detail). — [Zenn](https://zenn.dev/t_tokunaga/articles/2025-12-02-unity-quest3s-qrcode-detection?locale=en)
- Alternatives through PCA:
  - ArUco/ChArUco multi-marker (paid OpenCV for Unity) — [QuestArUcoMarkerTracking](https://github.com/TakashiYoshinaga/QuestArUcoMarkerTracking)
  - QR or Immersal VPS — [HoloLab QuestCameraTools](https://github.com/HoloLabInc/QuestCameraTools-Unity)
  - Vuforia Model Targets, experimental and image-only — [Quforia](https://github.com/danieloquelis/Unity-QuestVuforia)
- Research model-based 6DoF trackers from CAD exist: **DLR-RM/3DObjectTracking** (MIT, 1,034 stars; Stoiber et al.'s region/depth trackers). No Quest port found. — [GitHub](https://github.com/DLR-RM/3DObjectTracking)
- Quest 3 inside-out tracking in a best-case robot test: mean translational RMSE 0.346 mm (3D RMSE 0.621 mm), rotational RMSE 0.143°. Conditions were single-axis, moderate-speed and controlled; the authors warn real conditions may be worse. — [Sensors 2026, 26(8):2285](https://www.mdpi.com/1424-8220/26/8/2285), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13119968/)
- Meta anchor guidance: share one anchor only for content within 3 m. — [Meta anchors](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/)
- Precedents: HoloInspect used tap-to-place plus Azure Spatial Anchors and a georeference mode ([GitHub](https://github.com/Tianyu-Wu/HoloInspect)). The Han et al. 2025 CLT study used continuous QR tracking plus snap-to-place ([Springer](https://link.springer.com/article/10.1007/s44223-025-00091-6)). COMPAS XR uses QR/image-target inverse transforms ([user guide](https://compas.dev/compas_xr/0.9.4/userguide.html), partly unverified).

### Inferences
- **Recommended desk alignment**, realistic in hours rather than days:
  1. Put two QR codes on a flat part of the already-built desk (e.g., top corners), with their positions fixed in the model's coordinate frame. Encode a part ID and offset in the payload.
  2. Use the first QR pose for position and yaw, and the second to correct yaw and scale-check (a desk-sized baseline of about 1 m reduces angular error).
  3. Add a "nudge" mode with thumbstick translate/rotate in 1 mm / 0.5° steps.
  4. Create a spatial anchor at the desk. Anchor coverage (3 m) easily fits a desk.
  5. Turn QR tracking off after locking to save performance.
- **Fallback with no dependencies:** touch the controller tip to two or three known desk corners (e.g., front-left top, front-right top, back-left top) and solve the rigid transform (Kabsch / 3-point). With a flat table the up axis is known, so two points give position plus yaw.
- For the campus-building vision: QR at surveyed control points (what industry uses), Immersal VPS via HoloLab QuestCameraTools, or commercial tools. Say so in the pitch rather than building it.
- Model Targets (Quforia) and the DLR trackers are impressive but too risky for 36 hours: pose fusion is disabled, there's no Quest port, and a half-built desk changes its silhouette.

### Gaps
- No published accuracy for MRUK QR poses on Quest 3 (update rate and jitter not quantified by Meta).
- No Quest-specific study measuring manual 2-point alignment error.

---

## 5. Known limits: camera resolution/latency, VLM latency, drift, occlusion, battery

### Takeaway
PCA gives 1280×960 (or 1280×1280 on v83+) at 20–40 ms (current docs; early reports said 30 fps and 40–60 ms). That is fine for still-frame "what's done?" checks but can't read small text or track fast motion. Cloud VLM round-trips run to seconds: one measured AR VLM+OCR pipeline averaged about 7 s. Treat checks as on-demand, not continuous. Depth API occlusion works from about 0.2 m out. Anchors are good within 3 m. Battery is about 2–3 hours, less in MR.

### Cited Findings
- PCA specs and conflict: current docs give 60 Hz, 20–40 ms, 1280×960/1280×1280, about 45 MB and 1–2% GPU per camera ([Meta](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview)). Launch coverage said 30 FPS, 40–60 ms, not suitable for fast-moving objects, can't discern small text, and Unity WebCamTexture reads one camera at a time ([UploadVR](https://www.uploadvr.com/quest-passthrough-camera-api-now-shippable-on-store/)).
- On-device detection limits: YOLOv9t misclassifies some objects and its boxes misalign; Meta advises against on-device LLMs. — [Meta](https://developers.meta.com/horizon/documentation/unity/unity-pca-sentis/)
- VLM latency data points:
  - An AR VLM+OCR pipeline (VIM-Sense) averaged 7.07 s simulated and 7.17 s on a real Android AR app, with the extra time mostly from device↔edge transfer. — [arXiv 2507.20356](https://arxiv.org/abs/2507.20356)
  - OpenAI's `gpt-realtime` accepts images in a Realtime session (the app picks which frames to send, like adding a picture to the conversation). — [OpenAI](https://openai.com/index/introducing-gpt-realtime/)
  - GPT-4o's published 232 ms (avg 320 ms) figure is for **audio** responses, not image analysis. — [OpenAI GPT-4o](https://openai.com/index/hello-gpt-4o/)
  - QuestCameraKit's OpenAI Vision loop publishes no latency numbers. — [QuestCameraKit](https://github.com/xrdevrob/QuestCameraKit)
- Drift and tracking: Quest 3 tracking reached sub-millimetre accuracy on a robot rig under best-case conditions ([Sensors 2026](https://www.mdpi.com/1424-8220/26/8/2285)). Meta recommends content stay within 3 m of its anchor ([Meta](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/)). Developers report MR tracking drift in forums ([Meta forum](https://communityforums.atmeta.com/discussions/dev-unity/mixed-reality-tracking-drift-issue/1295428)).
- Occlusion: the Depth API gives dynamic occlusion (hands, people), is unreliable under about 0.2 m, and hand occlusion is less accurate up close. — [Meta](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/)
- Battery: Meta quotes about 2–3 hours of use, and MR apps drain faster. — [XR Today](https://www.xrtoday.com/mixed-reality/how-to-maximize-meta-quest-3-battery-life-top-tips/)
- Thermals: a 2025 arXiv paper predicts Quest 3 thermal throttling after 10–15 minutes of continuous MR recording and compositing, with 70–80% GPU use. **It is simulation-based and made no measurements on Quest hardware**, so treat it as weak evidence. — [arXiv 2509.18929](https://arxiv.org/html/2509.18929v1)
- WebXR: Quest Browser has documented no passthrough pixel access, and the v77 promise is unverified (see section 3). — [Meta WebXR doc](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)

### Inferences
- Design "what's done?" as a single request per question: grab one 1280×960 frame, then send the frame, the list of candidate parts, and each part's projected 2D box (from the CameraToWorld math) to the VLM. Show a "checking..." ghost pulse. Seconds of latency is fine for a question-and-answer interaction, not for live highlighting.
- The copilot will be more reliable if it asks the VLM about each part in turn ("Is the left leg, highlighted region, installed? yes/no/unsure") than if it asks it to understand the whole scene. Keep a manual "mark done" voice command so the demo never depends on the VLM being right.
- Demo logistics: keep a charger or battery strap on hand, keep sessions short, and keep QR tracking off after locking.

### Gaps
- No measured end-to-end latency for Quest PCA frame → cloud VLM → TTS was found. The team should instrument it.
- Depth API depth-map resolution and latency not found.
- No primary Meta battery figure for camera + MR workloads.

---

## 6. The most realistic Unity stack and repo set for the team in 36 hours

### Takeaway
Use Unity 6 + URP + Meta XR Core/MRUK (use the same versions QuestCameraKit uses). Fork or borrow from **QuestCameraKit** (MIT) for camera frames, MRUK QR and the OpenAI vision/voice loop, and from Meta's **PCA samples** for CameraToWorld projection. Add **glTFast** or **UnityGLTF** to load a `.glb` of the desk at runtime, named by part ID. Align with **MRUK QR, then a spatial anchor**, with manual 2-point as the fallback. Use the **Depth API** for occlusion. Start with **push-to-talk** and add a Vosk-based "Hey copilot" only if there's time. Keep all AI (Elasticsearch retrieval, VLM, TTS) on the backend.

### Cited Findings (component → source)
- Base project and AI loop: QuestCameraKit samples (Native QR Tracking via MRUK; Image + Voice AI with OpenAI Whisper/Vision/TTS; YOLO; WebRTC), Unity 6000.3.12f1, Meta XR Core/MRUK 205.0.0, MIT. — [GitHub](https://github.com/xrdevrob/QuestCameraKit)
- 2D↔3D camera math, detection and shader examples: Unity-PassthroughCameraApiSamples (Unity 6000.0.38f1+, MRUK v81+, Horizon OS v74+). — [GitHub](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples)
- QR alignment: MRUK v78+ QR trackables. — [Meta docs](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection/), [UploadVR](https://www.uploadvr.com/quest-3-mruk-update-decode-track-qr-codes-unity/). Or HoloLab QuestCameraTools QR via UPM. — [GitHub](https://github.com/HoloLabInc/QuestCameraTools-Unity)
- Persisting alignment: spatial anchors (3 m coverage). — [Meta](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/)
- Occlusion so ghost parts hide behind real ones: Depth API and Unity-DepthAPI sample. — [Meta](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/), [GitHub](https://github.com/oculus-samples/Unity-DepthAPI)
- Runtime model: glTFast (runtime script or `GltfAsset`, Draco/meshopt/KTX, URP) — [Unity docs](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/index.html); or UnityGLTF (MIT) — [GitHub](https://github.com/KhronosGroup/UnityGLTF)
- IFC input, if any: IfcConvert → GLB with `--use-element-guids` for ID mapping. — [IfcConvert](https://docs.ifcopenshell.org/ifcconvert.html), [discussion](https://github.com/IfcOpenShell/IfcOpenShell/discussions/5430)
- Server-side frame streaming, if needed: Unity-QuestVisionStream (WebRTC). — [GitHub](https://github.com/danieloquelis/Unity-QuestVisionStream)
- Voice: Vosk Unity (Apache-2.0) — [GitHub](https://github.com/alphacep/vosk-unity-asr); whisper.unity (MIT) — [GitHub](https://github.com/Macoron/whisper.unity); Meta Voice SDK (Wit.ai) — [Meta](https://developers.meta.com/horizon/documentation/unity/voice-sdk-overview/)
- Evidence to cite in the pitch: Tang 2003 (−82% errors) — [ACM](https://dl.acm.org/doi/10.1145/642611.642626); Chaudhari 2025 (AR LOD 400 beats paper at full scale) — [ASCE](https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-16726)

### Inferences (proposed 36-hour plan; my synthesis, not sourced)
1. **Hours 0–2 (de-risk):**
   - Build QuestCameraKit to the headset.
   - Confirm PCA frames reach the backend and OpenAI Vision answers.
   - Confirm MRUK QR returns a pose for a printed code.
   - If the team stays on WebXR, test passthrough-pixel access via `getUserMedia` in Quest Browser now, and switch to Unity if it fails.
2. **Model:** load `desk.glb` at runtime with glTFast.
   - Each part is a child GameObject named `part_<id>`, and the same IDs key the Elasticsearch documents and the cut list.
   - Materials: translucent cyan "ghost" for planned, solid or dim for done, pulsing emissive for missing or next.
3. **Alignment:** two QR codes → transform → nudge gizmo → spatial anchor. Keep controller-tip 2-point as backup.
4. **Built/missing state:**
   - Default: a manual or voice toggle ("mark left leg done").
   - "Check my build": capture a frame, project the bounding box of each not-yet-done part into the image with PCA intrinsics/pose, then ask the VLM per part and return JSON `{part_id: done|missing|unsure}`.
   - The copilot highlights parts by ID.
5. **Voice:** controller-button push-to-talk → backend (transcription → Elasticsearch retrieval → LLM with frame → TTS). Add Vosk keyword gating for "Hey copilot" only after the core loop works.
6. **Skip:** on-device YOLO for part recognition (80 COCO classes won't know "desk apron"), Vuforia/Quforia, model-based tracking, IFC parsing on-device, Porcupine Unity.

### Gaps
- No existing open-source repo does "ghost overlay + per-part built state + camera verification" on Quest, so the end-to-end integration is new work with no reference implementation to copy.
- Not verified: QuestCameraKit's exact OpenAI model names and request format (the README names Whisper, Vision and TTS without versions), and its measured latency.
