import { DEFAULT_OUTPUT, type EditSpec } from "../edit/spec";
import { FILM_COLS, FILM_H, filmCount, filmFrameW } from "../editor/film";
import { buildFilterGraph } from "./graph";
import type { VideoInfo } from "./probe";
import { runFfmpeg, SAFE_INPUT } from "./run";
import { computeSeeThrough } from "../media/seeThrough";

export { computeSeeThrough };

/** Preview frames are capped at this width (4K sources stay fast). */
export const PREVIEW_MAX_WIDTH = 1920;
const STATS_WIDTH = 320;

export type PreviewStats = {
  /** % of the subject's solid core that is partly transparent (alpha < 245). null = no subject found. */
  seeThroughPct: number | null;
  /** % of the frame that is fully transparent. */
  transparentPct: number;
  width: number;
  height: number;
  t: number;
};

function previewWidth(info: Pick<VideoInfo, "width">) {
  return info.width > PREVIEW_MAX_WIDTH ? PREVIEW_MAX_WIDTH : undefined;
}

/** Exact keyed frame (PNG with alpha) plus see-through stats, from one FFmpeg run. */
/** The AI mask for this frame: the finished mask video, or one raw gray frame. */
export type PreviewMask = { file: string; raw: { w: number; h: number } | null };

export async function renderPreview(path: string, info: VideoInfo, spec: EditSpec, t: number, signal?: AbortSignal, mask?: PreviewMask | null): Promise<{ png: Buffer; stats: PreviewStats }> {
  const width = previewWidth(info);
  const outW = width ?? info.width;
  const outH = width ? Math.round((info.height * width) / info.width / 2) * 2 : info.height;
  const statsH = Math.max(2, Math.round((outH * STATS_WIDTH) / outW));
  const graph = buildFilterGraph(spec, "preview", { width, maskInput: mask ? "[1:v]" : undefined }) + `;[vout]split=2[pv][ps];[ps]alphaextract,scale=${STATS_WIDTH}:${statsH}:flags=area[pa]`;
  const tt = Math.min(Math.max(0, t), Math.max(0, info.duration - 0.05));
  const maskArgs = !mask ? [] : mask.raw ? ["-f", "rawvideo", "-pix_fmt", "gray", "-s", `${mask.raw.w}x${mask.raw.h}`, "-i", mask.file] : ["-ss", tt.toFixed(3), "-i", mask.file];
  const r = await runFfmpeg(
    [
      ...SAFE_INPUT, "-ss", tt.toFixed(3), "-i", path, ...maskArgs, "-filter_complex", graph,
      "-map", "[pv]", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1",
      "-map", "[pa]", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:3",
    ],
    { collectStdout: true, collectFd3: true, signal, timeoutMs: 30_000 },
  );
  const alpha = new Uint8Array(r.fd3.buffer, r.fd3.byteOffset, Math.min(r.fd3.length, STATS_WIDTH * statsH));
  const st = alpha.length === STATS_WIDTH * statsH ? computeSeeThrough(alpha, STATS_WIDTH, statsH) : { seeThroughPct: null, transparentPct: 0 };
  return { png: r.stdout, stats: { ...st, width: outW, height: outH, t: tt } };
}

/** The original (un-keyed) frame as PNG, same size as the preview. */
export async function renderFrame(path: string, info: VideoInfo, t: number, signal?: AbortSignal): Promise<Buffer> {
  const width = previewWidth(info);
  const vf = width ? `scale=${width}:-2:flags=lanczos` : "null";
  const tt = Math.min(Math.max(0, t), Math.max(0, info.duration - 0.05));
  const r = await runFfmpeg(
    [...SAFE_INPUT, "-ss", tt.toFixed(3), "-i", path, "-frames:v", "1", "-vf", vf, "-f", "image2pipe", "-c:v", "png", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 20_000 },
  );
  return r.stdout;
}

/** Small JPEG thumbnail (320 px wide) for the media and project lists. Sound files get their waveform. */
export async function renderThumb(path: string, info: VideoInfo, signal?: AbortSignal): Promise<Buffer> {
  if (!info.width) {
    const w = await runFfmpeg(
      [...SAFE_INPUT, "-i", path, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=320x180:colors=0x5eead4:scale=sqrt,format=rgba[w];color=c=0x0f1d2e:s=320x180[bg];[bg][w]overlay=format=auto", "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"],
      { collectStdout: true, signal, timeoutMs: 30_000 },
    );
    return w.stdout;
  }
  const tt = Math.min(1, Math.max(0, info.duration / 2));
  const r = await runFfmpeg(
    [...SAFE_INPUT, ...(info.duration ? ["-ss", tt.toFixed(3)] : []), "-i", path, "-frames:v", "1", "-vf", "scale=320:-2:flags=bicubic,format=yuvj420p", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 20_000 },
  );
  return r.stdout;
}

/** Filmstrip for the timeline clip: 12 frames side by side, 54 px high (JPEG). */
export async function renderStrip(path: string, info: VideoInfo, signal?: AbortSignal): Promise<Buffer> {
  const n = 12;
  // a picture: the same frame twelve times
  const still = !info.duration;
  const rate = still ? n : Math.max(0.05, n / Math.max(0.1, info.duration));
  const r = await runFfmpeg(
    [...SAFE_INPUT, ...(still ? ["-loop", "1", "-t", "1"] : []), "-i", path, "-an", "-vf", `fps=${rate.toFixed(4)},scale=-2:54:flags=bicubic,format=yuvj420p,tile=${n}x1`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "2", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 60_000 },
  );
  return r.stdout;
}

/**
 * The timeline film (lib/editor/film.ts): `filmCount` frames spread over the video, each
 * FILM_H px high at the video's shape, in a grid FILM_COLS wide. With background removal
 * (`spec`) it's a PNG with the removed parts see-through; without, a JPEG.
 */
export async function renderFilm(path: string, info: VideoInfo, spec: EditSpec | null, mask: string | null, signal?: AbortSignal): Promise<Buffer> {
  const n = filmCount(info.duration, info.fps);
  const fw = filmFrameW(info.width, info.height);
  const frames = Math.max(1, Math.floor(info.duration * info.fps));
  const k = Math.max(1, Math.floor(frames / n));
  const h = Math.floor(k / 2);
  // the middle frame of each slot (n counts decoded frames)
  const select = `gte(n\\,${h})*not(mod(n-${h}\\,${k}))`;
  const rows = Math.ceil(n / FILM_COLS);
  const keyed = !!spec?.ops.some((o) => o.enabled);
  // keyed at a small size (fast), then down to the film's
  const work = Math.min(info.width, Math.max(fw * 4, 320));
  const graph =
    buildFilterGraph(keyed ? spec! : { version: 1, ops: [], output: spec?.output ?? DEFAULT_OUTPUT }, "preview", { select, pre: `scale=${Math.round(work / 2) * 2}:-2:flags=bicubic`, maskInput: keyed && mask ? "[1:v]" : undefined }) +
    `;[vout]scale=${fw}:${FILM_H}:flags=bicubic,${keyed ? "format=rgba" : "format=yuvj420p"},tile=${FILM_COLS}x${rows}[film]`;
  const r = await runFfmpeg(
    [...SAFE_INPUT, "-i", path, ...(keyed && mask ? ["-i", mask] : []), "-an", "-filter_complex", graph, "-map", "[film]", "-frames:v", "1", "-f", "image2pipe", ...(keyed ? ["-c:v", "png"] : ["-c:v", "mjpeg", "-q:v", "2"]), "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 120_000 },
  );
  return r.stdout;
}

/** Audio waveform for the timeline (PNG, teal on transparent). */
export async function renderWave(path: string, signal?: AbortSignal): Promise<Buffer> {
  const r = await runFfmpeg(
    [...SAFE_INPUT, "-i", path, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=1600x64:colors=0x5eead4:scale=sqrt", "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"],
    { collectStdout: true, signal, timeoutMs: 60_000 },
  );
  return r.stdout;
}
