import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../src/config.js";

// Kibana 9.4 x-pack/.../agent_builder/.../esql/schemas.ts accepts only these param types.
const ALLOWED = ["string", "integer", "float", "boolean", "date", "array"];
const dir = join(REPO_ROOT, "knowledge", "agent-builder", "tools");
const tools = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ f, t: JSON.parse(readFileSync(join(dir, f), "utf8")) }));

it("every ES|QL tool param uses a type Kibana 9.4 accepts", () => {
  for (const { f, t } of tools.filter(({ t }) => t.type === "esql"))
    for (const [name, p] of Object.entries<{ type: string }>(t.configuration.params ?? {})) expect(ALLOWED, `${f} ${name}`).toContain(p.type);
});

it("every ?param in a query is declared, and every declared param is used", () => {
  for (const { f, t } of tools.filter(({ t }) => t.type === "esql")) {
    const used = [...new Set([...(t.configuration.query as string).matchAll(/\?([a-z_]+)/g)].map((m) => m[1]))].sort();
    expect(Object.keys(t.configuration.params ?? {}).sort(), f).toEqual(used);
  }
});
