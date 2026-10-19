/**
 * Local-first media: a file you import plays straight from your computer, and stays there.
 *
 * Picking a file puts it on the timeline at once, playing from an object URL of the file itself. It is not
 * sent anywhere ("local"): it goes to the server only when a server feature needs it — the export, AI tools,
 * background removal, a stabilized copy… (ensureOnServer, and the upload gate below, which sends it the
 * moment such a request is made). The upload is PUT /api/videos/<id>: the server keeps the id the browser
 * chose, so the timeline and the project never change ids. Meanwhile:
 *  - the preview, scrubbing and sound use your own file (Studio's sourceOf → ProgramPlayer)
 *  - thumbnails show a frame taken in the browser; the server's filmstrip and waveform follow the upload
 *  - requests for server work on that file wait for its upload (installUploadGate)
 *  - a copy goes to the browser's private storage (OPFS, lib/storage/opfs): after a reload the preview still
 *    plays from it, and an upload that didn't finish starts again (restoreLocal). While a copy is being read
 *    back (restorePending) the player waits for it instead of downloading the server's copy meanwhile
 *  - the timeline film is made in the browser, after a short pause and never while the preview plays
 *    (setFilmPaused): its second decoder would compete with playback
 * A file this browser can't decode (ProRes, some AVI / MKV, HEVC where unsupported) isn't local: it's
 * uploaded first and the server makes a playable copy, as before.
 */
import type { MediaLite } from "../edit/doc";
import type { VideoMeta } from "../api/types";
import { ApiError } from "../api/types";
import { CHUNKED_ABOVE_BYTES, uploadInChunks } from "../api/chunkedUpload";
import { filmSlots, FILM_H, parseFilmOps } from "../editor/film";
import { LiveKeyRenderer, type LiveKeyParams } from "../editor/liveKey";
import { LIMITS } from "../settings";
import { opfsDelete, opfsReadBlob, opfsWriteBlob } from "../storage/opfs";

export type MediaKind = "video" | "image" | "audio";
/** "local": kept on this computer only (nothing sent yet); then "uploading" → "uploaded", or "failed". */
export type LocalState = "local" | "uploading" | "uploaded" | "failed";

export type LocalItem = {
  id: string;
  name: string;
  kind: MediaKind;
  /** object URL of the file (this tab only) */
  url: string;
  /** object URL of a frame taken in the browser (videos): the thumbnail, no server request needed */
  poster: string | null;
  state: LocalState;
  /** 0..1 while uploading */
  progress: number;
  error: string | null;
  size: number;
};

type Entry = LocalItem & { file: Blob; type: string; posterBlob: Blob | null; addedAt: number; persisted: boolean };

const items = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Changes (for useSyncExternalStore). */
export function subscribeLocal(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const localVersion = () => version;

export const localItem = (id: string): LocalItem | undefined => items.get(id);
/** The file itself, to play (null: not imported in this tab, use the server's copy). */
export const localSrc = (id: string): string | null => items.get(id)?.url ?? null;
const posters = new Map<string, string>();
const posterLoading = new Set<string>();

/**
 * A thumbnail from this computer (null: use /api/videos/<id>/thumb). A video's frame taken in the browser
 * stays the thumbnail after the upload (no need to download the server's); a picture is its own thumbnail
 * only until the server's smaller one exists. After a reload/second login, falls back to the saved poster in OPFS.
 */
export function localThumb(id: string): string | null {
  const it = items.get(id);
  if (it) {
    if (it.kind === "image") return it.state === "uploaded" ? null : it.url;
    return it.poster;
  }
  const cached = posters.get(id);
  if (cached) return cached;
  const acct = account;
  if (acct && !posterLoading.has(id)) {
    const idx = readIndex(acct);
    if (idx[id]) {
      posterLoading.add(id);
      const isImg = idx[id].kind === "image";
      void (async () => {
        try {
          const blob =
            (await opfsReadBlob(acct, isImg ? pathOf(id) : posterPathOf(id)).catch(() => null)) ??
            (await opfsReadBlob(acct, `thumbnails/${id}.jpg`).catch(() => null));
          if (blob && account === acct) {
            posters.set(id, URL.createObjectURL(blob));
            emit();
          }
        } finally {
          posterLoading.delete(id);
        }
      })();
    }
  }
  return null;
}
/** The file itself (this tab, else the copy kept in the browser), e.g. for a portable .vdo. null: not here. */
export async function localFileOf(id: string): Promise<Blob | null> {
  const it = items.get(id);
  if (it) return it.file;
  const acct = account;
  if (!acct || !readIndex(acct)[id]) return null;
  return opfsReadBlob(acct, pathOf(id)).catch(() => null);
}
/** What is known here about a file from this computer (this tab, else its copy's index entry). null: not here. */
export function localInfo(id: string): { name: string; kind: MediaKind; type: string; size: number; width: number; height: number; duration: number } | null {
  const it = items.get(id);
  const e = account ? readIndex(account)[id] : undefined;
  if (e) return { name: e.name, kind: e.kind, type: e.type, size: e.size, width: e.width, height: e.height, duration: e.duration };
  if (it) return { name: it.name, kind: it.kind, type: it.type, size: it.size, width: 0, height: 0, duration: 0 };
  return null;
}
/** The frame taken in the browser (a video's cover), if there is one. */
export const localPosterOf = (id: string): Blob | null => items.get(id)?.posterBlob ?? null;
/** Media the server doesn't have: kept here only, on its way, or failed to get there. */
export const notOnServer = (id: string): boolean => {
  const s = items.get(id)?.state;
  return s === "local" || s === "uploading" || s === "failed";
};
/** The not-yet-uploaded files among `ids`, for "Export waits for…" */
export function pendingAmong(ids: Iterable<string>): LocalItem[] {
  const out: LocalItem[] = [];
  for (const id of ids) {
    const it = items.get(id);
    if (it && it.state !== "uploaded") out.push(it);
  }
  return out;
}

function update(id: string, patch: Partial<Entry>) {
  const it = items.get(id);
  if (!it) return;
  items.set(id, { ...it, ...patch });
  emit();
}

/**
 * Stop keeping a file in this tab (its object URLs are revoked). Not while it's uploading, and never a
 * file kept only here whose copy couldn't be saved in the browser (it would be gone).
 */
export function releaseLocal(id: string, force = false) {
  const it = items.get(id);
  if (!it || (!force && (it.state === "uploading" || (it.state === "local" && !it.persisted)))) return;
  URL.revokeObjectURL(it.url);
  if (it.poster) URL.revokeObjectURL(it.poster);
  for (const [k, film] of films.entries()) {
    if (k === id || k.startsWith(`${id}:ops:`)) {
      if (film.url) URL.revokeObjectURL(film.url);
      films.delete(k);
    }
  }
  waves.delete(id);
  items.delete(id);
  emit();
}
/** Release every file except these (another project opened, New project). Uploads keep going. */
export function releaseLocalExcept(keep: Set<string>) {
  for (const id of [...items.keys()]) if (!keep.has(id)) releaseLocal(id);
}

// ---------------------------------------------------------------------------------------------------------
// What the browser can play

const VIDEO_EXT = ["mp4", "mov", "webm", "m4v", "mkv", "avi"];
const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "ogg", "opus"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp"];

export function kindOfFile(file: { name: string; type: string }): MediaKind | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.type.startsWith("video/") || VIDEO_EXT.includes(ext)) return "video";
  if (file.type.startsWith("audio/") || AUDIO_EXT.includes(ext)) return "audio";
  if (file.type.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  return null;
}

export type LocalProbe = { kind: MediaKind; width: number; height: number; duration: number; poster: Blob | null };

/** The server's limits (lib/ffmpeg/probe), checked before the file goes on the timeline. */
export function overLimit(p: LocalProbe): string | null {
  if (p.kind === "video") {
    if (p.duration > LIMITS.maxDurationSec) return `This video is ${Math.round(p.duration / 60)} minutes long. The limit is ${LIMITS.maxDurationSec / 60} minutes.`;
    const long = Math.max(p.width, p.height);
    const short = Math.min(p.width, p.height);
    if (long > LIMITS.maxLongSide || short > LIMITS.maxShortSide) return `This video is ${p.width} × ${p.height}. The limit is ${LIMITS.maxLongSide} × ${LIMITS.maxShortSide}.`;
  }
  if (p.kind === "audio" && p.duration > LIMITS.maxAudioSec) return `This sound is ${Math.round(p.duration / 60)} minutes long. The limit is ${LIMITS.maxAudioSec / 60} minutes.`;
  return null;
}

const once = <K extends keyof HTMLMediaElementEventMap>(el: HTMLMediaElement, ok: K, ms: number) =>
  new Promise<boolean>((resolve) => {
    const t = setTimeout(() => done(false), ms);
    const yes = () => done(true);
    const no = () => done(false);
    function done(v: boolean) {
      clearTimeout(t);
      el.removeEventListener(ok, yes);
      el.removeEventListener("error", no);
      resolve(v);
    }
    el.addEventListener(ok, yes, { once: true });
    el.addEventListener("error", no, { once: true });
  });

/** A small JPEG of what a video element shows now (null when the browser won't draw it). */
async function frameOf(v: HTMLVideoElement): Promise<Blob | null> {
  try {
    const w = Math.min(320, v.videoWidth);
    const h = Math.max(2, Math.round((v.videoHeight * w) / v.videoWidth));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(v, 0, 0, w, h);
    return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.75));
  } catch {
    return null;
  }
}

/**
 * Can this browser play the file, and what is it? Decodes the first frame (a video) or the start (a sound):
 * a container the browser opens but can't decode (HEVC on some systems) counts as not playable.
 * null: not playable here.
 */
export async function probeLocal(file: File, url: string, timeoutMs = 10_000): Promise<LocalProbe | null> {
  const kind = kindOfFile(file);
  if (!kind) return null;
  if (kind === "image") {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      return null;
    }
    return img.naturalWidth ? { kind, width: img.naturalWidth, height: img.naturalHeight, duration: 0, poster: null } : null;
  }
  const el = document.createElement(kind === "video" ? "video" : "audio");
  el.muted = true;
  el.preload = "auto";
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  el.src = url;
  try {
    // a picture to show: the first frame decoded (a sound: enough to start playing)
    const ok = await once(el, kind === "video" ? "loadeddata" : "canplay", timeoutMs);
    const duration = el.duration;
    if (!ok || !Number.isFinite(duration) || duration <= 0) return null;
    if (el instanceof HTMLVideoElement) {
      if (!el.videoWidth || !el.videoHeight) return null;
      return { kind, width: el.videoWidth, height: el.videoHeight, duration, poster: await frameOf(el) };
    }
    return { kind, width: 0, height: 0, duration, poster: null };
  } finally {
    el.removeAttribute("src");
    el.load();
  }
}

/** What the timeline needs to place the file before the server has seen it (the server's details replace it). */
export function provisionalMeta(id: string, file: File, p: LocalProbe, size = file.size, createdAt = Date.now()): VideoMeta {
  return {
    id,
    kind: p.kind,
    fileName: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "video",
    createdAt,
    info: {
      container: file.name.toLowerCase().split(".").pop() ?? "",
      videoCodec: "",
      width: p.width,
      height: p.height,
      // (a browser doesn't tell the frame rate: 30 until the server's probe arrives)
      fps: p.kind === "video" ? 30 : 0,
      duration: p.duration,
      // (sound is assumed until the server knows: a silent video just plays silence)
      hasAudio: p.kind !== "image",
      audioCodec: null,
      soundDetected: p.kind !== "image",
      colorTransfer: null,
      size,
    },
    suggestedKey: null,
    keyKind: null,
  };
}

/** Keep the file in this tab, playing from an object URL; its upload is started separately (uploadLocal). */
export function addLocal(id: string, file: File, kind: MediaKind, poster: Blob | null, state: LocalState = "uploading"): LocalItem {
  const prev = items.get(id);
  if (prev) releaseLocal(id, true);
  const entry: Entry = {
    id,
    name: file.name,
    kind,
    url: URL.createObjectURL(file),
    poster: poster ? URL.createObjectURL(poster) : null,
    posterBlob: poster,
    state,
    progress: 0,
    error: null,
    size: file.size,
    file,
    type: file.type,
    addedAt: Date.now(),
    persisted: false,
  };
  items.set(id, entry);
  emit();
  return entry;
}

// ---------------------------------------------------------------------------------------------------------
// The timeline film, made in the browser (no waiting for the upload and the server's FFmpeg)

type Film = { key: string; url: string | null };
const films = new Map<string, Film>();
const filmJobs: (() => Promise<void>)[] = [];
let filmBusy = false;
/** A new file's film starts after this long: its first frames (preview, dragging it on) come first. */
export const FILM_DELAY_MS = 600;
let filmPaused = false;
let filmResume: (() => void) | null = null;
/**
 * While the preview plays, the film waits (ProgramPlayer): decoding the same file twice at once makes
 * playback stutter on slower computers. It goes on where it stopped.
 */
export function setFilmPaused(paused: boolean) {
  if (filmPaused === paused) return;
  filmPaused = paused;
  if (!paused) {
    filmResume?.();
    filmResume = null;
  }
}
const filmGo = (): Promise<void> => (filmPaused ? new Promise((r) => (filmResume = r)) : Promise.resolve());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The timeline film of a local video, made in the browser with the server's layout (lib/editor/film), so
 * the timeline shows frames at once. null until its first frames are drawn (it fills in from the left).
 * When opsParam is given (background removal on), it generates a keyed transparent PNG filmstrip.
 * While the keyed film is being generated, it returns the plain film if available so tiles don't disappear.
 */
export function localFilm(
  id: string,
  m: { duration: number; fps: number; width: number; height: number },
  opsParam?: string,
): string | null {
  const it = items.get(id);
  if (!it || it.kind !== "video" || !(m.duration > 0) || !m.width || !m.height || typeof document === "undefined") return null;
  const slots = filmSlots(m.duration, m.fps || 30, m.width, m.height);
  const layoutKey = `${slots.n}:${slots.fw}`;
  const filmKey = opsParam ? `${id}:ops:${opsParam}` : id;
  const had = films.get(filmKey);
  if (had?.key === layoutKey && had.url) return had.url;
  if (had && had.key !== layoutKey && had.url) {
    URL.revokeObjectURL(had.url);
  }
  if (!had || had.key !== layoutKey) {
    films.set(filmKey, { key: layoutKey, url: null });
    filmJobs.push(() => makeFilm(id, filmKey, layoutKey, slots, opsParam));
    if (!filmBusy) void runFilms();
  }
  // While keyed film is generating, fall back to plain film if available so tiles don't disappear
  if (opsParam) {
    const plain = films.get(id);
    if (plain?.url) return plain.url;
  }
  return had?.url ?? null;
}

async function runFilms() {
  filmBusy = true;
  while (filmJobs.length) await filmJobs.shift()!().catch(() => undefined);
  filmBusy = false;
}

async function makeFilm(
  id: string,
  filmKey: string,
  layoutKey: string,
  s: ReturnType<typeof filmSlots>,
  opsParam?: string,
) {
  const fresh = items.get(id);
  if (!fresh || films.get(filmKey)?.key !== layoutKey) return;
  const wait = fresh.addedAt + FILM_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  await filmGo();
  const it = items.get(id);
  if (!it || films.get(filmKey)?.key !== layoutKey) return;

  let keyParams: LiveKeyParams | null = null;
  if (opsParam) {
    try {
      const ops = parseFilmOps(opsParam);
      const chroma = ops.find((o) => o.type === "chromaKey" && o.enabled);
      if (chroma && chroma.type === "chromaKey") {
        keyParams = {
          keyColor: chroma.params.keyColor,
          similarity: chroma.params.similarity,
          blend: chroma.params.blend,
          despill: chroma.params.despill,
          despillStrength: chroma.params.despillStrength,
          method: "chroma",
        };
      } else {
        const black = ops.find((o) => o.type === "blackKey" && o.enabled);
        if (black && black.type === "blackKey") {
          keyParams = {
            keyColor: "#000000",
            similarity: 0.1,
            blend: 0.1,
            despill: false,
            despillStrength: 0,
            threshold: black.params.threshold,
            restoreColor: black.params.restoreColor,
            method: "black",
          };
        }
      }
    } catch {
      // bad param, fallback to unkeyed
    }
  }

  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.src = it.url;
  try {
    if (!(await once(v, "loadeddata", 10_000))) return;
    const c = document.createElement("canvas");
    c.width = s.canvasW;
    c.height = s.canvasH;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let renderer: LiveKeyRenderer | null = null;
    let keyCanvas: HTMLCanvasElement | null = null;
    if (keyParams && typeof document !== "undefined") {
      try {
        keyCanvas = document.createElement("canvas");
        keyCanvas.width = s.fw;
        keyCanvas.height = FILM_H;
        renderer = LiveKeyRenderer.create(keyCanvas);
      } catch {
        renderer = null;
      }
    }

    let shown = 0;
    const publish = async () => {
      const format = keyParams ? "image/png" : "image/jpeg";
      const quality = keyParams ? undefined : 0.72;
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, format, quality));
      const now = films.get(filmKey);
      if (!blob || now?.key !== layoutKey) return;
      if (now.url) URL.revokeObjectURL(now.url);
      films.set(filmKey, { key: layoutKey, url: URL.createObjectURL(blob) });
      emit();
    };
    for (let i = 0; i < s.n; i++) {
      if (filmPaused) await filmGo();
      if (films.get(filmKey)?.key !== layoutKey) return; // released, or a new layout
      const slot = s.at(i);
      v.currentTime = Math.min(slot.t, Math.max(0, v.duration - 0.05));
      if (!(await once(v, "seeked", 5_000))) continue;
      if (renderer && keyCanvas && keyParams && renderer.render(v, keyParams, "result")) {
        ctx.clearRect(slot.x, slot.y, s.fw, FILM_H);
        ctx.drawImage(keyCanvas, slot.x, slot.y, s.fw, FILM_H);
      } else {
        ctx.drawImage(v, slot.x, slot.y, s.fw, FILM_H);
      }
      // (shown while it fills: the first frames at once, then about twice a second)
      if (i === 0 || i === s.n - 1 || performance.now() - shown > 500) {
        shown = performance.now();
        await publish();
      }
    }
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

// ---------------------------------------------------------------------------------------------------------
// The timeline waveform of a sound file, made in the browser (one look for every sound: a file from
// this computer, or one on the server: a voice, a recording, a sound effect, library music)

/**
 * How loud a sound is over time, per 1/PEAKS_PER_SEC s: its average loudness (rms) and its loudest moment
 * (peak), each 0–1 of the file's loudest; Timeline WaveBars combines them for each bar at any zoom.
 */
export type SoundPeaks = { rms: Float32Array; peak: Float32Array; perSec: number };
const PEAKS_PER_SEC = 100;
const waves = new Map<string, SoundPeaks | null>();
const waveJobs: { id: string; src: string | null }[] = [];
let waveBusy = false;
/** Bigger files aren't decoded here (the whole sound is held in memory): the server's picture stands in. */
const WAVE_MAX_BYTES = 80 * 1024 * 1024;
/** Sounds whose waveform couldn't be made, and from where ("server": a file that may still come back here, after a reload). */
const waveFailed = new Map<string, "here" | "server">();

/**
 * The loudness of a sound over time, read from the file itself (this computer's copy, else the server's at
 * `serverSrc`), so the waveform follows the sound exactly. null until it's read.
 */
export function soundPeaks(id: string, serverSrc?: string | null): SoundPeaks | null {
  if (typeof document === "undefined") return null;
  const it = items.get(id);
  // (tried from the server before this computer's copy was read back: try again from here)
  if (it && waveFailed.get(id) === "server") {
    waveFailed.delete(id);
    waves.delete(id);
  }
  if (waves.has(id) || waveFailed.has(id)) return waves.get(id) ?? null;
  const src = it ? null : (serverSrc ?? null);
  if (it ? it.size > WAVE_MAX_BYTES : !src) return null;
  waves.set(id, null);
  waveJobs.push({ id, src });
  if (!waveBusy) void runWaves();
  return null;
}
/** The waveform couldn't be made here (a file the browser can't read, too big): the server's picture is used. */
export const waveUnavailable = (id: string) => waveFailed.has(id) && !items.has(id);

async function runWaves() {
  waveBusy = true;
  while (waveJobs.length) {
    const job = waveJobs.shift()!;
    await makePeaks(job.id, job.src).catch(() => {
      waves.delete(job.id);
      waveFailed.set(job.id, job.src ? "server" : "here");
      emit();
    });
  }
  waveBusy = false;
}

async function soundBytes(id: string, src: string | null): Promise<ArrayBuffer | null> {
  const it = items.get(id);
  if (it) return it.file.arrayBuffer();
  if (!src) return null;
  const r = await fetch(src);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (Number(r.headers.get("content-length") ?? 0) > WAVE_MAX_BYTES) throw new Error("too big");
  return r.arrayBuffer();
}

async function makePeaks(id: string, src: string | null) {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const bytes = Ctx ? await soundBytes(id, src) : null;
  if (!Ctx || !bytes) throw new Error("no sound to read");
  const audio = await new Ctx(1, 1, 44100).decodeAudioData(bytes);
  // each step: its loudest moment and its average loudness (speech then shows its rhythm, not a block)
  const win = audio.sampleRate / PEAKS_PER_SEC;
  const n = Math.max(1, Math.ceil(audio.length / win));
  const peak = new Float32Array(n);
  const rms = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let b = 0; b < n; b++) {
      const from = Math.floor(b * win);
      const to = Math.min(data.length, Math.floor((b + 1) * win));
      let max = 0;
      let sum = 0;
      for (let i = from; i < to; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
        sum += v * v;
      }
      peak[b] = Math.max(peak[b], max);
      rms[b] = Math.max(rms[b], to > from ? Math.sqrt(sum / (to - from)) : 0);
    }
  }
  const topPeak = peak.reduce((a, v) => Math.max(a, v), 0) || 1;
  const topRms = rms.reduce((a, v) => Math.max(a, v), 0) || 1;
  for (let b = 0; b < n; b++) {
    peak[b] /= topPeak;
    rms[b] /= topRms;
  }
  waves.set(id, { rms, peak, perSec: PEAKS_PER_SEC });
  emit();
}

// ---------------------------------------------------------------------------------------------------------
// The upload, in the background

type UploadedListener = (meta: VideoMeta) => void;
type FailedListener = (f: { id: string; message: string; permanent: boolean }) => void;
const uploadedListeners = new Set<UploadedListener>();
const failedListeners = new Set<FailedListener>();
/** An upload finished: the server's details of the file (fps, sound, detected green screen…). */
export function onLocalUploaded(l: UploadedListener): () => void {
  uploadedListeners.add(l);
  return () => uploadedListeners.delete(l);
}
/** An upload failed: `permanent` (the server refused the file: too long, unreadable…) or not (the network). */
export function onLocalUploadFailed(l: FailedListener): () => void {
  failedListeners.add(l);
  return () => failedListeners.delete(l);
}

export type Transport = (id: string, file: Blob, name: string, onProgress: (sent: number, total: number) => void) => Promise<VideoMeta>;

/**
 * Send a file under its id, with progress: a big one in chunks (lib/api/chunkedUpload: hosting proxies stall
 * long single requests), a small one as PUT /api/videos/<id> (XHR: fetch can't report upload progress).
 */
export const xhrTransport: Transport = (id, file, name, onProgress) =>
  file.size > CHUNKED_ABOVE_BYTES
    ? uploadInChunks(file, { name, id }, onProgress)
    : new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/videos/${id}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.setRequestHeader("X-File-Name", encodeURIComponent(name));
        xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
        xhr.onload = () => {
          let body: unknown = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            /* not JSON */
          }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(body as VideoMeta);
          const err = (body as { error?: { code: string; message: string } })?.error;
          reject(new ApiError(xhr.status, err?.code ?? "http_" + xhr.status, err?.message ?? "The upload stopped."));
        };
        xhr.onerror = () => reject(new ApiError(0, "network", "The upload stopped: no connection to the server."));
        xhr.send(file);
      });

let transport: Transport = xhrTransport;
/** (tests) */
export function setTransport(t: Transport | null) {
  transport = t ?? xhrTransport;
}

const isLocalHost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
const MAX_UPLOADS = isLocalHost ? 6 : 2;
const RETRY_MS = [2_000, 8_000, 30_000];
const queue: string[] = [];
let active = 0;
const whenDone = new Map<string, { promise: Promise<boolean>; resolve: (ok: boolean) => void }>();

function doneSignal(id: string) {
  let s = whenDone.get(id);
  if (!s) {
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((r) => (resolve = r));
    s = { promise, resolve };
    whenDone.set(id, s);
  }
  return s;
}

/** Resolves when the file is on the server (true) or its upload failed / never started (false). Not here: true. */
export function whenOnServer(id: string): Promise<boolean> {
  const it = items.get(id);
  if (!it || it.state === "uploaded") return Promise.resolve(true);
  if (it.state === "failed" || it.state === "local") return Promise.resolve(false);
  return doneSignal(id).promise;
}

/**
 * A server feature needs these files (the export, an AI tool…): those kept only here (or whose upload
 * failed) are sent now, and this resolves once every one is on the server. Files that aren't local count
 * as there. `failed`: the ones that couldn't be sent.
 */
export async function ensureOnServer(ids: Iterable<string>): Promise<{ ok: boolean; failed: string[] }> {
  const want = [...new Set(ids)].filter((id) => notOnServer(id));
  for (const id of want) {
    const s = items.get(id)?.state;
    if (s === "local" || s === "failed") uploadLocal(id);
  }
  const done = await Promise.all(want.map((id) => whenOnServer(id)));
  const failed = want.filter((_, k) => !done[k]);
  return { ok: !failed.length, failed };
}

/** Send a local file to the server in the background (once; a failed one can be sent again). */
export function uploadLocal(id: string) {
  const it = items.get(id);
  if (!it || it.state === "uploaded" || queue.includes(id)) return;
  update(id, { state: "uploading", error: null });
  queue.push(id);
  pump();
}

function pump() {
  while (active < MAX_UPLOADS && queue.length) {
    const id = queue.shift()!;
    active++;
    void send(id, 0).finally(() => {
      active--;
      pump();
    });
  }
}

/** Progress redraws the editor: at most every 5 percent, or a whole percent after a quarter second. */
export function progressWorthShowing(prev: number, next: number, sinceMs: number): boolean {
  const a = Math.floor(prev * 100);
  const b = Math.floor(next * 100);
  return b !== a && (Math.abs(b - a) >= 5 || sinceMs >= 250);
}

async function send(id: string, attempt: number): Promise<void> {
  const it = items.get(id);
  if (!it) return;
  try {
    let shownAt = 0;
    const meta = await transport(id, it.file, it.name, (sent, total) => {
      const p = total ? sent / total : 0;
      const now = Date.now();
      if (progressWorthShowing(items.get(id)?.progress ?? 0, p, now - shownAt)) {
        shownAt = now;
        update(id, { progress: p });
      }
    });
    update(id, { state: "uploaded", progress: 1, error: null });
    void markUploaded(id);
    uploadedListeners.forEach((l) => l(meta));
    doneSignal(id).resolve(true);
    whenDone.delete(id);
  } catch (err) {
    const e = err as ApiError;
    // the server refused the file (too long, unreadable, not signed in…): sending it again won't help
    const permanent = e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
    if (!permanent && attempt < RETRY_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
      if (!items.has(id)) return;
      return send(id, attempt + 1);
    }
    update(id, { state: "failed", error: e.message || "The upload failed." });
    failedListeners.forEach((l) => l({ id, message: e.message || "The upload failed.", permanent }));
    doneSignal(id).resolve(false);
    whenDone.delete(id);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Server requests for a file still uploading wait for it

const VIDEO_PATH = /^\/api\/videos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([^/]*))?/;
/** Paths that only show what the server already has (pictures, the file itself): they never send a local file. */
const DISPLAY_ONLY = new Set(["thumb", "thumbnail", "film", "strip", "wave", "source", "play", "proxy", "pick"]);

/**
 * While the editor is open: a request for server work on a file the server doesn't have yet (a frame, a
 * stabilized copy, a mask…) sends it first if it's kept only here, and waits until it's there, instead of
 * failing with "no longer here". Asking for its details, pictures, deleting it and the upload itself go
 * straight through. Returns the uninstall function.
 */
export function installUploadGate(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const g = window as unknown as { __viplayFetch?: typeof fetch };
  if (g.__viplayFetch) return () => undefined;
  const original = window.fetch.bind(window);
  g.__viplayFetch = original;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      const m = url.origin === window.location.origin ? VIDEO_PATH.exec(url.pathname) : null;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const id = m?.[1];
      const sub = m?.[2] ?? "";
      const state = id ? items.get(id)?.state : undefined;
      // (the upload itself and deleting a file go straight through; so do its details and pictures while
      // it's only here: they don't need it on the server)
      const passes = !sub ? method === "PUT" || method === "DELETE" || (method === "GET" && state === "local") : DISPLAY_ONLY.has(sub) && state === "local";
      if (id && notOnServer(id) && !passes) {
        const ok = (await ensureOnServer([id])).ok;
        if (!ok)
          return Response.json(
            { error: { code: "not_uploaded", message: "This file didn't reach the server, so this can't be done yet. Try the upload again." } },
            { status: 409 },
          );
      }
    } catch {
      /* not a URL we know: send as it is */
    }
    return original(input, init);
  };
  return () => {
    if (g.__viplayFetch) window.fetch = g.__viplayFetch;
    delete g.__viplayFetch;
  };
}

// ---------------------------------------------------------------------------------------------------------
// A copy in the browser's private storage (survives reloads)

type IndexEntry = { name: string; kind: MediaKind; type: string; size: number; width: number; height: number; duration: number; uploaded: boolean; savedAt: number };
type Index = Record<string, IndexEntry>;
const indexKey = (acct: string) => `viplay:local-media:${acct}`;
const pathOf = (id: string) => `media/${id}`;
const posterPathOf = (id: string) => `media/${id}.poster`;
/** At most this much is kept for files already on the server (oldest go first); never-uploaded ones stay. */
export const LOCAL_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

function readIndex(acct: string): Index {
  try {
    return JSON.parse(localStorage.getItem(indexKey(acct)) ?? "{}") as Index;
  } catch {
    return {};
  }
}
function writeIndex(acct: string, idx: Index) {
  try {
    localStorage.setItem(indexKey(acct), JSON.stringify(idx));
  } catch {
    /* full or blocked: the copies just aren't found after a reload */
  }
}

let account: string | null = null;
/** The signed-in account whose storage the copies go to (lib/storage/workspace). null: no copies. */
export function setLocalAccount(acct: string | null) {
  if (account !== acct) {
    for (const url of posters.values()) URL.revokeObjectURL(url);
    posters.clear();
    posterLoading.clear();
  }
  account = acct;
  if (acct) {
    void preloadLocalPosters(acct);
  }
}

async function preloadLocalPosters(acct: string) {
  const idx = readIndex(acct);
  const ids = Object.keys(idx);
  if (!ids.length) return;
  let loadedAny = false;
  await Promise.all(
    ids.map(async (id) => {
      if (posters.has(id)) return;
      const isImg = idx[id]?.kind === "image";
      const blob =
        (await opfsReadBlob(acct, isImg ? pathOf(id) : posterPathOf(id)).catch(() => null)) ??
        (await opfsReadBlob(acct, `thumbnails/${id}.jpg`).catch(() => null));
      if (blob && account === acct) {
        posters.set(id, URL.createObjectURL(blob));
        loadedAny = true;
      }
    }),
  );
  if (loadedAny) emit();
}

/** Keep a copy of the file (in the background). false when it can't be kept (no space, no storage). */
export async function persistLocal(id: string, file: Blob, p: LocalProbe & { name: string }): Promise<boolean> {
  const acct = account;
  if (!acct) return false;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage !== undefined && est.usage + file.size > est.quota * 0.8) return false;
    // (ask the browser not to clear it under storage pressure; it may say no)
    void navigator.storage?.persist?.().catch(() => false);
    await opfsWriteBlob(acct, pathOf(id), file);
    // the frame taken in the browser: after a reload the thumbnails still need no server request
    const poster = items.get(id)?.posterBlob ?? p.poster;
    if (poster) {
      await opfsWriteBlob(acct, posterPathOf(id), poster).catch(() => undefined);
      if (!posters.has(id)) posters.set(id, URL.createObjectURL(poster));
    }
    const idx = readIndex(acct);
    idx[id] = { name: p.name, kind: p.kind, type: file.type, size: file.size, width: p.width, height: p.height, duration: p.duration, uploaded: items.get(id)?.state === "uploaded", savedAt: Date.now() };
    writeIndex(acct, idx);
    if (items.has(id)) items.set(id, { ...items.get(id)!, persisted: true });
    await enforceBudget(acct);
    return true;
  } catch {
    return false;
  }
}

async function markUploaded(id: string) {
  const acct = account;
  if (!acct) return;
  const idx = readIndex(acct);
  if (idx[id]) {
    idx[id] = { ...idx[id]!, uploaded: true };
    writeIndex(acct, idx);
  }
}

/** Remove the copy (the file was deleted from My Assets). */
export async function forgetLocal(id: string) {
  releaseLocal(id, true);
  const acct = account;
  if (!acct) return;
  const idx = readIndex(acct);
  if (!idx[id]) return;
  delete idx[id];
  writeIndex(acct, idx);
  await opfsDelete(acct, pathOf(id)).catch(() => false);
  await opfsDelete(acct, posterPathOf(id)).catch(() => false);
}

/** Keep the copies of uploaded files under the budget (the oldest go first). */
export async function enforceBudget(acct: string, budget = LOCAL_BUDGET_BYTES) {
  const idx = readIndex(acct);
  let total = Object.values(idx).reduce((n, e) => n + e.size, 0);
  if (total <= budget) return;
  const old = Object.entries(idx)
    .filter(([id, e]) => e.uploaded && !items.has(id))
    .sort((a, b) => a[1].savedAt - b[1].savedAt);
  for (const [id, e] of old) {
    if (total <= budget) break;
    await opfsDelete(acct, pathOf(id)).catch(() => false);
    await opfsDelete(acct, posterPathOf(id)).catch(() => false);
    delete idx[id];
    total -= e.size;
  }
  writeIndex(acct, idx);
}

/** Files whose copy is being read back (id → since when): the player waits for it a moment. */
const restoring = new Map<string, number>();
/** After this long the player stops waiting for a copy and plays the server's. */
export const RESTORE_WAIT_MS = 2_500;
/** Is this file's copy in this browser about to play (so the server's copy shouldn't be fetched meanwhile)? */
export function restorePending(id: string): boolean {
  const since = restoring.get(id);
  return since !== undefined && Date.now() - since < RESTORE_WAIT_MS;
}

/**
 * After a reload or when a project opens: files of `ids` that have a copy here play from it again; one
 * whose upload didn't finish (or that the server lost) is sent again. Returns what the timeline needs
 * for files the server doesn't know (never uploaded): the editor adds those to its media list.
 *
 * The copies are read all at once and play as soon as they are read: asking the server whether it still
 * has each file comes after (it only decides whether to send the file again).
 */
export async function restoreLocal(ids: string[], serverHas: (id: string) => Promise<boolean>): Promise<MediaLite[]> {
  const acct = account;
  if (!acct) return [];
  const idx = readIndex(acct);
  // (one read per file: one already being read back is left to that)
  const todo = [...new Set(ids)].filter((id) => idx[id] && !items.has(id) && !restoring.has(id));
  const since = Date.now();
  for (const id of todo) restoring.set(id, since);
  let read: { id: string; blob: Blob | null; poster: Blob | null }[];
  try {
    read = await Promise.all(
      todo.map(async (id) => {
        const [blob, poster] = await Promise.all([opfsReadBlob(acct, pathOf(id)).catch(() => null), idx[id]!.kind === "video" ? opfsReadBlob(acct, posterPathOf(id)).catch(() => null) : null]);
        return { id, blob, poster };
      }),
    );
  } finally {
    for (const id of todo) restoring.delete(id);
  }
  let forgot = false;
  const added: string[] = [];
  for (const { id, blob, poster } of read) {
    const e = idx[id]!;
    if (!blob) {
      // the copy is gone (cleared by the browser): forget it
      delete idx[id];
      forgot = true;
      continue;
    }
    if (items.has(id)) continue; // (imported again meanwhile)
    const file = blob instanceof File ? blob : new File([blob], e.name, { type: e.type });
    // (never sent: it stays here until a server feature needs it)
    addLocal(id, file, e.kind, poster, e.uploaded ? "uploaded" : "local");
    items.set(id, { ...items.get(id)!, persisted: true });
    added.push(id);
  }
  if (forgot) writeIndex(acct, idx);
  if (!added.length) {
    emit(); // (restorePending changed)
    return [];
  }
  const onServer = await Promise.all(added.map((id) => (idx[id]!.uploaded ? serverHas(id).catch(() => true) : Promise.resolve(false))));
  const unknown: MediaLite[] = [];
  added.forEach((id, k) => {
    if (onServer[k] || !items.has(id)) return;
    const e = idx[id]!;
    // (it says "uploaded", but the server lost it: kept here again, sent when needed)
    if (items.get(id)!.state === "uploaded") update(id, { state: "local" });
    unknown.push({ id, kind: e.kind, fileName: e.name, width: e.width, height: e.height, fps: e.kind === "video" ? 30 : 0, duration: e.duration, hasAudio: e.kind !== "image", suggestedKey: null, keyKind: null });
  });
  return unknown;
}

/**
 * A file kept in the account's storage another way (an imported .vdo package, lib/storage/workspace) plays
 * from it too. It isn't uploaded from here: the package import already sent it to the server.
 */
export function adoptLocal(id: string, blob: Blob, name: string, kind: MediaKind) {
  if (items.has(id)) return;
  addLocal(id, blob instanceof File ? blob : new File([blob], name, { type: blob.type }), kind, null, "uploaded");
}

/** (tests) forget everything */
export function resetLocalMedia() {
  for (const id of [...items.keys()]) releaseLocal(id, true);
  films.clear();
  posters.clear();
  posterLoading.clear();
  filmJobs.length = 0;
  filmPaused = false;
  filmResume = null;
  restoring.clear();
  queue.length = 0;
  active = 0;
  whenDone.clear();
  uploadedListeners.clear();
  failedListeners.clear();
  transport = xhrTransport;
  account = null;
}

/** Files of this tab still going to the server, or stopped on the way (for the progress task). */
export const uploadingItems = (): LocalItem[] => [...items.values()].filter((it) => it.state === "uploading" || it.state === "failed");

/** Kept only on this computer (in this tab, or its copy in the browser), never sent to the server. */
export function keptHereOnly(id: string): boolean {
  const it = items.get(id);
  if (it) return it.state === "local";
  const acct = account;
  const e = acct ? readIndex(acct)[id] : undefined;
  return !!e && !e.uploaded;
}

/**
 * Every file kept only on this computer (its copy in the browser), in this tab or not: My Assets lists them
 * next to the server's. The details are the browser's (the server's arrive if it's ever sent).
 */
export function listLocalFiles(): VideoMeta[] {
  const acct = account;
  if (!acct) return [];
  const idx = readIndex(acct);
  const out: VideoMeta[] = [];
  for (const [id, e] of Object.entries(idx)) {
    const it = items.get(id);
    if ((it && it.state === "uploaded") || (!it && e.uploaded)) continue;
    out.push(provisionalMeta(id, new File([], e.name, { type: e.type }), { kind: e.kind, width: e.width, height: e.height, duration: e.duration, poster: null }, e.size, e.savedAt));
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Every file of this tab (Media › Assets lists the ones the server's list doesn't have yet). */
export const localItems = (): LocalItem[] => [...items.values()];
