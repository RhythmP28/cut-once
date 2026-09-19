import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { Config } from "../config.js";
import { ensureDir } from "../store/fs.js";
import type { CopilotModels } from "./models.js";

interface Job { chunks: Buffer[]; done: boolean; failed: string | null; waiters: (() => void)[] }

/**
 * Speech for one turn. The pipeline answers the headset at t≈3.6 s while the audio is still being
 * generated, so `GET /v1/audio/:turn_id` must be able to stream a job that has not finished yet.
 * Jobs live in memory for the session and on disk under data/runtime/audio so a good answer can be
 * promoted into the demo cache later.
 */
export class Speech {
  private jobs = new Map<string, Job>();

  constructor(private cfg: Config, private m: CopilotModels) { ensureDir(this.dir); }

  /** 16-bit signed little-endian mono, which is what the headset's PcmStreamPlayer expects. */
  get contentType() { return `audio/L16; rate=${this.m.sampleRate}; channels=1`; }
  private get dir() { return join(this.cfg.dataDir, "audio"); }
  path = (turnId: string) => join(this.dir, `${turnId}.pcm`);

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
      if (!this.cfg.elevenKey) throw new Error("ELEVENLABS_API_KEY is not set");
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.m.voiceId}/stream?output_format=pcm_${this.m.sampleRate}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": this.cfg.elevenKey, "content-type": "application/json", accept: "audio/pcm" },
        body: JSON.stringify({ text, model_id: this.m.ttsModel, voice_settings: { stability: 0.4, similarity_boost: 0.7, speed: 1.05 } }),
        signal: AbortSignal.timeout(this.m.budgets.tts),
      });
      if (!res.ok || !res.body) throw new Error(`ElevenLabs returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) { job.chunks.push(Buffer.from(chunk)); this.wake(job); }
      if (job.chunks.length > 0) writeFileSync(this.path(turnId), Buffer.concat(job.chunks));
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

  /** Bytes so far, for the Director page. */
  bytes = (turnId: string): number => (this.jobs.get(turnId)?.chunks ?? []).reduce((n, c) => n + c.length, 0);

  /** PCM that keeps up with generation. Falls back to the file on disk, which is how cached answers replay. */
  stream(turnId: string): Readable | null {
    const job = this.jobs.get(turnId);
    if (!job) return existsSync(this.path(turnId)) ? createReadStream(this.path(turnId)) : null;
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

  /** Copies a finished turn's audio somewhere permanent. Used by cache promotion. */
  copyTo(turnId: string, destination: string): boolean {
    const job = this.jobs.get(turnId);
    const data = job && job.chunks.length > 0 ? Buffer.concat(job.chunks)
      : existsSync(this.path(turnId)) ? readFileSync(this.path(turnId)) : null;
    if (!data) return false;
    ensureDir(dirname(destination));
    writeFileSync(destination, data);
    return true;
  }

  /** Makes a cached answer playable again through the same `GET /v1/audio/:turn_id` path. */
  adopt(turnId: string, pcm: Buffer) {
    this.jobs.set(turnId, { chunks: [pcm], done: true, failed: null, waiters: [] });
  }
}
