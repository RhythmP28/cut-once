# Raster floor plan to vector walls, doors, windows, rooms and stairs: tools that could run on the E7 drawings within a hackathon

**Method note.** I pulled stars, licences, last-commit dates, release assets and README contents from the GitHub REST API (`gh api`) on **2026-09-19**. "Last commit" means the newest commit on the default branch. "Pushed" can be later, because it counts pushes to any branch. Hugging Face file lists, licences and model-card metrics come from the HF API on the same day. I did not clone or run anything, so "runs on M3" is based on the stated dependencies, not on a test. Setup-time figures are **my estimates** and are labelled as inferences.

**What this note builds on.** The earlier note (`Blueprint to 3D and 4D reconstruction/floorplan_to_3d.md`) already covers AECV-Bench (frontier VLMs count doors at about 39% and windows at about 34%), the CAD2Program result (reading dimension labels lifts F1 from 62.65 to 82.76), the Raster2Seq, RoomFormer, HEAT, PolyRoom and FRI-Net benchmark tables, and FloorplanVLM (92.52% external-wall IoU). I do not repeat those here.

**E7 numbers used throughout.** The given scale is about 13.75 px per metre. That makes a 0.9 m door about 12 px wide, a 100–200 mm partition about 1.4–2.75 px thick, a 300–500 mm exterior wall about 4–7 px, and a 2000 px sheet about 145 m across. This is my arithmetic from the scale the brief states.

---

## 1. Learned vectorizers and detectors: which can actually be run, which cope with low resolution and presentation drawings, and does upscaling help?

### Takeaway
Every learned floor-plan model with public weights was trained on **residential** plans: CubiCasa5K (Finnish apartments), R2V/LIFULL (Japanese apartments) and Structured3D (synthetic). They also expect **fixed small inputs** of 256 or 512 px. Fed the whole 2000 px E7 sheet, the image is downscaled until a door is only 1.5–3 px wide. They are therefore usable only on native-resolution tiles, and even then E7 is out of domain for them. On an M3, the fastest learned options to try are:
- **Yytsi/floorplan-to-3d**: a UNet that segments wall, door and window, with weights under MIT, and it runs on CPU or MPS.
- **The CubiCasa5K model**: the only one that outputs wall polygons with thickness plus openings, rooms and icons in a single pass. It is 2019-era CUDA code, but the rbg-research fork adds a CPU fallback.

Raster2Seq is the most accurate, but it needs compiled CUDA ops (so Colab), and it outputs rooms plus doors and windows, not walls. Upscaling has **modest published evidence** of helping: about +12% on average on CubiCasa images smaller than 800×800 with classic super-resolution networks. I found nothing specific to Real-ESRGAN on floor plans.

### Cited Findings

**A. Wall and room vectorizers (per-repo facts)**

| Option | GitHub | Licence | Stars / last commit | Weights | Deps / Apple Silicon | Input assumption | Output | Reported accuracy |
|---|---|---|---|---|---|---|---|---|
| **CubiCasa5K model** (Kalervo et al. 2019) | [CubiCasa/CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k) | LICENSE file: CC BY-NC 4.0 (the GitHub API reports NOASSERTION) | 589 / 2019-05-24 | Yes, Google Drive `model_best_val_loss_var.pkl` ([README](https://github.com/CubiCasa/CubiCasa5k)) | "Python 3.6.5 and Pytorch 1.0.0 with CUDA enabled GPU", nvidia-docker, cv2 3.1.0 ([README](https://github.com/CubiCasa/CubiCasa5k)) | Scanned raster plans; the dataset has "high quality architectural, high quality and colorful" subsets of 3732, 992 and 276 plans, with source resolutions of 50–8000 px ([paper](https://arxiv.org/abs/1904.01920)) | Hourglass network with heatmaps plus room and icon segmentation. Post-processing builds **wall polygons with width inferred** from the segmentation intensity profile, rooms, and doors and windows as openings whose "width … is the same as the wall polygon" ([paper](https://arxiv.org/abs/1904.01920)) | CubiCasa5K test mIoU: rooms 57.5 raw / 49.3 polygonized, icons 55.7 / 41.6. Per class (test IoU raw / polygonized): **wall 73.0 / 47.9, window 66.8 / 40.9, door 53.6 / 41.2**. No stair class among the 11 icon classes ([paper, Tables 3–4](https://arxiv.org/abs/1904.01920)) |
| CubiCasa + super-resolution fork | [rbg-research/Floor-Plan-Detection](https://github.com/rbg-research/Floor-Plan-Detection) | MIT | 120 / 2026-03-16 | Uses CubiCasa weights via `gdown` | Docker Jupyter setup; "a basic CPU fallback in the core inference path" was added; some Linux path assumptions remain ([README](https://github.com/rbg-research/Floor-Plan-Detection)) | Same as CubiCasa, with optional super-resolution first (LapSRN by default) | CubiCasa outputs, plus wall polygons fed to FloorplanToBlender3d to produce a `.blend` | "improvement of approximately 12%" on average from super-resolution, on 100 CubiCasa images under 800×800 ([README](https://github.com/rbg-research/Floor-Plan-Detection)) |
| **Yytsi/floorplan-to-3d** (2026) | [Yytsi/floorplan-to-3d](https://github.com/Yytsi/floorplan-to-3d); weights at [HF Yytsi/floorplan-to-3d-walls](https://huggingface.co/Yytsi/floorplan-to-3d-walls) | MIT (repo and model card), but it is trained on CC BY-NC CubiCasa5K | 23 / 2026-05-13 | Yes, `best.safetensors` (about 98 MB) plus `config.yaml`, 1,181 HF downloads | Python 3.11, Cairo. "A GPU is **not** required for inference … `BUILDINGCV_DEVICE=cuda` (or `mps`)" ([README](https://github.com/Yytsi/floorplan-to-3d)) | Trained at 512×512 with letterboxing. The demo server takes CubiCasa `model.svg` files (rasterized with cairosvg), so a JPG needs a small wrapper | Per-pixel **floor, wall, door and window** classes, then morphological closing, `findContours` (CCOMP, which keeps doorway holes), Douglas–Peucker simplification, and polygons extruded in a Three.js viewer | Validation mIoU 0.983 over 4 classes. No per-class or test numbers given ([model card](https://huggingface.co/Yytsi/floorplan-to-3d-walls)) |
| MitUNet (wall segmentation) | [aliasstudio/mitunet](https://github.com/aliasstudio/mitunet) ([arXiv 2512.02413](https://arxiv.org/abs/2512.02413)) | Code MIT; weights CC BY-NC 4.0 because trained on CubiCasa5K | 19 / pushed 2026-04-08 | Yes, in the repo (`experiments/models/…pth`) | PyTorch plus segmentation-models-pytorch 0.5.0; the snippet uses `cuda` if available, otherwise `cpu` ([README](https://github.com/aliasstudio/mitunet)) | `A.Resize(512, 512)` | Binary **wall mask** only | Not extracted |
| TF2DeepFloorplan (DeepFloorplan, ICCV 2019 port) | [zcemycl/TF2DeepFloorplan](https://github.com/zcemycl/TF2DeepFloorplan) | GPL-3.0 | 267 / 2023-06-01 (pip wheels v0.0.5, 2023-05-20) | Google Drive via `gdown` (log 112.5 MB, pb 107.3 MB, tflite 37.1 MB). The README also warns "google drive does not work currently due to its update" in its Docker section ([README](https://github.com/zcemycl/TF2DeepFloorplan)) | Has an explicit **"MacOS / M1 Chip"** install option (`tfmacm1`) and a Colab notebook ([README](https://github.com/zcemycl/TF2DeepFloorplan)) | `deploy.py` resizes every input to **512×512** ([deploy.py](https://github.com/zcemycl/TF2DeepFloorplan/blob/main/src/dfp/deploy.py)) | Pixel masks for room boundaries (wall, door and window) and room types. **Not vectors** | Not retrieved this session |
| **Raster2Seq** (SIGGRAPH 2026) | [Cornell-VAILab/Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq) | MIT (code and HF weights) | 57 / 2026-06-02 (pushed 2026-07-14) | Yes, [HF haopt/Raster2Seq](https://huggingface.co/haopt/Raster2Seq): `s3d-bw`, `cubicasa5k`, `raster2graph`, `raster2graph-512`, `s3d-density`. Checkpoint filenames say **res256**, e.g. `cc5k_sem_res256_ep0499.pth` ([raster2seq_hub.py](https://github.com/Cornell-VAILab/Raster2Seq/blob/master/raster2seq_hub.py)) | "tested on Linux with python 3.10.13, pytorch 2.3.1 and cuda 11.8"; you must compile the deformable-attention CUDA ops (`models/ops/make.sh`) and `diff_ras` ([README](https://github.com/Cornell-VAILab/Raster2Seq)) | RGB raster, 256 px (one 512 px model). Trained on residential data | Labelled room polygons, with doors and windows as polygon classes. No walls. Includes a `vlm_refinement/` step that uses the Gemini CLI to "enforce geometric constraints" on CubiCasa predictions ([vlm_refinement README](https://github.com/Cornell-VAILab/Raster2Seq/tree/master/vlm_refinement)) | CubiCasa5K Room F1 88.7, Corner 59.4 (from the earlier note). WAFFLE zero-shot IoU 73.9 ([arXiv 2602.09016](https://arxiv.org/html/2602.09016)) |
| Raster-to-Graph | [SizheHu/Raster-to-Graph](https://github.com/SizheHu/Raster-to-Graph) | GPL-3.0 | 64 / 2026-05-08 (README edit) | Google Drive trained model ([README](https://github.com/SizheHu/Raster-to-Graph)) | "developed and tested with Python 3.7, cuda 11.1, Windows 10"; `torch==1.9.1+cu111` | "Centered 512*512 images" from LIFULL Japanese residential data; the dataset needs an access application | Wall-junction and wall-segment graph with room semantics | (see earlier note) |
| RoomFormer / HEAT / PolyRoom / FRI-Net | [RoomFormer](https://github.com/ywyue/RoomFormer), [HEAT](https://github.com/woodfrog/heat), [PolyRoom](https://github.com/3dv-casia/PolyRoom), [FRI-Net](https://github.com/Daisy-1227/FRI-Net) | MIT / NOASSERTION / none / none | 336 / 2025-04-02; 137 / 2025-03-26; 107 / 2025-05-15; 37 / 2025-05-14 | RoomFormer on ETH polybox; HEAT "update data and checkpoints link" (2025-03-26) | RoomFormer: "Linux with python 3.8, torch 1.9.0, and cuda 11.1" ([README](https://github.com/ywyue/RoomFormer)); deformable-attention CUDA ops | Point-cloud **density maps** (Structured3D, SceneCAD), not drawings | Room polygons or planar graphs | Their CubiCasa numbers in the Raster2Seq tables come from retraining, not from the public checkpoints ([arXiv 2602.09016](https://arxiv.org/html/2602.09016)) |
| Raster-to-Vector / FloorplanTransformation (2017) | [art-programmer/FloorplanTransformation](https://github.com/art-programmer/FloorplanTransformation) | MIT | 681 / 2019-06-28 | (see earlier note: Torch7 plus Python 2.7) | Not viable on a modern Mac | R2V dataset, 96–1920 px ([CubiCasa paper Table 1](https://arxiv.org/abs/1904.01920)) | Walls from junctions, doors, icons, rooms | On the R2V data, CubiCasa's re-evaluation gives opening accuracy/recall of 92.3/90.6 with integer programming ([CubiCasa paper Table 2](https://arxiv.org/abs/1904.01920)) |
| MuraNet (ICDAR-W 2023) | No code repo found | n/a | n/a | n/a | n/a | CubiCasa5K | Wall and room segmentation plus a YOLOX door/window detection head | Beats U-Net and YOLOv3 on CubiCasa5k in AP and IoU per the abstract ([arXiv 2309.00348](https://arxiv.org/abs/2309.00348)) |
| FloorPlanTo3D-API | [fadyazizz/FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) | none | 27 / 2024-10-26 | Google Drive | `python=3.6.13` with pinned 2020–21 packages (e.g. `absl-py==0.12.0`) ([requirements](https://github.com/fadyazizz/FloorPlanTo3D-API/blob/master/requirements.txt)) | Claims to handle hand-drawn styles | Mask R-CNN wall, door and window detections for a Unity client | Not reported |
| Deep Vectorization of Technical Drawings (ECCV 2020) | [Vahe1994/Deep-Vectorization-of-Technical-Drawings](https://github.com/Vahe1994/Deep-Vectorization-of-Technical-Drawings) | MPL-2.0 | 154 / pushed 2025-11-03 | Yandex Disk pretrained line and curve models ([README](https://github.com/Vahe1994/Deep-Vectorization-of-Technical-Drawings)) | Dockerfile or requirements | Clean line drawings; trained on the PFP floor-plan and ABC datasets | **Unlabelled** line and curve primitives, with no wall or door semantics ([paper](https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123580579.pdf)) | n/a |
| RasterScan (commercial) | [RasterScan/Floor-Plan-Recognition](https://github.com/RasterScan/Floor-Plan-Recognition); [HF Space](https://huggingface.co/spaces/RasterScan/Automated-Floor-Plan-Digitalization) | none (repo); the SDK needs `/activate_machine` for a "lifetime license" | 96 / pushed 2025-06-17 | CPU Docker image `rasterscan/floor-plan-recognition:latest-cpu` | CPU Docker | Unknown | The Space posts the image to a hidden `BACKEND_URL/raster-to-vector-base64` and returns `doors`, `walls`, `rooms`, `area` and `perimeter` ([app.py](https://huggingface.co/spaces/RasterScan/Automated-Floor-Plan-Digitalization/blob/main/app.py)). The Space was "RUNNING" on 2026-09-19 | Not published |
| CubiCasa5k-Next (clean-room re-implementation) | [Lqm1/CubiCasa5k-Next](https://github.com/Lqm1/CubiCasa5k-Next) | Apache-2.0 | 0 / pushed 2026-09-17 | No released checkpoint found in the README | Python 3.13, PyTorch 2.x, `uv sync --extra cpu` supported ([README](https://github.com/Lqm1/CubiCasa5k-Next)) | CubiCasa | CubiCasa-style | You would have to train it |

**B. Door, window and stair detectors with public weights**

| Option | Link | Licence | Classes | Framework / Mac | Reported metrics |
|---|---|---|---|---|---|
| RT-DETRv2 floorplan v2 | [HF Voix7/rtdetrv2-floorplan-v2](https://huggingface.co/Voix7/rtdetrv2-floorplan-v2) | Apache-2.0 | `window`, `door`, **`stair`** ([config.json](https://huggingface.co/Voix7/rtdetrv2-floorplan-v2/blob/main/config.json)) | HF `transformers`, base `PekingU/rtdetr_v2_r50vd`. Should run on CPU or MPS (not tested) | mAP 0.666, mAP50 0.758. Per class: window 0.771, door 0.685, stair 0.542. **mAP small 0.552 vs medium 0.806**. Training set is "an unknown dataset" ([card](https://huggingface.co/Voix7/rtdetrv2-floorplan-v2)) |
| FloorCAD YOLOv8n detect / seg | [mudasir13cs/floorcad-yolov8n-detect](https://huggingface.co/mudasir13cs/floorcad-yolov8n-detect), [-seg](https://huggingface.co/mudasir13cs/floorcad-yolov8n-seg) | AGPL-3.0 | 35 FloorPlanCAD classes, including door, window, wall, `stair`, `elevator`, `escalator` | Ultralytics, `imgsz=640` | Detect: P 0.794, R 0.714, mAP50 0.770, mAP50-95 0.671, on its own rasterized FloorPlanCAD split ([card](https://huggingface.co/mudasir13cs/floorcad-yolov8n-detect)) |
| Roboflow Universe datasets / models | e.g. [Floor Plan Walls](https://universe.roboflow.com/testing-daidy/floor-plan-walls) (3,395 images; door, window, wall), [window detection](https://universe.roboflow.com/bytetrooper/window-detection-in-floor-plans) (4,000 images), [Wall FloorPlan](https://universe.roboflow.com/floorplanproject-ngpdl/wall-floorplan) (960), [Floor Plans](https://universe.roboflow.com/muhammad-anas-i2dav/floor-plans-njqjm) (100; door, doubleDoor, window, doubleWindow), [detecting doors](https://universe.roboflow.com/keerthi-edrbd/detecting-doors-from-floor-plan/model/2) | Per dataset (not verified: the pages returned HTTP 403 to my fetcher) | door, window, wall | Hosted inference API. **Weight download is not on the free tier**; Basic and Growth plans have had "Download Weights" since February 2025 ([Roboflow changelog](https://docs.roboflow.com/changelog/februrary-2025/download-trained-model-weights-from-roboflow); [docs](https://docs.roboflow.com/models/model-weights/download-roboflow-model-weights)). Datasets can be exported to train your own YOLO | Not verified (sizes from [search listing](https://universe.roboflow.com/search?q=class:door)) |
| HF Space: Mask R-CNN vectorizer | [Dharini27/floorplan-vectorizer](https://huggingface.co/spaces/Dharini27/floorplan-vectorizer) | n/a | rooms, walls, doors, windows as COCO annotations | Docker Space, **PAUSED** as of 2026-09-19 | n/a |

**C. Domain and resolution evidence relevant to presentation drawings**
- CubiCasa5K is the only public training set above that includes coloured plans (276 "colorful" images). It spans source resolutions from 50 to 8000 px, against 96–1920 px for Liu et al.'s R2V set. — [CubiCasa5K paper](https://arxiv.org/abs/1904.01920)
- CubiCasa trained with random 256×256 crop or scale for the first 100 epochs, then continued "dropping the augmentation that resizes the image to 256x256", i.e. at native resolution. — [CubiCasa5K paper](https://arxiv.org/abs/1904.01920)
- CubiCasa ground truth is noisy. Re-scoring a fixed checkpoint against corrected annotations ("skv4") raised wall F1 from 0.74 to 0.825. Reading an unused "opening heatmap" raised opening F1 from 0.25 to 0.64 without retraining. — [fpvec-lab README](https://github.com/Cyprinus12138/fpvec-lab), accompanying [arXiv 2608.25608](https://arxiv.org/abs/2608.25608) (Aug 26, 2026). The paper exists, but these numbers come from the 1-star repo README (which still contains a TODO), so treat them as preliminary.
- Out-of-domain generalization: zero-shot wall F1 on the ResPlan-FP benchmark is 0.62–0.69 for trained networks, against 0.915–0.968 after fine-tuning. — [fpvec-lab README](https://github.com/Cyprinus12138/fpvec-lab)
- The CubiCasa5K dataset licence is stated as CC BY-NC 4.0 in the [repo LICENSE](https://github.com/CubiCasa/CubiCasa5k) and in [mudasir13cs's card](https://huggingface.co/mudasir13cs/qwen25-vl-3b-floorplan-grpo). fpvec-lab calls it CC BY-NC-SA 4.0 ([README](https://github.com/Cyprinus12138/fpvec-lab)). The repo LICENSE is the primary source.

**D. Upscaling**
- Stacking super-resolution (SRCNN, FSRCNN, EDSR, LapSRN) before CubiCasa improved results by "approximately 12%" on average over 100 CubiCasa images smaller than 800×800. — [rbg-research README](https://github.com/rbg-research/Floor-Plan-Detection)
- The same group's paper reports "an improvement of 39.47% in object detection over the vanilla network" in the best case. — [arXiv 2112.09844](https://arxiv.org/abs/2112.09844). A search snippet of the full paper says room detection improves significantly while icon detection "experiences a slight drop" — [academia.edu copy](https://www.academia.edu/122172621/Enhanced_Object_Detection_in_Floor_plan_through_Super_Resolution) (snippet only). Those two statements partly conflict for doors and windows.
- Real-ESRGAN: BSD-3-Clause, 36,840 stars, last commit 2024-04-02. Release v0.2.5.0 ships `realesrgan-ncnn-vulkan-20220424-macos.zip` (no CUDA needed) and `realesr-general-x4v3.pth`. — [xinntao/Real-ESRGAN releases](https://github.com/xinntao/Real-ESRGAN/releases)
- I found **no study of Real-ESRGAN (or any GAN super-resolution) on architectural line drawings.** — searched; see Gaps

### Inferences
- **Downscaling is the biggest obstacle for learned models on E7.** Applying their fixed inputs to the full 2000 px sheet gives these door widths: TF2DeepFloorplan (512) about 3 px; Yytsi / MitUNet (512) about 3 px; Raster2Seq (256) about 1.5 px. The practical fix is **native-resolution tiles** of about 512 px, which is about 37 m square at 13.75 px/m, with overlap. That keeps doors at about 12 px, roughly the scale these models see on residential plans. CubiCasa's hourglass network is fully convolutional and was fine-tuned without resizing, so it can probably take large native crops directly (memory permitting).
- Tiling breaks room-polygon models such as Raster2Seq: large E7 rooms (atria, labs, corridors) cross tile boundaries and would need stitching. Pixel-mask models (Yytsi, MitUNet, CubiCasa segmentation heads) tile and stitch cleanly. That favours **mask, then contour vectorization** over polygon-sequence models for E7.
- Coloured fills, furniture and labels are out of distribution for everything except CubiCasa's small colourful subset. Expect furniture strokes to be classified as walls. A colour-to-grey or "keep only dark ink" pre-filter before inference is likely to help (not tested).
- Setup estimates for someone who knows Python (mine):
  - Yytsi on the M3: **30–60 min** to first mask.
  - CubiCasa via the rbg-research fork on Colab: **1–3 h**.
  - Raster2Seq on Colab (compiling CUDA ops): **2–4 h**.
  - TF2DeepFloorplan on the M3: **1–2 h**, plus the risk that the Google Drive weights are gone.
  - RT-DETRv2 or FloorCAD YOLO: **20–40 min**.
  - Raster-to-Graph, FloorPlanTo3D-API, FloorplanTransformation, and RoomFormer/HEAT/PolyRoom/FRI-Net: **half a day or more, or not at all.** Skip them.
- Upscaling: the best evidence (12% average) comes from images smaller than 800 px, where objects fall below the models' working scale. E7 is 2000 px, but its per-metre density is low. Super-resolution is worth an A/B test only on tiles. A GAN upscaler may invent or soften 1–3 px partition lines, so plain 2× Lanczos plus thresholding is the safer default for tracing (untested).

### Gaps
- I could not open Roboflow Universe pages (HTTP 403), so their licences, mAP and image styles are unverified.
- There are no per-class or test-set metrics for Yytsi (its 0.983 mIoU is validation-only and dominated by the floor class). TF2DeepFloorplan and MitUNet accuracy figures were not retrieved.
- I did not verify whether Raster2Seq's deformable-attention ops have a CPU/MPS fallback. Deformable-DETR has a pure-PyTorch reference path, but I did not check whether this repo can use it.
- I found no public stair **vectorizer**. Only the detectors (RT-DETRv2, FloorCAD) have a stair class.
- The official FloorplanVLM weights and code were not found (see Q2).

---

## 2. VLM-based vectorization in 2025–2026: can GPT-5.x, Gemini 3 or Claude output wall segments or SVG from a plan image reliably?

### Takeaway
There is now one quantitative zero-shot measurement of a frontier VLM emitting wall geometry. **Gemini 3.1 Pro scored wall F1 0.811 at a loose tolerance but 0.472 at a tight one** on rendered residential plans. It is good enough for topology and rough layout, not for metric wall lines. The published pattern that works is hybrid: a CV or learned model proposes geometry, and the VLM enforces constraints, reads labels and scale, and flags errors. Raster2Seq ships exactly that step, run through the Gemini CLI. Scale reading is still where agents lose most accuracy.

### Cited Findings
- **Gemini 3.1 Pro zero-shot, walls:** on a 200-plan subset of ResPlan-FP, "LLM zero-shot (Gemini 3.1 Pro …) 0.811 @ 0.05 / 0.472 @ 0.015" wall F1. For comparison: zero-shot trained networks 0.621–0.688 at 0.05, fine-tuned wall-first model 0.968. — [fpvec-lab README](https://github.com/Cyprinus12138/fpvec-lab) (paper [arXiv 2608.25608](https://arxiv.org/abs/2608.25608); the arXiv abstract does not mention the LLM track, so this number is only in the README)
- **VLM as refiner, not generator:** Raster2Seq's `vlm_refinement/` post-processes model predictions with the Gemini CLI, because "CubiCasa5K has noisy GT annotations". It reports that geometric constraints "can [be enforced] via a VLM-based vectorization refinement". — [Raster2Seq vlm_refinement README](https://github.com/Cornell-VAILab/Raster2Seq/tree/master/vlm_refinement)
- **Scale is the dominant error for agents:** in a July 2026 micro-eval (15 plans × 4 runs, computing apartment area from dimension labels), average error was GPT-5.5 (Codex CLI) 23.2%, Claude Opus 4.8 13.2%, Claude Fable 5 6.5%. "The error was >70% from scale and <30% from marking." The author would "still not trust current agents with this work if I needed good accuracy." — [Kerrick Staley blog](https://kerrickstaley.com/2026/07/01/floor-plan-area-micro-eval)
- **Fine-tuned small VLMs (community):**
  - [mudasir13cs/qwen25-vl-3b-floorplan-grpo](https://huggingface.co/mudasir13cs/qwen25-vl-3b-floorplan-grpo): a LoRA on Qwen2.5-VL-3B following the FloorplanVLM method. It uses SFT, then GRPO with rewards for "JSON validity, outer-wall IoU, room IoU" on CubiCasa-derived JSON. The card is tagged Apache-2.0 but intended for non-commercial use. 570 downloads, no evaluation numbers on the card.
  - [rimashussain/gemma4-cubicasa-floorplan](https://huggingface.co/rimashussain/gemma4-cubicasa-floorplan): a Gemma-4-E4B fine-tune with Q4_K_M GGUF and mmproj files, so it can run locally via llama.cpp or Ollama. No evaluation numbers.
  - Neither card reports accuracy. I found no official FloorplanVLM code repo; the only GitHub hit, [miladmirzazadeh/FloorPlanVLM](https://github.com/miladmirzazadeh/FloorPlanVLM), has 3 stars and is unverified.
- **Agentic multi-step parsing:** a self-correcting multi-agent pipeline turns plan images into a spatial knowledge graph for navigation. Route success on MP-1 was 92.31/76.92/61.54% (short/medium/long) against 84.62/69.23/53.85% for a Claude 3.7 Sonnet baseline. There are **no wall or door geometry metrics**. — [arXiv 2604.23970](https://arxiv.org/abs/2604.23970)
- **Perception versus judgement split:** a practitioner using Gemini 3.x Flash-Lite on floor plans kept Gemini for "what is physically in this drawing" and did all judgement in code. On 42 synthetic plans, compass-orientation answers were 39/42 exact and 3/42 one step off. This was semantic, not geometric. — [DEV Community post](https://dev.to/shivam_garg5/gemini-reads-the-floor-plan-code-decides-what-it-means-ojl)
- **Gemini native boxes:** Gemini returns detection boxes as `[y0, x0, y1, x1]` normalized to 0–1000 — [Nipun Batra, Gemini 3 Pro multimodal post](https://nipunbatra.github.io/blog/posts/2025-12-01-gemini-api-multimodal.html) (via search snippet). Gemini structured output enforces a JSON schema — [oneuptime guide](https://oneuptime.com/blog/post/2026-02-17-how-to-use-gemini-structured-output-and-json-mode-for-reliable-data-extraction/view).
- **Hobby "Gemini to walls JSON to Three.js" repos exist but publish no accuracy:** [Moni-King-Dev/3DFloorplanner](https://github.com/Moni-King-Dev/3DFloorplanner) (0 stars), [Divak-ar/floorData](https://github.com/Divak-ar/floorData) (4 stars).
- **Vendor preprocessing advice for AI plan recognition:** "Crop the image: Remove extra white space or borders … Increase Contrast … make the walls darker and the background whiter". Planner 5D's AI also requires dimensions on the plan. — [Planner 5D help](https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan)
- Already covered in the earlier note, not repeated: AECV-Bench, DocEng 2025 few-shot symbol prompting, the SVG-decomposition study ([arXiv 2511.03478](https://arxiv.org/abs/2511.03478)), and FloorplanVLM.

### Inferences
- If "0.05 / 0.015" are fractions of image size (not confirmed), then on E7's roughly 145 m sheet the tight tolerance is about 2 m and the loose one about 7 m. At that scale, a VLM's wall lines are sketch-grade. Use the VLM for: (a) reading room names and numbers and the scale bar; (b) cropping E7 away from E5/E6; (c) proposing door and stair locations as boxes on native-resolution tiles; (d) critiquing a rendered overlay of CV output. Do not use it to emit wall coordinates.
- **Tiling trick:** send crops of about 500–700 px at native resolution with a coordinate offset, ask for boxes in the crop's normalized frame, and re-project them. This avoids the provider's internal downscaling of a 2000 px image (see Gaps) and keeps doors at about 12 px or larger. Overlap tiles by one door width or more, and de-duplicate by IoU.
- A render-and-compare loop (draw the proposed vectors over the plan, send both back, ask for corrections) is the pattern shared by Raster2Seq's VLM refinement, CAD2BIM and Ortho2CAD. It is the most defensible "AI" story for judges.

### Gaps
- The tolerance unit in the fpvec-lab table is not stated in the README. The paper PDF was not read.
- I did not re-verify each provider's current image downscaling limits for GPT-5.x, Gemini 3.x and Claude in September 2026. Older documented limits downscaled large images well below 2000 px. Check current docs before sending full sheets.
- I found no benchmark of VLMs emitting SVG for floor plans specifically. General "LLM SVG" leaderboards measure drawing from text, not tracing.

---

## 3. Classical CV: morphological wall extraction, Hough/LSD, OpenCV pipelines, potrace/Inkscape, and classical door-arc and window detection

### Takeaway
The classical recipe is decades old and still the quickest thing to control:
- binarize and remove text and colour;
- use morphological opening with line-shaped kernels to keep thick strokes (walls);
- use Hough or LSD for line segments, then group parallel pairs into wall centrelines with thickness;
- use arc or quarter-circle detection for door swings;
- windows appear as parallel thin triple lines inside a wall.

For E7's presentation drawings, the **coloured room fills are an asset**: colour clustering gives room polygons almost directly, and walls are the dark ink between fills. General-purpose tracers (potrace, vtracer) produce outlines, not semantic walls. They help with regions but do not give centrelines.

### Cited Findings
- Macé et al. (DAS 2010): walls are found by grouping Hough-detected lines "that satisfy specific geometric constraints". "Door hypothesis is detected thanks to the extraction of arcs". Rooms come from recursive decomposition "until getting nearly convex regions". The earlier ScanPlan system also used Hough for walls and doors, assuming convex rooms. — [ACM DL](https://dl.acm.org/doi/abs/10.1145/1815330.1815352); [ResearchGate](https://www.researchgate.net/publication/220933144_A_System_to_Detect_Rooms_in_Architectural_Floor_Plan_Images) (summary via search snippet)
- The unsupervised wall detector of de las Heras et al. (2013) learns wall appearance per plan without labels. — [PDF](https://refbase.cvc.uab.cat/files/HFV2013.pdf)
- Morphological erosion and dilation are used for noise suppression and for separating text from graphics. — [survey, ACM 2025](https://dl.acm.org/doi/10.1145/3747227.3747250) (via search snippet)
- Versailles-FP: wall detection on ancient hand-drawn plans. — [arXiv 2103.08064](https://arxiv.org/pdf/2103.08064)
- **AFPlan** ([cansik/architectural-floor-plan](https://github.com/cansik/architectural-floor-plan)): no licence, 400 stars, last commit 2025-10-27. It combines "Morphological cleaning … Machine Learning and Convex Hull closing" for room detection. It is a Java 11+/Gradle prototype ("not packaged into an executable"). — [README](https://github.com/cansik/architectural-floor-plan)
- **FloorplanToBlender3d:** OpenCV pipeline, GPL-3.0, 623 stars, last commit 2024-10-09. Docker on Ubuntu 18.04. The earlier note records that detection needs small images. — [repo](https://github.com/grebtsew/FloorplanToBlender3d)
- **Mask to vector post-processing** that works: morphological closing, then `cv2.findContours` with CCOMP (so wall rings keep doorway holes), Douglas–Peucker simplification, and dropping speckle. — [Yytsi/floorplan-to-3d README](https://github.com/Yytsi/floorplan-to-3d). CubiCasa's post-processor builds a wall skeleton from junction heatmaps, prunes it with the wall mask, and infers each wall's width "by sampling along the wall lines and inspecting the intensity profile". Openings are accepted only if their endpoints fall inside the wall mask. — [CubiCasa5K paper](https://arxiv.org/abs/1904.01920)
- **vtracer:** MIT, 7,066 stars, last commit 2026-09-17. Release 1.0.0-alpha.4 (2026-08-29) ships `vtracer-aarch64-apple-darwin` and a universal macOS `.dmg`. The PyPI package `vtracer` is at 0.6.15. It handles **colour** images (unlike potrace), with `--mode polygon`, `--hierarchical stacked|cutout`, `--filter-speckle`, and binary `--threshold` / `--adaptive`. — [repo README and releases](https://github.com/visioncortex/vtracer), [PyPI](https://pypi.org/project/vtracer/)
- **potrace:** Homebrew stable 1.16 ("Convert bitmaps to vector graphics"). Python bindings `potracer` 0.0.4 (GPLv2+) and `pypotrace` 0.3 (GPL). — [potrace site](https://potrace.sourceforge.net/); [PyPI potracer](https://pypi.org/project/potracer/); [PyPI pypotrace](https://pypi.org/project/pypotrace/)

### Inferences
- **Suggested E7 classical pipeline** (my design, not from a source):
  1. Crop E7 manually or with a VLM bounding box.
  2. k-means colour quantization, then treat each fill colour's connected components as candidate room polygons. Simplify them with `approxPolyDP` at about 0.5 m (7 px) tolerance.
  3. Build a dark-ink mask with an HSV value threshold and subtract text. Text can be found with OCR boxes, or with connected components of character size, which is about 2–5 px tall at 1:500 and may already be unreadable.
  4. Open the mask with horizontal and vertical kernels (for example 1×15 and 15×1) to keep wall runs and drop furniture and hatching.
  5. Skeletonize, then run LSD or probabilistic Hough to get centreline segments. Thickness comes from a distance transform at the skeleton.
  6. Find doors as gaps of 8–20 px in a wall run between two room fills that belong to the same corridor or room graph edge. At 12 px, swing arcs are too small for reliable Hough-circle fitting.
  7. Take windows along exterior walls from the façade/section or as uniform curtain-wall runs, not from symbols.
- Door arcs at 1:500 have a radius of about 12 px and are drawn with roughly 1 px strokes, and JPEG artifacts compete with them. "Gap in wall between two rooms" is a more robust door cue at this scale than arc detection.
- potrace traces the **outline** of ink blobs, so a wall becomes a thin closed polygon around both faces. vtracer's colour-region mode is more useful for the room fills. Neither yields centreline plus thickness without extra processing.
- Estimated time to build this pipeline: **2–4 h** for someone fluent in OpenCV, then about 5–15 min of parameter tuning per new floor.

### Gaps
- I found no recent (2023–2026) paper benchmarking classical pipelines against learned ones on presentation-style plans.
- The window-symbol conventions used in Perkins&Will's ArchDaily plates were not checked. Someone needs to look at the actual E7 JPGs.

---

## 4. Human-in-the-loop tools for fast manual tracing, and realistic minutes per floor for an 8-floor building

### Takeaway
Manual tracing is the most reliable route and fits a 22-hour window if scope is controlled. The published time anchors are:
- trained CubiCasa annotators with a custom CAD tool: **5–120 minutes per plan**, covering walls, openings, rooms and icons, with two-stage QA;
- a two-bedroom apartment in Floorplanner: **20–40 minutes** (vendor-adjacent blog).

QGIS (georeference, then digitize with snapping and the Advanced Digitizing panel) has a published indoor-map workflow that is exactly this task. CVAT and Label Studio handle polygon and polyline labelling, but they do not snap to walls. Planner 5D's automatic "upload a plan" takes 10 minutes to 24 hours and needs dimensions, so it is not usable here.

### Cited Findings
- CubiCasa5K annotation "took from 5 to 120 minutes, depending on the complexity and clearness of the source and amount of floors". It used "a special CAD tool tailored for drawing floorplans" and a two-round QA process. — [CubiCasa5K paper](https://arxiv.org/abs/1904.01920)
- Floorplanner uses the uploaded image "as a static background — it doesn't auto-detect walls". Uploads must be JPG, PNG or PDF, under 10 MB, at least 150 dpi. Scale calibration is where users stumble. "A standard two-bedroom apartment takes 20–40 minutes to fully trace." — [Coohom article](https://www.coohom.com/article/how-to-upload-a-2d-floor-plan-to-floorplanner) (Coohom is a competing product, so treat as indicative)
- Planner 5D "Upload a Plan": most uploads are processed "within 10 minutes to 24 hours". The plan "should include dimensions", and the AI places "only basic furniture like beds, bathrooms, tables, doors". — [Planner 5D help: processing time](https://support.planner5d.com/en/articles/13205006-upload-a-plan-processing-time); [how to upload](https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan)
- QGIS indoor-map digitizing, from the WRLD indoor maps API tutorial: georeference the plan image, set snapping to "All layers", "To vertex and segment", tolerance "around 12 px", and enable the Advanced Digitizing Toolbar and Panel. "A good first step is to create the walls and windows around the outside of the floor." — [WRLD TUTORIAL.md](https://github.com/wrld3d/wrld-indoor-maps-api/blob/master/TUTORIAL.md); also [QGIS Tutorials: digitizing basics](https://www.qgistutorials.com/en/docs/3/digitizing_basics.html)
- Other trace-over-image tools with documented workflows: [Home Designer](https://www.homedesignersoftware.com/support/article/KB-00150/importing-resizing-and-tracing-over-an-image-or-pdf-of-a-floor-plan-in-home-designer.html), [DesignFiles](https://intercom.help/designfiles/en/articles/6496132-trace-floor-plan-images-to-create-a-3d-space), [magicplan](https://help.magicplan.app/import-and-digitalize-an-existing-floor-plan), [PlanningWiz](https://planningwiz.com/knowledgebase/how-to-upload-background-plan/), [Trane TRACE 3D Plus image import](https://trace3dplus.help.trane.com/floor_plan_image_import_tools.html).
- Labelling tools: [CVAT](https://github.com/cvat-ai/cvat) (MIT, 16,748 stars, pushed 2026-09-19) and [Label Studio](https://github.com/HumanSignal/label-studio) (Apache-2.0, 28,295 stars, pushed 2026-09-19). Both are active.

### Inferences
- **Minutes per floor for E7 (my estimate):**
  - Walls as centreline polylines with thickness, plus door positions only, in QGIS or a small custom web tool with 13.75 px/m calibration, orthogonal snapping and vertex snapping: about **30–60 min per unique floor**.
  - Adding room polygons with labels: +15–30 min. This drops to about 5–10 min if they come from the colour-fill pass in Q3.
  - Stairs and elevators as boxes: about 5 min.
  - If the upper floors share a typical plan, copy and edit them in about 10–15 min each.
  - Rough total for 8 floors: about **4–7 person-hours**. That is parallelizable across 2–3 people if everyone uses one shared schema and the same calibration.
- A custom "click to trace" page is likely faster than QGIS for this team. The page would: load the tile; click two points on the scale bar; draw walls with shift-orthogonal snapping and a thickness preset (interior 0.2 m, exterior 0.4 m); click on a wall to place a 0.9 m door; export JSON in the team's existing spec. It avoids GIS CRS set-up and exports straight into the hologram schema. My build estimate is 1.5–3 h with three.js or canvas.
- Inkscape (pen tool plus grid snapping plus Trace Bitmap) and Blender (reference image plus vertex snapping) also work. However, exporting their SVG or mesh into a wall-thickness schema needs a converter. QGIS exports GeoJSON, which is easy to parse.
- The strongest overall workflow is a **pre-fill plus correct loop**. Auto-generate candidate rooms (colour fills) and wall centrelines (classical CV or the Yytsi mask), load them as editable layers, and have a human fix them. The fpvec-lab paper's "edit-cost metric" (human correction effort) formalizes this ([README](https://github.com/Cyprinus12138/fpvec-lab)).

### Gaps
- There is no published minutes-per-floor figure for large institutional plans. All E7 timings here are estimates.
- I did not verify whether CVAT or Label Studio's Segment-Anything interactors work on thin line-art walls, or whether any "click to trace walls" web tool snaps to detected ink lines.
- Arcada, SketchUp image import and the Blender floor-plan add-ons were not researched this session.

---

## 5. What does the literature say about the minimum resolution or scale at which doors and windows are detectable?

### Takeaway
No paper I found states a minimum pixels-per-metre or pixels-per-door threshold. The indirect evidence all points the same way: doors and windows are the classes that fail first (doors are the worst icon class in CubiCasa, and doors and windows made up 52% of false negatives in an earlier detector study), and small objects score much lower. E7's roughly 12 px doors are in the COCO "small" object range (under 32×32 px), where published floor-plan detectors lose about 25 mAP points. So **detecting doors at native resolution is borderline, and anything that downsamples first will fail.**

### Cited Findings
- CubiCasa5K per-class test IoU, raw / after polygonization: **door 53.6 / 41.2, window 66.8 / 40.9**, against wall 73.0 / 47.9 and background 87.3 / 79.2. — [CubiCasa5K paper Table 4](https://arxiv.org/abs/1904.01920)
- In an object-detection study on floor plans, doors and windows accounted for 52% of false negatives "despite a strong sample presence in the training set". — [Ziran & Marinai, "Object Detection in Floor Plan Images"](https://www.academia.edu/70039056/Object_Detection_in_Floor_Plan_Images) (via search snippet)
- An RT-DETRv2 floor-plan detector reports **mAP small 0.552 vs mAP medium 0.806** (COCO size buckets), and recall small 0.744 vs medium 0.926. — [Voix7/rtdetrv2-floorplan-v2 card](https://huggingface.co/Voix7/rtdetrv2-floorplan-v2)
- Super-resolution on low-resolution (<800 px) CubiCasa plans improves detection by about 12% on average ([rbg-research](https://github.com/rbg-research/Floor-Plan-Detection)) and by up to 39.47% in the best case ([arXiv 2112.09844](https://arxiv.org/abs/2112.09844)). This implies the models were resolution-starved on those inputs.
- Raster2Seq "occasionally fails to accurately localize windows and doors, resulting in artifacts such as cross-over windows", even at its native 256 px input. — [arXiv 2602.09016](https://arxiv.org/html/2602.09016)
- The same network's opening F1 depended heavily on readout: 0.25 rose to 0.64 by reading the opening heatmap. — [fpvec-lab](https://github.com/Cyprinus12138/fpvec-lab)
- Dataset resolution ranges: CubiCasa5K 50–8000 px, R2V 96–1920 px, CVC-FP 905–7383 px, R-FP-500 56–1427 px. — [CubiCasa5K paper Table 1](https://arxiv.org/abs/1904.01920)
- Planner 5D and Floorplanner both ask for at least about 150 dpi and high contrast for automatic or assisted import. — [Coohom/Floorplanner](https://www.coohom.com/article/how-to-upload-a-2d-floor-plan-to-floorplanner); [Planner 5D](https://support.planner5d.com/en/articles/14434484-how-to-upload-a-floor-plan)

### Inferences
- E7 at 13.75 px/m:
  - A door is about 12 px wide. Its swing arc has a radius of about 12 px with a stroke of about 1 px.
  - Interior walls are 1.5–3 px thick. JPEG 8×8 block artifacts are the same size as these features.
  - A single-leaf door's box is about 12×12 px, which is COCO "small" (the <32 px bucket). Expect detectors to fall well below their headline mAP.
  - Double doors (about 1.8 m, 25 px) and stair runs (about 1.2–1.5 m wide, 16–20 px, several metres long) are more detectable.
- Practical rule of thumb (inference): **infer doors from topology** (gaps in walls between adjacent spaces) rather than from symbols. Treat any symbol detector's output as proposals to confirm. Stairs are few in E7 (a handful of cores), so place them manually.
- If a higher-resolution source exists (the ArchDaily "original" download link, a Perkins&Will PDF, or UW Plant Operations plans), it is worth more than any upscaler. Doubling px/m raises doors to about 25 px, into the range where the tables above look better.

### Gaps
- There is no controlled study that varies px/m and measures door or window F1. This is a genuine gap in the literature as far as I could find.
- I did not verify whether ArchDaily serves a higher-resolution original of these E7 plates.

---

## 6. Overall: ranked options for the E7 drawings in about 22 hours (the objective)

### Takeaway
Rank by *probability of a correct 8-floor model by freeze*, not by paper SOTA:
1. **Semi-automatic classical pre-fill plus human correction**: colour-fill rooms, ink-mask wall centrelines, doors from wall gaps, then corrected in QGIS or a small custom tracer.
2. **Pure manual tracing** with scale calibration and snapping (about 4–7 person-hours).
3. **Yytsi UNet on native tiles** as a wall/door/window mask proposer (runs on the M3).
4. **CubiCasa5K via the rbg-research fork on Colab** (walls with thickness, openings and rooms in one pass).
5. **A VLM on tiles** for labels, scale, the E7 crop, door and stair proposals, and render-compare QA.
6. **Door/window/stair detectors** (RT-DETRv2, FloorCAD YOLO).
7. **Raster2Seq on Colab**: rooms, doors and windows, no walls; tiles break rooms.
8. **TF2DeepFloorplan**: masks only.

Do not attempt: FloorplanTransformation, FloorPlanTo3D-API, Raster-to-Graph, RoomFormer, HEAT, PolyRoom, FRI-Net, MuraNet (no code), FloorplanVLM (no official weights), or Planner 5D (turnaround up to 24 h).

### Cited Findings (the facts behind the ranking; see Q1–Q5 for details)

| Rank | Option | Licence | Stars / last commit | Weights | Runs on M3? | Handles E7-style input? | Outputs | Accuracy evidence | Setup (my estimate) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Classical colour + ink pipeline ([OpenCV](https://github.com/opencv/opencv); [vtracer](https://github.com/visioncortex/vtracer) MIT 7,066★ 2026-09-17) plus human correction | MIT / Apache | n/a | none needed | Yes (native arm64 binaries) | Coloured fills help. Tuned per sheet | Room polygons, wall centrelines with thickness, doors from gaps | No benchmark. Classical methods documented in [Macé 2010](https://dl.acm.org/doi/abs/10.1145/1815330.1815352) | 2–4 h build, then 20–45 min per floor correcting |
| 2 | Manual: [QGIS workflow](https://github.com/wrld3d/wrld-indoor-maps-api/blob/master/TUTORIAL.md) or a custom web tracer | GPL (QGIS) / own | n/a | n/a | Yes | Yes, fully | Whatever the schema needs | Human; CubiCasa pros took 5–120 min per plan ([paper](https://arxiv.org/abs/1904.01920)) | 0.5 h (QGIS) or 1.5–3 h (custom tool); about 30–60 min per unique floor |
| 3 | [Yytsi/floorplan-to-3d](https://github.com/Yytsi/floorplan-to-3d) | MIT (trained on NC data) | 23 / 2026-05-13 | [HF, 98 MB](https://huggingface.co/Yytsi/floorplan-to-3d-walls) | Yes, CPU or MPS per README | Residential, 512 px letterbox; must tile | Wall, door and window masks, then contour polygons | Validation mIoU 0.983 (4 classes, floor-dominated) | 30–60 min |
| 4 | CubiCasa5K via [rbg-research fork](https://github.com/rbg-research/Floor-Plan-Detection) | CC BY-NC 4.0 weights; fork MIT | 589 / 2019-05-24; fork 120 / 2026-03-16 | [Google Drive](https://github.com/CubiCasa/CubiCasa5k) | Colab preferred; the fork has a CPU fallback | Residential incl. 276 colourful plans; fully convolutional | **Wall polygons with width**, doors and windows, rooms, icons (no stairs) | Test IoU: wall 73.0, door 53.6, window 66.8 ([paper](https://arxiv.org/abs/1904.01920)) | 1–3 h |
| 5 | Frontier VLM on tiles (Gemini 3.x Pro, GPT-5.x, Claude) with a JSON schema | API | n/a | n/a | API | Reads labels well; symbols poorly | Labels, scale, boxes, QA critiques | Gemini 3.1 Pro wall F1 0.811 @0.05, 0.472 @0.015 ([fpvec-lab](https://github.com/Cyprinus12138/fpvec-lab)); agent area error 6.5–23.2%, mostly from scale ([Staley](https://kerrickstaley.com/2026/07/01/floor-plan-area-micro-eval)) | 30–90 min |
| 6 | [RT-DETRv2 floorplan](https://huggingface.co/Voix7/rtdetrv2-floorplan-v2) / [FloorCAD YOLOv8n](https://huggingface.co/mudasir13cs/floorcad-yolov8n-detect) / [Roboflow](https://universe.roboflow.com/testing-daidy/floor-plan-walls) datasets | Apache-2.0 / AGPL-3.0 / varies | HF 2026-07 / 2026-08 | Yes / Yes / paid tier only | Yes (transformers, ultralytics) | Unknown style / CAD-style / mixed | Door, window and **stair** boxes | mAP 0.666 (small 0.552) / mAP50 0.770 | 20–40 min (+1–2 h to train on Roboflow data) |
| 7 | [Raster2Seq](https://github.com/Cornell-VAILab/Raster2Seq) | MIT | 57 / 2026-06-02 | [HF](https://huggingface.co/haopt/Raster2Seq) | No (CUDA ops) → Colab | Residential, 256 px; tiling breaks rooms | Room polygons with labels, door and window polygons | CubiCasa Room F1 88.7; WAFFLE zero-shot IoU 73.9 ([arXiv](https://arxiv.org/html/2602.09016)) | 2–4 h |
| 8 | [TF2DeepFloorplan](https://github.com/zcemycl/TF2DeepFloorplan) | GPL-3.0 | 267 / 2023-06-01 | Google Drive (flagged unreliable) | Yes (`tfmacm1` extra) | Resizes to 512 | Boundary and room-type masks | Not retrieved | 1–2 h |
| — | Skip: [FloorplanTransformation](https://github.com/art-programmer/FloorplanTransformation) (Torch7/Py2.7), [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) (Py3.6), [Raster-to-Graph](https://github.com/SizheHu/Raster-to-Graph) (Py3.7/cu111/Windows), [RoomFormer](https://github.com/ywyue/RoomFormer), [HEAT](https://github.com/woodfrog/heat), [PolyRoom](https://github.com/3dv-casia/PolyRoom), [FRI-Net](https://github.com/Daisy-1227/FRI-Net) (density maps, CUDA), MuraNet (no code), [RasterScan](https://github.com/RasterScan/Floor-Plan-Recognition) (licence-activated commercial SDK; its [Space](https://huggingface.co/spaces/RasterScan/Automated-Floor-Plan-Digitalization) is fine for a 5-minute curiosity test), [Planner 5D](https://support.planner5d.com/en/articles/13205006-upload-a-plan-processing-time) (10 min–24 h) | | | | | | | | |

### Inferences
- **Recommended 22-hour plan:**
  1. **Hour 0–1:** crop E7 from each sheet. Calibrate 13.75 px/m from the scale bar or a known dimension, since agents' errors are mostly scale ([Staley](https://kerrickstaley.com/2026/07/01/floor-plan-area-micro-eval)). Decide on the schema.
  2. **Hours 1–4:** build the colour-fill and ink-mask pre-fill. In parallel, spend 30–60 min on Yytsi-on-tiles to see whether its wall mask beats the classical ink mask on one floor. Keep whichever is cleaner.
  3. **Hours 4–10:** 2–3 people correct floors in QGIS or a small tracer.
  4. Use a VLM on native tiles to read room labels and propose doors and stairs. Humans confirm them.
  5. Heights come from the perspective section, not from any of these tools.
- **For the pitch:** show the pipeline honestly as "CV and ML propose, a VLM checks, a human confirms". This matches both the benchmark evidence (AECV-Bench, fpvec-lab) and the fpvec-lab "edit-cost" framing.
- **Licensing:** every CubiCasa-trained weight (Yytsi, MitUNet, CubiCasa, Raster2Seq-cc5k, the mudasir LoRAs) inherits non-commercial terms from the dataset, whatever the repo licence says. That is fine for a hackathon demo; note it if the project continues.

### Gaps
- None of these tools was run on the actual E7 JPGs. A 30-minute bake-off on one floor (Yytsi tile masks versus the classical ink mask versus a Gemini tile pass) is the cheapest way to replace these estimates with facts.
- Stars and dates change daily; these are the 2026-09-19 values.
