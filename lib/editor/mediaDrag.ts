"use client";

import { useSyncExternalStore } from "react";
import type { MediaLite } from "../edit/doc";

/** Drag type for an upload dragged from My Assets (onto the timeline or the preview). */
export const MEDIA_DRAG = "application/x-vdo-media";
export const TEXT_DRAG = "application/x-vdo-text";
export const ELEMENT_DRAG = "application/x-vdo-element";
export const MEME_DRAG = "application/x-vdo-meme";

/**
 * The My Assets file being dragged right now (null: none). The browser hides a
 * drag's data until the drop, so the timeline and the preview read it from here
 * to show where it would land (and how big it is).
 */
let current: MediaLite | null = null;
const listeners = new Set<() => void>();

export function setMediaDrag(m: MediaLite | null) {
  if (current === m) return;
  current = m;
  for (const l of listeners) l();
}

export const mediaDrag = () => current;

export function useMediaDrag(): MediaLite | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    mediaDrag,
    () => null,
  );
}

export type TextDragItem = { styleId: string; label?: string };
let currentText: TextDragItem | null = null;
const textListeners = new Set<() => void>();

export function setTextDrag(t: TextDragItem | null) {
  if (currentText === t) return;
  currentText = t;
  for (const l of textListeners) l();
}

export const textDrag = () => currentText;

export function useTextDrag(): TextDragItem | null {
  return useSyncExternalStore(
    (l) => {
      textListeners.add(l);
      return () => void textListeners.delete(l);
    },
    textDrag,
    () => null,
  );
}

export type ElementDragItem = {
  presetId?: string;
  emoji?: string;
  label?: string;
  aspect?: number;
};
let currentElement: ElementDragItem | null = null;
const elementListeners = new Set<() => void>();

export function setElementDrag(e: ElementDragItem | null) {
  if (currentElement === e) return;
  currentElement = e;
  for (const l of elementListeners) l();
}

export const elementDrag = () => currentElement;

export function useElementDrag(): ElementDragItem | null {
  return useSyncExternalStore(
    (l) => {
      elementListeners.add(l);
      return () => void elementListeners.delete(l);
    },
    elementDrag,
    () => null,
  );
}

import type { MemeClipItem } from "../library/memeCatalog";
export type MemeDragItem = MemeClipItem;
let currentMeme: MemeDragItem | null = null;
const memeListeners = new Set<() => void>();

export function setMemeDrag(m: MemeDragItem | null) {
  if (currentMeme === m) return;
  currentMeme = m;
  for (const l of memeListeners) l();
}

export const memeDrag = () => currentMeme;

export function useMemeDrag(): MemeDragItem | null {
  return useSyncExternalStore(
    (l) => {
      memeListeners.add(l);
      return () => void memeListeners.delete(l);
    },
    memeDrag,
    () => null,
  );
}

/** Visual chip attached to the pointer when dragging text styles, elements, or memes. */
export function createDragChip(
  label: string,
  subOrThumb?: string,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const old = document.getElementById("VDO-drag-chip");
  old?.remove();
  const el = document.createElement("div");
  el.id = "VDO-drag-chip";
  const isImage =
    subOrThumb &&
    (subOrThumb.startsWith("/") ||
      subOrThumb.startsWith("http") ||
      subOrThumb.startsWith("data:"));

  el.style.cssText =
    "position:fixed;top:-200px;left:-200px;display:flex;align-items:center;gap:6px;max-width:160px;padding:4px 8px 4px 4px;border-radius:6px;background:rgba(15,23,42,0.95);backdrop-filter:blur(6px);border:1px solid rgba(59,130,246,0.6);font:11px system-ui,sans-serif;color:#ffffff;box-shadow:0 8px 20px rgba(0,0,0,0.5);pointer-events:none;z-index:99999;";

  if (isImage) {
    const img = document.createElement("img");
    img.src = subOrThumb;
    img.style.cssText =
      "display:block;width:32px;height:20px;object-fit:cover;border-radius:3px;flex-shrink:0;";
    el.appendChild(img);
  }

  const title = document.createElement("div");
  title.textContent = label;
  title.style.cssText =
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;font-size:11px;";
  el.appendChild(title);

  if (subOrThumb && !isImage) {
    const hint = document.createElement("div");
    hint.textContent = subOrThumb;
    hint.style.cssText = "font-size:10px;font-weight:400;color:#93c5fd;";
    el.appendChild(hint);
  }

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 0);
  return el;
}
