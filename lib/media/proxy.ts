import { rename, rm, stat } from "node:fs/promises";
import { FAST_H264, runFfmpeg, SAFE_INPUT } from "../ffmpeg/run";
import { probeMedia, type VideoInfo } from "../ffmpeg/probe";
import { storagePath, writeJson } from "../storage";
import { getVideo, sourcePath, type VideoMeta } from "../videos";

export type ProxyFile = "proxy.mp4" | "proxy.webm";

export type ProxyMeta = {
  ready: boolean;
  file: ProxyFile;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  createdAt: number;
  hasAlpha?: boolean;
};

export type ProxyState = "idle" | "generating" | "ready" | "error";

export type ProxyStatus = {
  state: ProxyState;
  percent: number;
  proxy?: ProxyMeta | null;
  error?: string;
};

export const PROXY_MAX_DIM = 720;
export const PROXY_MAX_WIDTH = 1280;
export const PROXY_GOP = 30;
export const PROXY_BITRATE_KBPS = 1500;

export function proxyFileName(hasAlpha: boolean): ProxyFile {
  return hasAlpha ? "proxy.webm" : "proxy.mp4";
}

export function proxyFilePath(videoId: string, hasAlpha: boolean): string {
  return storagePath("videos", videoId, proxyFileName(hasAlpha));
}

export function proxyUrl(videoId: string): string {
  return "/api/videos/" + videoId + "/proxy";
}

export function buildProxyScaleFilter(): string {
  return "scale=w='min(1280,trunc(iw/2)*2)':h='min(720,trunc(ih/2)*2)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
}

export function buildProxyArgs(
  src: string,
  out: string,
  info: Pick<VideoInfo, "width" | "height" | "fps" | "hasAudio" | "alpha">,
  encoder: "h264_videotoolbox" | "libx264" = FAST_H264,
): string[] {
  const isAlpha = !!info.alpha;
  const scaleFilter = buildProxyScaleFilter();
  const args: string[] = [
    ...SAFE_INPUT,
    "-i",
    src,
    "-map",
    "0:v:0",
    ...(info.hasAudio ? ["-map", "0:a:0?"] : []),
    "-map_metadata",
    "-1",
  ];

  if (isAlpha) {
    args.push(
      "-vf",
      scaleFilter + ",format=yuva420p",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-b:v",
      "0",
      "-crf",
      "32",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-row-mt",
      "1",
      "-auto-alt-ref",
      "0",
      "-g",
      String(PROXY_GOP),
    );
    if (info.hasAudio) {
      args.push("-c:a", "libopus", "-b:a", "128k", "-ar", "48000");
    }
    args.push("-f", "webm");
  } else {
    args.push("-vf", scaleFilter + ",format=yuv420p");
    if (encoder === "h264_videotoolbox") {
      args.push(
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        PROXY_BITRATE_KBPS + "k",
        "-allow_sw",
        "1",
        "-g",
        String(PROXY_GOP),
      );
    } else {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-g",
        String(PROXY_GOP),
        "-keyint_min",
        "15",
      );
    }
    if (info.hasAudio) {
      args.push("-c:a", "aac", "-b:a", "128k");
    }
    args.push("-movflags", "+faststart", "-f", "mp4");
  }
  args.push("-progress", "pipe:1", "-nostats", "-y", out);
  return args;
}

type ProxyWork = { percent: number; promise: Promise<ProxyMeta>; error?: string };
const g = globalThis as unknown as { __VDOProxyWork?: Map<string, ProxyWork> };
const proxyWorkMap = (g.__VDOProxyWork ??= new Map<string, ProxyWork>());

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

export async function getProxyStatus(video: VideoMeta): Promise<ProxyStatus> {
  const w = proxyWorkMap.get(video.id);
  if (w) {
    return w.error
      ? { state: "error", percent: w.percent, error: w.error }
      : { state: "generating", percent: w.percent };
  }
  const isAlpha = !!video.info.alpha;
  const pPath = proxyFilePath(video.id, isAlpha);
  const exists = await fileExists(pPath);
  if (exists && video.proxy?.ready) {
    return { state: "ready", percent: 100, proxy: video.proxy };
  }
  if (exists) {
    try {
      const s = await stat(pPath);
      const probed = await probeMedia(pPath).catch(() => null);
      const meta: ProxyMeta = {
        ready: true,
        file: proxyFileName(isAlpha),
        width: probed?.info.width ?? Math.min(1280, video.info.width),
        height: probed?.info.height ?? Math.min(720, video.info.height),
        fps: probed?.info.fps ?? video.info.fps,
        sizeBytes: s.size,
        createdAt: Date.now(),
        hasAlpha: isAlpha,
      };
      video.proxy = meta;
      await writeJson(storagePath("videos", video.id, "meta.json"), video).catch(() => undefined);
      return { state: "ready", percent: 100, proxy: meta };
    } catch {
      // fall through
    }
  }
  return { state: "idle", percent: 0, proxy: null };
}

export function ensureProxy(
  video: VideoMeta,
  onProgress?: (percent: number) => void,
  options?: { force?: boolean },
): Promise<ProxyMeta> {
  const id = video.id;
  const isAlpha = !!video.info.alpha;
  const targetFile = proxyFileName(isAlpha);
  const out = proxyFilePath(id, isAlpha);
  const running = proxyWorkMap.get(id);
  if (running && !running.error && !options?.force) {
    if (onProgress) {
      const timer = setInterval(() => onProgress(running.percent), 400);
      void running.promise.finally(() => clearInterval(timer)).catch(() => undefined);
    }
    return running.promise;
  }
  const work: ProxyWork = { percent: 0, promise: Promise.resolve({} as ProxyMeta) };
  work.promise = (async () => {
    if (!options?.force && (await fileExists(out)) && video.proxy?.ready) {
      return video.proxy;
    }
    const tmpOut = out + ".tmp." + (isAlpha ? "webm" : "mp4");
    const src = sourcePath(id);
    try {
      try {
        await runFfmpeg(
          buildProxyArgs(src, tmpOut, video.info, FAST_H264),
          {
            timeoutMs: 30 * 60 * 1000,
            onProgress: (t) => {
              work.percent = Math.min(99, Math.round((100 * t) / Math.max(0.1, video.info.duration)));
              onProgress?.(work.percent);
            },
          },
        );
      } catch (hwErr) {
        if (isAlpha) throw hwErr;
        await rm(tmpOut, { force: true });
        await runFfmpeg(
          buildProxyArgs(src, tmpOut, video.info, "libx264"),
          {
            timeoutMs: 45 * 60 * 1000,
            onProgress: (t) => {
              work.percent = Math.min(99, Math.round((100 * t) / Math.max(0.1, video.info.duration)));
              onProgress?.(work.percent);
            },
          },
        );
      }
      const s = await stat(tmpOut);
      if (!s.size) throw new Error("Generated proxy file is empty.");
      await rename(tmpOut, out);
      const probed = await probeMedia(out).catch(() => null);
      const meta: ProxyMeta = {
        ready: true,
        file: targetFile,
        width: probed?.info.width ?? Math.min(1280, video.info.width),
        height: probed?.info.height ?? Math.min(720, video.info.height),
        fps: probed?.info.fps ?? video.info.fps,
        sizeBytes: s.size,
        createdAt: Date.now(),
        hasAlpha: isAlpha,
      };
      const currentMeta = await getVideo(id);
      if (currentMeta) {
        currentMeta.proxy = meta;
        await writeJson(storagePath("videos", id, "meta.json"), currentMeta);
      }
      proxyWorkMap.delete(id);
      onProgress?.(100);
      return meta;
    } catch (err: any) {
      work.error = err?.message || "Failed to generate video proxy";
      await rm(tmpOut, { force: true });
      setTimeout(() => proxyWorkMap.delete(id), 15000);
      throw err;
    }
  })();
  proxyWorkMap.set(id, work);
  return work.promise;
}

export async function invalidateProxy(videoId: string): Promise<boolean> {
  let removed = false;
  for (const f of ["proxy.mp4", "proxy.webm"]) {
    const p = storagePath("videos", videoId, f);
    try {
      await rm(p, { force: true });
      removed = true;
    } catch {
      // ignored
    }
  }
  const meta = await getVideo(videoId);
  if (meta && meta.proxy) {
    delete meta.proxy;
    await writeJson(storagePath("videos", videoId, "meta.json"), meta);
  }
  proxyWorkMap.delete(videoId);
  return removed;
}

export async function cleanupProxies(maxAgeDays = 30): Promise<{ removedCount: number; freedBytes: number }> {
  let removedCount = 0;
  let freedBytes = 0;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const { readdir } = await import("node:fs/promises");
  const ids = await readdir(storagePath("videos")).catch(() => [] as string[]);
  for (const id of ids) {
    for (const f of ["proxy.mp4", "proxy.webm"]) {
      const p = storagePath("videos", id, f);
      try {
        const s = await stat(p);
        if (s.mtimeMs < cutoff) {
          freedBytes += s.size;
          await rm(p, { force: true });
          removedCount++;
          const meta = await getVideo(id);
          if (meta && meta.proxy) {
            delete meta.proxy;
            await writeJson(storagePath("videos", id, "meta.json"), meta);
          }
        }
      } catch {
        // not existing or error
      }
    }
  }
  return { removedCount, freedBytes };
}
