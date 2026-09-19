import { execSync } from "node:child_process";
import type { FastifyInstance } from "fastify";
import type { Ctx } from "../app.js";
import { esStatus } from "../search/client.js";

let version = "dev";
try { version = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev"; } catch { /* not a git checkout */ }

export function healthRoutes(app: FastifyInstance, { cfg, store, hub }: Ctx) {
  app.get("/health", async () => ({
    ok: true, version, es: await esStatus(cfg), openai: cfg.openaiKey ? "set" : "unset", tts: cfg.elevenKey ? "set" : "unset",
    search_mode: cfg.searchMode, reconstruction: cfg.reconstruction ? "on" : "off",
    current_assembly: store.currentAssembly()?.assembly_id ?? null, clients: hub.presence().length,
  }));
}
