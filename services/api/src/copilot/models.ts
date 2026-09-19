import type { Config } from "../config.js";

/**
 * Pillar C's own knobs. They are read from the environment here rather than added to `Config`
 * so the copilot module stays a self-contained plug-in: no core file has to change to tune it.
 *
 * `OPENAI_COPILOT_MODEL` is the G0 escape hatch. If the default model turns out not to accept
 * images, set it to the vision-capable one and nothing else in the repo has to move.
 */
export interface CopilotModels {
  chat: string; stt: string; voiceId: string; ttsModel: string;
  sampleRate: number;
  budgets: { stt: number; retrieve: number; llm: number; tool: number; tts: number; hardCap: number; verify: number; retainAudio: number };
}

const num = (v: string | undefined, fallback: number) => (Number.isFinite(Number(v)) && v ? Number(v) : fallback);

export function models(cfg: Config, env: Record<string, string | undefined> = process.env): CopilotModels {
  return {
    chat: env.OPENAI_COPILOT_MODEL || cfg.openaiModel,
    stt: env.OPENAI_STT_MODEL || "gpt-transcribe",
    // Sarah, one of ElevenLabs' premade voices. Premade is the category free accounts can use over the
    // API — Rachel is a "library" voice now and 402s on the free tier, which is exactly the kind of
    // surprise that must not happen mid-demo.
    voiceId: env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL",
    ttsModel: env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
    sampleRate: num(env.COPILOT_PCM_RATE, 22050),
    budgets: {
      stt: num(env.COPILOT_STT_MS, 3000),
      retrieve: num(env.COPILOT_RETRIEVE_MS, 800),
      llm: num(env.COPILOT_LLM_MS, 6000),
      tool: num(env.COPILOT_TOOL_MS, 2000),
      tts: num(env.COPILOT_TTS_MS, 8000),
      // Section 10's hard cap: past this the headset gets a cached answer instead of a spinner.
      hardCap: num(env.COPILOT_CAP_MS, 9000),
      verify: num(env.COPILOT_VERIFY_MS, 8000),
      // How long finished answer audio stays in memory for live streaming; after that it is read from disk.
      retainAudio: num(env.COPILOT_AUDIO_RETAIN_MS, 60_000),
    },
  };
}
