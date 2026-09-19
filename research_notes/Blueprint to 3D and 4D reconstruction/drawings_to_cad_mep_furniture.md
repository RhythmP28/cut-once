# Drawings, Sketches and Diagrams to 3D: Engineering/CAD, LLM/VLM-to-CAD, Electrical/MEP, and Furniture/Woodworking (for "Cut Once", HTN 2026)

Research date: 2026-09-18. GitHub stars, license and "last push" dates were pulled live from the GitHub API on 2026-09-18 (source = the repo URL given). "Last push" means the last commit to any branch, so it does not prove the code still runs. I did not run any of the code. Out of scope, and covered by other researchers: architectural floor-plan-to-3D (walls/rooms), 4D scheduling, AR delivery.

## Q1. Orthographic views (front/top/side) to 3D solid: classic and deep-learning methods, repos, and what they can handle

### Takeaway
The work closest to a desk is furniture-specific. **PlankAssembly (ICCV 2023)** turns three orthographic line drawings of cabinets into a program of axis-aligned cuboid "planks" (F1 about 91–94%). It has code, weights and data, but it expects clean vector (SVG) line drawings in its own synthetic format and is AGPL. Its successor **CAD2Program (AAAI 2025)** reads raster drawings with dimensions, but no code or weights are released. For general mechanical parts, the 2025–2026 state of the art is VLMs that write CadQuery. **Ortho2CAD (CMU, Jul/Aug 2026)** shows that a frontier model (GPT 5.5) in a render-and-compare self-refinement loop beats fine-tuned open models on orthographic drawings. Even so, 2026 benchmarks show dimensions and fine features are still unreliable on real industrial drawings.

### Cited Findings
**Classic (non-learning) pipeline and its limits (numbers come from the PlankAssembly paper, which re-implemented it):**
- The traditional method reconstructs a wireframe, then faces, then candidate blocks, and finally runs re-projection verification. On clean inputs that version reaches 94.07% F1 (vs PlankAssembly's 91.75%). It **fails to finish on 518 of 1,339 test cases within 5 minutes** because the search is exponential, and it cannot be used on noisy inputs. — [PlankAssembly paper, arXiv 2308.05744](https://arxiv.org/pdf/2308.05744)
- Without verification, the traditional pipeline gets 90.67% F1 on clean input. At 30% corrupted/missing lines it **drops to 8.20% F1** and produces results for only 54 objects. — [PlankAssembly paper](https://arxiv.org/pdf/2308.05744)
- With visible edges only (hidden lines omitted, as is common in real drawings), the traditional method scores P/R/F1 = 99.64/26.47/39.31. Hidden edges make up about 48% of edges on average. — [PlankAssembly paper](https://arxiv.org/pdf/2308.05744)

**PlankAssembly (ICCV 2023, Manycore/Kujiale + SYSU + UESTC):**
- Described as the "first deep generative model" for 3D CAD reconstruction from three orthographic views. It uses a Transformer seq2seq model that emits a **shape program**. — [arXiv abstract](https://arxiv.org/abs/2308.05744); [project page](https://manycore-research.github.io/PlankAssembly/)
- The DSL has a single data type, `Cuboid(xmin, ymin, zmin, xmax, ymax, zmax)`, because "most planks are axis-aligned cuboids". Each coordinate can be a number or a pointer to a face of another cuboid it attaches to, and these attachments preserve topology when the model is edited or rescaled. — [PlankAssembly paper](https://arxiv.org/pdf/2308.05744)
- Dataset: more than 26,000 cabinet models, mostly made by professional interior designers on Kujiale. Models are filtered to 4–20 planks and ≤300 edges, and split 24,039 / 1,329 / 1,339. The three views are rendered with pythonOCC's HLRBRep. The README gives the dataset as 26,707 shape programs. — [paper](https://arxiv.org/pdf/2308.05744); [README](https://github.com/manycore-research/PlankAssembly/blob/main/README.md)
- Robustness: F1 goes from 91.75% at 0% noise to 90.14% at 30% noise. Visible-edges-only scores P/R/F1 = 84.12/82.05/82.62. Inference takes about 0.63 s per sample on one RTX 3090. — [paper](https://arxiv.org/pdf/2308.05744)
- Failure modes: wrong attachment predictions, and incomplete models when the stop token is predicted too early. The authors say it "does not consider other information available in CAD drawings, such as layers, text, symbols, and annotations", i.e. it ignores dimension text. — [paper](https://arxiv.org/pdf/2308.05744)
- Repo: 107 stars, **AGPL-3.0**, last push 2025-05-14. Stack is Python 3.8, PyTorch 1.10 / CUDA 11.3, PyTorch Lightning 1.7.6, detectron2 and PythonOCC 7.6.2. Three checkpoints are on Hugging Face (README F1: complete 0.938, visible-only 0.847, sideface 0.939), and the dataset is on HF. Inputs are **SVG line drawings rendered by their own scripts**. Outputs are shape programs, converted to meshes with `misc/build_pred_mesh.py`. — [GitHub](https://github.com/manycore-research/PlankAssembly)

**CAD2Program (AAAI 2025, Manycore):**
- Treats 2D CAD drawings as **raster images**, encoded with a ViT, and autoregressively outputs a text/Python-like description such as `Bbox(507, 185, 805, 1014, 370, 50, 0)` plus key-value parameters. It is built on Mini-InternVL-1.5-2B (InternViT-300M + InternLM2-1.8B) and was trained for about 1 day on 64 RTX 4090s. — [arXiv 2412.11892 HTML](https://arxiv.org/html/2412.11892v1)
- Dataset: 368K cabinet models with 2D engineering drawings from an online interior-design platform. There are 373 predefined primitives, up to 48 primitives per model, and sizes of 0.1–4.5 m. The drawings contain **both a geometry layer and an annotation layer (dimensions, symbols, manufacturing notes)**. — [arXiv HTML](https://arxiv.org/html/2412.11892v1)
- Results with vs without annotations: retrieval 93.80% vs 85.42%, reconstruction F1 82.76 vs 62.65, parameter accuracy 97.21% vs 81.94%. So reading the dimensions matters a lot. It handles variable view counts, misaligned views and section views. Limitations: computing 3D positions requires arithmetic, and orientation is ambiguous for L-shaped cabinets. — [arXiv HTML](https://arxiv.org/html/2412.11892v1)
- **The GitHub repo contains only the project website** (index.html, static/). There is no model code, weights or data. 29 stars, CC-BY-SA-4.0 (website license). — [GitHub](https://github.com/manycore-research/CAD2Program)

**Drawing2CAD (ACM MM 2025):** seq2seq from **vector** engineering drawings to parametric CAD command sequences. It uses a dual-decoder transformer and a soft-target loss, and comes with a new CAD-VGDrawing dataset. — [arXiv 2508.18733](https://arxiv.org/abs/2508.18733). Repo: 153 stars, MIT, last push 2026-08-26. — [GitHub lllssc/Drawing2CAD](https://github.com/lllssc/Drawing2CAD)

**Ortho2CAD (Carnegie Mellon, arXiv 2607.08891 v2, 2026-08-11):**
- Takes raster first-angle three-view drawings with dashed hidden lines and bounding-box dimensions and outputs **CadQuery code**. It fine-tunes Qwen3-VL-8B (SFT + RL with IoU reward) on more than 1M drawings generated from DeepCAD / ZeroToCAD1m / Fusion 360 Reconstruction, and adds a set of 100 drawings with manually dimensioned features. — [arXiv HTML](https://arxiv.org/html/2607.08891); [README](https://github.com/AdityaJoglekar/Ortho2CAD)
- The paper introduces an **inference-time self-refinement loop for frontier VLMs**. The loop repairs invalid code and compares orthographic projections of the generated solid with the input drawing to revise the CadQuery. — [README](https://github.com/AdityaJoglekar/Ortho2CAD)
- IoU (DeepCAD / ZeroToCAD1m / F360Recon / F360 manual-dims): **GPT 5.5 + self-refinement 0.8458 / 0.7258 / 0.8165 / 0.7495**, Claude Opus (4.8) + self-refinement 0.7272 / 0.5397 / 0.6625 / 0.6096, and fine-tuned Ortho2CAD-RL 0.7761 / 0.5167 / 0.5601 / 0.2997. GPT 5.5 with self-refinement produced 100% valid code on all four test sets. Failures cluster on "thin and complicated features". — [arXiv HTML](https://arxiv.org/html/2607.08891)
- Repo: 17 stars, **no license file**, created 2026-03, last push 2026-08-18. Data is on HF (`AdityaJoglekar/Ortho2CAD_Orthographic_Drawings`), and the repo includes a pythonOCC drawing generator. — [GitHub](https://github.com/AdityaJoglekar/Ortho2CAD)

**Sketch-based (freehand) CAD, older:**
- Sketch2CAD (SIGGRAPH Asia 2020, Li/Pan/Bousseau/Mitra) does sequential CAD modeling by sketching strokes in context on an existing shape. It is TensorFlow training code plus a C++ deployment. MIT, 110 stars, last push 2023-01-11. — [GitHub](https://github.com/Enigma-li/Sketch2CAD); [project page](http://geometry.cs.ucl.ac.uk/projects/2020/sketch2cad/)
- Free2CAD (same group): MIT, 164 stars, last push 2024-05-15. — [GitHub](https://github.com/Enigma-li/Free2CAD)

**Other 2024–2026 orthographic/drawing papers, identified from search results only and not read in detail:** CReFT-CAD (orthographic projection reasoning via RL fine-tuning, [arXiv 2506.00568](https://arxiv.org/html/2506.00568)); Text2CAD via technical drawings ([arXiv 2411.06206](https://arxiv.org/abs/2411.06206), not the same as SadilKhan's Text2CAD); GaussianCAD (self-supervised three-view reconstruction via Gaussian splatting, 2025); PHT-CAD ([arXiv 2503.18147](https://arxiv.org/pdf/2503.18147)); HistCAD ([arXiv 2602.19171](https://arxiv.org/pdf/2602.19171)); and an Elsevier 2023 paper, "Automatic 3D CAD models reconstruction from 2D orthographic drawings" ([Computers & Graphics](https://www.sciencedirect.com/science/article/abs/pii/S0097849323000766)).

**Base datasets used by all of the above:** DeepCAD (ICCV 2021; repo 826 stars, MIT, last push 2024-04) — [GitHub rundiwu/DeepCAD](https://github.com/rundiwu/DeepCAD); Fusion 360 Gallery (734 stars, last push 2022-04) — [GitHub](https://github.com/AutodeskAILab/Fusion360GalleryDataset); SketchGraphs, "15 million CAD sketches with geometric constraint graphs" (488 stars, MIT, last push 2021) — [GitHub](https://github.com/PrincetonLIPS/SketchGraphs).

### Inferences
- The furniture-specific finding carries over: a desk, like a cabinet, is a small set (4–20) of mostly axis-aligned cuboid boards with attachment relations. The PlankAssembly and CAD2Program output DSLs are good templates for the team's own part schema. Reuse the representation, not the model.
- PlankAssembly is not a drop-in piece for a live demo. It needs its own SVG format, a CUDA 11.3 / PyTorch 1.10 environment, ignores dimension text, and is AGPL (copyleft if distributed). Real PDFs or photos of a desk plan would first need vectorizing into its format, which is itself a research problem.
- The strongest 2026 evidence (Ortho2CAD) says a frontier model plus a render-and-compare loop beats small fine-tuned models on drawings. For a hackathon that means prompting an API model in a verification loop, not training.

### Gaps
- I found no public benchmark on **woodworking-plan PDFs or photos** (hand-drawn, perspective, exploded views). All the orthographic benchmarks use synthetic renders or mechanical drawings.
- The exact release status of GaussianCAD, CReFT-CAD and "Text2CAD via technical drawings" code was not checked.
- I could not confirm whether PlankAssembly's pinned 2021–2022 dependency stack (PyTorch 1.10, detectron2, PythonOCC 7.6.2) still installs cleanly in 2026.

## Q2. LLM/VLM-to-CAD (Text2CAD, CAD-Recode, CADCodeVerify, Img2CAD, CAD-GPT, CadQuery/OpenSCAD code generation): what works, and failure modes

### Takeaway
Code generation in **CadQuery (Python)** is the de facto target. Frontier LLMs now produce executable CadQuery about 80–100% of the time, and simple prismatic shapes like boxes and boards work well. The 2026 benchmarks (BenchCAD, OmniMech, Ortho2CAD, P3D-Bench) all converge on the same weaknesses: dimension grounding, cross-view correspondence, fine features, and choosing the right CAD operation. Verification loops that render the output and compare it with the input (CADCodeVerify, Ortho2CAD) are the most effective general-purpose fix. The specialised open models (CAD-Recode, cadrille, CAD-Coder, Img2CAD) take point clouds or clean renders of single mechanical parts, not annotated drawings of assemblies.

### Cited Findings
**2025–2026 evaluations of frontier models (GPT / Gemini / Claude):**
- **BenchCAD** (arXiv 2605.10865, May 2026): four orthographic view images are turned into CadQuery code (Vision2Code), scored by voxel IoU. The best frontier model (Gemini 3.1 Pro, thinking) reached **IoU 0.279 with 79.8% execution**. The best trained model (Qwen3-VL-2B with RL) reached IoU 0.752 and 98.9% execution. CADEvolve v3 scored 0.7497, and cadrille-RL only 0.0683 on these advanced operations. For code editing, GPT-5.3 thinking scored 0.865, Claude Opus 4.7 thinking 0.853 and Gemini 3.1 Pro thinking 0.837. There is a "15–20 pt code–image QA gap": models understand the code much better than the image. Named failure modes: holistic spatial deficit (missing threads, chamfers), operation-understanding gap (e.g. twist-extrude omitted), and parametric-abstraction failure (standards ignored). Data is CC-BY-4.0 on HF, and the eval code is MIT. — [arXiv HTML](https://arxiv.org/html/2605.10865v1)
- **OmniMech** (arXiv 2608.05539, Aug 2026): 251K real mechanical drawings paired with SolidWorks models, averaging 15.62 dimensional annotations each. Zero-shot pass rates range from **1.3% (Qwen 3.5-9B) to 92.6% (GPT-5.5)**, volumetric IoU from 0.052 to 0.844, and **volume error from 17.41% to 145.82%**. Failures: "poor grounding and enforcement of dimensional annotations", and inability to "establish correspondences across orthographic views" or "infer occluded geometry". Models evaluated include GPT-5.5, Claude Opus 4.8, Gemini 3.1 Pro and CAD-Coder. The authors promise an open-source release, which I have not verified. — [arXiv HTML](https://arxiv.org/html/2608.05539)
- **Ortho2CAD** (Aug 2026): GPT 5.5 with a self-refinement loop reached IoU 0.75–0.85 and 100% valid code. Claude Opus 4.8 with the same loop reached 0.54–0.73 (full numbers in Q1). — [arXiv HTML](https://arxiv.org/html/2607.08891)
- **P3D-Bench** (arXiv 2606.11152): current models "often recover the coarse shape but remain unreliable on precise dimensions, feature placement, topology and part structure". — [arXiv HTML](https://arxiv.org/html/2606.11152v1) (search snippet; not read in full)
- **CADCodeVerify / CADPrompt** (ICLR 2025): 200 objects with prompts and CadQuery code. GPT-4 few-shot compiles 96.0% of the time. The VLM self-verification loop reduced point-cloud distance from 0.155 to 0.127. In an error analysis of 50 examples, **48% were structural configuration errors** and 18% logical errors; the rest were spatial-precision and compile errors. The authors chose CadQuery over OpenSCAD because it is Python. — [arXiv 2410.05340](https://arxiv.org/html/2410.05340v2); repo 65 stars, no license, last push 2025-02 — [GitHub](https://github.com/Kamel773/CAD_Code_Generation)
- **LLM4CAD** (ASME JCISE 2025): GPT-4/GPT-4V generating CadQuery zero-shot "have significant potential" and improve with debuggers, "however, they still struggle with generating complex geometries". — [ASME](https://asmedigitalcollection.asme.org/computingengineering/article/25/2/021005/1208543/LLM4CAD-Multimodal-Large-Language-Models-for-Three)

**Open models / repos:**
| Project | Input → Output | Venue / date | Repo status (2026-09-18) |
|---|---|---|---|
| CAD-Recode | point cloud → CadQuery (Qwen2-1.5B + point projector; 1M procedurally generated CadQuery programs) | ICCV 2025 | 262★, license NOASSERTION, last push 2025-11-16 — [GitHub](https://github.com/filaPro/cad-recode); [paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Rukhovich_CAD-Recode_Reverse_Engineering_CAD_Code_from_Point_Clouds_ICCV_2025_paper.pdf) |
| cadrille | point cloud / image / text → CadQuery (Qwen2-VL-based, SFT + online RL); HF weights `maksimko123/cadrille`, `cadrille-rl` | ICLR 2026 | 184★, Apache-2.0, last push 2026-09-01 — [GitHub](https://github.com/col14m/cadrille) |
| CAD-Coder | single image → CadQuery (LLaVA-1.5-style, Vicuna-13B + CLIP; GenCAD-Code, 163k pairs); claims 100% valid syntax and beats GPT-4.5 and Qwen2.5-VL-72B | IDETC 2025 / J. Mech. Des. | 207★, Apache-2.0, last push 2025-07-17 — [GitHub](https://github.com/anniedoris/CAD-Coder); [HF paper page](https://huggingface.co/papers/2505.14646) |
| Img2CAD | single image → CAD commands (fine-tuned Llama 3.2 predicts discrete structure + "TrAssembler" transformer predicts parameters); trained on annotated ShapeNet objects | SIGGRAPH Asia 2025 | 38★, MIT, last push 2026-06-13; weights and dataset on HF — [GitHub](https://github.com/qq456cvb/Img2CAD); [project](https://qq456cvb.github.io/projects/img2cad) |
| Text2CAD (SadilKhan) | text prompts → DeepCAD-style sequences | NeurIPS 2024 spotlight | 473★, NOASSERTION, last push 2025-05; inference code + v1.0 checkpoint released — [GitHub](https://github.com/SadilKhan/Text2CAD) |
| Drawing2CAD | vector drawing → CAD sequence | ACM MM 2025 | 153★, MIT — [GitHub](https://github.com/lllssc/Drawing2CAD) |
| Ortho2CAD | raster three-view drawing → CadQuery | arXiv Jul/Aug 2026 | 17★, no license — [GitHub](https://github.com/AdityaJoglekar/Ortho2CAD) |
| Zoo Text-to-CAD (commercial API, KittyCAD) | text → parametric KCL model; **returns glTF + STEP by default**, can also export FBX/GLB/OBJ/PLY/STL | product | text-to-cad-ui repo is **archived** (294★, MIT, archived as of 2026-01) — [GitHub](https://github.com/KittyCAD/text-to-cad-ui); [Zoo docs](https://docs.zoo.dev/docs/developer-tools/tutorials/text-to-cad); [export formats](https://zoo.dev/docs/zoo-design-studio/features/data-management/export) |
| Blender MCP | any LLM drives Blender | community plugin | `ahujasid/blender-mcp` now resolves to `ahujasid/mcp-for-blender`, 28,961★, MIT, last push 2026-09-16 — [GitHub](https://github.com/ahujasid/mcp-for-blender) |

- Kernels and libraries the generated code targets: CadQuery (5,791★, OCCT-based, last push 2026-09-13) — [GitHub](https://github.com/CadQuery/cadquery); build123d (3,149★, Apache-2.0, last push 2026-09-18) — [GitHub](https://github.com/gumyr/build123d); OpenSCAD (10,233★) — [GitHub](https://github.com/openscad/openscad).
- Other 2025–2026 CAD-code papers seen in search results but not read: EvoCAD ([arXiv 2510.11631](https://arxiv.org/pdf/2510.11631)), ReCAD ([arXiv 2512.06328](https://arxiv.org/pdf/2512.06328)), GIFT ([arXiv 2603.27448](https://arxiv.org/pdf/2603.27448)), Agent-Aided Design ([arXiv 2604.15184](https://arxiv.org/pdf/2604.15184)), CADBench ([arXiv 2605.10873](https://arxiv.org/pdf/2605.10873)), test-time scaling via verifier-free consensus ([arXiv 2608.09706](https://arxiv.org/html/2608.09706v1)), and a paper on mapping 2D drawing annotations to 3D CAD features with LLMs ([arXiv 2602.18296](https://arxiv.org/pdf/2602.18296)).

### Inferences
- The benchmarks above test hard mechanical parts: threads, gears, sweeps, fillets. A desk is almost all rectangular boards. The documented failure modes that matter most for the team are **dimension grounding** (OmniMech volume error up to 145%) and **structural/placement errors** (48% of CADCodeVerify failures). Wrong operation choice and fine-feature loss matter much less.
- For a desk, a full B-rep CAD kernel is optional. An LLM that emits a JSON list of boards (name, L×W×T, position, rotation, material) avoids CadQuery execution failures entirely and maps 1:1 onto a cut list. CadQuery only adds value if they want STEP output or real joinery geometry.
- The reusable technique is the render-and-compare verify loop (CADCodeVerify, Ortho2CAD). For a desk it can be cheap and deterministic: re-project boards to front/top/side silhouettes, check overall bounding dimensions and part counts against the plan's dimensions and cut list, and feed any mismatch back to the model.
- The open fine-tuned models (cadrille, CAD-Recode, CAD-Coder) are GPU-heavy, and each is trained on single mechanical parts. None is a good fit for a furniture assembly in 36 hours.

### Gaps
- CAD-GPT (AAAI 2025), CAD-MLLM, CAD-Assistant and CAD-Llama were not individually verified: the repos were not found under the names I guessed, and I did not fetch their papers.
- No benchmark I found measures LLMs on **furniture/woodworking plans** or on multi-part assemblies with a cut list. All the numbers above are single-part mechanical CAD.
- The "ITS" label in Ortho2CAD's tables corresponds to the inference-time self-refinement loop described in its README; I did not confirm the exact acronym expansion.

## Q3. Furniture specifically: drawing / IKEA manual / woodworking plan / cut list to 3D parts

### Takeaway
Academic work that goes from a furniture drawing to 3D parts is dominated by Manycore/Kujiale's cabinet line (PlankAssembly, CAD2Program) and by IKEA-manual datasets aimed at assembly understanding, not model generation. The most directly reusable open-source pieces are practical tools rather than research: a June 2026 Claude "woodworking skill" that builds a parts array into an interactive 3D page with cut list, OpenCutList (SketchUp) and the FreeCAD Woodworking workbench for cut lists, and 2D bin-packers (rectpack, MaxRects) for sheet layouts. The IKEA 3D Assembly Dataset provides real, part-separated 3D models (LACK table, EKET cabinets) with manuals, useful as test assets.

### Cited Findings
**Research: cabinets and IKEA**
- PlankAssembly / CAD2Program: cabinet furniture from three-view or annotated drawings (details in Q1). — [PlankAssembly](https://github.com/manycore-research/PlankAssembly); [CAD2Program](https://arxiv.org/html/2412.11892v1)
- **IKEA-Manual** (NeurIPS 2022 Datasets & Benchmarks): 102 IKEA objects paired with assembly manuals, annotated with decomposed parts, assembly plans, manual segmentation and 2D–3D part correspondence. — [OpenReview](https://openreview.net/forum?id=ZeeswGSOw7r). The repo was not found under the path I guessed.
- **IKEA Video Manuals / "IKEA Manuals at Work"** (NeurIPS 2024 D&B): 34,441 annotated video frames aligning 36 IKEA manuals with 98 assembly videos across six furniture categories, with 3D models of parts. Applications include assembly-plan generation and part pose estimation. — [arXiv 2411.11409](https://arxiv.org/abs/2411.11409); repo 68★, no license, last push 2025-03 — [GitHub](https://github.com/yunongLiu1/IKEA-Manuals-at-Work)
- **IKEA 3D Assembly Dataset** (Inter IKEA, 2021): 5 products (LACK 55×55 side table; EKET 35×25×35 cabinet; EKET 70×35×35 cabinet with 2 drawers; BEKVÄM step stool; DALFRED bar stool). Each comes with part-separated 3D models, base colours/materials and the assembly instruction PDF. **CC BY-NC-SA 4.0.** 153★. — [GitHub](https://github.com/IKEA/IKEA3DAssemblyDataset)
- **Img2CAD** trains on annotated ShapeNet objects (a single image of a common object becomes a CAD program), so it is furniture-adjacent. — [project](https://qq456cvb.github.io/projects/img2cad)
- **Carpentry Compiler** (UW, SIGGRAPH Asia 2019): HELM, a high-level design language plus a low-level fabrication language. It compiles designs into tool-specific fabrication instructions, optimizing time and material. — [project](https://grail.cs.washington.edu/projects/carpentrycompiler); repo 28★, no license, last push 2021-11 — [GitHub](https://github.com/helm-compiler/carpentry-compiler)

**Practical open-source woodworking tools (parts → 3D → cut list)**
| Tool | What it does | Status |
|---|---|---|
| **woodworking-skill (Claude skill)** | Takes a description, photos or sketches and returns dimensioned plans, cut list, cutting diagram and an **interactive 3D page** (rotate, exploded view, click a part to see W×H×D and material). "Each piece is described by a single small array of parts; the rest of the code is generic", and this covers desks. Rules: all mm, no invented dimensions ("Dimensions to verify" box). | 9★, MIT, created 2026-06-15 — [GitHub](https://github.com/bacarndiaye/woodworking-skill); [live demo](https://bacarndiaye.github.io/woodworking-skill/) |
| **OpenCutList** | SketchUp extension that automates cut lists for woodworking | 592★, GPL-3.0, last push 2026-09-18 — [GitHub](https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension) |
| **FreeCAD Woodworking workbench** | FreeCAD environment for furniture; companion `getDimensions` macro gets chipboard dimensions to cut | 564★, MIT, last push 2026-08-01 — [GitHub](https://github.com/dprojects/Woodworking); [getDimensions](https://github.com/dprojects/getDimensions) |
| **WoodworkingShop** | Browser PWA (React 19 + TS): cabinet/furniture configurator, 6-view 3D preview, MaxRects cut-sheet optimizer, exports PDF/DXF/G-code/BOM | 11★, MIT, last push 2026-09-14 — [GitHub](https://github.com/RajwanYair/WoodworkingShop) |
| furniture-designer | Browser 3D furniture design, cut list, guillotine nesting, drilling schedule | 1★, MIT, created 2026-09-14 (brand new) — [GitHub](https://github.com/Manwe-777/furniture-designer) |
| Blender-Cut-List | Blender API script that exports a cut list to Excel from a 3D model | 12★, GPL-3.0, 2022 — [GitHub](https://github.com/TimHuckaby/Blender-Cut-List) |
| rectpack | Python 2D rectangle bin packing (sheet-goods nesting) | 564★, Apache-2.0, last push 2021 — [GitHub](https://github.com/secnot/rectpack) |
| RectangleBinPack (juj) | C++ MaxRects/Guillotine/Skyline packers | 993★, no license, last push 2023 — [GitHub](https://github.com/juj/RectangleBinPack) |
| cut-optimizer-2d | Rust 2D cut optimizer | 33★, Apache-2.0, last push 2023 — [GitHub](https://github.com/jasonrhansen/cut-optimizer-2d) |
| Infinigen | Procedural generation of photoreal worlds (Princeton) | 7,270★, BSD-3 — [GitHub](https://github.com/princeton-vl/infinigen). I did not verify how usable its furniture generators are for this. |

- A GitHub search for "cutlist optimizer" turned up only tiny repos (≤8★). The well-known CutList Optimizer web app has no significant open-source clone. — [GitHub search results via gh CLI, e.g. MaxCutSoftwareOfficial/maxcut-cli (8★)](https://github.com/MaxCutSoftwareOfficial/maxcut-cli)

### Inferences
- **No open-source project goes from an arbitrary woodworking plan PDF or photo to a verified 3D parts model.** The closest pattern is woodworking-skill: an LLM produces a parts array, then generic renderer and cut-list code take over. That is also the architecture PlankAssembly and CAD2Program formalize as a DSL. This is the pattern for Cut Once to copy.
- The cut list is both an input and a check. If the uploaded plan contains a cut list (materials list), each board in the generated 3D model should map 1:1 to a cut-list row with matching L×W×T. That consistency check is a cheap, demo-able "mistake catcher".
- IKEA's LACK (a side table: top plus four legs) is a legal, real, part-separated 3D model with a real manual. It works as a dev test asset or backup demo, but is CC BY-NC-SA, so treat it as non-commercial.

### Gaps
- I did not find any dataset of hobbyist woodworking plans (e.g. Ana White or Woodsmith-style PDFs) paired with 3D models.
- The IKEA-Manual (2022) repo location was not found; only the OpenReview page was verified.

## Q4. Electrical / MEP / P&ID: symbol detection, digitization, and lifting 2D layouts into 3D

### Takeaway
Symbol detection on electrical and P&ID drawings is a mature, YOLO-dominated field with many small open repos and modest public datasets. mAP is around 80% on real electrical plans, and P&ID graph extraction (symbols plus lines) reaches about 64–73% edge mAP on the tiny real benchmark. **Lifting 2D MEP drawings into 3D BIM is research-only.** Several 2023–2025 Automation in Construction and Buildings papers exist, but I found no public code, and heights still come from rules or annotations. There is no open-source 2D-electrical-to-3D routing tool worth reusing in 36 hours.

### Cited Findings
**Electrical layout plans (building wiring symbols):**
- **DELP / SkeySpot** (IEEE SMC 2025, arXiv 2508.10449): 45 scanned real electrical layout plans, 34 service-key (symbol) classes, 2,450 instances. YOLOv8 was best at 82.5% mAP. Described as an "open-source toolkit", but no release location is stated on the arXiv page. — [arXiv](https://arxiv.org/abs/2508.10449)
- **SESYD**: 1,000 synthetic document images including architectural floor plans and electrical diagrams, with more than 57,000 annotated symbols. Other symbol sets: BRIDGE (16 interior-symbol classes) and ROBIN (510 floor plans). — [SkeySpot paper via search](https://arxiv.org/pdf/2508.10449)
- **Electrical-Symbol-recognition-and-Wiring-design**: YOLO symbol detection (switches, lights, outlets, panels) plus A* wiring layout (2D). 9★, no license, last push 2024-12. This is the only open repo I found that attempts routing after recognition. — [GitHub](https://github.com/IKENNA113/Electrical-Symbol-recognition-and-Wiring-design)

**Circuit schematics (electronics, not building wiring):**
- **CGHD** (DFKI): 3,173 photos of hand-drawn circuits from 30 drafters, 245,962 bounding boxes and 84,431 text annotations. Used for graph (netlist) extraction with Mask R-CNN plus keypoints. CC0, on Zenodo. — [GitHub DFKI/cghd](https://github.com/DFKI/cghd); [Zenodo](https://zenodo.org/records/14042961); [arXiv 2402.11093](https://arxiv.org/pdf/2402.11093)
- **Masala-CHAI**: schematic image to SPICE netlist, with YOLOv8 component labeling, LLM prompt tuning and a Python netlist verifier for floating nets. 7,500 schematics; a 46% Pass@1 gain when fine-tuned models are used in AnalogCoder. Repo 126★, no license, last push 2026-08. — [arXiv 2411.14299](https://arxiv.org/abs/2411.14299); [GitHub](https://github.com/jitendra-bhandari/Masala-CHAI). Also SINA (image-to-netlist, [arXiv 2601.22114](https://arxiv.org/pdf/2601.22114)), not read.

**P&ID (piping & instrumentation) digitization:**
- **SynthPID** (arXiv 2604.16513, Apr 2026): 665 synthetic P&IDs seeded from 12 real ones, with 7 symbol classes, 2 edge types and full GraphML graphs. On PID2Graph OPEN100 (12 real nuclear P&IDs, the only public real benchmark) it scores 63.8% edge mAP with synthetic data only, 72.6% mixed with real, and 69.4% with real only. The prior Dataset-P&ID (Paliwal 2021) has 500 synthetic diagrams from 32 templates and reaches about 33% edge mAP. — [arXiv HTML](https://arxiv.org/html/2604.16513v1). The listed repo `LatentSpaceIITB/SynthPID` returned 404 on 2026-09-18 (private or not yet public).
- Repos: Azure-Samples end-to-end P&ID digitization on Azure ML/AKS (136★, MIT, last push 2026-01) — [GitHub](https://github.com/Azure-Samples/digitization-of-piping-and-instrument-diagrams); PID_Symbol_Detection (59★, MIT) — [GitHub](https://github.com/mgupta70/PID_Symbol_Detection); p-id-symbols YOLOv5 (78★, AGPL-3.0) — [GitHub](https://github.com/ch-hristov/p-id-symbols); PnIDAgent (symbols + OCR + lines to JSON for LLMs; 0★, created 2026) — [GitHub](https://github.com/WeiKangda/PnIDAgent).
- The standard pipeline is a CNN symbol detector, then OCR for tags, then Hough-based line detection for connectivity. — [SynthPID](https://arxiv.org/html/2604.16513v1)

**2D MEP drawings to 3D BIM:**
- *Buildings* 15(6):924 (Mar 2025), "Automatic BIM Reconstruction for Existing Building MEP Systems from Drawing Recognition": semantic segmentation of MEP components reaches **mIoU 92.18%**, and coordinates/dimensions come from contour and bounding-box detection. — [DOI](https://doi.org/10.3390/buildings15060924) (full text returned 403; facts from the abstract via search)
- *Automation in Construction* (2025), "Automated BIM generation for MEP systems from CAD data using multi-drawing graph integration": graph structures integrate information across multiple CAD drawings for all MEP categories. The abstract notes that commercial tools handle architectural/structural drawings but "are often unable to process complex MEP drawings". — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580525005825)
- *Automation in Construction* (2023), "Recovering building information model from 2D drawings for MEP systems of ageing buildings". — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0926580523001747). An earlier approach recognized more than 80% of ducts from DXF drawings. — [ResearchGate](https://www.researchgate.net/publication/317577660_An_Automated_Reconstruction_Approach_of_Mechanical_Systems_in_Building_Information_Modeling_BIM_Using_2D_Drawings)
- Graph-enhanced Siamese detection of equipment in heterogeneous MEP drawings (Cambridge, 2025). — [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2352710225027639); [Cambridge repository](https://www.repository.cam.ac.uk/items/47698d1f-e9ce-4851-9fcc-c61df8b14161)

### Inferences
- For Cut Once, electrical/MEP is a stretch goal. A realistic 36-hour version is an LLM or VLM reading a simple outlet/switch plan and emitting symbol positions plus mounting heights from code defaults (e.g. outlets at a standard height). The heights are rule-based, which is exactly what the research systems also do. Rendering these as ghost boxes on the wall is feasible; automatic 3D conduit routing is not.
- The YOLO repos would each need training on the team's own symbol set. A frontier VLM with structured output is likely faster to integrate than any of them for a demo-sized drawing, but that is untested; no source compares them on electrical plans.

### Gaps
- No open-source code was found for any 2D-MEP-to-3D-BIM paper, and I could not read full texts (403 paywall).
- The SkeySpot/DELP dataset and code location was not found.
- I found no evaluation of GPT, Gemini or Claude on residential electrical plan symbol reading.

## Q5. Output formats that drop into Unity (glTF/GLB, OBJ, FBX, IFC) and which tools produce them

### Takeaway
**GLB (binary glTF 2.0) is the right interchange format.** CadQuery Assemblies export directly to .glb/.gltf with part names and colours, build123d has `export_gltf`, Zoo Text-to-CAD returns glTF by default, and IfcConvert turns IFC into .glb/.obj. Unity loads GLB at runtime via glTFast (official Unity package) or KhronosGroup's UnityGLTF. OpenSCAD cannot export glTF or OBJ and would need a conversion step.

### Cited Findings
- **CadQuery**: `Assembly.export()` writes STEP, **glTF/GLB (.gltf/.glb)**, XBF and XML. Assembly metadata "includes names, colors and layers". Single shapes export to STEP/STL/SVG/DXF/AMF/3MF/VRML/VTP/TJS. — [CadQuery import/export docs](https://cadquery.readthedocs.io/en/latest/importexport.html)
- **build123d**: `export_gltf()` (with a `binary` flag for GLB), `export_obj()`, `export_step()`, `export_stl()`, `export_brep()`, plus 3MF and DXF/SVG. STEP preserves assembly colours and labels; whether glTF does is not documented. — [build123d docs](https://build123d.readthedocs.io/en/latest/import_export.html)
- **OpenSCAD** exports STL, OFF, AMF, 3MF, DXF, SVG, CSG, PNG and PDF. **No glTF or OBJ export** is listed. — [OpenSCAD User Manual](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/STL_Import_and_Export)
- **Zoo Text-to-CAD** "will always return a GLTF and STEP file by default", and Zoo exports fbx/glb/gltf/obj/ply/step/stl. — [Zoo docs](https://docs.zoo.dev/docs/developer-tools/tutorials/text-to-cad); [export](https://zoo.dev/docs/zoo-design-studio/features/data-management/export)
- **IfcConvert** (IfcOpenShell) outputs ".obj WaveFront OBJ, .dae Collada, .glb glTF Binary glTF v2.0, .stp STEP, .igs IGES, .xml, .json, .rdb, .svg, .h5, .ttl, .ifc". IfcOpenShell: 2,793★, LGPL-3.0, active. — [IfcConvert docs](https://docs.ifcopenshell.org/ifcconvert/usage.html); [GitHub](https://github.com/IfcOpenShell/IfcOpenShell)
- **Unity glTFast**: runtime and editor import are both fully supported. Runtime export is "Experimental. Core features missing". It "works with Universal, High Definition and the Built-In Render Pipelines on all platforms", supports Draco (via DracoUnity) and KTX/Basis import. — [glTFast manual](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.0/manual/index.html); [features](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.0/manual/features.html); repo 127★, last push 2026-08-28 — [GitHub](https://github.com/Unity-Technologies/com.unity.cloud.gltfast)
- **UnityGLTF** (Khronos): "Runtime glTF 2.0 Loader for Unity3D", 2,232★, MIT, last push 2026-09-10. — [GitHub](https://github.com/KhronosGroup/UnityGLTF)
- **three-cad-viewer**, a three.js CAD viewer component often used with CadQuery/build123d: 389★, MIT, active. — [GitHub](https://github.com/bernhard-42/three-cad-viewer)

### Inferences
- The simplest robust path is a server-side Python step (CadQuery `Assembly` with one named, coloured child per board), exported to .glb and loaded at runtime on Quest 3 with glTFast. Node names carry the part ID, so tapping a board in MR can look up its cut-list row.
- Even simpler for a desk: skip CAD export and send the parts JSON to the headset, which instantiates one scaled cube per board. That avoids any format pipeline, and GLB can be kept for pre-baked assets.
- The project's own design notes (outside this research) mention a WebXR + three.js headset client, while this brief says Unity. GLB works for both (three.js loads glTF natively), so the choice of format does not depend on that decision.

### Gaps
- I did not verify glTFast specifically on Meta Quest 3 (Android/OpenXR) beyond the "all platforms" claim.
- Whether build123d's glTF export preserves per-part names/colours is not documented.

## Q6. Most realistic 36-hour path for the desk demo

### Takeaway
Don't train or reuse a research model. Use a frontier VLM (fits the OpenAI prize) with **structured output** to turn the uploaded desk plan (drawing plus cut list) into a small **parts DSL**: boards as axis-aligned cuboids with attachments, in the style of PlankAssembly and CAD2Program. Validate it deterministically against the plan's dimensions and cut list, with a render-and-compare retry loop in the style of Ortho2CAD and CADCodeVerify. Generate geometry as named boxes, either directly in-engine or via CadQuery to GLB. Compute the sheet/board layout with rectpack. Keep a hand-verified parts JSON of the demo desk as a fallback.

### Cited Findings (evidence behind the recommendation)
- Furniture can be represented as axis-aligned cuboid planks with attachment references, which supports editing and rescaling while keeping topology. — [PlankAssembly](https://arxiv.org/pdf/2308.05744)
- Reading dimension annotations, not just geometry, lifts reconstruction F1 from 62.65 to 82.76 and parameter accuracy from 81.94% to 97.21%. — [CAD2Program](https://arxiv.org/html/2412.11892v1)
- A frontier VLM with a self-refinement loop (repair invalid code, re-project the result and compare with the drawing) gave the best drawing-to-CAD results in 2026, with 100% valid code for GPT 5.5. — [Ortho2CAD](https://arxiv.org/html/2607.08891); [README](https://github.com/AdityaJoglekar/Ortho2CAD)
- Zero-shot frontier models still show large dimensional errors on real drawings (volume error up to 145.82%) and weak cross-view correspondence. — [OmniMech](https://arxiv.org/html/2608.05539). Structural configuration errors are the most common failure (48%). — [CADCodeVerify](https://arxiv.org/html/2410.05340v2)
- A shipped example of "LLM emits a parts array, generic code renders an interactive 3D model, dimensions, exploded view and cut list" exists and is MIT-licensed. It refuses to invent dimensions and lists assumptions to verify. — [woodworking-skill](https://github.com/bacarndiaye/woodworking-skill)
- CadQuery Assembly exports GLB with names and colours, and glTFast imports GLB at runtime. — [CadQuery docs](https://cadquery.readthedocs.io/en/latest/importexport.html); [glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.0/manual/features.html)
- Sheet nesting can use rectpack (Python, Apache-2.0). — [GitHub](https://github.com/secnot/rectpack)

### Inferences (proposed pipeline, not a sourced fact)
1. **Input:** desk plan as PDF or image, ideally with a cut list or materials list. Choose or author the demo plan so it has clear front/top/side views, overall dimensions and a cut list.
2. **Extract (VLM, structured output):** a JSON schema per part: `id, name, material, thickness_mm, length_mm, width_mm, qty, position_mm {x,y,z}, rotation (0/90 deg per axis only), attaches_to[], joinery, source_evidence` (the cut-list row or view it came from). Also extract overall W×D×H. Mirror PlankAssembly's cuboid-with-attachments idea, and keep rotations axis-aligned to avoid the placement errors the benchmarks report.
3. **Validate (deterministic, cheap; this is the demo's "mistake checker"):** (a) the sum of the part bounding box equals the stated overall dimensions within tolerance; (b) each part matches a cut-list row (L×W×T, qty); (c) no interpenetrating boards and no floating boards (every board touches another or the floor); (d) re-project to front/top/side silhouettes and compare with the drawing. On failure, feed the specific error back to the VLM for up to N retries (Ortho2CAD/CADCodeVerify-style).
4. **Geometry:** in Unity, instantiate one scaled cube per part (named by `id`, wood material, ghost shader). Optionally run a server CadQuery `Assembly` to .glb (names and colours preserved) to glTFast for richer joinery later.
5. **Cut list and ordering:** group parts by material and thickness, then run rectpack for sheet layouts (plywood/MDF) or a 1D stock-length pack for dimensional lumber.
6. **Fallback:** a hand-checked `desk.json` for the demo desk so the live demo never depends on one VLM call. The pipeline can still be shown reproducing it live.
- **What not to do in 36 hours:** set up PlankAssembly (old CUDA stack, SVG-only input, AGPL), cadrille/CAD-Recode/CAD-Coder (GPU inference, single mechanical parts), CAD2Program (no code released), or MEP/P&ID detectors (training needed, 3D lifting not open source).
- **Electrical stretch goal:** the VLM reads a simple outlet/switch plan, and heights come from rule-based defaults. Render as ghost boxes; skip routing.

### Gaps
- No source measures VLM accuracy specifically on desk or woodworking plans. The team should test their chosen model on 3–5 real desk plans early (e.g. Friday night) to see whether extraction or placement is the weak step.
- Whether `gpt-5.x` vision reads imperial fractional dimensions (e.g. 23-3/4") reliably was not researched. The benchmarks above are metric/mechanical.
