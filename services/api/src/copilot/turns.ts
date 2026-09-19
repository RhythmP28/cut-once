import type { CopilotContext, CopilotResponse } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { getEs, INDEX } from "../search/client.js";

export interface TurnRecord {
  response: CopilotResponse;
  assembly_id: string;
  selected_part_id: string | null;
  chunk_ids: string[];
  scripted_query_id: string | null;
  asked_at: string;
}

const HISTORY = 8;

/**
 * The live copilot's memory around the shared TurnLog. The TurnLog (services/api/src/turns) owns the
 * disk record, the broadcast and the audio file — both copilots write there, so the Director page and
 * the sims never care who answered. This wrapper adds what only the live one needs: the last few turns
 * for follow-ups ("and after that?"), and the Elasticsearch index for the Elastic story.
 */
export class TurnMemory {
  private recent = new Map<string, TurnRecord[]>();

  constructor(private ctx: Ctx) {}

  newTurnId = () => this.ctx.turns.newTurnId();

  /** The document shape Michael indexes: knowledge/mappings/cutonce-copilot-turns.json, field for field. */
  static doc(t: TurnRecord) {
    return {
      "@timestamp": t.asked_at, turn_id: t.response.turn_id, assembly_id: t.assembly_id,
      transcript: t.response.transcript, answer_text: t.response.answer_text,
      selected_part_id: t.selected_part_id, highlight_parts: t.response.highlight_parts,
      chunk_ids: t.chunk_ids, timings_ms: t.response.timings_ms, cached: t.response.cached,
    };
  }

  record(t: TurnRecord, context: CopilotContext | null = null) {
    const list = this.recent.get(t.assembly_id) ?? [];
    list.push(t);
    this.recent.set(t.assembly_id, list.slice(-HISTORY));
    this.ctx.turns.record(t.response, context); // persists and broadcasts copilot_turn
    void this.index(t);
  }

  private async index(t: TurnRecord) {
    const es = getEs(this.ctx.cfg);
    if (!es) return;
    try { await es.index({ index: INDEX.turns, id: t.response.turn_id, document: TurnMemory.doc(t) }); }
    catch { /* disk already has the turn; a dead cluster costs analytics, not the answer */ }
  }

  /** The last few exchanges, oldest first, for the prompt's follow-up context. */
  history(assemblyId: string, n = 2) {
    return (this.recent.get(assemblyId) ?? []).slice(-n).map((t) => ({ transcript: t.response.transcript, answer_text: t.response.answer_text }));
  }

  get = (turnId: string): TurnRecord | null =>
    [...this.recent.values()].flat().find((t) => t.response.turn_id === turnId) ?? null;
}
