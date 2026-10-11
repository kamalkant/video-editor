/**
 * The playhead time, shared between the preview and the timeline without
 * re-rendering the whole editor on every video frame.
 */
export type Clock = { get: () => number; set: (t: number) => void; subscribe: (f: () => void) => () => void };

export function createClock(): Clock {
  let t = 0;
  const subs = new Set<() => void>();
  return {
    get: () => t,
    set(v) {
      if (v === t) return;
      t = v;
      for (const f of subs) f();
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
