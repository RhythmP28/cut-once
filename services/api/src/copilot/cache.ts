import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CopilotResponse } from "@cutonce/schemas";
import type { Ctx } from "../app.js";
import { writeFileSync } from "node:fs";
import { ensureDir, readJson, writeJsonAtomic } from "../store/fs.js";
import { wavToPcm } from "../turns/wav.js";
import { normalise } from "./fastpath.js";
import type { Speech } from "./tts.js";
import type { TurnMemory } from "./turns.js";

export interface CacheEntry { scripted_query_id: string; transcript: string; response: CopilotResponse; promoted_at: string }

/**
 * Real answers from earlier runs, kept so a dead network never costs us a demo beat. Section 10:
 * cached answers are genuine pipeline output, flagged `cached: true` on the Director page — we do
 * not fake an answer, we replay one we earned.
 *
 * Two directories: `data/demo/demo_cache` ships with the repo and the APK; `data/runtime/demo_cache`
 * is what the Director page promotes into during rehearsal and wins on a clash. Audio is stored as
 * the same canonical WAV the TurnLog writes, so one format flows everywhere.
 */
export class DemoCache {
  constructor(private ctx: Ctx, private speech: Speech, private turns: TurnMemory) {}

  private get runtimeDir() { return join(this.ctx.cfg.dataDir, "demo_cache"); }
  private get bundledDir() { return join(this.ctx.cfg.repoRoot, "data", "demo", "demo_cache"); }
  private dirs = () => [this.runtimeDir, this.bundledDir];

  private entries(): CacheEntry[] {
    const seen = new Set<string>();
    const out: CacheEntry[] = [];
    for (const dir of this.dirs()) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
        const entry = readJson<CacheEntry>(join(dir, file));
        if (!entry || seen.has(entry.scripted_query_id)) continue;
        seen.add(entry.scripted_query_id);
        out.push(entry);
      }
    }
    return out;
  }

  list = (): { scripted_query_id: string; transcript: string; promoted_at: string; has_audio: boolean }[] =>
    this.entries().map((e) => ({ scripted_query_id: e.scripted_query_id, transcript: e.transcript, promoted_at: e.promoted_at, has_audio: this.audioFor(e.scripted_query_id) !== null }));

  private audioFor(scriptedQueryId: string): Buffer | null {
    for (const dir of this.dirs()) {
      const path = join(dir, `${scriptedQueryId}.wav`);
      if (existsSync(path)) { try { return wavToPcm(readFileSync(path)).pcm; } catch { return null; } }
    }
    return null;
  }

  /**
   * The cached answer for a scripted id, or for a question worded the same way. Re-registers the audio
   * under the fresh turn id so `GET /v1/audio/:turn_id` serves it exactly like a live answer.
   */
  lookup(turnId: string, opts: { scriptedQueryId?: string | null; transcript?: string | null }): CopilotResponse | null {
    const wanted = opts.scriptedQueryId ?? null;
    const said = opts.transcript ? normalise(opts.transcript) : null;
    const entry = this.entries().find((e) => (wanted && e.scripted_query_id === wanted) || (!!said && normalise(e.transcript) === said));
    if (!entry) return null;
    const pcm = this.audioFor(entry.scripted_query_id);
    if (pcm) this.speech.adopt(turnId, pcm);
    return { ...entry.response, turn_id: turnId, cached: true, audio_url: pcm ? `/v1/audio/${turnId}` : null };
  }

  /** `promote_cache` from the Director page: freeze a good live answer as the fallback for that question. */
  async promote(turnId: string, scriptedQueryId: string): Promise<void> {
    const turn = this.turns.get(turnId) ?? null;
    const response = turn?.response ?? this.ctx.turns.get(turnId);
    if (!response) throw new Error(`turn ${turnId} is not in this session's history`);
    const entry: CacheEntry = {
      scripted_query_id: scriptedQueryId, transcript: response.transcript,
      response: { ...response, cached: true }, promoted_at: new Date().toISOString(),
    };
    writeJsonAtomic(join(this.runtimeDir, `${scriptedQueryId}.json`), entry);
    const audio = this.ctx.turns.audioFile(turnId);
    if (audio) { ensureDir(this.runtimeDir); writeFileSync(join(this.runtimeDir, `${scriptedQueryId}.wav`), readFileSync(audio)); }
  }
}
