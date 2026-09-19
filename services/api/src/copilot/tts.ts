import { Readable } from "node:stream";
import type { Config } from "../config.js";
import { streamSpeech } from "./speech.js";
import type { TurnLog } from "../turns/turns.js";
import type { CopilotModels } from "./models.js";

interface Job { chunks: Buffer[]; done: boolean; failed: string | null; waiters: (() => void)[] }

/**
 * Speech for one turn, bridging two needs that pull in opposite directions:
 *  - the headset wants audio NOW, while ElevenLabs is still generating (that is what keeps first
 *    audio inside the budget), so chunks are handed out of memory as they arrive;
 *  - everything else (the browser's ?format=wav, cache promotion, the simulations) wants a finished
 *    file, so the whole clip lands in the shared TurnLog when generation ends.
 * The live PCM side is exposed through `hooks.audioStream`, which turns/routes.ts consults before
 * falling back to the file.
 */
export class Speech {
  private jobs = new Map<string, Job>();

  constructor(private cfg: Config, private m: CopilotModels, private turns: TurnLog) {}

  /** 16-bit signed little-endian mono: what the headset's PcmStreamPlayer plays with no decoder. */
  get contentType() { return `audio/L16; rate=${this.m.sampleRate}; channels=1`; }

  /** Starts generating in the background and returns at once. Never throws: a silent answer still shows its text. */
  start(turnId: string, text: string): void {
    const job: Job = { chunks: [], done: false, failed: null, waiters: [] };
    this.jobs.set(turnId, job);
    void this.run(turnId, text, job);
  }

  private wake(job: Job) { for (const w of job.waiters.splice(0)) w(); }
  private async settle(job: Job) { await new Promise<void>((resolve) => { job.waiters.push(resolve); setTimeout(resolve, 50); }); }

  private async run(turnId: string, text: string, job: Job) {
    try {
      // cfg.elevenVoiceId when set; otherwise Sarah, a premade voice — the category free accounts can
      // use over the API (Rachel is a "library" voice now and 402s on the free tier).
      const cfg = { ...this.cfg, elevenVoiceId: this.cfg.elevenVoiceId || this.m.voiceId };
      const stream = await streamSpeech(cfg, text);
      for await (const chunk of stream as AsyncIterable<Uint8Array>) { job.chunks.push(Buffer.from(chunk)); this.wake(job); }
      if (job.chunks.length > 0) this.turns.saveAudio(turnId, Buffer.concat(job.chunks));
    } catch (err) {
      job.failed = (err as Error).message;
    } finally {
      job.done = true;
      this.wake(job);
    }
  }

  /** Milliseconds from `since` to the first byte of audio, or null if none arrived. This is the G6 number. */
  async firstByteMs(turnId: string, since: number, capMs: number): Promise<number | null> {
    const job = this.jobs.get(turnId);
    if (!job) return null;
    const deadline = Date.now() + capMs;
    while (job.chunks.length === 0 && !job.done && Date.now() < deadline) await this.settle(job);
    return job.chunks.length > 0 ? Date.now() - since : null;
  }

  failure = (turnId: string): string | null => this.jobs.get(turnId)?.failed ?? null;

  /**
   * Live PCM that keeps pace with generation, or null once this session no longer holds the job in
   * memory — then the caller reads the finished file from the TurnLog instead.
   */
  stream(turnId: string): Readable | null {
    const job = this.jobs.get(turnId);
    if (!job || (job.done && job.chunks.length === 0)) return null;
    const settle = () => this.settle(job);
    return Readable.from((async function* () {
      let sent = 0;
      for (;;) {
        while (sent < job.chunks.length) yield job.chunks[sent++]!;
        if (job.done) return;
        await settle();
      }
    })());
  }

  /** Makes a cached answer playable through the same live path as a fresh one. */
  adopt(turnId: string, pcm: Buffer) {
    this.jobs.set(turnId, { chunks: [pcm], done: true, failed: null, waiters: [] });
    this.turns.saveAudio(turnId, pcm);
  }
}
