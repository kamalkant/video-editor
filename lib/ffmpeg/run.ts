import { spawn } from "node:child_process";

export const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

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

export function runFfmpeg(args: string[], opts?: RunOptions): Promise<RunResult> {
  return run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "error", ...args], opts);
}

export async function runFfprobe(args: string[], opts?: RunOptions): Promise<string> {
  const r = await run(FFPROBE, ["-hide_banner", "-v", "error", ...args], { ...opts, collectStdout: true });
  return r.stdout.toString();
}

/** Run FFmpeg for its log output (e.g. volumedetect), which goes to stderr. */
export async function runFfmpegLog(args: string[], opts?: RunOptions): Promise<string> {
  const r = await run(FFMPEG, ["-hide_banner", "-nostdin", "-loglevel", "info", ...args], opts);
  return r.stderr;
}
