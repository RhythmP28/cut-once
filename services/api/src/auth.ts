import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";

/** Bearer token on every /v1 route. /health and the static web app are open; the stream also accepts ?token=. */
export function registerAuth(app: FastifyInstance, cfg: Config) {
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0]!;
    if (!path.startsWith("/v1/")) return;
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const query = path === "/v1/stream" ? (req.query as Record<string, string | undefined>).token : undefined;
    if (path === "/v1/stream") return; // the socket handler closes with 4401 so browsers see a clean close code
    if ((bearer ?? query) !== cfg.apiToken) {
      return reply.status(401).send({ error: { code: "unauthorized", message: "missing or wrong bearer token" } });
    }
  });
}
