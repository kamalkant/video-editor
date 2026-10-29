import type { MediaLite, TimelineDoc } from "../../edit/doc";
import type { LiveKeyParams } from "../../editor/liveKey";
import { EncoderFailure, NeedsPage } from "../encoding";

/**
 * The messages between the page and the export's Worker (lib/export/worker/export.worker.ts). Encoded pictures
 * travel as plain bytes and plain metadata: not every browser can post an EncodedVideoChunk or a
 * VideoColorSpace.
 */

export type WorkerStart = {
  type: "start";
  doc: TimelineDoc;
  media: Record<string, MediaLite>;
  width: number;
  height: number;
  fps: number;
  /** The frames to make: [from, to). */
  from: number;
  to: number;
  config: VideoEncoderConfig;
  /** This computer's copies of the videos (the others are read from the server). */
  files: Record<string, Blob>;
  /** The pictures, decoded on the page (an <img> reads every kind; an SVG can't be decoded in a Worker). */
  pictures: Record<string, ImageBitmap>;
  /** Each video clip's live key (background removal), by clip id. */
  live: Record<string, LiveKeyParams | null>;
  poster: boolean;
};
export type ToWorker = WorkerStart | { type: "cancel" };

export type ChunkMeta = {
  decoderConfig?: { codec: string; codedWidth?: number; codedHeight?: number; description?: ArrayBuffer; colorSpace?: VideoColorSpaceInit };
  alphaSideData?: ArrayBuffer;
};

/** Why the Worker stopped: the page makes it instead, the encoder stopped (again in software), canceled, or else. */
export type StopKind = "needs-page" | "encoder" | "canceled" | "other";

export type FromWorker =
  /** The Worker's code has loaded (one that fails to load says nothing: the page waits for this). */
  | { type: "ready" }
  | { type: "chunk"; data: ArrayBuffer; key: boolean; timestamp: number; duration: number; meta?: ChunkMeta }
  | { type: "progress"; done: number }
  | { type: "trace"; what: string; data?: Record<string, unknown> }
  | { type: "done"; poster: Blob | null }
  | { type: "error"; kind: StopKind; message: string };

/** A copy of some bytes as an ArrayBuffer of their own. */
function bytesOf(b: AllowSharedBufferSource): ArrayBuffer {
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice().buffer;
  return new Uint8Array(b as ArrayBuffer).slice().buffer;
}

/** The encoder's metadata as plain data. */
export function plainMeta(meta?: EncodedVideoChunkMetadata): ChunkMeta | undefined {
  if (!meta) return undefined;
  const out: ChunkMeta = {};
  const dc = meta.decoderConfig;
  if (dc) {
    const cs = dc.colorSpace;
    out.decoderConfig = {
      codec: dc.codec,
      ...(dc.codedWidth ? { codedWidth: dc.codedWidth } : {}),
      ...(dc.codedHeight ? { codedHeight: dc.codedHeight } : {}),
      ...(dc.description ? { description: bytesOf(dc.description) } : {}),
      ...(cs ? { colorSpace: { primaries: cs.primaries ?? null, transfer: cs.transfer ?? null, matrix: cs.matrix ?? null, fullRange: cs.fullRange ?? null } } : {}),
    };
  }
  const alpha = (meta as { alphaSideData?: AllowSharedBufferSource }).alphaSideData;
  if (alpha) out.alphaSideData = bytesOf(alpha);
  return Object.keys(out).length ? out : undefined;
}

export function stopKindOf(e: unknown): StopKind {
  if (e instanceof NeedsPage) return "needs-page";
  if (e instanceof EncoderFailure) return "encoder";
  if (e instanceof Error && e.message === "Export canceled.") return "canceled";
  return "other";
}

/**
 * The page's error for a Worker's stop. Anything unexpected in the Worker makes the export on the page instead
 * (the Worker must never be why an export fails).
 */
export function errorOfStop(kind: StopKind, message: string): Error {
  if (kind === "encoder") return new EncoderFailure(message);
  if (kind === "canceled") return new Error("Export canceled.");
  return new NeedsPage(message);
}
