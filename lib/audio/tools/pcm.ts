/**
 * Plain sound (PCM) for the audio tools: trimming with fades, gain, mono, resampling, WAV writing, and
 * loudness measured the broadcast way (ITU-R BS.1770 / EBU R128: K-weighting, 400 ms blocks, gating).
 * No browser APIs: the same code runs in the tools and in the tests.
 */

export interface Pcm {
  sampleRate: number;
  /** one Float32Array per channel, samples in −1…1 */
  channels: Float32Array[];
}

export const duration = (p: Pcm) => (p.channels[0]?.length ?? 0) / p.sampleRate;

/** The part from `start` to `end` seconds, with linear fade-in and fade-out (seconds). */
export function trim(p: Pcm, start: number, end: number, fadeIn = 0, fadeOut = 0): Pcm {
  const len = p.channels[0]?.length ?? 0;
  const a = Math.max(0, Math.min(len, Math.round(start * p.sampleRate)));
  const b = Math.max(a, Math.min(len, Math.round(end * p.sampleRate)));
  const n = b - a;
  const fi = Math.min(n, Math.round(fadeIn * p.sampleRate));
  const fo = Math.min(n, Math.round(fadeOut * p.sampleRate));
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((ch) => {
      const out = ch.slice(a, b);
      for (let i = 0; i < fi; i++) out[i] *= i / fi;
      for (let i = 0; i < fo; i++) out[n - 1 - i] *= i / fo;
      return out;
    }),
  };
}

export function gain(p: Pcm, db: number): Pcm {
  const k = Math.pow(10, db / 20);
  return { sampleRate: p.sampleRate, channels: p.channels.map((ch) => ch.map((v) => v * k)) };
}

export function toMono(p: Pcm): Pcm {
  if (p.channels.length === 1) return p;
  const n = p.channels[0].length;
  const out = new Float32Array(n);
  for (const ch of p.channels) for (let i = 0; i < n; i++) out[i] += ch[i] / p.channels.length;
  return { sampleRate: p.sampleRate, channels: [out] };
}

/** Resample with linear interpolation (after a light low-pass when going down, against aliasing). */
export function resample(p: Pcm, rate: number): Pcm {
  if (rate === p.sampleRate) return p;
  const ratio = p.sampleRate / rate;
  return {
    sampleRate: rate,
    channels: p.channels.map((src0) => {
      let src = src0;
      if (ratio > 1) {
        // moving average over the ratio: a simple low-pass at the new Nyquist
        const w = Math.max(1, Math.round(ratio));
        src = new Float32Array(src0.length);
        let acc = 0;
        for (let i = 0; i < src0.length; i++) {
          acc += src0[i];
          if (i >= w) acc -= src0[i - w];
          src[i] = acc / Math.min(i + 1, w);
        }
      }
      const n = Math.round((src.length * rate) / p.sampleRate);
      const out = new Float32Array(n);
      const last = src.length - 1;
      for (let i = 0; i < n; i++) {
        const x = Math.min(last, i * ratio);
        const j = Math.floor(x);
        const f = x - j;
        out[i] = src[j] * (1 - f) + src[Math.min(last, j + 1)] * f;
      }
      return out;
    }),
  };
}

/** Highest absolute sample, in dBFS (−Infinity for silence). */
export function peakDb(p: Pcm): number {
  let peak = 0;
  for (const ch of p.channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** 16-bit PCM WAV file. */
export function encodeWav(p: Pcm): Uint8Array {
  const ch = p.channels.length;
  const n = p.channels[0]?.length ?? 0;
  const data = n * ch * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, p.sampleRate, true);
  v.setUint32(28, p.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, p.channels[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  return new Uint8Array(buf);
}

/** Read a 16-bit (or 24/32-bit int, 32-bit float) PCM WAV file. */
export function decodeWav(bytes: Uint8Array): Pcm {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let o = 12;
  let fmt = { format: 1, ch: 1, rate: 44100, bits: 16 };
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") fmt = { format: v.getUint16(o + 8, true), ch: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === "data") {
      const bps = fmt.bits / 8;
      const n = Math.floor(Math.min(size, bytes.length - o - 8) / (bps * fmt.ch));
      const channels = Array.from({ length: fmt.ch }, () => new Float32Array(n));
      let p = o + 8;
      for (let i = 0; i < n; i++)
        for (let c = 0; c < fmt.ch; c++) {
          let s: number;
          if (fmt.format === 3 && fmt.bits === 32) s = v.getFloat32(p, true);
          else if (fmt.bits === 16) s = v.getInt16(p, true) / 0x8000;
          else if (fmt.bits === 24) s = ((v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 0x800000);
          else if (fmt.bits === 32) s = v.getInt32(p, true) / 0x80000000;
          else s = (v.getUint8(p) - 128) / 128;
          channels[c][i] = s;
          p += bps;
        }
      return { sampleRate: fmt.rate, channels };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("WAV file has no sound data");
}

// ─── Loudness (BS.1770-4) ────────────────────────────────────────────────────

/** Biquad coefficients of the K-weighting filter's two stages, for any sample rate (from the analog prototypes). */
function kWeighting(rate: number) {
  // stage 1: high-shelf (+4 dB above ~1.5 kHz)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  // stage 2: high-pass (RLB, ~38 Hz)
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  K = Math.tan((Math.PI * f1) / rate);
  a0 = 1 + K / Q1 + K * K;
  const hp = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0] };
  return [shelf, hp];
}

function filter(x: Float32Array, { b, a }: { b: number[]; a: number[] }): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Integrated loudness in LUFS (−Infinity for silence or under 400 ms). */
export function integratedLoudness(p: Pcm): number {
  const rate = p.sampleRate;
  const stages = kWeighting(rate);
  const weighted = p.channels.slice(0, 5).map((ch) => stages.reduce((s, st) => filter(s, st), ch));
  // channel weights: L, R, C = 1; surrounds 1.41 (stereo files: both 1)
  const G = [1, 1, 1, 1.41, 1.41];
  const block = Math.round(0.4 * rate);
  const step = Math.round(0.1 * rate);
  const n = weighted[0]?.length ?? 0;
  const blocks: number[] = [];
  for (let start = 0; start + block <= n; start += step) {
    let z = 0;
    weighted.forEach((ch, c) => {
      let s = 0;
      for (let i = start; i < start + block; i++) s += ch[i] * ch[i];
      z += G[c] * (s / block);
    });
    blocks.push(z);
  }
  const lk = (z: number) => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter((z) => z > 0 && lk(z) > -70);
  if (!abs.length) return -Infinity;
  const mean = (zs: number[]) => zs.reduce((s, z) => s + z, 0) / zs.length;
  const rel = lk(mean(abs)) - 10;
  const gated = abs.filter((z) => lk(z) > rel);
  return lk(mean(gated.length ? gated : abs));
}

export interface NormalizePlan {
  /** dB to apply */
  gain: number;
  /** loudness before and after */
  before: number;
  after: number;
  /** the gain was held back so peaks stay under the ceiling */
  limitedByPeak: boolean;
}

/** How much to turn the sound up or down to reach `target` LUFS, keeping peaks at or under `ceiling` dBFS. */
export function planNormalize(p: Pcm, target: number, ceiling = -1): NormalizePlan {
  const before = integratedLoudness(p);
  if (!Number.isFinite(before)) return { gain: 0, before, after: before, limitedByPeak: false };
  let g = target - before;
  const peak = peakDb(p);
  let limitedByPeak = false;
  if (Number.isFinite(peak) && peak + g > ceiling) {
    g = ceiling - peak;
    limitedByPeak = true;
  }
  return { gain: g, before, after: before + g, limitedByPeak };
}
