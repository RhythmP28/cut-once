import type { FastifyInstance } from "fastify";
import type { Ctx } from "../app.js";

export function streamRoutes(app: FastifyInstance, { cfg, hub }: Ctx) {
  app.get<{ Querystring: { token?: string; client?: string; id?: string } }>("/v1/stream", { websocket: true }, (socket, req) => {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
    if ((req.query.token ?? bearer) !== cfg.apiToken) { socket.close(4401, "unauthorized"); return; }
    hub.add(socket, req.query.client === "quest" ? "quest" : "web", (req.query.id ?? "anonymous").slice(0, 64));
  });
}
