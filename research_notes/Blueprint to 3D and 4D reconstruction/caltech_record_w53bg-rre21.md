# Caltech record w53bg-rre21: Omni3D / Cube R-CNN (single-image 3D object detection) and its relevance to Cut Once

Scope: only the work at https://authors.library.caltech.edu/records/w53bg-rre21. Research date: 2026-09-18. The work turns out to be **Omni3D + Cube R-CNN** (Meta AI, CVPR 2023). It is about **detecting objects as 3D boxes from one RGB photo**. It is *not* about drawings, blueprints, CAD, build sequencing, or progress tracking.

## 1. What the record is: title, authors, year, venue, type, abstract, full-text link

### Takeaway
The record is the arXiv preprint "Omni3D: A Large Benchmark and Model for 3D Object Detection in the Wild" (arXiv:2207.10660) by Brazil, Straub, Ravi, Johnson and Gkioxari (plus Abhinav Kumar in the final version). It was published at CVPR 2023. Caltech's repository holds it because co-author Georgia Gkioxari is at Caltech. The record is catalogued as a "Discussion Paper" and includes the full PDF.

### Cited Findings
- **Title:** "Omni3D: A Large Benchmark and Model for 3D Object Detection in the Wild". **Item type on the Caltech record:** Discussion Paper (Open). **Date:** July 21, 2022 (submitted version). **DOI:** 10.48550/arXiv.2207.10660. **Record license:** CC BY-NC-SA 4.0. **Eprint ID:** 118410. **Attached file:** `2207.10660.pdf` (13.1 MB), downloadable at https://authors.library.caltech.edu/records/w53bg-rre21/files/2207.10660.pdf?download=1 — [Caltech record](https://authors.library.caltech.edu/records/w53bg-rre21)
- **Authors on the Caltech record (5):** Garrick Brazil, Julian Straub, Nikhila Ravi, Justin Johnson, Georgia Gkioxari. The abstract there says "97 categories". — [Caltech record](https://authors.library.caltech.edu/records/w53bg-rre21)
- **This matches arXiv v1** (2022-07-21), which lists the same 5 authors and says "97 categories". — [arXiv v1](https://arxiv.org/abs/2207.10660v1)
- **Final version (arXiv v2, 2023-03-24):** 6 authors, adding Abhinav Kumar. The abstract says "98 categories", and the comments field reads "CVPR 2023 | Project website: https://omni3d.garrickbrazil.com/". — [arXiv abs](https://arxiv.org/abs/2207.10660)
- **Affiliations (v2 PDF):** Meta AI (Brazil, Straub, Ravi, Johnson), Michigan State University (Kumar), Caltech (Gkioxari). — [arXiv v2 PDF](https://arxiv.org/pdf/2207.10660v2)
- **Published version:** CVPR 2023 open-access paper "OMNI3D: A Large Benchmark and Model for 3D Object Detection in the Wild". — [CVF Open Access PDF](https://openaccess.thecvf.com/content/CVPR2023/papers/Brazil_Omni3D_A_Large_Benchmark_and_Model_for_3D_Object_Detection_CVPR_2023_paper.pdf). This URL returned HTTP 403 to automated fetch. It was listed in search results but not read directly.
- **Abstract, paraphrased:** Existing 3D detection benchmarks are small and tied to one domain, such as driving scenes. Omni3D re-purposes and merges existing datasets into 234k images with more than 3 million instances in 98 categories. Cube R-CNN is a single unified model built to generalize across cameras and scene types. It beats prior work on Omni3D and on existing benchmarks, and pre-training on Omni3D improves single-dataset results and speeds up learning on small new datasets. — [arXiv abs](https://arxiv.org/abs/2207.10660)
- **Paper with appendix** is also hosted on the project page (`static/omni3d_with_appendix.pdf`). — [Project page](https://omni3d.garrickbrazil.com/)

### Inferences
- When citing, use the CVPR 2023 version with all 6 authors: Brazil, Kumar, Straub, Ravi, Johnson, Gkioxari. The Caltech record reflects the older v1 metadata.
- The word "Omni3D" in the title can suggest general 3D reconstruction. The work is actually narrower: it predicts one 3D bounding box per object from a single photo.

### Gaps
- The Caltech record did not list affiliations or funding. Affiliations above come from the arXiv v2 PDF.
- The CVF open-access PDF could not be fetched (403), so I did not compare it word-for-word with arXiv v2. All numbers below come from arXiv v2.

## 2. Problem, method, inputs/outputs and results (with numbers)

### Takeaway
Problem: find every object in a single RGB image, across many categories and camera types, and output an oriented 3D cuboid for each one. Method: Cube R-CNN, which is Faster R-CNN with an extra "cube head" and a "virtual depth" trick so it works with any camera. Input is an RGB image plus camera intrinsics. Output per object is a category, a 2D box, and a metric 3D cuboid (center, size in meters, 3×3 rotation, confidence). Headline result: 23.3 AP3D on Omni3D, against 15.4 for the best prior method (PGD with a virtual camera).

### Cited Findings
**Dataset (Omni3D)**
- The dataset merges six public datasets: SUN RGB-D, ARKitScenes, Hypersim (indoor); KITTI, nuScenes (urban); Objectron (general). It totals 234k images and about 3M 3D boxes in 98 categories, making it 20× larger than SUN RGB-D (10k images) or KITTI (7k images). — [arXiv v2 PDF](https://arxiv.org/pdf/2207.10660v2)
- Split: 175k train, 19k val, 39k test images. The indoor subset "Omni3D_IN" is SUN RGB-D + Hypersim + ARKit. The outdoor subset "Omni3D_OUT" is KITTI + nuScenes. — [arXiv v2 PDF](https://arxiv.org/pdf/2207.10660v2)
- Evaluation uses the 50 categories with at least 1,000 instances. The released full-Omni3D config lists these 50, and they include **'desk', 'table', 'shelves', 'cabinet', 'bookcase', 'door', 'window', 'counter', 'box', 'chair'**. The indoor config (Omni3D_IN) has 38 classes and also includes 'desk' and 'table'. — [configs/Base_Omni3D.yaml](https://raw.githubusercontent.com/facebookresearch/omni3d/main/configs/Base_Omni3D.yaml); [configs/Base_Omni3D_in.yaml](https://raw.githubusercontent.com/facebookresearch/omni3d/main/configs/Base_Omni3D_in.yaml)
- Label format: camera-centered coordinates (+x right, +y down, +z forward). Each object has a category, 2D box, 3D centroid in meters, 3×3 object-to-camera rotation, and width/height/length in meters. Source images range from 370 to 1920 px in resolution, with focal lengths from 518 to 1708 px. — [arXiv v2 PDF, Appendix A1](https://arxiv.org/pdf/2207.10660v2)

**Method (Cube R-CNN)**
- Built on Faster R-CNN, with three changes:
  - IoUness replaces objectness in the region proposal network, because merged datasets are not exhaustively labeled.
  - A new "cube head" predicts a cuboid for each detected 2D box.
  - Training uses virtual depth.
  — [arXiv v2 PDF, Sec. 4](https://arxiv.org/pdf/2207.10660v2)
- The cube head predicts 13 parameters:
  - projected 3D center [u,v]
  - depth z
  - log-normalized dimensions (w, h, l) in meters
  - a 6D continuous allocentric rotation
  - a 3D uncertainty μ

  The 3D center is computed from [u,v], z and the known intrinsics (fx, fy, px, py). The final confidence is √(s·exp(−μ)). — [arXiv v2 PDF, Sec. 4.1](https://arxiv.org/pdf/2207.10660v2)
- Losses: a chamfer loss on the 8 cuboid corners, plus disentangled per-variable losses and an uncertainty-weighted 3D loss. — [arXiv v2 PDF](https://arxiv.org/pdf/2207.10660v2)
- **Virtual depth:** z_v = z·(f_v/f)·(H/H_v). This rescales depth so every image behaves as if taken by the same camera (f_v = H_v = 512). It also makes scale augmentation during training possible. — [arXiv v2 PDF, Sec. 4.2 and 5](https://arxiv.org/pdf/2207.10660v2)
- Training setup: Detectron2 + PyTorch3D, DLA34-FPN backbone, 128 epochs, batch size 192, on **48 V100 GPUs**. — [arXiv v2 PDF, Sec. 5](https://arxiv.org/pdf/2207.10660v2)
- Metric: AP3D averaged over 3D IoU thresholds from 0.05 to 0.50. The paper also contributes an exact, batched 3D-box IoU that is 90× faster than Objectron's C++ version and 450× faster on CUDA. — [arXiv v2 PDF](https://arxiv.org/pdf/2207.10660v2)

**Results (arXiv v2)**
- **Omni3D test, AP3D:** Cube R-CNN 23.3. Baselines: PGD+vc 15.4, PGD 11.2, FCOS3D+vc 10.6, SMOKE+vc 10.4, ImVoxelNet 9.4. On Omni3D_OUT: Cube R-CNN 31.9 vs PGD+vc 26.8. — [arXiv v2 PDF, Table 2](https://arxiv.org/pdf/2207.10660v2)
- **Ablations on Omni3D (full model 23.3 AP3D):**
  - without virtual depth: 17.3
  - without uncertainty μ: 17.2
  - without scale augmentation: 20.2
  - AP3D at IoU 0.25 is 24.9 and at IoU 0.50 is 9.5
  - near / medium / far objects: 27.9 / 12.1 / 8.5
  - Omni3D_IN: 15.0 AP3D; Omni3D_OUT: 31.9

  — [arXiv v2 PDF, Table 1](https://arxiv.org/pdf/2207.10660v2)
- **KITTI (car, test server, AP3D at IoU 0.7, easy/med/hard):** Cube R-CNN 23.59 / 15.01 / 12.56 vs GUPNet 22.26 / 15.02 / 13.12. — [arXiv v2 PDF, Table 3](https://arxiv.org/pdf/2207.10660v2)
- **SUN RGB-D (10 common categories):** AP3D 34.7 trained on SUN RGB-D alone and 35.4 trained on Omni3D_IN, vs ImVoxelNet 30.6. With oracle 2D boxes, mean IoU3D is 36.2 / 37.8 vs Total3D 23.3. — [arXiv v2 PDF, Table 4](https://arxiv.org/pdf/2207.10660v2)
- **Per-category AP3D on SUN RGB-D (Cube R-CNN trained on Omni3D_IN):** table 38.3, chair 56.1, cabinet 13.3, **shelves 3.2**. — [arXiv v2 PDF, Table 8](https://arxiv.org/pdf/2207.10660v2)
- **Cross-dataset / pre-training:**
  - Training on Omni3D_IN raises ARKit AP3D to 41.2 (vs 38.6 when trained on ARKit alone).
  - Training on Omni3D_OUT raises KITTI to 42.4 (vs 37.1).
  - Pre-training on Omni3D, then fine-tuning on only 5% of the target data, reaches more than 70% of upper-bound performance.

  — [arXiv v2 PDF, Table 5 and Sec. 5.2](https://arxiv.org/pdf/2207.10660v2)
- On all 98 categories (long tail included), AP3D falls from 23.3 to 14.1. — [arXiv v2 PDF, Appendix](https://arxiv.org/pdf/2207.10660v2)
- **Limitations stated by the authors:** weak on far-away objects and on uncommon object types or contexts. The model assumes **known camera intrinsics**; with guessed intrinsics, 3D positions are only correct up to a scale factor. — [arXiv v2 PDF, Sec. 6 and A8](https://arxiv.org/pdf/2207.10660v2)
- **Headset demo:** The authors show a zero-shot demo on in-the-wild video from a **head-mounted camera "similar to AR/VR headsets"**, with no fine-tuning. It uses "a simple tracking algorithm" that merges per-frame predictions in 3D using 3D IoU plus category cosine similarity. — [arXiv v2 PDF, Appendix A8](https://arxiv.org/pdf/2207.10660v2). The README labels this GIF "Aria demo video" — [GitHub README](https://github.com/facebookresearch/omni3d)

### Inferences
- The model's output is a coarse, whole-object oriented box, for example "desk: 1.2×0.6×0.75 m at pose X". It does not detect parts like legs, panels or screws. The weak "shelves" score (3.2 AP3D) suggests thin, board-like furniture parts are hard for it, and those are exactly what a half-built desk is made of.
- AP3D of about 15 indoors, averaged over IoU 0.05–0.50, is too loose to reliably confirm that a specific part is installed. A box counts as correct at low IoU even if it is well off in position.

### Gaps
- The paper reports no inference speed (FPS or latency), so I cannot state real-time viability.
- I did not find numbers specific to "desk". Per-category tables only cover the 10 common SUN RGB-D categories.

## 3. Public code, data, models: license, stars, last commit, runnability

### Takeaway
Code, pretrained checkpoints and dataset annotations are public at github.com/facebookresearch/omni3d under CC-BY-NC 4.0 (non-commercial). The repo is **archived and read-only**: last push April 2024, last commit May 2023, 855 stars. The software stack is old (PyTorch 1.8, CUDA 10.1, Detectron2, PyTorch3D), and the demo is hard-coded to run on CUDA. It may run on a rented NVIDIA GPU, but not on a Quest 3 or a Mac.

### Cited Findings
- **Repo stats (GitHub API, 2026-09-18):** facebookresearch/omni3d, 855 stars, 87 forks, 41 open issues, `archived: true`, created 2022-07-16, `pushed_at` 2024-04-07. The latest commit is dated 2023-05-11 ("Add checks for coplanar and nonzero invalid cuboids to eval"). — [GitHub API](https://api.github.com/repos/facebookresearch/omni3d); [GitHub repo](https://github.com/facebookresearch/omni3d)
- The repo page reports it was archived on August 6, 2025. — [GitHub repo](https://github.com/facebookresearch/omni3d)
- **License:** "Cube R-CNN is released under CC-BY-NC 4.0". GitHub's API shows the license as "Other/NOASSERTION". — [README](https://github.com/facebookresearch/omni3d); [GitHub API](https://api.github.com/repos/facebookresearch/omni3d)
- **Install:** conda, Python 3.8, `pytorch=1.8 torchvision=0.9.1 cudatoolkit=10.1`, plus fvcore, iopath, pytorch3d and Detectron2. The authors used cuda/10.1 and cudnn 7.6.5.32. — [README](https://github.com/facebookresearch/omni3d)
- **Pretrained checkpoints:** ResNet34-FPN and DLA34-FPN, each trained on full Omni3D, indoor-only, or outdoor-only. Example: `dl.fbaipublicfiles.com/cubercnn/indoor/cubercnn_DLA34_FPN.pth`. — [MODEL_ZOO.md](https://raw.githubusercontent.com/facebookresearch/omni3d/main/MODEL_ZOO.md)
- **Demo:** `python demo/demo.py` runs on a folder of images with the full-Omni3D DLA34 model. It accepts `--focal-length` and `--principal-point` when intrinsics are known, and has a `--threshold` option (default 0.25). If no focal length is given, it assumes focal = 4.0·H/2 in normalized device coordinates. The image tensor is sent to the GPU with `.cuda()`. — [README](https://github.com/facebookresearch/omni3d); [demo/demo.py](https://raw.githubusercontent.com/facebookresearch/omni3d/main/demo/demo.py)
- **Data:** Omni3D JSON annotations download via a script. Images must be fetched from each source dataset: KITTI, nuScenes, SUN RGB-D, Hypersim, plus preprocessed Objectron (about 24 GB) and ARKitScenes (about 28 GB). — [DATA.md](https://raw.githubusercontent.com/facebookresearch/omni3d/main/DATA.md)
- The 3D IoU used for evaluation comes from PyTorch3D (`pytorch3d/ops/iou_box3d.py`). — [README](https://github.com/facebookresearch/omni3d)
- **Hugging Face:** the model card `gkioxari/omni3d` has only `.gitattributes` and `README.md` (last modified 2022-10-18), so there are no weights there. A third-party Space, "AndreasLH/Weak-Cube-RCNN" (Docker, created 2025-05-02), exists. I did not verify what it does. — [HF API gkioxari/omni3d](https://huggingface.co/api/models/gkioxari/omni3d); [HF Spaces search](https://huggingface.co/api/spaces?search=cube%20rcnn)

### Inferences
- Getting it running would mean building a PyTorch 1.8 / CUDA 10.1-era environment on a Linux NVIDIA GPU. Newer versions might work, but the authors do not promise that. Because the repo is archived, compatibility fixes will not come from upstream. Realistically this costs a teammate 2–6+ hours in a 36-hour hackathon. This is an estimate, not a measurement.
- CC-BY-NC is fine for a non-commercial hackathon demo. It would block commercial use of the weights and code if Cut Once became a product.

### Gaps
- I did not install or run the code, so runnability on current PyTorch/CUDA is unconfirmed.
- I found no official hosted demo (Colab, Hugging Face Space) from the authors.

## 4. How it relates to Cut Once (drawing-to-3D, 3D-to-4D, progress tracking, AR/MR guidance) and what's usable in 36 hours

### Takeaway
Omni3D/Cube R-CNN covers **none** of Cut Once's core pipeline: it does not read drawings, generate a 3D model, or produce a build order. Its only real connection is to the **perception side of progress tracking and the copilot**: detecting real objects as metric 3D boxes from a head-mounted camera image. Even there it works at whole-object level ("desk", "shelves", "cabinet"), not part level. In 36 hours, the useful takeaways are (a) a **citation** supporting "single-image 3D detection from headset cameras is feasible", and (b) the **matching idea**: compare observed and planned cuboids with 3D IoU plus category agreement. The team can reimplement that trivially in Unity. Running Cube R-CNN itself is optional and low-value for the desk demo.

### Cited Findings
- The paper's stated motivation includes "applications in robotics and AR/VR". — [arXiv abs](https://arxiv.org/abs/2207.10660)
- The authors demonstrate zero-shot 3D boxes on head-mounted camera video "similar to AR/VR headsets". They track objects over time by merging predictions in 3D with 3D IoU and category cosine similarity. — [arXiv v2 PDF, Appendix A8](https://arxiv.org/pdf/2207.10660v2)
- The output is an oriented metric cuboid in camera coordinates, and it needs known intrinsics for correct metric scale. — [arXiv v2 PDF, Sec. 4.1 and 6](https://arxiv.org/pdf/2207.10660v2)
- Supported classes include 'desk', 'table', 'shelves', 'cabinet', 'bookcase', 'door', 'window' and 'counter'. — [configs/Base_Omni3D.yaml](https://raw.githubusercontent.com/facebookresearch/omni3d/main/configs/Base_Omni3D.yaml)
- Shelves AP3D is only 3.2, versus table 38.3, on SUN RGB-D. — [arXiv v2 PDF, Table 8](https://arxiv.org/pdf/2207.10660v2)
- The demo requires CUDA. — [demo/demo.py](https://raw.githubusercontent.com/facebookresearch/omni3d/main/demo/demo.py)

### Inferences
- **Drawing-to-3D: not related.** The input is photos of real scenes, not 2D architectural or electrical drawings. There is no CAD or plan parsing.
- **3D-to-4D (build sequence): not related.** Nothing temporal beyond a simple frame-to-frame tracker, and no assembly ordering.
- **Progress tracking: weak, indirect fit.**
  - Conceptually, Cut Once asks "is planned part P present?". Cube R-CNN answers "is there an object of class C at pose X?".
  - For the desk demo, the parts are desktop panel, legs and crossbars. None of these are Omni3D categories. Cube R-CNN would at best put one "desk"/"table" box around the whole thing.
  - It cannot tell "3 of 4 legs installed" apart.
  - For the campus-building vision, classes like door, window, cabinet, counter and shelves exist. In principle they could flag "door present / missing" at room scale, but accuracy would be low. This is speculative.
- **AR/MR guidance: partial fit on perception only.** The Aria headset demo shows the model can run on egocentric frames. Using it with Quest 3 would need:
  - camera frames sent off-device to a GPU server,
  - known camera intrinsics for metric scale,
  - conversion of camera-frame cuboids into the Unity world frame using the headset pose.

  This is the team's own plumbing, which other researchers are covering, and I did not verify it here.
- **Realistically usable in 36 h:**
  1. **Cite it** in the pitch or README as prior work on metric 3D object detection from a single egocentric image. Use the CVPR 2023 citation.
  2. **Borrow the evaluation/matching idea:**
     - Represent each planned part as an oriented cuboid.
     - Represent each observed thing (from Quest scene mesh, anchors, or a manual "mark built" step) as a cuboid.
     - Call a part "built" when 3D IoU with a planned cuboid exceeds a threshold and the category/part label matches.
     - This mirrors the paper's tracking heuristic and AP3D matching.
     - PyTorch3D's `box3d_overlap` exists if the team has a Python backend. In Unity, a simple OBB overlap check is enough.
  3. **Optional stretch:** run `demo.py` on a cloud GPU with a few headset photos, to show that the copilot can "see" the desk as a 3D box. Low value for effort.
- **Out of reach / not worth it in 36 h:**
  - retraining or fine-tuning (the paper used 48 V100s)
  - part-level detection of desk components
  - on-device inference on Quest 3
  - relying on it for accurate "built vs missing" decisions

### Gaps
- I did not verify Quest 3 camera access, intrinsics exposure, or latency of an off-device inference loop. That belongs to the Quest/Unity MR researcher's scope.
- No measured inference speed, so feasibility of per-frame use during the demo is unknown.

## 5. Relevant related and follow-up work (only the few most relevant)

### Takeaway
The most Cut-Once-relevant descendants are open-vocabulary versions and an indoor, AR-capture-oriented successor:
- **OVMono3D** (3DV 2026): open-vocabulary Cube R-CNN plus Grounding DINO, Apache-2.0, actively maintained.
- **Cubify Anything / CA-1M** (Apple, CVPR 2025): indoor 3D boxes from egocentric captures.
- **DetAny3D** and **3D-MOOD**: other open-set monocular 3D detectors trained on Omni3D.

Open-vocabulary detection matters because Cut Once's parts ("desk leg", "crossbar") are not in Omni3D's fixed 50 classes. Even so, none of these does drawing-to-3D or build sequencing.

### Cited Findings
- **OVMono3D**, "Open Vocabulary Monocular 3D Object Detection" (Jin Yao, Hao Gu, Xuweiyi Chen, Jiayun Wang, Zezhou Cheng; arXiv 2411.16833, submitted 2024-11-25). Comment: "3DV 2026", with project page cvlab.cs.virginia.edu/ovmono3d. — [arXiv API](https://export.arxiv.org/api/query?id_list=2411.16833,2412.04458); [arXiv PDF](https://arxiv.org/pdf/2411.16833)
- OVMono3D builds on Cube R-CNN for monocular 3D and on Grounding DINO for open-vocabulary 2D detection. It trains a class-agnostic Cube R-CNN. — [search summary of arXiv 2411.16833](https://arxiv.org/pdf/2411.16833). This comes from a search snippet; the PDF was not read in full.
- The OVMono3D repo (UVA-Computer-Vision-Lab/ovmono3d) has 102 stars, Apache-2.0 license, last push 2026-04-29, not archived. — [GitHub API](https://api.github.com/repos/UVA-Computer-Vision-Lab/ovmono3d); [GitHub](https://github.com/UVA-Computer-Vision-Lab/ovmono3d)
- **Cubify Anything** (Lazarow, Griffiths, Kohavi, Crespo, Dehghan; Apple; arXiv 2412.04458; CVPR 2025):
  - Introduces the CA-1M dataset: over 400K 3D objects exhaustively labeled on over 1K laser-scanned scenes, registered to over 3.5K handheld, egocentric captures.
  - Contrasts itself with Omni3D's cross-dataset focus.
  - Reports no significant benefit from Omni3D's disentangled chamfer loss when training on CA-1M.

  — [arXiv API](https://export.arxiv.org/api/query?id_list=2411.16833,2412.04458); [Apple ML Research](https://machinelearning.apple.com/research/cubify-anything); [arXiv HTML](https://arxiv.org/html/2412.04458v1)
- Cubify Anything code is at apple-aiml-research/ml-cubifyanything: 444 stars, last push 2026-09-11, license shown as NOASSERTION by GitHub. — [GitHub search API](https://api.github.com/search/repositories?q=cubifyanything)
- **Other Omni3D-based follow-ups found in search:**
  - "Training an Open-Vocabulary Monocular 3D Object Detection Model without 3D Data" (arXiv 2411.15657)
  - DetAny3D
  - "3D-MOOD: Lifting 2D to 3D for Monocular Open-Set Object Detection" (arXiv 2507.23567), which trains on Omni3D and tests on Argoverse 2 and ScanNet
  - "LabelAny3D" (arXiv 2601.01676)
  - "MoCA3D" (arXiv 2603.19538)

  — [search results](https://arxiv.org/pdf/2507.23567); [arXiv 2411.15657](https://arxiv.org/pdf/2411.15657); [arXiv 2601.01676](https://arxiv.org/pdf/2601.01676); [arXiv 2603.19538](https://arxiv.org/pdf/2603.19538). These are listed from search results only; I did not read them.
- **Citation count:** OpenAlex shows 96 citations for the CVPR 2023 record and 4 for the arXiv record. — [OpenAlex](https://api.openalex.org/works?search=Omni3D%20large%20benchmark%20model%203D%20object%20detection%20wild&per_page=3)
- **Key works Omni3D cites that are relevant here:**
  - Total3D (single-image indoor boxes + meshes)
  - ImVoxelNet
  - ARKitScenes (Apple AR captures)
  - Objectron (object-centric AR videos with pose annotations)

  — [arXiv v2 PDF, Sec. 2 and references](https://arxiv.org/pdf/2207.10660v2)

### Inferences
- If the team wants something like "detect what's in view as 3D boxes" for the copilot, OVMono3D is the better starting point. It takes free-text prompts, has an Apache-2.0 license and is maintained. It still needs a GPU server and still produces whole-object boxes. I have not verified whether it runs easily.
- Cubify Anything targets indoor egocentric AR captures (iPhone/iPad-style RGB-D). That is closer to a headset-room scenario, but it is still detection, not plan-driven progress tracking.

### Gaps
- Semantic Scholar returned HTTP 429 (rate limit), so I have no Google Scholar or Semantic Scholar citation count. OpenAlex counts are likely undercounts.
- I did not read the follow-up papers in full. Their descriptions above come from arXiv metadata and search snippets.
- I found no follow-up that links Omni3D-style detection to construction progress monitoring or plan/BIM comparison. The search was brief; the 4D BIM / progress-monitoring researcher may cover this.
