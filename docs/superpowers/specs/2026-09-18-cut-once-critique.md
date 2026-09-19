# Cut Once: Plan Critique and Fixes

2026-09-18, 11:50 PM · Reviewed: the blueprint, the team plan and the Platform & Knowledge build plan. There is no code yet, so "verify" here means checking claims against vendor docs, against HTN's rules, and with arithmetic.

**Goal every decision was judged against:** a reliable 3-minute live demo, scored on WOW, technical ability, originality and design, plus the six sponsor prizes.

## Verdict

**Proceed with changes.** The architecture holds. Five problems would have cost us the demo or a morning, and all five are now fixed in the plans.

## Blocking issues (all fixed)

| # | What was wrong | Concrete failure | Fix applied |
|---|---|---|---|
| 1 | **No test in a new room.** Every test ran in the hacking room, but every judging room is new to the headset | Walk into judging: the saved anchor won't localise (it belongs to another room), a boundary prompt can appear, the headset slept in the waiting room. The 60-second setup is gone before the demo starts | QR scan is the default in a new room; boundary suppressed (`shouldBoundaryVisibilityBeSuppressed` plus the boundaryless manifest flag, fine for sideloaded builds); proximity sensor off; **new-room cold start ≤ 60 s** added as a test, a risk and a done-criterion |
| 2 | **The "desk is level" assumption was unchecked, and uncheckable.** Both markers sat on the near edge, so the level check could only see sideways tilt | A 0.5° front-to-back tilt (a folding table) puts the tip of a 0.70 m leg **6 mm** off (0.70 × sin 0.5°), and nothing warns us | A **third marker on the far edge** checks the solve; if it disagrees by over 4 mm, a three-point rigid fit takes over (now P0 as fallback). Desk goes on the floor. Shim test added |
| 3 | **Michael's first hour was impossible.** 25 schemas and 13 tests in 20 minutes; all of the history logic in 90 minutes before the events API | The "contracts frozen" message slips past T+1:30, A2 and Rhythm idle, and "mark built" (G5) misses the first night | **Two-tier freeze:** plan, parts, events, state at T+0:45; the rest by T+3. **Rhythm writes the copilot and verification schemas** (Rhythm owns both ends). History logic split: replay first, step order and checker after the API is up |
| 4 | **Schedule order ignored demo importance.** The E7 model (in the 3-minute demo) came after three Elastic tasks that depend on APIs we hadn't verified, with zero slack before A2 needed it | One Elastic surprise at T+16 and the E7 video has no data | **E7 moved to T+14**, before the Elastic extras. Hybrid search still reaches Rhythm by T+17 |
| 5 | **The plan committed the architects' drawings to a public repo** (E7 stage images with the original pixels), while also saying we don't commit drawings | A copyright problem on Devpost's public source link | Overlays with drawing pixels are git-ignored and used only in the video, with credit. The repo gets geometry-only images |

## Non-blocking concerns (fixed unless noted)

- Strict schemas at runtime would turn a teammate's new field into a 400 that sits in the headset's outbox. Now: strict in tests, strip-and-log at runtime.
- Hand-drawn desk drawings would have hurt the model's dimension reading, which the upload story depends on. Now: drawn digitally with typed dimensions; the messy input is the manual, the BOM and a handwritten site note.
- `semantic_text` needs filling; now a `copy_to` from `text`.
- The QR sheet generator needed marker positions that don't exist until the sheets are stuck on. Now it needs only payload and size.
- Handoff times disagreed between plans (desk plan T+4 vs T+4:30). Aligned to T+4:30.
- **Not fixed, accepted:** the replay logic exists twice (TypeScript and C#). That breaks "don't repeat yourself" on purpose: the overlay and timeline must work with the network down. Shared fixtures keep them equal, but CI only runs the TypeScript side, so A2 must run the Unity tests by hand before each merge.
- **Not fixed, accepted:** the access token rides in the WebSocket URL and may land in server logs. It's one shared hackathon token; don't log query strings.
- Latency figures (4–6 s) are budgets, not measurements. The first real number comes at G6.

## Assumptions checked

| Assumption | Status | Evidence |
|---|---|---|
| glTFast converts handedness by inverting X, matching our `toUnity` | **Verified** | glTFast upgrade guide: inverts the X axis (earlier versions inverted Z) |
| `gpt-5.6-luna` takes images and returns JSON-schema structured output; `gpt-transcribe` exists | **Verified** | OpenAI's model pages |
| Elastic's MCP endpoint and auth | **Verified** | `{KIBANA_URL}/api/agent_builder/mcp`, `Authorization: ApiKey`, key needs `feature_agentBuilder.read` (Elastic docs) |
| ElevenLabs streams raw PCM at 22.05 kHz on Flash v2.5 | **Verified** | `output_format=pcm_22050`, `eleven_flash_v2_5` (ElevenLabs docs) |
| QuestCameraKit's versions; MRUK QR needs SDK v83+ | **Verified** | Its README (Unity 6000.3.12f1, Meta XR 205.0.0); Meta's QR docs |
| Yaw formula in the alignment solve | **Verified by logic** | In Unity, rotating about +Y by θ adds θ to a vector's heading `atan2(x, z)`, so θ = heading(world) − heading(model) |
| Two centres beat one marker's rotation | **Verified by arithmetic** | 1° on one marker = 17 mm at 1 m; 2.8 mm over a 0.6 m baseline = 0.27° = about 2.5 mm |
| Marker centres are good to about 2 mm | **Unverified** | Meta publishes no accuracy figure. G3 measures jitter; G4 measures the real error |
| Casting works while the camera and mic are in use | **Unverified** | Gate G7, with a four-step fallback |
| The Quest browser can't read camera pixels, so Unity is required | **Verified earlier** | Meta's WebXR doc; browser support never confirmed |
| Forking a public MIT project and building its sample tonight is within HTN rules | **Unverified** | Public libraries are allowed; ask an organiser if unsure |
| A desk with hand-screw legs is obtainable tonight | **Unverified** | Only the team can settle this |

## Open questions (only the team can answer)

1. Which desk, and will it sit on the floor during judging?
2. Has Jerry or Henry shipped a Unity build to a Quest before? That decides A1.
3. Will an organiser confirm that building QuestCameraKit's own sample before midnight is fine?
