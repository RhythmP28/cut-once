import { expect, it } from "vitest";
import { CopilotAnswer, copilotAnswerSchema, keepKnown } from "../src/copilot/schema.js";
import { schemaFor, toOpenAiSchema } from "../src/llm.js";

const s = copilotAnswerSchema(["part_power_cable", "part_cable_tray"], ["chunk_desk_drawings_p2_1"]) as any;

it("lists exactly the allowed part and chunk ids", () => {
  expect(s.properties.highlight_parts.items.enum).toEqual(["part_power_cable", "part_cable_tray"]);
  expect(s.properties.chunk_ids.items.enum).toEqual(["chunk_desk_drawings_p2_1"]);
});
it("is strict: every key required, nothing extra, answer_text first", () => {
  expect(s.additionalProperties).toBe(false);
  expect(s.required).toEqual(Object.keys(s.properties));
  expect(Object.keys(s.properties)[0]).toBe("answer_text");
  const action = s.properties.action.anyOf[1];
  expect([action.additionalProperties, action.required]).toEqual([false, Object.keys(action.properties)]);
});
it("an empty list becomes a sentinel, never an empty enum", () =>
  expect((copilotAnswerSchema([], []) as any).properties.chunk_ids.items.enum).toEqual(["none"]));
it("parses a model answer and filters the sentinel and unknown ids", () => {
  const a = CopilotAnswer.parse({ answer_text: "Run it through the tray.", highlight_parts: ["part_power_cable", "none", "part_ghost"], highlight_style: "path", chunk_ids: ["none"], action: null, confidence: 0.9, needs_clarification: false });
  expect(keepKnown(a.highlight_parts, ["part_power_cable"])).toEqual(["part_power_cable"]);
  expect(keepKnown(a.chunk_ids, [])).toEqual([]);
});
it("jsonCall sends a supplied JSON Schema as-is, and converts Zod otherwise", () => {
  const Z = CopilotAnswer.strict();
  expect(schemaFor({ name: "x", system: "", text: "", schema: Z, jsonSchema: s })).toBe(s);
  expect(schemaFor({ name: "x", system: "", text: "", schema: Z })).toEqual(toOpenAiSchema(Z));
});
