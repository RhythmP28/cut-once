# Floor plan / architectural drawing to 3D: repos, papers, VLM evaluations, and a 36-hour path

Method note: repo stars, license, language, and last-push dates come from the GitHub REST API, queried 2026-09-18 (evening EDT). "Pushed" means the last push to any branch, which can be later than the last real code commit, so actual commit dates are given where I checked them. Paper numbers come from arXiv abstracts or HTML full text, or from the official repo or project page, and each is linked. Anything I could not open myself is marked "unverified" or placed under Gaps.

---

## 1. Which GitHub repos convert floor plans (images / PDF / DXF / DWG) to 3D, and do they still run?

### Takeaway
Many repos do "floor plan image to 3D", but almost all are one of three things: an OpenCV wall extruder (FloorplanToBlender3d is the best known), a research model that outputs 2D vectors or room polygons with no 3D at all (RoomFormer, Raster2Seq, Raster-to-Graph, DeepFloorplan, CubiCasa5k), or a small demo with fewer than 100 stars. None takes a real multi-sheet construction set to an accurate 3D model. The most reusable pieces for a hackathon are infrastructure: ezdxf (DXF parsing), IfcOpenShell (IFC), the Pascal editor with its framing plugin (three.js / MCP), and the "VLM writes a JSON spec, a deterministic exporter builds the GLB" pattern from CAD2BIM.

### Cited Findings

**A. End-to-end "plan image to 3D model" tools**

| Repo | What it does / I/O | Lang | License | Stars | Last activity | Runs today? |
|---|---|---|---|---|---|---|
| [grebtsew/FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d) | Classical image processing on a floor-plan image produces a Blender 3D project. Includes a server with a Swagger API and a glTF export path (the last commit is "fixed gltf format bug"). | Python | GPL-3.0 | 623 | last commit 2024-10-09 | Docker only: the Dockerfile uses Ubuntu 18.04. The README warns that other versions "might require changes", and its Known Issues say images "need to be quite small for detections to work." 17 open issues. ([README](https://github.com/grebtsew/FloorplanToBlender3d)) |
| [fadyazizz/FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) + [FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient) | A Mask R-CNN REST API detects walls, doors, and windows in a plan image, and a **Unity** app builds a 3D scene from the result. The README says it handles "different drawing styles, including those with hand-drawn elements." | Python / C# | none | 27 / 83 | 2024-10 / 2024-02 | Requires Python 3.6.13 plus weights from a Google Drive link. Old stack, not verified to run. ([README](https://github.com/fadyazizz/FloorPlanTo3D-API)) |
| [grebtsew/ARFloorplanDemo](https://github.com/grebtsew/ARFloorplanDemo) | Three Unity projects that test the FloorplanToBlender3d library with Mediapipe and AR Foundation. | C# | MIT | 13 | 2022-02 | Stale |
| [PuneetKohli/Step-Inside-2D-Floorplan-to-3D-Walkthrough](https://github.com/PuneetKohli/Step-Inside-2D-Floorplan-to-3D-Walkthrough) | Unity: you *draw* a 2D plan and it becomes a 3D walkthrough (no recognition). | C# | none | 70 | 2024-03 | Stale |
| [awangdev/3d-modeling](https://github.com/awangdev/3d-modeling) | Three.js 3D building models from floor blueprint images. | JS | none | 74 | 2025-12 | Unverified |
| [3dlg-hcvc/plan2scene](https://github.com/3dlg-hcvc/plan2scene) | CVPR 2021. Takes a vector floorplan plus photos and produces a *textured* 3D mesh. [r2v-to-plan2scene](https://github.com/3dlg-hcvc/r2v-to-plan2scene) converts Raster-to-Vector output into its input format. | Python | MIT | 610 | last commit 2021-10-20 | Research code frozen since 2021 ([paper](http://arxiv.org/abs/2106.05375v1)) |
| [JulianJuaner/DeepFloorPlan_Pytorch](https://github.com/JulianJuaner/DeepFloorPlan_Pytorch) | Segmentation on the R2V dataset plus "a simple 3D mesh model" | Python | none | 51 | 2021-04 | Stale |
| [P4R1H/naksha](https://github.com/P4R1H/naksha) | Architectural floor plans become a navigable 3D model in the browser, with "dimension checking" and a solar model. | JS | NOASSERTION | 62 | created 2026-08-25 | New, unverified |
| [Shaktidev01/floorplan-3d-studio](https://github.com/Shaktidev01/floorplan-3d-studio) | Plan image goes through a CV+OCR vectorization pipeline with a **VLM fallback**, then into the Pascal 3D editor. | TS | none | 1 | pushed 2026-09-18 | Brand-new, unverified |
| [Gursimran2007/floorplan-3d](https://github.com/Gursimran2007/floorplan-3d) | Classical-CV wall/door/window detection builds a walkable browser 3D model. It self-reports "97.8/98.9/100 on synthetic" data. | Python | none | 0 | 2026-06 | Toy; the claimed numbers are on synthetic data only |
| [Anamika-JH/FloorPlanTo3D](https://github.com/Anamika-JH/FloorPlanTo3D) | Mask R-CNN + Unity | Python | none | 4 | 2025-07 | Toy |

**B. Recognition / vectorization models (their output is 2D vectors, not 3D)**

| Repo | Paper / what | License | Stars | Last activity | Notes |
|---|---|---|---|---|---|
| [art-programmer/FloorplanTransformation](https://github.com/art-programmer/FloorplanTransformation) | Raster-to-Vector (Liu, Wu, Kohli, Furukawa, ICCV 2017). A CNN predicts junctions, then integer programming assembles walls, doors, and icons. | MIT | 681 | last commit 2019-06-28 | Built on **Torch7 (Lua) + Python 2.7**. A PyTorch port was added in 12/2018 but its authors "haven't evaluated the performance" ([README](https://github.com/art-programmer/FloorplanTransformation)). Pre-2020. |
| [CubiCasa/CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k) | Dataset + multi-task CNN (Kalervo et al., 2019) | **CC BY-NC 4.0** (non-commercial) | 589 | pushed 2026-02 | License file verified via the API. Fine for a hackathon, not for commercial use. |
| [zlzeng/DeepFloorplan](https://github.com/zlzeng/DeepFloorplan) | Deep Floor Plan Recognition (ICCV 2019), a multi-task network with room-boundary-guided attention ([arXiv](http://arxiv.org/abs/1908.11025v1)) | GPL-3.0 | 416 | 2024-02 | Ports: [zcemycl/TF2DeepFloorplan](https://github.com/zcemycl/TF2DeepFloorplan) (GPL-3.0, 267 stars, 2023-07) and [zcemycl/PyTorch-DeepFloorplan](https://github.com/zcemycl/PyTorch-DeepFloorplan) (MIT, 46 stars, 2024-10) |
| [ywyue/RoomFormer](https://github.com/ywyue/RoomFormer) | CVPR 2023, single-stage room polygon reconstruction | MIT | 336 | 2025-04 | Outputs room polygons |
| [Cornell-VAILab/Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq) | SIGGRAPH 2026, autoregressive polygon sequences. Weights are on [Hugging Face](https://huggingface.co/haopt/Raster2Seq). | MIT | 57 | 2026-07-14 | Current SOTA on CubiCasa5K. Outputs only room polygons plus door/window labels, with **no walls or heights** ([paper](https://arxiv.org/html/2602.09016)). |
| [SizheHu/Raster-to-Graph](https://github.com/SizheHu/Raster-to-Graph) | Autoregressive graph prediction with an attention transformer | GPL-3.0 | 64 | 2026-05 | |
| [3dv-casia/PolyRoom](https://github.com/3dv-casia/PolyRoom) (ECCV 2024), [Daisy-1227/FRI-Net](https://github.com/Daisy-1227/FRI-Net) (ECCV 2024), [woodfrog/heat](https://github.com/woodfrog/heat) (CVPR 2022), [woodfrog/floor-sp](https://github.com/woodfrog/floor-sp) (ICCV 2019) | Structured floorplan reconstruction, mostly from point-cloud density maps | none / none / NOASSERTION / MIT | 107 / 37 / 137 / 168 | 2023–2025 | These are aimed at scans, not drawings |
| [cansik/architectural-floor-plan](https://github.com/cansik/architectural-floor-plan) (AFPlan) | Classical floor-plan analysis for building-services plans | none | 400 | 2025-11 | Kotlin |
| [DrZiji/VecFloorSeg](https://github.com/DrZiji/VecFloorSeg) | Two-stream graph attention on *vectorized* roughcast plans | none | 67 | 2025-10 | |
| [RasterScan/Floor-Plan-Recognition](https://github.com/RasterScan/Floor-Plan-Recognition) | "On-Premise Floor Plan Recognition" | none | 96 | 2025-06 | No language listed; looks like a commercial product front (unverified) |
| [MLSTRUCT/MLStructFP](https://github.com/MLSTRUCT/MLStructFP) | Multi-unit floor plan dataset | MIT | 67 | 2026-04 | **Archived** |

**C. CAD symbol spotting (vector DXF/SVG input)**
- [VITA-Group/CADTransformer](https://github.com/VITA-Group/CADTransformer): CVPR 2022, panoptic symbol spotting. MIT, 134 stars, last activity 2023-07. [nicehuster/SymPoint](https://github.com/nicehuster/SymPoint): ICLR 2024, 61 stars. [SymPointV2](https://github.com/nicehuster/SymPointV2): 40 stars, 2026-01. [WesKwong/VecFormer](https://github.com/WesKwong/VecFormer): NeurIPS 2025, line-based representation, Apache-2.0, 47 stars. [ArchiAI-LAB/ArchCAD](https://github.com/ArchiAI-LAB/ArchCAD): DPSS code and dataset released 2025-10-16, NeurIPS 2025, 80 stars. All of these label CAD primitives (wall, door, window, and so on). None of them produces 3D. — sources are the linked repos
- [Manavbangotra/ArchCAD-gpu](https://github.com/Manavbangotra/ArchCAD-gpu): a two-stage SymPoint pipeline for door/window/wall spotting "for US PDF plan sets". 0 stars, pushed 2026-09-18, unverified.

**D. DXF / DWG / IFC / BIM plumbing**

| Repo | Role | License | Stars | Last push |
|---|---|---|---|---|
| [mozman/ezdxf](https://github.com/mozman/ezdxf) | Python DXF read/write, the standard library for this | MIT | 1,442 | 2026-08-26 |
| [IfcOpenShell/IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | IFC library + geometry engine. The Bonsai/BlenderBIM add-on is part of the same project. | LGPL-3.0 | 2,793 | 2026-09-18 |
| [Mambix/co2tools](https://github.com/Mambix/co2tools) | "Easily convert 2D DXF drawings into 3D models" by extrusion | MIT | 19 | 2022-06 |
| [florianheger/Floorplan2IFC](https://github.com/florianheger/Floorplan2IFC) | Builds an IFC-based graph structure from floor plans | none | 7 | 2023-05 |
| [aec-platform/roomgraph](https://github.com/aec-platform/roomgraph) | *Vector* PDF floor plan to rooms, openings, and a room-adjacency graph, output as JSON, GeoJSON, and "rough IFC" | MIT | 1 | 2026-08 |
| [donghyun1park-web/mep-parser](https://github.com/donghyun1park-web/mep-parser) | DXF to FreeCAD BIM: wall-pair detection, 3D build, IFC export | none | 1 | 2026-09-16 |
| [naquib0513/2D23D](https://github.com/naquib0513/2D23D) | "Automated 2D-to-3D BIM Scaffolding Generator" | MIT | 5 | 2025-11 |
| [AMostafaH/CrossBIM](https://github.com/AMostafaH/CrossBIM) | Raster to DXF, and DXF to IFC | none | 2 | 2021-12 |
| [GabxSup/DWG-to-IFC-Converter](https://github.com/GabxSup/DWG-to-IFC-Converter) | DWG/DXF to IFC CLI | none | 0 | 2026-01 |

**E. LLM/VLM-era "drawing to 3D" and agent-editable 3D building tools**
- [alvin528/CAD2BIM](https://github.com/alvin528/CAD2BIM): 4 stars, created 2026-07-27, NOASSERTION license. A "VLM/LLM-first Agent Skill". A vision-capable coding agent reads a DXF, PDF, or image, records evidence and assumptions, and writes an explicit `model-spec.json`. A deterministic exporter then compiles that to **IFC, GLB, OBJ, and STL**. Finally the agent renders the result, compares it to the source, and revises. The README says there is "no OCR pipeline, computer-vision detector, rule-based semantic recognizer, or fixed CAD-layer mapping." The exporter runs without an API key (`cad2bim-export examples/apartment/model-spec.json`). — [README](https://github.com/alvin528/CAD2BIM)
- [pascalorg/editor](https://github.com/pascalorg/editor): MIT, **24,104 stars**, created 2025-10-16, pushed 2026-09-18. An open-source, local-first 3D building editor built on **React Three Fiber and WebGPU**, with a CLI (`npx @pascal-app/cli editor`) and an MCP service so AI agents can build and edit the model. npm packages `@pascal-app/core`, `@pascal-app/viewer`, and `@pascal-app/cli`. — [README](https://github.com/pascalorg/editor)
- [yaniv-fink/walkmyplan-mcp](https://github.com/yaniv-fink/walkmyplan-mcp): an MCP server where you "describe a house and it designs and builds" a walkable 3D model. Text to 3D, not drawing to 3D. 3 stars. — [repo](https://github.com/yaniv-fink/walkmyplan-mcp)
- [autodesk-platform-services/open-architecture-standards-2d-floor-plans](https://github.com/autodesk-platform-services/open-architecture-standards-2d-floor-plans): Apache-2.0, 7 stars. "Open Architecture Standards (OAS) is a lightweight, LLM-friendly schema for describing architectural layouts." — [repo](https://github.com/autodesk-platform-services/open-architecture-standards-2d-floor-plans)
- Web plan editors (draw-then-3D, no recognition): [cvdlab/react-planner](https://github.com/cvdlab/react-planner) (MIT, 1,478 stars, last activity 2024-04); [laanlabs/openPlan3D](https://github.com/laanlabs/openPlan3D) (MIT, 156 stars, SvelteKit + Three.js, 2026-09).

### Inferences
- The "3D" in nearly every repo is a vertical extrusion of 2D wall segments or masks to a fixed height. The hard part is recognition and vectorization, and 2D-to-3D lifting is trivial once you have clean wall segments with real-world units.
- Pre-2020 research code (Raster-to-Vector on Torch7/Python 2.7, FloorNet with last activity 2019) should be treated as non-runnable in a 36-hour window. FloorplanToBlender3d is the most "turnkey" option but depends on an old Docker image and only works on small, clean images, so it is a pre-bake tool, not something to run live.
- GPL-3.0 (FloorplanToBlender3d, DeepFloorplan, Raster-to-Graph) and CC BY-NC (CubiCasa5k) are fine for a hackathon demo but would constrain a product.
- The Pascal editor and its framing plugin are three.js/WebGL-native. That matches the project's WebXR + three.js headset design (per the team's design doc) better than a Unity client. If the team is actually on Unity, only the rules and data model transfer, not the code.

### Gaps
- I did not clone or execute any repo, so "runs today" is based on README requirements and commit dates, not tests.
- I could not verify the licenses or origin for RasterScan and several 0–5-star repos.
- I found no maintained open-source tool that reads **DWG** natively without the ODA File Converter or Autodesk tools. The DWG repos listed above are either tiny or front-ends to Revit. (DWG is proprietary, so DXF is the practical exchange format.)

---

## 2. Which papers define the state of the art, what accuracy do they report, and on which datasets?

### Takeaway
Raster floor-plan parsing is a mature benchmark field. On clean synthetic plans (Structured3D) room reconstruction is nearly solved, at 99.6 Room F1. On real scanned plans (CubiCasa5K) it drops to about 89 Room F1 and **about 59 Corner F1**, so geometric precision on real drawings is still weak. Vector-CAD symbol spotting has large datasets (FloorPlanCAD with 10k+ plans, ArchCAD-400K) but only labels 2D primitives. The newest direction is fine-tuned VLMs that emit structured JSON (FloorplanVLM). Almost no paper outputs metric 3D with real heights.

### Cited Findings

**Parsing / vectorization of raster plans**
- **Raster-to-Vector** (Liu, Wu, Kohli, Furukawa, ICCV 2017): a junction-detection CNN plus integer programming. It reports "around 90% precision and recall", which the authors describe as "production-ready". — [project page](https://art-programmer.github.io/floorplan-transformation.html); [paper](https://openaccess.thecvf.com/content_ICCV_2017/papers/Liu_Raster-To-Vector_Revisiting_Floorplan_ICCV_2017_paper.pdf)
- **CubiCasa5K** (Kalervo et al., arXiv 2019): 5,000 floorplan images annotated with polygons into more than 80 object categories, plus an improved multi-task CNN. — [arXiv 1904.01920](http://arxiv.org/abs/1904.01920v1)
- **Deep Floor Plan Recognition** (Zeng et al., ICCV 2019): a multi-task network (room boundaries plus room types) with room-boundary-guided attention, and two new datasets. — [arXiv 1908.11025](http://arxiv.org/abs/1908.11025v1)
- **Raster2Seq** (Phung & Averbuch-Elor, SIGGRAPH/TOG 2026) results tables. — [arXiv 2602.09016 HTML](https://arxiv.org/html/2602.09016)
  - Structured3D-B (binary raster, 3,000/250/250 split): Raster2Seq reaches Room F1 99.6, Corner 98.3, Angle 92.7, RoomSem 76.9, Window/Door 98.5. Compare RoomFormer at 95.1/91.7/83.2/74.2/94.1, PolyRoom at 98.9/96.0/91.9, FRI-Net at 96.5/85.4/83.3, and HEAT at 94.7/84.5/79.6.
  - **CubiCasa5K** (real RGB, 5,267/503/511 split): Raster2Seq reaches Room F1 **88.7**, Corner **59.4**, Angle **37.4**, RoomSem 63.8, Window/Door 77.8. RoomFormer gets 83.5/55.5/34.1/63.0/78.5, HEAT 78.2/53.7/32.3, FRI-Net 77.1/50.8/38.0, and PolyRoom 54.1/37.1/23.0.
  - Raster2Graph dataset (9,803 train): Raster2Seq 97.0/80.3/66.6/RoomSem 85.1, against Raster2Graph at 95.0/78.3/67.3/83.4.
  - **WAFFLE zero-shot** (internet floor plans, trained on CubiCasa5K): IoU 73.9 against 60.5 for RoomFormer.
  - Its output is labeled room polygons (room, door, window), with no walls or heights. Stated limitation: it "occasionally fails to accurately localize windows and doors, resulting in artifacts such as cross-over windows."
- **FloorplanVLM** (Liu et al., Beike, 2026-02-06): fine-tunes **Qwen2.5-VL-3B** to emit structured JSON (walls including curved or slanted ones, openings, and rooms defined as wall references). It trains on Floorplan-2M (clustered from 20M industrial plans) and Floorplan-HQ-300K, using SFT followed by GRPO RL. On FPBench-2K it reports **92.52% external-wall IoU** (90.27% on the non-Manhattan subset) and 96.10% structural validity. The paper includes no head-to-head baselines. The benchmark is open-sourced, but the weights and code are not stated as released. — [arXiv 2602.06507](https://arxiv.org/html/2602.06507v1)
- **Automatic Reconstruction of Semantic 3D Models from 2D Floor Plans** (Cambeiro Barreiro, Trzeciakiewicz, Hilsmann, Eisert, 2023): a pipeline from scanned 2D plans to vectorized 3D models. It claims SOTA on CubiCasa5K, especially for vectorization. — [arXiv 2306.01642](https://arxiv.org/pdf/2306.01642)
- **Plan2Scene** (Vidanapathirana, Wu, Furukawa, CVPR 2021): lifts a floorplan image to a 3D mesh and synthesizes tileable textures from sparse photos, using a GNN for unobserved surfaces. — [arXiv 2106.05375](http://arxiv.org/abs/2106.05375v1)

**Vector CAD symbol spotting**
- **FloorPlanCAD** (Fan et al., 2021): more than 10,000 real CAD floor plans, residential and commercial, stored as vector graphics with line-level annotations of **30 categories**. It introduced "panoptic symbol spotting" with a CNN-GCN baseline. — [arXiv 2105.07147](http://arxiv.org/abs/2105.07147v2)
- **ArchCAD-400K** (Luo et al., NeurIPS 2025): **413,062 chunks from 5,538** highly standardized drawings, "over 26 times larger than the largest existing CAD dataset". It was built with a semi-automated annotation engine plus expert review. Its **DPSS** model (image + point-cloud dual pathway) claims about +3% PQ over prior SOTA. The arXiv listing is CC BY 4.0, and the code and dataset were released 2025-10-16. — [arXiv 2503.22346](https://arxiv.org/abs/2503.22346); [project](https://archiai-lab.github.io/ArchCAD.github.io/); [repo](https://github.com/ArchiAI-LAB/ArchCAD)
- Successor methods on FloorPlanCAD: CADTransformer (CVPR 2022), SymPoint (ICLR 2024), SymPointV2, and VecFormer (NeurIPS 2025). — [CADTransformer](https://github.com/VITA-Group/CADTransformer), [SymPoint](https://github.com/nicehuster/SymPoint), [VecFormer](https://github.com/WesKwong/VecFormer)

**Generative floor plans (context only; they generate plans, they do not read drawings)**
- **HouseDiffusion** (Shabani, Hosseini, Furukawa, CVPR 2023): a transformer diffusion model that denoises room and door corner coordinates, conditioned on a bubble graph. Evaluated on **RPLAN**, it outputs vector plans, including non-Manhattan ones. — [arXiv 2211.13287](http://arxiv.org/abs/2211.13287v1); [repo](https://github.com/aminshabani/house_diffusion) (236 stars)
- Other generative repos: [House-GAN++](https://github.com/ennauata/houseganpp) (256 stars), [Graph2Plan](https://github.com/HanHan55/Graph2plan) (352 stars), [GSDiff](https://github.com/SizheHu/GSDiff) (AAAI 2025), and [FloorplanGAN](https://github.com/luozn15/FloorplanGAN) (Automation in Construction).

**Datasets**
- CubiCasa5K: 5k real plans, 80+ categories, CC BY-NC 4.0. — [arXiv](http://arxiv.org/abs/1904.01920v1), [LICENSE](https://github.com/CubiCasa/CubiCasa5k)
- Structured3D (ECCV 2020): in the Structured3D-B split it provides 3,500 rasterized plans. — [repo](https://github.com/bertjiazheng/Structured3D); [split per Raster2Seq](https://arxiv.org/html/2602.09016)
- FloorPlanCAD (10k+ vector CAD, 30 classes) — [arXiv](http://arxiv.org/abs/2105.07147v2). ArchCAD-400K — [arXiv](https://arxiv.org/abs/2503.22346).
- **WAFFLE** (WACV 2025): nearly 20K internet floorplan images across building types and regions, curated with LLMs from noisy metadata. — [arXiv 2412.00955](http://arxiv.org/abs/2412.00955v2)
- **MSD** (ECCV 2024): a floor-plan benchmark of building complexes. — [repo](https://github.com/caspervanengelenburg/msd)
- RPLAN: used by HouseDiffusion. — [arXiv](http://arxiv.org/abs/2211.13287v1)

**Floor plan to BIM/IFC**
- Several Automation in Construction papers generate IFC models from digitized plans or plan images. Examples: "Automatic generation of building information models from digitized plans" ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580519313500)), "Generating BIM model from structural and architectural plans using AI" ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S2352710223018521)), and "Fully automated synthetic BIM dataset generation" (Automation in Construction 181, 106584) ([PDF](https://ir.library.osaka-u.ac.jp/repo/ouka/all/103515/AutomConstr_181_106584.pdf)). A typical toolchain maps coordinates, labels, **heights**, and materials to IFC entities through IfcOpenShell. — per search snippets of those sources

### Inferences
- The Structured3D-to-CubiCasa5K drop (Corner F1 98.3 to 59.4) is the most important number for this team. On real drawings, recovered corners are imprecise enough that full-scale overlays built from automatic parsing would be visibly off without human correction.
- In the benchmarks, "accuracy" means F1 on 2D polygons or corners, or PQ on symbols. No mainstream benchmark measures metric 3D accuracy (millimetres of wall placement after scale recovery), which is what a build-along overlay needs.

### Gaps
- I did not retrieve the panoptic quality (PQ) numbers for CADTransformer, SymPoint, SymPointV2, VecFormer, or DPSS on FloorPlanCAD or ArchCAD-400K. The only claim I have is DPSS's "+3% PQ".
- I did not open the CubiCasa5K per-class results (room and icon IoU) or the full text of the Cambeiro Barreiro et al. 2023 pipeline (height handling, output format, numbers).
- R2V/LIFULL dataset size, CVC-FP size, RPLAN size and access terms, and MSD size were not verified this session, so I am not quoting numbers.
- Papers with Code has been retired and redirected to Hugging Face, so I did not use it for leaderboards.

---

## 3. Have LLMs / VLMs (GPT-4o/5-class, Gemini, Claude) been used to read floor plans or construction drawings and output 3D or structured geometry? How well does it work?

### Takeaway
Yes, and the published evaluations agree. Frontier VLMs read **text** on drawings well (about 95%) but read **symbols** poorly: door counts are about 39% accurate and window counts about 34%, with the best model's mean counting accuracy around 51% (AECV-Bench, including GPT-5.2, Gemini 3 Pro, and Claude Opus 4.5). Semantic understanding of CAD-style plans scores 33–38% on ArchPlanVQA. The only strong structured-geometry result comes from a *fine-tuned* 3B VLM trained on 2M plans (FloorplanVLM, 92.5% wall IoU). Open-source "VLM to 3D" tools exist (CAD2BIM), but they depend on a render-compare-revise loop and human-visible assumptions, not on one-shot accuracy.

### Cited Findings
- **AECV-Bench** (Kondratenko, Birhane, Hsain, Maciocci, arXiv 2026-01-08). It has two parts: object counting on 120 floor plans (doors, windows, bedrooms, toilets) and drawing-grounded QA with 192 questions. OCR and text-centric QA reach up to 0.95, spatial reasoning is moderate, and symbol-centric understanding is "often 0.40–0.55". The authors conclude that current systems are reasonable "document assistants" but "lack robust drawing literacy", and they recommend human-in-the-loop workflows. — [arXiv 2601.04819](https://arxiv.org/abs/2601.04819)
- **AECV-Bench upgrade** (AEC Foundry blog; the fetch reported a date of 2026-09-16, which I could not verify). It tested 10 models: **Gemini 3 Pro, GPT-5.2, Claude Opus 4.5**, Grok 4.1 Fast, Nova 2 Lite, Command A Vision, GLM-4.6V, Qwen3-VL-8B, Nemotron Nano 12B v2, and Mistral Large 3. Results by task: text extraction about 95%, spatial reasoning about 70%, comparative reasoning about 80%, and counting 40–55%. Text-labeled items (bedrooms/toilets) scored 82–91%, but **doors 39% and windows 34%** (symbol-based). The best mean counting accuracy was Gemini 3 Pro at 51%, and top QA accuracy was about 85%. The authors say symbol interpretation is "the critical bottleneck". — [blog](https://www.aecfoundry.com/blog/can-ai-really-read-your-building-plans-aecv-bench-gets-a-major-upgrade); code at [AECFoundry/AECV-Bench](https://github.com/AECFoundry/AECV-Bench) (52 stars, no license, uses GPT-4o as LLM-judge)
- **ArchPlanVQA** (Journal of Computing in Civil Engineering, Vol 40 No 5): general-purpose VLMs achieve "only 33.03 to 37.88%" semantic-understanding accuracy on architectural floor-plan CAD drawings. The authors attribute this to the colour and texture gap between CAD-rendered images and natural photos. — [ASCE](https://ascelibrary.com/doi/abs/10.1061/JCCEE5.CPENG-7571) (abstract via search snippet; full text not read)
- **DocEng 2025** (Nardoni, Noor Ali, Ziran, Marinai): tested zero-shot and few-shot VLLMs (Mistral Small 3.1, Mistral Medium, GPT-4o, Claude, Gemini 2.5 Flash, Gemma3, Granite) against YOLO at finding furniture, doors, and windows in floorplan images from two datasets. The authors conclude that VLLMs "can effectively identify objects in graphical raster images with performance similar to state-of-the-art object detection models", given a prompt that includes example symbols (few-shot). — [ACM DL](https://dl.acm.org/doi/10.1145/3704268.3748681); [PDF](https://flore.unifi.it/retrieve/7ad7a182-cfd8-4524-8b28-cc11b0cda11b/3704268.3748681.pdf). This looks more optimistic than AECV-Bench, but the tasks differ (presence/identification in their setup versus exact counts in AECV-Bench), and I could not extract per-model numbers from the PDF.
- **SVG decomposition study** (Lee & Sarvghad, arXiv 2025-11): tested GPT-4o, Claude 3.7 Sonnet, and Llama 3.2 11B Vision on 75 floor plans. Feeding SVG plus PNG improves spatial *understanding* but "often hinders spatial reasoning, particularly in pathfinding." — [arXiv 2511.03478](http://arxiv.org/abs/2511.03478v1)
- **FloorplanVLM** (fine-tuned Qwen2.5-VL-3B to JSON walls, openings, and rooms): 92.52% external-wall IoU and 96.10% structural validity on FPBench-2K. This needed 2M training plans plus RL, so it is not zero-shot. — [arXiv 2602.06507](https://arxiv.org/html/2602.06507v1)
- **WAFFLE** used an LLM and multimodal foundation models to *curate* 20K in-the-wild plans. This is data-engineering use, not geometry extraction. — [arXiv 2412.00955](http://arxiv.org/abs/2412.00955v2)
- A search-result snippet reports GPT-4o at a 0.96 success rate on navigation tasks that required parsing floor plan maps. — [arXiv 2409.12842](https://arxiv.org/html/2409.12842) (snippet only; task details not verified)
- **Tools**: [CAD2BIM](https://github.com/alvin528/CAD2BIM) (VLM, then `model-spec.json`, then a deterministic IFC/GLB/OBJ/STL exporter, then render, compare, revise). [Shaktidev01/floorplan-3d-studio](https://github.com/Shaktidev01/floorplan-3d-studio) (CV+OCR first with a VLM fallback, into Pascal). The [Pascal editor](https://github.com/pascalorg/editor) exposes MCP tools so an agent can build the 3D building. [Autodesk OAS](https://github.com/autodesk-platform-services/open-architecture-standards-2d-floor-plans) is an "LLM-friendly schema" for layouts.
- LLMs are also being used for rule and compliance reasoning over plans rather than geometry. For example, an Australian framework uses an LLM inside a rule engine to convert textual building regulations. — [arXiv 2607.00015](http://arxiv.org/abs/2607.00015v1)

### Inferences
- The evidence supports a VLM that proposes a structured spec and a human who confirms it. It does not support a VLM that outputs final geometry. The VLM is reliable for reading text (room names, dimension strings, title-block scale), which is exactly what fixes scale. It is unreliable for counting and placing door and window symbols, so those should be confirmed or edited in the UI.
- Making geometry deterministic (the VLM writes a spec, code builds the mesh) is the pattern CAD2BIM uses. It also makes the demo reproducible and auditable.
- For the OpenAI prize, a GPT-class model can take the "read the drawing into a spec" role. The benchmarks do not show OpenAI models ahead on symbol counting (Gemini 3 Pro led AECV-Bench counting), so the demo should not depend on one-shot symbol accuracy.

### Gaps
- Per-model numeric tables for AECV-Bench (the arXiv HTML returned 404) and DocEng 2025 (PDF text extraction was partial) were not retrieved.
- I found no published evaluation of GPT-5.x, Gemini, or Claude producing **metric 3D geometry** (wall coordinates in millimetres) from a real drawing set and scored against ground truth. That exact capability is unbenchmarked.
- I did not verify whether FloorplanVLM weights are downloadable.

---

## 4. What are the known hard problems (scale, multi-sheet, sections/elevations, symbols/legends, missing heights, noisy scans)?

### Takeaway
The main hard problems are these: plans rarely carry heights; scale must come from dimension strings, the title block, or PDF page metadata; symbols vary by office and region, which is exactly where VLMs fail; real scans are much harder than synthetic plans; and no open-source system reconciles plans with sections and elevations across a multi-sheet set.

### Cited Findings
- **Heights are absent from plan-only methods.** Raster2Seq outputs only 2D room polygons with semantics, "not walls or heights". — [arXiv 2602.09016](https://arxiv.org/html/2602.09016). BIM-generation pipelines take height values as an explicit *input* parameter alongside coordinates and labels. — [Automation in Construction synthetic BIM paper](https://www.sciencedirect.com/science/article/pii/S0926580525006247) (per search snippet)
- **Scale / units**: one approach for PDFs reads the physical page size from metadata, rasterizes at a known DPI, and derives a pixel-to-real-world mapping. Other approaches OCR dimension text with PaddleOCR, Tesseract, or EasyOCR, or combine YOLOv8 with Shi–Tomasi corner detection and OFA-OCR to read dimension-line endpoints. — attributed in search results to [arXiv 2607.00015](https://arxiv.org/pdf/2607.00015) (full text not read). The ratio from page size and DPI only yields real units if the drawing's plotted scale (for example 1/4" = 1'-0") is also known. A classic room-size approach OCRs room dimensions in the image. — [Parsing floor plan images (figure)](https://www.researchgate.net/figure/Room-size-estimation-example-room-sizes-read-with-OCR-in-the-input-image-left-are_fig2_318582079)
- **Symbols and legends**: VLM door and window counting is at 39% and 34% versus 82–91% for text-labeled rooms. — [AECV-Bench blog](https://www.aecfoundry.com/blog/can-ai-really-read-your-building-plans-aecv-bench-gets-a-major-upgrade). ArchPlanVQA attributes its 33–38% scores to CAD imagery differing from natural images. — [ASCE](https://ascelibrary.com/doi/abs/10.1061/JCCEE5.CPENG-7571). Even the SOTA trained model mislocalizes windows and doors ("cross-over windows"). — [Raster2Seq](https://arxiv.org/html/2602.09016)
- **Real and noisy drawings vs. synthetic**: Corner F1 is 98.3 on Structured3D-B but 59.4 on CubiCasa5K for the same SOTA model, and zero-shot IoU on in-the-wild WAFFLE is 73.9. — [Raster2Seq](https://arxiv.org/html/2602.09016). FloorplanToBlender3d needs small images for detection to work. — [README](https://github.com/grebtsew/FloorplanToBlender3d). Prior datasets were "extremely limited in scope" (single semantic category and single region). — [WAFFLE](http://arxiv.org/abs/2412.00955v2)
- **Non-Manhattan geometry** is a known sub-problem. FloorplanVLM reports it separately (90.27% vs 92.52% IoU). — [arXiv 2602.06507](https://arxiv.org/html/2602.06507v1)
- **Spatial reasoning** (paths, adjacency) remains weak for VLMs even with SVG structure supplied. — [arXiv 2511.03478](http://arxiv.org/abs/2511.03478v1)
- **Vector CAD is easier but still needs layer and symbol semantics.** FloorPlanCAD and ArchCAD exist because CAD primitives are unlabeled lines and arcs, and knowing which primitives form a door or wall is itself a learned task. — [FloorPlanCAD](http://arxiv.org/abs/2105.07147v2), [ArchCAD-400K](https://arxiv.org/abs/2503.22346)

### Inferences
- For a full-scale MR overlay, **scale error dominates**. A 2% scale error on a 10 m wall is 20 cm, which is enough to make "build along with it" useless. Reading one dimension string, or making the user tap two points with a known distance, is worth more than any recognition model.
- Multi-sheet reconciliation (plan + sections + elevations + schedules) and legends that vary between drafting offices sit outside every benchmark I found. For a hackathon, treat them as "vision", not as something to demo.

### Gaps
- I found no open-source project or paper that jointly parses plans, sections, and elevations from one drawing set to recover heights. I searched indirectly and got no hits, so this is a gap in my search, not proof of absence.
- I have no quantified study of scale-recovery error on real drawing sets.

---

## 5. Has anyone gone beyond walls to framing-level detail (studs, lumber) from drawings?

### Takeaway
From **BIM models**, yes. Framing generation is a mature commercial category (Strucsoft MWF for Revit, AGACAD Wood Framing, Vertex BD) and a research topic (FrameX). There is now an MIT open-source implementation (Pascal "Bones") that derives studs, plates, headers, and a lumber takeoff from a 3D wall model. **From 2D drawings directly**, I found nothing. Every framing tool expects clean walls and openings as input, so the realistic chain is drawing to walls/openings (step 1), then a rule-based framing generator (step 2).

### Cited Findings
- **[pascalorg/plugin-bones](https://github.com/pascalorg/plugin-bones)** (MIT, 24 stars, pushed 2026-08-25, by Julien Brissonneau). From a house modelled in Pascal it derives wall framing: studs at 16"/24" o.c., bottom/top/cap plates, and around every opening king studs, trimmers, "headers auto-sized by span", sills, and cripples. It also derives floor joists from span tables, rafters and ridges, and foundations. It produces a **takeoff "counted from the actual generated members": lumber by size and stock length, board feet**, with CSV export. It is "derived, live" (move a wall and it re-frames), uses per-US-state code profiles, and is labeled "Drafting aid, not engineering." — [README](https://github.com/pascalorg/plugin-bones)
- Commercial Revit framing add-ins read walls, floors, roofs, and openings and generate studs, joists, rafters, headers, blocking, and bridging from parametric rules (stud spacing, member sizing, code requirements), outputting panel drawings, cut lists, and material reports. Strucsoft's MWF (Metal Wood Framer) is described as the first commercialized Revit framing plugin. — [Strucsoft guide](https://strucsoftsolutions.com/articles/revit-framing-software-automation-ultimate-guide/); [Vertex BD](https://vertexcad.com/bd/for-wood-framing/); [AGACAD Wood Framing](https://bimodular.com/software/agacad-wood-framing/agacad-wood-framing-clt/); [Autodesk App Store "Wood Framing"](https://apps.autodesk.com/RVT/en/Detail/Index?id=1903216501564457353&appLang=en&os=Win64)
- Research: **FrameX**, a Revit add-on (University of Alberta / MOC Summit), automates light-frame wood framing design from BIM layers. — [MOC Summit paper](https://journalofindustrializedconstruction.com/index.php/mocs/article/view/82). A related paper covers automated wood-framing shop drawings from a parametric 3D-CAD model. — [Automation in Construction](https://www.sciencedirect.com/science/article/abs/pii/S0926580515000382)
- Robotic assembly of wood frames uses deep-learning stud pose estimation. This is downstream of framing design, not drawing reading. — [Autodesk Research / Construction Robotics 2024](https://www.research.autodesk.com/publications/adaptive-robotic-construction-of-wood-frames/)
- Other open source: [JeromeL63/Wood-Frame](https://github.com/JeromeL63/Wood-Frame) (FreeCAD workbench for wood frame, GPL-3.0, 33 stars, last activity 2021-03) and [Swichllc/PyRevit-Wood-Framing-extension](https://github.com/Swichllc/PyRevit-Wood-Framing-extension) (Apache-2.0, 7 stars, 2026-06).

### Inferences
- The team's "cut list + supplier order" feature is a solved *rules* problem once walls and openings exist. The rule set (16" o.c. studs, double top plate, king and jack studs, header over each opening) is small enough to hand-code in about 100–200 lines of C# or TS. plugin-bones (MIT) is a legal reference to port from.
- For the desk demo, "framing" means boards and panels, not studs. The same pattern applies: a parametric part list builds the geometry and the cut list together.

### Gaps
- I did not read plugin-bones' ARCHITECTURE.md or SPEC.md, or test it, so I cannot confirm its header-sizing tables or whether it runs outside the Pascal host.
- I found no paper or repo that extracts framing directly from framing plans or shop drawings (for example, reading stud layouts off a wall-panel drawing).

---

## 6. What is the most realistic 36-hour path: which repo/format to take, and what to fake vs. build?

### Takeaway
Don't train or run a recognition model live. Build around a **small JSON "model spec"** (walls as 2D segments with thickness and height, openings with offset, width, and height, and for the desk, boards as boxes). Write one deterministic exporter to GLB, or build meshes procedurally in the headset client. There are two front doors into that spec. **DXF via ezdxf** is reliable and carries real units. **Image/PDF via a GPT-class VLM** handles text and scale, and a human confirms doors and windows. Generate studs and the cut list from the spec with hand-coded rules modelled on plugin-bones. Pre-bake the campus-building "vision" model offline.

### Cited Findings (evidence behind the recommendation)
- The **spec-then-deterministic-exporter** architecture exists and works as a published pattern: the VLM writes `model-spec.json`, and the exporter produces IFC, GLB, OBJ, and STL "without making any new semantic decisions", followed by render, compare, revise. — [CAD2BIM README](https://github.com/alvin528/CAD2BIM)
- Frontier VLMs read text on drawings at about 95% but count door and window symbols at 34–39%, so symbol placement needs human confirmation. — [AECV-Bench](https://www.aecfoundry.com/blog/can-ai-really-read-your-building-plans-aecv-bench-gets-a-major-upgrade)
- The best trained parser only reaches 59.4 Corner F1 on real plans (CubiCasa5K). — [Raster2Seq](https://arxiv.org/html/2602.09016)
- ezdxf is MIT-licensed and actively maintained (pushed 2026-08-26). — [repo](https://github.com/mozman/ezdxf). IfcOpenShell is LGPL and active, if an IFC export is wanted for credibility. — [repo](https://github.com/IfcOpenShell/IfcOpenShell)
- FloorplanToBlender3d exports to Blender or glTF but needs an Ubuntu 18.04 Docker image and small input images. — [README](https://github.com/grebtsew/FloorplanToBlender3d)
- A Unity reference for "API detections become a Unity scene" exists: [FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient) (no license). Three.js/WebXR references: [Pascal editor](https://github.com/pascalorg/editor) (MIT, R3F) and [plugin-bones](https://github.com/pascalorg/plugin-bones) (MIT, framing and takeoff).

### Inferences (recommended plan)
1. **Spec format first (hour 0–2).** Keep it minimal, in metres:
   `{units, walls:[{a:[x,y], b:[x,y], thickness, height}], openings:[{wall, offset, width, height, sill, type}], parts:[{name, size:[w,d,h], pos, rot, material}]}`
   The desk uses only `parts`, and the building uses `walls` and `openings`. One schema feeds geometry, labels (for Elasticsearch), mistake checks, and the cut list.
2. **Desk demo: author, don't recognize.** Furniture shop drawings are orthographic engineering views, which fall outside floor-plan parsing (another researcher covers them). Hand-write or generate the desk spec (a top, 4 legs, and aprons as boxes). Optionally, have the VLM read the dimensions off the desk drawing into `parts`, with the user confirming. This is 100% reliable on stage.
3. **Building path, reliable version: DXF.** Use ezdxf to read `LINE`/`LWPOLYLINE` on the wall layer and `INSERT` blocks for doors and windows, apply the `$INSUNITS` header for units, and extrude. Use default heights (for example 2.44 m walls and 2.03 m doors, typical North American values; confirm locally) because plans lack them.
4. **Building path, "wow" version: image/PDF plus VLM.** Send the page to a GPT-class model with a strict JSON schema. Have it (a) read the scale note or a dimension string, (b) propose wall segments, and (c) propose openings. Render the proposal over the source image in a 2D confirm screen where the user drags or fixes doors and windows. This is the human-in-the-loop step the benchmarks call for, and it also shows real OpenAI/Codex use.
5. **Scale calibration in MR.** Even with a perfect spec, anchor the model to the room with two taps on a known edge (for example the desk's front corners), or snap to a detected wall or plane. Treat drawing scale as a prior, not truth.
6. **Framing and cut list.** Port a subset of the plugin-bones rules: studs at 16" o.c., double top plate, bottom plate, king and jack studs, and a header per opening. Emit members as boxes (for the ghost overlay) and group them by length for the cut list and supplier order.
7. **Fake / pre-bake:** the campus building. Hand-trace or ezdxf-extrude one floor offline (or run FloorplanToBlender3d once in Docker and clean it in Blender), export GLB, and ship it as a static asset labelled "vision". Also fake multi-sheet reading, heights from sections, and symbol-legend learning; say so honestly in the pitch.
8. **Don't:** train on CubiCasa5K, run Raster-to-Vector (Torch7), run Mask R-CNN on Python 3.6, or promise automatic door and window detection on arbitrary drawings.
9. **Unity vs. WebXR:** if the client is Unity, build meshes procedurally from the spec (cubes per wall segment and per framing member) or import GLB with a glTF importer. If it is WebXR/three.js (per the project's design doc), Pascal/R3F code and `GLTFLoader` apply directly. Both routes consume the same spec.

### Gaps
- I have not benchmarked GPT-class JSON extraction on a real campus drawing. Expect to need 1–2 hours of prompt and schema iteration on the team's actual sheets.
- I did not verify that the Pascal editor runs in a Quest 3 browser (it uses WebGPU; WebGPU availability in Quest Browser was not checked), or that plugin-bones can run headless outside the Pascal host.
- Typical wall and door heights are given as common North American defaults, not from a sourced code. The team should confirm against their own drawing's sections or schedules.
