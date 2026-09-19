import { ulid } from "ulid";
import type { CopilotAction, CopilotContext, CopilotResponse, RetrievedChunk } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { retrieve } from "../search/retrieve.js";
import { annotateFrame } from "./annotate.js";
import { ask, ground } from "./answer.js";
import type { DemoCache } from "./cache.js";
import { gather, searchQuery } from "./context.js";
import { matchFastPath } from "./fastpath.js";
import { markUp, type LegendRow } from "./marks.js";
import type { CopilotModels } from "./models.js";
import { transcribe } from "./stt.js";
import type { Speech } from "./tts.js";
import type { TurnMemory } from "./turns.js";

export interface QueryInput { assemblyId: string; context: CopilotContext; audio: Buffer; frame: Buffer; uploadMs: number }
export interface Deps { ctx: Ctx; models: CopilotModels; speech: Speech; turns: TurnMemory; cache: DemoCache }

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

const since = (t: number) => Date.now() - t;

/** Runs `work`, or gives up and resolves to null at the deadline. The work keeps running; only the wait ends. */
function withCap<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => { const t = setTimeout(() => resolve(null), ms); t.unref?.(); })]);
}

/**
 * Applies a voice action. The server owns the event log, so it writes the event and the headset
 * learns about it over the stream — the headset must NOT append its own event for the same command.
 * One rule for both sources: the fast path and a model-proposed mark_state go through here alike.
 */
async function applyAction(deps: Deps, assemblyId: string, action: CopilotAction, actor: string) {
  if (action.type !== "mark_state") return;
  const state = deps.ctx.store.getState(assemblyId);
  const now = new Date().toISOString();
  for (const partId of action.part_ids) {
    const previous = state.parts[partId]?.state ?? "missing";
    if (previous === action.new_state) continue;
    await deps.ctx.store.appendEvent(assemblyId, {
      event_id: `evt_${ulid()}`, assembly_id: assemblyId, version: null, timestamp: now, client_timestamp: now,
      kind: "part_state", part_id: partId, previous_state: previous, new_state: action.new_state,
      source: "voice", confidence: 1, actor, note: "spoken command",
    });
  }
}

const shell = (turnId: string, transcript: string): CopilotResponse => ({
  turn_id: turnId, transcript, answer_text: "", highlight_parts: [], highlight_style: "pulse", drawing_refs: [],
  action: null, confidence: 0, needs_clarification: false, audio_url: null, cached: false, timings_ms: {},
});

/**
 * One question, one answer. The stage order and every timeout come from section 10's latency budget;
 * each stage records its own milliseconds so the Director page can show where a slow turn went.
 */
export async function answerQuery(deps: Deps, input: QueryInput, log: Log): Promise<CopilotResponse> {
  const { ctx, models: m, speech, turns, cache } = deps;
  const t0 = Date.now();
  const turnId = turns.newTurnId();
  const timings: Record<string, number> = { upload: input.uploadMs };
  const g = gather(ctx.store, input.assemblyId, input.context);
  const recordTurn = (response: CopilotResponse, chunkIds: string[]) => turns.record({
    response, assembly_id: input.assemblyId, selected_part_id: input.context.selected_part_id,
    chunk_ids: chunkIds, scripted_query_id: input.context.scripted_query_id, asked_at: new Date().toISOString(),
  }, input.context);

  // A HUD query button sets scripted_query_id. That is an explicit "play the safe one", so it never
  // touches the model — it is the beat we rehearsed.
  if (input.context.scripted_query_id) {
    const hit = cache.lookup(turnId, { scriptedQueryId: input.context.scripted_query_id });
    if (hit) {
      const response = { ...hit, timings_ms: { ...timings, total_to_response: since(t0) } };
      recordTurn(response, []);
      return response;
    }
  }

  const sttStart = Date.now();
  const transcript = await transcribe(ctx.cfg, m, input.audio);
  timings.stt = since(sttStart);
  if (!transcript) throw new Error("nothing was said, or the audio was silent");

  // Fast path: a spoken command is decided from the plan and the log, so it skips the model entirely.
  const fast = matchFastPath(transcript, { plan: g.plan, state: g.state, selectedPartId: input.context.selected_part_id, recentEvents: g.recentEvents });
  if (fast) {
    await applyAction(deps, input.assemblyId, fast.action, "operator");
    speech.start(turnId, fast.answer_text);
    const response: CopilotResponse = {
      ...shell(turnId, transcript), answer_text: fast.answer_text, highlight_parts: fast.highlight_parts,
      action: fast.action, confidence: 1, audio_url: `/v1/audio/${turnId}`,
      timings_ms: { ...timings, fast_path: 1, total_to_response: since(t0) },
    };
    recordTurn(response, []);
    log.info({ turn: turnId, transcript, action: fast.action.type, ms: since(t0) }, "copilot fast path");
    return response;
  }

  // Retrieval and annotation are independent of each other and of the model, so they overlap.
  const { marks, legend } = markUp(input.context.visible_parts);
  const retrieveStart = Date.now();
  const [chunks, annotated] = await Promise.all([
    retrieve(ctx.cfg, { query: searchQuery(transcript, g.selected), projectId: g.plan.project_id, partId: input.context.selected_part_id, k: 5 }, log)
      .then((c) => { timings.retrieve = since(retrieveStart); return c; }),
    (async () => {
      const start = Date.now();
      try {
        const out = await annotateFrame(input.frame, marks);
        timings.annotate = since(start);
        return out;
      } catch (err) {
        // Annotation is an aid, not a requirement: the raw frame and the tables still answer the question.
        log.warn({ err: (err as Error).message }, "frame annotation failed; sending the raw frame only");
        timings.annotate = since(start);
        return null;
      }
    })(),
  ]);

  const llmStart = Date.now();
  const spent = since(t0);
  const result = await withCap(
    ask(ctx, m, {
      transcript, gathered: g, legend, chunks, mode: input.context.mode, turns: turns.history(input.assemblyId, 2),
      frames: { annotated, raw: input.frame },
    }),
    Math.max(1000, m.budgets.hardCap - spent),
  );
  timings.llm = since(llmStart);

  if (!result) {
    // Past the hard cap. Section 10: a cached answer, or text only — never a spinner in front of judges.
    log.warn({ turn: turnId, transcript, ms: since(t0) }, "copilot hit the hard cap");
    return capped(deps, turnId, transcript, input, timings, t0, chunks, recordTurn);
  }

  const grounded = ground(result.draft, g, chunks);
  if (grounded.action) await applyAction(deps, input.assemblyId, grounded.action, "operator");
  speech.start(turnId, grounded.answer_text);
  const response: CopilotResponse = {
    ...shell(turnId, transcript), ...grounded,
    audio_url: `/v1/audio/${turnId}`,
    timings_ms: { ...timings, ...(result.toolCalls.length ? { tool_calls: result.toolCalls.length } : {}), total_to_response: since(t0) },
  };
  recordTurn(response, chunks.map((c) => c.chunk_id));
  log.info({ turn: turnId, transcript, parts: response.highlight_parts.length, refs: response.drawing_refs.length, ms: since(t0) }, "copilot answered");
  return response;
}

function capped(
  deps: Deps, turnId: string, transcript: string, input: QueryInput, timings: Record<string, number>, t0: number,
  chunks: RetrievedChunk[], recordTurn: (r: CopilotResponse, chunkIds: string[]) => void,
): CopilotResponse {
  const hit = deps.cache.lookup(turnId, { scriptedQueryId: input.context.scripted_query_id, transcript });
  const response: CopilotResponse = hit
    ? { ...hit, transcript, timings_ms: { ...timings, total_to_response: since(t0) } }
    : { ...shell(turnId, transcript), answer_text: "I took too long on that one. Ask me again, or check the drawing on the laptop.", needs_clarification: true, timings_ms: { ...timings, capped: 1, total_to_response: since(t0) } };
  recordTurn(response, chunks.map((c) => c.chunk_id));
  return response;
}
