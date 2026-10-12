/**
 * Undo/redo around any reducer. Actions with the same `group` that arrive
 * within MERGE_MS are merged into one step, so dragging a slider is one undo.
 */
export const MERGE_MS = 1000;
const LIMIT = 100;

export type History<S> = { past: S[]; present: S; future: S[]; group: string | null; at: number };

export type HistoryAction<S, A> =
  | { type: "do"; action: A; group?: string; now: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; state: S }
  /** A fact true in every step, e.g. an upload's details arriving from the server: applied to the present,
   * the undo steps and the redo steps alike, without making an undo step of its own. */
  | { type: "everywhere"; update: (s: S) => S };

export function initHistory<S>(present: S): History<S> {
  return { past: [], present, future: [], group: null, at: 0 };
}

export function historyReducer<S, A>(reducer: (s: S, a: A) => S) {
  return (h: History<S>, a: HistoryAction<S, A>): History<S> => {
    switch (a.type) {
      case "undo": {
        if (!h.past.length) return h;
        return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], group: null, at: 0 };
      }
      case "redo": {
        if (!h.future.length) return h;
        return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), group: null, at: 0 };
      }
      case "reset":
        return initHistory(a.state);
      case "everywhere": {
        const present = a.update(h.present);
        if (present === h.present && !h.past.length && !h.future.length) return h;
        return { ...h, past: h.past.map(a.update), present, future: h.future.map(a.update) };
      }
      case "do": {
        const next = reducer(h.present, a.action);
        if (next === h.present) return h;
        const merge = a.group != null && a.group === h.group && a.now - h.at < MERGE_MS;
        return {
          past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
          present: next,
          future: [],
          group: a.group ?? null,
          at: a.now,
        };
      }
    }
  };
}
