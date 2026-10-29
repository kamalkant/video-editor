/** A drift (seconds, at speed 1) a playing video is steered back from, and one it is seeked from. */
const STEER = 0.12;
const SEEK = 1.2;

/**
 * How a playing <video> at `current` is kept at `want` (seconds of its file) at speed `rate`: a small drift is
 * steered (2 % faster or slower), only a big one seeked (a seek empties the decoder: the picture jumps and
 * stutters). The same rule as the editor's preview (components/editor/ProgramPlayer).
 */
export function playSync(current: number, want: number, rate: number): { rate: number; seek?: number } {
  const drift = want - current;
  if (Math.abs(drift) > SEEK * rate) return { rate, seek: want };
  if (Math.abs(drift) > STEER * rate) return { rate: rate * (drift > 0 ? 1.02 : 0.98) };
  return { rate };
}
