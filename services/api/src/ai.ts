import type { ZodTypeAny } from "zod";
import type { AiJob, AiProvider, Config } from "./config.js";
import { jsonCall, type JsonCall } from "./llm.js";
import { omniJsonCall } from "./omni.js";

/** One model call that must return JSON matching the call's schema, on either provider. */
export type ModelCall = (cfg: Config, call: JsonCall<ZodTypeAny>) => Promise<unknown>;
/** A job's provider, the model it uses there, and the helper that calls it. */
export interface AiCall { provider: AiProvider; model: string; call: ModelCall }

const other = (p: AiProvider): AiProvider => (p === "omni" ? "openai" : "omni");

/** Can this provider be called at all? OMNI needs its key and yibuapi's address. */
export const ready = (cfg: Config, p: AiProvider) => (p === "omni" ? Boolean(cfg.omniKey && cfg.omniBaseUrl) : Boolean(cfg.openaiKey));

/**
 * A job's model on a provider. OpenAI's come from the settings the repo already had: the copilot's answer model for
 * the spoken turn (OPENAI_COPILOT_MODEL), OPENAI_LABEL_MODEL and OPENAI_IDEAS_MODEL, each defaulting to OPENAI_MODEL.
 */
export function modelFor(cfg: Config, job: AiJob, p: AiProvider, env: Record<string, string | undefined> = process.env): string {
  if (p === "omni") return job === "ideas" ? cfg.omniIdeasModel || cfg.omniModel : cfg.omniModel;
  if (job === "label") return env.OPENAI_LABEL_MODEL || cfg.openaiModel;
  if (job === "ideas") return env.OPENAI_IDEAS_MODEL || cfg.openaiModel;
  return env.OPENAI_COPILOT_MODEL || cfg.openaiModel;
}

/**
 * Who does a build-mode job: the provider its setting names (KIT_AI, KIT_TURN_AI…), or the other one when that has no
 * key, or nobody (null: names come from sizes, designs from the cache or the rules). `prefer` asks for one provider,
 * as the spoken turn's fallback does.
 */
export function aiFor(cfg: Config, job: AiJob, prefer: AiProvider = cfg.kitAi[job], env: Record<string, string | undefined> = process.env): AiCall | null {
  const p = ready(cfg, prefer) ? prefer : ready(cfg, other(prefer)) ? other(prefer) : null;
  if (!p) return null;
  return { provider: p, model: modelFor(cfg, job, p, env), call: p === "omni" ? omniJsonCall : jsonCall };
}
