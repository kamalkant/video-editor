/**
 * The timeline of one video track: the parts of the source video that are
 * kept, in order, played back to back ("ripple"). Split, trim and cut edit
 * this list; the rest of the clip is left out of the preview and the export.
 * Parts are always in source order and never overlap (reordering comes later).
 */

export type Segment = { id: string; in: number; out: number };

/** Shortest part that can be made (so a click can't leave a 1-frame sliver). */
export const MIN_SEGMENT_FRAMES = 2;

export function wholeClip(duration: number): Segment[] {
  return [{ id: "c1", in: 0, out: duration }];
}

/** The kept parts, or the whole clip when nothing was cut. */
export function segmentsOf(timeline: { clips: Segment[] } | undefined, duration: number): Segment[] {
  return timeline?.clips.length ? timeline.clips : wholeClip(duration);
}

export function timelineDuration(segs: Segment[]): number {
  return segs.reduce((a, s) => a + (s.out - s.in), 0);
}

/** Is this the whole, uncut clip? (then nothing needs cutting on export) */
export function isWhole(segs: Segment[], duration: number, fps: number): boolean {
  return segs.length === 1 && segs[0].in <= 0.5 / fps && segs[0].out >= duration - 0.5 / fps;
}

/** Timeline start of each part. */
export function starts(segs: Segment[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of segs) {
    out.push(t);
    t += s.out - s.in;
  }
  return out;
}

/** Timeline time → source time (clamped into the kept parts). */
export function toSource(segs: Segment[], t: number): number {
  let acc = 0;
  for (const s of segs) {
    const len = s.out - s.in;
    if (t < acc + len) return s.in + Math.max(0, t - acc);
    acc += len;
  }
  const last = segs[segs.length - 1];
  return last ? last.out : 0;
}

/** Source time → timeline time, or null if that moment was cut out. */
export function toTimeline(segs: Segment[], s: number, eps = 1e-6): number | null {
  let acc = 0;
  for (const g of segs) {
    if (s >= g.in - eps && s < g.out + eps) return acc + Math.min(Math.max(0, s - g.in), g.out - g.in);
    acc += g.out - g.in;
  }
  return null;
}

/** The part that holds this source time (or null if it was cut). */
export function segmentAt(segs: Segment[], s: number, eps = 1e-6): Segment | null {
  return segs.find((g) => s >= g.in - eps && s < g.out - eps) ?? null;
}

/**
 * Where playback continues from source time s: s itself if it is kept, the
 * start of the next kept part if s was cut, or null at the end.
 */
export function nextKept(segs: Segment[], s: number, eps = 1e-6): number | null {
  for (const g of segs) {
    if (s < g.in - eps) return g.in;
    if (s < g.out - eps) return s;
  }
  return null;
}

const snap = (t: number, fps: number) => Math.round(t * fps) / fps;
const newId = (segs: Segment[]) => {
  let n = segs.length + 1;
  while (segs.some((s) => s.id === `c${n}`)) n++;
  return `c${n}`;
};

/** Split the part under source time `at` into two (snapped to a frame). No change if too close to an edge. */
export function splitAt(segs: Segment[], at: number, fps: number): Segment[] {
  const t = snap(at, fps);
  const min = MIN_SEGMENT_FRAMES / fps;
  const i = segs.findIndex((g) => t > g.in + min - 1e-6 && t < g.out - min + 1e-6);
  if (i < 0) return segs;
  const g = segs[i];
  return [...segs.slice(0, i), { ...g, out: t }, { id: newId(segs), in: t, out: g.out }, ...segs.slice(i + 1)];
}

/** Remove a part; the rest joins up. The last part can't be removed. */
export function removeSegment(segs: Segment[], id: string): Segment[] {
  if (segs.length <= 1) return segs;
  return segs.filter((g) => g.id !== id);
}

/** Move a part's start or end (snapped), without overlapping its neighbours or the clip's ends. */
export function trimSegment(segs: Segment[], id: string, edge: "in" | "out", to: number, duration: number, fps: number): Segment[] {
  const i = segs.findIndex((g) => g.id === id);
  if (i < 0) return segs;
  const g = segs[i];
  const min = MIN_SEGMENT_FRAMES / fps;
  const t = snap(to, fps);
  if (edge === "in") {
    const lo = i > 0 ? segs[i - 1].out : 0;
    const v = Math.min(Math.max(t, lo), g.out - min);
    return segs.map((x, j) => (j === i ? { ...x, in: v } : x));
  }
  const hi = i < segs.length - 1 ? segs[i + 1].in : duration;
  const v = Math.max(Math.min(t, hi), g.in + min);
  return segs.map((x, j) => (j === i ? { ...x, out: v } : x));
}

/**
 * Clean untrusted parts: inside the clip, snapped to frames, at least
 * MIN_SEGMENT_FRAMES long, in source order, not overlapping. Always ≥ 1 part.
 */
export function sanitizeSegments(segs: Segment[], duration: number, fps: number): Segment[] {
  const min = MIN_SEGMENT_FRAMES / fps;
  const out: Segment[] = [];
  const ids = new Set<string>();
  for (const s of [...segs].sort((a, b) => a.in - b.in)) {
    let a = Math.max(0, snap(s.in, fps));
    const b = Math.min(duration, snap(s.out, fps) > duration - 0.5 / fps ? duration : snap(s.out, fps));
    const prev = out[out.length - 1];
    if (prev && a < prev.out) a = prev.out;
    if (b - a < min - 1e-6) continue;
    const id = ids.has(s.id) ? newId(out) : s.id;
    ids.add(id);
    out.push({ id, in: a, out: b });
  }
  return out.length ? out : wholeClip(duration);
}

/**
 * FFmpeg select expression that keeps these parts, e.g.
 * "gte(t,0.000)*lt(t,2.000)+gte(t,3.000)*lt(t,4.000)". Boundaries are moved
 * half a frame so frames exactly on an edge are cut consistently.
 */
export function selectExpr(segs: Segment[], fps: number): string {
  const e = 0.5 / fps;
  return segs.map((s) => `gte(t\\,${(s.in - e).toFixed(4)})*lt(t\\,${(s.out - e).toFixed(4)})`).join("+");
}

export type Range = { start: number; end: number };

/**
 * Cut these source ranges out of the kept parts (e.g. detected silences).
 * Pieces shorter than MIN_SEGMENT_FRAMES are dropped; if nothing would be
 * left, nothing changes.
 */
export function removeRanges(segs: Segment[], ranges: Range[], fps: number): Segment[] {
  const min = MIN_SEGMENT_FRAMES / fps;
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const g of segs) {
    let pieces: { in: number; out: number }[] = [{ in: g.in, out: g.out }];
    for (const r of sorted) {
      pieces = pieces.flatMap((p) => {
        if (r.end <= p.in || r.start >= p.out) return [p];
        const keep: { in: number; out: number }[] = [];
        if (r.start > p.in) keep.push({ in: p.in, out: r.start });
        if (r.end < p.out) keep.push({ in: r.end, out: p.out });
        return keep;
      });
    }
    pieces
      .map((p) => ({ in: snap(p.in, fps), out: snap(p.out, fps) }))
      .filter((p) => p.out - p.in >= min - 1e-6)
      .forEach((p, i) => out.push({ id: i === 0 ? g.id : newId([...segs, ...out]), in: p.in, out: p.out }));
  }
  return out.length ? out : segs;
}

/** Silences → the ranges to cut, keeping `pad` seconds of pause on each side (so speech isn't clipped). */
export function silenceCuts(silences: Range[], pad: number): Range[] {
  return silences.map((s) => ({ start: s.start + pad, end: s.end - pad })).filter((r) => r.end - r.start > 0.05);
}

/** How much of the kept timeline these cuts would remove. */
export function cutLength(segs: Segment[], ranges: Range[]): number {
  let total = 0;
  for (const g of segs) for (const r of ranges) total += Math.max(0, Math.min(g.out, r.end) - Math.max(g.in, r.start));
  return total;
}
