/**
 * How many FFmpeg jobs run at once. Off a Mac (shared hosting: a share of the CPU and a thread limit per
 * account) many FFmpeg processes at once slowed everything, the video stream too: an upload's thumbnail,
 * filmstrip, preview copy and proxy all started together. Here:
 *   - at most `max` jobs run at once (0: no limit, as on a Mac)
 *   - background work (preview copies, proxies) runs one at a time, and never in the last free place,
 *     so what someone is waiting for (a thumbnail, a frame, an export) doesn't queue behind it
 *   - waiting jobs start in order, people's requests before background work
 */
export type Slots = {
  /** Wait for a place; resolves with the function that gives it back. */
  acquire(background: boolean, signal?: AbortSignal): Promise<() => void>;
  /** Running and waiting jobs (for tests and health). */
  stats(): { running: number; background: number; waiting: number };
};

export class SlotAbortedError extends Error {
  constructor() {
    super("Canceled");
    this.name = "AbortedError";
  }
}

export function createSlots(max: number): Slots {
  let running = 0;
  let background = 0;
  type Waiter = { background: boolean; start: () => void };
  const queue: Waiter[] = [];
  const canStart = (bg: boolean) => (bg ? background === 0 && running < Math.max(1, max - 1) : running < max);

  const take = (bg: boolean) => {
    running++;
    if (bg) background++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      running--;
      if (bg) background--;
      pump();
    };
  };

  function pump() {
    for (let i = 0; i < queue.length; ) {
      const w = queue[i]!;
      // people first: background work waits while someone's request is still waiting
      const blocked = w.background && queue.some((q) => !q.background);
      if (!blocked && canStart(w.background)) {
        queue.splice(i, 1);
        w.start();
      } else i++;
    }
  }

  return {
    acquire(bg, signal) {
      if (!max) return Promise.resolve(() => undefined);
      if (signal?.aborted) return Promise.reject(new SlotAbortedError());
      if (canStart(bg) && !(bg && queue.length) && !(!bg && queue.some((q) => !q.background))) return Promise.resolve(take(bg));
      return new Promise((resolve, reject) => {
        const w: Waiter = {
          background: bg,
          start: () => {
            signal?.removeEventListener("abort", onAbort);
            resolve(take(bg));
          },
        };
        const onAbort = () => {
          const at = queue.indexOf(w);
          if (at >= 0) queue.splice(at, 1);
          reject(new SlotAbortedError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        queue.push(w);
      });
    },
    stats: () => ({ running, background, waiting: queue.length }),
  };
}
