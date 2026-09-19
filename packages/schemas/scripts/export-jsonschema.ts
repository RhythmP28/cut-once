import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Strict } from "../src/index.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "jsonschema");
mkdirSync(out, { recursive: true });

const names = [
  "Plan", "BuildEvent", "BuildState", "Assembly", "Seed", "PlanDraft", "CopilotContext", "CopilotResponse",
  "VerificationRequest", "VerificationResult", "Job", "RetrievedChunk", "DirectorCommand", "WsMessage", "SpatialAnchor",
] as const;

for (const name of names) {
  const schema = zodToJsonSchema(Strict[name], { name, $refStrategy: "none" });
  writeFileSync(join(out, `${name}.json`), JSON.stringify(schema, null, 2) + "\n");
}
console.log(`wrote ${names.length} JSON Schemas to ${out}`);
