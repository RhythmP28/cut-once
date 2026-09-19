import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { Ctx } from "../app.js";
import { hasWebBuild } from "../config.js";

/** Serves the built web app, with a fallback so /director, /upload and /review/* all load it. Register this last. */
export async function staticRoutes(app: FastifyInstance, { cfg }: Ctx) {
  if (!hasWebBuild(cfg)) {
    app.get("/", async () => ({ ok: true, note: "the web app is not built yet: run `pnpm -F @cutonce/web build`" }));
    return;
  }
  await app.register(fastifyStatic, { root: cfg.webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0]!;
    if (req.method === "GET" && !path.startsWith("/v1/") && path !== "/health") return reply.sendFile("index.html");
    return reply.status(404).send({ error: { code: "not_found", message: `${req.method} ${path} does not exist` } });
  });
}
