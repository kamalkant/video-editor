import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { runFfmpeg, runFfprobe, SAFE_INPUT } from "./ffmpeg/run";
import { readJson, storagePath, writeJson } from "./storage";

/**
 * Music library: your own music folder (indexed: length, title, artist,
 * genre → mood) plus a starter set of music beds and sound effects made on
 * this Mac by FFmpeg (nothing is downloaded). Adding one copies it into
 * My Assets like an upload.
 */

export type LibraryKind = "music" | "sfx";
export type LibraryItem = {
  id: string;
  title: string;
  artist: string | null;
  mood: string;
  kind: LibraryKind;
  duration: number;
  source: "starter" | "folder" | "upload";
};
type Stored = LibraryItem & { path: string; mtime: number; size: number };

const AUDIO_EXT = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".aif",
  ".aiff",
  ".flac",
  ".ogg",
  ".opus",
  ".caf",
]);
const MAX_FILES = 2000;
const settingsFile = () => storagePath("library-settings.json");
const indexFile = () => storagePath("library-index.json");
const starterDir = () => storagePath("library-starter");

// ---------- starter set (FFmpeg synthesis) ----------

type Recipe = {
  name: string;
  title: string;
  kind: LibraryKind;
  mood: string;
  d: number;
  src: string;
  af?: string;
};
const chord = (fs: number[], amp: number) =>
  fs.map((f) => `${amp}*sin(2*PI*${f}*t)`).join("+");
export const STARTER: Recipe[] = [
  // music beds (30 s, loop-friendly)
  {
    name: "calm-pad",
    title: "Calm pad",
    kind: "music",
    mood: "Calm",
    d: 30,
    src: `aevalsrc='(${chord([261.63, 329.63, 392], 0.09)})*if(lt(mod(t\\,8)\\,4)\\,1\\,0)+(${chord([220, 261.63, 329.63], 0.09)})*if(lt(mod(t\\,8)\\,4)\\,0\\,1)'`,
    af: "lowpass=f=1800,aecho=0.8:0.7:120|240:0.35|0.25,afade=t=in:d=2,afade=t=out:st=27:d=3",
  },
  {
    name: "upbeat-pulse",
    title: "Upbeat pulse",
    kind: "music",
    mood: "Upbeat",
    d: 30,
    src: `aevalsrc='0.5*sin(2*PI*55*t)*exp(-12*mod(t\\,0.5))+0.12*sin(2*PI*if(lt(mod(t\\,2)\\,1)\\,110\\,146.83)*t)*(0.6+0.4*sin(2*PI*4*t))+0.05*(random(0)-0.5)*exp(-40*mod(t+0.25\\,0.5))'`,
    af: "afade=t=in:d=1,afade=t=out:st=28:d=2",
  },
  {
    name: "news-bed",
    title: "News bed",
    kind: "music",
    mood: "News",
    d: 30,
    src: `aevalsrc='(0.1*sin(2*PI*110*t)+0.05*sin(2*PI*220*t)+0.03*sin(2*PI*330*t))*if(lt(mod(t\\,0.25)\\,0.12)\\,1\\,0.2)+0.2*sin(2*PI*880*t)*exp(-60*mod(t\\,1))'`,
    af: "lowpass=f=4000,aecho=0.6:0.5:90:0.2,afade=t=in:d=1,afade=t=out:st=27:d=3",
  },
  {
    name: "tension",
    title: "Tension",
    kind: "music",
    mood: "Dramatic",
    d: 30,
    src: `aevalsrc='0.18*sin(2*PI*55*t)+0.08*sin(2*PI*(110+t*6)*t)*(0.5+0.5*sin(2*PI*0.25*t))'`,
    af: "lowpass=f=1200,aecho=0.8:0.8:300:0.4,afade=t=in:d=3,afade=t=out:st=27:d=3",
  },
  {
    name: "happy-bells",
    title: "Happy bells",
    kind: "music",
    mood: "Happy",
    d: 30,
    src: `aevalsrc='0.22*sin(2*PI*(if(lt(mod(t\\,1)\\,0.25)\\,523.25\\,if(lt(mod(t\\,1)\\,0.5)\\,659.25\\,if(lt(mod(t\\,1)\\,0.75)\\,783.99\\,880))))*t)*exp(-6*mod(t\\,0.25))'`,
    af: "aecho=0.7:0.6:180:0.3,afade=t=in:d=1,afade=t=out:st=28:d=2",
  },
  {
    name: "lofi-loop",
    title: "Lo-fi loop",
    kind: "music",
    mood: "Chill",
    d: 30,
    src: `aevalsrc='(${chord([196, 246.94, 293.66], 0.06)})*(0.7+0.3*sin(2*PI*0.5*t))+0.4*sin(2*PI*50*t)*exp(-14*mod(t\\,1))+0.08*(random(0)-0.5)*exp(-30*mod(t+0.5\\,1))+0.01*(random(1)-0.5)'`,
    af: "lowpass=f=2400,afade=t=in:d=1,afade=t=out:st=28:d=2",
  },
  // sound effects
  {
    name: "whoosh",
    title: "Whoosh",
    kind: "sfx",
    mood: "Transition",
    d: 0.9,
    src: "anoisesrc=color=pink:amplitude=0.8",
    af: "bandpass=f=900:width_type=h:w=1200,volume=1.5,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.5",
  },
  {
    name: "swoosh-up",
    title: "Swoosh up",
    kind: "sfx",
    mood: "Transition",
    d: 0.7,
    src: `aevalsrc='0.4*sin(2*PI*(200+1600*t)*t)'`,
    af: "afade=t=in:d=0.1,afade=t=out:st=0.4:d=0.3",
  },
  {
    name: "click",
    title: "Click",
    kind: "sfx",
    mood: "UI",
    d: 0.08,
    src: `aevalsrc='0.8*sin(2*PI*2000*t)*exp(-120*t)'`,
  },
  {
    name: "pop",
    title: "Pop",
    kind: "sfx",
    mood: "UI",
    d: 0.2,
    src: `aevalsrc='0.7*sin(2*PI*(600-2000*t)*t)*exp(-25*t)'`,
  },
  {
    name: "ding",
    title: "Ding",
    kind: "sfx",
    mood: "UI",
    d: 1.5,
    src: `aevalsrc='0.5*sin(2*PI*1318.5*t)*exp(-3.5*t)+0.2*sin(2*PI*2637*t)*exp(-6*t)'`,
  },
  {
    name: "notification",
    title: "Notification",
    kind: "sfx",
    mood: "UI",
    d: 0.6,
    src: `aevalsrc='0.4*sin(2*PI*880*t)*exp(-12*t)+0.4*sin(2*PI*1318.5*t)*exp(-12*(t-0.15))*gte(t\\,0.15)'`,
  },
  {
    name: "shutter",
    title: "Camera shutter",
    kind: "sfx",
    mood: "Foley",
    d: 0.35,
    src: "anoisesrc=color=white:amplitude=0.9",
    af: "volume='exp(-60*t)+exp(-60*(t-0.12))*gte(t\\,0.12)':eval=frame,highpass=f=1500",
  },
  {
    name: "typing",
    title: "Typing",
    kind: "sfx",
    mood: "Foley",
    d: 2.5,
    src: `aevalsrc='0.6*(random(0)-0.5)*exp(-200*mod(t\\,0.13+0.04*sin(t*7)))'`,
    af: "highpass=f=1200",
  },
  {
    name: "applause",
    title: "Applause",
    kind: "sfx",
    mood: "Crowd",
    d: 3.5,
    src: "anoisesrc=color=pink:amplitude=0.7",
    af: "tremolo=f=14:d=0.7,bandpass=f=2000:width_type=h:w=3000,volume=1.5,afade=t=in:d=0.4,afade=t=out:st=2.5:d=1",
  },
  {
    name: "riser",
    title: "Riser",
    kind: "sfx",
    mood: "Transition",
    d: 2,
    src: `aevalsrc='0.25*sin(2*PI*(150+700*t)*t)+0.15*(random(0)-0.5)*t'`,
    af: "afade=t=in:d=1.5,afade=t=out:st=1.85:d=0.15",
  },
];

/** FFmpeg arguments for one starter sound. */
export function starterArgs(r: Recipe, out: string): string[] {
  return [
    "-f",
    "lavfi",
    "-i",
    `${r.src}:d=${r.d}${r.src.startsWith("aevalsrc") ? ":s=48000" : ":sample_rate=48000"}`,
    ...(r.af ? ["-af", r.af] : []),
    "-ac",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-y",
    out,
  ];
}

const g = globalThis as unknown as { __VDOStarter?: Promise<void> };
/**
 * Make the starter set if any file is missing (a few seconds the first time;
 * later calls only check the files). Only a run in progress is shared, so a
 * cleared storage folder gets its sounds back.
 */
export function ensureStarter(): Promise<void> {
  g.__VDOStarter ??= (async () => {
    await mkdir(starterDir(), { recursive: true });
    for (const r of STARTER) {
      const out = join(starterDir(), `${r.name}.m4a`);
      const ok = await stat(out)
        .then((s) => s.size > 0)
        .catch(() => false);
      if (ok) continue;
      const tmp = `${out}.tmp.m4a`;
      await runFfmpeg(starterArgs(r, tmp), { timeoutMs: 60_000 });
      await rename(tmp, out);
    }
  })().finally(() => {
    g.__VDOStarter = undefined;
  });
  return g.__VDOStarter;
}

function starterItems(): Stored[] {
  return STARTER.map((r) => ({
    id: `starter-${r.name}`,
    title: r.title,
    artist: null,
    mood: r.mood,
    kind: r.kind,
    duration: r.d,
    source: "starter" as const,
    path: join(starterDir(), `${r.name}.m4a`),
    mtime: 0,
    size: 0,
  }));
}

import { TEMPLATE_AUDIO_TRACKS } from "./templates/templateMediaAssets";
import { readdirSync, statSync } from "node:fs";

function broadcastAudioDir() {
  return join(process.cwd(), "public/templates/audio");
}

function broadcastItems(): Stored[] {
  const dir = broadcastAudioDir();
  const known = new Map(TEMPLATE_AUDIO_TRACKS.map((t) => [t.fileName, t]));
  const results: Stored[] = [];

  for (const t of TEMPLATE_AUDIO_TRACKS) {
    results.push({
      id: `broadcast-${t.id}`,
      title: t.title,
      artist: "Broadcast Studio",
      mood: t.mood,
      kind: "music" as const,
      duration: t.duration,
      source: "starter" as const,
      path: join(dir, t.fileName),
      mtime: 0,
      size: 0,
    });
  }

  // Also auto-detect any custom audio files placed directly into public/templates/audio/
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (typeof f !== "string" || f.startsWith(".") || known.has(f)) continue;
      const ext = extname(f).toLowerCase();
      if (!AUDIO_EXT.has(ext)) continue;
      const full = join(dir, f);
      const s = statSync(full);
      const baseName = basename(f, ext);
      const cleanTitle = baseName
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      results.push({
        id: `broadcast-user-${createHash("sha1").update(f).digest("hex").slice(0, 10)}`,
        title: cleanTitle,
        artist: "Uploaded Audio",
        mood: "Newsroom",
        kind: "music" as const,
        duration: 20,
        source: "starter" as const,
        path: full,
        mtime: s.mtimeMs,
        size: s.size,
      });
    }
  } catch {
    // folder doesn't exist or not readable
  }

  return results;
}

// ---------- your folder ----------

export class LibraryError extends Error {}

export async function libraryFolder(): Promise<string | null> {
  return (await readJson<{ folder?: string }>(settingsFile()))?.folder ?? null;
}

export async function setLibraryFolder(folder: string | null): Promise<void> {
  if (folder !== null) {
    if (!isAbsolute(folder))
      throw new LibraryError(
        "Give the full path of the folder, e.g. /Users/you/Music/Library.",
      );
    const s = await stat(folder).catch(() => null);
    if (!s?.isDirectory())
      throw new LibraryError("That folder doesn't exist (or can't be opened).");
  }
  await mkdir(dirname(settingsFile()), { recursive: true });
  await writeJson(settingsFile(), { folder: folder ? resolve(folder) : null });
}

const idOf = (path: string) =>
  createHash("sha1").update(path).digest("hex").slice(0, 16);

async function walk(dir: string, depth: number, out: string[]) {
  if (depth > 4 || out.length >= MAX_FILES) return;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, depth + 1, out);
    else if (e.isFile() && AUDIO_EXT.has(extname(e.name).toLowerCase()))
      out.push(p);
  }
}

type Probe = { format?: { duration?: string; tags?: Record<string, string> } };
const tag = (t: Record<string, string> | undefined, k: string) =>
  t
    ? (Object.entries(t).find(([n]) => n.toLowerCase() === k)?.[1] ?? null)
    : null;

/** Index the folder (only new or changed files are probed again). */
export async function indexFolder(folder: string): Promise<Stored[]> {
  const old = new Map(
    ((await readJson<Stored[]>(indexFile())) ?? []).map((x) => [x.path, x]),
  );
  const files: string[] = [];
  await walk(folder, 0, files);
  const out: Stored[] = [];
  for (const path of files) {
    const s = await stat(path).catch(() => null);
    if (!s) continue;
    const prev = old.get(path);
    if (prev && prev.mtime === s.mtimeMs && prev.size === s.size) {
      out.push(prev);
      continue;
    }
    try {
      const j = JSON.parse(
        await runFfprobe(
          [...SAFE_INPUT, "-print_format", "json", "-show_format", path],
          { timeoutMs: 15_000 },
        ),
      ) as Probe;
      const duration = Number(j.format?.duration ?? 0);
      if (!(duration > 0)) continue;
      const tags = j.format?.tags;
      const folderName = basename(dirname(path));
      const genre = tag(tags, "genre");
      out.push({
        id: idOf(path),
        title: tag(tags, "title") ?? basename(path, extname(path)),
        artist: tag(tags, "artist"),
        mood:
          genre ??
          (relative(folder, dirname(path)) ? folderName : "Your music"),
        kind: duration < 8 ? "sfx" : "music",
        duration,
        source: "folder",
        path,
        mtime: s.mtimeMs,
        size: s.size,
      });
    } catch {
      /* not readable audio */
    }
  }
  await mkdir(dirname(indexFile()), { recursive: true });
  await writeJson(indexFile(), out);
  return out;
}

/** The sounds of your templates and those uploaded in the template pane ("My uploads"): files already in My Assets. */
export async function uploadItems(userId: string | null): Promise<LibraryItem[]> {
  if (!userId) return [];
  const { templateSounds } = await import("./templates/custom");
  const { getVideo } = await import("./videos");
  const out: LibraryItem[] = [];
  for (const s of await templateSounds(userId).catch(() => [])) {
    const m = await getVideo(s.assetId);
    if (!m) continue;
    out.push({
      id: `upload-${s.assetId}`,
      title: s.name.replace(/\.[^/.]+$/, ""),
      artist: "Uploaded audio",
      mood: s.template ?? "Uploaded",
      kind: "music",
      duration: Math.round(m.info.duration * 10) / 10,
      source: "upload",
    });
  }
  return out;
}
/** The My Assets file behind an "upload-<id>" library item, or null. */
export const uploadAssetId = (id: string): string | null =>
  /^upload-[0-9a-f-]{36}$/.test(id) ? id.slice("upload-".length) : null;

/** Everything in the library (the starter set is made if needed); `userId`: whose uploaded sounds ("My uploads") show. */
export async function listLibrary(userId: string | null = null): Promise<{
  items: LibraryItem[];
  folder: string | null;
}> {
  await ensureStarter().catch(() => undefined);
  const folder = await libraryFolder();
  const mine = folder
    ? ((await readJson<Stored[]>(indexFile())) ?? []).filter((x) =>
        x.path.startsWith(folder),
      )
    : [];
  const all = [...starterItems(), ...broadcastItems(), ...mine];
  const items: LibraryItem[] = all.map((x) => ({
    id: x.id,
    title: x.title,
    artist: x.artist,
    mood: x.mood,
    kind: x.kind,
    duration: x.duration,
    source: x.source,
  }));
  return { items: [...items, ...(await uploadItems(userId))], folder };
}

/** The file of a library item (only items in the index, broadcast items, or the starter set). */
export async function libraryPath(id: string): Promise<string | null> {
  const starter = starterItems().find((x) => x.id === id);
  if (starter) return starter.path;
  const broadcast = broadcastItems().find((x) => x.id === id);
  if (broadcast)
    return (await stat(broadcast.path).catch(() => null))
      ? broadcast.path
      : null;
  const folder = await libraryFolder();
  if (!folder) return null;
  const hit = ((await readJson<Stored[]>(indexFile())) ?? []).find(
    (x) => x.id === id,
  );
  if (
    !hit ||
    !resolve(/*turbopackIgnore: true*/ hit.path).startsWith(
      resolve(/*turbopackIgnore: true*/ folder) + "/",
    )
  )
    return null;
  return (await stat(hit.path).catch(() => null)) ? hit.path : null;
}

export async function libraryItem(id: string, userId: string | null = null): Promise<LibraryItem | null> {
  return (await listLibrary(userId)).items.find((x) => x.id === id) ?? null;
}

/** A copy of a library file in a temp folder, ready for importFile (which moves it). */
export async function copyForImport(
  id: string,
  tmpDir: string,
): Promise<{ path: string; name: string } | null> {
  if (id.startsWith("starter-")) await ensureStarter();
  const src = await libraryPath(id);
  const item = await libraryItem(id);
  if (!src || !item) return null;
  await mkdir(tmpDir, { recursive: true });
  const out = join(tmpDir, `lib${extname(src) || ".m4a"}`);
  await rm(out, { force: true });
  await (await import("node:fs/promises")).copyFile(src, out);
  return { path: out, name: `${item.title}${extname(src)}` };
}
