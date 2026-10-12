import "server-only";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataRoot } from "../dataRoot";

/**
 * yt-dlp, the downloader behind Online memes (lib/library/dynamicSearch): where it is, how to start it,
 * and what to say when it fails. No YouTube API key is involved.
 */

/** Start yt-dlp (its path goes through a parameter, like FFmpeg's in lib/ffmpeg/run: no shell, and the build doesn't trace it). */
function runYtDlp(bin: string, args: string[], opts: { stdio: ("ignore" | "pipe")[]; signal?: AbortSignal }) {
  return spawn(bin, args, { ...opts, shell: false, env: ytDlpEnv() });
}
/** YTDLP_PATH, else the copy scripts/fetch-ffmpeg.mjs put in vendor/yt-dlp (Linux hosts), else the PATH. */
export const ytDlpBin = () => {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const vendored = join(/*turbopackIgnore: true*/ process.cwd(), "vendor", "yt-dlp", "yt-dlp");
  return existsSync(vendored) ? vendored : "yt-dlp";
};
/**
 * The Linux yt-dlp is one file that unpacks itself into the temp folder each time it starts; shared
 * hosting often doesn't let programs run from /tmp, so it unpacks into the site's own data folder.
 */
/** YouTube pages need a JavaScript runtime; servers have Node (this process), not deno: yt-dlp may use it. */
export const YTDLP_JS = ["--js-runtimes", `node:${process.execPath}`];

export function ytDlpEnv(): NodeJS.ProcessEnv {
  if (process.platform !== "linux") return process.env;
  const tmp = join(dataRoot(), "tmp");
  try {
    mkdirSync(tmp, { recursive: true });
  } catch {
    return process.env;
  }
  return { ...process.env, TMPDIR: tmp };
}

export const NO_YTDLP =
  process.platform === "darwin"
    ? "The YouTube downloader (yt-dlp) isn't installed. Install it with: brew install yt-dlp"
    : "The YouTube downloader isn't available on this server right now. Download the clip on your computer and upload it.";

/** What to tell people when yt-dlp fails, from its error output. */
export function ytDlpFailure(stderr: string): string {
  // YouTube often refuses servers in data centers (hosting): "Sign in to confirm you're not a bot", HTTP 429
  if (/not a bot|HTTP Error 429|Too Many Requests/i.test(stderr))
    return "YouTube is blocking downloads from this server right now. Download the clip on your computer and upload it.";
  if (/Sign in|age/i.test(stderr)) return "YouTube asks to sign in for this video, so it can't be imported.";
  if (/unavailable|private/i.test(stderr)) return "This video is private or unavailable.";
  // (anything else: yt-dlp's own last error line, without the server's folders, so it can be fixed)
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = (lines.filter((l) => /ERROR|error/.test(l)).pop() ?? lines.pop())?.replace(/\/[^\s:'"]+/g, "…").slice(0, 160);
  return last ? `YouTube didn't answer as expected (${last}).` : "YouTube's video couldn't be downloaded. Try another one.";
}

/** Can the YouTube downloader run here, and if not why (ENOENT: not there; EACCES: not allowed to run…). */
export function ytDlpCheck(): Promise<{ ok: boolean; version?: string; why?: string }> {
  return new Promise((resolve) => {
    const c = runYtDlp(ytDlpBin(), ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    c.stderr!.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-400)));
    c.on("error", (e) => resolve({ ok: false, why: (e as NodeJS.ErrnoException).code ?? e.message }));
    c.on("close", (code) => resolve(code === 0 ? { ok: true, version: out.trim() } : { ok: false, why: `exit ${code}: ${err.trim().split("\n").pop()?.replace(/\/[^\s:'"]+/g, "…") ?? ""}`.slice(0, 200) }));
  });
}

/** Is the YouTube downloader installed? */
export function ytDlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const c = runYtDlp(ytDlpBin(), ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    c.on("error", () => resolve(null));
    c.on("close", (code) => resolve(code === 0 ? out.trim() : null));
  });
}
