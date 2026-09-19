import { z } from "zod";
import { ulid } from "ulid";
import type { Part, VerificationRequest, VerificationResult } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { jsonCall } from "../llm.js";
import { cropJpeg } from "./crop.js";
import type { CopilotModels } from "./models.js";

const Verdict = z.object({
  verdict: z.enum(["present", "absent", "wrong_orientation", "unsure"]),
  confidence: z.number(),
  evidence: z.string(),
}).strict();

/** Below these the crop is too small or too clipped to judge, and a guess would be worse than no answer. */
const MIN_IN_FRAME = 0.6;
const MIN_PX = 40;

const SYSTEM = [
  "You compare a photo against a render of the same viewpoint and answer one narrow question about one object.",
  "Image A is a photo from a headset camera. Image B is a render from the same pose: grey shows parts already",
  "installed, and solid magenta marks exactly where the target part must be if it is installed.",
  "Answer only about the magenta location. Reply `present` if that object is physically there, `absent` if the",
  "space is empty or something else is there, `wrong_orientation` if it is there but rotated or flipped from the",
  "render, and `unsure` if the photo is too blurry, too dark or too occluded to tell. Guessing is worse than",
  "`unsure`: a wrong verdict makes someone re-do work that was already right.",
  "Evidence is one short sentence describing what you actually see at that location.",
].join(" ");

const unsure = (req: VerificationRequest, evidence: string, ms: number, model: string): VerificationResult =>
  ({ verification_id: req.verification_id, part_id: req.part_id, verdict: "unsure", confidence: 0, evidence, model, ms });

/**
 * Section 11's camera check. It never writes part state — it appends a `verification` event, which
 * attaches a verdict to the part and leaves `state` exactly as the person set it. Everything that
 * could change what is built goes through a human pressing a button in the headset.
 */
export async function verifyPart(
  ctx: Ctx, m: CopilotModels, input: { assemblyId: string; request: VerificationRequest; frame: Buffer; expectedView: Buffer | null },
): Promise<VerificationResult> {
  const t0 = Date.now();
  const { request: req } = input;
  const plan = ctx.store.getPlan(ctx.store.getAssembly(input.assemblyId).plan_id);
  const part: Part | undefined = plan.parts.find((p) => p.part_id === req.part_id);
  if (!part) return unsure(req, `${req.part_id} is not in this plan`, Date.now() - t0, m.chat);
  if (req.in_frame < MIN_IN_FRAME) return unsure(req, "the part is mostly outside the frame", Date.now() - t0, m.chat);
  if (req.bbox_px[2] < MIN_PX || req.bbox_px[3] < MIN_PX) return unsure(req, "the part is too small in this frame to judge", Date.now() - t0, m.chat);

  let images;
  try {
    const reference = { width: req.camera.width, height: req.camera.height };
    images = [
      { data: cropJpeg(input.frame, req.bbox_px as [number, number, number, number], reference), mime: "image/jpeg" as const },
      ...(input.expectedView ? [{ data: cropJpeg(input.expectedView, req.bbox_px as [number, number, number, number], reference), mime: "image/jpeg" as const }] : []),
    ];
  } catch (err) {
    return unsure(req, `could not crop the images: ${(err as Error).message}`, Date.now() - t0, m.chat);
  }

  let result;
  try {
    result = await jsonCall(ctx.cfg, {
      name: "verification", schema: Verdict, system: SYSTEM, timeoutMs: m.budgets.verify, images,
      text: [
        `Target part: ${part.name}. ${part.verify_hint}`,
        `It is claimed to be: ${req.claimed_state}.`,
        input.expectedView ? "Image A is the photo, image B is the render." : "Only the photo was supplied; judge from the crop alone and prefer `unsure`.",
        "Is that object physically present at the magenta location in image A?",
      ].join(" "),
    });
  } catch (err) {
    // Section 11: a timeout or an error clears the stripe and changes nothing.
    return unsure(req, `the check did not complete: ${(err as Error).message}`, Date.now() - t0, m.chat);
  }

  const confidence = Math.min(1, Math.max(0, result.confidence));
  const out: VerificationResult = { verification_id: req.verification_id, part_id: req.part_id, verdict: result.verdict, confidence, evidence: result.evidence, model: m.chat, ms: Date.now() - t0 };

  // Only a confident verdict is worth recording; an `unsure` one would just add noise to the history.
  if (out.verdict !== "unsure" && confidence >= 0.8) {
    const now = new Date().toISOString();
    await ctx.store.appendEvent(input.assemblyId, {
      event_id: `evt_${ulid()}`, assembly_id: input.assemblyId, version: null, timestamp: now, client_timestamp: now,
      kind: "verification", part_id: req.part_id, source: "camera_verification", confidence, actor: "camera",
      verification_id: req.verification_id, verdict: out.verdict, note: out.evidence,
    });
  }
  return out;
}
