import { ulid } from "ulid";
import type { CopilotAction, CopilotContext, CopilotResponse, RetrievedChunk } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { retrieve } from "../search/retrieve.js";
import { annotateFrame } from "./annotate.js";
import { ask, ground } from "./answer.js";
import type { DemoCache } from "./cache.js";
import { gather, searchQuery } from "./context.js";
import { isQuestion, matchFastPath } from "./fastpath.js";
import { markUp, type LegendRow } from "./marks.js";
import type { CopilotModels } from "./models.js";
import { ROUTE_MIN, routeTurn } from "./router.js";
import { transcribe } from "./stt.js";
import type { Speech } from "./tts.js";
import type { TurnMemory } from "./turns.js";

export interface QueryInput { assemblyId: string; context: CopilotContext; audio: Buffer; frame: Buffer | null; uploadMs: number }
export interface Deps { ctx: Ctx; models: CopilotModels; speech: Speech; turns: TurnMemory; cache: DemoCache }

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

const since = (t: number) => Date.now() - t;

/** The bar a model-proposed state change must clear; the same one verify.ts uses before recording a verdict. */
const MODEL_ACTION_MIN = 0.8;

/** Runs `work`, or gives up and resolves to null at the deadline. The work keeps running; only the wait ends. */
function withCap<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => { const t = setTimeout(() => resolve(null), ms); t.unref?.(); })]);
}

/**
 * Applies a voice action. The server owns the event log, so it writes the event and the headset
 * learns about it over the stream — the headset must NOT append its own event for the same command.
 * One rule for both sources: the fast path and a model-proposed mark_state go through here alike.
 */
async function applyAction(deps: Deps, assemblyId: string, action: CopilotAction, actor: string, how: { confidence: number; note: string }) {
  if (action.type !== "mark_state") return;
  const state = deps.ctx.store.getState(assemblyId);
  const now = new Date().toISOString();
  for (const partId of action.part_ids) {
    const previous = state.parts[partId]?.state ?? "missing";
    if (previous === action.new_state) continue;
    await deps.ctx.store.appendEvent(assemblyId, {
      event_id: `evt_${ulid()}`, assembly_id: assemblyId, version: null, timestamp: now, client_timestamp: now,
      kind: "part_state", part_id: partId, previous_state: previous, new_state: action.new_state,
      source: "voice", confidence: how.confidence, actor, note: how.note,
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

  // A missing key is a set-up problem to find at rehearsal, so it stays a 503. Anything else that stops us
  // hearing the question gets a spoken "ask again": in front of judges a reply beats an error.
  if (!ctx.cfg.openaiKey) throw new Error("OPENAI_API_KEY is not set");
  const sttStart = Date.now();
  let transcript = "";
  let sttFailed = false;
  try { transcript = await transcribe(ctx.cfg, m, input.audio); }
  catch (err) { sttFailed = true; log.warn({ turn: turnId, err: (err as Error).message }, "transcription failed"); }
  timings.stt = since(sttStart);
  if (!transcript) return unheard(deps, turnId, sttFailed, timings, t0, recordTurn);

  // Fast path: a spoken command is decided from the plan and the log, so it skips the model entirely.
  const fast = matchFastPath(transcript, { plan: g.plan, state: g.state, selectedPartId: input.context.selected_part_id, recentEvents: g.recentEvents, mode: input.context.mode });
  if (fast) {
    if (fast.action) await applyAction(deps, input.assemblyId, fast.action, "operator", { confidence: 1, note: fast.note ?? "spoken command" });
    speech.start(turnId, fast.answer_text);
    const response: CopilotResponse = {
      ...shell(turnId, transcript), answer_text: fast.answer_text, highlight_parts: fast.highlight_parts,
      action: fast.action, confidence: 1, audio_url: `/v1/audio/${turnId}`,
      timings_ms: { ...timings, fast_path: 1, total_to_response: since(t0) },
    };
    recordTurn(response, []);
    log.info({ turn: turnId, transcript, action: fast.action?.type ?? "none", ms: since(t0) }, "copilot fast path");
    return response;
  }

  // Build mode: saying an idea's name starts it. The titles live on the server, so no model is needed.
  if (input.context.mode === "build" && ctx.hooks.build) {
    try {
      const title = await ctx.hooks.build.startByName(transcript);
      if (title) return quick(deps, turnId, transcript, `Building the ${title.toLowerCase()}. Watch the pieces.`, null, timings, t0, recordTurn);
    } catch (err) {
      // The idea was picked but its run could not be made (a full disk, say). In front of judges a reply beats an error.
      log.warn({ turn: turnId, transcript, err: (err as Error).message }, "could not start the picked build idea");
      return quick(deps, turnId, transcript, "I couldn't start that build. Try again.", null, timings, t0, recordTurn, true);
    }
  }

  // Retrieval and annotation are independent of each other and of the model, so they overlap — and with the router.
  const { marks, legend } = markUp(input.context.visible_parts);
  const retrieveStart = Date.now();
  const retrieving = retrieve(ctx.cfg, { query: searchQuery(transcript, g.selected), projectId: g.plan.project_id, partId: input.context.selected_part_id, k: 5 }, log)
    .then((c) => { timings.retrieve = since(retrieveStart); return c; });
  retrieving.catch(() => {});      // a build-mode early return must not leave a rejection unhandled; the await below still throws
  const annotating = (async () => {
    if (!input.frame) return null; // no camera frame: the model answers from the tables and documents
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
  })();

  // The router decides the flow. Anything but a sure "question" skips the answer model entirely.
  const routeStart = Date.now();
  const routed = await routeTurn(ctx.cfg, m, { transcript, mode: input.context.mode, ideaTitles: ctx.hooks.build?.ideaTitles() ?? [] });
  timings.route = since(routeStart);
  if (routed && routed.flow !== "question") {
    if (routed.confidence < ROUTE_MIN) return quick(deps, turnId, transcript, "Do you want ideas for what to build, or an answer about this step?", null, timings, t0, recordTurn, true);
    if (routed.flow === "build_ideas") return quick(deps, turnId, transcript, "Let me see what you've got.", { type: "start_scan" }, timings, t0, recordTurn);
    // modify_design with nothing to rethink (no pile yet, or a build already under way) is answered like any question.
    if (ctx.hooks.build && (await ctx.hooks.build.rethink(transcript))) return quick(deps, turnId, transcript, "Let me rethink that.", null, timings, t0, recordTurn);
  }
  const [chunks, annotated] = await Promise.all([retrieving, annotating]);

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
  // The schema allows an empty string; the headset must never show and play nothing.
  if (!grounded.answer_text) Object.assign(grounded, { answer_text: "I don't have an answer for that. Try asking another way.", needs_clarification: true });
  // Blueprint §587: state changes come from commands. A model-proposed one is applied only for a sure,
  // unambiguous statement, never a question, and the log records it as the model's call with its confidence.
  const commanded = grounded.action && !isQuestion(transcript) && !grounded.needs_clarification && grounded.confidence >= MODEL_ACTION_MIN
    ? grounded.action : null;
  if (commanded) await applyAction(deps, input.assemblyId, commanded, "operator", { confidence: grounded.confidence, note: `model, from: "${transcript}"` });
  speech.start(turnId, grounded.answer_text);
  const response: CopilotResponse = {
    ...shell(turnId, transcript), ...grounded, action: commanded,
    audio_url: `/v1/audio/${turnId}`,
    timings_ms: { ...timings, ...(result.toolCalls.length ? { tool_calls: result.toolCalls.length } : {}), total_to_response: since(t0) },
  };
  recordTurn(response, chunks.map((c) => c.chunk_id));
  log.info({ turn: turnId, transcript, parts: response.highlight_parts.length, refs: response.drawing_refs.length, ms: since(t0) }, "copilot answered");
  return response;
}

/** A one-line spoken reply that skips the answer model (build-mode routing). */
function quick(
  deps: Deps, turnId: string, transcript: string, text: string, action: CopilotAction | null, timings: Record<string, number>, t0: number,
  recordTurn: (r: CopilotResponse, chunkIds: string[]) => void, clarify = false,
): CopilotResponse {
  deps.speech.start(turnId, text);
  const response: CopilotResponse = {
    ...shell(turnId, transcript), answer_text: text, action, confidence: 1, needs_clarification: clarify,
    audio_url: `/v1/audio/${turnId}`, timings_ms: { ...timings, total_to_response: since(t0) },
  };
  recordTurn(response, []);
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

/** Nothing usable was heard: say so out loud, so the operator knows to ask again. */
function unheard(
  deps: Deps, turnId: string, failed: boolean, timings: Record<string, number>, t0: number,
  recordTurn: (r: CopilotResponse, chunkIds: string[]) => void,
): CopilotResponse {
  const answer_text = failed ? "I couldn't hear that. Hold A and ask again." : "I didn't catch that. Hold A and ask again.";
  deps.speech.start(turnId, answer_text);
  const response: CopilotResponse = {
    ...shell(turnId, ""), answer_text, needs_clarification: true, audio_url: `/v1/audio/${turnId}`,
    timings_ms: { ...timings, unheard: 1, total_to_response: since(t0) },
  };
  recordTurn(response, []);
  return response;
}
