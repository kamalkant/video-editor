import "server-only";
import { execFile, type ExecFileOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FFMPEG, runFfmpeg } from "@/lib/ffmpeg/run";
import { NO_YTDLP, YTDLP_JS, ytDlpBin, ytDlpEnv, ytDlpFailure } from "@/lib/import/ytdlp";
import type { MemeClipItem } from "./memeCatalog";
import { dataRoot } from "@/lib/dataRoot";

/**
 * execFile as a promise of { stdout, stderr }, written out: util.promisify relies on execFile's custom
 * promisify hook, which the production (webpack) build lost — stdout came back undefined on viplay.in.
 */
const execFilePromise = (bin: string, args: string[], opts: ExecFileOptions) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(bin, args, { ...opts, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }));
      else resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });

const CACHE_DIR = join(dataRoot(), "data", "cache", "memes", "search");

export async function ensureSearchDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

export type DynamicSearchResult = {
  id: string;
  title: string;
  duration: number;
};

/**
 * Searches YouTube for short meme clips on-demand.
 */
export async function searchOnlineMemes(query: string, limit = 4): Promise<MemeClipItem[]> {
  return (await searchOnlineMemesWhy(query, limit)).items;
}

/** The same, with the reason when YouTube search didn't work (shown in the Library instead of nothing). */
export async function searchOnlineMemesWhy(query: string, limit = 4): Promise<{ items: MemeClipItem[]; error: string | null }> {
  const cleanQ = query.trim().replace(/[^a-zA-Z0-9\s]/g, "");
  if (!cleanQ || cleanQ.length < 2) return { items: [], error: null };

  await ensureSearchDir();

  try {
    // Fast flat-playlist metadata search
    // (no shell: the query is one argument; the downloader fetched on Linux hosts, lib/import/ytdlp)
    const { stdout } = await execFilePromise(
      ytDlpBin(),
      [...YTDLP_JS, "--flat-playlist", "--dump-json", "--playlist-items", `1-${limit}`, `ytsearch${limit}:${cleanQ} meme short`],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024, env: ytDlpEnv() },
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    const results: MemeClipItem[] = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (!item?.id) continue;

        const dynId = `dyn_${item.id}`;
        const title = (item.title || `${cleanQ} meme`).slice(0, 50);
        const rawDuration = typeof item.duration === "number" ? item.duration : parseFloat(item.duration) || 10;
        const duration = Math.min(30, Math.max(1, rawDuration));

        results.push({
          id: dynId,
          title,
          dialogue: title,
          actorOrShow: "Web Search Result",
          category: "comedy",
          duration,
          thumbUrl: `/api/library/memes/search/thumb?id=${item.id}`,
          videoUrl: `/api/library/memes/search/video?id=${item.id}`,
          tags: [cleanQ, "web", "search", "trending"],
          width: 640,
          height: 360,
          isDynamic: true,
        });
      } catch {
        // Ignore single parse error
      }
    }

    return { items: results, error: null };
  } catch (err) {
    console.warn("Online meme search timed out or failed:", err);
    const e = err as { code?: string | number; stderr?: string; killed?: boolean; signal?: string };
    const stderr = String(e.stderr ?? "").trim();
    const why =
      e.code === "ENOENT"
        ? NO_YTDLP
        : e.killed
          ? "YouTube search took too long. Try again."
          : stderr
            ? ytDlpFailure(stderr)
            : `The YouTube search tool stopped (${e.signal ?? `exit ${e.code ?? "?"}`}): ${String((err as Error)?.message ?? err).replace(/\/[^\s:'"]+/g, "…").slice(0, 160)}`;
    return { items: [], error: why };
  }
}

const lastFailure = new Map<string, string>();
/** Why the last download of this YouTube clip failed, in words for the person (e.g. YouTube blocking the server). */
export const dynamicFailure = (ytId: string) => lastFailure.get(ytId.replace(/[^a-zA-Z0-9_-]/g, ""));

/**
 * Resolves or downloads a dynamic video clip to local cache with H.264/AAC.
 * Clips up to maxDuration (default 30s) preserve their full length.
 */
export async function ensureDynamicVideo(ytId: string, maxDuration = 30): Promise<string | null> {
  await ensureSearchDir();
  const cleanId = ytId.replace(/[^a-zA-Z0-9_-]/g, "");
  const outMp4 = join(CACHE_DIR, `${cleanId}.mp4`);
  const outJpg = join(CACHE_DIR, `${cleanId}.jpg`);

  if (existsSync(outMp4)) {
    return outMp4;
  }

  const tempRaw = join(tmpdir(), `raw_dyn_${cleanId}.mp4`);
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${cleanId}`;
    // Download segment (up to maxDuration seconds, e.g. 30s)
    const formattedDuration = String(Math.floor(maxDuration)).padStart(2, "0");
    await execFilePromise(
      ytDlpBin(),
      [...YTDLP_JS, "--download-sections", `*00:00:00-00:00:${formattedDuration}`, "-f", "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b", "--ffmpeg-location", FFMPEG, "--force-overwrites", "-o", tempRaw, "--", videoUrl],
      { timeout: 60000, env: ytDlpEnv() },
    );

    // Normalize with ffmpeg up to maxDuration
    await runFfmpeg(["-i", tempRaw, "-t", String(maxDuration), "-vf", "scale='min(640,iw)':-2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", "-y", outMp4], { timeoutMs: 60000 });

    // Extract thumbnail poster (0.5s into video)
    await runFfmpeg(["-ss", "0.5", "-i", outMp4, "-frames:v", "1", "-q:v", "2", "-y", outJpg], { timeoutMs: 15000 }).catch(() => {});

    return outMp4;
  } catch (err) {
    console.error("Failed to download dynamic video:", cleanId, err);
    const e = err as { code?: string | number; stderr?: string; killed?: boolean };
    const stderr = String(e.stderr ?? "").trim();
    lastFailure.set(
      cleanId,
      e.code === "ENOENT"
        ? NO_YTDLP
        : e.killed
          ? "YouTube took too long to send this clip. Try again."
          : stderr
            ? ytDlpFailure(stderr)
            : `The clip couldn't be made: ${String((err as Error)?.message ?? err).replace(/\/[^\s:'"]+/g, "…").slice(0, 160)}`,
    );
    return null;
  }
}

/**
 * Resolves or downloads a dynamic thumbnail image.
 */
export async function ensureDynamicThumb(ytId: string): Promise<string | null> {
  await ensureSearchDir();
  const cleanId = ytId.replace(/[^a-zA-Z0-9_-]/g, "");
  const outJpg = join(CACHE_DIR, `${cleanId}.jpg`);

  if (existsSync(outJpg)) {
    return outJpg;
  }

  // Fast direct thumbnail download from YouTube CDN
  try {
    const thumbUrl = `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(outJpg, buffer);
      return outJpg;
    }
  } catch {
    // Ignore and fallback
  }

  // If video exists, extract frame
  const outMp4 = join(CACHE_DIR, `${cleanId}.mp4`);
  if (existsSync(outMp4)) {
    try {
      await runFfmpeg(["-ss", "1", "-i", outMp4, "-frames:v", "1", "-q:v", "2", "-y", outJpg], { timeoutMs: 15000 });
      return outJpg;
    } catch {
      // Fallback
    }
  }

  return null;
}
