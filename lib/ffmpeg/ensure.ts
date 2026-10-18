import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataRoot } from "../dataRoot";

const tmpForTools = () => {
  const dir = join(dataRoot(), "tmp");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* the default temp folder then */
  }
  return dir;
};

/** Each fetched tool: its *_PATH variable, where scripts/fetch-ffmpeg.mjs puts it, and how to ask its version. */
const TOOLS = [
  { name: "ffmpeg", key: "FFMPEG_PATH", path: ["vendor", "ffmpeg", "ffmpeg"], flag: "-version" },
  { name: "ffprobe", key: "FFPROBE_PATH", path: ["vendor", "ffmpeg", "ffprobe"], flag: "-version" },
] as const;

const works = (bin: string, flag: string) => {
  const r = spawnSync(bin, [flag], { stdio: "ignore", timeout: 60_000 });
  return { ok: r.status === 0, why: r.error ? (r.error as NodeJS.ErrnoException).code ?? r.error.message : `exit ${r.status}` };
};

/**
 * Makes FFmpeg usable on a Linux server that has none (once, at start; never throws):
 * - fetches them into vendor/ if they aren't there (scripts/fetch-ffmpeg.mjs)
 * - hosts that copy the built site elsewhere can drop the files' "executable" bit: put it back
 * - a folder that may not run programs: use a copy in the temp folder instead
 * The working path goes to FFMPEG_PATH / FFPROBE_PATH (lib/ffmpeg/run reads them).
 */
export function ensureFfmpeg(root: string = /*turbopackIgnore: true*/ process.cwd()): void {
  const script = join(root, "scripts", "fetch-ffmpeg.mjs");
  const missing = TOOLS.some((t) => !process.env[t.key] && !existsSync(join(root, ...t.path)));
  if (missing && existsSync(script)) spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit", timeout: 300_000 });
  for (const t of TOOLS) {
    if (process.env[t.key]) continue;
    const bin = join(root, ...t.path);
    if (!existsSync(bin)) continue;
    let check = works(bin, t.flag);
    if (!check.ok) {
      try {
        chmodSync(bin, 0o755);
      } catch {
        // read-only: try the copy below
      }
      check = works(bin, t.flag);
    }
    if (check.ok) {
      process.env[t.key] = bin;
      continue;
    }
    try {
      const dir = join(tmpdir(), "viplay-tools");
      mkdirSync(dir, { recursive: true });
      const copy = join(dir, t.name);
      copyFileSync(bin, copy);
      chmodSync(copy, 0o755);
      const second = works(copy, t.flag);
      if (second.ok) {
        process.env[t.key] = copy;
        console.log(`[tools] ${t.name}: running the copy in ${dir} (the site's folder can't run it: ${check.why})`);
        continue;
      }
      console.warn(`[tools] ${t.name} can't run here (${check.why}; temp copy: ${second.why}).`);
    } catch (err) {
      console.warn(`[tools] ${t.name} can't run here (${check.why}; ${(err as Error).message}).`);
    }
  }
}

/** What scripts/fetch-ffmpeg.mjs last did (vendor/ffmpeg/fetch-status.json), or null. */
export function fetchStatus(root: string = /*turbopackIgnore: true*/ process.cwd()): { at?: string; by?: string; ffmpeg?: string | null; result?: string; error?: string } | null {
  try {
    return JSON.parse(readFileSync(join(root, "vendor", "ffmpeg", "fetch-status.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The FFmpeg the fetcher aims for (x265 with its alpha layer: the light Safari MOV). */
const WANTED = "9.0.2";
const RETRY_MS = 60 * 60 * 1000;

/**
 * A Linux server still on the older fetched FFmpeg (its install couldn't get FFmpeg 9, or ran
 * before it was wanted): fetch it again in the background, the site keeps working meanwhile;
 * then FFmpeg's abilities are read again (the Safari MOV becomes HEVC + alpha). At most once an hour.
 */
export function upgradeFfmpegLater(root: string = /*turbopackIgnore: true*/ process.cwd(), onDone?: () => void): boolean {
  if (process.platform !== "linux") return false;
  const vendored = TOOLS.every((t) => process.env[t.key] === join(root, ...t.path));
  if (!vendored) return false; // the host's own FFmpeg (or a copy elsewhere): not ours to replace
  const st = fetchStatus(root);
  if (st?.ffmpeg === WANTED) return false;
  // (an install that failed: try now; a try from here that failed: not again for an hour)
  if (st?.by === "server" && st.at && Date.now() - Date.parse(st.at) < RETRY_MS) return false;
  const script = join(root, "scripts", "fetch-ffmpeg.mjs");
  if (!existsSync(script)) return false;
  const env = { ...process.env };
  for (const t of TOOLS) delete env[t.key];
  env.FETCH_BY = "server";
  const child = spawn(process.execPath, [script], { cwd: root, env, stdio: "inherit" });
  child.on("exit", () => {
    console.log(`[tools] FFmpeg upgrade: ${JSON.stringify(fetchStatus(root))}`);
    onDone?.();
  });
  child.on("error", (err) => console.warn(`[tools] FFmpeg upgrade couldn't start: ${err.message}`));
  return true;
}

