import OpenAI, { toFile } from "openai";
import type { Config } from "../config.js";
import type { CopilotModels } from "./models.js";

/**
 * The spoken question, transcribed. 16 kHz mono WAV from the headset's MicRecorder.
 * Throws on a missing key or a failed call: without a transcript there is no turn to answer.
 */
export async function transcribe(cfg: Config, m: CopilotModels, audio: Buffer, filename = "turn.wav"): Promise<string> {
  if (!cfg.openaiKey) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey: cfg.openaiKey, timeout: m.budgets.stt, maxRetries: 0 });
  const file = await toFile(audio, filename, { type: "audio/wav" });
  const res = await client.audio.transcriptions.create({ file, model: m.stt });
  return (typeof res === "string" ? res : res.text).trim();
}
