import { layersAt, type MediaLite, type TimelineDoc, type VideoClip } from "../edit/doc";
import type { LiveKeyParams } from "../editor/liveKey";
import { createFrameCache, drawFrame, type FrameSources, type VideoPicture } from "../render/frame";
import { makeCanvas, type Picture } from "../render/surface";
import type { ClipDecoders } from "./clipDecoder";
import { EncoderFailure, encoderRoom, flushed, NeedsPage, progressDue, trace } from "./encoding";

/**
 * The export's pictures: every frame drawn like the preview (lib/render/frame) and encoded with WebCodecs.
 * The same code runs on the page and in the export's Worker (lib/export/worker), so both make the same file;
 * only where a frame comes from and where the encoded video goes differ.
 */

/** What drawing a frame needs. */
export type DrawSetup = {
  doc: TimelineDoc;
  media: Record<string, MediaLite>;
  width: number;
  height: number;
  fps: number;
  pictures: Map<string, Picture>;
  live: (c: VideoClip) => LiveKeyParams | null;
  /** MP4 / MOV clips, read in order with WebCodecs. */
  decoders: ClipDecoders;
  /**
   * A clip the decoders can't read (a reversed clip, another kind of file) and the backdrop video: their frame
   * from a <video> on the page. null in a Worker (there is no <video>): the export is made on the page instead.
   */
  seek: ((key: string, mediaId: string, time: number) => Promise<HTMLVideoElement>) | null;
  /** The <video>s still on screen (the rest are given back). */
  keepOnly?: (keys: Set<string>) => void;
};

export type FrameDrawer = { canvas: HTMLCanvasElement; drawAt: (t: number) => Promise<void> };

/** A canvas of the export's size, and how to draw the timeline's frame at `t` on it. */
export function frameDrawer(s: DrawSetup): FrameDrawer {
  const { doc, media, fps: F, decoders } = s;
  const canvas = makeCanvas(s.width, s.height);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("This browser can't draw the video.");
  const cache = createFrameCache();
  const bd = doc.canvas.backdrop;
  const bdVideoId = bd?.kind === "media" && media[bd.mediaId]?.kind === "video" ? bd.mediaId : null;
  const bdDuration = bdVideoId ? media[bdVideoId]?.duration || 0 : 0;
  const seek = (key: string, mediaId: string, time: number) => {
    if (!s.seek) throw new NeedsPage("A video only the page can read.");
    return s.seek(key, mediaId, time);
  };

  /** Seek every video on screen at time t to its frame, then draw the frame. */
  const drawAt = async (t: number) => {
    const shown = new Map<string, VideoPicture>();
    const visible = layersAt(doc, t).filter((l) => l.clip.type === "video");
    await Promise.all(
      visible.map(async (l) => {
        const c = l.clip as VideoClip;
        const off = Math.max(0, t - l.start) + 0.5 / F;
        const sp = c.speed ?? 1;
        // (the middle of the frame, so a seek never lands on the frame before)
        const srcT = c.reversed ? Math.max(c.in, c.out - off * sp) : Math.min(c.out - 1e-3, c.in + off * sp);
        const decoded = c.reversed ? null : await decoders.frame(c.id, c.mediaId, srcT);
        shown.set(c.id, decoded ?? (await seek(c.id, c.mediaId, srcT)));
      }),
    );
    let backdrop: HTMLVideoElement | null = null;
    if (bdVideoId) backdrop = await seek("backdrop", bdVideoId, bdDuration > 0 ? (t + 0.5 / F) % bdDuration : 0);
    s.keepOnly?.(new Set([...shown.keys(), "backdrop"]));
    decoders.keepOnly(new Set(shown.keys()));
    const src: FrameSources = {
      media,
      video: (c) => {
        const el = shown.get(c.id);
        return el ? { el, packed: false } : null;
      },
      image: (id) => s.pictures.get(id) ?? null,
      backdropVideo: () => backdrop,
      live: s.live,
    };
    drawFrame(ctx, doc, t, src, cache);
  };
  return { canvas, drawAt };
}

/** A canvas as a file (an OffscreenCanvas has convertToBlob, a <canvas> toBlob). */
export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  const off = canvas as unknown as { convertToBlob?: (o: { type: string; quality?: number }) => Promise<Blob> };
  if (typeof off.convertToBlob === "function") return off.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export type VideoPassOptions = {
  draw: FrameDrawer;
  fps: number;
  /** The frames to make: [from, to) (all of them, or one part of a split export). */
  from: number;
  to: number;
  config: VideoEncoderConfig;
  /** Each encoded picture, in order. */
  onChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
  /** Frames made so far (a few times a second, and at the end). */
  onProgress: (framesDone: number) => void;
  /** Keep the first frame as a picture (the poster). */
  poster: boolean;
  /** Why to stop now (canceled, the sound failed), checked every frame. */
  stop: () => Error | null;
};

/** Draw and encode the frames: the poster, if asked. Throws EncoderFailure when the encoder stops. */
export async function renderVideo(o: VideoPassOptions): Promise<{ poster: Blob | null }> {
  const { draw, fps: F, config } = o;
  let failure: Error | null = null;
  let lastOutput = Date.now();
  let outputs = 0;
  let lastReport = -Infinity;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      lastOutput = Date.now();
      if (++outputs === 1) trace("first frame back from the encoder", { type: chunk.type, bytes: chunk.byteLength, description: !!meta?.decoderConfig?.description });
      o.onChunk(chunk, meta);
    },
    error: (e) => {
      failure ??= new EncoderFailure(`The video encoder stopped: ${e instanceof Error ? e.message : String(e)}`);
    },
  });
  try {
    encoder.configure(config);
    trace("video encoder", { codec: config.codec, hardware: config.hardwareAcceleration, bitrate: config.bitrate });
  } catch (e) {
    encoder.close();
    throw new EncoderFailure(`The video encoder couldn't start: ${e instanceof Error ? e.message : String(e)}`);
  }
  const gop = Math.max(1, Math.round(F * 2));
  let poster: Blob | null = null;
  // (where the time goes, in the trace: drawing, making the frame, waiting for the encoder)
  const ms = { draw: 0, frame: 0, wait: 0 };
  try {
    for (let i = o.from; i < o.to; i++) {
      const why = o.stop() ?? failure;
      if (why) throw why;
      const t = i / F;
      const t0 = performance.now();
      await draw.drawAt(t);
      const t1 = performance.now();
      const frame = new VideoFrame(draw.canvas, { timestamp: Math.round(t * 1_000_000), duration: Math.round(1_000_000 / F) });
      encoder.encode(frame, { keyFrame: i % gop === 0 });
      frame.close();
      const t2 = performance.now();
      ms.draw += t1 - t0;
      ms.frame += t2 - t1;
      if (i === o.from && o.poster) poster = await canvasBlob(draw.canvas, "image/png");
      // keep the encoder's queue short (memory stays flat on long videos), but never wait on an encoder
      // that is waiting for more frames itself (Safari's)
      for (;;) {
        const room = encoderRoom(encoder.encodeQueueSize, Date.now() - lastOutput, outputs > 0);
        if (room === "go") break;
        if (room === "stalled") {
          trace("encoder stalled", { frame: i, queue: encoder.encodeQueueSize, outputs, codec: config.codec, hardware: config.hardwareAcceleration });
          throw new EncoderFailure("The video encoder stopped giving frames back.");
        }
        if (failure) throw failure;
        const w0 = performance.now();
        await new Promise((r) => setTimeout(r, 4));
        ms.wait += performance.now() - w0;
      }
      const now = performance.now();
      if (progressDue(now, lastReport, i === o.to - 1)) {
        lastReport = now;
        o.onProgress(i + 1 - o.from);
      }
      if (i - o.from < 3 || i % 60 === 0) trace("frame", { frame: i, queue: encoder.encodeQueueSize, back: outputs, drawMs: Math.round(ms.draw), frameMs: Math.round(ms.frame), waitMs: Math.round(ms.wait) });
    }
    trace("all frames sent: flushing", { queue: encoder.encodeQueueSize, back: outputs });
    await flushed(encoder, "video");
    trace("video encoded", { back: outputs });
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  return { poster };
}
