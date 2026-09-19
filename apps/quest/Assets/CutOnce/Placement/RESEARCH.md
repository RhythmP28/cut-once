# Placement verification: research and implementation decision

Research date: 19 September 2026. Product constraints: Quest 3, Unity 6000.6.2f1,
72 fps rendering; markers acceptable; begin with known rigid objects, expand to unknown objects later.

**Decision:** use calibrated visual markers for physical instance identity and 6D pose in the first
product demo. Combine independently observed object poses with tracked hands to infer pickup and
release. Confirm completion only after post-release observations establish correct placement.
Keep appearance-based recognition for inventory descriptions, onboarding, and eventual markerless
tracking. This is the recommended engineering baseline, not a claim of a measured global optimum.

**Current implementation boundary.** The existing PlacementTracker handles alignment, observation
freshness, identity-string matching, rotation rules, dwell, and hysteresis. It cannot establish that
the supplied ID is correct, detect physical grasp/release, or verify support/contact. Its Confirmed
state must not directly complete a product task. The fixture demo is a test harness for that layer.
122 project EditMode tests passed, including 12 placement tests; project readiness returned no
findings; the fixture demo was visually checked in a Quest 3 simulator bedroom. No physical-object
tracking, pickup/release detection, or on-headset performance has been validated.

**What the platform supplies.** Meta's PassthroughCameraAccess provides camera images, calibration,
timestamps, and camera pose. These support a custom perception pipeline; they are not a complete
arbitrary-object tracker. The official samples include object detection and simultaneous access to
both cameras. [Meta camera documentation](https://developers.meta.com/horizon/documentation/unity/unity-pca-documentation/),
[official samples](https://github.com/oculus-samples/Unity-PassthroughCameraApiSamples).

Local inspection found MRUK/Core SDK 205 and the required camera and hand APIs. In this installed
PassthroughCameraAccess implementation, Timestamp is a DateTime, while the prototype observation
contract uses Unity's monotonic unscaled clock: an adapter must explicitly convert clock domains.
GetCameraPose documents the pose at the image timestamp. Cache pose, image metadata and timestamp
together before asynchronous processing. Do not transform old detections using the user's latest
head pose. No Unity/package upgrade is proposed.

**Comparison of viable method families.**

| Method | Appropriate role | Main reason not to make it the only completion test |
|---|---|---|
| AprilTag or ArUco markers with calibrated geometry | Preferred identity/pose baseline for known objects | Needs visible, securely attached markers, calibration and rejection of bad poses |
| Meta native QR trackables | Inventory registration and potentially stationary final verification | Meta explicitly says pose updates are unsuitable for real-time moving-object tracking |
| Model-based RGB keypoints, contours, PnP | Markerless known rigid objects | Needs suitable geometry/appearance and recovery from occlusion; symmetric shapes are ambiguous |
| RGB plus depth and model registration | Pose refinement and geometric verification | Requires aligned usable depth; missing/noisy depth and initialization remain issues |
| Learned 6D pose, e.g. FoundationPose | Research baseline for broader objects | Published implementation has CUDA/PyTorch dependencies; no demonstrated standalone Quest budget here |
| Model-free RGB-D reconstruction, e.g. BundleSDF | Build a model of an unknown rigid object during an onboarding scan | Requires multiple observations, segmentation and depth; substantial compute and integration |
| 2D detector, mask/outline overlap, video segmentation | Locate candidates; highlight visible outlines; corroborate pose | Does not uniquely determine metric depth, orientation or physical instance identity |
| Room mesh, spatial anchor, Unity collider | Workspace frame, target support plane, geometry calculations | Does not independently measure a movable object's current physical pose |
| External calibrated cameras or rigid attached trackers | Lab reference or fallback when headset visibility fails | Additional hardware, calibration and operational constraints |
| Instrumented props, contact switches or force sensing | Stronger evidence of physical contact/release | Requires modified objects; unnecessary until visual verification proves insufficient |
| Vision-language model | Describe objects, propose plans, explain errors | A narrative judgment is not a calibrated metric placement measurement |

AprilTag supplies identity and camera-relative pose from known tag dimensions and intrinsics.
ArUco is a credible alternative, especially if OpenCV is already part of the team’s stack. There is
no justified universal accuracy winner for this project without measurements. Choose AprilTag as
the first baseline; compare both if failures warrant it. [AprilTag implementation](https://github.com/AprilRobotics/apriltag),
[OpenCV PnP](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html).

The QR distinction is particularly important: the built-in API exposes pose, size and payload, but
its moving-code section says updates occur at lower frequency and are unsuitable for real-time
moving-object tracking. That limitation concerns Meta's native tracker, not every possible QR
detector implemented over camera frames. [Meta QR tracking](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-qrcode-detection/).

FoundationPose supports model-based and reference-view-based setups. BundleSDF jointly tracks and
reconstructs unknown objects from RGB-D video. Both are relevant references, but their research
results do not establish feasibility within this app's standalone rendering/thermal budget.
DLR's M3T/ICG family provides model-based alternatives using visual modalities. Benchmark on-device
or use a laptop research pipeline before selecting a deployment architecture.
[FoundationPose](https://github.com/NVlabs/FoundationPose), [BundleSDF](https://github.com/NVlabs/BundleSDF),
[DLR tracking](https://github.com/DLR-RM/3DObjectTracking).

**Identity: prove which physical instance is being used.**

Maintain separate class/model IDs, physical inventory IDs, and transient tracking IDs. A detector
label like “box” is a class, not a unique object. A tracker-assigned number can change after occlusion.
Each unique marker maps to one inventory instance. Multiple different markers may map to that same
instance, each with its own calibrated local transform. Never put the same marker ID on two objects.

At registration, associate the marker with the physical item and its dimensions/model, then check
the fitted model visually. A marker identifies the tag, so it identifies the object only while that
attachment and registration remain valid. Reject inconsistent multi-marker geometry; re-register
after a sticker moves. Coarse size/shape checks can detect accidental tagging mistakes, but they do
not prove hidden properties such as material strength.

Define whether a task requires a particular instance or any member of an interchangeable set. Two
truly indistinguishable unmarked objects cannot reliably be reidentified after an unseen swap from
appearance alone. In that case accept equivalence, add identifying information, or report ambiguity.

**Pose: compare geometry in a shared frame.**

Estimate the marker's camera-relative pose from its corners, physical dimensions and calibration.
Apply the measured marker-to-object transform and image-time camera pose to recover object pose.
For T_A_B mapping B coordinates into A:

`T_world_object = T_world_camera(imageTime) * T_camera_marker * T_marker_object`

Then express object and target in the same workspace anchor frame. Verify axis conventions, image
crop/resize calibration, metres, object origin and frame/session ID. A marker's centre is usually
not the object's centre. A front-surface depth hit is also not its centre.

Place several markers on different exposed faces when necessary, away from expected grip/support
surfaces. Store all marker corners in the object's coordinate system and solve from visible corners,
rejecting inconsistent/outlier evidence. OpenCV documents that known multi-marker layouts support
pose estimation with partial visibility and more correspondences.
[Multi-marker pose estimation](https://docs.opencv.org/4.x/db/da9/tutorial_aruco_board_detection.html).

Do not judge placement solely by centre distance. Check task-relevant endpoints, support faces or
connector frames and allowable rotations. A 70 cm plank rotated 12 degrees about its centre moves
each end about 7.3 cm: the demo's generic 12-degree limit is inappropriate for a precise joint.
For an object that can lie anywhere inside a bin, containment is more suitable than a single target
pose. For a bridge plank, both ends must lie over the intended supports.

Evaluate permitted symmetries only when they preserve function: a sphere's orientation may not
matter; a connector's keyed direction does. Symmetry-aware surface/projection metrics are standard
in BOP evaluation. [BOP pose metrics](https://bop.felk.cvut.cz/media/bop_challenge_2020_results.pdf).

2D silhouette overlap is useful supporting evidence but cannot certify 3D placement: different
depths and occlusions can produce similar images. Depth can check a visible surface against the
predicted geometry, but transparent, reflective and thin objects are documented weaknesses of
Meta's depth estimation. Prefer multiple valid surface samples inside an object mask over one
bounding-box-centre ray. [Meta depth limitations](https://developers.meta.com/horizon/design/mr-health-depth/),
[environment raycasting](https://developers.meta.com/horizon/documentation/unity/unity-mr-utility-kit-environment-raycast/).

Use an anchor for the workspace/targets, not as a substitute for observing a carried object. Meta
describes spatial anchors as stationary and recommends nearby anchors to reduce drift. If the
assembly itself moves, compare parts relative to its observed base as well as the workspace.
[Anchor practices](https://developers.meta.com/horizon/documentation/unity/unity-spatial-anchors-best-practices/).

**Pickup and release: infer interaction from several observations.**

Proposed known-object baseline: associate each hand with nearby object surfaces, then require
consistent hand/object movement and a reasonably stable hand-relative object pose over a short
window. Use grip shape as supporting evidence, not a universal pinch requirement. Distinguish
touching, pushing and carrying; moving away from a support surface helps support a pickup inference.
Track left/right and two-handed associations explicitly. Head movement must be compensated before
comparing motion, and hand/object samples must be time aligned.

This is a proposed inference algorithm, not direct measurement of contact forces. Meta reports that
physical-object interactions can occlude hands and lower tracking confidence. Therefore no hand
tracking is not equivalent to an open hand, and a vanished marker is not equivalent to a release.
[Meta hand limitations](https://developers.meta.com/horizon/design/hands-limitations-mitigations/).

After an object is aligned, keep it awaiting release. Require observed hand separation while the
object remains at the target and becomes stationary relative to its intended support. Obtain fresh
object measurements after separation. If the hand or object is hidden, show “verification pending”
and request a clearer view instead of silently completing. A two-handed object requires both holds
to end. If a contact sensor is later added, it can provide additional independent evidence.

Learned interaction/contact models are another viable path. 100 Days of Hands models hand location,
contact state and the contacted object; ContactPose studies hand-object contact and grasp data.
They establish this as a separate perception problem, not a feature automatically solved by a
generic detector. For a few tagged rigid props, first test geometric/temporal inference before
introducing another model and dataset/domain adaptation burden.
[100DOH](https://fouheylab.eecs.umich.edu/~dandans/projects/100DOH/),
[ContactPose](https://github.com/facebookresearch/ContactPose).

**Completion policy.**

Suggested progression: Registered → PickupCandidate → Held → AlignedWhileHeld → ReleasedCandidate
→ Settling → VerifiedPlaced. Uncertain tracking can suspend verification at every stage.

Completion requires the assigned identity, sufficiently certain fresh pose, the required pickup
history, release evidence, support/connection geometry, and a post-release stable interval. Record
the supporting observation timestamps. Do not invent a probability by multiplying correlated
detector scores. Keep identity, pose, visibility and interaction quality separate.

A learned or filtered prediction can smooth a hologram during brief occlusion, but cannot earn a
new completion. Use observation-based verification separately from predicted render pose. Repeated
polls of one frame do not count as repeated evidence. Freeze verification during relocalization or
frame changes. Require renewed evidence after recovery.

Retain the history that a step was completed separately from current placement validity. Later
observed displacement marks the assembly as needing correction; looking away makes its current
validity unknown, not proof that it moved. Dependent steps use current verified relationships.
If the product explicitly requires pickup, an object already sitting at the target cannot satisfy
that event history. A separate “validate existing assembly” mode can intentionally waive pickup.

**Data contract.**

| Record | Required fields |
|---|---|
| Object definition | Model/class ID; dimensions and units; geometry or primitive; local origin/axes; allowed symmetries; support/connection frames; acceptable equivalence group |
| Inventory instance | Stable instance ID; definition ID; marker IDs, metric sizes and calibrated transforms; calibration revision |
| Observation | Instance/track ID; pose; source frame/session; capture timestamp and clock mapping; freshness; measured/predicted flag; visibility; identity quality; pose uncertainty/fit residual |
| Hand association | Hand ID(s); tracked/confidence state; time-aligned proximity and relative-motion evidence; held/released/unknown state |
| Placement requirement | Step/plan revision; instance or equivalence requirement; reference frame; target pose/region; connector/support constraints; tolerances; required event history and dwell |
| Verification result | State and reason; evidence time interval; relevant observation IDs; completion event; current validity; dependencies |

The existing ObjectObservation's single confidence scalar is a prototype simplification. Extend
the contract before real perception integration. Store pose uncertainty as measured/calibrated
quality where available; reprojection error alone does not establish a world-space centimetre bound.
Unknown or poorly constrained depth/orientation must remain unknown.

**Relevant prior assembly systems.**

GBOT combines 6D object tracking with an assembly graph; its evaluation discusses degradation from
hand occlusion, motion blur, illumination changes and symmetry. This supports tracking relationships
between parts and designing explicit recovery, not assuming uninterrupted individual tracking.
[GBOT](https://arxiv.org/html/2402.07677v1).

ASDF combines pose estimation and assembly-state detection. Its evidence concerns its evaluated
assembly parts/datasets, not arbitrary household objects or standalone Quest performance.
[ASDF](https://arxiv.org/html/2403.16400v1).

Augmented Assembly presents a HoloLens 2 workflow using component recognition and hand tracking
with current/target overlays. Its custom component demonstrations are close to this product idea,
but are not proof that a generic Quest system can certify physical release or every assembly.
[Augmented Assembly](https://arxiv.org/html/2601.11535v1).

**How to establish what is optimal on this product.**

First use known props and a measured placement fixture. Compare AprilTag and, if needed, ArUco on
the same recorded/live sequences. Vary marker size/layout, distance, viewing angle, lighting, motion,
grip occlusion and headset motion. Measure pose errors against independent physical references;
the estimator cannot be its own ground truth. Record at least a few hundred representative trials
for engineering iteration, without interpreting zero observed failures as a reliability guarantee.

Include wrong instance/right location, right instance/wrong orientation, held motionless at target,
hand merely hovering, pushed rather than picked up, two-handed transfer, sticker covered, full
tracking loss, old/reordered frames, object slipping after release, and moving an already placed
support. Separate release labels from placement labels during review.

Primary metrics: false completion rate, missed valid placement rate, identity switches, release
classification errors, confirmation delay, pose error at critical features, reacquisition time,
measurement age, and headset CPU/GPU/frame-time/thermal behaviour. Set acceptable geometric error
from the task, then require measurement uncertainty to be comfortably smaller. If uncertainty is
too large, improve measurement or ask for a better view; do not simply widen a task's tolerance.

The proposed first implementation runs marker perception asynchronously on-device and keeps Unity
verification light. Render at 72 fps independently of perception throughput. Process the newest
usable image instead of accumulating stale frames. This deployment preference needs benchmarking;
use a laptop offload only if necessary and preserve capture timestamps and latency rejection.

**Expansion to unknown objects.** Start with an explicit registration step: assign identity, collect
multiple views, estimate/measure metric dimensions, choose a primitive or mesh, and validate the
digital twin before planning. A marker can identify a previously unknown object but does not reveal
its full geometry. Later compare markerless model-based and reconstruction methods using the same
recorded trials and verifier interface. The copilot chooses from validated inventory and emits
placement requirements; it does not decide completion from a single screenshot.

**Recommended next implementation sequence:** object/marker registry and replayable observations;
one-object camera pose adapter and calibration check; hand-object association with pending states;
release-aware verifier and adversarial simulation tests; multi-object support relationships;
on-headset benchmark; then markerless onboarding research. Keep marker detection, object recognition,
interaction inference, verification and visual feedback behind separate interfaces.
