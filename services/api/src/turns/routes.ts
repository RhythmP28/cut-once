import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Ctx } from "../app.js";
import { notFound } from "../errors.js";
import { SAMPLE_RATE, wavToPcm } from "./wav.js";

/** Answer audio and the answer log. Always on, whichever copilot (real or fake) is answering. */
export function turnRoutes(app: FastifyInstance, { turns }: Ctx) {
  // The headset plays raw PCM (blueprint §14); a browser needs ?format=wav.
  app.get<{ Params: { turn_id: string }; Querystring: { format?: string } }>("/v1/audio/:turn_id", async (req, reply) => {
    const file = turns.audioFile(req.params.turn_id);
    if (!file) throw notFound(`audio for ${req.params.turn_id}`);
    const wav = readFileSync(file);
    reply.header("cache-control", "no-store");
    if (req.query.format === "wav") return reply.type("audio/wav").send(wav);
    const { pcm, sampleRate } = wavToPcm(wav);
    return reply
      .type(`audio/L16; rate=${sampleRate}; channels=1`)
      .header("x-audio-format", `s16le; rate=${sampleRate || SAMPLE_RATE}; channels=1`)
      .send(pcm);
  });

  app.get<{ Querystring: { limit?: string } }>("/v1/copilot/turns", async (req) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    return { turns: turns.list(limit) };
  });

  app.get<{ Params: { turn_id: string } }>("/v1/copilot/turns/:turn_id", async (req) => {
    const turn = turns.get(req.params.turn_id);
    if (!turn) throw notFound(`turn ${req.params.turn_id}`);
    return turn;
  });
}
