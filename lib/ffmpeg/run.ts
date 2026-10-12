import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

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

function run(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
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
      reject(new FfmpegError(`Could not start ${bin}: ${err.message}`, null, ""));
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

export function runFfmpeg(args: string[], opts?: RunOptions): Promise<RunResult> {
  return run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", ...limitThreads(args)], opts);
}

export async function runFfprobe(args: string[], opts?: RunOptions): Promise<string> {
  const r = await run(FFPROBE, ["-hide_banner", "-v", "error", ...args], { ...opts, collectStdout: true });
  return r.stdout.toString();
}

/** Run FFmpeg for its log output (e.g. volumedetect), which goes to stderr. */
export async function runFfmpegLog(args: string[], opts?: RunOptions): Promise<string> {
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "info", ...limitThreads(args)], opts);
  return r.stderr;
}
