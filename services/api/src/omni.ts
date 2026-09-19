import OpenAI from "openai";
import type { ZodTypeAny, z } from "zod";
import type { Config } from "./config.js";
import { schemaFor, type JsonCall } from "./llm.js";

/** When a call answered: time to the first streamed text, the whole call, and how many tries it took. */
export interface OmniTiming { firstTokenMs: number | null; totalMs: number; attempts: number }

/** The JSON object in a model's text reply. Fences and prose around it are dropped. */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "no JSON object in the reply" };
  try { return { ok: true, value: JSON.parse(t.slice(start, end + 1)) }; }
  catch (err) { return { ok: false, error: `the JSON does not parse (${(err as Error).message})` }; }
}

const issues = (err: z.ZodError) => err.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");

/**
 * One call to the OMNI model (Qwen3.5-Omni through yibuapi's OpenAI-compatible API) that must return JSON matching
 * `schema`. The same input as the OpenAI helper, plus an optional voice clip, so a caller can switch providers.
 *
 * Why it differs from jsonCall: Alibaba documents Qwen-Omni as streaming its replies and offers no mode that forces
 * valid JSON. So the reply is streamed, the JSON is pulled out of the text, checked here, and asked for once more
 * with the reason when it is wrong. One deadline covers both tries, and aborts a reply still streaming at the end.
 */
export async function omniJsonCall<S extends ZodTypeAny>(cfg: Config, call: JsonCall<S>, timing?: (t: OmniTiming) => void): Promise<z.infer<S>> {
  if (!cfg.omniKey || !cfg.omniBaseUrl) throw new Error("OMNI_API_KEY and OMNI_BASE_URL must both be set");
  const budget = call.timeoutMs ?? 60_000, t0 = Date.now(), deadline = t0 + budget;
  const client = new OpenAI({ apiKey: cfg.omniKey, baseURL: cfg.omniBaseUrl, timeout: budget, maxRetries: 0 });
  const system = `${call.system}\n\nReply with ONE JSON object and nothing else: no prose, no code fences. It must match this JSON Schema:\n${JSON.stringify(schemaFor(call))}`;
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: call.text },
    ...(call.images ?? []).map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}` } })),
    ...(call.audio ? [{
      type: "input_audio" as const,
      // Alibaba's examples send a data URL with no media type; OpenAI's shape is bare base64. OMNI_AUDIO picks.
      input_audio: { data: cfg.omniAudio === "base64" ? call.audio.data.toString("base64") : `data:;base64,${call.audio.data.toString("base64")}`, format: call.audio.format },
    }] : []),
  ];
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }, { role: "user", content }];
  let firstToken: number | null = null, why = "out of time";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), left);
    let text = "";
    try {
      const stream = await client.chat.completions.create(
        { model: call.model ?? cfg.omniModel, messages, stream: true, modalities: ["text"] }, { signal: abort.signal });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (!delta) continue;
        if (firstToken === null) firstToken = Date.now() - t0;
        text += delta;
      }
    } finally { clearTimeout(timer); }
    const parsed = extractJson(text);
    const checked = parsed.ok ? call.schema.safeParse(parsed.value) : null;
    if (checked?.success) { timing?.({ firstTokenMs: firstToken, totalMs: Date.now() - t0, attempts: attempt }); return checked.data; }
    why = checked ? issues(checked.error) : parsed.ok ? "invalid" : parsed.error;
    messages.push({ role: "assistant", content: text || "(nothing)" }, { role: "user", content: `That reply was not valid (${why}). Reply again with the JSON object only.` });
  }
  throw new Error(`the OMNI model did not return valid JSON: ${why}`);
}
