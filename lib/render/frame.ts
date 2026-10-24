import { clipLength, docDuration, layersAt, mainStarts, mainTrack, watermarkPad, watermarkRect, type AnyClip, type BlankClip, type ElementClip, type ImageClip, type MediaLite, type TextClip, type TimelineDoc, type VideoClip } from "../edit/doc";
import { hasKeys, motionAt, motionSpan, textRenderTransform, transformAt, type MotionClip } from "../edit/keyframes";
import { hexToRgb, LiveKeyRenderer, type LiveKeyParams } from "../editor/liveKey";
import { animState, BLUR, typedCount } from "../player/anim";
import { GlLook } from "../player/glLook";
import { drawWarpMesh, GlWarp } from "../player/glWarp";
import { cropViewRect, fadeAlpha, motionRect, placeRect, workScale, type Rect } from "../player/layout";
import { drawLogoBadge, logoState } from "../player/logo";
import { colorMatrix, cropRect, isIdentity, maskRadius, rotationOf, vignetteOf } from "../player/look";
import { fillFromBorder, patchRect } from "../player/patches";
import { boxQuad, hasCorners, quadOk } from "../player/quad";
import { docTransitionsAt, type LayerState, type Reveal } from "../player/transitions";
import { drawBackdrop } from "../backdrops";
import { drawElement, movesByItself } from "../elements/draw";
import { elementRect } from "../elements/geometry";
import { textAnchor } from "../text/layout";
import { captionProgress, drawText, letterCount, textBox, textLayout } from "../text/render";
import { evaluateAttachmentTransform, findTrackingAttachmentForClip } from "../tracking/attach";
import { trackingAt, type BlurAttachment, type TrackingPoint } from "../tracking/types";
import { compositeOp } from "./blend";

/**
 * One frame of the timeline, drawn with the browser's canvas. The program
 * preview draws it every frame, and the browser export draws every frame of
 * the file with it, so the file moves exactly like the preview: entrance and
 * exit animations, transitions, keyframes, looks, keys, masks, text effects,
 * elements, blend modes, motion-tracked blurs and the logo.
 *
 * The caller gets the pictures ready (FrameSources: a video element at the
 * right time, loaded pictures); this module only draws them. Sizes: the canvas
 * is the project canvas at any scale (the preview is smaller, the export is
 * the full size); layouts are in project pixels and scaled to it.
 */

/** A video clip's picture: a <video> at the right time, or a canvas holding a decoded frame (the export, lib/export/clipDecoder). */
export type VideoPicture = HTMLVideoElement | HTMLCanvasElement;

/** The size of a video clip's picture. */
export function picSize(el: VideoPicture): { w: number; h: number } {
  return "videoWidth" in el ? { w: el.videoWidth, h: el.videoHeight } : { w: el.width, h: el.height };
}

/** The decoded pictures one frame needs. */
export type FrameSources = {
  media: Record<string, MediaLite>;
  /** A video clip's element showing the frame to draw (null: not drawn this frame). `packed`: it plays the AI preview (picture over mask). */
  video: (c: VideoClip) => { el: VideoPicture; packed: boolean } | null;
  /** A stand-in while a video clip has no frame yet, `into` seconds into it (the preview: the picture taken at import). */
  standIn?: (c: VideoClip, into: number) => HTMLImageElement | null;
  /** A loaded picture (picture clips, a picture backdrop, the logo, pictures that cover a watermark), or null. */
  image: (mediaId: string) => HTMLImageElement | null;
  /** The backdrop video's element with a frame to show (Replace Background with a video), or null. */
  backdropVideo?: (mediaId: string) => HTMLVideoElement | null;
  /** Live key settings of a video clip (background removal), or null. */
  live: (c: VideoClip) => LiveKeyParams | null;
  /** "Blur background" strength of an AI Removal clip (source pixels), or null. */
  blur?: (c: VideoClip) => number | null;
};

/** What only the editor draws differently. */
export type FrameOptions = {
  /** Crop mode: this clip shows whole and still (the crop box moves over it). */
  cropId?: string | null;
  /** Motion tracking being edited: the selected clip's points, whether the panel is open, a point being dragged. */
  tracking?: {
    clipId: string | null;
    points?: TrackingPoint[];
    open?: boolean;
    drag?: { pointId: string; x: number; y: number; box?: { w: number; h: number } } | null;
  };
};

/** The GPU helpers and pictures kept between frames (one per canvas that draws frames). */
export type FrameCache = {
  /** made once (false: this browser can't, don't try every frame) */
  look: GlLook | false | null;
  warp: GlWarp | false | null;
  key: LiveKeyRenderer | null;
  keyCanvas: HTMLCanvasElement | null;
  mix: HTMLCanvasElement | null;
  patch: HTMLCanvasElement | null;
  /** small work canvases (a flipped element, a blurred patch) */
  scratch: HTMLCanvasElement | null;
  small: HTMLCanvasElement | null;
  backdrop: { key: string; canvas: HTMLCanvasElement } | null;
  /** each element's picture, drawn again when it changes */
  elements: Map<string, { key: string; canvas: HTMLCanvasElement }>;
  /** blank scenes' colors */
  colors: Map<string, HTMLCanvasElement>;
  /** goes up when a font arrives (elements drawn with the fallback are drawn again) */
  fontGen: number;
  /** which clips follow a tracked point (worked out once per timeline) */
  attached: { doc: TimelineDoc; map: Map<string, NonNullable<ReturnType<typeof findTrackingAttachmentForClip>>> } | null;
};

export function createFrameCache(): FrameCache {
  return { look: null, warp: null, key: null, keyCanvas: null, mix: null, patch: null, scratch: null, small: null, backdrop: null, elements: new Map(), colors: new Map(), fontGen: 0, attached: null };
}

/** Let go of the pictures of elements that were deleted. */
export function pruneFrameCache(cache: FrameCache, doc: TimelineDoc) {
  const ids = new Set<string>();
  for (const t of doc.tracks) for (const c of t.clips) ids.add(c.id);
  for (const id of cache.elements.keys()) if (!ids.has(id)) cache.elements.delete(id);
}

/**
 * A text clip's picture and where it goes: a moving text is drawn once at its
 * biggest, then scaled around its anchor and moved (the server export does the same).
 * Map a point of the drawn text with `ox + k·x`, `oy + k·y`.
 */
export function textPlacement(c: TextClip, into: number, W: number, H: number): { clip: TextClip; k: number; ox: number; oy: number; qx: number; qy: number; opacity: number } {
  const m = motionAt(c, into);
  const rt = textRenderTransform(c);
  const drawn = rt === c.transform ? c : { ...c, transform: rt };
  const a = textAnchor(c.style.preset, W, H);
  // (q: the drawn text's anchor, the point it grows from)
  if (!hasKeys(c) || !motionSpan(c).moving) return { clip: drawn, k: 1, ox: 0, oy: 0, qx: a.x + rt.x * W, qy: a.y + rt.y * H, opacity: m.opacity };
  const k = m.scale / rt.scale;
  return { clip: drawn, k, ox: a.x * (1 - k) + m.x * W, oy: a.y * (1 - k) + m.y * H, qx: a.x, qy: a.y, opacity: m.opacity };
}

/** A blurred copy of the picture (top of a packed AI video) into ctx. Safari has no canvas filters: shrink and grow instead. */
function blurInto(ctx: CanvasRenderingContext2D, el: VideoPicture, w: number, h: number, sigma: number, cache: FrameCache) {
  if (typeof ctx.filter === "string") {
    ctx.save();
    ctx.filter = `blur(${Math.max(1, sigma).toFixed(1)}px)`;
    ctx.drawImage(el, 0, 0, w, h, 0, 0, w, h);
    ctx.restore();
    return;
  }
  const f = Math.max(2, sigma / 1.5);
  cache.small ??= document.createElement("canvas");
  const small = cache.small;
  small.width = Math.max(1, Math.round(w / f));
  small.height = Math.max(1, Math.round(h / f));
  small.getContext("2d")!.drawImage(el, 0, 0, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
}

/** Which clips follow a tracked point, by clip id (the first attachment found, like findTrackingAttachmentForClip). */
function attachments(doc: TimelineDoc, cache: FrameCache) {
  if (cache.attached?.doc === doc) return cache.attached.map;
  const map = new Map<string, NonNullable<ReturnType<typeof findTrackingAttachmentForClip>>>();
  const main = mainTrack(doc);
  const starts = mainStarts(main.clips);
  for (const track of doc.tracks)
    for (const c of track.clips) {
      if (c.type !== "video" || !c.tracking?.points) continue;
      const videoStart = track.kind === "main" ? starts[main.clips.indexOf(c)] : typeof (c as { start?: unknown }).start === "number" ? (c as { start: number }).start : 0;
      for (const point of c.tracking.points)
        for (const att of point.attachments ?? [])
          if (att.type === "clip" && !map.has(att.clipId)) map.set(att.clipId, { point, attachment: att, videoClip: c, videoStart });
    }
  cache.attached = { doc, map };
  return map;
}

/** Clip ctx to the part of rect r a transition reveals (a wipe from one side, or a circle). */
function clipReveal(ctx: CanvasRenderingContext2D, rv: Reveal, r: Rect) {
  ctx.beginPath();
  const e = rv.p;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.hypot(r.w, r.h) / 2;
  if (rv.kind === "wipeLeft") ctx.rect(r.x + r.w * (1 - e), r.y, r.w * e, r.h);
  else if (rv.kind === "wipeRight") ctx.rect(r.x, r.y, r.w * e, r.h);
  else if (rv.kind === "wipeUp") ctx.rect(r.x, r.y + r.h * (1 - e), r.w, r.h * e);
  else if (rv.kind === "wipeDown") ctx.rect(r.x, r.y, r.w, r.h * e);
  else if (rv.kind === "circleOpen") ctx.arc(cx, cy, R * e, 0, Math.PI * 2);
  else {
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.arc(cx, cy, R * (1 - e), 0, Math.PI * 2);
  }
  ctx.clip(rv.kind === "circleClose" ? "evenodd" : "nonzero");
}

/** The shader's shape number of a mask (lib/player/glLook): none, rounded, circle, diamond, star. */
const maskShapeId = (shape: string): 0 | 1 | 2 | 3 | 4 => (shape === "circle" ? 2 : shape === "rounded" ? 1 : shape === "diamond" ? 3 : shape === "star" || shape === "custom" ? 4 : 0);

/**
 * Draw the timeline at time t onto ctx (its canvas is the project canvas at any size).
 * Returns aiPending: an AI Removal clip whose preview video isn't ready yet showed as it is.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, d: TimelineDoc, t: number, src: FrameSources, cache: FrameCache, opts: FrameOptions = {}): { aiPending: boolean } {
  const cv = ctx.canvas as HTMLCanvasElement;
  const CW = cv.width;
  const CH = cv.height;
  const layers = layersAt(d, t);
  const main = mainTrack(d);
  const cropId = opts.cropId ?? null;
  let aiPending = false;
  const k = CW / d.canvas.width;

  /**
   * One picture (w × h of a texture texW × texH) at rect r: crop, flip, color and shape on the GPU
   * (lib/player/glLook), then turned around its middle — the same order and numbers as the server export.
   */
  const drawPicture = (source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, w: number, h: number, texW: number, texH: number, c: VideoClip | ImageClip | ElementClip | BlankClip, r: Rect, mo?: { rot: number; into: number }) => {
    if (c.type === "blank") {
      // a blank scene: its color over the frame (a transition may turn or move it)
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      if (mo?.rot) ctx.rotate((mo.rot * Math.PI) / 180);
      ctx.drawImage(source, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
      return;
    }
    if (c.type === "element") {
      // an element: its drawn picture, turned around its middle and flipped (like the export)
      const rot = mo ? mo.rot : (c.transform.rotation ?? 0);
      const skewX = c.transform.skewX ?? 0;
      const skewY = c.transform.skewY ?? 0;
      if (hasCorners(c.transform.corners)) {
        const quad = boxQuad({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }, { rotation: rot, skewX, skewY, corners: c.transform.corners });
        if (quadOk(quad)) {
          if (cache.warp === null) cache.warp = GlWarp.create() ?? false;
          const warper = cache.warp || null;
          let flat: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement = source;
          if (c.transform.flipX || c.transform.flipY) {
            cache.scratch ??= document.createElement("canvas");
            const fc = cache.scratch;
            fc.width = w;
            fc.height = h;
            const fx = fc.getContext("2d");
            if (fx) {
              fx.clearRect(0, 0, w, h);
              fx.translate(w / 2, h / 2);
              fx.scale(c.transform.flipX ? -1 : 1, c.transform.flipY ? -1 : 1);
              fx.drawImage(source, -w / 2, -h / 2, w, h);
              fx.setTransform(1, 0, 0, 1, 0, 0);
              flat = fc;
            }
          }
          const at = warper?.render(flat, w, h, 0, 0, w, h, quad);
          if (warper && at) {
            ctx.drawImage(warper.canvas, at.x, at.y);
            return;
          }
          drawWarpMesh(ctx, flat, 0, 0, w, h, quad);
          return;
        }
      }
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      if (skewX || skewY) ctx.transform(1, Math.tan((skewY * Math.PI) / 180), Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
      if (c.transform.flipX || c.transform.flipY) ctx.scale(c.transform.flipX ? -1 : 1, c.transform.flipY ? -1 : 1);
      ctx.drawImage(source, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
      return;
    }
    // watermark / logo boxes: on the source picture first (lib/player/patches, like the export)
    if (c.patches?.length) {
      cache.patch ??= document.createElement("canvas");
      const pc = cache.patch;
      if (pc.width !== w || pc.height !== h) {
        pc.width = w;
        pc.height = h;
      }
      const px = pc.getContext("2d", { willReadFrequently: true })!;
      px.clearRect(0, 0, w, h);
      px.drawImage(source, 0, 0, w, h, 0, 0, w, h);
      for (const patch of c.patches) {
        const pr = patchRect(patch, w, h);
        if (patch.mode === "remove") {
          const img = px.getImageData(pr.x - 1, pr.y - 1, pr.w + 2, pr.h + 2);
          fillFromBorder(img.data, pr.w + 2, { x: 1, y: 1, w: pr.w, h: pr.h });
          px.putImageData(img, pr.x - 1, pr.y - 1);
        } else if (patch.mode === "blur") {
          const f = Math.max(2, (patch.strength ?? 12) / 1.5);
          cache.small ??= document.createElement("canvas");
          const small = cache.small;
          small.width = Math.max(1, Math.round(pr.w / f));
          small.height = Math.max(1, Math.round(pr.h / f));
          small.getContext("2d")!.drawImage(pc, pr.x, pr.y, pr.w, pr.h, 0, 0, small.width, small.height);
          px.imageSmoothingEnabled = true;
          px.drawImage(small, 0, 0, small.width, small.height, pr.x, pr.y, pr.w, pr.h);
        } else {
          const pic = patch.mediaId ? src.image(patch.mediaId) : null;
          if (pic) {
            const k2 = Math.min(pr.w / pic.naturalWidth, pr.h / pic.naturalHeight);
            const dw = pic.naturalWidth * k2;
            const dh = pic.naturalHeight * k2;
            px.drawImage(pic, pr.x + (pr.w - dw) / 2, pr.y + (pr.h - dh) / 2, dw, dh);
          } else {
            px.fillStyle = patch.color ?? "#000000";
            px.fillRect(pr.x, pr.y, pr.w, pr.h);
          }
        }
      }
      source = pc;
      texW = w;
      texH = h;
    }
    // crop mode: the whole picture, standing still (the crop box moves over it)
    const editing = cropId === c.id;
    const keyed = hasKeys(c) && !!mo;
    const at = keyed ? transformAt(c, mo!.into) : c.transform;
    const tr = editing ? { ...at, crop: undefined } : c.transform;
    if (editing) r = cropViewRect(w, h, CW, CH, at);
    const crop = cropRect(w, h, tr);
    const matrix = colorMatrix(c.color);
    const mask = c.mask && (c.mask.shape !== "rect" || c.mask.border?.width) ? c.mask : null;
    const rot = editing ? rotationOf(tr) : mo ? mo.rot : rotationOf(tr);
    // a moving clip's shape is made at its biggest size and scaled (so its soft edge shrinks with it, like the export)
    let work: { w: number; h: number } | null = null;
    if (mask && keyed && !editing) {
      const span = motionSpan(c);
      if (span.moving) {
        const unit = placeRect(w, h, CW, CH, { ...c.transform, x: 0, y: 0, scale: 1 });
        const s = workScale(unit.w, unit.h, span.max.scale, CW, CH);
        work = { w: unit.w * s, h: unit.h * s };
      }
    }
    const vig = vignetteOf(c.color);
    // the VFX sliders (Effects): glow, film grain, soft blur, pixelate
    const vfx = { glow: c.color?.glow ?? 0, grain: c.color?.grain ?? 0, blur: c.color?.blur ?? 0, pixelate: c.color?.pixelate ?? 0 };
    const anyVfx = vfx.glow > 0 || vfx.grain > 0 || vfx.blur > 0 || vfx.pixelate > 0;
    const fancy = !isIdentity(matrix) || !!mask || !!tr.flipX || !!tr.flipY || vig > 0 || anyVfx;
    const lookPass = () => {
      if (cache.look === null) cache.look = GlLook.create() ?? false;
      const gl = cache.look || null;
      const outW = work?.w ?? r.w;
      const outH = work?.h ?? r.h;
      const ok =
        !!gl &&
        gl.render(source, texW, texH, {
          crop,
          flipX: !!tr.flipX,
          flipY: !!tr.flipY,
          matrix,
          outW,
          outH,
          vignette: vig,
          ...vfx,
          // (grain changes every frame, like film)
          seed: Math.round((mo?.into ?? 0) * d.canvas.fps),
          mask: mask ? { shape: maskShapeId(mask.shape), radius: maskRadius(mask, outW, outH), feather: mask.feather * k, border: mask.border?.width ? { rgb: hexToRgb(mask.border.color).map((v) => v / 255) as [number, number, number], width: mask.border.width * k } : null } : null,
        });
      return ok && gl ? gl : null;
    };
    if (hasCorners(tr.corners)) {
      const quad = boxQuad({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h }, { rotation: rot, skewX: tr.skewX, skewY: tr.skewY, corners: tr.corners });
      if (quadOk(quad)) {
        if (cache.warp === null) cache.warp = GlWarp.create() ?? false;
        const warper = cache.warp || null;
        let warpSrc: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement = source;
        let [wsx, wsy, wsw, wsh, wtw, wth] = [crop.sx, crop.sy, crop.sw, crop.sh, texW, texH];
        if (fancy) {
          const gl = lookPass();
          if (gl) {
            warpSrc = gl.canvas;
            [wtw, wth, wsx, wsy, wsw, wsh] = [gl.canvas.width, gl.canvas.height, 0, 0, gl.canvas.width, gl.canvas.height];
          }
        }
        const at = warper?.render(warpSrc, wtw, wth, wsx, wsy, wsw, wsh, quad);
        if (warper && at) {
          ctx.drawImage(warper.canvas, at.x, at.y);
          return;
        }
        drawWarpMesh(ctx, warpSrc, wsx, wsy, wsw, wsh, quad);
        return;
      }
    }
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    if (tr.skewX || tr.skewY) ctx.transform(1, Math.tan(((tr.skewY ?? 0) * Math.PI) / 180), Math.tan(((tr.skewX ?? 0) * Math.PI) / 180), 1, 0, 0);
    const gl = fancy ? lookPass() : null;
    if (gl) ctx.drawImage(gl.canvas, -r.w / 2, -r.h / 2, r.w, r.h);
    else ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, -r.w / 2, -r.h / 2, r.w, r.h);
    ctx.restore();
  };

  /** A blank scene's color, as a tiny picture (drawn over the whole frame, so transitions work on it too). */
  const colorPic = (fill: string) => {
    let e = cache.colors.get(fill);
    if (!e) {
      e = document.createElement("canvas");
      e.width = e.height = 4;
      const x = e.getContext("2d");
      if (x) {
        x.fillStyle = fill;
        x.fillRect(0, 0, 4, 4);
      }
      cache.colors.set(fill, e);
    }
    return e;
  };

  /** An element's picture at w × h (cached; a progress bar or ticker changes every frame). */
  const elementPic = (c: ElementClip, w: number, h: number, into: number, len: number) => {
    const pw = Math.max(1, Math.round(w));
    const ph = Math.max(1, Math.round(h));
    const key = `${JSON.stringify(c.el)}|${pw}x${ph}|${cache.fontGen}${movesByItself(c.el) ? `|${into.toFixed(3)}|${len}` : ""}`;
    let e = cache.elements.get(c.id);
    if (!e) {
      e = { key: "", canvas: document.createElement("canvas") };
      cache.elements.set(c.id, e);
    }
    if (e.key !== key) {
      const pc = e.canvas;
      if (pc.width !== pw || pc.height !== ph) {
        pc.width = pw;
        pc.height = ph;
      }
      const px = pc.getContext("2d");
      if (!px) return null;
      px.clearRect(0, 0, pw, ph);
      drawElement(px, c.el, pw, ph, { into, len });
      e.key = key;
    }
    return e.canvas;
  };

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, CW, CH);
  if (d.canvas.background !== "transparent") {
    ctx.fillStyle = d.canvas.background;
    ctx.fillRect(0, 0, CW, CH);
  }
  // the backdrop (Replace Background): a picture / looping video filling the canvas, or a drawn studio set / gradient
  const bd = d.canvas.backdrop;
  if (bd?.kind === "media") {
    const m = src.media[bd.mediaId];
    let pic: HTMLImageElement | HTMLVideoElement | null = null;
    let sw = 0;
    let sh = 0;
    if (m?.kind === "image") {
      const img = src.image(bd.mediaId);
      if (img) [pic, sw, sh] = [img, img.naturalWidth, img.naturalHeight];
    } else if (m?.kind === "video") {
      const v = src.backdropVideo?.(bd.mediaId) ?? null;
      if (v) [pic, sw, sh] = [v, v.videoWidth, v.videoHeight];
    }
    if (pic && sw && sh) {
      const kb = Math.max(CW / sw, CH / sh);
      ctx.drawImage(pic, (CW - sw * kb) / 2, (CH - sh * kb) / 2, sw * kb, sh * kb);
    }
  } else if (bd) {
    const key = `${JSON.stringify(bd)}|${CW}x${CH}`;
    if (cache.backdrop?.key !== key) {
      const c = document.createElement("canvas");
      c.width = CW;
      c.height = CH;
      const x = c.getContext("2d");
      if (x) drawBackdrop(x, bd, CW, CH);
      cache.backdrop = { key, canvas: c };
    }
    ctx.drawImage(cache.backdrop.canvas, 0, 0);
  }

  // transitions on all tracks (lib/player/transitions, the same curves as the server export)
  const mainIdx = d.tracks.indexOf(main);
  const mt = docTransitionsAt(d, t);
  let dipDone = false;
  const drawDip = () => {
    if (dipDone) return;
    dipDone = true;
    if (!mt.dip || mt.dip.alpha <= 0) return;
    ctx.globalAlpha = mt.dip.alpha;
    ctx.fillStyle = mt.dip.color;
    ctx.fillRect(0, 0, CW, CH);
    ctx.globalAlpha = 1;
  };
  const attached = attachments(d, cache);

  const drawLayer = (c: AnyClip, start: number) => {
    const into = Math.max(0, t - start);
    const len = clipLength(c);
    // (a typewriter counts the letters)
    const typing = c.type === "text" && (c.anim.in === "typewriter" || c.anim.out === "typewriter");
    const an = "anim" in c ? animState(into, len, c.anim, typing ? letterCount(textPlacement(c as TextClip, into, d.canvas.width, d.canvas.height).clip, d.canvas.width, d.canvas.height) : 0) : null;
    const ts: LayerState | undefined = mt.states.get(c.id);
    // (keyframes / opacity multiply in: motionAt)
    const mop = c.type === "audio" || c.type === "blank" ? 1 : motionAt(c as MotionClip, into).opacity;
    const editing = cropId === c.id;
    const base = editing ? 1 : ("fadeIn" in c ? fadeAlpha(into, len, c.fadeIn, c.fadeOut) : 1) * (ts?.alpha ?? 1) * mop;
    ctx.globalAlpha = editing ? 1 : base * (an?.alpha ?? 1);
    // blur (in / out): a blurred copy over the sharp one, like the export (BLUR × the height)
    const blurA = editing ? 0 : base * (an?.blur ?? 0);
    const blurPx = BLUR * CH;
    const tx = (ts?.dx ?? 0) * CW;
    const ty = (ts?.dy ?? 0) * CH;
    // a transition into it: a size, a turn (around its middle) and a reveal (lib/player/transitions)
    const draw = (pic: Parameters<typeof drawPicture>[0], w: number, h: number, texW: number, texH: number, clip: Parameters<typeof drawPicture>[5], r: Rect, mo: { rot: number; into: number }) => {
      // (and its pop / zoom: around its middle)
      const s = (ts?.scale ?? 1) * (editing ? 1 : (an?.scale ?? 1));
      const rr = s === 1 ? r : { x: r.x + (r.w * (1 - s)) / 2, y: r.y + (r.h * (1 - s)) / 2, w: r.w * s, h: r.h * s };
      const rv = ts?.reveal;
      if (rv) {
        ctx.save();
        clipReveal(ctx, rv, r);
      }
      drawPicture(pic, w, h, texW, texH, clip, rr, { ...mo, rot: mo.rot + (ts?.rot ?? 0) });
      if (blurA > 0.001) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = blurA;
        ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
        drawPicture(pic, w, h, texW, texH, clip, rr, { ...mo, rot: mo.rot + (ts?.rot ?? 0) });
        ctx.filter = "none";
        ctx.globalAlpha = a0;
      }
      if (rv) ctx.restore();
    };
    // a clip that follows a tracked point moves with it
    const att = attached.get(c.id);
    let clip = c;
    if (att && "transform" in c) {
      const videoT = Math.max(0, (t - att.videoStart) * (att.videoClip.speed ?? 1));
      clip = { ...c, transform: evaluateAttachmentTransform(att.point, att.attachment, c as MotionClip, videoT) } as AnyClip;
    }

    if (clip.type === "text") {
      // drawn in project pixels (like the server export's picture), scaled to this canvas
      const PW = d.canvas.width;
      const PH = d.canvas.height;
      const tp = textPlacement(clip, into, PW, PH);
      const sx = CW / PW;
      const sy = CH / PH;
      // pop / zoom: around its anchor too (like the export)
      const kk = tp.k * (an?.scale ?? 1);
      const ox = tp.ox + tp.qx * (tp.k - kk);
      const oy = tp.oy + tp.qy * (tp.k - kk);
      const upTo = typing && an ? typedCount(an.typed, letterCount(tp.clip, PW, PH)) : Infinity;
      // word-by-word captions: how far through the caption we are (the highlighted word follows it)
      const said = captionProgress(tp.clip, into, len);
      const ex = sx * ox + (an?.dx ?? 0) * CW;
      const ey = sy * oy + (an?.dy ?? 0) * CH;
      ctx.save();
      if (ts && (ts.reveal || tx || ty || (ts.scale ?? 1) !== 1 || ts.rot)) {
        // a transition on a text: its own box moves, turns, grows and is revealed (like a picture)
        const lay = textLayout(tp.clip, PW, PH);
        const b = lay ? textBox(tp.clip, lay, PW, PH) : { x: 0, y: 0, w: PW, h: PH };
        const r = { x: ex + sx * kk * b.x, y: ey + sy * kk * b.y, w: sx * kk * b.w, h: sy * kk * b.h };
        if (ts.reveal) clipReveal(ctx, ts.reveal, r);
        ctx.translate(tx, ty);
        const s = ts.scale ?? 1;
        if (s !== 1 || ts.rot) {
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          ctx.translate(cx, cy);
          if (ts.rot) ctx.rotate((ts.rot * Math.PI) / 180);
          ctx.scale(s, s);
          ctx.translate(-cx, -cy);
        }
      }
      ctx.transform(sx * kk, 0, 0, sy * kk, ex, ey);
      drawText(ctx, tp.clip, PW, PH, upTo, said);
      if (blurA > 0.001) {
        ctx.globalAlpha = blurA;
        // (blur in project pixels: the context is scaled)
        ctx.filter = `blur(${(blurPx / Math.max(1e-6, sy * kk)).toFixed(1)}px)`;
        drawText(ctx, tp.clip, PW, PH, upTo, said);
        ctx.filter = "none";
      }
      ctx.restore();
    } else if (clip.type === "blank") {
      if (clip.backdrop) {
        ctx.save();
        drawBackdrop(ctx, clip.backdrop, CW, CH, into);
        ctx.restore();
      } else {
        const pic = colorPic(clip.fill);
        draw(pic, pic.width, pic.height, pic.width, pic.height, clip, { x: tx, y: ty, w: CW, h: CH }, { rot: 0, into });
      }
    } else if (clip.type === "element") {
      const r = elementRect(clip, into, CW, CH);
      const pic = elementPic(clip, r.w, r.h, into, len);
      if (!pic) return;
      draw(pic, pic.width, pic.height, pic.width, pic.height, clip, { x: r.x + (an?.dx ?? 0) * CW + tx, y: r.y + (an?.dy ?? 0) * CH + ty, w: r.w, h: r.h }, { rot: r.rot, into });
    } else if (clip.type === "image") {
      const img = src.image(clip.mediaId);
      if (!img) return;
      const r = motionRect(img.naturalWidth, img.naturalHeight, CW, CH, clip, into);
      draw(img, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight, clip, { x: r.x + (an?.dx ?? 0) * CW + tx, y: r.y + (an?.dy ?? 0) * CH + ty, w: r.w, h: r.h }, { rot: r.rot, into });
    } else if (clip.type === "video") {
      const v = src.video(clip);
      if (!v) {
        const pic = src.standIn?.(clip, into) ?? null;
        if (pic) {
          const m = src.media[clip.mediaId];
          const r = motionRect(m?.width || pic.naturalWidth, m?.height || pic.naturalHeight, CW, CH, clip, into);
          draw(pic, pic.naturalWidth, pic.naturalHeight, pic.naturalWidth, pic.naturalHeight, clip, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h }, { rot: r.rot, into });
        }
        return;
      }
      const { el, packed } = v;
      const size = picSize(el);
      const vw = size.w;
      const vh = packed ? size.h / 2 : size.h;
      const r = motionRect(vw, vh, CW, CH, clip, into);
      const mo = { rot: r.rot, into };
      let live = src.live(clip);
      // AI Removal whose preview video isn't ready: show the clip as it is (never the wrong half)
      if (live?.method === "packed" && !packed) {
        live = null;
        aiPending = true;
      }
      if (live || packed) {
        cache.keyCanvas ??= document.createElement("canvas");
        cache.key ??= LiveKeyRenderer.create(cache.keyCanvas);
        if (cache.key && cache.key.render(el, packed ? { ...(live ?? ({} as LiveKeyParams)), method: "packed" } : live!, "result")) {
          let keyed: HTMLCanvasElement = cache.keyCanvas;
          // Blur background: the cut-out subject over a blurred copy of the picture (like the export's aiMatte)
          const blur = packed ? (src.blur?.(clip) ?? null) : null;
          if (blur) {
            cache.mix ??= document.createElement("canvas");
            const mc = cache.mix;
            if (mc.width !== vw || mc.height !== vh) {
              mc.width = vw;
              mc.height = vh;
            }
            const mx = mc.getContext("2d")!;
            mx.clearRect(0, 0, vw, vh);
            blurInto(mx, el, vw, vh, blur, cache);
            mx.drawImage(keyed, 0, 0, vw, vh);
            keyed = mc;
          }
          draw(keyed, vw, vh, vw, vh, clip, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h }, mo);
          return;
        }
      }
      draw(el, vw, vh, size.w, size.h, clip, { x: r.x + tx, y: r.y + ty, w: r.w, h: r.h }, mo);
    }
  };

  for (const l of layers) {
    const c = l.clip;
    if (l.trackIndex !== mainIdx) drawDip();
    // a blend mode on an overlay-track layer (Video 1 is the base): mixed with what's behind it (lib/render/blend)
    const blend = l.trackIndex !== mainIdx && "blend" in c && c.blend && c.blend !== "normal" ? compositeOp(c.blend) : null;
    if (blend) ctx.globalCompositeOperation = blend;
    try {
      drawLayer(c, l.start);
    } finally {
      if (blend) ctx.globalCompositeOperation = "source-over";
    }
  }
  drawDip();
  ctx.globalAlpha = 1;

  // tracked blur / pixelate boxes over the picture
  const mStarts = mainStarts(main.clips);
  const tk = opts.tracking;
  for (const tr of d.tracks) {
    if (tr.kind !== "main" && tr.kind !== "overlay") continue;
    tr.clips.forEach((c, idx) => {
      if (c.type !== "video") return;
      const pts = tk && c.id === tk.clipId && tk.points ? tk.points : c.tracking?.points;
      if (!pts || !pts.length) return;
      const cStart = tr.kind === "main" ? mStarts[idx] : (c as unknown as { start: number }).start;
      const into = (t - cStart) * (c.speed ?? 1);
      if (into < 0 || into > clipLength(c)) return;
      for (const pt of pts) {
        if (!pt.attachments?.length || (!pt.keyframes?.length && !tk?.open)) continue;
        const kf = trackingAt(pt, into) ?? (tk?.open && !pt.keyframes?.length ? { x: pt.initial.x, y: pt.initial.y, scale: 1, rotation: 0, confidence: 1, box: pt.initial?.box } : null);
        if (!kf) continue;
        for (const att of pt.attachments) {
          if (att.type !== "blur") continue;
          const dp = tk?.drag;
          const dragging = !!(dp && dp.pointId === pt.id);
          const effX = dragging && dp ? dp.x : kf.x;
          const effY = dragging && dp ? dp.y : kf.y;
          const effBox = dragging && dp?.box ? dp.box : kf.box;
          const wNorm = effBox?.w ?? (att as BlurAttachment).size?.w ?? pt.initial?.box?.w ?? 0.14;
          const hNorm = effBox?.h ?? (att as BlurAttachment).size?.h ?? pt.initial?.box?.h ?? 0.14;
          const padX = ((att.padding ?? 0) / 100) * CW * 0.4;
          const padY = ((att.padding ?? 0) / 100) * CH * 0.4;
          const bw = Math.max(16, (wNorm * CW + padX * 2) * (kf.scale ?? 1));
          const bh = Math.max(16, (hNorm * CH + padY * 2) * (kf.scale ?? 1));
          const cx = effX * CW + (att.offset?.x ?? 0) * CW;
          const cy = effY * CH + (att.offset?.y ?? 0) * CH;
          const bx = cx - bw / 2;
          const by = cy - bh / 2;
          ctx.save();
          ctx.beginPath();
          if (att.shape === "ellipse") ctx.ellipse(cx, cy, bw / 2, bh / 2, ((kf.rotation ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
          else ctx.rect(bx, by, bw, bh);
          ctx.clip();
          cache.mix ??= document.createElement("canvas");
          const mc = cache.mix;
          const sx = Math.max(0, Math.min(CW - 2, bx));
          const sy = Math.max(0, Math.min(CH - 2, by));
          const sw = Math.max(2, Math.min(bw, CW - sx));
          const sh = Math.max(2, Math.min(bh, CH - sy));
          if (att.mode === "pixelate") {
            const pixelSize = Math.max(6, Math.round(((att.intensity ?? 20) / 50) * 32));
            const dw = Math.max(1, Math.floor(sw / pixelSize));
            const dh = Math.max(1, Math.floor(sh / pixelSize));
            mc.width = dw;
            mc.height = dh;
            const mx = mc.getContext("2d");
            if (mx) {
              mx.imageSmoothingEnabled = false;
              mx.drawImage(cv, sx, sy, sw, sh, 0, 0, dw, dh);
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(mc, 0, 0, dw, dh, sx, sy, sw, sh);
              ctx.imageSmoothingEnabled = true;
            }
          } else {
            // a smooth blur: shrink, then grow with a filter
            const f = Math.max(4, Math.round(((att.intensity ?? 25) / 50) * 14));
            const dw = Math.max(2, Math.floor(sw / f));
            const dh = Math.max(2, Math.floor(sh / f));
            mc.width = dw;
            mc.height = dh;
            const mx = mc.getContext("2d");
            if (mx) {
              mx.imageSmoothingEnabled = true;
              mx.drawImage(cv, sx, sy, sw, sh, 0, 0, dw, dh);
              ctx.imageSmoothingEnabled = true;
              ctx.filter = `blur(${Math.max(4, Math.round(((att.intensity ?? 25) / 50) * 10))}px)`;
              ctx.drawImage(mc, 0, 0, dw, dh, sx, sy, sw, sh);
              ctx.filter = "none";
            }
          }
          ctx.restore();
        }
      }
    });
  }

  // your logo on top of everything (Brand Kit), like the export
  const wm = d.watermark;
  const logo = wm ? src.image(wm.mediaId) : null;
  if (wm && logo) {
    // (a part of the video, coming in / going out: lib/player/logo; a box and rounded corners: its badge)
    const lr = watermarkRect(wm, CW, CH, logo.naturalWidth, logo.naturalHeight);
    const st = logoState(wm, t, docDuration(d), CW, lr);
    if (st.show) {
      ctx.globalAlpha = wm.opacity * st.alpha;
      const bw = lr.w * st.scale;
      const bh = lr.h * st.scale;
      drawLogoBadge(ctx, logo, logo.naturalWidth, logo.naturalHeight, wm, { x: lr.x + lr.w / 2 + st.dx - bw / 2, y: lr.y + lr.h / 2 - bh / 2, w: bw, h: bh }, watermarkPad(wm, CW) * st.scale);
    }
  }
  ctx.globalAlpha = 1;
  return { aiPending };
}
