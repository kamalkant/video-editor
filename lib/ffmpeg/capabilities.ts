import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPLE_MEDIA, FFMPEG, runFfmpeg } from "./run";

export type Capabilities = {
  ok: boolean;
  /** Safari's see-through file (HEVC + alpha) can be made: Apple's encoder, so a Mac server only. */
  safariAlpha: boolean;
  ffmpegVersion: string | null;
  checks: { name: string; ok: boolean; why: string }[];
  message: string | null;
};

const NEEDED_ENCODERS = [
  {
    name: "libvpx-vp9",
    why: "makes the Chrome/Firefox/Android file (WebM + alpha)",
  },
  { name: "libx264", why: "makes MP4 videos" },
  {
    name: "hevc_videotoolbox",
    why: "makes the Safari/iPhone file (HEVC + alpha); needs macOS",
  },
  { name: "prores_ks", why: "makes the optional ProRes master" },
];
const NEEDED_FILTERS = [
  "chromakey",
  "despill",
  "alphaextract",
  "alphamerge",
  "overlay",
  "lut",
  "erosion",
  "dilation",
  "gblur",
  "scale",
];

/** One-frame HEVC encode with a half-transparent picture, decoded back to prove alpha survives. */
async function hevcAlphaWorks(): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), "VDO-cap-"));
  const file = join(dir, "alpha-test.mov");
  try {
    await runFfmpeg(
      [
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=64x64:d=0.2:r=10",
        "-vf",
        "format=rgba,geq=r=255:g=0:b=0:a='if(lt(X,32),0,255)',format=bgra",
        "-frames:v",
        "2",
        "-c:v",
        "hevc_videotoolbox",
        "-allow_sw",
        "1",
        "-alpha_quality",
        "0.75",
        "-tag:v",
        "hvc1",
        "-y",
        file,
      ],
      { timeoutMs: 20_000 },
    );
    const r = await runFfmpeg(
      [
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "alphaextract",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "pipe:1",
      ],
      {
        collectStdout: true,
        timeoutMs: 20_000,
      },
    );
    const a = r.stdout;
    return a.length >= 64 && a[64 * 32 + 2] < 20 && a[64 * 32 + 61] > 235;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function detect(): Promise<Capabilities> {
  const checks: Capabilities["checks"] = [];
  let version: string | null = null;
  try {
    const stdout = async (flag: string) =>
      (
        await runFfmpeg([flag], { collectStdout: true, timeoutMs: 10_000 })
      ).stdout.toString();
    version =
      /ffmpeg version (\S+)/.exec(
        await stdout("-version").catch(() => ""),
      )?.[1] ?? null;
    const encoders = await stdout("-encoders");
    const filters = await stdout("-filters");
    for (const e of NEEDED_ENCODERS)
      checks.push({
        name: `encoder ${e.name}`,
        ok: new RegExp(`\\s${e.name}\\s`).test(encoders),
        why: e.why,
      });
    for (const f of NEEDED_FILTERS)
      checks.push({
        name: `filter ${f}`,
        ok: new RegExp(`\\s${f}\\s`).test(filters),
        why: "needed for green removal",
      });
    const hevcListed = checks.find(
      (c) => c.name === "encoder hevc_videotoolbox",
    )?.ok;
    checks.push({
      name: "HEVC alpha test encode",
      ok: hevcListed ? await hevcAlphaWorks() : false,
      why: "proves the Safari file keeps its transparency",
    });
  } catch {
    return {
      ok: false,
      safariAlpha: false,
      ffmpegVersion: null,
      checks,
      message: APPLE_MEDIA
        ? "FFmpeg was not found. Install it with: brew install ffmpeg"
        : `FFmpeg was not found on the server (looked for ${FFMPEG}). Run npm install again (it fetches FFmpeg: scripts/fetch-ffmpeg.mjs), or set FFMPEG_PATH.`,
    };
  }
  const safariAlpha = checks.find((c) => c.name === "HEVC alpha test encode")?.ok ?? false;
  // (off a Mac the Safari file can't be made at all: exports make the WebM only, so it isn't a failure)
  const optional = new Set(["encoder prores_ks", ...(APPLE_MEDIA ? [] : ["encoder hevc_videotoolbox", "HEVC alpha test encode"])]);
  const failed = checks.filter((c) => !c.ok && !optional.has(c.name));
  return {
    ok: failed.length === 0,
    safariAlpha,
    ffmpegVersion: version,
    checks,
    message: failed.length
      ? `Missing: ${failed.map((c) => `${c.name} (${c.why})`).join("; ")}`
      : null,
  };
}

const g = globalThis as unknown as { __VDOCaps?: Promise<Capabilities> };

/** Cached for the life of the server process. */
export function getCapabilities(refresh = false): Promise<Capabilities> {
  if (refresh || !g.__VDOCaps) g.__VDOCaps = detect();
  return g.__VDOCaps;
}
