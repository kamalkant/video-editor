// Makes the editor's bundled media lighter, in place: same file names, formats and video sizes,
// so templates, the meme library and saved projects keep working.
//
//   node scripts/compress-public-media.mjs           compress (originals kept once in assets-source/originals/)
//   node scripts/compress-public-media.mjs --dry     only report what it would save
//
// A file is replaced only when the new one is at least 10% smaller. Needs ffmpeg, ffprobe and (macOS) sips.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const BACKUP = join(ROOT, "assets-source", "originals");
const DRY = process.argv.includes("--dry");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

// what to compress, and how (videos keep their resolution: the editor edits and exports them)
const JOBS = [
  { dir: "public/templates/media", ext: ".mp4", kind: "video", crf: 23 }, // template backgrounds
  { dir: "public/library/memes", ext: ".mp4", kind: "video", crf: 25 }, // short meme clips (with sound)
  { dir: "public/templates/thumbs", ext: ".jpg", kind: "jpeg", maxSide: 960, quality: 76 },
  { dir: "public/library/memes", ext: ".jpg", kind: "jpeg", maxSide: 480, quality: 72 },
];

const run = (bin, args) => execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const hasAudio = (file) => run(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file]).trim();

function encode(job, src, out) {
  if (job.kind === "video") {
    const audio = hasAudio(src);
    // sound: AAC is kept as it is (re-encoding would only lose quality); anything else becomes AAC 128k
    const a = !audio ? ["-an"] : audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "128k"];
    run(FFMPEG, ["-y", "-v", "error", "-i", src, "-map", "0:v:0", ...(audio ? ["-map", "0:a:0"] : []), "-c:v", "libx264", "-profile:v", "high", "-preset", "veryslow", "-crf", String(job.crf), "-pix_fmt", "yuv420p", ...a, "-movflags", "+faststart", out]);
  } else {
    copyFileSync(src, out);
    run("sips", ["-Z", String(job.maxSide), "-s", "format", "jpeg", "-s", "formatOptions", String(job.quality), out]);
  }
}

let before = 0;
let after = 0;
let replaced = 0;
for (const job of JOBS) {
  const dir = join(ROOT, job.dir);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => f.toLowerCase().endsWith(job.ext)).sort()) {
    const file = join(dir, name);
    const size = statSync(file).size;
    const tmp = join(tmpdir(), `vdo-compress-${process.pid}${job.ext}`);
    try {
      encode(job, file, tmp);
    } catch (err) {
      console.warn(`skip ${relative(ROOT, file)}: ${err.stderr?.toString().trim() || err.message}`);
      continue;
    }
    const next = statSync(tmp).size;
    before += size;
    if (next <= size * 0.9) {
      after += next;
      replaced++;
      if (!DRY) {
        const keep = join(BACKUP, relative(ROOT, file));
        if (!existsSync(keep)) {
          mkdirSync(dirname(keep), { recursive: true });
          copyFileSync(file, keep);
        }
        renameSync(tmp, file);
      }
      console.log(`${relative(ROOT, file).padEnd(60)} ${(size / 1024).toFixed(0).padStart(6)}KB → ${(next / 1024).toFixed(0)}KB`);
    } else {
      after += size;
    }
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}
console.log(`\n${DRY ? "Would replace" : "Replaced"} ${replaced} files: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB`);
