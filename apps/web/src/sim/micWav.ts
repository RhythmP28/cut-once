/** 16 kHz mono 16-bit WAV from the laptop microphone: the same format the headset sends (blueprint §10). */
export const MIC_RATE = 16000;

export interface Recording { stop: () => Promise<Blob> }

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
  const ctx = new AudioContext({ sampleRate: MIC_RATE });
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is old but everywhere, and simple enough for a push-to-talk clip.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor);
  processor.connect(ctx.destination);
  return {
    stop: async () => {
      processor.disconnect(); source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      return encodeWav(chunks, MIC_RATE);
    },
  };
}

export function encodeWav(chunks: Float32Array[], rate: number): Blob {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const str = (at: number, s: string) => { for (let i = 0; i < s.length; i++) buf.setUint8(at + i, s.charCodeAt(i)); };
  str(0, "RIFF"); buf.setUint32(4, 36 + samples * 2, true); str(8, "WAVEfmt ");
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true);
  str(36, "data"); buf.setUint32(40, samples * 2, true);
  let at = 44;
  for (const c of chunks) for (const v of c) { buf.setInt16(at, Math.max(-1, Math.min(1, v)) * 0x7fff, true); at += 2; }
  return new Blob([buf], { type: "audio/wav" });
}

/** A short silent clip, for scripted questions that have no speech. */
export const silentWav = (seconds = 0.1) => encodeWav([new Float32Array(Math.round(MIC_RATE * seconds))], MIC_RATE);
