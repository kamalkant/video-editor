/**
 * Beat finding for "Beat markers": pure maths on mono samples, so it runs on the server
 * (FFmpeg decodes the sound) and in tests alike. Log-energy onsets → tempo by
 * autocorrelation (60–180 BPM, leaning towards ~120) → the beat grid placed where the
 * onsets are strongest → each beat nudged onto its nearest onset.
 */

export type BeatResult = { bpm: number; beats: number[] };

const FRAME = 1024;
const HOP = 512;

/** How strongly something starts in each hop of the sound (≥ 0). */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; hopSeconds: number } {
  const n = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const logE = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let e = 0;
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) e += samples[o + i] * samples[o + i];
    logE[f] = Math.log(1e-9 + e / FRAME);
  }
  const env = new Float32Array(n);
  for (let f = 1; f < n; f++) env[f] = Math.max(0, logE[f] - logE[f - 1]);
  // take away the slowly changing part so only real starts stand out
  const out = new Float32Array(n);
  const w = 8;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, f - w); k <= Math.min(n - 1, f + w); k++) {
      sum += env[k];
      cnt++;
    }
    out[f] = Math.max(0, env[f] - sum / cnt);
  }
  // a little blur, so beats that don't fall on whole hops still line up (a 0.5 s beat is 21.5 hops)
  const smooth = new Float32Array(n);
  const kernel = [1, 2, 3, 2, 1];
  for (let f = 0; f < n; f++) {
    let sum = 0;
    let wsum = 0;
    for (let k = -2; k <= 2; k++) {
      const j = f + k;
      if (j < 0 || j >= n) continue;
      sum += out[j] * kernel[k + 2];
      wsum += kernel[k + 2];
    }
    smooth[f] = sum / wsum;
  }
  return { env: smooth, hopSeconds: HOP / sampleRate };
}

/** A sound that starts in hop f really starts about ¾ of a frame later (where the energy jump is). */
const ONSET_DELAY = 0.75 * FRAME;

/** Beats (seconds from the start of the samples) and the tempo; empty when there is no steady beat. */
export function findBeats(samples: Float32Array, sampleRate: number): BeatResult {
  const { env, hopSeconds } = onsetEnvelope(samples, sampleRate);
  const n = env.length;
  if (n < 32) return { bpm: 0, beats: [] };
  const minLag = Math.max(1, Math.round(60 / 180 / hopSeconds));
  const maxLag = Math.min(n - 1, Math.round(60 / 60 / hopSeconds));
  const score = new Float64Array(maxLag + 2);
  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let f = lag; f < n; f++) ac += env[f] * env[f - lag];
    // prefer tempos near 120 BPM (a log-gaussian weight), like most beat trackers
    const bpm = 60 / (lag * hopSeconds);
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.0) ** 2);
    score[lag] = (ac / (n - lag)) * weight;
    if (score[lag] > best) {
      best = score[lag];
      bestLag = lag;
    }
  }
  if (!bestLag || best <= 0) return { bpm: 0, beats: [] };
  // between whole hops: the top of a parabola through the best lag and its neighbours
  const a = score[bestLag - 1] ?? 0;
  const c = score[bestLag + 1] ?? 0;
  const denom = a - 2 * best + c;
  const period = denom < 0 ? bestLag + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : bestLag;
  // where the grid sits: the offset whose beats land on the strongest onsets
  let bestPhase = 0;
  let bestSum = -1;
  for (let ph = 0; ph < period; ph += 0.5) {
    let sum = 0;
    for (let x = ph; x < n; x += period) sum += env[Math.round(x)] ?? 0;
    if (sum > bestSum) {
      bestSum = sum;
      bestPhase = ph;
    }
  }
  // each beat moves onto the strongest onset close to it (an eighth of a beat either way)
  const reach = Math.max(1, Math.round(period / 8));
  const beats: number[] = [];
  const delay = ONSET_DELAY * (hopSeconds / HOP);
  for (let x = bestPhase; x < n; x += period) {
    const f = Math.min(n - 1, Math.round(x));
    let at = f;
    for (let k = Math.max(0, f - reach); k <= Math.min(n - 1, f + reach); k++) if (env[k] > env[at]) at = k;
    const t = Math.round((at * hopSeconds + delay) * 1000) / 1000;
    if (!beats.length || t - beats[beats.length - 1] > period * hopSeconds * 0.5) beats.push(t);
  }
  return { bpm: Math.round((60 / (period * hopSeconds)) * 10) / 10, beats };
}

/** Every beat, every 2nd, or every 4th (a bar in 4/4), starting from the first. */
export function everyNth(beats: number[], n: 1 | 2 | 4): number[] {
  return beats.filter((_, i) => i % n === 0);
}
