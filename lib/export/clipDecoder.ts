import { createFile, DataStream, Endianness, MP4BoxBuffer, type ISOFile, type Movie, type Track } from "mp4box";

/**
 * The browser export's frames read with WebCodecs (VideoDecoder): an MP4 / MOV file's video samples are
 * decoded in order, so each export frame costs a few milliseconds instead of a <video> seek (about 40 ms,
 * and Chromium often decodes again from the keyframe). What the decoder can't read (WebM, a codec this
 * browser can't decode, a rotated phone video) returns null: the export seeks a <video> for it instead.
 */

/** One video sample, in decode order. `p`: when it's shown (seconds, edit list applied, as a <video> shows it). */
export type SampleInfo = { offset: number; size: number; p: number; dur: number; sync: boolean };

type Edit = { segment_duration: number; media_time: number };

/**
 * When each sample is shown, as a <video> shows it: the edit list's leading empty edits delay the picture and
 * its first media edit starts it (B-frames and phone videos have one). Seconds.
 */
export function presentationTimes(
  samples: { cts: number; duration: number }[],
  timescale: number,
  edits: Edit[] = [],
  movieTimescale = timescale,
): { p: number; dur: number }[] {
  let delay = 0;
  let start = 0;
  for (const e of edits) {
    if (e.media_time === -1) delay += e.segment_duration / movieTimescale;
    else {
      start = e.media_time;
      break;
    }
  }
  return samples.map((s) => ({ p: (s.cts - start) / timescale + delay, dur: s.duration / timescale }));
}

/** The samples in the order they're shown, to find the one on screen at a time. */
export class SampleIndex {
  private order: number[];
  constructor(readonly samples: SampleInfo[]) {
    this.order = samples.map((_, i) => i).sort((a, b) => samples[a].p - samples[b].p);
  }

  /** The sample (decode-order index) on screen at `t`: the last one shown at or before it (the first one before the start). */
  at(t: number): number {
    const o = this.order;
    let lo = 0;
    let hi = o.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.samples[o[mid]].p <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return o[lo];
  }

  /** The keyframe decoding has to start from for sample `i`. */
  syncAtOrBefore(i: number): number {
    for (let j = i; j > 0; j--) if (this.samples[j].sync) return j;
    return 0;
  }
}

/** The samples [from, end) read in one go: neighbours, up to `maxBytes` of the file (the gaps between them count) or `maxCount`. */
export function batchEnd(samples: SampleInfo[], from: number, maxBytes = 4 << 20, maxCount = 60): number {
  const start = samples[from].offset;
  let end = from + 1;
  while (end < samples.length && end - from < maxCount) {
    const s = samples[end];
    if (s.offset < start || s.offset + s.size - start > maxBytes) break;
    end++;
  }
  return end;
}

/**
 * Whether the decoder starts again at a keyframe for sample `k`: it's never been fed, the picture goes back
 * (an earlier frame than the one shown), or a keyframe lies between what's been fed and `k` (skipping ahead
 * beats decoding everything in between: a cut further into the file).
 */
export function needsRestart(index: SampleIndex, k: number, fed: number, shownP: number | null): boolean {
  if (fed === 0 || shownP === null) return true;
  if (index.samples[k].p < shownP - 1e-6) return true;
  return index.syncAtOrBefore(k) > fed;
}

// ---------- reading the file ----------

/** Bytes of a file: this computer's copy, else the server's original by Range requests (never downloaded whole). */
type ByteSource = { size: number; read: (offset: number, length: number) => Promise<ArrayBuffer> };

async function blobSource(blob: Blob): Promise<ByteSource> {
  return { size: blob.size, read: (o, l) => blob.slice(o, o + l).arrayBuffer() };
}

async function urlSource(url: string): Promise<ByteSource | null> {
  const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
  const total = Number(r.headers.get("content-range")?.split("/")[1]);
  if (r.status !== 206 || !total) return null;
  return {
    size: total,
    read: async (o, l) => {
      const res = await fetch(url, { headers: { Range: `bytes=${o}-${Math.min(total, o + l) - 1}` } });
      if (res.status !== 206) throw new Error(`Couldn't read the file (${res.status}).`);
      return res.arrayBuffer();
    },
  };
}

/** The first box types of an MP4 / MOV file (a WebM or anything else isn't handed to the parser). */
const FIRST_BOXES = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide", "pnot", "uuid"]);

/** Whether a file's first bytes start an MP4 / MOV (ISO BMFF) file. */
export function isIsoFile(head: Uint8Array): boolean {
  return head.length >= 8 && FIRST_BOXES.has(String.fromCharCode(...head.subarray(4, 8)));
}

/** The file's boxes up to the video's sample table (moov), read 1 MB at a time from wherever the parser asks. */
async function parseMovie(src: ByteSource): Promise<{ file: ISOFile; info: Movie } | null> {
  if (!isIsoFile(new Uint8Array(await src.read(0, Math.min(8, src.size))))) return null;
  const file = createFile(false);
  let info: Movie | null = null;
  file.onReady = (m) => (info = m);
  file.onError = () => undefined;
  let at = 0;
  let read = 0;
  while (!info && at < src.size && read < 64 << 20) {
    const len = Math.min(1 << 20, src.size - at);
    const buf = MP4BoxBuffer.fromArrayBuffer(await src.read(at, len), at);
    read += len;
    const next = file.appendBuffer(buf, at + len >= src.size);
    at = next > at ? next : at + len;
  }
  return info ? { file, info } : null;
}

/** The decoder's codec setup bytes (avcC / hvcC / vpcC / av1C), without the box header. */
function descriptionOf(file: ISOFile, track: Track): Uint8Array | undefined {
  const trak = file.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const e = entry as unknown as Record<string, { write: (s: DataStream) => void } | undefined>;
    const box = e.avcC ?? e.hvcC ?? e.vpcC ?? e.av1C;
    if (box) {
      const s = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(s);
      return new Uint8Array(s.buffer, 8);
    }
  }
  return undefined;
}

/** A turned picture (a phone video's matrix): a <video> turns it, the decoder doesn't. */
const isTurned = (m: ArrayLike<number>) => m[0] !== 65536 || m[1] !== 0 || m[3] !== 0 || m[4] !== 65536;

/** A file the decoder can read: where to read it, its samples, and the decoder setup. */
type Source = { bytes: ByteSource; index: SampleIndex; config: VideoDecoderConfig };

/** A file kept on this computer, by its upload id (null: read the server's copy). */
export type FileOf = (mediaId: string) => Promise<Blob | null>;

async function openSource(mediaId: string, fileOf: FileOf): Promise<Source | null> {
  if (typeof VideoDecoder === "undefined") return null;
  const local = await fileOf(mediaId);
  const bytes = local ? await blobSource(local) : await urlSource(`/api/videos/${mediaId}/source`);
  if (!bytes) return null;
  const parsed = await parseMovie(bytes);
  const track = parsed?.info.videoTracks[0];
  // (a fragmented file keeps its samples outside moov: a <video> reads it)
  if (!parsed || parsed.info.isFragmented || !track?.video || isTurned(track.matrix)) return null;
  const raw = parsed.file.getTrackSamplesInfo(track.id);
  if (!raw.length || raw.length !== track.nb_samples) return null;
  const times = presentationTimes(raw, track.timescale, track.edits ?? [], track.movie_timescale || track.timescale);
  const samples = raw.map((s, i) => ({ offset: s.offset, size: s.size, p: times[i].p, dur: times[i].dur, sync: s.is_sync }));
  const config: VideoDecoderConfig = { codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description: descriptionOf(parsed.file, track) };
  const ok = await VideoDecoder.isConfigSupported(config).then((r) => !!r.supported, () => false);
  return ok ? { bytes, index: new SampleIndex(samples), config } : null;
}

// ---------- decoding ----------

/** Samples sent ahead of the one asked for (the decoder's queue stays short). */
const AHEAD = 8;
const us = (s: number) => Math.round(s * 1_000_000);

/**
 * One decoder over one file. The frame on screen is handed to the export as it is (it draws a VideoFrame like a
 * <video>): it stays open until the next one replaces it. (It used to be copied onto a canvas first: a third of
 * the export's computer time.)
 */
class ClipDecoder {
  /** The frame shown now (null before the first one). */
  private current: VideoFrame | null = null;
  private decoder: VideoDecoder;
  /** Decoded frames not yet shown, in the order they're shown. */
  private ready: VideoFrame[] = [];
  private wake: (() => void) | null = null;
  private failure: Error | null = null;
  /** The next sample to send (decode order). */
  private fed = 0;
  /** The last samples were sent and the decoder asked for what it holds; `ended`: it gave it all back. */
  private flushing = false;
  private ended = false;
  private shownP: number | null = null;
  /** Samples read but not yet sent. */
  private pending: EncodedVideoChunk[] = [];

  constructor(private src: Source) {
    this.decoder = this.make();
  }

  private make(): VideoDecoder {
    const d = new VideoDecoder({
      output: (f) => {
        this.ready.push(f);
        this.poke();
      },
      error: (e) => {
        this.failure ??= e instanceof Error ? e : new Error(String(e));
        this.poke();
      },
    });
    // (room in the decoder's queue: more samples can go in)
    d.addEventListener("dequeue", () => this.poke());
    return d;
  }

  private poke() {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  private restartAt(k: number) {
    if (this.decoder.state === "closed") this.decoder = this.make();
    else this.decoder.reset();
    this.decoder.configure(this.src.config);
    for (const f of this.ready) f.close();
    this.ready = [];
    this.pending = [];
    this.flushing = false;
    this.ended = false;
    this.fed = this.src.index.syncAtOrBefore(k);
  }

  /** Read the next samples and send them, keeping AHEAD in the decoder. */
  private async feed() {
    const samples = this.src.index.samples;
    if (!this.pending.length && this.fed < samples.length) {
      const from = this.fed;
      const end = batchEnd(samples, from);
      const base = samples[from].offset;
      const last = samples[end - 1];
      const data = new Uint8Array(await this.src.bytes.read(base, last.offset + last.size - base));
      for (let i = from; i < end; i++) {
        const s = samples[i];
        this.pending.push(new EncodedVideoChunk({ type: s.sync ? "key" : "delta", timestamp: us(s.p), duration: us(s.dur), data: data.subarray(s.offset - base, s.offset - base + s.size) }));
      }
    }
    while (this.pending.length && this.decoder.decodeQueueSize < AHEAD) {
      this.decoder.decode(this.pending.shift()!);
      this.fed++;
    }
  }

  /** The file's frame at source time `t` (seconds); valid until the next call or close(). */
  async frameAt(t: number): Promise<VideoFrame> {
    const { index } = this.src;
    const k = index.at(t);
    const want = index.samples[k].p;
    if (this.current && this.shownP !== null && Math.abs(this.shownP - want) < 1e-6) return this.current;
    if (needsRestart(index, k, this.fed, this.shownP)) this.restartAt(k);
    const T = us(want);
    const n = index.samples.length;
    for (;;) {
      if (this.failure) throw this.failure;
      // frames before the one asked for are never shown again (the export goes forward)
      while (this.ready.length && this.ready[0].timestamp < T) this.ready.shift()!.close();
      // (a frame later than the one asked for means that one was never output: the nearest is shown)
      const f = this.ready[0];
      if (f) {
        this.show(f, want);
        return f;
      }
      const more = this.fed < n || this.pending.length > 0;
      if (more && this.decoder.decodeQueueSize < AHEAD) {
        await this.feed();
        continue;
      }
      if (!more && !this.flushing) {
        // the last samples are in: the decoder gives back what it holds
        this.flushing = true;
        this.decoder.flush().then(
          () => {
            this.ended = true;
            this.poke();
          },
          () => undefined, // (a reset while flushing; an error comes through `error`)
        );
      }
      if (this.ended) throw new Error("The video ended before this frame.");
      await new Promise<void>((r) => (this.wake = r));
    }
  }

  private show(f: VideoFrame, p: number) {
    this.ready.shift();
    this.current?.close();
    this.current = f;
    this.shownP = p;
  }

  close() {
    this.current?.close();
    this.current = null;
    for (const f of this.ready) f.close();
    this.ready = [];
    this.pending = [];
    if (this.decoder.state !== "closed") this.decoder.close();
  }
}

/**
 * The export's decoders: one per video clip on screen; a clip that ends gives its decoder to the next clip of
 * the same file (a cut further on goes on decoding where the last one stopped). `frame` returns null when a
 * file can't be decoded here, or a decoder failed: that clip is drawn from a <video> from then on.
 */
export class ClipDecoders {
  private sources = new Map<string, Promise<Source | null>>();
  private byClip = new Map<string, ClipDecoder>();
  private idle = new Map<string, ClipDecoder[]>();
  private mediaOf = new Map<ClipDecoder, string>();
  private failed = new Set<string>();

  /**
   * `fileOf`: where this computer's copies are (the page's own, lib/media/localMedia; in a Worker, the files
   * the page sent: that module is the page's, the Worker doesn't load it).
   */
  constructor(private fileOf: FileOf) {}

  private source(mediaId: string): Promise<Source | null> {
    let s = this.sources.get(mediaId);
    if (!s) {
      s = openSource(mediaId, this.fileOf).catch(() => null);
      this.sources.set(mediaId, s);
    }
    return s;
  }

  async frame(clipId: string, mediaId: string, t: number): Promise<VideoFrame | null> {
    if (this.failed.has(clipId)) return null;
    let d = this.byClip.get(clipId);
    if (!d) {
      d = this.idle.get(mediaId)?.pop();
      if (!d) {
        const src = await this.source(mediaId);
        if (!src) return null;
        d = new ClipDecoder(src);
        this.mediaOf.set(d, mediaId);
      }
      this.byClip.set(clipId, d);
    }
    try {
      return await d.frameAt(t);
    } catch {
      this.failed.add(clipId);
      this.byClip.delete(clipId);
      this.mediaOf.delete(d);
      d.close();
      return null;
    }
  }

  /** Clips no longer on screen give their decoder back (kept for the next cut of the same file). */
  keepOnly(ids: Set<string>) {
    for (const [id, d] of this.byClip) {
      if (ids.has(id)) continue;
      this.byClip.delete(id);
      const m = this.mediaOf.get(d)!;
      const list = this.idle.get(m) ?? [];
      list.push(d);
      this.idle.set(m, list);
    }
    // (a few idle decoders at most: each holds the hardware's frames)
    for (const list of this.idle.values())
      while (list.length > 1) {
        const d = list.shift()!;
        this.mediaOf.delete(d);
        d.close();
      }
  }

  destroy() {
    for (const d of [...this.byClip.values(), ...[...this.idle.values()].flat()]) d.close();
    this.byClip.clear();
    this.idle.clear();
    this.mediaOf.clear();
  }
}
