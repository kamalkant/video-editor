import { clipLength, DEFAULT_TRANSFORM, docDuration, isReversed, mainStarts, mainTrack, speedOf, type AnyClip, type AudioPlaced, type ElementClip, type TextClip, type TimelineDoc, type Transform, type VideoClip, watermarkRect } from "../edit/doc";
import type { Range } from "../edit/timeline";
import { DENOISE } from "../audio/denoise";
import { DUCK_LEVEL } from "../audio/ducking";
import { generateVolumeFilterExpr } from "../audio/smartMix";
import type { VolumeKeyframe } from "../edit/doc";
import { animExpr, typeLength } from "../player/anim";
import { patchFilters } from "../player/patches";
import { trackingBlurFilters } from "../tracking/render";
import { docTransitions, isDip, mainTransitions, transitionAudio, transitionExpr } from "../player/transitions";
import { placeRect, staticTransformAt, workScale } from "../player/layout";
import { fullKeys, hasKeys, motionAt, motionSpan, transformAt, type FullKey, type MotionClip } from "../edit/keyframes";
import { motionExpr } from "../player/motion";
import { boxQuad, hasCorners, localQuad, pivotCenter, warpPlan } from "../player/quad";
import { blendOnto, type BlendMode } from "./blend";
import { logoExpr } from "../player/logo";
import { textAnchor } from "../text/layout";
import { elementUnit } from "../elements/geometry";
import { AUDIO_KBPS, AV1_CRF, GIF_FPS, GIF_MAX_W, MP3_KBPS, MP4_CRF, VP9_CRF } from "../export/rates";
import { colorMatrix, cropOf, hasCrop, IDENTITY, isIdentity, maskDistanceExpr, mixerFilter, rotationOf, vignetteExpr, vignetteOf } from "../player/look";
import { OPS, type AnyOp } from "../ops/registry";
import { GraphBuilder } from "../ops/types";
import { APPLE_MEDIA, SAFE_INPUT } from "../ffmpeg/run";
import { QUALITY } from "../settings";

/**
 * The whole timeline as one FFmpeg command.
 *
 *   base (canvas color, or transparent)
 *     ← main-track clips at their back-to-back times (a blank scene: a color)
 *     ← overlay clips, lowest overlay track first (text: a PNG the browser drew,
 *       the size of the canvas — FFmpeg here can't draw text; elements: a PNG
 *       the browser drew, placed like a picture)
 *   sound: every audible clip, delayed to its time, mixed (ducking = quieter under speech)
 *
 * Each clip is its own input, read with -ss/-t (fast seeking; one file can be
 * used many times). Video clips run their own effects (background removal)
 * with the same filters as the single-video export (lib/ops), then are
 * placed like the preview does (lib/player/layout).
 */

export type ComposeKind = "mp4" | "webm" | "mov" | "master" | "poster" | "hevc" | "av1" | "vp9" | "prores" | "gif" | "png" | "jpg" | "mp3" | "m4a" | "wav";
/** Kinds that keep a transparent canvas see-through (the others put it on black). */
const ALPHA_KINDS = new Set<ComposeKind>(["webm", "mov", "master", "poster", "png"]);
/** Sound-only kinds: no picture is made at all. */
export const AUDIO_KINDS = new Set<ComposeKind>(["mp3", "m4a", "wav"]);
/** One picture: the frame at `o.at` (the playhead). */
const STILL_KINDS = new Set<ComposeKind>(["poster", "png", "jpg"]);
/** The uploads the timeline uses: file path, picture size (for fit/fill) and whether it has sound. */
export type ComposeMedia = Record<string, { path: string; hasAudio: boolean; width: number; height: number; /** a picture (not a video) */ still?: boolean }>;

const YUV420 = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
const TAIL: Record<ComposeKind, string> = {
  mp4: YUV420,
  hevc: YUV420,
  av1: YUV420,
  vp9: YUV420,
  prores: "scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le",
  gif: "", // built below (palette)
  png: "format=rgba",
  jpg: "scale=out_color_matrix=bt709:out_range=pc,format=yuvj444p",
  mp3: "",
  m4a: "",
  wav: "",
  poster: "format=rgba",
  webm: "scale=out_color_matrix=bt709:out_range=tv,format=yuva420p",
  mov: "format=bgra",
  master: "scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le",
};
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];
const kb = (v: number) => `${v}k`;

const f3 = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);
const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

type Visual = { clip: AnyClip; start: number };

/** Picture clips in drawing order: main track first (at the back), then overlays from the lowest track up. */
export function visualLayers(doc: TimelineDoc): Visual[] {
  const out: Visual[] = [];
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  if (!main.hidden) {
    main.clips.forEach((c, i) => out.push({ clip: c, start: starts[i] }));
  }
  for (let i = doc.tracks.length - 1; i >= 0; i--) {
    const t = doc.tracks[i];
    if (t.kind !== "overlay" || t.hidden) continue;
    for (const c of t.clips) out.push({ clip: c, start: c.start });
  }
  return out;
}

/** Sound sources: video clips with sound (not muted) and sound clips, at their timeline times. */
export function audioLayers(doc: TimelineDoc, media: ComposeMedia): { clip: VideoClip | AudioPlaced; start: number; duck: boolean }[] {
  const out: { clip: VideoClip | AudioPlaced; start: number; duck: boolean }[] = [];
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  if (!main.muted)
    main.clips.forEach((c, i) => {
      if (c.type === "video" && !c.muted && c.volume > 0 && media[c.mediaId]?.hasAudio) out.push({ clip: c, start: starts[i], duck: false });
    });
  for (const t of doc.tracks) {
    if (t.kind === "overlay" && !t.hidden && !t.muted) for (const c of t.clips) if (c.type === "video" && !c.muted && c.volume > 0 && media[c.mediaId]?.hasAudio) out.push({ clip: c as VideoClip, start: c.start, duck: false });
    if (t.kind === "audio" && !t.muted) for (const c of t.clips) if (c.volume > 0 && media[c.mediaId]?.hasAudio) out.push({ clip: c, start: c.start, duck: c.duck });
  }
  return out;
}

/**
 * When to look for see-through pixels in a transparent export: not on a blank
 * scene (a solid color). Null: nothing to check (Video 1 is only blank scenes).
 */
export function alphaCheckTime(doc: TimelineDoc, duration: number): number | null {
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  const onBlank = (t: number) => main.clips.some((c, i) => c.type === "blank" && t >= starts[i] - 1e-6 && t < starts[i] + clipLength(c));
  const want = Math.min(1, duration / 2);
  if (!onBlank(want)) return want;
  // the middle of the first clip that isn't a blank
  for (const [i, c] of main.clips.entries()) if (c.type !== "blank") return starts[i] + clipLength(c) / 2;
  // only blanks on Video 1: after them, if the video goes on (overlays)
  const end = starts.length ? starts[starts.length - 1] + clipLength(main.clips[main.clips.length - 1]) : 0;
  return duration > end + 0.1 ? (end + duration) / 2 : null;
}

/** Does this timeline have any sound in it? */
export function hasSound(doc: TimelineDoc, media: ComposeMedia): boolean {
  return audioLayers(doc, media).length > 0;
}

/** "between(t,1.2,3.4)+between(t,…)" for the speech ranges (timeline seconds), or "0". */
function rangesExpr(r: Range[]): string {
  return r.length ? r.map((x) => `between(t\\,${f3(x.start)}\\,${f3(x.end)})`).join("+") : "0";
}

/** The steps of a typewriter text: how many, how many letters, and where its area sits on the canvas. */
/**
 * A text drawn as rows one under another, cropped to the right row over time:
 * "type" (default) = typewriter steps (0 letters … all); "words" = a word-by-word caption,
 * row i highlights word i, evenly through the clip or at `times` (seconds into the clip, one per word).
 */
export type TextSprite = { frames: number; chars: number; box: { x: number; y: number; w: number; h: number }; kind?: "type" | "words"; times?: number[] };

/**
 * An element the browser drew (lib/elements/render): its PNG, w × h (a progress
 * bar: full and empty side by side, 2w wide, and maybe its rounded shape; a
 * ticker: its band, and the strip of words that slides over it).
 */
export type ElementSprite = { png: string; w: number; h: number; mask?: string; strip?: { png: string; w: number; x: number; win: number; speed: number } };

export type ComposeOptions = {
  /** AI Removal masks, by media id + clip (the mask of the clip's whole video). */
  maskOf?: (clip: VideoClip) => string | null;
  /** Speech on the main track (timeline seconds): ducked music goes quieter here. */
  speech?: Range[];
  /** The PNG drawn for a text clip (lib/text/render), or null to leave it out. */
  textOf?: (clip: TextClip) => string | null;
  /** The PNG drawn for a gradient / studio-set backdrop (lib/backdrops). */
  backdropOf?: () => string | null;
  /** The logo badge the browser drew (a box, rounded corners: lib/player/logo), or null: the logo picture. */
  logoOf?: () => string | null;
  /** The plan's mark (Free plan): this picture, small, in the bottom-right corner of every frame. */
  planMark?: string | null;
  /** A typewriter text: its PNG (textOf) holds every step one under another (lib/text/render renderTextSprite). */
  textSpriteOf?: (clip: TextClip) => TextSprite | null;
  /** The pictures drawn for an element (lib/elements/render), or null to leave it out. */
  elementOf?: (clip: ElementClip) => ElementSprite | null;
  /** A derived file to read instead of the upload (e.g. the stabilized copy). */
  sourceOf?: (clip: VideoClip) => string | null;
  /** The backwards copy of a reversed clip's [in, out] (lib/media/reverse). */
  reversedOf?: (clip: VideoClip) => string | null;
  progress?: boolean;
  /** Pictures (PNG / JPG): the timeline time of the frame. */
  at?: number;
};

/** Full FFmpeg argument list that renders the timeline to one output file. */
export function buildComposeArgs(doc: TimelineDoc, media: ComposeMedia, kind: ComposeKind, output: string, o: ComposeOptions = {}): string[] {
  const W = even(doc.canvas.width);
  const H = even(doc.canvas.height);
  const F = Math.round(doc.canvas.fps);
  const D = Math.max(0.1, docDuration(doc));
  const bd = doc.canvas.backdrop;
  // a backdrop covers the canvas: the result is solid
  const transparent = doc.canvas.background === "transparent" && ALPHA_KINDS.has(kind) && !bd;
  const audioOnly = AUDIO_KINDS.has(kind);
  const inputs: string[][] = [];
  const addInput = (args: string[]) => inputs.push(args) - 1;
  const g = new GraphBuilder();

  const base = g.label("base");
  const color = transparent ? "black@0.0" : doc.canvas.background === "transparent" ? "0x000000" : `0x${doc.canvas.background.slice(1)}`;
  if (!audioOnly) g.add(`color=c=${color}:s=${W}x${H}:r=${F}:d=${f3(D)},format=rgba[${base}]`);
  let comp = base;

  // the backdrop (Replace Background): a picture / looping video filling the canvas, or the drawn PNG
  if (bd && !audioOnly) {
    let k = -1;
    let fill = `scale=${W}:${H}`;
    if (bd.kind === "media" && media[bd.mediaId]) {
      const m = media[bd.mediaId];
      k = m.still ? addInput(["-loop", "1", "-framerate", String(F), "-t", f3(D), "-i", m.path]) : addInput(["-stream_loop", "-1", "-t", f3(D), "-i", m.path]);
      fill = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
    } else {
      const png = o.backdropOf?.();
      if (png) k = addInput(["-loop", "1", "-framerate", String(F), "-t", f3(D), "-i", png]);
    }
    if (k >= 0) {
      const [b1, b2] = [g.label("bd"), g.label("bb")];
      g.add(`[${k}:v]fps=${F},${fill},format=rgba,setpts=PTS-STARTPTS[${b1}]`);
      g.add(`[${comp}][${b1}]overlay=0:0:eof_action=repeat:format=auto[${b2}]`);
      comp = b2;
    }
  }

  // transitions between clips (lib/player/transitions: the preview uses the same curves)
  const mainT = mainTrack(doc);
  const trans = docTransitions(doc);
  const mainIds = new Set(mainT.clips.map((c) => c.id));
  let dipsDone = false;
  const addDips = () => {
    if (dipsDone || audioOnly) return;
    dipsDone = true;
    // "dip to black / white": a color layer over Video 1 that fades in and out through the overlap
    for (const t of trans.values()) {
      if (!t.in || !isDip(t.in.type)) continue;
      const { s, d } = t.in;
      const col = t.in.type === "dipBlack" ? "black" : "white";
      const [dl, nx] = [g.label("dip"), g.label("o")];
      g.add(`color=c=${col}:s=${W}x${H}:r=${F}:d=${f3(d)},format=rgba,fade=t=in:st=0:d=${f3(d / 2)}:alpha=1,fade=t=out:st=${f3(d / 2)}:d=${f3(d / 2)}:alpha=1,setpts=PTS-STARTPTS+${f3(s)}/TB[${dl}]`);
      g.add(`[${comp}][${dl}]overlay=0:0:eof_action=pass:format=auto:enable='between(t\\,${f3(s)}\\,${f3(s + d)})'[${nx}]`);
      comp = nx;
    }
  };
  const transOf = (id: string, len: number): LayerTrans | null => {
    const t = trans.get(id);
    if (!t) return null;
    const out: LayerTrans = { x: "", y: "", fades: [], showFrom: undefined };
    if (t.in) {
      const e = transitionExpr(t.in.type, t.in.s, t.in.d, W, H);
      out.x += e.in.x;
      out.y += e.in.y;
      if (e.in.fade) out.fades.push(`fade=t=in:st=0:d=${f3(e.in.fade.d)}:alpha=1`);
      if (e.in.showFrom > t.in.s) out.showFrom = e.in.showFrom;
      out.scale = e.in.scale;
      out.rot = e.in.rot;
      out.mask = e.in.mask;
      out.d = t.in.d;
    }
    if (t.out) {
      const e = transitionExpr(t.out.type, t.out.s, t.out.d, W, H);
      out.x += e.out.x;
      out.y += e.out.y;
    }
    void len;
    return out;
  };

  // a blend mode on an overlay-track layer (Video 1 is the base): mixed with what's behind it (lib/render/blend)
  const blendOf = (c: AnyClip) => (!mainIds.has(c.id) && "blend" in c && c.blend && c.blend !== "normal" ? { mode: c.blend, transparent, total: D, F } : null);
  for (const layer of audioOnly ? [] : visualLayers(doc)) {
    const c = layer.clip;
    if (c.type === "audio") continue;
    if (!mainIds.has(c.id)) addDips();
    const len = clipLength(c);
    if (c.type === "text") {
      const png = o.textOf?.(c);
      if (!png) continue;
      const k = addInput(["-loop", "1", "-framerate", String(F), "-t", f3(len), "-i", png]);
      let head = `[${k}:v]`;
      const sp = o.textSpriteOf?.(c);
      if (sp) {
        const n = sp.frames;
        let row: string;
        if (sp.kind === "words") {
          // word-by-word caption: the row of the word being said (its own times, or evenly spread)
          row =
            sp.times && sp.times.length === n
              ? `(${sp.times.slice(1).map((ts) => `gte(t\\,${n4(ts)})`).join("+") || "0"})`
              : `min(${n - 1}\\,floor(t/${n4(len)}*${n}))`;
        } else {
          // typewriter: the step for each moment (0 letters … all), put back in its place on the canvas
          const tIn = typeLength(sp.chars, len);
          const pin = c.anim.in === "typewriter" ? `clip(t/${n4(tIn)}\\,0\\,1)` : "1";
          const pout = c.anim.out === "typewriter" ? `clip((${n4(len)}-t)/${n4(tIn)}\\,0\\,1)` : "1";
          row = `min(${n}\\,min(floor(${pin}*${n}+0.000001)\\,floor(${pout}*${n}+0.000001)))`;
        }
        const b = sp.box;
        const tw = g.label("tw");
        g.add(`${head}format=rgba,crop=w=${b.w}:h=${b.h}:x=0:y='${row}*${b.h}',pad=${W}:${H}:${b.x}:${b.y}:color=black@0[${tw}]`);
        head = `[${tw}]`;
      }
      comp = placeLayer(g, comp, head, { x: 0, y: 0, w: W, h: H }, c, layer.start, len, W, H, true, null, null, layerMotion(c, W, H, W, H, F), false, blendOf(c));
      continue;
    }
    if (c.type === "element") {
      const e = o.elementOf?.(c);
      if (!e) continue;
      const still = (path: string) => addInput(["-loop", "1", "-framerate", String(F), "-t", f3(len), "-i", path]);
      let head = `[${still(e.png)}:v]`;
      if (c.el.kind === "progress") {
        // how full it is: a window slides over the full and the empty bar, side by side (lib/elements/geometry progressAt)
        const pb = g.label("pb");
        g.add(`${head}format=rgba,crop=w=${e.w}:h=${e.h}:x='${e.w}*(1-min(1\\,t/${n4(len)}))':y=0[${pb}]`);
        head = `[${pb}]`;
        if (e.mask) {
          // rounded ends: its alpha times the shape's
          const m = still(e.mask);
          const [bc, ba, a0, m0, a1, bm] = [g.label("bc"), g.label("ba"), g.label("a0"), g.label("m0"), g.label("a1"), g.label("bm")];
          g.add(`${head}split[${bc}][${ba}]`);
          g.add(`[${ba}]alphaextract[${a0}]`);
          g.add(`[${m}:v]format=rgba,alphaextract[${m0}]`);
          g.add(`[${a0}][${m0}]blend=all_mode=multiply,format=gray[${a1}]`);
          g.add(`[${bc}][${a1}]alphamerge[${bm}]`);
          head = `[${bm}]`;
        }
      } else if (e.strip) {
        // a ticker: its words, twice side by side, seen through a window that slides (and loops) over the band
        const sp = e.strip;
        const k = still(sp.png);
        const [s1, s2, wv, bd, tk] = [g.label("s1"), g.label("s2"), g.label("tw"), g.label("bd"), g.label("tk")];
        g.add(`[${k}:v]format=rgba,split[${s1}][${s2}]`);
        g.add(`[${s1}][${s2}]hstack=inputs=2,crop=w=${sp.win}:h=${e.h}:x='mod(${n4(sp.speed)}*t\\,${sp.w})':y=0[${wv}]`);
        g.add(`${head}format=rgba[${bd}]`);
        g.add(`[${bd}][${wv}]overlay=x=${sp.x}:y=0:format=auto[${tk}]`);
        head = `[${tk}]`;
      }
      // sized and placed like a picture of its own shape (turning never changes its size: lib/elements/geometry)
      const unit = elementUnit(c.el.aspect, W, H);
      const lm = elementMotion(c, unit, W, H, F);
      const t = lm?.transform ?? c.transform;
      // (around its pivot: lib/player/quad)
      const ec = pivotCenter(W / 2 + t.x * W, H / 2 + t.y * H, unit.w * t.scale, unit.h * t.scale, unit.w, unit.h, t);
      const r = lm?.anim ? { x: 0, y: 0, w: unit.w * lm.anim.sRef, h: unit.h * lm.anim.sRef } : { x: ec.x - (unit.w * t.scale) / 2, y: ec.y - (unit.h * t.scale) / 2, w: unit.w * t.scale, h: unit.h * t.scale };
      // (drawn at its size already: no resizing)
      const resize = !(even(r.w) === e.w && even(r.h) === e.h);
      comp = placeLayer(g, comp, head, r, c, layer.start, len, W, H, resize, { addInput, F }, null, lm, true, blendOf(c));
      continue;
    }
    if (c.type === "blank") {
      // a blank scene: its color over the frame, placed like a picture (so its transition and fades work)
      const head = `color=c=0x${c.fill.slice(1)}:s=${W}x${H}:r=${F}:d=${f3(len)},`;
      comp = placeLayer(g, comp, head, { x: 0, y: 0, w: W, h: H }, c, layer.start, len, W, H, false, { addInput, F }, transOf(c.id, len), { transform: DEFAULT_TRANSFORM, opacity: 1, F });
      continue;
    }
    const src = media[c.mediaId];
    if (!src) continue;
    let head: string;
    // a picture that covers a watermark: its own input for this clip
    const coverOf = (id: string) => (media[id] ? addInput(["-loop", "1", "-framerate", String(F), "-t", f3(len), "-i", media[id].path]) : null);
    if (c.type === "video") {
      const sp = speedOf(c);
      const span = c.out - c.in;
      const rev = isReversed(c) ? (o.reversedOf?.(c) ?? null) : null;
      const k = addInput(["-ss", f3(rev ? 0 : c.in), "-t", f3(span), "-i", rev ?? o.sourceOf?.(c) ?? src.path]);
      // speed: stretch the timestamps, then resample to the project frame rate
      const pts = sp !== 1 ? `setpts=(PTS-STARTPTS)/${n4(sp)}` : "setpts=PTS-STARTPTS";
      head = `[${k}:v]${pts},fps=${F},`;
      // watermark / logo boxes first, on the source picture (lib/player/patches)
      const wm = patchFilters(c.patches, head, src.width || W, src.height || H, g, coverOf);
      if (wm) head = `[${wm}]`;
      const tb = trackingBlurFilters(c.tracking?.points, head, src.width || W, src.height || H, g);
      if (tb) head = `[${tb}]`;
      const mask = c.ops.some((op) => op.enabled && op.type === "aiMatte") && !rev ? o.maskOf?.(c) : null;
      if (mask) {
        const m = addInput(["-ss", f3(c.in), "-t", f3(span), "-i", mask]);
        g.maskInput = `[${m}:v]${pts},fps=${F},`;
      }
      for (const op of c.ops) {
        if (!op.enabled) continue;
        const label = (OPS[op.type] as AnyOp).toFilter(op.params, head, g);
        head = `[${label}]`;
      }
      g.maskInput = undefined;
    } else {
      const k = addInput(["-loop", "1", "-framerate", String(F), "-t", f3(len), "-i", src.path]);
      head = `[${k}:v]`;
      const wm = patchFilters(c.patches, head, src.width || W, src.height || H, g, coverOf);
      if (wm) head = `[${wm}]`;
    }
    // size and place it like the preview (fit / fill, scale, offset); keyframes move it (lib/player/motion)
    const lm = layerMotion(c, src.width || W, src.height || H, W, H, F);
    const r = lm?.anim ? { x: 0, y: 0, w: lm.anim.unitW * lm.anim.sRef * (lm.anim.sxRef ?? 1), h: lm.anim.unitH * lm.anim.sRef * (lm.anim.syRef ?? 1) } : placeRect(src.width || W, src.height || H, W, H, lm?.transform ?? c.transform);
    comp = placeLayer(g, comp, head, r, c, layer.start, len, W, H, true, { addInput, F }, transOf(c.id, len), lm, false, blendOf(c));
  }
  addDips();
  // your logo on top of everything (Brand Kit): same corner, size and opacity as the preview
  const wm = doc.watermark;
  const logo = wm ? media[wm.mediaId] : undefined;
  if (wm && logo && !audioOnly) {
    const lr = watermarkRect(wm, W, H, logo.width || 1, logo.height || 1);
    // with a box / rounded corners: the badge the browser drew (lib/player/logo drawLogoBadge), else the logo picture
    const k = addInput(["-loop", "1", "-framerate", String(F), "-t", f3(D), "-i", o.logoOf?.() ?? logo.path]);
    const [l1, l2] = [g.label("logo"), g.label("wm")];
    // a part of the video, and how it comes in / goes out (the same curves as the preview)
    const le = logoExpr(wm, D, W, lr);
    const moves = !!le.scale || !!le.dx;
    const extra = [...le.fades, ...(le.scale ? [`scale=w='max(2\\,${lr.w}*${le.scale})':h='max(2\\,${lr.h}*${le.scale})':eval=frame`] : [])];
    g.add(`[${k}:v]fps=${F},scale=${lr.w}:${lr.h},format=rgba,colorchannelmixer=aa=${wm.opacity.toFixed(3)}${extra.length ? `,${extra.join(",")}` : ""},setpts=PTS-STARTPTS[${l1}]`);
    const part = wm.from != null || wm.to != null ? `:enable='${le.enable}'` : "";
    const at = moves ? `x='${n4(lr.x + lr.w / 2)}${le.dx}-overlay_w/2':y='${n4(lr.y + lr.h / 2)}-overlay_h/2'` : `${lr.x}:${lr.y}`;
    g.add(`[${comp}][${l1}]overlay=${at}:eof_action=repeat:format=auto${part}[${l2}]`);
    comp = l2;
  }
  // the Free plan's mark: the ViPlay logo, small and a little see-through, bottom right (lib/billing/entitlements)
  if (o.planMark && !audioOnly) {
    const mh = even(Math.max(24, Math.round(H * 0.06)));
    const margin = Math.round(H * 0.03);
    const k = addInput(["-loop", "1", "-framerate", String(F), "-t", f3(D), "-i", o.planMark]);
    const [m1, m2] = [g.label("mark"), g.label("marked")];
    g.add(`[${k}:v]fps=${F},scale=-2:${mh},format=rgba,colorchannelmixer=aa=0.7,setpts=PTS-STARTPTS[${m1}]`);
    g.add(`[${comp}][${m1}]overlay=x=W-w-${margin}:y=H-h-${margin}:eof_action=repeat:format=auto[${m2}]`);
    comp = m2;
  }
  const vout = g.label("vout");
  if (kind === "gif") {
    // a GIF has 256 colors: pick the best palette for this video, then use it
    const [g1, g2, gp] = [g.label("g"), g.label("g"), g.label("pal")];
    g.add(`[${comp}]fps=${Math.min(F, GIF_FPS)},scale=w=min(iw\\,${GIF_MAX_W}):h=-2:flags=lanczos,format=rgb24,split[${g1}][${g2}]`);
    g.add(`[${g1}]palettegen=stats_mode=diff[${gp}]`);
    g.add(`[${g2}][${gp}]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[${vout}]`);
  } else if (!audioOnly) g.add(`[${comp}]${TAIL[kind]}[${vout}]`);

  // sound
  const sounds = STILL_KINDS.has(kind) || kind === "gif" ? [] : audioLayers(doc, media);
  let aout: string | null = null;
  if (sounds.length) {
    const parts: string[] = [];
    for (const s of sounds) {
      const c = s.clip;
      const span = c.out - c.in;
      const sp = speedOf(c);
      // timeline length (speed), and a reversed clip reads its backwards copy from the start
      const len = span / sp;
      const rev = c.type === "video" && isReversed(c) ? (o.reversedOf?.(c) ?? null) : null;
      const path = rev ?? (c.type === "video" ? o.sourceOf?.(c) : null) ?? media[c.mediaId].path;
      const k = addInput(["-ss", f3(rev ? 0 : c.in), "-t", f3(span), "-i", path]);
      const chain = ["asetpts=PTS-STARTPTS", ...atempo(sp), "aresample=48000", "aformat=channel_layouts=stereo"];
      // "Remove background noise" (the preview plays the same chain, made by /api/videos/[id]/clean-audio)
      if (c.denoise) chain.push(DENOISE[c.denoise]);
      if ((c as { volumeAutomation?: VolumeKeyframe[] }).volumeAutomation?.length) {
        chain.push(generateVolumeFilterExpr((c as any).volumeAutomation, c.volume));
      } else {
        chain.push(`volume=${c.volume.toFixed(2)}`);
      }
      if (c.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${f3(c.fadeIn)}`);
      if (c.fadeOut > 0) chain.push(`afade=t=out:st=${f3(Math.max(0, len - c.fadeOut))}:d=${f3(c.fadeOut)}`);
      // Per-clip loudness levelling
      if ((c as { loudness?: boolean }).loudness) chain.push("loudnorm=I=-16:TP=-1.5:LRA=11");
      // Video 1 transitions: the sound crosses over too
      const tt = trans.get(c.id);
      if (tt?.in) {
        const a = transitionAudio(tt.in.type, tt.in.d).inFade;
        chain.push(`afade=t=in:st=${f3(a.st)}:d=${f3(a.d)}`);
      }
      if (tt?.out) {
        const a = transitionAudio(tt.out.type, tt.out.d).outFade;
        chain.push(`afade=t=out:st=${f3(Math.max(0, len - tt.out.d + a.st))}:d=${f3(a.d)}`);
      }
      const ms = Math.round(s.start * 1000);
      if (ms > 0) chain.push(`adelay=${ms}:all=1`);
      // ducking: quieter while someone speaks on Video 1 (the preview uses the same ranges)
      if (s.duck && o.speech?.length) chain.push(`volume='if(${rangesExpr(o.speech)}\\,${DUCK_LEVEL}\\,1)':eval=frame`);
      const a = g.label("a");
      g.add(`[${k}:a]${chain.join(",")}[${a}]`);
      parts.push(`[${a}]`);
    }
    aout = g.label("aout");
    const lnorm = doc.output.loudness ? ",loudnorm=I=-16:TP=-1.5:LRA=11" : "";
    g.add(`${parts.join("")}amix=inputs=${parts.length}:normalize=0:dropout_transition=0,atrim=0:${f3(D)},asetpts=PTS-STARTPTS${lnorm}[${aout}]`);
  }

  const args: string[] = [...SAFE_INPUT];
  for (const i of inputs) args.push(...i);
  if (audioOnly && !aout) throw new Error("This timeline has no sound.");
  args.push("-filter_complex", g.toString());
  if (!audioOnly) args.push("-map", `[${vout}]`);
  const q = qualityOf(doc);
  const withSound = (codec: string[]) => {
    if (aout) args.push("-map", `[${aout}]`, ...codec);
    else args.push("-an");
  };
  switch (kind) {
    case "hevc":
      // (Apple's hardware encoder on a Mac; elsewhere libx265, a little smaller than H.264 at the same CRF)
      if (APPLE_MEDIA) args.push("-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-q:v", String(QUALITY[q].hevcQ));
      else args.push("-c:v", "libx265", "-preset", "medium", "-crf", String(MP4_CRF[q] + 4), "-x265-params", "log-level=error");
      args.push("-tag:v", "hvc1", "-pix_fmt", "yuv420p", ...BT709, "-movflags", "+faststart");
      withSound(["-c:a", "aac", "-b:a", kb(AUDIO_KBPS.hevc)]);
      break;
    case "av1":
      args.push("-c:v", "libsvtav1", "-preset", "8", "-crf", String(AV1_CRF[q]), "-pix_fmt", "yuv420p", ...BT709, "-movflags", "+faststart");
      withSound(["-c:a", "aac", "-b:a", kb(AUDIO_KBPS.av1)]);
      break;
    case "vp9":
      args.push("-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", String(VP9_CRF[q]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", ...BT709);
      withSound(["-c:a", "libopus", "-b:a", kb(AUDIO_KBPS.vp9)]);
      break;
    case "prores":
      args.push("-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", ...BT709, "-movflags", "+faststart");
      withSound(["-c:a", "pcm_s16le"]);
      break;
    case "gif":
      args.push("-an", "-loop", "0", "-f", "gif");
      break;
    case "png":
      args.push("-frames:v", "1", "-an", "-c:v", "png");
      break;
    case "jpg":
      args.push("-frames:v", "1", "-an", "-c:v", "mjpeg", "-q:v", "2");
      break;
    case "mp3":
      args.push("-map", `[${aout}]`, "-c:a", "libmp3lame", "-b:a", kb(MP3_KBPS[q]));
      break;
    case "m4a":
      args.push("-map", `[${aout}]`, "-c:a", "aac", "-b:a", kb(AUDIO_KBPS.m4a), "-movflags", "+faststart");
      break;
    case "wav":
      args.push("-map", `[${aout}]`, "-c:a", "pcm_s16le");
      break;
    case "mp4":
      args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(MP4_CRF[qualityOf(doc)]), "-pix_fmt", "yuv420p", ...BT709, "-movflags", "+faststart");
      if (aout) args.push("-map", `[${aout}]`, "-c:a", "aac", "-b:a", kb(AUDIO_KBPS.mp4));
      else args.push("-an");
      break;
    case "webm":
      args.push("-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", String(QUALITY[qualityOf(doc)].crf), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", ...BT709);
      if (aout) args.push("-map", `[${aout}]`, "-c:a", "libopus", "-b:a", kb(AUDIO_KBPS.webm));
      else args.push("-an");
      break;
    case "mov":
      args.push("-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-alpha_quality", "0.75", "-q:v", String(QUALITY[qualityOf(doc)].hevcQ), "-tag:v", "hvc1", ...BT709, "-movflags", "+faststart");
      if (aout) args.push("-map", `[${aout}]`, "-c:a", "aac", "-b:a", kb(AUDIO_KBPS.mov));
      else args.push("-an");
      break;
    case "master":
      args.push("-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", ...BT709, "-movflags", "+faststart");
      if (aout) args.push("-map", `[${aout}]`, "-c:a", "pcm_s16le");
      else args.push("-an");
      break;
    case "poster":
      args.push("-frames:v", "1", "-an", "-c:v", "png");
      break;
  }
  // a picture of the frame at the playhead: drop the frames before it
  if (STILL_KINDS.has(kind) && o.at && o.at > 0) args.push("-ss", f3(Math.min(o.at, Math.max(0, D - 1 / F))));
  if (!STILL_KINDS.has(kind)) args.push("-t", f3(D));
  if (o.progress !== false && !STILL_KINDS.has(kind)) args.push("-progress", "pipe:1", "-nostats");
  args.push("-y", output);
  return args;
}

const qualityOf = (doc: TimelineDoc) => doc.output.quality;
/** A Video 1 transition on a clip: movement, fades, when it shows, and (incoming) a size factor, a turn, a reveal mask. */
type LayerTrans = { x: string; y: string; fades: string[]; showFrom?: number; scale?: string | null; rot?: string | null; mask?: string | null; d?: number };

/** Speed for sound without changing its pitch (atempo does 0.5–2 per step). */
export function atempo(speed: number): string[] {
  if (Math.abs(speed - 1) < 1e-6) return [];
  const out: string[] = [];
  let s = speed;
  while (s > 2 + 1e-9) {
    out.push("atempo=2");
    s /= 2;
  }
  while (s < 0.5 - 1e-9) {
    out.push("atempo=0.5");
    s /= 0.5;
  }
  out.push(`atempo=${n4(s)}`);
  return out;
}

/** How a clip's keyframes / opacity change its layer (null: not at all, the graph stays as it always was). */
type LayerMotion = {
  /** the still parts (crop, flips; the whole look when nothing moves) */
  transform: Transform;
  /** a steady opacity */
  opacity: number;
  F: number;
  /** it moves: built once at the working size (the biggest, capped), then scaled / turned / faded frame by frame */
  anim?: {
    keys: FullKey[];
    span: ReturnType<typeof motionSpan>;
    sRef: number;
    unitW: number;
    unitH: number;
    /** its biggest stretch (the work picture is made this much wider / taller) */
    sxRef?: number;
    syRef?: number;
    /** stretched, skewed or pinned at some moment: the warp path (each frame: per-axis size, then one perspective with the skew and turn) */
    warp?: boolean;
  };
};

/** Does a moving clip need the warp path (lib/player/quad): any stretch, skew or corner pin? */
function needsWarp(span: ReturnType<typeof motionSpan>, t: Transform): boolean {
  const off = (a: number, b: number, v: number) => Math.abs(a - v) > 1e-9 || Math.abs(b - v) > 1e-9;
  return off(span.min.scaleX, span.max.scaleX, 1) || off(span.min.scaleY, span.max.scaleY, 1) || off(span.min.skewX, span.max.skewX, 0) || off(span.min.skewY, span.max.skewY, 0) || hasCorners(t.corners);
}

function layerMotion(c: MotionClip, w: number, h: number, W: number, H: number, F: number): LayerMotion | null {
  const op = c.opacity ?? 1;
  if (!hasKeys(c)) return op < 0.999 ? { transform: c.transform, opacity: op, F } : null;
  const span = motionSpan(c);
  if (!span.moving) {
    // keyframes that never change: a still clip with that look
    const t = c.type === "text" ? transformAt(c, 0) : staticTransformAt(w, h, W, H, c, 0);
    return { transform: t, opacity: motionAt(c, 0).opacity, F };
  }
  if (c.type === "text") return { transform: c.transform, opacity: 1, F, anim: { keys: fullKeys(c), span, sRef: span.max.scale, unitW: W, unitH: H } };
  // (its size at scale 1: no stretch or pivot)
  const unit = placeRect(w, h, W, H, { ...c.transform, x: 0, y: 0, scale: 1, scaleX: undefined, scaleY: undefined, pivot: undefined });
  const warp = needsWarp(span, c.transform);
  return { transform: c.transform, opacity: 1, F, anim: { keys: fullKeys(c), span, sRef: workScale(unit.w, unit.h, span.max.scale, W, H), unitW: unit.w, unitH: unit.h, ...(warp ? { warp, sxRef: span.max.scaleX, syRef: span.max.scaleY } : {}) } };
}

/** layerMotion for an element: the same, with its own box (lib/elements/geometry elementUnit). */
function elementMotion(c: ElementClip, unit: { w: number; h: number }, W: number, H: number, F: number): LayerMotion | null {
  const op = c.opacity ?? 1;
  if (!hasKeys(c)) return op < 0.999 ? { transform: c.transform, opacity: op, F } : null;
  const span = motionSpan(c);
  if (!span.moving) return { transform: transformAt(c, 0), opacity: motionAt(c, 0).opacity, F };
  const warp = needsWarp(span, c.transform);
  return { transform: c.transform, opacity: 1, F, anim: { keys: fullKeys(c), span, sRef: workScale(unit.w, unit.h, span.max.scale, W, H), unitW: unit.w, unitH: unit.h, ...(warp ? { warp, sxRef: 1, syRef: 1 } : {}) } };
}

/**
 * Put one picture on the composition: size it, fade and animate it like the
 * preview (lib/player/layout + lib/player/anim), shift it to its time, overlay.
 * Returns the new composition label.
 */
function placeLayer(
  g: GraphBuilder,
  comp: string,
  head: string,
  r: { x: number; y: number; w: number; h: number },
  c: Exclude<AnyClip, { type: "audio" }>,
  start: number,
  len: number,
  W: number,
  H: number,
  resize: boolean,
  /** Pictures (not text): crop, flip, color, shape mask and rotation (lib/player/look). */
  pic: { addInput: (args: string[]) => number; F: number } | null,
  /** A Video 1 transition: extra x / y movement, alpha fades, and when the clip starts to show. */
  tr: LayerTrans | null = null,
  /** Keyframes and opacity (layerMotion). */
  lm: LayerMotion | null = null,
  /** Resize and turn with premultiplied alpha (elements: clean edges, no dark rim). */
  clean = false,
  /** A blend mode (overlay tracks): put on a see-through canvas first, then mixed with the composite (lib/render/blend). */
  bl: { mode: BlendMode; transparent: boolean; total: number; F: number } | null = null,
): string {
  // (a blank scene has no place of its own: the whole frame)
  const t = lm?.transform ?? ("transform" in c ? c.transform : DEFAULT_TRANSFORM);
  const rs = (f: string) => (clean ? `premultiply=inplace=1,${f},unpremultiply=inplace=1` : f);
  const matrix = pic && "color" in c ? colorMatrix(c.color) : IDENTITY;
  const styled = !!pic && (hasCrop(t) || !!t.flipX || !!t.flipY || !isIdentity(matrix));
  const pre: string[] = [];
  if (styled) {
    pre.push("format=rgba");
    if (hasCrop(t)) {
      const k = cropOf(t);
      pre.push(`crop=w=iw*${n4(1 - k.l - k.r)}:h=ih*${n4(1 - k.t - k.b)}:x=iw*${n4(k.l)}:y=ih*${n4(k.t)}`);
    }
    if (t.flipX) pre.push("hflip");
    if (t.flipY) pre.push("vflip");
    if (!isIdentity(matrix)) pre.push(mixerFilter(matrix));
  }
  const w = even(r.w);
  const h = even(r.h);
  // "Enhance quality" / "Upscale": sized with Lanczos (sharper than bicubic when enlarging), then a light sharpen
  const sharpen = pic && "color" in c ? (c.color?.sharpen ?? 0) : 0;
  if (resize) pre.push(rs(`scale=${w}:${h}:flags=${sharpen > 0 ? "lanczos" : "bicubic"}`));
  if (sharpen > 0) pre.push(`unsharp=5:5:${n4(0.3 + sharpen * 1.2)}:5:5:0`);
  pre.push("format=rgba");
  // vignette (Looks): darker corners, the same curve as the preview (lib/player/look vignetteGain); alpha stays
  const vig = pic && "color" in c ? vignetteOf(c.color) : 0;
  if (vig > 0 && pic) {
    const p0 = g.label("pv");
    g.add(`${head}${pre.join(",")},format=gbrap[${p0}]`);
    const vk = pic.addInput(["-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:r=${pic.F}:d=${n4(1 / pic.F)},format=gray,geq=lum='${vignetteExpr(vig)}',format=gbrap`]);
    const [vl, vo] = [g.label("vg"), g.label("vv")];
    g.add(`[${vk}:v]loop=loop=-1:size=1,setpts=N/${pic.F}/TB,trim=duration=${f3(len)}[${vl}]`);
    g.add(`[${p0}][${vl}]blend=c0_mode=multiply:c1_mode=multiply:c2_mode=multiply:c3_mode=normal,format=rgba[${vo}]`);
    head = `[${vo}]`;
    pre.length = 0;
    pre.push("format=rgba");
  }
  // shape mask (round camera bubble, rounded corners) and its border: pictures drawn once by FFmpeg, then repeated
  const mask = pic && "mask" in c && c.mask && c.mask.shape !== "rect" ? c.mask : pic && "mask" in c && c.mask?.border?.width ? c.mask : null;
  if (mask && pic) {
    const p0 = g.label("pm");
    g.add(`${head}${pre.join(",")}[${p0}]`);
    const still = (src: string) => pic.addInput(["-f", "lavfi", "-i", `${src}`]);
    const d = maskDistanceExpr(mask, w, h);
    const f = n4(Math.max(1, mask.feather));
    const mk = still(`color=c=black:s=${w}x${h}:r=${pic.F}:d=${n4(1 / pic.F)},format=gray,geq=lum='255*clip(0.5-${d}/${f}\\,0\\,1)'`);
    const [mkl, vc, va, a0, a1, vm] = [g.label("mk"), g.label("mc"), g.label("ma"), g.label("a0"), g.label("a1"), g.label("mv")];
    g.add(`[${mk}:v]loop=loop=-1:size=1,setpts=N/${pic.F}/TB,trim=duration=${f3(len)}[${mkl}]`);
    g.add(`[${p0}]split[${vc}][${va}]`);
    g.add(`[${va}]alphaextract[${a0}]`);
    g.add(`[${a0}][${mkl}]blend=all_mode=multiply,format=gray[${a1}]`);
    g.add(`[${vc}][${a1}]alphamerge[${vm}]`);
    head = `[${vm}]`;
    if (mask.border && mask.border.width > 0) {
      const bw = n4(mask.border.width);
      const ring = still(`color=c=0x${mask.border.color.slice(1)}:s=${w}x${h}:r=${pic.F}:d=${n4(1 / pic.F)},format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='255*clip(0.5-${d}\\,0\\,1)*clip(0.5+${d}+${bw}\\,0\\,1)'`);
      const [rl, vb] = [g.label("rg"), g.label("bv")];
      g.add(`[${ring}:v]loop=loop=-1:size=1,setpts=N/${pic.F}/TB,trim=duration=${f3(len)}[${rl}]`);
      g.add(`${head}[${rl}]overlay=0:0:format=auto[${vb}]`);
      head = `[${vb}]`;
    }
    pre.length = 0;
  }
  const am = lm?.anim;
  const rotation = pic && !am ? rotationOf(t) : 0;
  const chain = [...pre];
  // a steady opacity
  const steady = am ? (am.span.animated.opacity ? 1 : am.span.min.opacity) : (lm?.opacity ?? 1);
  if (steady < 0.999) chain.push("format=rgba", `colorchannelmixer=aa=${n4(steady)}`);
  // a transition that reveals this clip (a wipe, a circle): its mask, at the picture's size (before it moves)
  if (tr?.mask && tr.d && pic) {
    const [pk, pa, po] = [g.label("tp"), g.label("tm"), g.label("to")];
    g.add(`${head}${[...chain, "format=gbrap"].join(",")}[${pk}]`);
    // (the mask lasts the transition; after it, its last frame, all shown, repeats)
    g.add(`color=c=white:s=${w}x${h}:r=${pic.F}:d=${f3(tr.d)},format=gbrap,geq=r='255':g='255':b='255':a='${tr.mask}'[${pa}]`);
    g.add(`[${pk}][${pa}]blend=c3_mode=multiply,format=rgba[${po}]`);
    head = `[${po}]`;
    chain.length = 0;
  }
  // skewed or pinned (a still clip): one premultiplied perspective warp, with its turn, onto the preview's shape (lib/player/quad)
  let warped: { ox: number; oy: number; fw: number; fh: number } | null = null;
  if (pic && !am && (t.skewX || t.skewY || hasCorners(t.corners))) {
    const quad = boxQuad({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }, { rotation: rotationOf(t), skewX: t.skewX, skewY: t.skewY, corners: t.corners });
    const plan = warpPlan(w, h, quad, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    if (plan) {
      chain.push(`pad=${plan.fw}:${plan.fh}:${plan.padX}:${plan.padY}:color=black@0`, "format=gbrap", "premultiply=inplace=1", `perspective=${perspectiveArgs(plan.refs)}:sense=destination:interpolation=linear`, "unpremultiply=inplace=1", "format=rgba");
      warped = plan;
    } else chain.push("format=rgba", "colorchannelmixer=aa=0"); // (flattened to nothing: the preview doesn't draw it either)
  }
  if (am && lm) {
    const keys = am.keys;
    if (am.span.animated.opacity) {
      // opacity over time: multiply the alpha by a tiny grey picture that changes, stretched to this size
      const [pk, pa, po] = [g.label("kp"), g.label("ka"), g.label("ko")];
      g.add(`${head}${[...chain, "format=gbrap"].join(",")}[${pk}]`);
      g.add(`color=c=white:s=2x2:r=${lm.F}:d=${f3(len)},format=gbrap,geq=r='255':g='255':b='255':a='255*clip(${motionExpr(keys, "opacity", "T")}\\,0\\,1)',scale=${w}:${h}:flags=neighbor[${pa}]`);
      g.add(`[${pk}][${pa}]blend=c3_mode=multiply,format=rgba[${po}]`);
      head = `[${po}]`;
      chain.length = 0;
    }
    if (am.warp && pic) {
      chain.push(...warpMotion(am, lm.transform, w, h, lm.F));
    } else {
    // turn first, at the working size (rotate keeps the size it starts with), then scale the turned picture
    const rotAnim = !!pic && am.span.animated.rotation;
    const rotConst = pic ? am.span.min.rotation : 0;
    let bw = w;
    let bh = h;
    if (rotAnim || Math.abs(rotConst) > 1e-6) {
      const D = even(Math.ceil(Math.hypot(w, h)) + 2);
      // (the corners are filled see-through each frame: with "none" a turning picture would leave a trail)
      const a = rotAnim ? `'(${motionExpr(keys, "rotation", "t")})*0.0174533'` : n4((rotConst * Math.PI) / 180);
      chain.push("format=rgba", rs(`rotate=a=${a}:ow=${D}:oh=${D}:c=black@0`));
      bw = bh = D;
    }
    if (am.span.animated.scale) {
      const k = `(${motionExpr(keys, "scale", "t")})/${n4(am.sRef)}`;
      chain.push(rs(`scale=w='max(2\\,${bw}*${k})':h='max(2\\,${bh}*${k})':eval=frame:flags=bicubic`));
    } else if (Math.abs(am.span.min.scale - am.sRef) > 1e-6) chain.push(rs(`scale=${even((bw * am.span.min.scale) / am.sRef)}:${even((bh * am.span.min.scale) / am.sRef)}:flags=bicubic`));
    }
  }
  // a transition into this clip: a reveal (wipe / circle), a turn, a size (lib/player/transitions)
  let tw = am ? 0 : w;
  let thh = am ? 0 : h;
  const trTurn = !!pic && !!tr?.rot;
  if (trTurn) {
    const D = even(Math.ceil(Math.hypot(tw || w, thh || h)) + 2);
    chain.push("format=rgba", `rotate=a='${tr!.rot}*0.0174533':ow=${D}:oh=${D}:c=black@0`);
    tw = thh = D;
  }
  if (tr?.scale) chain.push(`scale=w='max(2\\,iw*${tr.scale})':h='max(2\\,ih*${tr.scale})':eval=frame:flags=bicubic`);
  if (rotation && !warped) {
    const rad = n4((rotation * Math.PI) / 180);
    chain.push("format=rgba", rs(`rotate=a=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=none`));
  }
  if (!chain.length) chain.push("format=rgba");
  if (c.fadeIn > 0) chain.push(`fade=t=in:st=0:d=${f3(c.fadeIn)}:alpha=1`);
  if (tr) chain.push(...tr.fades);
  if (c.fadeOut > 0) chain.push(`fade=t=out:st=${f3(Math.max(0, len - c.fadeOut))}:d=${f3(c.fadeOut)}:alpha=1`);
  const anim = "anim" in c ? animExpr(c.anim, start, len, W, H) : null;
  // pop / zoom: a size over time (pictures: around their middle; text: around its anchor)
  if (anim?.scale) chain.push(rs(`scale=w='max(2\\,iw*${anim.scale})':h='max(2\\,ih*${anim.scale})':eval=frame:flags=bicubic`));
  const v = g.label("v");
  // blur: a blurred copy on top of the sharp one, each with its own fades
  let vb: string | null = null;
  if (anim?.blur) {
    const [s1, s2] = [g.label("bs"), g.label("bb")];
    vb = g.label("vb");
    g.add(`${head}${[...chain, "split"].join(",")}[${s1}][${s2}]`);
    g.add(`[${s1}]${[...anim.fades, `setpts=PTS-STARTPTS+${f3(start)}/TB`].join(",")}[${v}]`);
    g.add(`[${s2}]gblur=sigma=${n4(anim.blur.sigma)},${[...anim.blur.fades, `setpts=PTS-STARTPTS+${f3(start)}/TB`].join(",")}[${vb}]`);
  } else {
    if (anim) chain.push(...anim.fades);
    chain.push(`setpts=PTS-STARTPTS+${f3(start)}/TB`);
    g.add(`${head}${chain.join(",")}[${v}]`);
  }
  // turned pictures are bigger than their rectangle: place them by their middle
  const byMiddle = (!!rotation && !warped) || trTurn || !!tr?.scale || (!!anim?.scale && c.type !== "text");
  // (a warped picture comes in its own frame, centred on its middle)
  const midX = warped ? warped.ox + warped.fw / 2 : r.x + r.w / 2;
  const midY = warped ? warped.oy + warped.fh / 2 : r.y + r.h / 2;
  let bx = byMiddle ? `${n4(midX)}-overlay_w/2` : String(warped ? warped.ox : Math.round(r.x));
  let by = byMiddle ? `${n4(midY)}-overlay_h/2` : String(warped ? warped.oy : Math.round(r.y));
  if (!am && anim?.scale && c.type === "text") {
    // a text growing in: around its anchor (where it is on the canvas)
    const a = textAnchor(c.style.preset, W, H);
    const qx = a.x + t.x * W;
    const qy = a.y + t.y * H;
    bx = `${n4(qx)}-${n4(qx / W)}*overlay_w`;
    by = `${n4(qy)}-${n4(qy / H)}*overlay_h`;
  }
  if (am) {
    // moving: its middle follows the keyframes (text: its anchor, scaled from the picture's own size)
    const tau = `(t-${f3(start)})`;
    if (c.type === "text") {
      const a = textAnchor(c.style.preset, W, H);
      bx = `${n4(a.x)}+${motionExpr(am.keys, "x", tau, W)}-${n4(a.x / W)}*overlay_w`;
      by = `${n4(a.y)}+${motionExpr(am.keys, "y", tau, H)}-${n4(a.y / H)}*overlay_h`;
    } else {
      // its middle over time (around its pivot when it has one: lib/player/quad pivotCenter)
      const cm = centerExprs(am, lm?.transform.pivot, tau, W, H);
      bx = `${cm.x}-overlay_w/2`;
      by = `${cm.y}-overlay_h/2`;
    }
  }
  const mx = `${anim?.x ?? ""}${tr?.x ?? ""}`;
  const my = `${anim?.y ?? ""}${tr?.y ?? ""}`;
  const moved = byMiddle || !!am || (!!anim?.scale && c.type === "text");
  const x = mx || moved ? `'${bx}${mx}'` : bx;
  const y = my || moved ? `'${by}${my}'` : by;
  const next = g.label("o");
  const from = tr?.showFrom ?? start;
  const enable = `enable='between(t\\,${f3(from)}\\,${f3(start + len)})'`;
  if (bl && bl.mode !== "normal") {
    // a blend mode: the layer (and its blurred copy) on a see-through canvas, then mixed with the composite
    const [base, lc] = [g.label("lb"), g.label("lc")];
    g.add(`color=c=black@0:s=${W}x${H}:r=${bl.F}:d=${f3(bl.total)},format=rgba[${base}]`);
    g.add(`[${base}][${v}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:${enable}[${lc}]`);
    let layer = lc;
    if (vb) {
      const lv = g.label("lc");
      g.add(`[${lc}][${vb}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:${enable}[${lv}]`);
      layer = lv;
    }
    return blendOnto(g, comp, layer, bl.mode, bl.transparent, enable);
  }
  g.add(`[${comp}][${v}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:${enable}[${next}]`);
  if (!vb) return next;
  const last = g.label("o");
  g.add(`[${next}][${vb}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:${enable}[${last}]`);
  return last;
}

/** FFmpeg `perspective` corners (top-left, top-right, bottom-left, bottom-right) from lib/player/quad warpPlan. */
const perspectiveArgs = (refs: number[]) => ["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3"].map((k, i) => `${k}=${n4(refs[i])}`).join(":");

/**
 * A moving clip that's stretched, skewed or pinned (checked on FFmpeg 9.0.1: within about 1 px of the
 * preview): its corner pin at the work size (a pin in shares of the box goes with any size), then its
 * size each frame per axis, then a fixed square with the box's middle in its middle, then one
 * perspective warp per frame with the skew and the turn of that moment. Premultiplied throughout.
 */
function warpMotion(am: NonNullable<LayerMotion["anim"]>, t: Transform, w: number, h: number, F: number): string[] {
  const out: string[] = ["format=gbrap", "premultiply=inplace=1"];
  let f0w = w;
  let f0h = h;
  let c0x = w / 2;
  let c0y = h / 2;
  if (hasCorners(t.corners)) {
    const q = localQuad(w, h, t.corners).map((p) => ({ x: p.x + w / 2, y: p.y + h / 2 })) as Parameters<typeof warpPlan>[2];
    const plan = warpPlan(w, h, q, { x: w / 2, y: h / 2 });
    if (plan) {
      out.push(`pad=${plan.fw}:${plan.fh}:${plan.padX}:${plan.padY}:color=black@0`, `perspective=${perspectiveArgs(plan.refs)}:sense=destination:interpolation=linear`);
      f0w = plan.fw;
      f0h = plan.fh;
      c0x = w / 2 - plan.ox;
      c0y = h / 2 - plan.oy;
    }
  }
  const k = am.keys;
  // its size at each moment, per axis (never bigger than the work picture)
  const kx = `(${motionExpr(k, "scale", "t")})*(${motionExpr(k, "scaleX", "t")})/${n4(am.sRef * (am.sxRef ?? 1))}`;
  const ky = `(${motionExpr(k, "scale", "t")})*(${motionExpr(k, "scaleY", "t")})/${n4(am.sRef * (am.syRef ?? 1))}`;
  out.push(`scale=w='max(2\\,${f0w}*${kx})':h='max(2\\,${f0h}*${ky})':eval=frame:flags=bicubic`);
  // a square big enough for any turn and skew, the box's middle in its middle
  const sp = am.span;
  const maxTan = Math.max(...[sp.min.skewX, sp.max.skewX, sp.min.skewY, sp.max.skewY].map((d) => Math.abs(Math.tan((d * Math.PI) / 180))));
  const reach = Math.max(...[[0, 0], [f0w, 0], [0, f0h], [f0w, f0h]].map(([x, y]) => Math.hypot(x - c0x, y - c0y)));
  const D = Math.min(4096, even(Math.ceil(2 * (1 + maxTan) * reach) + 6));
  out.push(`pad=w=${D}:h=${D}:x='trunc(${n4(D / 2)}-${n4(c0x / f0w)}*iw+0.5)':y='trunc(${n4(D / 2)}-${n4(c0y / f0h)}*ih+0.5)':color=black@0:eval=frame`);
  // the skew and turn of this moment (perspective knows the frame number, from 1: τ = (in − 1) / F)
  const tau = `((in-1)/${F})`;
  const set = `st(0\\,(${motionExpr(k, "rotation", tau)})*0.0174533);st(1\\,tan((${motionExpr(k, "skewX", tau)})*0.0174533));st(2\\,tan((${motionExpr(k, "skewY", tau)})*0.0174533));`;
  const c = D / 2 - 0.5;
  const pts = [
    [0, 0],
    [D, 0],
    [0, D],
    [D, D],
  ].map(([x, y]) => [x - c, y - c]);
  const args = pts
    .map(([dx, dy], i) => {
      const ex = `${set}${n4(c)}+(cos(ld(0))-sin(ld(0))*ld(2))*(${n4(dx)})+(cos(ld(0))*ld(1)-sin(ld(0)))*(${n4(dy)})`;
      const ey = `${set}${n4(c)}+(sin(ld(0))+cos(ld(0))*ld(2))*(${n4(dx)})+(sin(ld(0))*ld(1)+cos(ld(0)))*(${n4(dy)})`;
      return `x${i}='${ex}':y${i}='${ey}'`;
    })
    .join(":");
  out.push(`perspective=${args}:sense=destination:interpolation=linear:eval=frame`, "unpremultiply=inplace=1", "format=rgba");
  return out;
}

/**
 * A moving clip's middle on the canvas over time (overlay x / y): where its keyframes put it, and
 * (with a pivot) moved so the pivot stays put while it turns, sizes and skews: C' = C + v − A·S·v.
 */
function centerExprs(am: NonNullable<LayerMotion["anim"]>, pivot: { x: number; y: number } | undefined, tau: string, W: number, H: number): { x: string; y: string } {
  const X = motionExpr(am.keys, "x", tau, W, W / 2);
  const Y = motionExpr(am.keys, "y", tau, H, H / 2);
  if (!pivot || (Math.abs(pivot.x - 0.5) < 1e-9 && Math.abs(pivot.y - 0.5) < 1e-9)) return { x: X, y: Y };
  const vx = (pivot.x - 0.5) * am.unitW;
  const vy = (pivot.y - 0.5) * am.unitH;
  const k = am.keys;
  const th = `((${motionExpr(k, "rotation", tau)})*0.0174533)`;
  const tx = `tan((${motionExpr(k, "skewX", tau)})*0.0174533)`;
  const ty = `tan((${motionExpr(k, "skewY", tau)})*0.0174533)`;
  const sc = `(${motionExpr(k, "scale", tau)})`;
  const ux = `(${n4(vx)}*${sc}*(${motionExpr(k, "scaleX", tau)}))`;
  const uy = `(${n4(vy)}*${sc}*(${motionExpr(k, "scaleY", tau)}))`;
  const ax = `((cos(${th})-sin(${th})*${ty})*${ux}+(cos(${th})*${tx}-sin(${th}))*${uy})`;
  const ay = `((sin(${th})+cos(${th})*${ty})*${ux}+(sin(${th})*${tx}+cos(${th}))*${uy})`;
  return { x: `${X}+${n4(vx)}-${ax}`, y: `${Y}+${n4(vy)}-${ay}` };
}
