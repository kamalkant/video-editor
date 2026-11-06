import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSlots, SlotAbortedError, type Slots } from "./slots";

// FFMPEG_PATH, else the copy scripts/fetch-ffmpeg.mjs put in vendor/ffmpeg (Linux hosts without FFmpeg), else the PATH
const vendored = (name: string) => {
  const p = join(/*turbopackIgnore: true*/ process.cwd(), "vendor", "ffmpeg", name);
  return existsSync(p) ? p : null;
};
export const FFMPEG = process.env.FFMPEG_PATH ?? vendored("ffmpeg") ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH ?? vendored("ffprobe") ?? "ffprobe";

/** Apple's hardware encoders (VideoToolbox: fast H.264, HEVC with transparency) exist only on a Mac. */
export const APPLE_MEDIA = process.platform === "darwin";
/** The fast H.264 encoder for working copies: Apple's hardware one on a Mac, else libx264. */
export const FAST_H264: "h264_videotoolbox" | "libx264" = APPLE_MEDIA ? "h264_videotoolbox" : "libx264";
/** Codec arguments for a fast H.264 working copy at about `kbps`. */
export const fastH264Args = (kbps: number): string[] =>
  APPLE_MEDIA ? ["-c:v", "h264_videotoolbox", "-b:v", `${kbps}k`, "-allow_sw", "1"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];

/** Only local files and pipes: an uploaded "video" can't make FFmpeg open URLs or other protocols. */
export const SAFE_INPUT = ["-protocol_whitelist", "file,pipe"] as const;

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly stderrTail: string,
    /** Why the program couldn't be started at all (ENOENT, EACCES, EAGAIN…), else undefined. */
    public readonly errno?: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

/**
 * "Not now" answers from the system: the account's limit on running programs/threads is full (shared hosting
 * counts every site's processes together) or memory is short for a moment. Worth waiting a little and trying again.
 */
export const BUSY_ERRNO = new Set(["EAGAIN", "ENOMEM"]);
const BUSY_STDERR = /Resource temporarily unavailable|Cannot allocate memory/i;

/** FFmpeg was refused by the system for a moment (not a bad file or a missing program). */
export function isBusyError(err: unknown): boolean {
  if (!(err instanceof FfmpegError)) return false;
  if (err.errno) return BUSY_ERRNO.has(err.errno);
  // started, but couldn't make its threads: it ends at once with the system's words
  return err.code !== null && err.code !== 0 && BUSY_STDERR.test(err.stderrTail);
}

/** Waits before each new try when the system says "not now": about 8 s in all. */
export const BUSY_RETRY_MS = [250, 500, 1000, 2000, 4000];

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", stop, { once: true });
  });

export class AbortedError extends Error {
  constructor() {
    super("Canceled");
    this.name = "AbortedError";
  }
}

export type RunOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Called with the output time in seconds, parsed from `-progress pipe:1`. */
  onProgress?: (outTimeSec: number) => void;
  /** Collect stdout (e.g. an image piped out). Ignored when onProgress is set. */
  collectStdout?: boolean;
  /** Collect a second output written by FFmpeg to `pipe:3`. */
  collectFd3?: boolean;
  /** Work nobody is waiting on right now (a preview copy, a proxy): it runs after people's requests (lib/ffmpeg/slots). */
  background?: boolean;
};

export type RunResult = { stdout: Buffer; fd3: Buffer; stderr: string };

/** Parse `key=value` lines from `-progress pipe:1`; returns seconds or null. */
export function parseProgressChunk(text: string): number | null {
  let last: number | null = null;
  for (const line of text.split("\n")) {
    const m = /^out_time_us=(\d+)/.exec(line.trim());
    if (m) last = Number(m[1]) / 1e6;
  }
  return last;
}

/** `bin` once; when the system refuses it for a moment (EAGAIN…), again after a short wait (BUSY_RETRY_MS). */
async function run(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    try {
      return await runOnce(bin, args, opts);
    } catch (err) {
      const wait = BUSY_RETRY_MS[attempt];
      // (a job that ran a while before failing isn't started over: only a start that was refused, or one that
      // ended at once because it couldn't make its threads)
      const atOnce = (err as FfmpegError).errno !== undefined || Date.now() - t0 < 5000;
      if (wait === undefined || !isBusyError(err) || !atOnce || opts.signal?.aborted) throw err;
      await sleep(wait, opts.signal);
    }
  }
}

function runOnce(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AbortedError());
    const stdio: ("ignore" | "pipe")[] = ["ignore", "pipe", "pipe"];
    if (opts.collectFd3) stdio.push("pipe");
    const child = spawn(bin, args, { stdio, shell: false });
    const out: Buffer[] = [];
    const fd3: Buffer[] = [];
    let stderr = "";
    let aborted = false;
    let progressBuf = "";

    child.stdout!.on("data", (d: Buffer) => {
      if (opts.onProgress) {
        progressBuf += d.toString();
        const nl = progressBuf.lastIndexOf("\n");
        if (nl >= 0) {
          const t = parseProgressChunk(progressBuf.slice(0, nl));
          progressBuf = progressBuf.slice(nl + 1);
          if (t !== null) opts.onProgress(t);
        }
      } else if (opts.collectStdout) out.push(d);
    });
    if (opts.collectFd3) (child.stdio[3] as NodeJS.ReadableStream).on("data", (d: Buffer) => fd3.push(d));
    child.stderr!.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-10000);
    });

    const kill = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    opts.signal?.addEventListener("abort", kill, { once: true });
    const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(new FfmpegError(`Could not start ${bin}: ${err.message}`, null, "", (err as NodeJS.ErrnoException).code));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", kill);
      if (aborted) return reject(opts.signal?.aborted ? new AbortedError() : new FfmpegError("Timed out", code, stderr.slice(-2000)));
      if (code !== 0) return reject(new FfmpegError(`${bin} exited with code ${code}`, code, stderr.slice(-2000)));
      resolve({ stdout: Buffer.concat(out), fd3: Buffer.concat(fd3), stderr });
    });
  });
}

/**
 * Threads per decoder, filter graph and encoder. FFmpeg's default is one per CPU core, which on shared
 * hosting (Hostinger: a big machine, a small per-account limit on threads) fails every job with
 * "Resource temporarily unavailable". FFMPEG_THREADS sets it (0 = FFmpeg's default); off a Mac it's 2.
 */
export const FFMPEG_THREADS = Number(process.env.FFMPEG_THREADS ?? (APPLE_MEDIA ? 0 : 2)) || 0;

/** `args` with the thread limit: before each input, for the filters, and for the (last) output. */
export function limitThreads(args: string[], n: number = FFMPEG_THREADS): string[] {
  if (!n || !args.includes("-i") || args.includes("-threads")) return args;
  const t = String(n);
  const out: string[] = ["-filter_threads", t, "-filter_complex_threads", t];
  args.forEach((a, i) => {
    if (a === "-i") out.push("-threads", t);
    if (i === args.length - 1) out.push("-threads", t);
    out.push(a);
  });
  return out;
}

/** FFmpeg jobs at once: off a Mac 3 (FFMPEG_JOBS sets it; 0 = no limit, as on a Mac). See lib/ffmpeg/slots. */
export const FFMPEG_JOBS = Number(process.env.FFMPEG_JOBS ?? (APPLE_MEDIA ? 0 : 3)) || 0;
const g = globalThis as unknown as { __viplaySlots?: Slots };
const slots = (g.__viplaySlots ??= createSlots(FFMPEG_JOBS));

/** FFmpeg, once a place is free (the wait doesn't count toward `timeoutMs`). */
async function inSlot(args: string[], opts: RunOptions | undefined): Promise<RunResult> {
  let release: () => void;
  try {
    release = await slots.acquire(!!opts?.background, opts?.signal);
  } catch (err) {
    throw err instanceof SlotAbortedError ? new AbortedError() : err;
  }
  try {
    return await run(FFMPEG, args, opts);
  } finally {
    release();
  }
}

export function runFfmpeg(args: string[], opts?: RunOptions): Promise<RunResult> {
  return inSlot(["-hide_banner", "-nostdin", "-loglevel", "error", ...limitThreads(args)], opts);
}

/** FFprobe, in the same places as FFmpeg (each is a program running on the account's limit). */
export async function runFfprobe(args: string[], opts?: RunOptions): Promise<string> {
  let release: () => void;
  try {
    release = await slots.acquire(!!opts?.background, opts?.signal);
  } catch (err) {
    throw err instanceof SlotAbortedError ? new AbortedError() : err;
  }
  try {
    const r = await run(FFPROBE, ["-hide_banner", "-v", "error", ...args], { ...opts, collectStdout: true });
    return r.stdout.toString();
  } finally {
    release();
  }
}

/** Run FFmpeg for its log output (e.g. volumedetect), which goes to stderr. */
export async function runFfmpegLog(args: string[], opts?: RunOptions): Promise<string> {
  const r = await inSlot(["-hide_banner", "-nostdin", "-loglevel", "info", ...limitThreads(args)], opts);
  return r.stderr;
}
