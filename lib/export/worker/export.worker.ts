/// <reference lib="webworker" />
import { fontSet } from "../../render/surface";
import { ensureDocFonts, fontNeeds } from "../../text/fonts";
import { ClipDecoders } from "../clipDecoder";
import { NeedsPage } from "../encoding";
import { frameDrawer, renderVideo } from "../videoPass";
import { plainMeta, stopKindOf, type FromWorker, type ToWorker } from "./protocol";

/**
 * The export's pictures, made away from the page (the editor stays usable, a tab in the background doesn't
 * slow it): the fonts, every frame drawn on an OffscreenCanvas, and the video encoder. The page keeps the sound
 * and the file (lib/export/localExport). What only the page can read stops it with "needs-page", and the page
 * makes the whole export itself, as before.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
let canceled = false;

scope.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "cancel") {
    canceled = true;
    return;
  }
  const decoders = new ClipDecoders(async (id) => m.files[id] ?? null);
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") throw new NeedsPage("This browser can't make video in a Worker.");
    // (a font the page has can't be used here: loaded again, from the same files)
    if (fontNeeds(m.doc).length && (!fontSet() || typeof FontFace === "undefined")) throw new NeedsPage("This browser has no fonts in a Worker.");
    await ensureDocFonts(m.doc);
    post({ type: "trace", what: "fonts ready (worker)" });
    const draw = frameDrawer({
      doc: m.doc,
      media: m.media,
      width: m.width,
      height: m.height,
      fps: m.fps,
      pictures: new Map(Object.entries(m.pictures)),
      live: (c) => m.live[c.id] ?? null,
      decoders,
      seek: null,
    });
    const { poster } = await renderVideo({
      draw,
      fps: m.fps,
      from: m.from,
      to: m.to,
      config: m.config,
      poster: m.poster,
      stop: () => (canceled ? new Error("Export canceled.") : null),
      onChunk: (chunk, meta) => {
        const data = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(data);
        post({ type: "chunk", data, key: chunk.type === "key", timestamp: chunk.timestamp, duration: chunk.duration ?? 0, meta: plainMeta(meta) }, [data]);
      },
      onProgress: (done) => post({ type: "progress", done }),
    });
    post({ type: "done", poster });
  } catch (err) {
    post({ type: "error", kind: stopKindOf(err), message: err instanceof Error ? err.message : String(err) });
  } finally {
    decoders.destroy();
    for (const b of Object.values(m.pictures)) b.close();
  }
};

// (the page makes the export itself when this never comes: a Worker that can't load says nothing)
post({ type: "ready" });
