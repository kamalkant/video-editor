import {
  Muxer as Mp4Muxer,
  ArrayBufferTarget as Mp4ArrayBufferTarget,
  FileSystemWritableFileStreamTarget as Mp4FileSystemWritableFileStreamTarget,
} from "mp4-muxer";
import {
  Muxer as WebmMuxer,
  ArrayBufferTarget as WebmArrayBufferTarget,
  FileSystemWritableFileStreamTarget as WebmFileSystemWritableFileStreamTarget,
} from "webm-muxer";
import { clipLength, docDuration, layersAt, mainStarts, mainTrack, type AudioPlaced, type MediaLite, type TimelineDoc, type VideoClip } from "../edit/doc";
import type { Range } from "../edit/timeline";
import type { LiveKeyParams } from "../editor/liveKey";
import { DUCK_LEVEL, inSpeech } from "../audio/ducking";
import type { ExportFormat } from "./presets";
import { videoBitrate } from "./rates";
import { audioKbpsOf, bitrateCodecOf, contentCapBpp } from "./size";
import type { FileKind, Job, JobFile, JobStep } from "../jobs/queue";
import { localFileOf, localInfo, localSrc } from "../media/localMedia";
import { soundLevel } from "../player/sound";
import { docTransitions, type TransitionType } from "../player/transitions";
import { createFrameCache, drawFrame, type FrameSources } from "../render/frame";
import { ensureDocFonts } from "../text/fonts";

/**
 * The export made in this browser (WebCodecs): every frame is drawn by the
 * same code as the program preview (lib/render/frame), so the file has the
 * preview's animations, transitions, keyframes, looks, keys, text effects and
 * elements. The sound is mixed by the preview's rules too (lib/player/sound).
 * What only the server can make (AI Removal masks, stabilized copies, cleaned
 * or levelled sound, a new speed that keeps the pitch) goes to the server
 * export instead: localExportBlockers says why.
 */

export interface LocalExportOptions {
  doc: TimelineDoc;
  format: ExportFormat;
  size?: { width: number; height: number };
  quality?: "small" | "balanced" | "best";
  onProgress?: (job: Job) => void;
  signal?: AbortSignal;
  fileHandle?: FileSystemFileHandle | null;
  /** What the timeline knows about each upload (sound, size), by id. */
  media?: Record<string, MediaLite>;
  /** Live key settings of a video clip (background removal), as in the preview. */
  liveOf?: (c: VideoClip) => LiveKeyParams | null;
  /** Where someone speaks on Video 1 (timeline seconds): ducked sound goes quieter there. */
  speech?: Range[];
  /** Pictures (PNG / JPG): the timeline time of the frame (the playhead). */
  at?: number;
}

export interface LocalExportResult {
  ok: boolean;
  job: Job;
  blob?: Blob;
  blobUrl?: string;
}

/** The browser couldn't read a file or a frame: the server export makes it instead. */
export class LocalExportUnavailable extends Error {}

/** Check if WebCodecs and OfflineAudioContext are supported in the current browser */
export function isWebCodecsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof OfflineAudioContext !== "undefined"
  );
}

/** Check if a given export format can be encoded natively on the device using WebCodecs */
export async function canExportLocally(
  format: ExportFormat,
  width: number,
  height: number,
): Promise<boolean> {
  if (format === "png" || format === "jpg") return true;
  if (!isWebCodecsSupported()) return false;

  if (format === "mp4") {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: "avc1.4d002a", // H.264 Main Profile Level 4.2
        width: Math.min(width, 3840),
        height: Math.min(height, 2160),
        bitrate: 8_000_000,
        framerate: 30,
      });
      return !!res.supported;
    } catch {
      return false;
    }
  }

  if (format === "webm" || format === "webm-alpha") {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: "vp09.00.10.08", // VP9
        width: Math.min(width, 3840),
        height: Math.min(height, 2160),
        bitrate: 8_000_000,
        framerate: 30,
        // the see-through one keeps its alpha (software VP9 only); else the server makes it
        ...(format === "webm-alpha" ? { alpha: "keep", hardwareAcceleration: "prefer-software" } : {}),
      } as VideoEncoderConfig);
      return !!res.supported;
    } catch {
      return false;
    }
  }

  // MOV + alpha: the MP4 muxer can't write HEVC's alpha layer, so the server makes it (Apple's encoder)
  if (format === "hevc") {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: "hvc1.1.6.L120.90", // HEVC Main Profile
        width: Math.min(width, 3840),
        height: Math.min(height, 2160),
        bitrate: 8_000_000,
        framerate: 30,
      });
      return !!res.supported;
    } catch {
      return false;
    }
  }

  return false;
}

// ---------- what the browser export can't make ----------

/** The sound of a timeline longer than this (all its files together) is mixed on the server (it is decoded whole here). */
export const MAX_LOCAL_AUDIO_SECONDS = 20 * 60;

/**
 * Why this timeline needs the server export (empty: the browser makes it exactly like the preview).
 * `media`: what's known about each upload (whether it has sound).
 */
export function localExportBlockers(doc: TimelineDoc, media: Record<string, MediaLite> = {}): string[] {
  const out = new Set<string>();
  const audible = new Set(audioPlan(doc, (id) => media[id]?.hasAudio !== false).map((p) => p.clip.id));
  for (const t of doc.tracks) {
    if (t.kind === "overlay" && t.hidden) continue;
    for (const c of t.clips) {
      if (c.type === "video") {
        if (c.ops.some((o) => o.enabled && o.type === "aiMatte")) out.add("AI background removal");
        if (c.stabilize) out.add("Stabilize");
        if (c.denoise && audible.has(c.id)) out.add("Remove background noise");
        if (c.loudness && audible.has(c.id)) out.add("Even loudness");
        // (a new speed keeps the sound's pitch on the server: the browser's would change it)
        if ((c.speed ?? 1) !== 1 && audible.has(c.id)) out.add("A sped-up or slowed-down clip with sound");
      }
      if (c.type === "audio" && audible.has(c.id)) {
        if (c.denoise) out.add("Remove background noise");
        if (c.loudness) out.add("Even loudness");
      }
    }
  }
  if (doc.output.loudness) out.add("Even loudness");
  // the files' sound is decoded whole in the browser: a long one is mixed on the server
  const sources = new Set([...audible].map((id) => findMediaOf(doc, id)).filter((x): x is string => !!x));
  const total = [...sources].reduce((n, id) => n + (media[id]?.duration ?? localInfo(id)?.duration ?? 0), 0);
  if (total > MAX_LOCAL_AUDIO_SECONDS) out.add("Very long sound");
  return [...out];
}

function findMediaOf(doc: TimelineDoc, clipId: string): string | null {
  for (const t of doc.tracks) for (const c of t.clips) if (c.id === clipId && "mediaId" in c) return c.mediaId;
  return null;
}

// ---------- the sound ----------

type Tr = { type: TransitionType; s: number; d: number };
/** One sound in the mix: a video clip's sound or a sound clip, at its timeline place, with its Video 1 transitions. */
export type AudioPart = { clip: VideoClip | AudioPlaced; start: number; len: number; duck: boolean; trIn?: Tr; trOut?: Tr };

/**
 * The sounds the export mixes, by the server's rules (lib/render/compose audioLayers): video clips with sound
 * on Video 1 and on visible, unmuted overlay tracks, and sound clips on unmuted audio tracks. `hasAudio`:
 * whether an upload has sound. (output.audio is the single-video setting, not used for a timeline: a silent
 * first video sets it to "remove", and music added later must still be heard.)
 */
export function audioPlan(doc: TimelineDoc, hasAudio: (mediaId: string) => boolean): AudioPart[] {
  const out: AudioPart[] = [];
  const trans = docTransitions(doc);
  const add = (clip: VideoClip | AudioPlaced, start: number, duck: boolean) => {
    if (clip.volume <= 0 || !hasAudio(clip.mediaId) || clip.generation) return;
    const t = trans.get(clip.id);
    out.push({ clip, start, len: clipLength(clip), duck, ...(t?.in ? { trIn: t.in } : {}), ...(t?.out ? { trOut: t.out } : {}) });
  };
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  if (!main.muted) main.clips.forEach((c, i) => c.type === "video" && !c.muted && add(c, starts[i], false));
  for (const t of doc.tracks) {
    if (t.kind === "overlay" && !t.hidden && !t.muted) for (const c of t.clips) if (c.type === "video" && !c.muted) add(c, c.start, false);
    if (t.kind === "audio" && !t.muted) for (const c of t.clips) add(c, c.start, c.duck);
  }
  return out;
}

/** How loud a part plays `off` seconds into it: the preview's level (volume, its automation, fades, transitions) and ducking. */
export function partLevel(p: AudioPart, off: number, speech: Range[] = []): number {
  const t = p.start + off;
  const duck = p.duck && inSpeech(speech, t) ? DUCK_LEVEL : 1;
  return soundLevel(p.clip, off, p.len, { t, trIn: p.trIn, trOut: p.trOut, duck });
}

const SAMPLE_RATE = 48000;
/** The mix is made this many seconds at a time (a long video doesn't need one huge buffer). */
const MIX_CHUNK = 30;
/** Gain steps per second (the level curve follows fades, transitions and ducking this closely). */
const GAIN_RATE = 100;

// ---------- the pictures ----------

/** Where a file can be read: this computer's copy, else the server's original (never a light preview copy). */
const fileUrl = (mediaId: string) => localSrc(mediaId) ?? `/api/videos/${mediaId}/source`;

function waitFor(el: HTMLMediaElement, events: string[], ms: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok: boolean, err?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const e of events) el.removeEventListener(e, onOk);
      el.removeEventListener("error", onErr);
      if (ok) resolve();
      else reject(new LocalExportUnavailable(err ?? `Couldn't read ${what}.`));
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(false, `Reading ${what} took too long.`), ms);
    for (const e of events) el.addEventListener(e, onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
  });
}

/** How long a seeked frame may take to be presented before it's drawn anyway: one frame, at most 20 ms. */
export const frameWaitMs = (fps: number) => Math.min(20, Math.ceil(1000 / Math.max(1, fps)));

/** One <video> per video clip on screen (a cut of the same file reuses one), seeked to the exact frame. */
class FrameVideos {
  private byClip = new Map<string, HTMLVideoElement>();
  private idle: HTMLVideoElement[] = [];
  private box: HTMLDivElement;
  /** `fps`: the export's frame rate (how long a seeked frame may take to be presented, see frame()). */
  constructor(private fps: number) {
    // (in the page, out of sight: some browsers only decode videos that are in a document)
    this.box = document.createElement("div");
    this.box.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;";
    document.body.appendChild(this.box);
  }

  private async element(clipId: string, src: string): Promise<HTMLVideoElement> {
    let el = this.byClip.get(clipId);
    if (!el) {
      const i = this.idle.findIndex((x) => x.dataset.src === src);
      el = i >= 0 ? this.idle.splice(i, 1)[0] : (this.idle.pop() ?? this.make());
      this.byClip.set(clipId, el);
    }
    if (el.dataset.src !== src) {
      el.dataset.src = src;
      el.src = src;
      el.load();
      await waitFor(el, ["loadeddata"], 30_000, "a video");
    }
    return el;
  }

  private make() {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    this.box.appendChild(el);
    return el;
  }

  /** The clip's element showing source time `time` (waits until that frame is ready to draw). */
  async frame(clipId: string, src: string, time: number): Promise<HTMLVideoElement> {
    const el = await this.element(clipId, src);
    const want = Math.max(0, Math.min(time, (el.duration || time) - 1e-3));
    if (Math.abs(el.currentTime - want) > 1e-4 || el.readyState < 2) {
      const seeked = waitFor(el, ["seeked"], 15_000, "a video frame");
      el.currentTime = want;
      await seeked;
    }
    // (the new frame is ready for drawing once the browser has presented it; after a seek on a paused video
    // Chromium mostly never calls back, and `seeked` already means the frame is decoded, so this waits at most
    // a frame: the 120 ms it used to wait was paid on nearly every frame and doubled a 10-minute export)
    const rvfc = (el as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rvfc) await Promise.race([new Promise<void>((r) => rvfc.call(el, () => r())), new Promise<void>((r) => setTimeout(r, frameWaitMs(this.fps)))]);
    return el;
  }

  /** Clips no longer on screen give their element back (kept for the next cut of the same file). */
  keepOnly(ids: Set<string>) {
    for (const [id, el] of this.byClip) {
      if (ids.has(id)) continue;
      this.byClip.delete(id);
      this.idle.push(el);
    }
    while (this.idle.length > 3) {
      const el = this.idle.shift()!;
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
  }

  destroy() {
    for (const el of [...this.byClip.values(), ...this.idle]) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.byClip.clear();
    this.idle = [];
    this.box.remove();
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(img.complete && img.naturalWidth ? img : null), 20_000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** Every picture the timeline draws: picture clips, pictures covering a watermark, a picture backdrop, the logo. */
export function pictureIds(doc: TimelineDoc, media: Record<string, MediaLite>): string[] {
  const ids = new Set<string>();
  for (const t of doc.tracks)
    for (const c of t.clips) {
      if (c.type === "image") ids.add(c.mediaId);
      if ("patches" in c) for (const p of c.patches ?? []) if (p.mediaId) ids.add(p.mediaId);
    }
  const bd = doc.canvas.backdrop;
  if (bd?.kind === "media" && media[bd.mediaId]?.kind !== "video") ids.add(bd.mediaId);
  if (doc.watermark) ids.add(doc.watermark.mediaId);
  return [...ids];
}

/** The file names and kinds the server export uses for the same format (lib/jobs/queue DOC_FILES). */
function outputOf(format: ExportFormat): { kind: FileKind; name: string; mime: string } {
  switch (format) {
    case "hevc":
      return { kind: "hevc", name: "video-hevc.mp4", mime: "video/mp4" };
    case "webm":
      return { kind: "vp9", name: "video.webm", mime: "video/webm" };
    case "webm-alpha":
      return { kind: "webm", name: "video.webm", mime: "video/webm" };
    case "png":
      return { kind: "png", name: "frame.png", mime: "image/png" };
    case "jpg":
      return { kind: "jpg", name: "frame.jpg", mime: "image/jpeg" };
    default:
      return { kind: "mp4", name: "video.mp4", mime: "video/mp4" };
  }
}

const aborted = () => new Error("Export canceled.");

/**
 * Make the export in this browser: each frame drawn like the preview (lib/render/frame) and encoded with
 * WebCodecs; pictures (PNG / JPG) are the frame at the playhead. Nothing is uploaded.
 */
export async function exportLocally(opts: LocalExportOptions): Promise<LocalExportResult> {
  const { doc, format, signal } = opts;
  const media = opts.media ?? {};
  const W = opts.size?.width ?? doc.canvas.width;
  const H = opts.size?.height ?? doc.canvas.height;
  const F = doc.canvas.fps || 30;
  const D = Math.max(0.1, docDuration(doc));
  const still = format === "png" || format === "jpg";
  const totalFrames = still ? 1 : Math.max(1, Math.ceil(D * F));
  const quality = opts.quality ?? doc.output?.quality ?? "balanced";
  const out = outputOf(format);

  const steps: JobStep[] = [
    { kind: "derive", label: "Getting the files and fonts ready", state: "running", percent: 0 },
    { kind: out.kind, label: still ? `Drawing the picture (${format.toUpperCase()})` : format === "webm" || format === "webm-alpha" ? "Making the video (WebM)" : format === "hevc" ? "Making the video (MP4, HEVC)" : "Making the video (MP4)", state: "pending", percent: 0 },
    ...(still ? [] : [{ kind: "poster" as const, label: "Poster image", state: "pending" as const, percent: 0 }]),
  ];
  const job: Job = {
    id: `local-${Date.now()}`,
    videoId: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "running",
    spec: { version: 1, ops: [], output: doc.output },
    doc,
    steps,
    files: [],
    output: { width: W, height: H, fps: F, hasAudio: false },
    error: null,
    errorDetail: null,
  };
  const report = (i: number, pct: number, state?: JobStep["state"]) => {
    steps[i].percent = Math.min(100, Math.max(0, Math.round(pct)));
    if (state) steps[i].state = state;
    job.updatedAt = Date.now();
    opts.onProgress?.({ ...job, steps: [...steps] });
  };
  opts.onProgress?.(job);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("This browser can't draw the video.");
  const cache = createFrameCache();
  const videos = new FrameVideos(F);
  const urls: string[] = [];

  try {
    // 1. fonts, pictures, the backdrop video
    await ensureDocFonts(doc);
    if (signal?.aborted) throw aborted();
    report(0, 20);
    const pics = new Map<string, HTMLImageElement>();
    const ids = pictureIds(doc, media);
    await Promise.all(
      ids.map(async (id) => {
        const img = await loadImage(fileUrl(id));
        if (img) pics.set(id, img);
      }),
    );
    if (signal?.aborted) throw aborted();
    report(0, 60);
    const bd = doc.canvas.backdrop;
    const bdVideoId = bd?.kind === "media" && media[bd.mediaId]?.kind === "video" ? bd.mediaId : null;
    const bdDuration = bdVideoId ? media[bdVideoId]?.duration || 0 : 0;

    /** Seek every video on screen at time t to its frame, then draw the frame. */
    const drawAt = async (t: number) => {
      const shown = new Map<string, HTMLVideoElement>();
      const visible = layersAt(doc, t).filter((l) => l.clip.type === "video");
      await Promise.all(
        visible.map(async (l) => {
          const c = l.clip as VideoClip;
          const off = Math.max(0, t - l.start) + 0.5 / F;
          const sp = c.speed ?? 1;
          // (the middle of the frame, so a seek never lands on the frame before)
          const srcT = c.reversed ? Math.max(c.in, c.out - off * sp) : Math.min(c.out - 1e-3, c.in + off * sp);
          shown.set(c.id, await videos.frame(c.id, fileUrl(c.mediaId), srcT));
        }),
      );
      let backdrop: HTMLVideoElement | null = null;
      if (bdVideoId) backdrop = await videos.frame("backdrop", fileUrl(bdVideoId), bdDuration > 0 ? (t + 0.5 / F) % bdDuration : 0);
      videos.keepOnly(new Set([...shown.keys(), "backdrop"]));
      const src: FrameSources = {
        media,
        video: (c) => {
          const el = shown.get(c.id);
          return el ? { el, packed: false } : null;
        },
        image: (id) => pics.get(id) ?? null,
        backdropVideo: () => backdrop,
        live: (c) => opts.liveOf?.(c) ?? null,
      };
      drawFrame(ctx, doc, t, src, cache);
    };

    report(0, 100, "done");
    steps[1].state = "running";

    // 2. a picture: the frame at the playhead
    if (still) {
      const at = Math.min(Math.max(0, opts.at ?? 0), Math.max(0, D - 1 / F));
      await drawAt(at);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, out.mime, 0.92));
      if (!blob) throw new Error("Couldn't make the picture.");
      const url = URL.createObjectURL(blob);
      job.files = [{ kind: out.kind, name: out.name, size: blob.size, mime: out.mime, blobUrl: url } as JobFile];
      report(1, 100, "done");
      job.state = "done";
      opts.onProgress?.({ ...job, steps: [...steps] });
      return { ok: true, job, blob, blobUrl: url };
    }

    // 3. the sound: mixed a part at a time by the preview's rules
    const isWebm = format === "webm" || format === "webm-alpha";
    const isWebmAlpha = format === "webm-alpha";
    const isHevc = format === "hevc";
    const parts = audioPlan(doc, (id) => media[id]?.hasAudio !== false);
    // an MP4's sound is AAC, which some browsers can't encode (Chromium on Linux): the server makes it instead
    if (parts.length && !isWebm && !(await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: audioKbpsOf(format) * 1000 }).then((r) => !!r.supported, () => false)))
      throw new LocalExportUnavailable("This browser can't encode AAC sound.");
    const decoded = new Map<string, AudioBuffer | null>();
    const decoder = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
    for (const p of parts) {
      const id = p.clip.mediaId;
      if (decoded.has(id)) continue;
      if (signal?.aborted) throw aborted();
      let buf: AudioBuffer | null = null;
      try {
        const blob = (await localFileOf(id)) ?? (await fetch(`/api/videos/${id}/source`).then((r) => (r.ok ? r.blob() : null)));
        if (blob) buf = await decoder.decodeAudioData(await blob.arrayBuffer());
      } catch {
        buf = null; // (no sound track, or one this browser can't read: silent)
      }
      decoded.set(id, buf);
    }
    const audible = parts.filter((p) => decoded.get(p.clip.mediaId));
    job.output.hasAudio = audible.length > 0;

    // 4. the file
    const fileHandle = opts.fileHandle;
    // (straight into a file the user picked, when there is one; else in memory)
    const writable = fileHandle ? await fileHandle.createWritable() : null;
    const target = isWebm
      ? writable
        ? new WebmFileSystemWritableFileStreamTarget(writable)
        : new WebmArrayBufferTarget()
      : writable
        ? new Mp4FileSystemWritableFileStreamTarget(writable)
        : new Mp4ArrayBufferTarget();
    const audioTrack = audible.length ? { numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined;
    const muxer = isWebm
      ? new WebmMuxer({ target: target as WebmArrayBufferTarget, video: { codec: "V_VP9", width: W, height: H, alpha: isWebmAlpha }, audio: audioTrack ? { codec: "A_OPUS", ...audioTrack } : undefined })
      : new Mp4Muxer({ target: target as Mp4ArrayBufferTarget, video: { codec: isHevc ? "hevc" : "avc", width: W, height: H }, audio: audioTrack ? { codec: "aac", ...audioTrack } : undefined, fastStart: fileHandle ? false : "in-memory", firstTimestampBehavior: "offset" });

    // the first encoder error stops the export (never a broken file that looks finished)
    let failure: Error | null = null;
    const fail = (e: unknown) => {
      failure ??= e instanceof Error ? e : new Error(String(e));
    };

    if (audible.length) {
      const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: fail });
      audioEncoder.configure({ codec: isWebm ? "opus" : "mp4a.40.2", numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: audioKbpsOf(format) * 1000 });
      // a reversed clip plays its part of the file backwards
      const reversedOf = new Map<string, AudioBuffer>();
      const sourceOf = (p: AudioPart): AudioBuffer => {
        const buf = decoded.get(p.clip.mediaId)!;
        if (!(p.clip.type === "video" && p.clip.reversed)) return buf;
        let r = reversedOf.get(p.clip.id);
        if (!r) {
          const a = Math.max(0, Math.floor(p.clip.in * buf.sampleRate));
          const b = Math.min(buf.length, Math.ceil(p.clip.out * buf.sampleRate));
          r = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
          for (let ch = 0; ch < buf.numberOfChannels; ch++) r.getChannelData(ch).set(buf.getChannelData(ch).subarray(a, b).reverse());
          reversedOf.set(p.clip.id, r);
        }
        return r;
      };
      for (let c0 = 0; c0 < D; c0 += MIX_CHUNK) {
        if (signal?.aborted) throw aborted();
        const cLen = Math.min(MIX_CHUNK, D - c0);
        const frames = Math.max(1, Math.round(cLen * SAMPLE_RATE));
        const mix = new OfflineAudioContext(2, frames, SAMPLE_RATE);
        for (const p of audible) {
          const from = Math.max(p.start, c0);
          const to = Math.min(p.start + p.len, c0 + cLen);
          if (to - from < 2 / SAMPLE_RATE) continue;
          const node = mix.createBufferSource();
          node.buffer = sourceOf(p);
          const gain = mix.createGain();
          const n = Math.max(2, Math.ceil((to - from) * GAIN_RATE) + 1);
          const curve = new Float32Array(n);
          for (let i = 0; i < n; i++) curve[i] = partLevel(p, from - p.start + ((to - from) * i) / (n - 1), opts.speech);
          gain.gain.setValueCurveAtTime(curve, from - c0, to - from);
          node.connect(gain);
          gain.connect(mix.destination);
          const reversed = p.clip.type === "video" && !!p.clip.reversed;
          node.start(from - c0, (reversed ? 0 : p.clip.in) + (from - p.start), to - from);
        }
        const rendered = await mix.startRendering();
        const left = rendered.getChannelData(0);
        const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
        const base = Math.round(c0 * SAMPLE_RATE);
        for (let off = 0; off < rendered.length; off += 1024) {
          const count = Math.min(1024, rendered.length - off);
          const data = new Float32Array(count * 2);
          data.set(left.subarray(off, off + count), 0);
          data.set(right.subarray(off, off + count), count);
          const ad = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: count, numberOfChannels: 2, timestamp: Math.round(((base + off) / SAMPLE_RATE) * 1_000_000), data });
          audioEncoder.encode(ad);
          ad.close();
        }
        if (failure) throw failure;
      }
      await audioEncoder.flush();
      audioEncoder.close();
      if (failure) throw failure;
    }
    decoded.clear();

    // the same bitrate the Export dialog's size shows (lib/export/rates, lib/export/size)
    const bitrate = videoBitrate(bitrateCodecOf(format) ?? "h264", quality, W, H, F, contentCapBpp(doc, localInfo, { width: W, height: H }));
    const videoConfig: VideoEncoderConfig = {
      codec: isWebm ? "vp09.00.10.08" : isHevc ? "hvc1.1.6.L120.90" : "avc1.4d002a",
      width: W,
      height: H,
      bitrate,
      bitrateMode: "variable",
      framerate: F,
      // alpha is only encoded in software (VP9)
      hardwareAcceleration: isWebmAlpha ? "prefer-software" : "prefer-hardware",
      ...(isWebmAlpha ? { alpha: "keep" as const } : {}),
    };
    // no hardware encoder for this codec here (VP9 on a Mac): whichever the browser has
    if (!isWebmAlpha && !(await VideoEncoder.isConfigSupported(videoConfig).then((r) => r.supported, () => false))) videoConfig.hardwareAcceleration = "no-preference";
    const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail });
    videoEncoder.configure(videoConfig);

    // 5. every frame, drawn like the preview
    const gop = Math.max(1, Math.round(F * 2));
    let poster: Blob | null = null;
    try {
      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) throw aborted();
        if (failure) throw failure;
        const t = i / F;
        await drawAt(t);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1_000_000), duration: Math.round(1_000_000 / F) });
        videoEncoder.encode(frame, { keyFrame: i % gop === 0 });
        frame.close();
        if (i === 0) poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        // keep the encoder's queue short (memory stays flat on long videos)
        while (videoEncoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4));
        if (i % 10 === 0 || i === totalFrames - 1) report(1, ((i + 1) / totalFrames) * 100);
      }
      await videoEncoder.flush();
      if (failure) throw failure;
    } finally {
      if (videoEncoder.state !== "closed") videoEncoder.close();
    }
    report(1, 100, "done");

    // 6. the file and its poster
    muxer.finalize();
    let blob: Blob | undefined;
    let url: string | undefined;
    if (fileHandle && writable) {
      await writable.close();
      const f = await fileHandle.getFile();
      blob = f;
      url = URL.createObjectURL(f);
    } else {
      blob = new Blob([(target as Mp4ArrayBufferTarget | WebmArrayBufferTarget).buffer], { type: out.mime });
      url = URL.createObjectURL(blob);
    }
    const files: JobFile[] = [{ kind: out.kind, name: out.name, size: blob.size, mime: out.mime, blobUrl: url } as JobFile];
    if (poster) {
      const pu = URL.createObjectURL(poster);
      urls.push(pu);
      files.push({ kind: "poster", name: "poster.png", size: poster.size, mime: "image/png", blobUrl: pu } as JobFile);
    }
    report(2, 100, "done");
    job.state = "done";
    job.files = files;
    job.updatedAt = Date.now();
    opts.onProgress?.({ ...job, steps: [...steps] });
    return { ok: true, job, blob, blobUrl: url };
  } catch (err) {
    for (const u of urls) URL.revokeObjectURL(u);
    job.state = "failed";
    job.error = err instanceof Error ? err.message : "Export failed";
    opts.onProgress?.({ ...job, steps: [...steps] });
    throw err;
  } finally {
    videos.destroy();
  }
}
