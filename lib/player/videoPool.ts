/**
 * Which <video> element plays which clip in the program preview.
 *
 * One element per clip doesn't scale: a timeline cut into many parts (Remove
 * silences) would open dozens of downloads of the same file, and the browser
 * only runs a few at a time. Instead a small pool of elements is shared:
 *
 *   - clips showing now get an element first, then the next clip of each
 *     track (so it can seek to its first frame before its turn: no flash);
 *   - a clip keeps its element while it's needed;
 *   - otherwise it takes a free element already showing the same file (a
 *     short seek, no new download), else any free one (least recently used);
 *   - the pool only grows when every element is busy.
 *
 * Pure bookkeeping: the player creates the elements and does the seeking.
 */

export type Slot = { src: string | null; clipId: string | null; usedAt: number };
export type Want = { clipId: string; src: string };

/** Safe hardware decoder cap across WebKit, Chromium, and mobile GPUs (typically 4-8 concurrent sessions). */
export const MAX_VIDEO_ELEMENTS = 6;

/**
 * Give every wanted clip (most important first) a slot. Updates `slots` in
 * place (may add slots up to `max`) and returns clip id → slot index. Clips
 * that don't fit are left out.
 */
export function assignSlots(slots: Slot[], wants: Want[], now: number, max: number): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  const wanted = new Map(wants.map((w) => [w.clipId, w.src]));
  // 1. clips that already have an element keep it
  for (const w of wants) {
    const i = slots.findIndex((s) => s.clipId === w.clipId && s.src === w.src);
    if (i >= 0 && !taken.has(i)) {
      out.set(w.clipId, i);
      taken.add(i);
    }
  }
  // elements whose clip isn't wanted any more are free, and so are elements still showing a clip's
  // old file (its stabilized / reversed / AI copy took over): one clip never keeps two elements
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i].clipId;
    if (!taken.has(i) && id && (!wanted.has(id) || wanted.get(id) !== slots[i].src)) slots[i].clipId = null;
  }
  for (const w of wants) {
    if (out.has(w.clipId)) continue;
    const free = (i: number) => !taken.has(i) && (slots[i].clipId === null || slots[i].clipId === w.clipId);
    // 2. a free element on the same file, 3. an empty one, 4. the least recently used, 5. a new one
    let i = slots.findIndex((s, k) => free(k) && s.src === w.src);
    if (i < 0) i = slots.findIndex((s, k) => free(k) && s.src === null);
    if (i < 0) {
      let best = -1;
      for (let k = 0; k < slots.length; k++) if (free(k) && (best < 0 || slots[k].usedAt < slots[best].usedAt)) best = k;
      i = best;
    }
    if (i < 0 && slots.length < max) {
      slots.push({ src: null, clipId: null, usedAt: now });
      i = slots.length - 1;
    }
    if (i < 0) continue;
    slots[i] = { src: w.src, clipId: w.clipId, usedAt: now };
    out.set(w.clipId, i);
    taken.add(i);
  }
  for (const i of taken) slots[i].usedAt = now;
  return out;
}

/** Elements unused for this long drop their file (frees the download and hardware decoder). */
export const IDLE_UNLOAD_MS = 4000;
