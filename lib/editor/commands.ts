/**
 * Search tools (⌘K): everything the editor can do, as a list you can type
 * into. Pure, so the matching and order can be tested.
 */
import type { IconName } from "@/components/ui/Icon";

export type Command = {
  id: string;
  label: string;
  /** the section it's listed under */
  group: string;
  icon: IconName;
  /** keyboard shortcut to show */
  keys?: string;
  /** what it does, or why it can't be used now (when `run` is null) */
  hint?: string;
  /** other words people might type */
  keywords?: string[];
  run: (() => void) | null;
};

/** How many recent picks come first when nothing is typed. */
export const RECENT_MAX = 5;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%×]+/g, " ")
    .trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

/**
 * How well a command matches the typed words (0: not at all). Every word must
 * match: the label's start (best), a word start in the label, anywhere in the
 * label, or a word start in the keywords.
 */
export function matchScore(c: Pick<Command, "label" | "keywords">, query: string): number {
  const q = words(query);
  if (!q.length) return 1;
  const label = norm(c.label);
  const lw = words(c.label);
  const kw = (c.keywords ?? []).flatMap(words);
  let score = 0;
  for (const [i, w] of q.entries()) {
    if (i === 0 && label.startsWith(w)) score += 4;
    else if (lw.some((x) => x.startsWith(w))) score += 3;
    else if (label.includes(w)) score += 2;
    else if (kw.some((x) => x.startsWith(w))) score += 1;
    else return 0;
  }
  return score / q.length;
}

/**
 * The commands to show for what's typed, best first (equal ones keep the list's
 * order). Nothing typed: the recent picks first, then everything as listed.
 */
export function searchCommands<C extends Pick<Command, "id" | "label" | "keywords">>(list: C[], query: string, recent: string[] = []): C[] {
  if (!words(query).length) {
    const byId = new Map(list.map((c) => [c.id, c]));
    const first = recent.map((id) => byId.get(id)).filter((c): c is C => !!c).slice(0, RECENT_MAX);
    return [...first, ...list.filter((c) => !first.includes(c))];
  }
  return list
    .map((c, i) => ({ c, i, s: matchScore(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/** Put a picked command first in the recent list. */
export const pushRecent = (recent: string[], id: string) => [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX);
