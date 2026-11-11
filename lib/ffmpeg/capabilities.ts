import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { dataRoot } from "../dataRoot";
import { APPLE_MEDIA, FFMPEG, FfmpegError, runFfmpeg } from "./run";

/** The system's "not now" (as lib/ffmpeg/run's BUSY_ERRNO): the account's limit on running programs, or memory. */
const BUSY_ERRNO = new Set(["EAGAIN", "ENOMEM"]);

/** What makes the Safari see-through MOV: Apple's encoder (a Mac), x265's alpha layer (FFmpeg 8+, e.g. Linux), else ProRes 4444 (a big file). */
export type MovEncoder = "videotoolbox" | "x265" | "prores";

export type Capabilities = {
  ok: boolean;
  /** Safari's see-through file (HEVC + alpha) can be made: Apple's encoder on a Mac, or x265 with its alpha layer. */
  safariAlpha: boolean;
  movEncoder: MovEncoder;
  /** AI Removal (Apple's Vision framework) and the Mac's text-to-speech voices: a Mac server only. */
  aiRemoval: boolean;
  macVoices: boolean;
  ffmpegVersion: string | null;
  checks: { name: string; ok: boolean; why: string }[];
  message: string | null;
  /** FFmpeg is fine, but the system said "not now" (EAGAIN): it passes by itself, so it is no reason to warn anyone */
  busy?: boolean;
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

const VT_ALPHA = ["-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-alpha_quality", "0.75"];
const X265_ALPHA = ["-c:v", "libx265", "-pix_fmt", "yuva420p", "-preset", "ultrafast", "-x265-params", "log-level=error"];

/** One-frame HEVC encode with a half-transparent picture, decoded back to prove alpha survives. */
async function hevcAlphaWorks(codec: string[]): Promise<boolean> {
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
        `format=rgba,geq=r=255:g=0:b=0:a='if(lt(X,32),0,255)',format=${codec.includes("libx265") ? "yuva420p" : "bgra"}`,
        "-frames:v",
        "2",
        ...codec,
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

/** A real (tiny) job: a frame as JPEG, the way thumbnails are made. "" when it works, else FFmpeg's reason. */
async function workTest(): Promise<string> {
  try {
    const r = await runFfmpeg(["-hide_banner", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=10:d=1", "-frames:v", "1", "-vf", "format=yuvj420p", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"], { collectStdout: true, timeoutMs: 20_000 });
    return r.stdout.length > 100 ? "" : "made no picture";
  } catch (err) {
    // FFmpeg's last words (folders left out): e.g. a host that limits threads or memory
    const tail = err instanceof FfmpegError ? err.stderrTail : String((err as Error)?.message);
    const line = tail.split("\n").map((l) => l.trim()).filter(Boolean).slice(-2).join(" / ");
    return (line || (err as Error).message || "failed").replace(/\/[^\s:'"]+/g, "…").slice(0, 300);
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
    const work = await workTest();
    checks.push({ name: "test job (a JPEG frame)", ok: !work, why: work || "makes thumbnails, previews and exports" });
    checks.push({
      name: "HEVC alpha test encode",
      ok: hevcListed ? await hevcAlphaWorks(VT_ALPHA) : false,
      why: "proves the Safari file keeps its transparency",
    });
    // no Apple encoder (Linux): x265's alpha layer makes the same light Safari file
    if (!checks.at(-1)!.ok)
      checks.push({
        name: "x265 alpha test encode",
        ok: new RegExp(`\\slibx265\\s`).test(encoders) ? await hevcAlphaWorks(X265_ALPHA) : false,
        why: "makes the Safari/iPhone file (HEVC + alpha) without Apple's encoder (FFmpeg 8+, x265 with alpha)",
      });
  } catch (err) {
    // the reason only (EACCES, ENOENT, "exited with code 126"...), not the server's folders
    const why = (err as { errno?: string })?.errno ?? /\b(E[A-Z]{3,})\b|exited with code -?\d+/.exec(String((err as Error)?.message))?.[0] ?? "unknown error";
    // FFmpeg is there, but the system said "not now" (shared hosting: the account's limit on running programs is
    // full for the moment): nothing to install, it comes back by itself (getCapabilities checks again soon)
    const busy = BUSY_ERRNO.has(why);
    return {
      ok: false,
      busy,
      safariAlpha: false,
      movEncoder: "prores",
      aiRemoval: APPLE_MEDIA,
      macVoices: APPLE_MEDIA,
      ffmpegVersion: null,
      checks,
      message: busy
        ? `The server is busy right now: the hosting account's limit on running programs is full (${why}). Video features come back by themselves when it frees up; reload the page in a minute.`
        : APPLE_MEDIA
        ? "FFmpeg was not found. Install it with: brew install ffmpeg"
        : `FFmpeg can't run on the server (${FFMPEG.includes("vendor") ? "vendor/ffmpeg" : FFMPEG}: ${why}). Run npm install again (it fetches FFmpeg: scripts/fetch-ffmpeg.mjs), or set FFMPEG_PATH.`,
    };
  }
  const vt = checks.find((c) => c.name === "HEVC alpha test encode")?.ok ?? false;
  const x265 = checks.find((c) => c.name === "x265 alpha test encode")?.ok ?? false;
  const movEncoder: MovEncoder = vt ? "videotoolbox" : x265 ? "x265" : "prores";
  const safariAlpha = movEncoder !== "prores";
  // (off a Mac the Safari file can't be made with Apple's encoder; x265 or ProRes stand in, so it isn't a failure)
  const optional = new Set(["encoder prores_ks", "x265 alpha test encode", ...(APPLE_MEDIA ? [] : ["encoder hevc_videotoolbox", "HEVC alpha test encode"])]);
  const failed = checks.filter((c) => !c.ok && !optional.has(c.name));
  return {
    ok: failed.length === 0,
    safariAlpha,
    movEncoder,
    aiRemoval: APPLE_MEDIA,
    macVoices: APPLE_MEDIA,
    ffmpegVersion: version,
    checks,
    message: failed.length
      ? `Missing: ${failed.map((c) => `${c.name} (${c.why})`).join("; ")}`
      : null,
  };
}

const g = globalThis as unknown as { __VDOCaps?: Promise<Capabilities>; __VDOCapsFailedAt?: number; __VDOCapsDone?: Capabilities };

/** How long a failed check is kept before the next request checks again (it's often a passing "busy"). */
export const FAILED_CHECK_TTL_MS = 30_000;

/**
 * The check runs FFmpeg six times, which on a busy shared host can take 20 s. A passing result is kept on disk
 * (dataRoot: it outlives restarts) with the FFmpeg it was made with, so a restarted server reads it instead of
 * checking again. Another FFmpeg (a new size or date: an upgrade, a new deploy) is checked afresh.
 */
const cacheFile = () => process.env.VDO_CAPS_PATH ?? join(dataRoot(), "data", "ffmpeg-capabilities.json");

function ffmpegStamp(): string | null {
  try {
    const s = statSync(FFMPEG);
    return `${FFMPEG}|${s.size}|${Math.round(s.mtimeMs)}`;
  } catch {
    return null; // (FFmpeg from the PATH, or not there yet: nothing to tie a saved result to)
  }
}

function readSaved(): Capabilities | null {
  const stamp = ffmpegStamp();
  if (!stamp) return null;
  try {
    const saved = JSON.parse(readFileSync(cacheFile(), "utf8")) as { stamp?: string; caps?: Capabilities };
    return saved.stamp === stamp && saved.caps?.ok ? saved.caps : null;
  } catch {
    return null;
  }
}

function save(caps: Capabilities): void {
  const stamp = ffmpegStamp();
  if (!stamp || !caps.ok) return;
  try {
    mkdirSync(dirname(cacheFile()), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify({ stamp, caps }));
  } catch {
    // (a read-only disk: the result is still kept in memory)
  }
}

/** Load a saved result, if there is one for this FFmpeg (the server's start does this, before anyone asks). */
export function loadSavedCapabilities(): Capabilities | null {
  if (g.__VDOCapsDone) return g.__VDOCapsDone;
  const saved = readSaved();
  if (saved) {
    g.__VDOCaps = Promise.resolve(saved);
    g.__VDOCapsDone = saved;
  }
  return saved;
}

/** Cached for the life of the server process (and on disk) when FFmpeg works; a failure only for FAILED_CHECK_TTL_MS. */
export function getCapabilities(refresh = false): Promise<Capabilities> {
  if (!refresh && !g.__VDOCaps) loadSavedCapabilities();
  const stale = g.__VDOCapsFailedAt !== undefined && Date.now() - g.__VDOCapsFailedAt > FAILED_CHECK_TTL_MS;
  if (refresh || stale || !g.__VDOCaps) {
    g.__VDOCapsFailedAt = undefined;
    const p = detect();
    g.__VDOCaps = p;
    void p.then((c) => {
      if (g.__VDOCaps !== p) return;
      g.__VDOCapsDone = c;
      if (c.ok) save(c);
      else g.__VDOCapsFailedAt = Date.now();
    });
  }
  return g.__VDOCaps;
}

/**
 * The latest finished check, without waiting for one: pages call this so they never stand still while FFmpeg is
 * probed. null when no check has finished yet (one is started). Work that needs FFmpeg (jobs) waits for
 * getCapabilities() instead, and says what's wrong then.
 */
export function peekCapabilities(): Capabilities | null {
  void getCapabilities().catch(() => undefined);
  return g.__VDOCapsDone ?? null;
}

/** Whether to warn people that videos can't be made here: a real lack, not a check still running or a passing "busy". */
export function capabilityWarning(caps: Capabilities | null): string | null {
  return caps && !caps.ok && !caps.busy ? caps.message : null;
}

/**
 * After a deploy (a new FFmpeg) there is no saved result, and the first visitor would start the 20 s check. Instead
 * the server starts it by itself, `delayMs` after it comes up (out of the way of its own start), and once more
 * `retryMs` later if the host was busy. Returns the way to stop it (tests).
 */
export function warmCapabilities(delayMs = 15_000, retryMs = 60_000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (ms: number, fn: () => void) => {
    timer = setTimeout(fn, ms);
    timer.unref?.();
  };
  if (loadSavedCapabilities()) return () => undefined;
  later(delayMs, () => {
    void getCapabilities()
      .then((c) => {
        if (c.busy) later(retryMs, () => void getCapabilities(true).catch(() => undefined));
      })
      .catch(() => undefined);
  });
  return () => clearTimeout(timer);
}
