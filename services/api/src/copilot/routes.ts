import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { S, type CopilotContext, type VerificationRequest } from "@cutonce/schemas";
import type { Ctx, Plugin } from "../app.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import { DemoCache } from "./cache.js";
import { DebugCaptures, DEBUG_PAGE } from "./debug.js";
import { newTurnId } from "./ids.js";
import { models } from "./models.js";
import { filePart, jsonPart, readMultipart } from "./multipart.js";
import { answerQuery } from "./pipeline.js";
import { Speech } from "./tts.js";
import { Turns } from "./turns.js";
import { verifyPart } from "./verify.js";

/**
 * Pillar C, plugged in whole. Nothing in the core imports this module: it registers its own routes
 * and hands the core a cache-promotion hook, so the copilot can be worked on (or switched off)
 * without touching anyone else's files.
 */
export const copilotRoutes: Plugin = (app: FastifyInstance, ctx: Ctx) => {
  const m = models(ctx.cfg);
  const speech = new Speech(ctx.cfg, m);
  const turns = new Turns(ctx);
  const cache = new DemoCache(ctx, speech, turns);
  const captures = new DebugCaptures(ctx.cfg);
  const deps = { ctx, models: m, speech, turns, cache };

  // The Director page's `promote_cache` command reaches the cache through here.
  ctx.hooks.promoteCache = (turnId, scriptedQueryId) => cache.promote(turnId, scriptedQueryId);

  const requireAssembly = (aid: string) => { ctx.store.getAssembly(aid); return aid; };

  app.post<{ Params: { aid: string } }>("/v1/assemblies/:aid/copilot/query", async (req) => {
    const started = Date.now();
    const aid = requireAssembly(req.params.aid);
    const parsed = await readMultipart(req);
    const uploadMs = Date.now() - started;

    const context = S.CopilotContext.safeParse(jsonPart(parsed, "context"));
    if (!context.success) throw badRequest("the `context` field is not a CopilotContext", context.error.issues);
    const audio = filePart(parsed, "audio");
    const frame = filePart(parsed, "frame");
    captures.put({ frame: frame.buffer, audio: audio.buffer, mime: frame.mime, note: `query on ${aid}`, context: context.data });

    try {
      return await answerQuery(deps, { assemblyId: aid, context: context.data as CopilotContext, audio: audio.buffer, frame: frame.buffer, uploadMs }, app.log);
    } catch (err) {
      // Everything recoverable is already handled inside the pipeline; this is a dead key or a dead network.
      app.log.error({ err: (err as Error).message }, "copilot query failed");
      throw new ApiError(503, "copilot_unavailable", (err as Error).message);
    }
  });

  app.get<{ Params: { turn_id: string } }>("/v1/audio/:turn_id", async (req, reply) => {
    const stream = speech.stream(req.params.turn_id);
    if (!stream) {
      const why = speech.failure(req.params.turn_id);
      throw why ? new ApiError(503, "tts_unavailable", why) : notFound(`audio for ${req.params.turn_id}`);
    }
    // Chunked on purpose: generation is still running, and the headset starts playing the first bytes.
    return reply.header("content-type", speech.contentType).header("cache-control", "no-store").send(stream);
  });

  app.post<{ Params: { aid: string } }>("/v1/assemblies/:aid/verify", async (req) => {
    const aid = requireAssembly(req.params.aid);
    const parsed = await readMultipart(req);
    const request = S.VerificationRequest.safeParse(jsonPart(parsed, "request"));
    if (!request.success) throw badRequest("the `request` field is not a VerificationRequest", request.error.issues);
    const frame = filePart(parsed, "frame");
    captures.put({ frame: frame.buffer, audio: null, mime: frame.mime, note: `verify ${request.data.part_id}`, context: null });
    return verifyPart(ctx, m, {
      assemblyId: aid, request: request.data as VerificationRequest, frame: frame.buffer,
      expectedView: parsed.files.expected_view?.buffer ?? null,
    });
  });

  app.get("/v1/copilot/cache", async () => ({ entries: cache.list() }));

  // ── G2's loop: the headset posts a frame and a clip, the /debug page shows them ────────────────
  app.post("/v1/copilot/debug/capture", async (req) => {
    const parsed = await readMultipart(req);
    let context: unknown = null;
    try { context = jsonPart(parsed, "context"); } catch { /* the context is optional here: G2 only needs pixels and sound */ }
    return captures.put({
      frame: parsed.files.frame?.buffer ?? null, audio: parsed.files.audio?.buffer ?? null,
      mime: parsed.files.frame?.mime ?? "application/octet-stream", note: parsed.fields.note ?? "debug capture", context,
    });
  });

  // Speaks any sentence through the real TTS path. This is how the headset speaker, casting audio
  // and the demo voice get tested without an OpenAI key or a full turn — and how the voice gets
  // warmed up before judging.
  app.post("/v1/copilot/debug/say", async (req) => {
    const body = z.object({ text: z.string().min(1).max(500) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { text }", body.error.issues);
    const turnId = newTurnId();
    speech.start(turnId, body.data.text);
    const firstByteMs = await speech.firstByteMs(turnId, Date.now(), m.budgets.tts);
    const failure = speech.failure(turnId);
    if (failure && firstByteMs === null) throw new ApiError(503, "tts_unavailable", failure);
    return { turn_id: turnId, audio_url: `/v1/audio/${turnId}`, first_byte_ms: firstByteMs };
  });

  app.get("/v1/copilot/debug/last", async () => captures.meta() ?? {});
  app.get("/v1/copilot/debug/frame.jpg", async (_req, reply) => {
    const frame = captures.frame();
    if (!frame) throw notFound("a captured frame");
    return reply.header("content-type", "image/jpeg").header("cache-control", "no-store").send(frame);
  });
  app.get("/v1/copilot/debug/audio.wav", async (_req, reply) => {
    const audio = captures.audio();
    if (!audio) throw notFound("captured audio");
    return reply.header("content-type", "audio/wav").header("cache-control", "no-store").send(audio);
  });

  // Outside /v1 so it loads without a bearer; every call it makes carries one.
  app.get("/debug", async (_req, reply) => reply.header("content-type", "text/html; charset=utf-8").send(DEBUG_PAGE));
};
