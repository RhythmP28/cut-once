import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { S } from "@cutonce/schemas";
import type { Ctx, Plugin } from "../app.js";
import { ApiError, badRequest } from "../errors.js";
import { jsonCall } from "../llm.js";
import { loadRules, loadVocab } from "./data.js";
import { BuildSessions } from "./session.js";

/** Build mode (the Lego Movie). Models: OPENAI_LABEL_MODEL and OPENAI_IDEAS_MODEL, each defaulting to OPENAI_MODEL. */
/** A JPEG starts FF D8 FF ("/9j/" in base64). Checked before anything is saved: the labeller cannot read anything else. */
export const isJpeg = (b64: string) => b64.startsWith("/9j/");

export const buildRoutes: Plugin = (app: FastifyInstance, ctx: Ctx) => {
  const vocab = loadVocab(ctx.cfg.repoRoot);
  const rules = loadRules(ctx.cfg.repoRoot, vocab);
  const sessions = new BuildSessions(ctx, {
    vocab, rules, call: jsonCall, log: app.log,
    models: { label: process.env.OPENAI_LABEL_MODEL || ctx.cfg.openaiModel, ideas: process.env.OPENAI_IDEAS_MODEL || ctx.cfg.openaiModel },
  });
  ctx.hooks.build = {
    rethink: (request) => sessions.rethink(request), startByName: (transcript) => sessions.startByName(transcript),
    ideaTitles: () => sessions.ideaTitles(), idle: () => sessions.idle(),
  };

  app.post("/v1/build/scans", { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const body = S.BuildScanUpload.safeParse(req.body);
    if (!body.success) throw badRequest("body must be a BuildScanUpload", body.error.issues);
    const { cols, rows } = body.data.grid;
    if (body.data.points_mm.length !== 3 * cols * rows || body.data.hit.length !== cols * rows) {
      throw badRequest(`a ${cols} × ${rows} grid needs ${3 * cols * rows} numbers and ${cols * rows} hit flags`);
    }
    if (!isJpeg(body.data.photo_b64)) throw badRequest("photo_b64 must be a JPEG");
    return reply.status(202).send(sessions.accept(body.data));
  });
  app.get("/v1/build/scans", async () => ({ scans: sessions.files.listScans() }));
  app.post<{ Params: { scan_id: string } }>("/v1/build/scans/:scan_id/replay", async (req) => {
    const body = z.object({ labels: z.enum(["saved", "live"]).default("saved") }).safeParse(req.body ?? {});
    if (!body.success) throw badRequest("body must be { labels: \"saved\" | \"live\" }");
    return sessions.replay(req.params.scan_id, body.data.labels);
  });
  app.post("/v1/build/sessions", async () => ({ session_id: sessions.newSession().session_id }));
  app.get("/v1/build/sessions/current", async () => {
    const s = sessions.current();
    return { session: s ? { session_id: s.session_id, created_at: s.created_at, scans: s.scans } : null, surfaces: s?.surfaces ?? [], twins: s?.twins ?? [], ideas: s?.ideas ?? [] };
  });
  app.post("/v1/build/ideas/rethink", async (req) => {
    const body = z.object({ request: z.string().min(1).max(300) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { request }");
    return { accepted: await sessions.rethink(body.data.request) };
  });
  app.post<{ Params: { idea_id: string } }>("/v1/build/ideas/:idea_id/start", async (req) => sessions.startIdea(req.params.idea_id));
  app.post("/v1/build/objects", async (req) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { name }");
    return sessions.addObject(body.data.name);
  });
  app.get("/v1/build/vocabulary", async () => ({ items: [...vocab.values()].map(({ name, label }) => ({ name, label })) }));
  app.post("/v1/build/say", async (req) => {
    const body = z.object({ text: z.string().min(1).max(400) }).safeParse(req.body);
    if (!body.success) throw badRequest("body must be { text }");
    const said = ctx.hooks.say?.(body.data.text);
    if (!said) throw new ApiError(503, "tts_unavailable", "the copilot's voice is not running");
    return said;
  });
};
