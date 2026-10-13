import "server-only";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
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
/**
 * Deno for YouTube's JavaScript challenges: DENO_PATH, else the copy scripts/fetch-ffmpeg.mjs put in
 * vendor/deno (Linux hosts), else none (yt-dlp then finds a deno on the PATH itself, as on a Mac).
 */
export const denoBin = (): string | null => {
  if (process.env.DENO_PATH) return process.env.DENO_PATH;
  const vendored = join(/*turbopackIgnore: true*/ process.cwd(), "vendor", "deno", "deno");
  return existsSync(vendored) ? vendored : null;
};
/**
 * How yt-dlp solves YouTube's JavaScript challenges (without them it finds no formats):
 *  - deno first, yt-dlp's recommended runtime (on viplay.in the "node" provider failed with KeyError('type'))
 *  - Node (this process) as the fallback
 *  - its own cache folder in the site's data: an older cache from another yt-dlp (its challenge scripts)
 *    can break solving
 */
export function ytDlpJsArgs(): string[] {
  const deno = denoBin();
  return [...(deno ? ["--js-runtimes", `deno:${deno}`] : []), "--js-runtimes", `node:${process.execPath}`, "--cache-dir", join(dataRoot(), "tmp", "yt-dlp-cache")];
}
/** Player client preferences: android, web_embedded, ios, mweb bypass SABR experiments and embed age-gates */
export const YTDLP_CLIENT_ARGS = [
  "--extractor-args",
  "youtube:player_client=android,web_embedded,ios,mweb,web",
  "--geo-bypass",
];
/**
 * Which players to ask for: with cookies (a signed-in session, the live server), yt-dlp's own choice, which
 * picks players that accept cookies (android and ios ignore them); without, the list above.
 */
export const ytDlpClientArgs = (cookies: string[]): string[] => (cookies.length ? ["--geo-bypass"] : YTDLP_CLIENT_ARGS);

/**
 * Automatically discovers cookies.txt on cloud VPS servers (e.g. viplay.in)
 * Checks YTDLP_COOKIES, COOKIES_PATH, data/cookies.txt, root cookies.txt,
 * or public_html/cookies.txt in cwd, dataRoot, and Hostinger domain root.
 * Also supports YTDLP_COOKIES_CONTENT or COOKIES_TXT directly from environment variables.
 */
export function ytDlpCookiesArgs(): string[] {
  const envContent =
    process.env.YTDLP_COOKIES_CONTENT ||
    process.env.COOKIES_TXT ||
    process.env.YOUTUBE_COOKIES_CONTENT;
  const targetFile = join(dataRoot(), "cookies.txt");
  if (envContent && !existsSync(targetFile)) {
    try {
      const decoded = envContent.startsWith("base64:")
        ? Buffer.from(envContent.slice(7), "base64").toString("utf8")
        : envContent;
      writeFileSync(targetFile, decoded, "utf8");
    } catch {
      // Ignore if file cannot be written
    }
  }

  const cwd = process.cwd();
  const dRoot = dataRoot();
  const candidates: string[] = [
    process.env.YTDLP_COOKIES,
    process.env.COOKIES_PATH,
    process.env.YOUTUBE_COOKIES,
    targetFile,
    join(dRoot, "cookies.txt"),
    join(dRoot, "viplay-data", "cookies.txt"),
    join(dRoot, "data", "cookies.txt"),
    join(dRoot, "..", "viplay-data", "cookies.txt"),
    join(dRoot, "..", "public_html", "cookies.txt"),
    join(dRoot, "..", "cookies.txt"),
    join(cwd, "cookies.txt"),
    join(cwd, "viplay-data", "cookies.txt"),
    join(cwd, "public_html", "cookies.txt"),
    join(cwd, "public", "cookies.txt"),
    join(cwd, "..", "viplay-data", "cookies.txt"),
    join(cwd, "..", "public_html", "cookies.txt"),
    join(cwd, "..", "cookies.txt"),
  ].filter(Boolean) as string[];

  // Hostinger deploy layout: .../domains/domain.com/hbuilds/versions/<id>/nodejs
  const at = cwd.indexOf(`${sep}hbuilds${sep}versions${sep}`);
  if (at >= 0) {
    const hostingerRoot = cwd.slice(0, at);
    candidates.push(
      join(hostingerRoot, "public_html", "cookies.txt"),
      join(hostingerRoot, "cookies.txt"),
      join(hostingerRoot, "viplay-data", "cookies.txt"),
    );
  }

  // Also check ancestor folders up to 8 levels (reaches domain and user root on any hosting layout)
  let curr = cwd;
  for (let i = 0; i < 8; i++) {
    candidates.push(
      join(curr, "cookies.txt"),
      join(curr, "viplay-data", "cookies.txt"),
      join(curr, "public_html", "cookies.txt"),
      join(curr, "public", "cookies.txt"),
    );
    const parent = join(curr, "..");
    if (parent === curr) break;
    curr = parent;
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      if (c !== targetFile && !existsSync(targetFile)) {
        try {
          copyFileSync(c, targetFile);
        } catch {
          // ignore copy error
        }
      }
      return ["--cookies", c];
    }
  }
  return [];
}

/**
 * Discovers residential/datacenter proxy if configured via environment variables
 */
export function ytDlpProxyArgs(): string[] {
  const proxy = process.env.YTDLP_PROXY || process.env.YOUTUBE_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy) {
    return ["--proxy", proxy];
  }
  return [];
}

export function ytDlpEnv(): NodeJS.ProcessEnv {
  if (process.platform !== "linux") return process.env;
  const tmp = join(dataRoot(), "tmp");
  try {
    mkdirSync(tmp, { recursive: true });
  } catch {
    return process.env;
  }
  // (deno, which yt-dlp starts for YouTube's challenges, keeps its own files there too, and never checks for updates)
  return { ...process.env, TMPDIR: tmp, DENO_DIR: join(tmp, "deno"), DENO_NO_UPDATE_CHECK: "1" };
}

/**
 * Where yt-dlp finds FFmpeg (it joins and cuts the clip with it). A bare command name ("ffmpeg": FFmpeg on
 * the PATH) isn't a location to yt-dlp, which then says FFmpeg isn't installed: it finds it on the PATH itself.
 */
export const ytDlpFfmpegArgs = (ffmpeg: string): string[] => (/[\\/]/.test(ffmpeg) ? ["--ffmpeg-location", ffmpeg] : []);

export const NO_YTDLP =
  process.platform === "darwin"
    ? "The meme downloader tool isn't installed."
    : "This online meme clip isn't available from this server right now. Try another clip or upload your own file.";

/** The server is refused (data-center IPs: a bot check, too many requests, a refused or token-less download). */
const BLOCKED = /not a bot|\bbot\b|HTTP Error 429|Too Many Requests|HTTP Error 403|Forbidden|PO Token|po_token|SABR|Precondition check failed|cookies are no longer valid|rotated in the browser/i;
/** A real age gate (not just any word with "age" in it: "page", "usage"…). */
const AGE_GATED = /confirm your age|age[- ]restricted|inappropriate for some users/i;
const UNAVAILABLE = /video unavailable|is unavailable|private video|this video is private|has been removed|not available in your country/i;
const BLOCKED_MESSAGE = "This online meme clip is temporarily blocked or unavailable for download from this server. Try another clip or upload your own file.";

/** What to tell people when yt-dlp fails, from its error output. */
export function ytDlpFailure(stderr: string): string {
  // Cloud servers in data centers (hosting): "Sign in to confirm you're not a bot", HTTP 429 / 403, PO tokens
  if (BLOCKED.test(stderr)) return BLOCKED_MESSAGE;
  if (UNAVAILABLE.test(stderr)) return "This clip is private or unavailable.";
  if (AGE_GATED.test(stderr)) return "This online clip requires age verification or sign-in, so it cannot be imported.";
  if (/unavailable|private/i.test(stderr)) return "This clip is private or unavailable.";
  // (anything else: last error line, without the server's folders, so it can be fixed)
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = (lines.filter((l) => /ERROR|error/.test(l)).pop() ?? lines.pop())?.replace(/\/[^\s:'"]+/g, "…").slice(0, 160);
  return last ? `Could not download online meme clip (${last}).` : "Could not download this meme clip. Try another one.";
}

/** One try of a download (which players were asked, and what yt-dlp said). */
export type YtAttempt = { label: string; stderr: string; code?: string | number | null; killed?: boolean };

/**
 * Why a download failed after several tries: the most telling reason of all of them, not just the last
 * one's (the last fallback, the embedded player, answers "confirm your age" for clips that are fine,
 * which hid "the server is blocked" on viplay.in).
 */
export function ytDlpFailureOf(attempts: YtAttempt[]): string {
  const all = attempts.map((a) => a.stderr).join("\n");
  if (attempts.some((a) => a.code === "ENOENT")) return NO_YTDLP;
  if (BLOCKED.test(all)) return BLOCKED_MESSAGE;
  if (UNAVAILABLE.test(all)) return "This clip is private or unavailable.";
  if (AGE_GATED.test(all)) return "This online clip requires age verification or sign-in, so it cannot be imported.";
  if (attempts.length && attempts.every((a) => a.killed)) return "Online clip took too long to download. Try again.";
  const last = [...attempts].reverse().find((a) => a.stderr.trim());
  return last ? ytDlpFailure(last.stderr) : "Could not download this meme clip. Try another one.";
}

/** The end of yt-dlp's error output, without the server's folders (for logs and the admin check). */
export const ytDlpTail = (stderr: string, lines = 6) =>
  stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines)
    .join("\n")
    .replace(/\/[^\s:'"]+/g, "…")
    .slice(0, 1200);

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
