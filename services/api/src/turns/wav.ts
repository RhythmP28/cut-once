/**
 * 16-bit mono PCM and its WAV wrapper. 22 050 Hz matches ElevenLabs' `pcm_22050` output, which the real
 * copilot streams; the headset plays raw PCM, a browser plays WAV.
 */
export const SAMPLE_RATE = 22050;

export function pcmToWav(pcm: Buffer, rate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);        // fmt chunk size
  header.writeUInt16LE(1, 20);         // PCM
  header.writeUInt16LE(1, 22);         // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);  // byte rate
  header.writeUInt16LE(2, 32);         // block align
  header.writeUInt16LE(16, 34);        // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Reads back exactly what pcmToWav writes. Anything else throws, so a bad file never plays as noise. */
export function wavToPcm(wav: Buffer): { pcm: Buffer; sampleRate: number } {
  const ok = wav.length >= 44
    && wav.toString("ascii", 0, 4) === "RIFF" && wav.toString("ascii", 8, 16) === "WAVEfmt "
    && wav.readUInt32LE(16) === 16 && wav.readUInt16LE(20) === 1 && wav.readUInt16LE(22) === 1
    && wav.readUInt16LE(34) === 16 && wav.toString("ascii", 36, 40) === "data"
    && wav.readUInt32LE(40) <= wav.length - 44;
  if (!ok) throw new Error("not a canonical 16-bit mono PCM WAV");
  return { pcm: wav.subarray(44, 44 + wav.readUInt32LE(40)), sampleRate: wav.readUInt32LE(24) };
}

/** A plain tone with 10 ms fades: the fake copilot's "voice", so audio playback can be tested without keys. */
export function tone(seconds: number, rate = SAMPLE_RATE, hz = 440): Buffer {
  const n = Math.round(seconds * rate);
  const fade = Math.max(1, Math.round(rate * 0.01));
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const envelope = Math.min(1, i / fade, (n - 1 - i) / fade);
    out.writeInt16LE(Math.round(8000 * envelope * Math.sin((2 * Math.PI * hz * i) / rate)), i * 2);
  }
  return out;
}
