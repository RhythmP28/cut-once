import type { FastifyInstance } from "fastify";
import { S } from "@cutonce/schemas";
import type { Ctx, Plugin } from "../app.js";
import { badRequest } from "../errors.js";
import { BuildFiles, newId } from "./files.js";

/** A JPEG starts FF D8 FF ("/9j/" in base64). Checked before anything is saved: the labeller cannot read anything else. */
export const isJpeg = (b64: string) => b64.startsWith("/9j/");

export const buildRoutes: Plugin = (app: FastifyInstance, ctx: Ctx) => {
  const files = new BuildFiles(ctx.cfg.dataDir, ctx.cfg.repoRoot);
  let sessionId: string | null = null;

  app.post("/v1/build/scans", { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const body = S.BuildScanUpload.safeParse(req.body);
    if (!body.success) throw badRequest("body must be a BuildScanUpload", body.error.issues);
    const { cols, rows } = body.data.grid;
    if (body.data.points_mm.length !== 3 * cols * rows || body.data.hit.length !== cols * rows) {
      throw badRequest(`a ${cols} × ${rows} grid needs ${3 * cols * rows} numbers and ${cols * rows} hit flags`);
    }
    if (!isJpeg(body.data.photo_b64)) throw badRequest("photo_b64 must be a JPEG");
    if (!body.data.session_id || body.data.session_id !== sessionId) sessionId = body.data.session_id ?? newId("bsess");
    const scan = files.saveScan(body.data, sessionId);
    return reply.status(202).send({ scan_id: scan.scan_id, session_id: sessionId });
  });

  app.get("/v1/build/scans", async () => ({ scans: files.listScans() }));
};
