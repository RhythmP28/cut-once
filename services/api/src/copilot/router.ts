import { z, type ZodTypeAny } from "zod";
import type { Config } from "../config.js";
import { jsonCall, type JsonCall } from "../llm.js";
import type { CopilotModels } from "./models.js";

export const Routed = z.object({ flow: z.enum(["question", "build_ideas", "modify_design"]), confidence: z.number().min(0).max(1) });
export type Routed = z.infer<typeof Routed>;
/** Below this the copilot asks back rather than guessing a flow. */
export const ROUTE_MIN = 0.7;
export interface RouteInput { transcript: string; mode: string; ideaTitles: string[] }
type Call = (cfg: Config, call: JsonCall<ZodTypeAny>) => Promise<unknown>;

export const ROUTER_SYSTEM = [
  "You route one spoken sentence for Cut Once, a mixed-reality build assistant. Pick exactly one flow:",
  "- build_ideas: they want ideas for what to build or make from the things around them, or want the room scanned again.",
  "  e.g. \"what can I build\", \"what could we make with this stuff\", \"can I build a shelf with these\", \"scan again\", \"look at this too\".",
  "- modify_design: ideas are on show or a build is under way, and they want a different or changed design.",
  "  e.g. \"make it taller\", \"use the other box\", \"something for my phone instead\", \"a smaller one\".",
  "- question: everything else: how to do the current step, where a piece goes, why, what something is, whether it is right.",
  "  e.g. \"how do I build the shelf\", \"where does this go\", \"why the cans at the back\", \"is this straight\", \"what's next\".",
  "If no ideas are on show and no build is under way, modify_design is unlikely. Give your confidence from 0 to 1.",
].join("\n");

/** Which flow a spoken turn wants. Null means "treat it as a question": no key, a timeout, an error or a malformed answer. */
export async function routeTurn(cfg: Config, m: CopilotModels, input: RouteInput, call: Call = jsonCall): Promise<Routed | null> {
  if (!cfg.openaiKey) return null;
  const work = call(cfg, {
    name: "route", model: m.router, schema: Routed, system: ROUTER_SYSTEM, timeoutMs: m.budgets.route,
    text: `MODE: ${input.mode}\nIDEAS ON SHOW: ${input.ideaTitles.join(", ") || "none"}\nSAID: "${input.transcript}"`,
  }).then((r) => Routed.parse(r));
  const timeout = new Promise<null>((resolve) => { const t = setTimeout(() => resolve(null), m.budgets.route); t.unref?.(); });
  try { return await Promise.race([work, timeout]); } catch { return null; }
}
