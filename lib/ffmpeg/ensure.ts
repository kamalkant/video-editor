import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const works = (bin: string) => {
  const r = spawnSync(bin, ["-version"], { stdio: "ignore", timeout: 20_000 });
  return { ok: r.status === 0, why: r.error ? (r.error as NodeJS.ErrnoException).code ?? r.error.message : `exit ${r.status}` };
};

/**
 * Makes FFmpeg usable on a Linux server that has none (once, at start; never throws):
 * - fetches it into vendor/ffmpeg if it isn't there (scripts/fetch-ffmpeg.mjs)
 * - hosts that copy the built site elsewhere can drop the files' "executable" bit: put it back
 * - a folder that may not run programs: use a copy in the temp folder instead
 * The working path goes to FFMPEG_PATH / FFPROBE_PATH, which lib/ffmpeg/run reads.
 */
export function ensureFfmpeg(root: string = /*turbopackIgnore: true*/ process.cwd()): void {
  const vendor = join(root, "vendor", "ffmpeg");
  const script = join(root, "scripts", "fetch-ffmpeg.mjs");
  if (!process.env.FFMPEG_PATH && !existsSync(join(vendor, "ffprobe")) && existsSync(script)) {
    spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit", timeout: 180_000 });
  }
  for (const [tool, key] of [["ffmpeg", "FFMPEG_PATH"], ["ffprobe", "FFPROBE_PATH"]] as const) {
    if (process.env[key]) continue;
    const bin = join(vendor, tool);
    if (!existsSync(bin)) continue;
    let check = works(bin);
    if (!check.ok) {
      try {
        chmodSync(bin, 0o755);
      } catch {
        // read-only: try the copy below
      }
      check = works(bin);
    }
    if (check.ok) {
      process.env[key] = bin;
      continue;
    }
    try {
      const dir = join(tmpdir(), "viplay-ffmpeg");
      mkdirSync(dir, { recursive: true });
      const copy = join(dir, tool);
      copyFileSync(bin, copy);
      chmodSync(copy, 0o755);
      const second = works(copy);
      if (second.ok) {
        process.env[key] = copy;
        console.log(`[ffmpeg] ${tool}: running the copy in ${dir} (the site's folder can't run it: ${check.why})`);
        continue;
      }
      console.warn(`[ffmpeg] ${tool} can't run here (${check.why}; temp copy: ${second.why}). Uploads and exports need it.`);
    } catch (err) {
      console.warn(`[ffmpeg] ${tool} can't run here (${check.why}; ${(err as Error).message}). Uploads and exports need it.`);
    }
  }
}
