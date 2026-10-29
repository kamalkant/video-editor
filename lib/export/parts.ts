/**
 * A long export made in parts at once, one Worker each (lib/export/worker): each part starts on a key frame
 * (every 2 s), and the parts' encoded pictures go into the file one part after the other.
 */

/** Exports shorter than this are made in one go (starting the Workers costs more than it saves). */
export const PARTS_MIN_SECONDS = 20;
/** At most this many parts at once (each holds a decoder and an encoder). */
export const PARTS_MAX = 4;

/**
 * A file bigger than this is made in one go: a later part's pictures wait in memory for the parts before it,
 * next to the file itself (made in memory), so parts could need nearly twice the file's size.
 */
export const PARTS_MAX_BYTES = 256 * 1024 * 1024;

/**
 * How many parts for this computer: half its cores (the other half decodes, encodes and keeps the editor
 * going). `bytes`: about how big the file will be.
 */
export function partCount(totalFrames: number, fps: number, cores: number | undefined, bytes = 0): number {
  if (totalFrames / Math.max(1, fps) < PARTS_MIN_SECONDS || bytes > PARTS_MAX_BYTES) return 1;
  return Math.max(1, Math.min(PARTS_MAX, Math.floor((cores || 2) / 2)));
}

/**
 * The frames of each part, [from, to): about equal, every one starting on a key frame (a multiple of
 * `gop` frames), so each part's first frame needs nothing before it.
 */
export function splitFrames(totalFrames: number, gop: number, n: number): [number, number][] {
  const gops = Math.ceil(totalFrames / gop);
  const k = Math.max(1, Math.min(n, gops));
  const out: [number, number][] = [];
  for (let p = 0; p < k; p++) {
    const from = Math.round((gops * p) / k) * gop;
    const to = p === k - 1 ? totalFrames : Math.round((gops * (p + 1)) / k) * gop;
    if (to > from) out.push([from, to]);
  }
  return out;
}

/**
 * The parts' pictures into the file in order: the first part's go straight in, a later part's wait until all
 * parts before it are in. `write` gets each item in file order.
 */
export class OrderedParts<T> {
  private current = 0;
  private waiting: T[][];
  private finished: boolean[];

  constructor(
    parts: number,
    private write: (part: number, item: T) => void,
  ) {
    this.waiting = Array.from({ length: parts }, () => []);
    this.finished = Array.from({ length: parts }, () => false);
  }

  add(part: number, item: T) {
    if (part === this.current) this.write(part, item);
    else this.waiting[part].push(item);
  }

  /** Part `part` has given all its pictures. */
  finish(part: number) {
    this.finished[part] = true;
    while (this.current < this.finished.length && this.finished[this.current]) {
      this.current++;
      if (this.current < this.waiting.length) {
        for (const item of this.waiting[this.current]) this.write(this.current, item);
        this.waiting[this.current] = [];
      }
    }
  }

  /** Pictures kept back, waiting for earlier parts. */
  get held(): number {
    return this.waiting.reduce((n, w) => n + w.length, 0);
  }
}

/** Two encoder setups (avcC / hvcC) are the same bytes: the parts can be one track. */
export function sameBytes(a: ArrayBuffer | undefined, b: ArrayBuffer | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
