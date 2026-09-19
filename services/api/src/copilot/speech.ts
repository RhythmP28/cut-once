import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Config } from "../config.js";

/**
 * Streams speech as raw 16-bit PCM, 22.05 kHz, mono: it plays straight into Unity's audio callback with no decoder.
 * optimizeStreamingLatency is 3, not 4: level 4 turns off text normalisation and can mispronounce "70 cm" (SDK source).
 */
export async function streamSpeech(cfg: Config, text: string) {
  if (!cfg.elevenKey || !cfg.elevenVoiceId) throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set");
  const client = new ElevenLabsClient({ apiKey: cfg.elevenKey });
  return client.textToSpeech.stream(cfg.elevenVoiceId, { text, modelId: "eleven_flash_v2_5", outputFormat: "pcm_22050", optimizeStreamingLatency: 3 });
}
