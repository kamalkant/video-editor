// FFmpeg + FFprobe (video) and yt-dlp (YouTube import, meme search) for Linux hosts that don't have them
// (e.g. Hostinger's Node.js hosting, where nothing can be installed with apt).
// Runs after `npm install`, before `npm run build`, and at server start (lib/ffmpeg/ensure).
//
//   - not Linux: nothing to do
//   - a tool already on the PATH, or its *_PATH variable set: that one is skipped
//   - else downloads the release file, checks its SHA-256, and puts it in vendor/
//     (FFmpeg 7.0.2 static: x264, x265, VP9, AV1, Opus, from the ffmpeg-static project; yt-dlp 2026.08.19)
//
// It never fails the install: on a problem it says so and the site still builds (those features then report it).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

const FF = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";
const YT = "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19";
// per tool: the file for each CPU, and its SHA-256 (of the file as downloaded)
const TOOLS = [
  {
    name: "ffmpeg", env: "FFMPEG_PATH", out: "vendor/ffmpeg/ffmpeg", gz: true,
    x64: [`${FF}/ffmpeg-linux-x64.gz`, "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa"],
    arm64: [`${FF}/ffmpeg-linux-arm64.gz`, "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0"],
  },
  {
    name: "ffprobe", env: "FFPROBE_PATH", out: "vendor/ffmpeg/ffprobe", gz: true,
    x64: [`${FF}/ffprobe-linux-x64.gz`, "25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067"],
    arm64: [`${FF}/ffprobe-linux-arm64.gz`, "2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8"],
  },
  {
    name: "yt-dlp", env: "YTDLP_PATH", out: "vendor/yt-dlp/yt-dlp", gz: false,
    x64: [`${YT}/yt-dlp_linux`, "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a"],
    arm64: [`${YT}/yt-dlp_linux_aarch64`, "b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc"],
  },
];
const say = (msg) => console.log(`[fetch-tools] ${msg}`);
const onPath = (bin) => spawnSync(bin, [bin === "yt-dlp" ? "--version" : "-version"], { stdio: "ignore" }).status === 0;

async function fetchTool(tool, [url, sha256]) {
  const out = join(process.cwd(), tool.out);
  const stamp = `${out}.sha256`;
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8") === sha256) return "kept";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${tool.name}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(body).digest("hex");
  if (sum !== sha256) throw new Error(`${tool.name}: checksum mismatch (got ${sum})`);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, tool.gz ? gunzipSync(body) : body);
  chmodSync(tmp, 0o755);
  renameSync(tmp, out);
  writeFileSync(stamp, sha256);
  return "downloaded";
}

async function main() {
  if (process.platform !== "linux") return;
  const arch = { x64: "x64", arm64: "arm64" }[process.arch];
  for (const tool of TOOLS) {
    try {
      if (process.env[tool.env]) say(`${tool.name}: ${tool.env} is set, using it.`);
      else if (onPath(tool.name)) say(`${tool.name}: installed, using it.`);
      else if (!arch) say(`${tool.name}: no build for ${process.arch}; install it or set ${tool.env}.`);
      else say(`${tool.name}: ${await fetchTool(tool, tool[arch])} (${tool.out})`);
    } catch (err) {
      console.warn(`[fetch-tools] couldn't get ${tool.name}: ${err.message}. The features that need it will say so.`);
    }
  }
}

await main();
