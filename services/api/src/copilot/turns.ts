import { join } from "node:path";
import type { CopilotResponse } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { getEs, INDEX } from "../search/client.js";
import { writeJsonAtomic } from "../store/fs.js";

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
 * The turn log. Three jobs: keep the last few turns so follow-ups like "and after that?" work,
 * put every turn on the Director page, and index it for the Elastic story. Disk is the record;
 * Elasticsearch is rebuildable, so a dead cluster never costs us a turn.
 */
export class Turns {
  private recent = new Map<string, TurnRecord[]>();

  constructor(private ctx: Ctx) {}

  /** The format Michael indexes, matching knowledge/mappings/cutonce-copilot-turns.json. */
  static doc(t: TurnRecord) {
    return {
      "@timestamp": t.asked_at, turn_id: t.response.turn_id, assembly_id: t.assembly_id,
      transcript: t.response.transcript, answer_text: t.response.answer_text,
      selected_part_id: t.selected_part_id, highlight_parts: t.response.highlight_parts,
      chunk_ids: t.chunk_ids, timings_ms: t.response.timings_ms, cached: t.response.cached,
    };
  }

  record(t: TurnRecord) {
    const list = this.recent.get(t.assembly_id) ?? [];
    list.push(t);
    this.recent.set(t.assembly_id, list.slice(-HISTORY));
    writeJsonAtomic(join(this.ctx.cfg.dataDir, "turns", `${t.response.turn_id}.json`), t);
    this.ctx.store.bus.emit("broadcast", { type: "copilot_turn", turn: { ...t.response, selected_part_id: t.selected_part_id, chunk_ids: t.chunk_ids } });
    void this.index(t);
  }

  private async index(t: TurnRecord) {
    const es = getEs(this.ctx.cfg);
    if (!es) return;
    try { await es.index({ index: INDEX.turns, id: t.response.turn_id, document: Turns.doc(t) }); }
    catch (err) { this.ctx.cfg.logLevel !== "silent" && console.warn(`copilot turn not indexed: ${(err as Error).message}`); }
  }

  /** The last few exchanges, oldest first, for the prompt's follow-up context. */
  history(assemblyId: string, n = 2) {
    return (this.recent.get(assemblyId) ?? []).slice(-n).map((t) => ({ transcript: t.response.transcript, answer_text: t.response.answer_text }));
  }

  get = (turnId: string): TurnRecord | null =>
    [...this.recent.values()].flat().find((t) => t.response.turn_id === turnId) ?? null;
}
