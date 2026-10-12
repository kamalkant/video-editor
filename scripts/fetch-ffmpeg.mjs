// FFmpeg + FFprobe for Linux hosts that don't have them (e.g. Hostinger's Node.js hosting, where
// nothing can be installed with apt). Runs after `npm install` and before `npm run build`.
//
//   - not Linux, FFMPEG_PATH set, or ffmpeg already on the PATH: nothing to do
//   - else downloads the static builds (FFmpeg 7.0.2: x264, x265, VP9, AV1, Opus) from the ffmpeg-static
//     project's release, checks each file's SHA-256, and puts them in vendor/ffmpeg (lib/ffmpeg/run uses them)
//
// It never fails the install: on a problem it says so and the site still builds (exports then report it).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const RELEASE = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";
// SHA-256 of the .gz files of that release
const SHA256 = {
  "ffmpeg-linux-x64.gz": "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
  "ffprobe-linux-x64.gz": "25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067",
  "ffmpeg-linux-arm64.gz": "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
  "ffprobe-linux-arm64.gz": "2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8",
};
const DIR = join(process.cwd(), "vendor", "ffmpeg");
const say = (msg) => console.log(`[fetch-ffmpeg] ${msg}`);

const onPath = (bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;

async function fetchTool(tool, arch) {
  const file = `${tool}-linux-${arch}.gz`;
  const out = join(DIR, tool);
  const stamp = `${out}.sha256`;
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8") === SHA256[file]) return "kept";
  const res = await fetch(`${RELEASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(gz).digest("hex");
  if (sum !== SHA256[file]) throw new Error(`${file}: checksum mismatch (got ${sum})`);
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, gunzipSync(gz));
  chmodSync(tmp, 0o755);
  renameSync(tmp, out);
  writeFileSync(stamp, SHA256[file]);
  return "downloaded";
}

async function main() {
  if (process.platform !== "linux") return;
  if (process.env.FFMPEG_PATH) return say("FFMPEG_PATH is set: using it.");
  if (onPath("ffmpeg") && onPath("ffprobe")) return say("ffmpeg is installed: using it.");
  const arch = { x64: "x64", arm64: "arm64" }[process.arch];
  if (!arch) return say(`no build for ${process.arch}: install FFmpeg or set FFMPEG_PATH.`);
  mkdirSync(DIR, { recursive: true });
  for (const tool of ["ffmpeg", "ffprobe"]) say(`${tool}: ${await fetchTool(tool, arch)} (${join("vendor", "ffmpeg", tool)})`);
}

main().catch((err) => {
  console.warn(`[fetch-ffmpeg] couldn't get FFmpeg: ${err.message}. Video upload and export need it.`);
});
