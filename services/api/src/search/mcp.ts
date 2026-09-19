import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Config } from "../config.js";

let session: { key: string; client: Client } | null = null;

/**
 * Our server is the MCP client for Elastic Agent Builder: its endpoint wants `Authorization: ApiKey …`,
 * which a hosted MCP tool that only takes a bearer token cannot send.
 * Endpoint: {KIBANA_URL}/api/agent_builder/mcp. The key needs the Kibana privilege feature_agentBuilder.read.
 */
export async function mcpClient(cfg: Config): Promise<Client | null> {
  if (!cfg.mcpUrl || !cfg.esApiKey) return null;
  const key = `${cfg.mcpUrl}|${cfg.esApiKey}`;
  if (session?.key === key) return session.client;
  const client = new Client({ name: "cut-once-api", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(cfg.mcpUrl), { requestInit: { headers: { Authorization: `ApiKey ${cfg.esApiKey}` } } }));
  session = { key, client };
  return client;
}

export async function mcpListTools(cfg: Config): Promise<string[]> {
  const client = await mcpClient(cfg);
  return client ? (await client.listTools()).tools.map((t) => t.name) : [];
}

/** Agent Builder wraps every answer as {"results":[{type, data}]}. Return plain rows so MCP and the direct twins agree. */
export function unwrapAgentBuilder(value: unknown): unknown {
  const first = (value as { results?: { type?: string; data?: any }[] } | null)?.results?.[0];
  if (!first) return value;
  if (first.type === "error") throw new Error(`Agent Builder tool error: ${JSON.stringify(first.data).slice(0, 200)}`);
  if (first.type === "esql_results" && Array.isArray(first.data?.columns) && Array.isArray(first.data?.values)) {
    const cols = first.data.columns as { name: string }[];
    return (first.data.values as unknown[][]).map((row) => Object.fromEntries(cols.map((c, i) => [c.name, row[i]])));
  }
  return first.data;
}

export async function mcpCall(cfg: Config, name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = await mcpClient(cfg);
  if (!client) throw new Error("Agent Builder MCP is not configured");
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`tool ${name} returned an error`);
  const text = (res.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === "text")?.text;
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : res.structuredContent ?? res.content; } catch { return text; }
  return unwrapAgentBuilder(parsed);
}

export const resetMcp = () => { session = null; };
