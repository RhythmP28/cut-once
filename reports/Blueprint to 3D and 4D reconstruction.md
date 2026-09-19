# The pieces exist; nobody has joined them

Yes, every part of Cut Once has been built before, but nobody has joined the parts, and the researchers found no open-source project that does it on a Quest. Turning drawings into 3D is a crowded research field. Even so, the best trained model gets only about 59 of every 100 corners right on real scanned floor plans ([Raster2Seq](https://arxiv.org/html/2602.09016)). Today's top AI models (GPT-5.2, Gemini 3 Pro, Claude Opus 4.5) count doors and windows on a drawing correctly only 34–39% of the time ([AECV-Bench](https://www.aecfoundry.com/blog/can-ai-really-read-your-building-plans-aecv-bench-gets-a-major-upgrade)), so every serious tool keeps a person checking the AI. The time dimension (build order, "4D" planning, checking what's actually built) exists in open tools like IfcOpenShell and in decades of research. But people almost always write the build order by hand ([IfcOpenShell docs](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/sequence/index.html)), and progress checking mostly runs offline or at a couple of frames per second. Full-scale headset overlays already ship commercially, and controlled studies show they cut assembly errors, by 82% in the classic one ([Tang et al. 2003](https://dl.acm.org/doi/10.1145/642611.642626)). What nobody has published is our combination on a Quest 3: a ghost overlay where each part carries a built, missing or wrong state, a build-order timeline, a version history written by real placements, and a voice copilot that answers from the searched plans and the headset camera. For the 36 hours, that means training nothing and running no research model. We reuse QuestCameraKit for the camera-and-voice loop, QR codes for alignment, and a small JSON parts list for geometry, cut list and build order, and we make a tap or voice command the source of truth, with the camera check as a second opinion. The Caltech paper (Omni3D / Cube R-CNN) is useful background, not a building block: it puts one 3D box around a whole desk from a photo, can't tell the legs apart, and runs only on an archived, old-GPU software setup. One decision can't wait. Our design doc says WebXR + three.js in Quest Browser, but camera access for the copilot is documented only in Unity, so we need to settle the platform in hour one.

## Prior work covers every stage but never the whole chain

*This report draws on five research notes compiled on 2026-09-18, and GitHub star counts and dates come from that day. Nobody on the research side installed or ran any repo named here, so "runs today" means the README and commit dates suggest it runs, not that anyone tested it.*

The scorecard below rates each stage of Cut Once against what exists. Each row has been done somewhere. Nobody has joined the rows.

| Stage of Cut Once | Done before? | How far it has gotten | Closest example |
|---|---|---|---|
| Floor plan → 3D | Yes, many repos and papers | Near-perfect on clean synthetic plans. On real scans, ~89/100 for rooms and ~59/100 for corners. No wall heights. | [Raster2Seq](https://arxiv.org/html/2602.09016), [FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d) |
| Furniture drawing → 3D parts | Yes, for cabinets | ~92/100 on clean synthetic three-view drawings. The version that reads real images never released code. | [PlankAssembly](https://arxiv.org/pdf/2308.05744), [CAD2Program](https://arxiv.org/html/2412.11892v1) |
| Electrical/MEP drawing → 3D | Finding symbols yes, turning them into 3D only in papers | 82.5% symbol-detection score on real electrical plans. No public code turns MEP drawings into 3D. | [SkeySpot](https://arxiv.org/abs/2508.10449), [Buildings 2025](https://doi.org/10.3390/buildings15060924) |
| Framing members + cut list | Yes, from a 3D model (not from drawings) | Mature commercial Revit add-ins, plus one MIT open-source version | [plugin-bones](https://github.com/pascalorg/plugin-bones) |
| Build order (4D) | Yes, but written by hand | Open tools link parts to steps and animate them. Automatic ordering stays in papers. | [IfcOpenShell](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/sequence/index.html), [Bonsai](https://bonsaibim.org/) |
| Built vs. planned checking | Yes, mostly offline | 90%+ in controlled offline tests. About 2 frames/second on a HoloLens 2. | [D4AR](https://www.researchgate.net/publication/269047952_Automated_Monitoring_of_Operation-level_Construction_Progress_Using_4D_BIM_and_Daily_Site_Photologs), [Augmented Assembly](https://arxiv.org/html/2601.11535) |
| Version history of a physical build | No | Git for building-model *files* exists. Nothing found tracks a real build from sensors. | [Bonsai + Git](https://docs-unstable.bonsaibim.org/guides/authoring/git_support.html), [Speckle](https://speckle.guide/user/FAQs.html) |
| Full-scale headset overlay | Yes, commercially | Quest apps ship. Under 2 mm error on HoloLens 2 with closely spaced QR codes. | [SENTIO VR](https://www.sentiovr.com/post/new-augmented-reality-in-construction-overlay-bim-models-on-site-at-1-1-scale-with-meta-quest), [Resolve](https://support.resolvebim.com/en/articles/6700300-augmented-reality-with-color-passthrough), [Synchro XR](https://aecmag.com/features/hololens-2-and-4d-construction/) |
| Camera + voice assistant in a headset | Yes, in research and one Quest sample | An open-source research system runs on HoloLens 2. A Quest sample already ships speech → camera frame → AI answer → speech. | [SIGMA](https://arxiv.org/abs/2405.13035), [QuestCameraKit](https://github.com/xrdevrob/QuestCameraKit) |
| **All of the above, together, on a Quest** | **No** | **None found** | none |

**The hologram itself is not new, and we shouldn't pitch it as if it were.** Several products and research systems already cover pieces of it:

| What already exists | What it does |
|---|---|
| [SENTIO VR](https://www.sentiovr.com/post/new-augmented-reality-in-construction-overlay-bim-models-on-site-at-1-1-scale-with-meta-quest) | Overlays building models at 1:1 on site with a Quest |
| [Resolve](https://support.resolvebim.com/en/articles/6700300-augmented-reality-with-color-passthrough) | Colour-passthrough AR on Quest |
| [Synchro XR](https://aecmag.com/features/hololens-2-and-4d-construction/) | Plays a 1:1 animated build schedule on HoloLens 2, and lets crews compare "recently completed work directly with the model". This is the closest commercial match to our timeline idea. |
| [NEXT-BIM](https://next-bim.com/en/features/progress-tracking-tool/) | Tap-to-update status on each building element |
| [Augmented Assembly](https://arxiv.org/html/2601.11535) | Checks LEGO steps on a HoloLens 2 |
| [SIGGRAPH 2025 system](https://dl.acm.org/doi/10.1145/3721245.3734043) | Checks each step with an image-reading AI against a list of valid part-way states (abstract only, unverified) |
| [SIGMA](https://arxiv.org/abs/2405.13035) (Microsoft, open source) | Guides step-by-step tasks on a mixed-reality headset with language and vision models |

A judge who knows this space will have seen each of these.

**What is genuinely new is the loop that joins them, running on a consumer headset.** The researchers found no open-source Quest project that combines a ghost overlay, a built or missing state for each part, and a camera check. They found no project that records the *physical* state of an assembly over time from sensor data, since the closest analogues version the digital model, not the real build. And they found no open-source tool that goes from an arbitrary woodworking plan to a verified 3D parts model. These are gaps in what the searches turned up, not proof that nothing exists.

The Litematica framing also works in our favour. Minecraft players already know a schematic verifier that colours each block as correct, missing or wrong ([DeepWiki](https://deepwiki.com/maruohon/litematica/8.1-schematic-verification)). Bringing that to real boards is a story that lands in one sentence, and no construction product tells it in those words.

One competitive note. A repo called SiteXR, described as a "Meta Quest 3 WebXR walkthrough of a Gaussian-splat construction site", was pushed only hours before the research ran. It looks like another HTN 2026 team's project, though that's unconfirmed ([GitHub](https://github.com/BehradBeheshti/sitexr)). It is a walkthrough, not a build guide, but judges may see two Quest construction projects.

**For the pitch, claim fewer mistakes, not faster builds.** Registered 3D overlays cut assembly errors by 82%, mostly by stopping mistakes that snowball from earlier ones ([Tang et al. 2003](https://dl.acm.org/doi/10.1145/642611.642626)). A 2025 full-scale mechanical, electrical and plumbing (MEP) assembly study found detailed AR beat paper drawings on time, rework and errors. The one exception was the error rate among experienced industry workers ([Chaudhari et al. 2025](https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-16726)). The speed evidence is mixed. Paper instructions were fastest in one headset comparison ([Blattgerste et al. 2017](https://api.openalex.org/works/https://doi.org/10.1145/3056540.3056547)), and in another, headset instructions were slower and caused more errors than paper or projected instructions ([Büttner et al. 2016](https://api.openalex.org/works/https://doi.org/10.1145/2910674.2910679)). Stopping mistakes before they snowball is exactly what the name Cut Once promises.

## Drawings become 3D only when a person checks the AI

### Floor plans: near-perfect on clean samples, shaky on real sheets

Most "floor plan to 3D" repos use the same trick: find the wall lines, then push them straight up to a fixed height. The best known, FloorplanToBlender3d (623 stars, GPL-3.0), outputs a Blender project and glTF. It needs an Ubuntu 18.04 Docker image, and its own README warns that images "need to be quite small for detections to work" ([README](https://github.com/grebtsew/FloorplanToBlender3d)).

There is even a Unity precedent. FloorPlanTo3D pairs an image-recognition API that finds walls, doors and windows with a Unity app that builds the scene. It has no license and requires Python 3.6.13, so it's a reference, not a dependency ([API](https://github.com/fadyazizz/FloorPlanTo3D-API), [Unity client](https://github.com/fadyazizz/FloorPlanTo3D-unityClient)). The research models (DeepFloorplan, RoomFormer, CubiCasa5k, Raster2Seq) output flat 2D room outlines, not 3D. The researchers' conclusion: once you have clean wall segments in real units, the 3D step is easy. The hard part is reading the drawing.

The accuracy numbers show how hard that reading is. Raster2Seq (SIGGRAPH 2026) is the current best on the main real-plan benchmark. The scores below are F1, a 0–100 score that penalizes both misses and false alarms ([arXiv 2602.09016](https://arxiv.org/html/2602.09016)).

| Plans tested | Rooms (F1) | Corners (F1) |
|---|---|---|
| Clean synthetic plans | 99.6 | 98.3 |
| ~5,000 real scanned plans (CubiCasa5K) | 88.7 | **59.4** |

Its output is room outlines plus door and window labels. It gives **no walls and no heights**, and it sometimes misplaces windows. Plans simply don't carry heights, so building-model pipelines take height as a typed-in value ([Automation in Construction](https://www.sciencedirect.com/science/article/pii/S0926580525006247)). The researchers found no open project that reads plans, sections and elevations together to recover heights.

Scale is the other trap. A 2% scale error on a 10 m wall puts it 20 cm off, enough to make "build along with the hologram" useless. Reading one dimension string, or having the user tap two points a known distance apart, is worth more than any recognition model.

### Frontier AI reads the words on a drawing, not the symbols

Below, "VLM" means an AI model that reads images as well as text, like GPT-5 or Gemini with vision. The AECV-Bench update tested ten of them, including Gemini 3 Pro, GPT-5.2 and Claude Opus 4.5 ([AEC Foundry](https://www.aecfoundry.com/blog/can-ai-really-read-your-building-plans-aecv-bench-gets-a-major-upgrade); the blog's date is unverified; paper at [arXiv 2601.04819](https://arxiv.org/abs/2601.04819)).

| Task on real floor plans | Accuracy |
|---|---|
| Reading text on the drawing | ~95% |
| Counting doors | **39%** |
| Counting windows | **34%** |
| Best average counting score (Gemini 3 Pro) | 51% |

The authors say these models "lack robust drawing literacy" and recommend keeping a human in the loop. A separate study scored general-purpose models at 33–38% on understanding CAD-style plans; only its abstract was read ([ArchPlanVQA](https://ascelibrary.com/doi/abs/10.1061/JCCEE5.CPENG-7571)). The one strong result needed heavy training. FloorplanVLM fine-tuned a small model on 2 million plans and reached 92.5% overlap on outer walls, but the paper doesn't say its weights are released ([arXiv 2602.06507](https://arxiv.org/html/2602.06507v1)). A DocEng 2025 study is more hopeful. Given a few example symbols in the prompt, VLMs spotted furniture, doors and windows about as well as a trained detector. That test measured spotting objects, not exact counts ([ACM](https://dl.acm.org/doi/10.1145/3704268.3748681)).

The pattern that works is to let the AI propose and let code build. In CAD2BIM, a vision-capable agent reads a DXF, PDF or image and writes a `model-spec.json` that records its evidence and assumptions. A fixed exporter then compiles that spec into IFC, GLB, OBJ and STL files "without making any new semantic decisions". Finally, the agent renders the result, compares it to the drawing, and revises ([README](https://github.com/alvin528/CAD2BIM)). It has 4 stars and an unclear license, so we should copy the idea, not the code.

Two bigger projects matter too. The Pascal editor (MIT, 24,104 stars) is an open-source 3D building editor built on React Three Fiber and WebGPU. AI agents can drive it through MCP, a standard way for agents to call outside tools ([GitHub](https://github.com/pascalorg/editor)). Its plugin-bones add-on (MIT) derives full wall framing from a Pascal model: studs at 16" or 24" spacing, plates, king and jack studs, and headers "auto-sized by span". It also produces a lumber takeoff by size and stock length, exported as CSV, and it labels itself a "drafting aid, not engineering" ([GitHub](https://github.com/pascalorg/plugin-bones)). Both are web/three.js code, so in Unity only the rules carry over. Whether Pascal's WebGPU renderer runs in Quest Browser is unverified. Nobody found a tool that reads framing directly off 2D drawings; every framing tool starts from clean walls in a 3D model.

### Furniture drawings: cabinets are solved on paper, desks are not

The closest research to our desk is about cabinets. **PlankAssembly** (ICCV 2023) turns three line drawings (front, top and side) into a short program of axis-aligned boxes, or "planks". Each plank can point at the plank it attaches to. It scores 91.75 F1 and still manages 90.14 with 30% of the lines corrupted, while the classic non-AI method collapses to 8.20 under the same noise ([arXiv 2308.05744](https://arxiv.org/pdf/2308.05744)). But its license is AGPL, which is copyleft: if we ship it, our code must be opened too. It also needs SVG drawings in its own format, runs on a 2021-era PyTorch/CUDA setup, and ignores dimension text ([GitHub](https://github.com/manycore-research/PlankAssembly)).

Its successor, **CAD2Program**, reads raster drawings and shows why the numbers on a drawing matter. Reading the dimension labels lifted its reconstruction score from **62.65 to 82.76 F1** and its parameter accuracy from 81.94% to 97.21%. Its GitHub repo, though, contains only the project website ([arXiv 2412.11892](https://arxiv.org/html/2412.11892v1), [GitHub](https://github.com/manycore-research/CAD2Program)). The lesson: reuse the *representation* (boxes with attachments), and make the AI read the dimensions.

For general mechanical drawings, a 2026 Carnegie Mellon paper, Ortho2CAD, tested GPT 5.5 in a loop that renders its own answer and compares it to the drawing. It reached 0.73–0.85 overlap with 100% valid code on four test sets and beat a model fine-tuned for the job ([arXiv 2607.08891](https://arxiv.org/html/2607.08891)). Two warnings pull the other way. On 251,000 real mechanical drawings, the tested models' **volume errors ranged from 17% to 146%**, and they were weak at enforcing dimensions and matching views ([OmniMech](https://arxiv.org/html/2608.05539)). In a sample of 50 failures from another benchmark, **48% were parts put together in the wrong arrangement** ([CADCodeVerify](https://arxiv.org/html/2410.05340v2)).

No benchmark covers woodworking plans at all. The nearest shipped example is woodworking-skill (MIT, June 2026). An AI turns a description, photos or sketches into "a single small array of parts". Generic code then renders an interactive 3D view, an exploded view and a cut list. It refuses to invent dimensions and lists "Dimensions to verify" instead ([GitHub](https://github.com/bacarndiaye/woodworking-skill)). For testing, IKEA's official dataset includes a LACK table as separate 3D parts with its real manual, under a non-commercial license ([GitHub](https://github.com/IKEA/IKEA3DAssemblyDataset)).

### Electrical and MEP drawings: symbols yes, 3D no

Finding symbols on electrical and MEP drawings is a mature field built on trained detectors. The best detector on 45 real electrical layouts found 34 symbol types with an 82.5% score, though the paper gives no code location ([arXiv 2508.10449](https://arxiv.org/abs/2508.10449)). Turning MEP drawings into 3D building models happens only in research papers. A 2025 paper reports 92% accuracy at picking out MEP parts in drawings; only its abstract was read ([Buildings](https://doi.org/10.3390/buildings15060924)). Another notes that commercial tools "are often unable to process complex MEP drawings" ([Automation in Construction](https://www.sciencedirect.com/science/article/abs/pii/S0926580525005825)). Neither released code, and heights still come from rules. The only open repo that attempts wire routing after recognition has 9 stars and routes in 2D ([GitHub](https://github.com/IKENNA113/Electrical-Symbol-recognition-and-Wiring-design)). For us, electrical stays a stretch goal: the AI reads a simple outlet-and-switch plan, heights come from standard defaults, and ghost boxes appear on the wall, with no wire routing.

## Build order and progress tracking exist, but people still write the order

### The open 4D stack links parts to steps; it doesn't choose the order

"4D BIM" means a 3D building model linked to a schedule, so you can play the build forward in time. BIM (building information model) is a 3D model where each piece carries data, and IFC is its open file format.

The open-source workhorse is IfcOpenShell (LGPL-3.0, 2,793 stars, updated daily). Its scheduling API covers planned, baseline and "actual" schedules, tasks, which part each task installs, and "finish this before starting that" links. The docs say plainly that none of these functions generates a sequence automatically ([docs](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/sequence/index.html)). The IFC standard already has fields for what actually happened: **ActualStart, ActualFinish and Completion**, each defined as "a measured value" ([buildingSMART](https://github.com/buildingSMART/IFC4.3.x-development/blob/master/docs/schemas/resource/IfcDateTimeResource/Entities/IfcTaskTime.md)). Bonsai, the Blender add-on built on IfcOpenShell, can build schedules and animate them ([Bonsai](https://bonsaibim.org/)). Its richer interactive timeline was only partly merged as of the 2025–26 community thread ([OSArch](https://community.osarch.org/discussion/3151/wip-proposal-for-advanced-interactive-4d-planning-features-in-bonsai-bim)). No open-source Unity or web 4D viewer turned up.

Automatic ordering lives in papers:

| Approach | Status |
|---|---|
| [Steel-erection ordering](https://oasis.library.unlv.edu/fac_articles/779/) that checks the structure stays stable at each stage | Its authors call it semi-automatic |
| [Concrete-frame ordering](https://fount.aucegypt.edu/etds/13/) using graph search and sorting | Research thesis |
| [LLM scheduler (CONSTRUCTA)](https://arxiv.org/abs/2502.12066) | Large gains reported, but on private data, with no code |

A desk has fewer than 15 parts. For it, a list of which steps come after which, plus a topological sort (ordering the steps so each one comes after everything it depends on), is a few dozen lines of code.

### Assembly research: rich datasets, weak AI understanding

Furniture and LEGO assembly have the most public data, and AI still struggles with them. On IKEA Manuals at Work (NeurIPS 2024), models tried to predict the assembly plan from video across 36 furniture models and 98 videos. The baselines scored only 26.88–29.74% F1, even on the easier matching setting ([arXiv 2411.11409](https://arxiv.org/html/2411.11409v1)). On Flat-Pack Bench, "the strongest models, such as GPT-5" scored about 38% on questions about IKEA assembly videos, against 94% for humans ([arXiv 2605.21625](https://arxiv.org/pdf/2605.21625)). Manual2Skill shows that an AI *can* read IKEA manual pages into an assembly graph that a robot then follows ([arXiv 2502.10090](https://arxiv.org/abs/2502.10090)).

BrickGPT (ICCV 2025 Best Paper, MIT, 1,706 stars) holds the most useful lesson for us. It generates LEGO bricks bottom to top, and that order is *not* buildable. The authors fix it with "assembly-by-disassembly": repeatedly remove a piece that nothing else rests on, then reverse the list ([arXiv 2505.05469](https://arxiv.org/html/2505.05469v1)). Assemble Them All uses the same idea with physics simulation ([arXiv 2211.03977](https://arxiv.org/abs/2211.03977)). Our version: let the AI propose the desk's steps once, have a person edit and freeze them, and check them with one rule. A part can go in only after everything it rests on is in.

### Progress checking works offline and slowly, not live

Comparing "as built" with "as planned" has a long history, all of it offline. D4AR (2009) laid site photos over a 4D model ([ResearchGate](https://www.researchgate.net/publication/269047952_Automated_Monitoring_of_Operation-level_Construction_Progress_Using_4D_BIM_and_Daily_Site_Photologs)). A follow-up classified building materials in small photo patches at 97.1% accuracy ([ResearchGate](https://www.researchgate.net/publication/273834522_Appearance-based_material_classification_for_monitoring_of_operation-level_construction_progress_using_4D_BIM_and_site_photologs)). Newer work estimates how complete each activity is, to within 6% on average ([Automation in Construction](https://www.sciencedirect.com/science/article/abs/pii/S092658052300417X)). All of this depends on careful alignment and runs on photo sets after the fact.

On headsets, the checks get slow or need outside help:

| System | Result | Catch |
|---|---|---|
| [HoloLens 2 MEP checker](https://www.sciencedirect.com/science/article/pii/S2590123026014143) | About 2 frames per second | Abstract only |
| [Augmented Assembly](https://arxiv.org/html/2601.11535) | Confirms 96.2% of correct part picks and catches 91.8% of wrong ones. A LEGO build took 12:39 with AR vs. 25:54 with sorted parts. | Offloads to an RTX 3060 PC. The timing comes from the authors testing it themselves, not a real user study. No code found. |
| [PROVIA](https://arxiv.org/abs/2609.20638) (2026 mistake detector) | Runs at 58–70 frames per second | Catches only 15.4% and 3.4% of mistakes on two benchmarks at a low false-alarm rate |
| [GPT-4V on construction photos](https://arxiv.org/abs/2412.16108) | Recognizes construction stages and materials | Struggles to say *where* things are |

**No source measured the exact thing we want:** send one headset frame to an AI and ask "is the left leg attached?" about a piece of furniture. We need to time and test that ourselves, on the real desk, in the real lighting. We do have an advantage the research systems lack. We already know which part should be next and where it goes, so each check is a narrow yes/no question, the easiest case for these models. The hard case the literature says they miss is a wrong orientation, like a board flipped or rotated.

### Version history: git for building files exists, git for real builds doesn't

Bonsai can track an IFC model in Git, with tags like TENDER or CONSTRUCTION ([Bonsai docs](https://docs-unstable.bonsaibim.org/guides/authoring/git_support.html)). That works because the IFC text format stores one item per line, so a small edit changes only a few lines ([OSArch](https://community.osarch.org/discussion/3175/continuous-integration-in-ifc-git-repositories-using-ids-and-validation)). Speckle offers open-source, git-like versions of building data ([Speckle](https://speckle.guide/user/FAQs.html)). Both version the *digital* model. Nobody found a project that versions the *physical* state of a build from what sensors see.

The researchers recommend an append-only event log. Each event records the time, the part, its new state, the source (tap, voice or camera) and an optional photo. Replaying the whole log gives the current state. Replaying the first n events gives "version n". Comparing the planned order with the actual event order gives the planned-vs-actual diff. Each event can also go into Elasticsearch as a document. Optionally, the log can be exported as an IFC "actual" schedule with ActualFinish set to each placement time, which gives us a standards-based 4D talking point.

### Litematica already solved the interface

Litematica's schematic verifier sorts every block into one of five states, each with its own colour ([DeepWiki](https://deepwiki.com/maruohon/litematica/8.1-schematic-verification)). It adds a HUD that points to the nearest problems ([CurseForge](https://www.curseforge.com/minecraft/mc-mods/litematica)), layer-by-layer rendering, and a material list ([wiki](https://github.com/maruohon/litematica/wiki/Frequently-Asked-Questions)). The code is LGPL-3.0 in two active repos with 952 and 886 stars ([maruohon](https://github.com/maruohon/litematica), [sakura-ryoko](https://github.com/sakura-ryoko/litematica)). Its categories map straight onto desk parts:

| Litematica state | Desk equivalent |
|---|---|
| MISSING | Ghost part, not placed yet |
| CORRECT | Placed and confirmed |
| WRONG_STATE | Right board, but flipped or rotated |
| WRONG_BLOCK | Wrong board used |
| EXTRA | Rarely relevant for a desk |

Layer mode becomes "show this step and everything before it", and the material list becomes the cut list. The one thing Minecraft gets for free is perfect data, because the game knows every block. We have to pick a source of truth. Both researchers who looked at this landed on the same answer: a tap or voice command first, and the camera as a second opinion.

## Full-scale overlays work, and alignment decides whether they help

Open-source code for full-scale overlays is thin, and none of it checks progress with the headset camera on a Quest:

| Project | What it does |
|---|---|
| [HoloInspect](https://github.com/Tianyu-Wu/HoloInspect) | HoloLens 1 (2020); colours building elements by progress |
| [COMPAS XR](https://github.com/compas-dev/compas_xr) | ETH Zurich and Princeton, MIT; overlays timber assemblies using QR markers. Its under-2 mm drift figure comes from search summaries, so treat it as partly unverified ([user guide](https://compas.dev/compas_xr/0.9.4/userguide.html)). |
| [xr-drilling-assistant](https://github.com/JDeffner/xr-drilling-assistant) | A Quest / Unity 6 / MRUK course project that projects a planned drilling layout back onto a real wall |

Accuracy depends on alignment, and QR codes are the proven route. With multiple QR codes at most 0.38 m apart, a HoloLens 2 overlay stayed within 2 mm of real timber beams. Those numbers come from search summaries; the full text wasn't opened ([Kyaw et al. 2023](https://www.sciencedirect.com/science/article/abs/pii/S0926580523001723)). HoloLens room-mapping alone isn't accurate enough to line up a building model ([TNOCS wiki](https://github.com/TNOCS/WorldExplorer/wiki/Interesting-HoloLens-projects)). The Quest 3's own head tracking hit sub-millimetre error on a robot test rig, but only in controlled, best-case conditions ([Sensors 2026](https://www.mdpi.com/1424-8220/26/8/2285)). Recall Büttner 2016: a poorly done headset overlay can do worse than paper. Alignment matters more than extra features.

Every Quest 3 building block we need exists as maintained Meta or community code:

| Need | What exists | Notes |
|---|---|---|
| Camera frames | Meta's Passthrough Camera API, which lets an app read the Quest's colour camera | Horizon OS v74+; Store apps can ship with it since v76. Current docs: 1280×960 or 1280×1280 at 60 Hz, 20–40 ms delay ([Meta](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview)). Launch coverage said 30 fps, 40–60 ms, and small text unreadable ([UploadVR](https://www.uploadvr.com/quest-passthrough-camera-api-now-shippable-on-store/)). It doesn't run in the XR Simulator, so all camera testing needs the real headset. |
| Camera + voice starting point | [QuestCameraKit](https://github.com/xrdevrob/QuestCameraKit) (MIT, 577 stars) | Bundles QR tracking, YOLO object detection, WebRTC streaming, and speech → OpenAI Whisper → OpenAI Vision on a camera frame → spoken answer |
| Camera ↔ world math | Meta's ["CameraToWorld" sample](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples) | Maps a camera pixel to a 3D point and back |
| QR codes | MRUK, Meta's Mixed Reality Utility Kit for Unity; QR tracking in v78+ | Returns the code's full 3D pose and payload. Uses the spatial-data permission, not the camera permission. Updates slowly, which suits a desk that doesn't move ([UploadVR](https://www.uploadvr.com/quest-3-mruk-update-decode-track-qr-codes-unity/)). |
| Remembering the position | [Spatial anchors](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/) (saved real-world positions) | One anchor covers content within about 3 m |
| Occlusion | [Depth API](https://developers.meta.com/horizon/documentation/unity/unity-depthapi-overview/) | Lets ghost parts hide behind real hands and boards. Unreliable closer than about 0.2 m. |
| Loading 3D models | [glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/index.html), [UnityGLTF](https://github.com/KhronosGroup/UnityGLTF) | Load GLB files (a one-file 3D format) at runtime |

Three limits shape the design. First, Meta's on-device sample detector knows 80 everyday object types, misclassifies some, and won't know a "desk apron" ([Meta](https://developers.meta.com/horizon/documentation/unity/unity-pca-sentis/)). Second, cloud AI checks take seconds: one AR pipeline that sent camera images to an AI server averaged about 7 seconds per answer ([arXiv 2507.20356](https://arxiv.org/abs/2507.20356)). Checks should therefore run on demand, behind a "checking…" pulse, rather than continuously. Third, battery runs about 2–3 hours, and less in mixed reality ([XR Today](https://www.xrtoday.com/mixed-reality/how-to-maximize-meta-quest-3-battery-life-top-tips/)). For voice, Porcupine no longer has a Unity binding ([GitHub](https://github.com/Picovoice/porcupine)), and openWakeWord's pretrained models are non-commercial ([GitHub](https://github.com/dscripka/openWakeWord)). That makes push-to-talk the safe choice.

## The Caltech paper sees a whole desk, not its legs

**What the record is.** The Caltech record [w53bg-rre21](https://authors.library.caltech.edu/records/w53bg-rre21) is the July 2022 arXiv preprint "Omni3D: A Large Benchmark and Model for 3D Object Detection in the Wild" (arXiv 2207.10660). It lists five authors (Brazil, Straub, Ravi, Johnson and Gkioxari), and Caltech holds it because co-author Georgia Gkioxari works there. The final version appeared at **CVPR 2023**. It added a sixth author, Abhinav Kumar, and counts 98 object categories instead of the record's 97. The authors come from Meta AI, Michigan State and Caltech ([arXiv](https://arxiv.org/abs/2207.10660), [v2 PDF](https://arxiv.org/pdf/2207.10660v2)). If we cite it, we should cite the six-author CVPR version.

**What it does.** From one ordinary photo, it draws a 3D box around each object, with real size in metres and orientation. The Omni3D dataset merges six existing datasets into 234,000 images with over 3 million boxes across 98 categories, 20 times larger than the earlier indoor and driving datasets it builds on. The Cube R-CNN model adds a "cube head" to a standard 2D detector, plus a "virtual depth" trick that lets it work across different cameras ([v2 PDF](https://arxiv.org/pdf/2207.10660v2)). Its accuracy score, AP3D, measures how well its 3D boxes overlap the true ones, averaged over loose to moderate overlap requirements.

| Result | AP3D |
|---|---|
| Cube R-CNN, all scenes | **23.3** |
| Best earlier method | 15.4 |
| Cube R-CNN, indoor scenes | 15.0 |
| Tables (indoor test set) | 38.3 |
| Shelves (indoor test set) | **3.2** |

Its class list includes "desk", "table", "shelves", "cabinet", "door" and "window" ([config](https://raw.githubusercontent.com/facebookresearch/omni3d/main/configs/Base_Omni3D.yaml)). It needs the camera's lens numbers (focal length and centre) to get real-world scale; without them, positions are right only up to a scale factor. The authors did show it working, with no retraining, on video from a head-mounted camera "similar to AR/VR headsets". They linked boxes across frames with a simple rule: same label and enough 3D overlap ([v2 PDF](https://arxiv.org/pdf/2207.10660v2)).

**Can we run it?** Realistically, no. The code is archived and read-only, with the last commit in May 2023 and a CC-BY-NC (non-commercial) license. It needs PyTorch 1.8 and CUDA 10.1, the demo is hard-coded to an NVIDIA GPU, and training used 48 V100 GPUs ([GitHub](https://github.com/facebookresearch/omni3d), [demo.py](https://raw.githubusercontent.com/facebookresearch/omni3d/main/demo/demo.py)). The paper reports no speed. The researchers estimate 2–6+ hours just to get it running, and that is an untested guess.

**What it means for Cut Once.** It doesn't read drawings, build models or order steps. It only touches the camera side of progress checking, and only at the whole-object level. At best it would put one "desk" box around our half-built desk. It can't tell three legs from four. And its 3.2 score on shelves suggests thin boards, which are exactly what a half-built desk is made of, are its weakest case.

The more useful insight is the contrast. Omni3D answers "what is here, and where?" from scratch. Cut Once already knows where every part *should* be, because the hologram is aligned to the desk, so we can project each planned part's box into the camera image and ask one yes/no question. That is a far easier problem.

Two things are worth keeping. The first is a citation: single-photo 3D detection with real-world sizes from a head-mounted camera is published work. The second is the matching idea: a part counts as "built" when what we observe overlaps the planned box enough and the label agrees. That mirrors the paper's own tracker, and a simple box-overlap check in Unity covers it. If we ever want detection that takes any text prompt, like "desk leg", two newer successors fit better. OVMono3D is Apache-2.0, maintained, and appears at 3DV 2026 ([GitHub](https://github.com/UVA-Computer-Vision-Lab/ovmono3d)). Apple's Cubify Anything (CVPR 2025) targets indoor scans captured from a handheld or head-worn device ([Apple](https://machinelearning.apple.com/research/cubify-anything)). Both still need a GPU server and still see whole objects. Verdict: cite it, borrow the matching idea, and don't run it.

## Settle Unity versus WebXR before anyone writes code

Our design doc and our current plan disagree. The design doc specifies "WebXR immersive-ar + three.js" in Quest Browser, with a Vite + three.js headset client and teammates testing in the IWER browser emulator because we have one headset ([design doc](../docs/superpowers/specs/2026-09-18-cut-once-design.md)). Its golden-path demo is a framed 8 ft wall placed by clicking two floor corners. The new plan is Unity, a half-built desk, and a copilot that looks through the headset camera.

The camera forces the choice. Meta's own Quest Browser mixed-reality doc says: "There is no way to get to the pixels of the passthrough content" ([Meta WebXR doc](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)). Meta's April 2025 blog promised browser support "launching with v77" ([Meta blog](https://developers.meta.com/horizon/blog/new-era-mixed-reality-passthrough-camera-api-machine-learning-computer-vision/)). But a later Meta forum thread is still asking for browser camera access ([forum](https://communityforums.atmeta.com/discussions/Questions_Discussions/request-webxr-raw-camera-access-camera-access-feature-in-quest-browser/1367463)), and the web-standards issue is still open ([immersive-web](https://github.com/immersive-web/raw-camera-access/issues/21)). **Nobody confirmed that browser camera access shipped, so treat it as unverified.** In Unity, camera access is documented, allowed in Store apps, and backed by official samples ([Meta](https://developers.meta.com/horizon/documentation/unity/unity-pca-overview)).

| | Unity | WebXR + three.js |
|---|---|---|
| Camera for the copilot | Documented path, with QuestCameraKit as a head start | No camera unless browser camera access actually works |
| Code we can borrow | Only the rules from Pascal and plugin-bones; their code won't run | Pascal and plugin-bones code, plus three.js's GLTFLoader, directly (Pascal's WebGPU on Quest is unverified) |
| Testing without the headset | Camera features can't run in the XR Simulator, so the one headset becomes a bottleneck | Keeps the design doc's IWER emulator plan |

The parts JSON, the GLB files, the backend agent loop, Elasticsearch search and speech all work the same either way. Since the camera copilot is in the new plan and Unity is the only documented way to get it, Unity is the safer call. If anyone wants to keep WebXR, a 30-minute test in hour one settles it: does `getUserMedia` in Quest Browser return passthrough pixels? Whichever way it goes, update the design doc so no one builds against two plans, and swap the framed wall for the desk.

## What to reuse in 36 hours

Everything below exists, is maintained or small enough to port, and fits in a day and a half. "Our code" means we write it ourselves, using the listed project as the model.

| Job | Reuse this | License | Watch out for |
|---|---|---|---|
| Headset base, camera frames, voice → vision → speech loop | [QuestCameraKit](https://github.com/xrdevrob/QuestCameraKit) | MIT | Pin its Unity 6000.3.12f1 and Meta XR 205.0.0 versions. It publishes no latency numbers. |
| Camera pixel ↔ 3D world math | [Meta Passthrough Camera samples](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples) (CameraToWorld) | Oculus License, MIT on marked files | Runs on the device only, not in the simulator |
| Lining the ghost up with the real desk | [MRUK QR tracking](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection/) → [spatial anchor](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-overview/). Fallback: touch the controller to 2–3 desk corners. | Meta SDK | Updates slowly, so turn QR off once locked. Add a 1 mm / 0.5° nudge mode. |
| Ghost parts hiding behind real hands and boards | [Unity-DepthAPI sample](https://github.com/oculus-samples/Unity-DepthAPI) | Meta sample | Unreliable closer than ~0.2 m |
| Loading the model | [glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/index.html) or [UnityGLTF](https://github.com/KhronosGroup/UnityGLTF), or one scaled cube per board built from JSON | Unity / MIT | Name every object `part_<id>` so search hits, voice answers, highlights and the cut list share one key |
| Parts list format | [PlankAssembly](https://arxiv.org/pdf/2308.05744)'s boxes-with-attachments idea; [woodworking-skill](https://github.com/bacarndiaye/woodworking-skill)'s parts array | Idea only (AGPL) / MIT | Keep rotations to 0° or 90° to avoid the placement errors the benchmarks report |
| Reading a drawing into the parts list | A GPT-class model with strict JSON output, a render-and-compare retry (the [CAD2BIM](https://github.com/alvin528/CAD2BIM) and [Ortho2CAD](https://arxiv.org/html/2607.08891) pattern), and a confirm screen for a person | Our code | Door and window symbols are read right only 34–39% of the time, so never trust them unchecked |
| Checking the parts list | Parts add up to the overall size, each board matches a cut-list row, and no boards float or overlap | Our code | Doubles as a demo-able "mistake catcher" |
| DXF drawings (building path) | [ezdxf](https://github.com/mozman/ezdxf) | MIT | Plans lack heights, so use defaults and say so |
| Framing, cut list, order | Port the [plugin-bones](https://github.com/pascalorg/plugin-bones) rules; lay out sheets with [rectpack](https://github.com/secnot/rectpack) | MIT / Apache-2.0 | "Drafting aid, not engineering" |
| Build order | Steps with "after" links, named like IFC tasks, sorted so each step comes after what it needs, plus the "rests-on" rule from [BrickGPT](https://arxiv.org/html/2505.05469v1) | Our code | Hand-write 6–12 desk steps and freeze them |
| Version history | Append-only event log mirrored into Elasticsearch; optional [IfcOpenShell](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/sequence/index.html) "actual" schedule export | Our code / LGPL | Log the source of every event: tap, voice or camera |
| Verifier look and feel | [Litematica](https://deepwiki.com/maruohon/litematica/8.1-schematic-verification)'s five states, colours, nearest-problem HUD and layer mode | Idea only (LGPL) | Keep the camera's verdict a suggestion: "Looks like the left leg is on — confirm?" |
| Campus building "vision" | A pre-baked GLB: extrude with ezdxf, or run [FloorplanToBlender3d](https://github.com/grebtsew/FloorplanToBlender3d) once in Docker and clean it in Blender. For IFC input, use [IfcConvert](https://docs.ifcopenshell.org/ifcconvert.html) with `--use-element-guids`. | MIT / GPL / LGPL | Label it "vision" and don't parse it live |
| Voice | Push-to-talk; [Vosk Unity](https://github.com/alphacep/vosk-unity-asr) only if a wake word is essential | Apache-2.0 | Porcupine has no Unity binding |
| Pitch evidence | [Tang 2003](https://dl.acm.org/doi/10.1145/642611.642626) (82% fewer errors) and [Chaudhari 2025](https://ascelibrary.org/doi/10.1061/JCEMD4.COENG-16726) (AR beat paper at full scale) | Citations | Claim fewer errors, not faster builds |

**What to skip.** Each of these costs hours for little demo value:

| Skip | Why |
|---|---|
| PlankAssembly | AGPL, a 2021-era CUDA setup, and SVG-only input |
| CAD2Program | No code released |
| Cube R-CNN | Archived, and needs CUDA 10.1 |
| cadrille, CAD-Recode, CAD-Coder | Need a GPU, and each was trained on single mechanical parts |
| Raster-to-Vector | Needs Torch7 and Python 2.7 |
| FloorPlanTo3D API | Needs Python 3.6 |
| On-device YOLO for desk parts | Knows 80 everyday objects, none of them desk parts |
| Vuforia on Quest | Experimental, and tracks from camera images alone, without the headset's own motion data |
| MEP symbol detectors | Would need training on our own symbols |
| Promising automatic door and window detection on arbitrary drawings | Frontier AI counts them correctly only 34–39% of the time |

**Use the first two hours to remove the big risks before anyone builds features.** Work through these in order:

| # | Check |
|---|---|
| 1 | Build QuestCameraKit to the headset |
| 2 | Confirm a camera frame reaches our backend and OpenAI Vision answers |
| 3 | Confirm MRUK returns a pose for a printed QR code |
| 4 | Time a single "is the left leg on?" call on the real desk under venue lighting |
| 5 | Run the chosen model on 3–5 real desk plans, including fractional-inch dimensions like 23-3/4", which no source tested |

Throughout, keep a hand-checked `desk.json` as the fallback, so the live demo never depends on a single AI call.

## Conclusion

The research turns our hardest-looking problem into an easy one. Everyone else in this literature tries to *recognize* things from scratch: symbols on a drawing, parts in a video, objects in a photo. On those tasks AI still scores somewhere between 34% and 59%. Cut Once doesn't have to. The plan says what should exist and the alignment says where, so every camera check becomes a narrow "is this one part here?" question, and a person's tap settles any doubt. Our real risks sit where the papers say the benefit is won or lost: scale and alignment. A 2% scale error or a sloppy overlay makes the headset worse than paper, so two QR codes and a nudge mode deserve more hours than any AI feature.

The story we can defend is the loop, not any single model: the drawing reader proposes, the builder confirms, and the headset remembers. Naming our steps and events after IFC's task and "actual" fields gives us a standards-based 4D claim almost for free. Litematica gives judges a mental model they grasp in one sentence. The campus building should stay clearly labelled as vision. Reading a whole drawing set across sheets, recovering heights from sections, and learning each firm's own symbols are unsolved in every benchmark the researchers found. Saying so plainly will come across as expertise, not weakness.
