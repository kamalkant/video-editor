import "server-only";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemeClipItem } from "./memeCatalog";
import { dataRoot } from "@/lib/dataRoot";

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

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
  const cleanQ = query.trim().replace(/[^a-zA-Z0-9\s]/g, "");
  if (!cleanQ || cleanQ.length < 2) return [];

  await ensureSearchDir();

  try {
    // Fast flat-playlist metadata search
    const { stdout } = await execPromise(
      `yt-dlp --flat-playlist --dump-json --playlist-items 1-${limit} "ytsearch${limit}:${cleanQ} meme short"`,
      { timeout: 8000 }
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

    return results;
  } catch (err) {
    console.warn("Online meme search timed out or failed:", err);
    return [];
  }
}

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

  const tempRaw = `/tmp/raw_dyn_${cleanId}.mp4`;
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${cleanId}`;
    // Download segment (up to maxDuration seconds, e.g. 30s)
    const formattedDuration = String(Math.floor(maxDuration)).padStart(2, "0");
    await execPromise(
      `yt-dlp "${videoUrl}" --download-sections "*00:00:00-00:00:${formattedDuration}" -f "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b" --force-overwrites -o "${tempRaw}"`,
      { timeout: 45000 }
    );

    // Normalize with ffmpeg up to maxDuration
    await execPromise(
      `ffmpeg -i "${tempRaw}" -t ${maxDuration} -vf "scale='min(640,iw)':-2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart -y "${outMp4}"`,
      { timeout: 30000 }
    );

    // Extract thumbnail poster (0.5s into video)
    await execPromise(
      `ffmpeg -ss 00:00:00.5 -i "${outMp4}" -frames:v 1 -q:v 2 -y "${outJpg}"`,
      { timeout: 8000 }
    ).catch(() => {});

    return outMp4;
  } catch (err) {
    console.error("Failed to download dynamic video:", cleanId, err);
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
      await execPromise(`ffmpeg -ss 00:00:01 -i "${outMp4}" -frames:v 1 -q:v 2 -y "${outJpg}"`, {
        timeout: 6000,
      });
      return outJpg;
    } catch {
      // Fallback
    }
  }

  return null;
}
