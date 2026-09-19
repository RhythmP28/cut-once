import { z } from "zod";

const oneOf = (list: readonly string[]) => ({ type: "string", enum: list.length ? [...list] : ["none"] });

/**
 * Built per question: the model may only name parts in this plan and passages it was actually given.
 * Strict structured output then makes an invented id impossible; keepKnown() is the second check.
 * answer_text comes first because output follows key order, which lets speech start on the first sentence later.
 */
export function copilotAnswerSchema(partIds: readonly string[], chunkIds: readonly string[]): Record<string, unknown> {
  const properties = {
    answer_text: { type: "string", description: "At most two short spoken sentences. Say part names, never ids." },
    highlight_parts: { type: "array", items: oneOf(partIds) },
    highlight_style: { type: "string", enum: ["pulse", "path"] },
    chunk_ids: { type: "array", items: oneOf(chunkIds) },
    action: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["type", "part_ids", "new_state"],
      properties: { type: { type: "string", enum: ["mark_state"] }, part_ids: { type: "array", items: oneOf(partIds) }, new_state: { type: "string", enum: ["missing", "built", "wrong"] } } }] },
    confidence: { type: "number" },
    needs_clarification: { type: "boolean" },
  };
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

export const CopilotAnswer = z.object({
  answer_text: z.string(), highlight_parts: z.array(z.string()), highlight_style: z.enum(["pulse", "path"]), chunk_ids: z.array(z.string()),
  action: z.object({ type: z.literal("mark_state"), part_ids: z.array(z.string()), new_state: z.enum(["missing", "built", "wrong"]) }).nullable(),
  confidence: z.number(), needs_clarification: z.boolean(),
});
export type CopilotAnswer = z.infer<typeof CopilotAnswer>;

/** Second check after the schema: drop the sentinel and anything not in the plan. */
export const keepKnown = (ids: readonly string[], allowed: readonly string[]) => ids.filter((id) => id !== "none" && allowed.includes(id));
