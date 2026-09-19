import { Client } from "@elastic/elasticsearch";
import type { Config } from "../config.js";

let cached: { key: string; client: Client } | null = null;

/** Returns null when Elasticsearch is not configured: every caller must cope without it. */
export function getEs(cfg: Config): Client | null {
  if (!cfg.esUrl || !cfg.esApiKey) return null;
  const key = `${cfg.esUrl}|${cfg.esApiKey}`;
  if (cached?.key !== key) cached = { key, client: new Client({ node: cfg.esUrl, auth: { apiKey: cfg.esApiKey }, requestTimeout: 5000, maxRetries: 1 }) };
  return cached.client;
}

export async function esStatus(cfg: Config): Promise<"up" | "down" | "unset"> {
  const es = getEs(cfg);
  if (!es) return "unset";
  try { await es.ping({}, { requestTimeout: 1500 }); return "up"; } catch { return "down"; }
}

export const INDEX = {
  docs: "cutonce-docs", parts: "cutonce-parts", materials: "cutonce-materials", events: "cutonce-build-events",
  turns: "cutonce-copilot-turns", issues: "cutonce-issues",
} as const;
