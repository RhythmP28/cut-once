import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number; host: string; dataDir: string; apiToken: string; publicBaseUrl: string;
  esUrl: string; esApiKey: string; kibanaUrl: string; mcpUrl: string; jinaEmbedId: string; jinaRerankId: string;
  searchMode: "bm25" | "hybrid"; openaiKey: string; openaiModel: string; elevenKey: string; elevenVoiceId: string; reconstruction: boolean;
  repoRoot: string; webDist: string; projectId: string; logLevel: string;
}

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..", "..");

export function loadConfig(env: Record<string, string | undefined> = process.env, overrides: Partial<Config> = {}): Config {
  const kibanaUrl = (env.KIBANA_URL ?? "").replace(/\/$/, "");
  const cfg: Config = {
    port: Number(env.PORT ?? 8080), host: env.HOST ?? "127.0.0.1",
    dataDir: resolve(REPO_ROOT, env.DATA_DIR ?? "./data/runtime"),
    apiToken: env.API_TOKEN || "dev-token", publicBaseUrl: (env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
    esUrl: env.ES_URL ?? "", esApiKey: env.ES_API_KEY ?? "", kibanaUrl,
    mcpUrl: env.AGENT_BUILDER_MCP_URL || (kibanaUrl ? `${kibanaUrl}/api/agent_builder/mcp` : ""),
    jinaEmbedId: env.JINA_EMBED_ID ?? "", jinaRerankId: env.JINA_RERANK_ID ?? "",
    searchMode: env.SEARCH_MODE === "hybrid" ? "hybrid" : "bm25",
    openaiKey: env.OPENAI_API_KEY ?? "", openaiModel: env.OPENAI_MODEL || "gpt-5.6-luna", elevenKey: env.ELEVENLABS_API_KEY ?? "", elevenVoiceId: env.ELEVENLABS_VOICE_ID ?? "",
    reconstruction: env.RECONSTRUCTION === "on", repoRoot: REPO_ROOT, webDist: join(REPO_ROOT, "apps", "web", "dist"),
    projectId: env.PROJECT_ID || "proj_cutonce_demo", logLevel: env.LOG_LEVEL ?? "info",
    ...overrides,
  };
  if (!env.API_TOKEN && !overrides.apiToken && env.NODE_ENV === "production") throw new Error("API_TOKEN must be set in production");
  return cfg;
}

export const hasWebBuild = (cfg: Config) => existsSync(join(cfg.webDist, "index.html"));
