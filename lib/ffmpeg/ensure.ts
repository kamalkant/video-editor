import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Fetches FFmpeg into vendor/ffmpeg when this Linux server has none (scripts/fetch-ffmpeg.mjs; it never throws). */
export function ensureFfmpeg(): void {
  const root = /*turbopackIgnore: true*/ process.cwd();
  const script = join(root, "scripts", "fetch-ffmpeg.mjs");
  if (process.env.FFMPEG_PATH || existsSync(join(root, "vendor", "ffmpeg", "ffprobe")) || !existsSync(script)) return;
  spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit", timeout: 180_000 });
}
