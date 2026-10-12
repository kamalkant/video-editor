import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Each fetched tool: its *_PATH variable, where scripts/fetch-ffmpeg.mjs puts it, and how to ask its version. */
const TOOLS = [
  { name: "ffmpeg", key: "FFMPEG_PATH", path: ["vendor", "ffmpeg", "ffmpeg"], flag: "-version" },
  { name: "ffprobe", key: "FFPROBE_PATH", path: ["vendor", "ffmpeg", "ffprobe"], flag: "-version" },
  { name: "yt-dlp", key: "YTDLP_PATH", path: ["vendor", "yt-dlp", "yt-dlp"], flag: "--version" },
] as const;

const works = (bin: string, flag: string) => {
  const r = spawnSync(bin, [flag], { stdio: "ignore", timeout: 30_000 });
  return { ok: r.status === 0, why: r.error ? (r.error as NodeJS.ErrnoException).code ?? r.error.message : `exit ${r.status}` };
};

/**
 * Makes FFmpeg (and yt-dlp) usable on a Linux server that has none (once, at start; never throws):
 * - fetches them into vendor/ if they aren't there (scripts/fetch-ffmpeg.mjs)
 * - hosts that copy the built site elsewhere can drop the files' "executable" bit: put it back
 * - a folder that may not run programs: use a copy in the temp folder instead
 * The working path goes to FFMPEG_PATH / FFPROBE_PATH / YTDLP_PATH (lib/ffmpeg/run, lib/import/youtube read them).
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
