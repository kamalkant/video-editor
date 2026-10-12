import "server-only";
import { aiKey } from "../ai/keys";
import type { ImportItem, SearchPage, Shape } from "./types";

/**
 * Pexels and Pixabay (free stock videos you may download and use). Searched
 * with the user's own free keys. Thumbnails and previews go through our own
 * proxy (thumbUrl) and files are downloaded only from the libraries' hosts.
 */

export class ImportError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "import_failed",
  ) {
    super(message);
  }
}

/** Where pictures and files may come from (nothing else is fetched). */
const HOSTS = [/(^|\.)pexels\.com$/, /^player\.vimeo\.com$/, /(^|\.)vimeocdn\.com$/, /(^|\.)akamaized\.net$/, /^cdn\.pixabay\.com$/, /^pixabay\.com$/];
export function allowedUrl(u: string): URL | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && HOSTS.some((h) => h.test(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}
export const thumbUrl = (u: string) => `/api/import/thumb?u=${encodeURIComponent(u)}`;

const scrubKey = (s: string, key: string | null) => (key ? s.split(key).join("•••") : s).slice(0, 300);

async function getJson(url: string, init: RequestInit, key: string | null, name: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new ImportError(`Couldn't reach ${name}. Check the internet connection.`, 502, "offline");
  }
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new ImportError(`${name} didn't accept your key. Check it in API keys.`, 401, "key_refused");
  if (res.status === 429) throw new ImportError(`${name}'s limit for now is used up. Try again in a little while.`, 429, "busy");
  if (!res.ok) throw new ImportError(`${name} said: ${scrubKey(text, key) || `error ${res.status}`}`, 502);
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError(`${name} sent something unexpected. Try again.`);
  }
}

function needKey(id: "pexels" | "pixabay", name: string): string {
  const k = aiKey(id);
  if (!k) throw new ImportError(`Add your free ${name} key first (API keys).`, 400, "no_key");
  return k;
}

// ---------- Pexels ----------

type PexelsVideo = { id: number; width: number; height: number; duration: number; url: string; image: string; user?: { name?: string; url?: string }; video_files?: { quality?: string; file_type?: string; width?: number; height?: number; link: string }[] };

export function mapPexels(v: PexelsVideo): ImportItem {
  const slug = v.url?.split("/").filter(Boolean).pop()?.replace(/-\d+$/, "").replace(/-/g, " ");
  const previewVideo = v.video_files?.find((f) => (f.width && f.width <= 720) || (f.height && f.height <= 720))?.link || v.video_files?.[0]?.link;
  return {
    source: "pexels",
    id: String(v.id),
    title: slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : `Pexels video ${v.id}`,
    thumb: thumbUrl(v.image),
    videoUrl: previewVideo || undefined,
    duration: v.duration,
    width: v.width,
    height: v.height,
    author: v.user?.name ?? "Pexels",
    authorUrl: v.user?.url ?? null,
    pageUrl: v.url,
    license: "free",
  };
}

/** The MP4 to download: the biggest one up to maxHeight on its short side, else the smallest. */
export function bestFile(files: { width?: number; height?: number; link: string; file_type?: string }[], maxShort = 1080): string | null {
  const mp4 = files.filter((f) => (f.file_type ?? "video/mp4") === "video/mp4" && f.link);
  const short = (f: { width?: number; height?: number }) => Math.min(f.width ?? 0, f.height ?? 0);
  const fit = mp4.filter((f) => short(f) <= maxShort).sort((a, b) => short(b) - short(a));
  return (fit[0] ?? [...mp4].sort((a, b) => short(a) - short(b))[0])?.link ?? null;
}

export async function searchPexels(q: string, page: number, shape: Shape): Promise<SearchPage> {
  const key = needKey("pexels", "Pexels");
  const u = new URL("https://api.pexels.com/videos/search");
  u.searchParams.set("query", q);
  u.searchParams.set("per_page", "24");
  u.searchParams.set("page", String(page));
  if (shape !== "any") u.searchParams.set("orientation", shape);
  const j = (await getJson(u.href, { headers: { Authorization: key } }, key, "Pexels")) as { videos?: PexelsVideo[]; next_page?: string };
  return { items: (j.videos ?? []).map(mapPexels), next: j.next_page ? String(page + 1) : null };
}

export async function pexelsFile(id: string): Promise<{ item: ImportItem; file: string }> {
  const key = needKey("pexels", "Pexels");
  if (!/^\d{1,15}$/.test(id)) throw new ImportError("Unknown Pexels video.", 400, "bad_id");
  const v = (await getJson(`https://api.pexels.com/videos/videos/${id}`, { headers: { Authorization: key } }, key, "Pexels")) as PexelsVideo;
  const file = bestFile(v.video_files ?? []);
  if (!file) throw new ImportError("Pexels has no downloadable file for this video.");
  return { item: mapPexels(v), file };
}

// ---------- Pixabay ----------

type PixabayVideo = { id: number; pageURL: string; tags?: string; duration: number; user?: string; user_id?: number; videos?: Record<string, { url?: string; width?: number; height?: number; thumbnail?: string }> };

export function mapPixabay(v: PixabayVideo): ImportItem {
  const sizes = v.videos ?? {};
  const pick = sizes.medium ?? sizes.large ?? sizes.small ?? sizes.tiny ?? {};
  const videoUrl = sizes.tiny?.url || sizes.small?.url || sizes.medium?.url || pick.url;
  const tags = (v.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const title = tags.length ? tags.slice(0, 3).join(", ") : `Pixabay video ${v.id}`;
  return {
    source: "pixabay",
    id: String(v.id),
    title: title.charAt(0).toUpperCase() + title.slice(1),
    thumb: pick.thumbnail ? thumbUrl(pick.thumbnail) : "",
    videoUrl: videoUrl || undefined,
    duration: v.duration,
    width: pick.width ?? 0,
    height: pick.height ?? 0,
    author: v.user ?? "Pixabay",
    authorUrl: v.user && v.user_id ? `https://pixabay.com/users/${v.user}-${v.user_id}/` : null,
    pageUrl: v.pageURL,
    license: "free",
  };
}

export async function searchPixabay(q: string, page: number): Promise<SearchPage> {
  const key = needKey("pixabay", "Pixabay");
  const u = new URL("https://pixabay.com/api/videos/");
  u.searchParams.set("key", key);
  u.searchParams.set("q", q.slice(0, 100));
  u.searchParams.set("per_page", "24");
  u.searchParams.set("page", String(page));
  u.searchParams.set("safesearch", "true");
  const j = (await getJson(u.href, {}, key, "Pixabay")) as { hits?: PixabayVideo[]; totalHits?: number };
  const hits = j.hits ?? [];
  return { items: hits.map(mapPixabay), next: page * 24 < (j.totalHits ?? 0) ? String(page + 1) : null };
}

export async function pixabayFile(id: string): Promise<{ item: ImportItem; file: string }> {
  const key = needKey("pixabay", "Pixabay");
  if (!/^\d{1,15}$/.test(id)) throw new ImportError("Unknown Pixabay video.", 400, "bad_id");
  const u = new URL("https://pixabay.com/api/videos/");
  u.searchParams.set("key", key);
  u.searchParams.set("id", id);
  const j = (await getJson(u.href, {}, key, "Pixabay")) as { hits?: PixabayVideo[] };
  const v = j.hits?.[0];
  if (!v) throw new ImportError("That Pixabay video is no longer there.", 404, "not_found");
  const s = v.videos ?? {};
  const file = bestFile(["large", "medium", "small", "tiny"].map((k) => s[k]).filter((x): x is { url: string; width?: number; height?: number } => !!x?.url).map((x) => ({ link: x.url, width: x.width, height: x.height })));
  if (!file) throw new ImportError("Pixabay has no downloadable file for this video.");
  return { item: mapPixabay(v), file };
}

/** Test a key with the smallest search (free). */
export async function testStockKey(id: "pexels" | "pixabay", key: string): Promise<void> {
  if (id === "pexels") await getJson("https://api.pexels.com/videos/search?query=nature&per_page=1", { headers: { Authorization: key } }, key, "Pexels");
  else await getJson(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=nature&per_page=3`, {}, key, "Pixabay");
}
