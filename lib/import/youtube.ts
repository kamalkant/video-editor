import "server-only";
import { spawn } from "node:child_process";
import { aiKey } from "../ai/keys";
import { FFMPEG } from "../ffmpeg/run";
import { ImportError, thumbUrl } from "./stock";
import type { ImportItem, SearchPage } from "./types";

/**
 * YouTube: searching and previews with the official YouTube Data API (the
 * user's own key). Importing is only for the user's own videos or Creative
 * Commons ones, confirmed by the user: YouTube's rules don't allow
 * downloading other people's videos. Downloads use yt-dlp (installed with Homebrew).
 */

const API = "https://www.googleapis.com/youtube/v3";

/** "PT1H2M3S" → 3723 seconds. */
export function isoDuration(s: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function yt(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const u = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("key", key);
  let res: Response;
  try {
    res = await fetch(u, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new ImportError("Couldn't reach YouTube. Check the internet connection.", 502, "offline");
  }
  const j = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
  if (!res.ok) {
    const reason = j?.error?.errors?.[0]?.reason ?? "";
    const msg = (j?.error?.message ?? "").split(key).join("•••").slice(0, 300);
    if (/quota/i.test(reason) || /quota/i.test(msg)) throw new ImportError("Today's free YouTube searches are used up (about 100 a day). Try again tomorrow.", 429, "quota");
    if (res.status === 400 && /key/i.test(msg)) throw new ImportError("YouTube didn't accept your key. Check it in API keys.", 401, "key_refused");
    if (res.status === 403) throw new ImportError(`YouTube refused: ${msg || "turn on “YouTube Data API v3” for this key in Google Cloud."}`, 403, "key_refused");
    throw new ImportError(`YouTube said: ${msg || `error ${res.status}`}`);
  }
  return j;
}

function needKey(): string {
  const k = aiKey("youtube");
  if (!k) throw new ImportError("Add your YouTube Data API key first (API keys).", 400, "no_key");
  return k;
}

type YtVideo = { id: string; snippet?: { title?: string; channelTitle?: string; channelId?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { duration?: string }; status?: { license?: string; embeddable?: boolean } };

export function mapYouTube(v: YtVideo): ImportItem {
  const t = v.snippet?.thumbnails ?? {};
  const thumb = t.medium?.url ?? t.high?.url ?? t.default?.url ?? "";
  return {
    source: "youtube",
    id: v.id,
    title: decode(v.snippet?.title ?? "YouTube video"),
    thumb: thumb ? thumbUrl(thumb) : "",
    duration: isoDuration(v.contentDetails?.duration ?? ""),
    width: 1280,
    height: 720,
    author: decode(v.snippet?.channelTitle ?? "YouTube"),
    authorUrl: v.snippet?.channelId ? `https://www.youtube.com/channel/${v.snippet.channelId}` : null,
    pageUrl: `https://www.youtube.com/watch?v=${v.id}`,
    license: v.status?.license === "creativeCommon" ? "cc" : "youtube",
  };
}

/** Search (100 of the 10,000 free daily units), then the length and licence of the results (1 unit). */
export async function searchYouTube(q: string, opts: { ccOnly: boolean; pageToken?: string | null }): Promise<SearchPage> {
  const key = needKey();
  const s = (await yt("search", { part: "id", type: "video", q: q.slice(0, 200), maxResults: "20", videoEmbeddable: "true", safeSearch: "moderate", ...(opts.ccOnly ? { videoLicense: "creativeCommon" } : {}), ...(opts.pageToken ? { pageToken: opts.pageToken } : {}) }, key)) as { items?: { id?: { videoId?: string } }[]; nextPageToken?: string };
  const ids = (s.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x);
  if (!ids.length) return { items: [], next: null };
  const d = (await yt("videos", { part: "snippet,contentDetails,status", id: ids.join(",") }, key)) as { items?: YtVideo[] };
  const byId = new Map((d.items ?? []).map((v) => [v.id, v]));
  return { items: ids.map((id) => byId.get(id)).filter((v): v is YtVideo => !!v).map(mapYouTube), next: s.nextPageToken ?? null };
}

/** One video's details (for the rights check before a download). */
export async function youTubeItem(id: string): Promise<ImportItem> {
  if (!/^[\w-]{11}$/.test(id)) throw new ImportError("Unknown YouTube video.", 400, "bad_id");
  const d = (await yt("videos", { part: "snippet,contentDetails,status", id }, needKey())) as { items?: YtVideo[] };
  const v = d.items?.[0];
  if (!v) throw new ImportError("That YouTube video is no longer there.", 404, "not_found");
  return mapYouTube(v);
}

export async function testYouTubeKey(key: string) {
  await yt("videos", { part: "id", id: "aqz-KE-bpKQ" }, key);
}

/** Start yt-dlp (its path goes through a parameter, like FFmpeg's in lib/ffmpeg/run: no shell, and the build doesn't trace it). */
function runYtDlp(bin: string, args: string[], opts: { stdio: ("ignore" | "pipe")[]; signal?: AbortSignal }) {
  return spawn(bin, args, { ...opts, shell: false });
}
export const ytDlpBin = () => process.env.YTDLP_PATH ?? "yt-dlp";

export const NO_YTDLP =
  process.platform === "darwin"
    ? "The YouTube downloader (yt-dlp) isn't installed. Install it with: brew install yt-dlp"
    : "The YouTube downloader isn't available on this server right now. Download the clip on your computer and upload it.";

/** What to tell people when yt-dlp fails, from its error output. */
export function ytDlpFailure(stderr: string): string {
  // YouTube often refuses servers in data centers (hosting): "Sign in to confirm you're not a bot", HTTP 429
  if (/not a bot|HTTP Error 429|Too Many Requests/i.test(stderr))
    return "YouTube is blocking downloads from this server right now. Download the clip on your computer and upload it.";
  if (/Sign in|age/i.test(stderr)) return "YouTube asks to sign in for this video, so it can't be imported.";
  if (/unavailable|private/i.test(stderr)) return "This video is private or unavailable.";
  return "YouTube's video couldn't be downloaded. Try another one.";
}

/** Can the YouTube downloader run here, and if not why (ENOENT: not there; EACCES: not allowed to run…). */
export function ytDlpCheck(): Promise<{ ok: boolean; version?: string; why?: string }> {
  return new Promise((resolve) => {
    const c = runYtDlp(ytDlpBin(), ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    c.stderr!.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-400)));
    c.on("error", (e) => resolve({ ok: false, why: (e as NodeJS.ErrnoException).code ?? e.message }));
    c.on("close", (code) => resolve(code === 0 ? { ok: true, version: out.trim() } : { ok: false, why: `exit ${code}: ${err.trim().split("\n").pop()?.replace(/\/[^\s:'"]+/g, "…") ?? ""}`.slice(0, 200) }));
  });
}

/** Is the YouTube downloader installed? */
export function ytDlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const c = runYtDlp(ytDlpBin(), ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout!.on("data", (d: Buffer) => (out += d.toString()));
    c.on("error", () => resolve(null));
    c.on("close", (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/** Download a video (≤1080p, MP4 with sound) to `out`. Progress 0–100. */
export function ytDownload(id: string, out: string, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<void> {
  if (!/^[\w-]{11}$/.test(id)) return Promise.reject(new ImportError("Unknown YouTube video.", 400, "bad_id"));
  return new Promise((resolve, reject) => {
    const args = ["--no-playlist", "--newline", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]", "--merge-output-format", "mp4", "--ffmpeg-location", FFMPEG, "--no-part", "--no-mtime", "-o", out, "--", `https://www.youtube.com/watch?v=${id}`];
    const c = runYtDlp(ytDlpBin(), args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let err = "";
    // several parts (picture, sound): progress goes 0→100 per part; report the whole
    let part = 0;
    let last = 0;
    c.stdout!.on("data", (d: Buffer) => {
      for (const line of d.toString().split("\n")) {
        const m = /\[download\]\s+([\d.]+)%/.exec(line);
        if (!m) continue;
        const p = Number(m[1]);
        if (p < last - 50) part++;
        last = p;
        onProgress(Math.min(99, Math.round((part * 100 + p) / 2)));
      }
    });
    c.stderr!.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    c.on("error", (e) => reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new ImportError(NO_YTDLP, 424, "no_ytdlp") : e));
    c.on("close", (code) => (code === 0 ? resolve() : reject(new ImportError(ytDlpFailure(err), 502, "download_failed"))));
  });
}
