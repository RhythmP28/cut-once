import { existsSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { monotonicFactory } from "ulid";
import { S, TurnId, type CopilotContext, type CopilotResponse } from "@cutonce/schemas";
import { badRequest } from "../errors.js";
import type { Bus } from "../store/bus.js";
import { ensureDir, readJson, writeJsonAtomic } from "../store/fs.js";
import { pcmToWav } from "./wav.js";

const nextUlid = monotonicFactory();

/**
 * Every copilot answer, on disk: data/copilot/turns/<turn_id>/{response.json,context.json,audio.wav}.
 * The real copilot (Rhythm's) and the fake one both write here, so the Director page, the audio route and
 * the simulations never care which one answered.
 */
export class TurnLog {
  private readonly dir: string;

  constructor(dataDir: string, private readonly bus: Bus) {
    this.dir = join(dataDir, "copilot", "turns");
    ensureDir(this.dir);
  }

  /** Lowercase monotonic ULIDs sort in the order they were made. */
  newTurnId = (): string => `turn_${nextUlid().toLowerCase()}`;

  private turnDir(turnId: string): string {
    if (!TurnId.safeParse(turnId).success) throw badRequest(`${turnId} is not a turn id`);
    return join(this.dir, turnId);
  }

  record(response: CopilotResponse, context: CopilotContext | null = null): void {
    const r = S.CopilotResponse.parse(response);
    const dir = this.turnDir(r.turn_id);
    writeJsonAtomic(join(dir, "response.json"), r);
    if (context) writeJsonAtomic(join(dir, "context.json"), context);
    this.bus.emit("broadcast", { type: "copilot_turn", turn: r as unknown as Record<string, unknown> });
  }

  saveAudio(turnId: string, pcm: Buffer): void {
    const dir = this.turnDir(turnId);
    ensureDir(dir);
    const tmp = join(dir, `audio.wav.${process.pid}.tmp`);
    writeFileSync(tmp, pcmToWav(pcm));
    renameSync(tmp, join(dir, "audio.wav"));
  }

  get = (turnId: string): CopilotResponse | null => readJson<CopilotResponse>(join(this.turnDir(turnId), "response.json"));

  list(limit = 20): CopilotResponse[] {
    return readdirSync(this.dir).filter((d) => d.startsWith("turn_")).sort().reverse().slice(0, limit)
      .map((d) => readJson<CopilotResponse>(join(this.dir, d, "response.json")))
      .filter((r): r is CopilotResponse => r !== null);
  }

  audioFile(turnId: string): string | null {
    const p = join(this.turnDir(turnId), "audio.wav");
    return existsSync(p) ? p : null;
  }
}
