"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { docDuration, layersAt, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import type { Range } from "@/lib/edit/timeline";
import type { LiveKeyParams } from "@/lib/editor/liveKey";
import { exportDocOf } from "@/lib/export/exportDoc";
import { audioPlan, partLevel, pictureIds } from "@/lib/export/localExport";
import { needsAlpha, type ExportFormat } from "@/lib/export/presets";
import { formatTime } from "@/lib/format";
import { localSrc } from "@/lib/media/localMedia";
import { setLevel, silence } from "@/lib/player/sound";
import { createFrameCache, drawFrame, pruneFrameCache, type FrameSources } from "@/lib/render/frame";
import { ensureDocFonts } from "@/lib/text/fonts";

/**
 * The Export dialog's preview: the file the export makes, played. It draws the timeline as the export will
 * have it (the same drawing as the editor's preview and the browser export, lib/render/frame) at the export's
 * size and background: every clip, text, element, animation, transition, look and effect, with the sound
 * mixed by the export's rules. (It used to play only the first video's raw file.)
 */

/** Where the editor's preview gets each video clip's picture and key (the same choices here). */
export type PreviewSources = {
  liveOf: (c: VideoClip) => LiveKeyParams | null;
  packedOf?: (c: VideoClip) => string | null;
  blurOf?: (c: VideoClip) => number | null;
  /** a stabilized copy or this computer's file; "" while this computer's copy is being read back */
  sourceOf?: (c: VideoClip) => string | null;
  reversedOf?: (c: VideoClip) => string | null;
  proxyMode?: boolean;
  /** where someone speaks (ducked music is quieter there) */
  speech?: Range[];
};

/**
 * Pictures of the frame the preview stands on, as exports of other sizes would have it (the Export dialog's
 * quick presets): each drawn the same way, at a thumbnail's size. `onPictures` gets them by `${width}x${height}`.
 */
export type PreviewThumbs = {
  sizes: { width: number; height: number }[];
  format: ExportFormat;
  onPictures: (pictures: Record<string, string>) => void;
};

const PLAY = (id: string) => `/api/videos/${id}/play`;
const PROXY = (id: string) => `/api/videos/${id}/proxy`;
const CLEAN = (id: string, level: string) => `/api/videos/${id}/clean-audio?level=${level}`;
/** The preview canvas: at most this many pixels on its long side (it shows small). */
const MAX_SIDE = 640;
/** The quick presets' pictures: this many pixels on their long side. */
const THUMB_SIDE = 192;
/** …made once the frame has stood still this long (not while the slider is dragged). */
const THUMB_WAIT_MS = 150;

/** A number for each timeline (to tell a changed one in a string key). */
const docIds = new WeakMap<object, number>();
let lastDocId = 0;
const idOf = (o: object) => {
  let n = docIds.get(o);
  if (n === undefined) docIds.set(o, (n = ++lastDocId));
  return n;
};

export function ExportPreview({
  doc: project,
  format,
  width,
  height,
  paused = false,
  startAt = 0,
  onTime,
  media,
  sources,
  thumbs,
}: {
  doc: TimelineDoc;
  format: ExportFormat;
  /** the export's size */
  width: number;
  height: number;
  /** while the export runs: stopped (the export needs the computer) */
  paused?: boolean;
  /** where the preview starts (the playhead) */
  startAt?: number;
  /** the time shown, when it stops or is moved (pictures are made of that frame) */
  onTime?: (t: number) => void;
  media: Record<string, MediaLite>;
  sources: PreviewSources;
  thumbs?: PreviewThumbs;
}) {
  // the timeline the export makes: its size, its background (lib/export/exportDoc)
  const doc = useMemo(() => exportDocOf(project, format, { size: { width, height } }), [project, format, width, height]);
  // …and the ones the quick presets make
  const thumbKeys = [...new Set(thumbs?.sizes.map((s) => `${s.width}x${s.height}`))].join(",");
  const thumbFormat = thumbs?.format ?? format;
  const thumbDocs = useMemo(
    () =>
      thumbKeys
        ? thumbKeys.split(",").map((key) => {
            const [w, h] = key.split("x").map(Number);
            return { key, doc: exportDocOf(project, thumbFormat, { size: { width: w, height: h } }) };
          })
        : [],
    [project, thumbFormat, thumbKeys],
  );
  const fps = doc.canvas.fps || 30;
  const D = Math.max(1 / fps, docDuration(doc));
  const k = Math.min(1, MAX_SIDE / Math.max(doc.canvas.width, doc.canvas.height));
  const cw = Math.max(2, Math.round(doc.canvas.width * k));
  const ch = Math.max(2, Math.round(doc.canvas.height * k));
  const parts = useMemo(() => audioPlan(doc, (id) => media[id]?.hasAudio !== false), [doc, media]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cache = useRef(createFrameCache());
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const pics = useRef(new Map<string, HTMLImageElement>());
  const bdVideo = useRef<HTMLVideoElement | null>(null);
  const start = Math.min(Math.max(0, startAt), Math.max(0, D - 1 / fps));
  const tRef = useRef(start);
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const dirty = useRef(true);
  // the quick presets' pictures: what the frame is now (and since when), and what they show
  const thumbRun = useRef({ sig: "", since: 0, done: "" });
  const onPictures = thumbs?.onPictures;
  // the latest values for the drawing loop
  const live = useRef({ doc, D, parts, media, sources, playing, muted, fps, thumbDocs, onPictures });
  useEffect(() => {
    live.current = { doc, D, parts, media, sources, playing: playing && !paused, muted, fps, thumbDocs, onPictures };
    dirty.current = true;
  });
  // the export starting: stop (and say where it stopped)
  useEffect(() => {
    if (!paused) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(false);
  }, [paused]);
  useEffect(() => {
    if (tRef.current > D) tRef.current = 0;
    pruneFrameCache(cache.current, doc);
  }, [doc, D]);
  // the pictures it shows, and the fonts its texts use
  useEffect(() => {
    for (const id of pictureIds(doc, media)) {
      if (pics.current.has(id)) continue;
      const img = new Image();
      img.onload = () => {
        dirty.current = true;
      };
      img.src = localSrc(id) ?? `/api/videos/${id}/source`;
      pics.current.set(id, img);
    }
    void ensureDocFonts(doc).then(() => {
      dirty.current = true;
    });
  }, [doc, media]);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    const onLoaded = () => {
      cache.current.fontGen++;
      dirty.current = true;
    };
    fonts.addEventListener("loadingdone", onLoaded);
    return () => fonts.removeEventListener("loadingdone", onLoaded);
  }, []);

  // the drawing loop: moves the time while playing, keeps every video and sound where the time is, draws
  useEffect(() => {
    const box = boxRef.current;
    const els = videos.current;
    const snds = audios.current;
    const mark = () => {
      dirty.current = true;
    };
    const videoFor = (id: string, src: string) => {
      let el = els.get(id);
      if (!el) {
        el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        el.preload = "auto";
        el.addEventListener("seeked", mark);
        el.addEventListener("loadeddata", mark);
        box?.appendChild(el);
        els.set(id, el);
        silence(el);
      }
      if (el.dataset.src !== src) {
        el.dataset.src = src;
        el.src = src;
      }
      return el;
    };
    const audioFor = (id: string, src: string) => {
      let el = snds.get(id);
      if (!el) {
        el = document.createElement("audio");
        el.preload = "auto";
        box?.appendChild(el);
        snds.set(id, el);
        silence(el);
      }
      if (el.dataset.src !== src) {
        el.dataset.src = src;
        el.src = src;
      }
      return el;
    };
    /** Keep a media element at `want` seconds: playing (steered when it drifts) or still (seeked exactly). */
    const keep = (el: HTMLMediaElement, want: number, rate: number, play: boolean, f: number) => {
      if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
      if (play) {
        if (el.paused) {
          if (Math.abs(el.currentTime - want) > 0.25 * rate) el.currentTime = want;
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - want) > 0.4 * rate) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 0.5 / f && !el.seeking) el.currentTime = want;
      }
    };

    const thumbCanvas = document.createElement("canvas");
    /** The frame as each quick preset's export would have it, small (null: this browser won't give the pictures). */
    const drawThumbs = (tds: { key: string; doc: TimelineDoc }[], time: number, frame: FrameSources) => {
      const tx = thumbCanvas.getContext("2d");
      if (!tx) return null;
      const out: Record<string, string> = {};
      try {
        for (const { key, doc: td } of tds) {
          const k = Math.min(1, THUMB_SIDE / Math.max(td.canvas.width, td.canvas.height));
          thumbCanvas.width = Math.max(2, Math.round(td.canvas.width * k));
          thumbCanvas.height = Math.max(2, Math.round(td.canvas.height * k));
          drawFrame(tx, td, time, frame, cache.current);
          out[key] = thumbCanvas.toDataURL(td.canvas.background === "transparent" ? "image/png" : "image/jpeg", 0.85);
        }
      } catch {
        return null;
      }
      return out;
    };

    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      const { doc: d, D: len, parts: snd, media: m, sources: s, playing: on, muted: mute, fps: f, thumbDocs: tds, onPictures: pictures } = live.current;
      if (on) {
        let nt = tRef.current + Math.min(0.25, (now - last) / 1000);
        // (it plays round and round)
        if (nt >= len) nt = 0;
        tRef.current = nt;
        if (now - lastUi > 100) {
          lastUi = now;
          setT(nt);
        }
      }
      last = now;
      const time = tRef.current;

      // the videos on screen now: each at its own time
      const shown = new Set<string>();
      const visible = layersAt(d, time).filter((l) => l.clip.type === "video");
      for (const l of visible) {
        const c = l.clip as VideoClip;
        const packed = s.packedOf?.(c) ?? null;
        const rev = c.reversed && !packed ? (s.reversedOf?.(c) ?? null) : null;
        const own = s.sourceOf?.(c);
        // ("": this computer's copy is still being read back)
        if (own === "" && !packed && !rev) continue;
        const src = packed ?? rev ?? own ?? (s.proxyMode ? PROXY(c.mediaId) : (localSrc(c.mediaId) ?? PLAY(c.mediaId)));
        const el = videoFor(c.id, src);
        shown.add(c.id);
        const want = (rev ? 0 : c.in) + Math.max(0, time - l.start) * (c.speed ?? 1);
        keep(el, want, c.speed ?? 1, on, f);
      }
      for (const [id, el] of els) {
        if (shown.has(id)) continue;
        if (!el.paused) el.pause();
        silence(el);
      }

      // the sound, by the export's rules (volume, fades, transitions, ducking; a cleaned sound plays on its own)
      const heard = new Set<string>();
      for (const p of snd) {
        const c = p.clip;
        const off = time - p.start;
        const inside = off >= 0 && off < p.len;
        const level = on && !mute && inside ? partLevel(p, off, s.speech) : 0;
        if (c.type === "video" && !c.denoise) {
          const el = els.get(c.id);
          if (el && shown.has(c.id)) setLevel(el, level);
          continue;
        }
        const key = c.type === "video" ? `clean:${c.id}` : c.id;
        const src = c.denoise ? CLEAN(c.mediaId, c.denoise) : (localSrc(c.mediaId) ?? PLAY(c.mediaId));
        const el = audioFor(key, src);
        heard.add(key);
        if (c.type === "video") {
          const v = els.get(c.id);
          if (v) silence(v);
        }
        const rate = c.type === "video" ? (c.speed ?? 1) : 1;
        if (inside && on) {
          keep(el, c.in + Math.max(0, off) * rate, rate, true, f);
          setLevel(el, level);
        } else {
          if (!el.paused) el.pause();
          silence(el);
        }
      }
      for (const [id, el] of snds) if (!heard.has(id) && !el.paused) el.pause();

      // a picture / video backdrop (Replace Background with a video plays round and round)
      const bd = d.canvas.backdrop;
      if (bd?.kind === "media" && m[bd.mediaId]?.kind === "video") {
        const src = localSrc(bd.mediaId) ?? PLAY(bd.mediaId);
        let v = bdVideo.current;
        if (!v || v.dataset.src !== src) {
          v?.remove();
          v = document.createElement("video");
          v.muted = true;
          v.playsInline = true;
          v.loop = true;
          v.dataset.src = src;
          v.src = src;
          v.addEventListener("seeked", mark);
          box?.appendChild(v);
          bdVideo.current = v;
        }
        const dur = m[bd.mediaId]?.duration || 0;
        keep(v, dur ? time % dur : 0, 1, on, f);
      }

      // draw (still: once every video shows its frame for this time)
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      const ready = on || visible.every((l) => {
        const el = els.get(l.clip.id);
        return !el || (!el.seeking && el.readyState >= 2);
      });
      const frame: FrameSources = {
        media: m,
        video: (c) => {
          const el = els.get(c.id);
          if (!el || el.readyState < 2) return null;
          const pk = s.packedOf?.(c) ?? null;
          return { el, packed: !!pk && el.dataset.src === pk };
        },
        image: (id) => {
          const img = pics.current.get(id);
          return img?.complete && img.naturalWidth ? img : null;
        },
        backdropVideo: () => (bdVideo.current && bdVideo.current.readyState >= 2 ? bdVideo.current : null),
        live: s.liveOf,
        blur: s.blurOf,
      };
      if (cv && ctx && (on || dirty.current) && ready) {
        drawFrame(ctx, d, time, frame, cache.current);
        dirty.current = false;
      }

      // the quick presets' pictures, of the frame it stands on (again when a picture, a font or a video's frame
      // arrives): made from these same videos, so nothing is fetched or asked of the server
      if (tds.length && pictures && !on && ready) {
        const shownPics = [...pics.current.values()].filter((img) => img.complete && img.naturalWidth).length;
        const shownVideos = visible.filter((l) => (els.get(l.clip.id)?.readyState ?? 0) >= 2).map((l) => l.clip.id);
        const sig = `${idOf(tds)}|${time.toFixed(3)}|${cache.current.fontGen}|${shownPics}|${shownVideos.join()}`;
        const run = thumbRun.current;
        if (sig !== run.sig) {
          run.sig = sig;
          run.since = now;
        } else if (sig !== run.done && now - run.since >= THUMB_WAIT_MS) {
          run.done = sig;
          const out = drawThumbs(tds, time, frame);
          if (out) pictures(out);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // let go of every file when the preview closes
      for (const el of [...els.values(), ...snds.values(), ...(bdVideo.current ? [bdVideo.current] : [])]) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        el.remove();
      }
      els.clear();
      snds.clear();
      bdVideo.current = null;
    };
  }, []);

  const toggle = () => {
    if (paused) return;
    if (playing) onTime?.(tRef.current);
    // (from the start again when it's at the end)
    else if (tRef.current >= D - 1.5 / fps) tRef.current = 0;
    setPlaying((v) => !v);
  };
  const seek = (v: number) => {
    tRef.current = Math.min(Math.max(0, v), Math.max(0, D - 1 / fps));
    setT(tRef.current);
    dirty.current = true;
    onTime?.(tRef.current);
  };
  const see = needsAlpha(format) || (format === "png" && doc.canvas.background === "transparent");

  return (
    <div className="flex w-full flex-col gap-1.5" data-testid="export-preview">
      <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg sm:h-44">
        <div style={{ aspectRatio: `${doc.canvas.width} / ${doc.canvas.height}` }} className={`relative h-full max-h-full max-w-full overflow-hidden rounded-lg border border-dialog-border shadow-md ${see ? "bg-checker" : "bg-black"}`}>
          <canvas ref={canvasRef} width={cw} height={ch} className="block size-full" aria-label={`Preview of the export, ${formatTime(t)} of ${formatTime(D)}`} role="img" onClick={toggle} />
          <button
            type="button"
            onClick={toggle}
            disabled={paused}
            aria-label={playing ? "Pause the preview" : "Play the preview"}
            className={`absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/20 transition-opacity ${playing ? "opacity-0 hover:opacity-100 focus-visible:opacity-100" : "opacity-90 hover:opacity-100"}`}
          >
            <Icon name={playing ? "pause" : "play"} className="size-4" />
          </button>
          <span className="pointer-events-none absolute left-1.5 top-1.5 whitespace-nowrap rounded-md border border-white/10 bg-black/80 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white/90">{playing ? "● Playing" : "Export preview"}</span>
          <span className="pointer-events-none absolute bottom-1 left-1 rounded border border-white/10 bg-black/80 px-1 text-[0.5rem] font-bold uppercase tracking-wider text-white/90">
            {doc.canvas.width}×{doc.canvas.height}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={Math.max(0, D - 1 / fps)}
          step={1 / fps}
          value={Math.min(t, Math.max(0, D - 1 / fps))}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Time in the preview"
          className="min-w-0 flex-1 accent-[var(--color-primary)]"
        />
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted">
          {formatTime(t)} / {formatTime(D)}
        </span>
        <button type="button" onClick={() => setMuted((v) => !v)} aria-pressed={muted} aria-label={muted ? "Turn the preview's sound on" : "Turn the preview's sound off"} className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink">
          <Icon name={muted ? "mute" : "volume"} className="size-3.5" />
        </button>
      </div>
      {/* the preview's video and sound elements (out of sight) */}
      <div ref={boxRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0" />
    </div>
  );
}
