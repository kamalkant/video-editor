// Website media: light copies of the source clips and stills for the marketing site.
//
//   sources (full quality, not deployed):  assets-source/website/videos, assets-source/website/images
//   output (deployed):                     public/website/videos  (MP4, no audio)
//                                          public/website/images  (WebP posters and stills)
//
//   node scripts/website-media.mjs --survey   contact sheets + report in .media-review/ (to pick what goes where)
//   node scripts/website-media.mjs --build    the light copies, and components/website/media/manifest.ts
//
// What gets built is listed in scripts/website-media.config.mjs. Needs ffmpeg, ffprobe and cwebp
// (FFMPEG_PATH / FFPROBE_PATH / CWEBP_PATH).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const ROOT = process.cwd();
const SRC_VIDEOS = join(ROOT, "assets-source", "website", "videos");
const SRC_IMAGES = join(ROOT, "assets-source", "website", "images");
const OUT_VIDEOS = join(ROOT, "public", "website", "videos");
const OUT_IMAGES = join(ROOT, "public", "website", "images");
const REVIEW_DIR = join(ROOT, ".media-review");
const MANIFEST = join(ROOT, "components", "website", "media", "manifest.ts");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const CWEBP = process.env.CWEBP_PATH ?? "cwebp"; // (most ffmpeg builds have no WebP encoder)
const MAX_BYTES = 1.2 * 1024 * 1024;

function run(bin, args) {
  try {
    return execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (err) {
    throw new Error(`${bin} failed: ${err.stderr?.toString().trim() || err.message}`);
  }
}

function probe(file) {
  const j = JSON.parse(run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]));
  const v = j.streams.find((s) => s.codec_type === "video");
  return {
    duration: Number(j.format.duration),
    bytes: Number(j.format.size),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    audio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

function survey() {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const report = {};
  for (const name of readdirSync(SRC_VIDEOS).filter((f) => /\.(mp4|mov)$/i.test(f)).sort()) {
    const file = join(SRC_VIDEOS, name);
    const info = probe(file);
    report[name] = info;
    // 9 frames spread over the clip, 3×3 (named with the extension: a .mov and an .mp4 may share a name)
    const fps = 9 / Math.max(info.duration, 1);
    run(FFMPEG, ["-y", "-v", "error", "-i", file, "-vf", `fps=${fps},scale=320:-2,tile=3x3:padding=4`, "-frames:v", "1", join(REVIEW_DIR, `${name}.jpg`)]);
    console.log(`${name}  ${info.width}x${info.height}  ${info.duration.toFixed(1)}s  ${(info.bytes / 1e6).toFixed(1)}MB${info.audio ? "  audio" : ""}`);
  }
  writeFileSync(join(REVIEW_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nContact sheets in ${REVIEW_DIR}`);
}

/** Fit inside 1280×720 (landscape), 720×1280 (portrait) or 720² (square), keeping the aspect ratio; even sizes. */
function fit(w, h) {
  const [maxW, maxH] = w > h ? [1280, 720] : w < h ? [720, 1280] : [720, 720];
  const s = Math.min(1, maxW / w, maxH / h);
  const even = (n) => Math.max(2, Math.round((n * s) / 2) * 2);
  return [even(w), even(h)];
}

const fresh = (out, src) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;
const kb = (path) => `${(statSync(path).size / 1024).toFixed(0)}KB`;

function buildVideo(item) {
  const src = join(SRC_VIDEOS, item.source);
  if (!existsSync(src)) throw new Error(`Missing source video: ${item.source}`);
  const info = probe(src);
  const [w, h] = fit(info.width, info.height);
  // keyed: the green screen removed and the subject laid on a checkerboard (how editors show transparency)
  // graded: a cinematic colour grade applied here, so a before/after pair shows the very same shot
  const base = basename(item.source, extname(item.source)) + (item.keyed ? "-keyed" : item.graded ? "-graded" : "");
  const mp4 = join(OUT_VIDEOS, `${base}.mp4`);
  const webp = join(OUT_IMAGES, `${base}.webp`);
  const trim = [...(item.start ? ["-ss", String(item.start)] : []), ...(item.length ? ["-t", String(item.length)] : [])];

  if (!fresh(mp4, src)) {
    // the lightest that still looks right: quality first, then (busy footage) size, 960 px wide
    const first = item.crf ?? 30;
    for (const [crf, scale] of [[first, 1], [first + 2, 1], [first + 2, 0.75], [first + 4, 0.75]]) {
      const sw = Math.round((w * scale) / 2) * 2;
      const sh = Math.round((h * scale) / 2) * 2;
      const look = `scale=${sw}:${sh}:flags=lanczos,fps=${item.fps ?? 30}`;
      const filter = item.keyed
        ? ["-filter_complex", `[0:v]${look},chromakey=0x00ff00:0.14:0.04,despill=type=green[fg];color=c=gray:s=${sw}x${sh}:r=30,geq=lum='if(mod(floor(X/24)+floor(Y/24)\\,2)\\,92\\,64)':cb=128:cr=128[bg];[bg][fg]overlay=shortest=1,format=yuv420p`]
        : item.graded
          ? ["-vf", `${look},eq=contrast=1.22:saturation=1.45:gamma=0.92:brightness=-0.02,curves=preset=increase_contrast,colorbalance=rs=.05:bs=-.04:rh=.04:bh=-.06,unsharp=5:5:0.4,format=yuv420p`]
          : ["-vf", `${look},format=yuv420p`];
      run(FFMPEG, [
        "-y", "-v", "error", ...trim, "-i", src, "-an",
        ...filter,
        "-c:v", "libx264", "-profile:v", "high", "-preset", "veryslow", "-crf", String(crf), "-g", "90",
        "-movflags", "+faststart", mp4,
      ]);
      if (statSync(mp4).size <= MAX_BYTES) break;
    }
  }
  if (!fresh(webp, src)) {
    // the poster: a frame of the copy itself (so it matches exactly), as WebP
    const length = probe(mp4).duration;
    const at = String(Math.min(item.poster ?? length / 2, Math.max(0, length - 0.2)));
    const frame = join(REVIEW_DIR, `${base}.poster.png`);
    mkdirSync(REVIEW_DIR, { recursive: true });
    run(FFMPEG, ["-y", "-v", "error", "-ss", at, "-i", mp4, "-frames:v", "1", "-vf", `scale=${w}:${h}:flags=lanczos`, frame]);
    run(CWEBP, ["-quiet", "-q", "68", "-m", "6", "-sharp_yuv", frame, "-o", webp]);
  }
  const out = probe(mp4);
  console.log(`${item.key.padEnd(20)} ${base}.mp4  ${out.width}x${out.height}  ${kb(mp4)}  poster ${kb(webp)}`);
  return [item.key, { src: `/website/videos/${base}.mp4`, poster: `/website/images/${base}.webp`, width: w, height: h, bytes: statSync(mp4).size, duration: Math.round(out.duration * 10) / 10 }];
}

function buildStill(item) {
  const src = join(SRC_IMAGES, item.source);
  if (!existsSync(src)) throw new Error(`Missing source image: ${item.source}`);
  const base = basename(item.source, extname(item.source));
  const webp = join(OUT_IMAGES, `${base}.webp`);
  if (!fresh(webp, src)) {
    const size = item.maxWidth ? ["-resize", String(item.maxWidth), "0"] : [];
    // (transparent PNGs keep their alpha channel)
    run(CWEBP, ["-quiet", "-q", String(item.quality ?? 72), "-alpha_q", "85", "-m", "6", "-sharp_yuv", ...size, src, "-o", webp]);
  }
  const dims = probe(webp);
  console.log(`${item.key.padEnd(20)} ${base}.webp  ${dims.width}x${dims.height}  ${kb(webp)}  (source ${kb(src)})`);
  return [item.key, { src: `/website/images/${base}.webp`, width: dims.width, height: dims.height, bytes: statSync(webp).size }];
}

async function build() {
  const { WEBSITE_MEDIA, WEBSITE_STILLS = [] } = await import(join(ROOT, "scripts", "website-media.config.mjs"));
  mkdirSync(OUT_VIDEOS, { recursive: true });
  mkdirSync(OUT_IMAGES, { recursive: true });
  const videos = WEBSITE_MEDIA.map(buildVideo);
  const stills = WEBSITE_STILLS.map(buildStill);

  const line = ([key, v]) => `  ${JSON.stringify(key)}: ${JSON.stringify(v).replace(/"(\w+)":/g, "$1: ").replace(/,(?=\w+: )/g, ", ")},`;
  writeFileSync(
    MANIFEST,
    `// Generated by scripts/website-media.mjs --build. Do not edit by hand.
// Light copies for the website: videos in public/website/videos (no audio), WebP images in public/website/images.

export type SiteMedia = { src: string; poster: string; width: number; height: number; bytes: number; duration: number };
export type SiteImage = { src: string; width: number; height: number; bytes: number };

export const SITE_MEDIA = {
${videos.map(line).join("\n")}
} as const satisfies Record<string, SiteMedia>;

export const SITE_IMAGES = {
${stills.map(line).join("\n")}
} as const satisfies Record<string, SiteImage>;

export type SiteMediaKey = keyof typeof SITE_MEDIA;
export type SiteImageKey = keyof typeof SITE_IMAGES;
`,
  );
  const total = [...videos, ...stills].reduce((n, [, v]) => n + v.bytes, 0);
  console.log(`\nWrote ${videos.length} videos + ${stills.length} stills (${(total / 1e6).toFixed(1)}MB) to ${MANIFEST}`);
}

if (process.argv.includes("--survey")) survey();
else if (process.argv.includes("--build")) await build();
else console.log("Usage: node scripts/website-media.mjs --survey | --build");
