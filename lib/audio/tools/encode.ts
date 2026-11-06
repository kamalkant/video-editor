/**
 * Writing sound files for the audio tools: MP3 (LAME, in JavaScript), WAV, WebM/Opus and M4A/AAC
 * (the browser's own encoders, WebCodecs, where it has them), and reading any file the browser can play.
 */
import { encodeWav, resample, type Pcm } from "./pcm";

export type AudioFormat = "mp3" | "wav" | "webm" | "m4a";

export const FORMATS: Record<AudioFormat, { label: string; ext: string; mime: string; detail: string; lossy: boolean }> = {
  mp3: { label: "MP3", ext: "mp3", mime: "audio/mpeg", detail: "Plays everywhere: phones, WhatsApp, music players.", lossy: true },
  m4a: { label: "M4A (AAC)", ext: "m4a", mime: "audio/mp4", detail: "Small and good quality; iPhone, YouTube.", lossy: true },
  webm: { label: "WebM (Opus)", ext: "webm", mime: "audio/webm", detail: "Smallest for speech; browsers and Android.", lossy: true },
  wav: { label: "WAV", ext: "wav", mime: "audio/wav", detail: "Uncompressed, full quality; large files.", lossy: false },
};

export type Progress = (fraction: number) => void;
const tick = () => new Promise((r) => setTimeout(r, 0));

const toInt16 = (f: Float32Array) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

const MP3_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];

/** MP3 at a constant bitrate (kbps). Rates MP3 can't carry are converted to the nearest one it can. */
export async function encodeMp3(p0: Pcm, kbps = 192, progress: Progress = () => {}): Promise<Uint8Array> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const rate = MP3_RATES.reduce((best, r) => (Math.abs(r - p0.sampleRate) < Math.abs(best - p0.sampleRate) ? r : best), 44100);
  const p = resample(p0, rate);
  const stereo = p.channels.length > 1;
  const enc = new Mp3Encoder(stereo ? 2 : 1, rate, kbps);
  const left = toInt16(p.channels[0]);
  const right = stereo ? toInt16(p.channels[1]) : undefined;
  const parts: Uint8Array[] = [];
  const CHUNK = 1152 * 64;
  for (let i = 0; i < left.length; i += CHUNK) {
    const out = enc.encodeBuffer(left.subarray(i, i + CHUNK), right?.subarray(i, i + CHUNK));
    if (out.length) parts.push(new Uint8Array(out));
    if ((i / CHUNK) % 8 === 0) {
      progress(i / left.length);
      await tick();
    }
  }
  parts.push(new Uint8Array(enc.flush()));
  progress(1);
  const total = parts.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of parts) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

/** Can this browser encode the format? (MP3 and WAV always.) */
export async function canEncode(format: AudioFormat, channels = 2, sampleRate = 48000): Promise<boolean> {
  if (format === "mp3" || format === "wav") return true;
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const r = await AudioEncoder.isConfigSupported({ codec: format === "webm" ? "opus" : "mp4a.40.2", sampleRate, numberOfChannels: channels, bitrate: 128000 });
    return !!r.supported;
  } catch {
    return false;
  }
}

/** Opus in WebM, or AAC in M4A, with the browser's encoder. */
async function encodeWebCodecs(p0: Pcm, format: "webm" | "m4a", kbps: number, progress: Progress): Promise<Uint8Array> {
  // Opus works at 48 kHz; AAC at 44.1 or 48
  const rate = format === "webm" ? 48000 : p0.sampleRate === 44100 ? 44100 : 48000;
  const p = resample(p0, rate);
  const channels = Math.min(2, p.channels.length);
  const codec = format === "webm" ? "opus" : "mp4a.40.2";
  let addChunk: (c: EncodedAudioChunk, m?: EncodedAudioChunkMetadata) => void;
  let finish: () => Uint8Array;
  if (format === "webm") {
    const { Muxer, ArrayBufferTarget } = await import("webm-muxer");
    const muxer = new Muxer({ target: new ArrayBufferTarget(), audio: { codec: "A_OPUS", sampleRate: rate, numberOfChannels: channels } });
    addChunk = (c, m) => muxer.addAudioChunk(c, m);
    finish = () => {
      muxer.finalize();
      return new Uint8Array(muxer.target.buffer);
    };
  } else {
    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const muxer = new Muxer({ target: new ArrayBufferTarget(), audio: { codec: "aac", sampleRate: rate, numberOfChannels: channels }, fastStart: "in-memory" });
    addChunk = (c, m) => muxer.addAudioChunk(c, m);
    finish = () => {
      muxer.finalize();
      return new Uint8Array(muxer.target.buffer);
    };
  }
  let failure: unknown = null;
  const encoder = new AudioEncoder({ output: (c, m) => addChunk(c, m), error: (e) => (failure = e) });
  encoder.configure({ codec, sampleRate: rate, numberOfChannels: channels, bitrate: kbps * 1000 });
  const n = p.channels[0].length;
  const FRAME = 4800; // 0.1 s
  for (let i = 0; i < n; i += FRAME) {
    if (failure) throw failure;
    const len = Math.min(FRAME, n - i);
    const planar = new Float32Array(len * channels);
    for (let c = 0; c < channels; c++) planar.set(p.channels[c].subarray(i, i + len), c * len);
    const data = new AudioData({ format: "f32-planar", sampleRate: rate, numberOfFrames: len, numberOfChannels: channels, timestamp: Math.round((i / rate) * 1e6), data: planar });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 20) await tick();
    if ((i / FRAME) % 50 === 0) progress(i / n);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  progress(1);
  return finish();
}

/** Encode in the chosen format; kbps is ignored for WAV. */
export async function encodeAudio(p: Pcm, format: AudioFormat, kbps = 192, progress: Progress = () => {}): Promise<Uint8Array> {
  if (format === "wav") return encodeWav(p);
  if (format === "mp3") return encodeMp3(p, kbps, progress);
  return encodeWebCodecs(p, format, kbps, progress);
}

/** Read any sound (or video's sound) the browser can play into PCM. */
export async function decodeAudio(bytes: ArrayBuffer): Promise<Pcm> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    return { sampleRate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice()) };
  } catch {
    throw new Error("This file's sound could not be read. Try MP3, WAV, M4A, OGG, WebM, or a video file.");
  } finally {
    void ctx.close();
  }
}

/** A short PCM preview for an <audio> element (WAV, so it plays instantly). */
export const previewUrl = (p: Pcm) => URL.createObjectURL(new Blob([encodeWav(p) as BlobPart], { type: "audio/wav" }));
