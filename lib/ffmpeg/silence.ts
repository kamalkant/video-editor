import type { Range } from "../edit/timeline";
import { runFfmpegLog, SAFE_INPUT } from "./run";

export type SilenceOptions = {
  /** dB, e.g. -35 */ noise: number;
  /** seconds */ minSilence: number;
};

/** Parse FFmpeg silencedetect output into ranges (an open silence at the end runs to `duration`). */
export function parseSilences(log: string, duration: number): Range[] {
  const out: Range[] = [];
  let start: number | null = null;
  for (const line of log.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  if (start !== null && duration > start) out.push({ start, end: duration });
  return out;
}

const g = globalThis as unknown as { __VDOSilences?: Map<string, Range[]> };
const cache = (g.__VDOSilences ??= new Map());

/** Quiet parts of the clip's sound (for "Remove silences"). Cached per video, range, and options. */
export async function detectSilences(
  key: string,
  path: string,
  duration: number,
  o: SilenceOptions,
  signal?: AbortSignal,
  range?: { start: number; duration: number },
): Promise<Range[]> {
  const ck = range
    ? `${key}|${range.start.toFixed(3)}|${range.duration.toFixed(3)}|${o.noise}|${o.minSilence}`
    : `${key}|${o.noise}|${o.minSilence}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const targetDur = range ? range.duration : duration;
  const inputArgs = range
    ? ["-ss", range.start.toFixed(3), "-t", range.duration.toFixed(3)]
    : [];
  const log = await runFfmpegLog(
    [
      ...SAFE_INPUT,
      ...inputArgs,
      "-i",
      path,
      "-map",
      "0:a:0",
      "-af",
      `silencedetect=noise=${o.noise}dB:d=${o.minSilence}`,
      "-f",
      "null",
      "-",
    ],
    { signal, timeoutMs: 120_000 },
  );
  const parsed = parseSilences(log, targetDur);
  const r = range
    ? parsed.map((rng) => ({ start: rng.start + range.start, end: rng.end + range.start }))
    : parsed;
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  cache.set(ck, r);
  return r;
}
