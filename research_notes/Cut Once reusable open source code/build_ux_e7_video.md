# Reusable open-source code for the Cut Once 4D build-step experience and the E7 vision video

Scope: code-level review, checked 2026-09-19. Sources were read as raw files from GitHub (via `gh api` / raw.githubusercontent.com) or from the official docs. "Last push" is the GitHub API `pushed_at` value, read today. Snippets are kept under 15 lines. **Nothing in the Cut Once repo was changed.** One scratch test (an ffmpeg montage of the E7 stage PNGs) was rendered in the session scratchpad, outside the repo.

What our code already has (read, not re-surveyed):
- `packages/project-model/src/fold.ts`: `fold(plan, assemblyId, events, upTo?)` replays `part_state`/`verification` events into `BuildState`. `derive()` computes `current_step_id`, `available_part_ids`, `blocked_part_ids` and `out_of_sequence` (hard = rests_on not built, soft = an earlier step is unfinished).
- `packages/project-model/src/steps.ts`: `orderParts()` is a topological sort on `rests_on`, with ties broken by layer, then x-centre, then volume, then id. `generateSteps()` makes one step per part.
- `packages/schemas/src/factory.ts`: `PartState` = missing|built|wrong; `Verdict` = present|absent|wrong_orientation|unsure; `BuildEvent.kind` = part_state|verification|annotation|alignment.
- E7 data: 17 parts (8 slabs, 8 envelopes, 1 roof), 17 steps, and 17 planned events from 2026-09-28 to 2027-03-29 (`data/e7/out/e7.events.json`). Every part has `position [0,0,0]`, and its `shape.bounds` are in world metres (for example `part_e7_l02_envelope` spans y 4.828–8.742). The GLB bakes coordinates into the vertices, so **each node's pivot is the world origin, not the part's base**. That matters for any "rise" or "scale-Y" animation (see Q2). `data/e7/floors/L0N.json` holds `polygon_px` (the traced outline in the raw drawing's pixel coordinates) and `polygon_m`. The stage PNGs are 2000×2000 and have white backgrounds.
- Web: `apps/web/src/three/buildPart.ts` already has `applyLook(obj, look)` with looks default/highlight/built/wrong, and each object is named by `part_id`.

---

## Q1. Litematica's schematic verifier: algorithms and UX to copy as ideas (LGPL)

### Takeaway
Litematica's verifier comes down to four small ideas we can re-implement in about 60 lines of our own TS/C#:
- a pure classifier from (expected, found) to one of five result types, each with a fixed overlay and text colour;
- results grouped by (expected, found) pair, with category or pair selection and an "ignore" option;
- a "nearest problems" list sorted by squared distance, re-sorted only after the player moves more than 16 blocks (hysteresis), and capped at N HUD lines;
- a layer-range filter (ALL / SINGLE_LAYER / LAYER_RANGE / ALL_BELOW / ALL_ABOVE, with follow-player), plus a material list that tracks total, missing, mismatched and available per item.

The code is LGPL-3.0, so we copy the behaviour, not the source. The Cut Once repo has no LICENSE file yet, and that choice decides how careful we must be.

### Cited Findings
**Repos and activity**
- maruohon/litematica: LGPL-3.0, 952 stars, last push 2026-07-26. Its default branch is `ornithe/1.12.2`, a rewrite in the package `litematica.*` [repo](https://github.com/maruohon/litematica).
- The maintained fork for current Minecraft versions is sakura-ryoko/litematica: LGPL-3.0, 886 stars, last push 2026-09-18, branch `DEV/26.3` [repo](https://github.com/sakura-ryoko/litematica).
- The last commit touching `SchematicVerifier.java` is `c6b98e99fc`, dated 2025-07-27 ("Move back lots of the sub-packages from `schematic.old`") [commits](https://github.com/maruohon/litematica/commits/ornithe/1.12.2/src/main/java/litematica/schematic/verifier/SchematicVerifier.java).

**Result types and the classifier**
- `VerifierResultType` defines CORRECT_STATE, EXTRA, MISSING, WRONG_BLOCK and WRONG_STATE. `INCORRECT_TYPES` is ordered WRONG_BLOCK, WRONG_STATE, MISSING, EXTRA. The classifier is a pure function [VerifierResultType.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/schematic/verifier/VerifierResultType.java):
  ```java
  if (foundState != expectedState) {
      if (expectedState != SchematicVerifier.AIR) {
          if (foundState == SchematicVerifier.AIR)                type = MISSING;
          else if (expectedState.getBlock() != foundState.getBlock()) type = WRONG_BLOCK;
          else                                                    type = WRONG_STATE;
      }
      else if (!IGNORE_EXISTING_FLUIDS || !foundState.getMaterial().isLiquid()) type = EXTRA;
  }
  if (type == null) type = CORRECT_STATE;
  ```
  (Condensed from lines 66–97.)
- Each type carries a `DualColorConfig`: a translucent overlay colour and an opaque text colour. The defaults, in ARGB, are [Configs.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/config/Configs.java):

  | Type | Overlay | Text |
  |---|---|---|
  | CORRECT | `#4C11FF11` | `#FF55FF55` |
  | EXTRA | `#4CFF00CF` (magenta) | |
  | MISSING | `#4C00FFFF` (cyan) | |
  | WRONG_BLOCK | `#4CFF0000` (red) | |
  | WRONG_STATE | `#4CFFAF00` (orange) | |

  The same file sets `verifierErrorHighlightAlpha` = 0.2, `verifierErrorHighlightMaxPositions` = 1000, `infoHudMaxLines` = 10, `verifierHighlightSides` = true and `verifierHighlightConnections` = false.

**Grouping, selection and ignore**
- Results are stored per chunk as `Map<BlockStatePair, IntArrayList>`, where a pair is (expected, found) plus its type. Counts are rolled up per pair and per type.
- The user can select a whole category (`toggleTypeSelected`) or one exact pair (`togglePairSelected`), and can ignore a pair (`ignoreStatePair`). Only the selected pairs' positions are highlighted [SchematicVerifier.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/schematic/verifier/SchematicVerifier.java).
- Dirty flags cascade (pairs → positions → closest), so nothing is recomputed each frame (same file).

**Nearest problems with hysteresis** (same file, lines 575–590):
```java
int hysteresis = 16;
if (this.selectedClosestPositionsDirty || this.lastSortPosition == null ||
    Math.abs(this.lastSortPosition.getX() - referencePos.getX()) > hysteresis || ... ) {
    this.updateClosestPositions(referencePos);   // sort all by squared distance, keep first `max`
    this.updateInfoHudLines();                   // title + up to (infoHudMaxLines-1) lines
}
```
- Each HUD line is `<colour of type> blockName x y z`. For EXTRA it shows the *found* block; otherwise it shows the *expected* one (same file, `updateInfoHudLines`).
- The comparator is plain squared Euclidean distance to a reference position, closest first [BlockPairTypePositionComparator.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/schematic/verifier/BlockPairTypePositionComparator.java).

**Layer modes**
- Layer modes live in malilib (LGPL-3.0, last push 2026-09-09): `ALL, SINGLE_LAYER, LAYER_RANGE, ALL_BELOW, ALL_ABOVE` [LayerMode.java](https://github.com/maruohon/malilib/blob/ornithe/1.12.2/src/main/java/malilib/config/value/LayerMode.java).
- `LayerRange` adds an axis (X/Y/Z), hotkeys that move the min or max of the range, and `followPlayer`. `isPositionWithinRange` is a switch over the mode [LayerRange.java](https://github.com/maruohon/malilib/blob/ornithe/1.12.2/src/main/java/malilib/util/position/LayerRange.java).
- The verifier can be limited to the render layers (`BlockInfoListType.RENDER_LAYERS` → `getLayerRangeClampedPerChunkBoxes`), so "verify only what I am looking at" is the same filter as "render only these layers" (SchematicVerifier.java, `updateRequiredBoxes`).

**Material list**
- `MaterialListEntry` stores `countTotal`, `countMissing`, `countMismatched` and `countAvailable` [MaterialListEntry.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/materials/MaterialListEntry.java).
- The HUD shows `getMissingCount() - getAvailableCount()` per item, which is what you still have to go and fetch [MaterialListHudRenderer.java](https://github.com/maruohon/litematica/blob/ornithe/1.12.2/src/main/java/litematica/materials/MaterialListHudRenderer.java).

**Licensing facts (GNU FAQ)**
- Translation is modification: "translation of a work is considered a kind of modification … what the GPL says about modified versions applies also to translated versions" [GNU FAQ #TranslateCode](https://www.gnu.org/licenses/gpl-faq.html#TranslateCode).
- On static linking: "If you statically link against an LGPLed library, you must also provide your application in an object (not necessarily source) format, so that a user has the opportunity to modify the library and relink the application" [GNU FAQ #LGPLStaticVsDynamic](https://www.gnu.org/licenses/gpl-faq.html#LGPLStaticVsDynamic).
- The Cut Once repo has no `LICENSE*` file, and the root `package.json` has no `license` field (checked locally).

### Inferences
**How Litematica maps onto our data.** Its "expected vs found" becomes plan part vs (event-log state + camera verdict):

| Litematica | Cut Once |
|---|---|
| MISSING | `state=missing` |
| CORRECT | `built` (+ `verified.verdict=present`) |
| WRONG_BLOCK | `state=wrong` |
| WRONG_STATE | `verdict=wrong_orientation` (orange, not red) |
| EXTRA | camera sees an object that is not in the plan (only as a `log_issue`; skip for the demo) |

This suggests one small addition to `VisualStateResolver`: show `wrong_orientation` as a separate amber "wrong state" look, separate from red WRONG, as Litematica does. The blueprint's cyan MISSING and red WRONG already match Litematica's defaults.

**Behaviours worth copying:**
1. **Pure classifier + palette object.** Our `HologramPalette` ScriptableObject is the equivalent of `DualColorConfig`: one overlay colour and one text colour per state.
2. **Nearest-problem HUD with hysteresis.** Sort the WRONG, UNVERIFIED and CURRENT_STEP parts by squared distance from the head. Re-sort only when the head moves more than about 0.25 m (the equivalent of Litematica's 16 blocks), so the list does not reshuffle while the Builder leans. Show at most 3–5 lines on the world-locked panel.
3. **Filter by pair or category.** A "show only wrong" toggle, and an "accept this deviation" action. The accept action appends an `annotation` event instead of deleting anything, which matches Litematica's ignore-pair.
4. **Layer modes as step modes, with the step index as the axis:**

   | Litematica | Cut Once |
   |---|---|
   | ALL | whole plan |
   | SINGLE_LAYER | only the current step |
   | ALL_BELOW | steps up to the cursor (this *is* the timeline) |
   | ALL_ABOVE | the planned future |
   | LAYER_RANGE | steps a..b |
   | followPlayer | "follow current step" |

   For E7 the axis can literally be Y, one floor per layer.
5. **Material list = cut list.** Keep the counts total, remaining (parts not built), wrong, and optionally "cut / on hand".

**LGPL-3.0 in practice (not legal advice):**
- (a) Reading the code and re-implementing the *behaviour* in our own words is fine. Copyright does not cover the five categories, the colours as a design idea, or "sort by distance".
- (b) Pasting or *translating* Litematica Java into C# or TS makes that file a modified version of LGPL code. It must then carry LGPL-3.0, its source must ship, and for a statically linked build users must be able to relink it. A Unity IL2CPP APK for the Quest is effectively statically linked, so meeting that is awkward.
- (c) So: write our verifier from the table above without the Java open in front of us. Optionally credit "verifier UX inspired by Litematica (LGPL-3.0)" in the README.

### Gaps
- I did not diff sakura-ryoko's `fi.dy.masa.litematica.schematic.verifier` against maruohon's rewrite. Class names and defaults may differ slightly. The categories and colours are long-standing, but the exact default ARGB values above come from the `ornithe/1.12.2` branch only.
- I did not open Litematica's overlay renderer, so I cannot say exactly how it draws "sides vs outlines" for the highlight boxes.

---

## Q2. Open-source build-up and construction-sequence animation code, and driving a timeline from our event list

### Takeaway
There is no Unity 4D-BIM player worth importing. The reusable pieces are small, and each maps onto code we already have:
- **Visibility and state from a time cursor:** Zea's `Task.update(currentDate)` (MIT). BEFORE is hidden, DURING is visible and highlighted, AFTER is visible and normal.
- **Frame mapping:** Bonsai's formula frame = start_frame + (t − start)/duration × total_frames. Bonsai is GPL-3.0-or-later, so take the formula only.
- **Steps in three.js:** three.js `LDrawLoader`'s step visibility `c.visible = c.userData.buildingStep <= step` (MIT).
- **LEGO-instructions UX:** buildinginstructions.js (Unlicense, public domain, so it can be copied freely). It outlines the new parts, draws old parts in one colour, and auto-frames the camera on the accumulated bounds.
- **Unity look:** a world-height reveal/dissolve (daniel-ilett's dissolve-urp, MIT) combined with andydbc's hologram maths (MIT).

The timeline itself should be our own ~40-line `ReplayClock`: video time → fractional event index → `fold(upTo=floor)` plus per-part rise progress.

### Cited Findings
**Bonsai / IfcOpenShell 4D animation**
- The GitHub repo reports LGPL-3.0: 2,793 stars, last push 2026-09-19, default branch `v0.9.0` [repo](https://github.com/IfcOpenShell/IfcOpenShell).
- **But the Bonsai file header says "GNU General Public License … version 3 … or (at your option) any later version"** [sequence.py](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/bonsai/tool/sequence.py). Bonsai code is GPL, not LGPL. `sequence.py` was last changed 2026-07-27, and `get_animation_product_frames` and `animate_creation` are still in v0.9.0 (lines 1335 and 1479).
- The mapping from time to frames (read from the v0.8.0 tag, same logic in v0.9.0) [sequence.py](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/bonsai/tool/sequence.py):
  ```python
  "STARTED": round(settings["start_frame"]
      + (((product_start - settings["start"]) / settings["duration"]) * settings["total_frames"])),
  "COMPLETED": round(settings["start_frame"]
      + (((product_finish - settings["start"]) / settings["duration"]) * settings["total_frames"])),
  ```
- `animate_creation` keyframes three things (same file):
  - `hide_viewport=True` at frame 1;
  - visible and tinted with the task colour at STARTED;
  - back to white at COMPLETED.

  Bonsai picks the behaviour from the task's PredefinedType: CONSTRUCTION/INSTALLATION → creation, DEMOLITION/REMOVAL → destruction, MAINTENANCE/RENOVATION → operation. The speed can be set as frames, as a duration, or as a multiplier (`get_animation_settings`).

**Zea 4d-schedule-viewer (MIT)**
- MIT, last push 2024-03-26, web, built on `@zeainc/zea-engine@4.12.0` from a CDN [repo](https://github.com/ZeaInc/4d-schedule-viewer).
- Each `Task` has three states, BEFORE/DURING/AFTER, and a comment says the colours come "From Synchro Software": NEW_CONSTRUCTION `#F9CE03`, DEMOLITION `#B22222` [Task.js](https://github.com/ZeaInc/4d-schedule-viewer/blob/HEAD/src/Task.js).
- `update(currentDate)` works like this (same file, lines 147–210):
  - before start: hide the group, progress 0;
  - after end: show it for construction tasks (hide it for equipment), clear the highlight, progress 100;
  - in between: show, highlight, progress = (now − start)/duration × 100, and recurse into child tasks.

**three.js LDraw building steps (MIT)**
- three.js: MIT, last push 2026-09-19 [repo](https://github.com/mrdoob/three.js).
- `LDrawLoader.computeBuildingSteps(model)` walks the groups and increments `stepNumber` on each `startingBuildingStep`, which is set by an LDraw `0 STEP` line. It then sets `c.userData.buildingStep` and `model.userData.numBuildingSteps` [LDrawLoader.js](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/LDrawLoader.js).
- The example's slider applies it [webgl_loader_ldraw.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_loader_ldraw.html):
  ```js
  } else if ( c.isGroup ) {
      // Hide objects with building step > gui setting
      c.visible = c.userData.buildingStep <= guiData.buildingStep;
  }
  ...
  gui.add( guiData, 'buildingStep', 0, model.userData.numBuildingSteps - 1 ).step( 1 ).name( 'Building step' )
  ```
- For a "print" reveal in the web viewer: the three.js clipping example uses per-material `clippingPlanes: [ localPlane ], clipShadows: true` together with `renderer.localClippingEnabled = true` [webgl_clipping.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_clipping.html).

**buildinginstructions.js (LEGO instructions in three.js)**
- Unlicense, 148 stars, last commit 2026-08-28 [repo](https://github.com/LasseD/buildinginstructions.js).
- `LDR.InstructionsManager` has `nextStep`, `prevStep` and `goToStep`. Each walk calls `realignModel(stepDiff, …)` and then `handleStepsWalked()`. That function writes the step into the URL (`window.history.replaceState(this.currentStep, null, this.baseURL + this.currentStep)`), updates the parts-list image (PLI), and saves `last_step_<model>` to localStorage [LDRInstructionsManager.js](https://github.com/LasseD/buildinginstructions.js/blob/master/js/LDRInstructionsManager.js).
- `realignModel` frames the camera on `stepHandler.getAccumulatedBounds()` (everything built so far). If that is bigger than the viewport it falls back to the current step's `getBounds()`, padded by 10% (same file, lines 670–720).
- New parts in a step are drawn through an `OutlinePass` with `edgeStrength = 20`. The edge colour is red `#200000` or lime `#20F000`, depending on the option (same file, lines 449–479).
- `LDROptions.showOldColors` has four values: "0 = highlight new with red, 1 = highlight new with lime, 2 = all colors normal, 3 = single color old", and the old-part colour is `0xFFFF6F` [LDROptions.js](https://github.com/LasseD/buildinginstructions.js/blob/master/js/LDROptions.js).

**BrickGPT**
- MIT, 1,706 stars, last push 2026-05-21 [repo](https://github.com/AvaLovelace1/BrickGPT).
- Its renderer is a Blender/Cycles still-image script (`render_bricks(..., instructions_look=False, ...)`, 512 samples, via ImportLDraw), not a step player [render_bricks.py](https://github.com/AvaLovelace1/BrickGPT/blob/main/src/brickgpt/render_bricks.py).
- Its rollback, `_remove_all_bricks_after_first_unstable_brick`, "Removes all bricks starting from the first unstable brick" and repeats until the structure is stable [brickgpt.py](https://github.com/AvaLovelace1/BrickGPT/blob/main/src/brickgpt/models/brickgpt.py).

**Unity shaders**
- **daniel-ilett/dissolve-urp** (MIT, 79 stars, last push 2020-04-15, Unity 2019.3.0f6): a Shader Graph dissolve driven by `_CutoffHeight` and `_NoiseStrength`. `DissolveObject.cs` sets them per frame with `material.SetFloat("_CutoffHeight", height)` [repo](https://github.com/daniel-ilett/dissolve-urp), [DissolveObject.cs](https://github.com/daniel-ilett/dissolve-urp/blob/master/Assets/Scripts/DissolveObject.cs).
- **daniel-ilett/shaders-hologram**: "A holographic Shader Graph for Unity URP", MIT, 70 stars, Unity 2019.4.0f1 [repo](https://github.com/daniel-ilett/shaders-hologram).
- **andydbc/HologramShader**: MIT, 989 stars, last push 2023-09-07, built-in render pipeline, Unity 2018.2 [repo](https://github.com/andydbc/HologramShader). The core of its fragment shader [Hologram.shader](https://github.com/andydbc/HologramShader/blob/master/Assets/Hologram/Shader/Hologram.shader):
  ```hlsl
  scan = step(frac(dirVertex * _ScanTiling + _Time.w * _ScanSpeed), 0.5) * 0.65;
  glow = frac(dirVertex * _GlowTiling - _Time.x * _GlowSpeed);
  fixed4 flicker = tex2D(_FlickerTex, _Time * _FlickerSpeed);
  half rim = 1.0 - saturate(dot(i.viewDir, i.worldNormal));
  fixed4 rimColor = _RimColor * pow(rim, _RimPower);
  fixed4 col = texColor * _MainColor + (glow * 0.35 * _MainColor) + rimColor;
  col.a = texColor.a * _Alpha * (scan + rim + glow) * flicker;
  ```
  Its vertex glitch is `v.vertex.x += _GlitchIntensity * (step(0.5, sin(_Time.y*2 + v.vertex.y)) * step(0.99, sin(_Time.y*_GlitchSpeed*0.5)))`.
- **MirzaBeig/Post-Processing-Scan** (Unlicense, 933 stars, Unity 2020.3) uses the legacy `ScriptableRenderPass.Execute(...)` with `cmd.Blit(source, destination.Identifier(), ...)` [CustomRenderPass.cs](https://github.com/MirzaBeig/Post-Processing-Scan/blob/main/Assets/Mirza%20Beig/Post-Processing%20Scan/Scripts/CustomRenderPass.cs).

**Web 4D viewers to avoid or be careful with**
- xeokit-sdk is AGPL-3.0 (last push 2026-09-08) [repo](https://github.com/xeokit/xeokit-sdk).
- three-custom-shader-material, which extends three.js built-in materials with custom shader code, is MIT (last push 2025-10-12) [repo](https://github.com/FarazzShaikh/THREE-CustomShaderMaterial).
- pmndrs/postprocessing (bloom for three.js) is Zlib [repo](https://github.com/pmndrs/postprocessing).

### Inferences
**1. Timeline driver.** We already have the reducer. Add a `ReplayClock` (C#, our code) that turns seconds into a *fractional* event cursor, then:

```csharp
// proposed (ours): cursor = 0..events.Count; integer part = events applied, fraction = rise progress of the next part
float Cursor(double t) => mode == Ordinal
    ? (float)(t / secondsPerEvent)                                        // even spacing, best for video
    : Bonsai-style: (float)((eventTime - t0).TotalSeconds / (t1 - t0).TotalSeconds * events.Count);
var state  = Fold(plan, events, upTo: Mathf.FloorToInt(cursor));          // same fixture-tested reducer
int k      = Mathf.FloorToInt(cursor);                                    // next event to "print"
float rise = EaseOutCubic(Mathf.Clamp01((cursor - k) / riseFraction));
foreach (var pv in partViews) pv.Apply(resolver.Resolve(pv.PartId, state), pv.PartId == events[k].part_id ? rise : 1f);
```

- **Ordinal (even) spacing** is better than true time for E7: the planned events are uneven, weekly for slabs and longer for envelopes, over 6 months. At 17 events × 1.1 s per event, the rise takes about 19 s.
- **The "planned future"** is the same player run over `e7.events.json`, or the steps expanded into synthetic events, as blueprint §9 already says.

**2. Rise and print on E7.** Every E7 node has its pivot at the world origin (bounds in world y). So `transform.localScale.y` would squash a floor toward the ground, not grow it from its own slab. Two fixes:
- **Shader (preferred):** pass `_RevealMinY/_RevealMaxY` from `shape.bounds` and clip `positionWS.y > lerp(min, max, rise)`, with an HDR emissive band just under the cut. This is the dissolve-urp `_CutoffHeight` idea. It is also the "desk prints itself" effect: the desk's box parts get the same reveal from `position ± size/2`.
- **Transform:** "rises into place over 0.4 s" (the blueprint's BUILT_REPLAY) can be a y-translation from `minY − h` to 0 while clipping at `minY`. That avoids re-pivoting the GLB.

**3. What to take from each source:**
- **Zea (MIT, may copy):** the 3-state `update(currentDate)` shape and the Synchro yellow for "in progress". Our CURRENT_STEP cyan plays the same role.
- **Bonsai (GPL):** only the proportional-time formula and the creation/demolition split by task type. Do not port the file.
- **three.js LDraw (MIT):** `visible = stepIndex <= cursor` is enough for the web History page. `fold(..., upTo)` → `states` → `applyLook`, plus a clipping plane per material for the print effect.
- **buildinginstructions.js (public domain):** "new parts outlined, old parts one flat colour" and "frame the camera on the accumulated bounds, falling back to the step bounds when they overflow". These are the two best step-UX ideas for both the desk HUD and the E7 camera.

**4. Unity look for the video.** Put these into our `CutOnce/Hologram` graph as nodes:
- **Fresnel rim:** `pow(1 − N·V, _RimPower)`.
- **World-Y scanlines:** `step(frac(y·tiling + t·speed), 0.5)`.
- **Slow glow sweep:** `frac(y·tiling − t·speed)`.
- **Height clip + edge band.**

Copying andydbc's arithmetic is allowed (MIT), but it is built-in-pipeline ShaderLab, so rebuild it in URP Shader Graph rather than importing it. daniel-ilett's graphs are URP but from 2019. Unity 6 can usually upgrade old graphs; budget 15 minutes or rebuild.

**5. Skip:**
- MirzaBeig's scan uses the pre-Render-Graph URP API (`RenderTargetHandle.Identifier()`), so it will not compile on Unity 6 URP without porting or Compatibility Mode. Do the scan stripe in the object shader (`_StripePhase`, already in the blueprint).
- xeokit, because it is AGPL.
- BrickGPT's renderer: Cycles stills, too slow and the wrong tool.

**6. BrickGPT's rollback** is the generator-side twin of our `out_of_sequence: hard`. It is a talking point, not code to take.

### Gaps
- I found no maintained open-source Unity 4D-BIM or construction-sequence player (GitHub searches for "unity 4D BIM" and "construction sequence unity" returned nothing relevant). potato3d/cascade (MIT, 2021) came up for "4D BIM", but I did not open its code.
- I did not check whether Theatre.js's studio package is AGPL. Theatre.js was left out.
- I did not test that daniel-ilett's 2019 Shader Graphs import cleanly into Unity 6.

---

## Q3. Rendering the video in the Unity Editor: Recorder/Timeline setup, camera orbit, URP bloom

### Takeaway
The simplest route is Unity's own `MovieRecorderExample` (Recorder 5.1.7, Unity 6000.0+), with the record mode set to a time interval, constant frame-rate playback, and `ExitPlayMode` on. Press Play and you get an MP4.

The zero-code alternative is a Timeline with a Recorder Track and Clip, plus an Animation Track that drives our `ReplayClock.cursor` and the camera.

For the orbit, the MIT `Orbit.cs` pattern (sin/cos on `Time.time` + `LookAt`) is enough. With Constant frame-rate playback, `Time.time` should advance by a fixed 1/fps per recorded frame, so every render should come out the same (my inference; not tested).

For bloom, turn on HDR, make the hologram edges HDR-bright, and set the Bloom threshold to about 1 so that only the edges glow.

### Cited Findings
**Recorder package**
- The needle-mirror of `com.unity.recorder` is at version 5.1.7 with `"unity": "6000.0"`, last push 2026-08-03. It describes itself as capturing "from the Unity Editor during Play mode" [repo](https://github.com/needle-mirror/com.unity.recorder).
- The Recorder source is under the Unity Companion License [LICENSE.md](https://github.com/needle-mirror/com.unity.recorder/blob/master/LICENSE.md).

**Official scripted sample** [MovieRecorderExample.cs](https://github.com/needle-mirror/com.unity.recorder/blob/master/Samples~/MovieRecorder/MovieRecorderExample.cs):
```csharp
var controllerSettings = ScriptableObject.CreateInstance<RecorderControllerSettings>();
m_RecorderController = new RecorderController(controllerSettings);
m_Settings = ScriptableObject.CreateInstance<MovieRecorderSettings>();
m_Settings.Enabled = true;
m_Settings.EncoderSettings = new CoreEncoderSettings {
    EncodingQuality = CoreEncoderSettings.VideoEncodingQuality.High, Codec = CoreEncoderSettings.OutputCodec.MP4 };
m_Settings.ImageInputSettings = new GameViewInputSettings { OutputWidth = 1920, OutputHeight = 1080 };
m_Settings.OutputFile = mediaOutputFolder.FullName + "/" + "video";
controllerSettings.AddRecorderSettings(m_Settings);
controllerSettings.SetRecordModeToManual();
controllerSettings.FrameRate = 60.0f;
m_RecorderController.PrepareRecording();
m_RecorderController.StartRecording();
```
(It runs in `OnEnable`, and `StopRecording()` runs in `OnDisable`.)

**Controller settings**
- `RecorderControllerSettings` exposes `SetRecordModeToManual()`, `SetRecordModeToSingleFrame(int)`, `SetRecordModeToFrameInterval(int start, int end)` and `SetRecordModeToTimeInterval(float start, float end)`.
- It also exposes `FrameRatePlayback` (default `FrameRatePlayback.Constant`), `CapFrameRate` (default true) and `ExitPlayMode` (default true) [RecorderControllerSettings.cs](https://github.com/needle-mirror/com.unity.recorder/blob/master/Editor/Sources/RecorderControllerSettings.cs).

**Encoder**
- `CoreEncoderSettings.OutputCodec` offers "H.264 MP4" and "VP8 WebM".
- `VideoEncodingQuality` offers Low, Medium, High and Custom. Custom uses `TargetBitRate` (Mbps) and `GopSize`. The H.264 profile defaults to High.
- MP4 rejects odd resolutions ("The MP4 format does not support odd values in resolution") and warns above 2160p [CoreEncoderSettings.cs](https://github.com/needle-mirror/com.unity.recorder/blob/master/Editor/Sources/Recorders/MovieRecorder/Encoder/CoreEncoderSettings.cs).
- The package also ships samples for multiple recordings and an FFmpeg command-line encoder (`Samples~/FFmpegCommandLineEncoder/FFmpegEncoder.cs`) [tree](https://github.com/needle-mirror/com.unity.recorder/tree/master/Samples~).

**Timeline route**
- A Recorder Track and Clip record "at specific time or frame intervals of the Timeline in Play mode".
- The clip's Start/End set the recording window.
- "Frame Rate Playback property is locked to Constant mode, because Timeline plays back at a constant frame rate", and the clip inherits the Timeline's frame rate [Recorder docs: Timeline track](https://docs.unity3d.com/Packages/com.unity.recorder@5.1/manual/RecordingTimelineTrack.html).

**Timeline samples (for captions and tweens)**
- Timeline 1.8.13 ships customization samples: `TextTrack` (TMP, `[TrackBindingType(typeof(TMP_Text))]`, with a mixer that blends colour and size and picks the heaviest clip's text), `TweenTrack`, `TimeDilationTrack`, `AnnotationMarker` and `VideoTrack`. The Timeline mirror was last pushed 2026-08-12 [Samples~/Customization](https://github.com/needle-mirror/com.unity.timeline/tree/master/Samples~/Customization).

**Orbit and camera**
- The orbit snippet, MIT [Orbit.cs](https://github.com/daniel-ilett/dissolve-urp/blob/master/Assets/Scripts/Orbit.cs):
  ```csharp
  var time = Time.time * Mathf.PI * 0.25f;
  var xPos = orbitObject.position.x + Mathf.Sin(time) * orbitSize;
  var yPos = orbitObject.position.y + orbitOffset;
  var zPos = orbitObject.position.z + Mathf.Cos(time) * orbitSize;
  transform.position = new Vector3(xPos, yPos, zPos);
  transform.LookAt(orbitObject);
  ```
- Cinemachine 3.1 Spline Dolly has **Automatic Dolly** with the methods None, **Fixed Speed** ("Camera travels along the path at a fixed speed") and Nearest Point To Target. The docs warn that Nearest Point To Target can jump on circular splines. Camera Rotation can be Path, Path No Roll, Follow Target or Default [Cinemachine docs](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineSplineDolly.html).

**URP Bloom** (Unity 6000.0, source)
- The parameters are:
  - `threshold` = `MinFloatParameter(0.9f, 0f)`
  - `intensity` = `MinFloatParameter(0f, 0f)`, with no upper bound in code
  - `scatter` = `ClampedFloatParameter(0.7f, 0, 1)`
  - `clamp` = 65472
  - `tint` = white, HDR colour
  - `highQualityFiltering` = false
  - `downscale` = Half
  - `maxIterations` = `ClampedIntParameter(6, 2, 8)`
  - lens dirt texture and intensity

  [Bloom.cs @6000.0/staging](https://github.com/Unity-Technologies/Graphics/blob/6000.0/staging/Packages/com.unity.render-pipelines.universal/Runtime/Overrides/Bloom.cs).
- Graphics `master` adds a `filter` parameter (`BloomFilterMode.Gaussian` by default) [Bloom.cs @master](https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.universal/Runtime/Overrides/Bloom.cs).
- The docs say Threshold is a "gamma space brightness value", bloom is off when Intensity = 0, and High Quality Filtering "can impact performance" [URP Bloom docs](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/post-processing-bloom.html). The docs' page summary gave Intensity a 0–1 range, but the source uses `MinFloatParameter`, which has no upper limit, so trust the source.

### Inferences
**Minimal E7Vision setup, about 1 hour:**
1. Install Recorder 5.1.x and Timeline.
2. Create a scene with the E7 GLB (glTFast), a dark ground plane with a faint grid (the "field"), the `ReplayClock`, and a camera.
3. Copy `MovieRecorderExample.cs` into `Assets/Editor-only` code behind `#if UNITY_EDITOR`, and change it to:
   - `controllerSettings.SetRecordModeToTimeInterval(0f, 30f)`
   - `FrameRate = 30` (or 60)
   - `FrameRatePlayback = FrameRatePlayback.Constant`
   - `CapFrameRate = true`
   - `m_Settings.CaptureAlpha = false` (the sample sets true, but H.264 MP4 has no alpha channel)
4. With `ExitPlayMode = true`, pressing Play records 30 s and stops by itself.
5. Drive every animation from `Time.time`, or from the Timeline clock. Never use wall-clock time.

**If the team prefers editing the timing visually:** use one Timeline with a Recorder Track (0–30 s), an Animation Track that keys `ReplayClock.cursor` (a public float) and the orbit angle, and a Text Track (TMP) for the stage titles and the mandatory caption "Generated from Perkins&Will's published E7 drawings. Heights estimated from the section. Interiors simplified." Mark `ReplayClock` as `[ExecuteAlways]` so scrubbing in Edit mode previews the build.

**Orbit.** Use the `Orbit.cs` maths with a slow rate, about 15–20° per second:
- radius ≈ 1.6 × building diagonal (E7 is about 42 × 91 × 34 m, so roughly 170 m);
- height ≈ 0.6 × building height;
- look-at = building centre (≈ 21, 17, 45).

Cinemachine's Spline Dolly with Fixed Speed on a closed circular spline plus a Rotation Composer is the no-code alternative. Avoid Nearest Point To Target on a circle.

**Bloom for a hologram look at video quality** (starting values to tune by eye):
- On the URP asset: HDR **on**, MSAA 4×. On the camera: Post Processing on, anti-aliasing SMAA High.
- Volume:
  - Bloom: threshold 1.0, intensity 1.5–2.5, scatter 0.65–0.75, tint slightly cyan, High Quality Filtering **on** (no cost concern offline), downscale Half, max iterations 7–8.
  - Tonemapping: ACES or Neutral.
  - Vignette: 0.25.
- In the shader, write the edges, scanlines and the reveal band as HDR colour ×3–8 and keep the fill below 1.0. With threshold 1, only the edges glow and the fill stays readable.
- Render 1920×1080, even dimensions (the MP4 rule).

**Recording fallback.** If MP4 encoding fails on the Mac, record a PNG sequence and encode it with ffmpeg (already installed, 8.1), or use the FFmpeg encoder sample.

### Gaps
- I did not run the Recorder on the team's Unity 6 install. MP4 support per OS/GPU is not stated in the files I read.
- The Bloom value ranges above are recommendations, not measured. There is no official "hologram preset".

---

## Q4. Turning the E7 intermediate images into a quick explainer montage (drawing → traced outline → extrusion)

### Takeaway
**For a 30-second video, the fastest path is ffmpeg alone.** Tested here: a 13.6 s, 1080p30 montage of four E7 stage images with fade / wipe / circle transitions rendered in **3.8 s wall-clock** from one command.

For a nicer "outline draws itself" beat, use **HyperFrames** (Apache-2.0, already installed as a skill here). Overlay `floors/L0N.json.polygon_px` as an SVG path on the raw plan JPG and animate the stroke. The pixel coordinates match the drawing exactly, so no alignment work is needed.

Do the **extrusion and stacking in Unity**, not in a 2D tool, so the look matches the 4D build. Manim and Motion Canvas work but cost more setup than they save.

### Cited Findings
- **ffmpeg `xfade`** (local ffmpeg 8.1, `ffmpeg -h filter=xfade`) has 58 named transitions plus `custom`, including fade, wipeleft/right/up/down, slide*, circleopen/close, dissolve, pixelize, radial, smooth*, fadeblack/white, zoomin, reveal* and cover* [ffmpeg filter docs](https://ffmpeg.org/ffmpeg-filters.html#xfade).
- **Test run** (session scratchpad, not the repo). Command core, where `$S` = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x05070d,format=yuv420p,fps=30,setsar=1`:
  ```bash
  ffmpeg -loop 1 -t 4 -i raw/LEVEL_01_PLAN.jpg -loop 1 -t 4 -i stages/footprints/L01.overlay.png \
         -loop 1 -t 4 -i stages/footprints/L01.geom.png -loop 1 -t 4 -i stages/mesh/massing.geom.png \
    -filter_complex "[0]$S[a];[1]$S[b];[2]$S[c];[3]$S[d];\
      [a][b]xfade=transition=fade:duration=0.8:offset=3.2[ab];\
      [ab][c]xfade=transition=wipeleft:duration=0.8:offset=6.4[abc];\
      [abc][d]xfade=transition=circleopen:duration=0.8:offset=9.6[v]" \
    -map "[v]" -c:v libx264 -crf 18 -pix_fmt yuv420p montage.mp4      # 13.6 s output, 3.84 s to render
  ```
  Every input must share size, frame rate and pixel format, hence `$S`. The offset of each xfade = previous offset + clip length − duration.
- **HyperFrames**: "Write HTML. Render video. Built for agents.", Apache-2.0, 51,443 stars, last push 2026-09-19 [repo](https://github.com/heygen-com/hyperframes). It is available in this Claude environment as the `hyperframes*` skills (GSAP/CSS/SVG draw, Three.js adapter, deterministic render).
- **Remotion** is source-available, not OSI. It is free for "an individual", "a for-profit organization with up to 3 employees" and non-profits; others need a company licence [LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
- **Motion Canvas**: MIT, 19,124 stars, last push 2026-07-02 [repo](https://github.com/motion-canvas/motion-canvas).
- **Manim Community**: MIT, 40,917 stars, last push 2026-09-19 [repo](https://github.com/ManimCommunity/manim). `manim` is not installed on this machine (checked with `which manim`).
- **Our data:** `data/e7/floors/L01.json` has `polygon_px` (for example `[[966,445],[1375,445],…]`) in the raw sheet's pixels, plus `px_per_m: 13.75` and `traced_by: "AI assistant, by eye from zoomed crops"` (local file). The stage PNGs (`L0N.overlay.png`, `L0N.geom.png`) are 2000×2000 with white backgrounds; a frame from the test showed a red footprint on white (local check).

### Inferences
**Recommended 30 s cut:**

| Time | Beat | Tool |
|---|---|---|
| 0–3 s | Raw L01 plan (credit on screen) | ffmpeg or HyperFrames |
| 3–7 s | Traced outline draws on over the plan | HyperFrames: SVG `<polygon points=polygon_px>` with `stroke-dasharray` / `dashoffset`, or GSAP DrawSVG, on a dark-tinted plan |
| 7–9 s | Cut to Unity: the same outline as a glowing line on the dark field | Unity, a `LineRenderer` from `polygon_m` |
| 9–12 s | The outline extrudes into the L1 envelope | `_RevealY` sweep |
| 12–27 s | Orbit while floors 2–8 and the roof "print" | `ReplayClock` over `e7.events.json` |
| 27–30 s | Title and honesty caption | |

Join the HyperFrames MP4 and the Unity MP4 with one ffmpeg `xfade`.

**Why not the stage PNGs as they are:** they are white-background debug renders, which clash with a hologram look. Either restyle them (HyperFrames with a dark background, or ffmpeg `negate` / `colorchannelmixer` as a 5-minute hack) or use them only in a fast "pipeline stages" contact-sheet beat.

**Time cost:**
- ffmpeg montage: about 15 min including tuning (render time is negligible).
- HyperFrames outline beat: about 45–90 min.
- Manim: about 2 h, to install and learn `ThreeDScene` extrusion, which Unity already does better.
- Remotion: equivalent to HyperFrames but adds a licence question.

### Gaps
- I did not render a HyperFrames or Manim test, so their times are estimates.
- I did not verify GSAP's current licence terms (the GitHub API shows no SPDX licence for greensock/GSAP). If that matters, use CSS `stroke-dashoffset` keyframes instead of GSAP DrawSVG.

---

## Q5. Assembly-guidance UX from research code with public repos

### Takeaway
Only two public codebases give us concrete, reusable step UX:
- **SIGMA** (Microsoft psi, MIT): typed steps (Gather / Do / Complex with sub-steps and spatial virtual objects), separate spoken and display text, and a task panel that can collapse to the selected step and auto-scrolls to keep it visible.
- **buildinginstructions.js** (public domain): outline the new parts, flatten the old parts to one colour, frame the camera on the accumulated bounds, put the step in the URL, remember the last step.

The ML research repos have no viewer or UX code to reuse:
- IKEA Manuals at Work has **no licence**;
- Manual2Skill (Apache-2.0) and MEPNet (MIT, 2022) are only ML pipelines;
- HoloAssist is a dataset.

### Cited Findings
**SIGMA**
- SIGMA lives in `microsoft/psi/Applications/Sigma`, a HoloLens 2 client with a desktop server that uses LLMs and vision models "to guide users step by step through procedural tasks" [psi/Applications/Sigma](https://github.com/microsoft/psi/tree/master/Applications/Sigma), [arXiv 2405.13035](https://arxiv.org/html/2405.13035v1).
- The psi repo is MIT [LICENSE.txt](https://github.com/microsoft/psi/blob/master/LICENSE.txt), last push 2026-09-09. The project calls SIGMA "intended for use for research purposes only" (search-result summary of the [Sigma Transparency Note](https://github.com/microsoft/psi/wiki/Sigma-Transparency-Note); not opened directly).
- **Step model:**
  - Base `Step` has `GetSpokenInstructions()` and `GetDisplayInstructions()`, and each step renders its own `StepPanel`.
  - `DoStep(label, description, TimerDuration)`.
  - `GatherStep(label, verb, noun, List<string> Objects)`, which speaks "`{Verb} the {noun} listed below.`" and shows "`{Noun}:`" plus a checklist.
  - `ComplexStep` holds `List<SubStep>`; each `SubStep` has `Label`, `Description` and `List<VirtualObjectDescriptor> VirtualObjects`.

  [Task/*.cs](https://github.com/microsoft/psi/tree/master/Applications/Sigma/Sigma/Task)
- **Task panel:** `TaskPanelUserInterface` keeps `selectedStepIndex`, `selectedSubStepIndex` and a `showOnlySelectedStep` toggle. It renders either only the selected step or all steps. When a selection exists it recomputes `topStepPanelIndex` so the selected step, and the start of the next one, stay in view [TaskPanelUserInterface.cs](https://github.com/microsoft/psi/blob/master/Applications/Sigma/Sigma/UserInterface/TaskPanelUserInterface.cs).
- **buildinginstructions.js** step UX (Unlicense), as described in Q2: outline new parts (`showOldColors` 0/1), draw old parts in a single colour `0xFFFF6F` (option 3), frame the camera on the accumulated bounds with a fallback to the step bounds, deep-link the step in the URL, keep the last step in localStorage, and show a parts list per step (PLI) [LDRInstructionsManager.js](https://github.com/LasseD/buildinginstructions.js/blob/master/js/LDRInstructionsManager.js), [LDROptions.js](https://github.com/LasseD/buildinginstructions.js/blob/master/js/LDROptions.js).
- **HoloAssist:** the dataset is released under CDLAv2, with the code repo `Ember-HoloAssist/holoassist-release`. It runs "mistake detection" and "intervention type prediction" challenges, and studies "how human assistants correct mistakes, intervene in the task completion procedure, and ground their instructions to the environment". The intervention categories are not listed on the project page [holoassist.github.io](https://holoassist.github.io/).
- **IKEA Manuals at Work:** the GitHub API reports no licence (68 stars, last push 2025-03-31). The repo holds an annotation interface (SAM/TAPIR backend) [repo](https://github.com/yunongLiu1/IKEA-Manuals-at-Work).
- **Manual2Skill:** Apache-2.0, last push 2025-11-14. It is VLM plan-generation and evaluation code (`VLM_assembly_plan_gen/…`, `test_visualize.py`) [repo](https://github.com/owensun2004/Manual2Skill).
- **MEPNet** (`Relento/lego_release`): MIT, last push 2022-08-18. Its visualisation files are training and eval visualizers (`util/visualizer.py`, `coco_related/visualize.py`) [repo](https://github.com/Relento/lego_release).

### Inferences
**Step card** (SIGMA + LEGO), for the world-locked HUD:
- title (`BuildStep.title`) and instruction (`instruction`);
- a separate `spoken` string for TTS, SIGMA-style: short, no trailing period, with the part name first;
- materials from `step.materials` (the LEGO PLI);
- the timer from `est_minutes` (SIGMA's DoStep `TimerDuration`).

**A "Gather" step 0**, generated from `plan.materials`, as a checklist ("Gather the boards listed below"). This is the Litematica material list and SIGMA's GatherStep in one, and it costs nothing, because `plan.materials` and `used_by` already exist.

**What's next.** Keep our rule, `current_step` = the first unfinished step whose `requires` are done (`derive()`). Show:
- the next 2–3 steps collapsed below the current one (SIGMA's list with auto-scroll);
- a "focus" toggle for `showOnlySelectedStep`, i.e. single-step mode.

**Errors.** Combine the Litematica HUD ideas from Q1:
- a nearest-problems list with hysteresis;
- WRONG vs WRONG_STATE colours.

For the parts that belong to the current step, follow LEGO: outline the new parts at full brightness and flatten everything already built to one dim colour. This matches the blueprint's BUILT_LIVE "no fill, thin brackets".

**Camera framing for the E7 video and the web viewer.** Frame the accumulated bounds of the parts built so far, as buildinginstructions.js does. Zoom in on the current part only when the whole model would be too small on screen.

**Do not copy code from IKEA Manuals at Work.** With no licence it defaults to all rights reserved. Citing the paper is fine.

### Gaps
- I did not read SIGMA's Diamond interaction model to extract its exact "next / previous / repeat" voice intents; a grep for those strings found nothing obvious.
- HoloAssist's intervention categories were not on the project page, and I did not open the paper.
- No research repo I found ships an AR step-card renderer for Unity/Quest. The UX has to be built by us from these patterns.
