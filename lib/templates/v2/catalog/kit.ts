import type { Backdrop } from "../../../edit/doc";
import type { Anchor, AnimKind, ElementLayer, LayerOverride, MediaLayer, Ratio, TextLayer } from "../spec";

/** Short ways to write template specs (the catalog files). */
export const grad = (from: string, to: string, angle = 135): Backdrop => ({ kind: "gradient", from, to, angle });
export const set = (id: string): Backdrop => ({ kind: "set", id });
export const at = (x: Anchor["x"], y: Anchor["y"], dx?: number, dy?: number): Anchor => ({ x, y, ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) });
export const C = at("center", "center");

type Common = { from?: number; length?: number; over?: Partial<Record<Ratio, LayerOverride>> };
export const text = (style: string, words: string, where: Anchor, o: Common & { size?: number; color?: string; anim?: [AnimKind, AnimKind] } = {}): TextLayer => ({
  kind: "text",
  style,
  words,
  at: where,
  ...(o.from !== undefined ? { from: o.from } : {}),
  ...(o.length !== undefined ? { length: o.length } : {}),
  ...(o.over ? { over: o.over } : {}),
  ...(o.size ? { size: o.size } : {}),
  ...(o.color ? { color: o.color } : {}),
  ...(o.anim ? { anim: { in: o.anim[0], out: o.anim[1] } } : {}),
});
export const el = (preset: string, where: Anchor, o: Common & { look?: Record<string, unknown> } = {}): ElementLayer => ({ kind: "element", preset, at: where, ...o });
/** The whole scene is the slot. */
export const slot = (role: string, accepts: MediaLayer["accepts"], keywords: string[] = []): MediaLayer => ({ kind: "media", role, accepts, at: C, ...(keywords.length ? { keywords } : {}) });
/** A framed picture-in-picture slot. */
export const frame = (role: string, accepts: MediaLayer["accepts"], where: Anchor, o: Common & { keywords?: string[]; preset?: string } = {}): MediaLayer => ({
  kind: "media",
  role,
  accepts,
  at: where,
  frame: o.preset ?? "rounded",
  ...(o.keywords ? { keywords: o.keywords } : {}),
  ...(o.from !== undefined ? { from: o.from } : {}),
  ...(o.over ? { over: o.over } : {}),
});
/** On a tall (9:16) canvas: somewhere else. */
export const tall = (where: Anchor): Partial<Record<Ratio, LayerOverride>> => ({ "9:16": { at: where } });
