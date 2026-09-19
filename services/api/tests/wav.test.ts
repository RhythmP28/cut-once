import { describe, expect, it } from "vitest";
import { SAMPLE_RATE, pcmToWav, tone, wavToPcm } from "../src/turns/wav.js";

describe("wav", () => {
  it("writes a canonical 44-byte header", () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(52);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(44);
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect([wav.readUInt32LE(16), wav.readUInt16LE(20), wav.readUInt16LE(22)]).toEqual([16, 1, 1]);
    expect([wav.readUInt32LE(24), wav.readUInt32LE(28), wav.readUInt16LE(32), wav.readUInt16LE(34)]).toEqual([SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16]);
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.subarray(44)).toEqual(pcm);
  });
  it("round-trips and rejects anything else", () => {
    const pcm = tone(0.5);
    expect(wavToPcm(pcmToWav(pcm, 16000))).toEqual({ pcm, sampleRate: 16000 });
    expect(() => wavToPcm(Buffer.from("definitely not a wav file, not even close"))).toThrow(/canonical/);
    const stereo = pcmToWav(Buffer.alloc(8)); stereo.writeUInt16LE(2, 22);
    expect(() => wavToPcm(stereo)).toThrow(/canonical/);
  });
  it("makes a tone that starts silent and is audible", () => {
    const pcm = tone(1);
    expect(pcm.length).toBe(SAMPLE_RATE * 2);
    expect(pcm.readInt16LE(0)).toBe(0);
    let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    expect(peak).toBeGreaterThan(5000);
  });
});
