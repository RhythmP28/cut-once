import type { FastifyInstance } from "fastify";
import { S, type CopilotContext, type CopilotResponse } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { ApiError, badRequest } from "../errors.js";
import { tone } from "./wav.js";

/** How long `fake_slow` waits: past the headset's 9 s cap, to test its cached-answer fallback. */
const SLOW_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A stand-in for the real copilot when COPILOT_MODE=fake: same route, same packets, answers built from
 * the plan, a tone for audio. It needs no keys, so the headset team and the simulations can test the
 * whole question-and-answer path before (or without) the real copilot.
 *
 * scripted_query_id values with special meaning: fake_done (answers with a mark_state action),
 * fake_error (500), fake_slow (waits 10 s).
 */
export function fakeCopilotRoutes(app: FastifyInstance, { cfg, store, turns }: Ctx) {
  if (cfg.copilotMode !== "fake") return;

  app.post<{ Params: { aid: string } }>("/v1/assemblies/:aid/copilot/query", async (req) => {
    const started = Date.now();
    if (!req.isMultipart()) throw badRequest("send multipart/form-data with context, audio and frame");
    let raw: string | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") await part.toBuffer(); // the fake reads no audio or pixels, but must drain them
      else if (part.fieldname === "context") raw = String(part.value);
    }
    if (raw === undefined) throw badRequest("the context field is missing");
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw badRequest("context is not valid JSON"); }
    const parsed = S.CopilotContext.safeParse(json);
    if (!parsed.success) throw badRequest("context does not match the CopilotContext schema", parsed.error.issues);
    const context: CopilotContext = parsed.data;
    if (context.assembly_id !== req.params.aid) throw badRequest(`context.assembly_id ${context.assembly_id} does not match the URL`);
    store.getAssembly(req.params.aid); // 404 for an unknown run
    const plan = store.planOf(req.params.aid);

    if (context.scripted_query_id === "fake_error") throw new ApiError(500, "fake_error", "the fake copilot failed on purpose (fake_error)");
    if (context.scripted_query_id === "fake_slow") await sleep(SLOW_MS);
    if (cfg.fakeCopilotDelayMs > 0) await sleep(cfg.fakeCopilotDelayMs);

    const part = plan.parts.find((p) => p.part_id === context.selected_part_id) ?? null;
    const step = part ? plan.steps.find((s) => s.step_id === part.step_id) : undefined;
    const turnId = turns.newTurnId();
    const done = context.scripted_query_id === "fake_done" && part !== null;
    const answer = !part ? "Point at a part and ask again."
      : done ? `Marked ${part.name} built.`
      : `${part.name}: step ${step?.index ?? "?"}, ${step?.title ?? "not in a step"}.`;

    const response: CopilotResponse = {
      turn_id: turnId,
      transcript: "[fake] no speech recognition in fake mode",
      answer_text: answer,
      highlight_parts: part ? [part.part_id] : [],
      highlight_style: part?.kind === "cable" ? "path" : "pulse",
      drawing_refs: (part?.doc_refs ?? []).map((r) => ({
        document_id: r.document_id, ...(r.sheet_id ? { sheet_id: r.sheet_id } : {}), page: r.page, title: r.sheet_id ?? r.document_id,
      })),
      action: done ? { type: "mark_state", part_ids: [part.part_id], new_state: "built", source: "voice" } : null,
      confidence: part ? 1 : 0,
      needs_clarification: part === null,
      audio_url: `/v1/audio/${turnId}`,
      cached: false,
      timings_ms: { fake_delay: cfg.fakeCopilotDelayMs, total_to_response: Date.now() - started },
    };
    const words = answer.split(/\s+/).length;
    turns.saveAudio(turnId, tone(Math.min(4, Math.max(1, words * 0.3))));
    turns.record(response, context);
    return response;
  });
}
