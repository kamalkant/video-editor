import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The Apple Vision matting tool (scripts/vision-matte, Swift). Built on this
 * Mac the first time AI Removal is used, and rebuilt when its source changes.
 */
export const TOOL_DIR = join(process.cwd(), "scripts", "vision-matte");
export const TOOL_BIN = join(TOOL_DIR, ".build", "vision-matte");
/** Bump when the tool's output changes, so old cached masks are made again. */
export const TOOL_VERSION = "1";

export type MatteProbe = {
  width: number;
  height: number;
  fps: number;
  fpsRational: string;
  frameCount: number;
  duration: number;
  rotation: number;
};

const g = globalThis as unknown as { __VDOToolBuild?: Promise<string> };

async function mtime(p: string) {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Path of a working binary (builds it once per server process if needed). */
export function ensureTool(): Promise<string> {
  g.__VDOToolBuild ??= (async () => {
    if (process.platform !== "darwin")
      throw new AiUnavailableError(
        "AI Removal needs a Mac (it uses Apple's Vision framework).",
      );
    const [bin, src] = await Promise.all([
      mtime(TOOL_BIN),
      mtime(join(TOOL_DIR, "main.swift")),
    ]);
    if (bin && bin >= src) return TOOL_BIN;
    try {
      await run("/bin/sh", [join(TOOL_DIR, "build.sh"), TOOL_BIN], {
        timeout: 5 * 60 * 1000,
      });
    } catch (e) {
      const msg =
        (e as { stderr?: string }).stderr?.split("\n").slice(-5).join("\n") ??
        String(e);
      throw new AiUnavailableError(
        `Couldn't build the AI tool (Xcode command line tools needed): ${msg}`,
      );
    }
    return TOOL_BIN;
  })().catch((e) => {
    g.__VDOToolBuild = undefined; // try again next time
    throw e;
  });
  return g.__VDOToolBuild;
}

/** Size, frame rate (exact, e.g. "24/1") and frame count as the tool sees the video. */
export async function probeForMatte(source: string): Promise<MatteProbe> {
  const bin = await ensureTool();
  const { stdout } = await run(bin, [source, "--probe"], { timeout: 60_000 });
  return JSON.parse(stdout) as MatteProbe;
}

export type ToolArgs = {
  mode: string;
  quality: string;
  despeckle: boolean;
  start?: number;
  frames?: number;
};

export function toolArgs(source: string, a: ToolArgs): string[] {
  return [
    source,
    "--mode",
    a.mode,
    "--quality",
    a.quality,
    ...(a.despeckle ? ["--min-island", "0.3"] : []),
    ...(a.start !== undefined ? ["--start", a.start.toFixed(3)] : []),
    ...(a.frames !== undefined ? ["--frames", String(a.frames)] : []),
  ];
}

/** One mask frame at time t (raw gray bytes, width×height), for the preview before the full mask exists. */
export async function maskFrame(
  source: string,
  probe: MatteProbe,
  a: Omit<ToolArgs, "start" | "frames">,
  t: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const bin = await ensureTool();
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        ...toolArgs(source, { ...a, start: Math.max(0, t), frames: 1 }),
        "--quiet",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const kill = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", kill, { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", kill);
      const buf = Buffer.concat(out);
      if (signal?.aborted) return reject(new Error("aborted"));
      if (code !== 0 || buf.length < probe.width * probe.height)
        return reject(
          new Error(
            `vision-matte failed: ${err.trim().split("\n").pop() ?? code}`,
          ),
        );
      resolve(buf.subarray(0, probe.width * probe.height));
    });
  });
}
