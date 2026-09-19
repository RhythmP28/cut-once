import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { registerAuth } from "./auth.js";
import { boot } from "./boot.js";
import type { Config } from "./config.js";
import { ApiError, sendError } from "./errors.js";
import { coreRoutes } from "./routes/core.js";
import { directorRoutes } from "./routes/director.js";
import { streamRoutes } from "./routes/stream.js";
import { DocumentStore } from "./store/documents.js";
import { Store } from "./store/store.js";
import { TurnLog } from "./turns/turns.js";
import { Hub } from "./ws/hub.js";

/** Other modules (the copilot) plug optional behaviour in here without the core importing them. */
export interface Hooks { promoteCache?: (turnId: string, scriptedQueryId: string) => Promise<void> }
export interface Ctx { cfg: Config; store: Store; docs: DocumentStore; hub: Hub; hooks: Hooks; turns: TurnLog }
export type Plugin = (app: FastifyInstance, ctx: Ctx) => void | Promise<void>;

declare module "fastify" {
  interface FastifyInstance { ctx: Ctx }
}

export async function buildApp(cfg: Config, plugins: Plugin[] = []): Promise<FastifyInstance> {
  const app = Fastify({ logger: cfg.logLevel === "silent" ? false : { level: cfg.logLevel }, bodyLimit: 2 * 1024 * 1024 });
  const store = new Store(cfg.dataDir);
  const ctx: Ctx = { cfg, store, docs: new DocumentStore(cfg.dataDir), hub: new Hub(store), hooks: {}, turns: new TurnLog(cfg.dataDir, store.bus) };
  app.decorate("ctx", ctx);

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 4 } });
  await app.register(websocket);
  registerAuth(app, cfg);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return sendError(reply, err);
    const e = err as { code?: string; statusCode?: number; message: string };
    if (e.code === "FST_REQ_FILE_TOO_LARGE") return reply.status(413).send({ error: { code: "too_large", message: "files are limited to 25 MB" } });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: { code: "bad_request", message: e.message } });
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "unexpected server error" } });
  });

  coreRoutes(app, ctx);
  directorRoutes(app, ctx);
  streamRoutes(app, ctx);
  for (const plugin of plugins) await plugin(app, ctx);

  await boot(store, ctx.docs, cfg, app.log);
  app.addHook("onClose", async () => ctx.hub.close());
  return app;
}
