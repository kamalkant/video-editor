"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { BrandFont } from "@/lib/brand";
import type { TextClip, TextMark, TextStyle } from "@/lib/edit/doc";
import { ensureFont, fontStack } from "@/lib/text/fonts";
import { applyMark, clearMarks, lettersOf, normalizeMarks, segmentsOf, snapToLetter, styleAt, type MarkKey, type MarkStyle } from "@/lib/text/marks";
import { FontPicker } from "./FontPicker";

/**
 * The words of a text clip, styled like a word processor: select letters (a word, a few letters) and give
 * them their own size, color, font, bold, italic, a line under or through them, or a marker-pen color. With
 * nothing selected the buttons change the whole text. The box shows the styles as you type (Hindi typing
 * with an input method works: nothing is touched while a letter is being composed).
 *
 * The box is drawn by hand (not by React): each styled part is a <span> with its look in data-style; what
 * is typed is read back from the page into words + marks (lib/text/marks).
 */

const MAX = 1000;
/** A double-click on the preview asks the box to select the word there: { clipId, pos }. */
export const TEXT_SELECT_EVENT = "vdo:text-select";

type Patch = { text?: string; marks?: TextMark[] | undefined; style?: TextStyle };

/** The look of a styled part in the box (sizes are kept readable: the preview shows the real ones). */
function spanCss(m: MarkStyle, base: TextStyle): Partial<CSSStyleDeclaration> {
  return {
    ...(m.color ? { color: m.color } : {}),
    ...(m.font ? { fontFamily: fontStack(m.font) } : {}),
    ...(m.bold !== undefined ? { fontWeight: m.bold ? "700" : "400" } : {}),
    ...(m.italic !== undefined ? { fontStyle: m.italic ? "italic" : "normal" } : {}),
    ...((m.underline ?? base.underline) || (m.strike ?? base.strike) ? { textDecoration: [(m.underline ?? base.underline) ? "underline" : "", (m.strike ?? base.strike) ? "line-through" : ""].filter(Boolean).join(" ") } : {}),
    ...(m.highlight ? { backgroundColor: m.highlight } : {}),
    ...(m.size ? { fontSize: `${Math.min(2.2, Math.max(0.6, m.size))}em` } : {}),
  };
}

/** Draw the words and marks into the box. */
function render(el: HTMLElement, text: string, marks: TextMark[] | undefined, base: TextStyle) {
  el.textContent = "";
  for (const seg of segmentsOf(text, marks)) {
    const part = text.slice(seg.from, seg.to);
    if (!part) continue;
    const span = document.createElement("span");
    span.dataset.style = JSON.stringify(seg.style);
    Object.assign(span.style, spanCss(seg.style, base));
    span.textContent = part;
    el.appendChild(span);
  }
  // (a line break at the very end only shows with something after it)
  const tail = document.createElement("br");
  tail.dataset.tail = "1";
  el.appendChild(tail);
}

/** The look a node has (the data-style of the span it's in). */
function styleOfNode(n: Node, root: HTMLElement): MarkStyle {
  for (let p: Node | null = n.parentNode; p && p !== root; p = p.parentNode) {
    const d = (p as HTMLElement).dataset?.style;
    if (d) {
      try {
        return JSON.parse(d) as MarkStyle;
      } catch {
        return {};
      }
    }
  }
  return {};
}

/** Read the box back: its words (line breaks as \n) and the marks of its styled parts. Also: is it laid out the way render() lays it out? */
function read(root: HTMLElement): { text: string; marks: TextMark[]; clean: boolean } {
  let text = "";
  const marks: TextMark[] = [];
  let clean = true;
  const walk = (n: Node, depth: number) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        const data = (c as Text).data.replace(/ /g, " ");
        if (!data) continue;
        const st = styleOfNode(c, root);
        if (Object.keys(st).length) marks.push({ from: text.length, to: text.length + data.length, ...st });
        text += data;
        if (depth !== 1) clean = false;
      } else if (c.nodeName === "BR") {
        if ((c as HTMLElement).dataset.tail && c === root.lastChild) continue;
        text += "\n";
        clean = false;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const tag = c.nodeName;
        // (a browser that puts a new line in its own block)
        if ((tag === "DIV" || tag === "P") && text && !text.endsWith("\n")) text += "\n";
        if (!(c as HTMLElement).dataset?.style || depth !== 0) clean = false;
        walk(c, depth + 1);
      }
    }
  };
  walk(root, 0);
  return { text, marks, clean };
}

/** Where a page point (node, offset) is in the words. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  let at = 0;
  let found = -1;
  const walk = (n: Node): boolean => {
    if (n === node && n.nodeType !== Node.TEXT_NODE) {
      // a point between children: everything before child `offset`
      for (let i = 0; i < offset && i < n.childNodes.length; i++) at += lengthOf(n.childNodes[i]);
      found = at;
      return true;
    }
    for (const c of Array.from(n.childNodes)) {
      if (c === node && c.nodeType === Node.TEXT_NODE) {
        found = at + Math.min(offset, (c as Text).data.length);
        return true;
      }
      if (walk(c)) return true;
      if (c.nodeType === Node.TEXT_NODE) at += (c as Text).data.length;
      else if (c.nodeName === "BR" && !(c as HTMLElement).dataset.tail) at += 1;
    }
    return false;
  };
  walk(root);
  return found < 0 ? at : found;
}
function lengthOf(n: Node): number {
  if (n.nodeType === Node.TEXT_NODE) return (n as Text).data.length;
  if (n.nodeName === "BR") return (n as HTMLElement).dataset.tail ? 0 : 1;
  let s = 0;
  for (const c of Array.from(n.childNodes)) s += lengthOf(c);
  return s;
}

/** The page point of a position in the words. */
function pointAt(root: HTMLElement, pos: number): { node: Node; offset: number } {
  let left = pos;
  let last: { node: Node; offset: number } = { node: root, offset: 0 };
  const walk = (n: Node): { node: Node; offset: number } | null => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        const len = (c as Text).data.length;
        if (left <= len) return { node: c, offset: left };
        left -= len;
        last = { node: c, offset: len };
      } else if (c.nodeName === "BR") {
        if ((c as HTMLElement).dataset.tail) continue;
        if (left === 0) return { node: c.parentNode!, offset: Array.prototype.indexOf.call(c.parentNode!.childNodes, c) };
        left -= 1;
        last = { node: c.parentNode!, offset: Array.prototype.indexOf.call(c.parentNode!.childNodes, c) + 1 };
      } else {
        const r = walk(c);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(root) ?? last;
}

function selectionIn(root: HTMLElement): { from: number; to: number } | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = offsetOf(root, sel.anchorNode!, sel.anchorOffset);
  const b = offsetOf(root, sel.focusNode!, sel.focusOffset);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

function select(root: HTMLElement, from: number, to: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const a = pointAt(root, from);
  const b = pointAt(root, to);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** A readable box behind the words: dark for light text, light for dark text. */
function surfaceFor(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  return lum > 0.6 ? "#1f2937" : "#f3f4f6";
}

export function RichTextField({ id, clip, onPatch, brandFonts = [], rows = 3, describedBy }: { id?: string; clip: Pick<TextClip, "id" | "text" | "style" | "marks">; onPatch: (p: Patch, group?: string) => void; brandFonts?: BrandFont[]; rows?: number; describedBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  /** what the box shows now (so our own edits coming back don't redraw it under the caret) */
  const shown = useRef<string>("");
  // (the selection belongs to one clip: another text starts with nothing selected)
  const [selOf, setSelOf] = useState<{ clip: string; from: number; to: number }>({ clip: clip.id, from: 0, to: 0 });
  const sel = selOf.clip === clip.id ? selOf : { from: 0, to: 0 };
  const clipRef = useRef(clip.id);
  useEffect(() => {
    clipRef.current = clip.id;
  });
  const setSel = useCallback((s: { from: number; to: number }) => setSelOf({ clip: clipRef.current, ...s }), []);
  const st = clip.style;
  const key = (text: string, marks: TextMark[] | undefined) => JSON.stringify([text, marks ?? null, st.underline ?? false, st.strike ?? false]);

  // draw it when the words or marks changed from outside (undo, a caption edited elsewhere, another clip)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    const k = key(clip.text, clip.marks);
    if (k === shown.current) return;
    const focused = document.activeElement === el;
    const keep = focused ? selectionIn(el) : null;
    render(el, clip.text, clip.marks, st);
    shown.current = k;
    if (keep) select(el, Math.min(keep.from, clip.text.length), Math.min(keep.to, clip.text.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.text, clip.marks, st.underline, st.strike]);
  // (the fonts the box shows: the page has them as soon as possible)
  useEffect(() => {
    void ensureFont(st.font, { bold: st.bold, italic: st.italic }, clip.text);
    for (const m of clip.marks ?? []) if (m.font) void ensureFont(m.font, {}, clip.text.slice(m.from, m.to));
  }, [st.font, st.bold, st.italic, clip.text, clip.marks]);

  // the selection inside the box (kept while the toolbar is used)
  useEffect(() => {
    const onSel = () => {
      const el = ref.current;
      if (!el || document.activeElement !== el) return;
      const s = selectionIn(el);
      if (s) setSel(s);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [setSel]);
  // a double-click on the preview: select the word there
  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<{ clipId: string; pos: number | null }>).detail;
      const el = ref.current;
      if (!el || d.clipId !== clip.id) return;
      el.focus();
      if (d.pos == null) return;
      const t = clip.text;
      let a = Math.max(0, Math.min(t.length, d.pos));
      let b = a;
      while (a > 0 && !/\s/.test(t[a - 1])) a--;
      while (b < t.length && !/\s/.test(t[b])) b++;
      if (b > a) {
        select(el, a, b);
        setSel({ from: a, to: b });
      }
    };
    window.addEventListener(TEXT_SELECT_EVENT, onPick);
    return () => window.removeEventListener(TEXT_SELECT_EVENT, onPick);
  }, [clip.id, clip.text, setSel]);

  /** What was typed: the words and marks read from the box. */
  const commit = () => {
    const el = ref.current;
    if (!el || composing.current) return;
    const r = read(el);
    let text = r.text;
    let marks: TextMark[] | undefined = r.marks;
    const caret = selectionIn(el);
    if (text.length > MAX) {
      text = text.slice(0, MAX);
      marks = marks.filter((m) => m.from < MAX).map((m) => ({ ...m, to: Math.min(MAX, m.to) }));
    }
    marks = normalizeMarks(text, marks);
    const k = key(text, marks);
    // the box is laid out like render() would: keep it as it is (no redraw under the caret)
    if (!r.clean || text !== r.text) {
      render(el, text, marks, st);
      if (caret) select(el, Math.min(caret.from, text.length), Math.min(caret.to, text.length));
    }
    shown.current = k;
    if (text !== clip.text || JSON.stringify(marks ?? null) !== JSON.stringify(clip.marks ?? null)) onPatch({ text, marks }, "text:words");
  };

  /** Style the selected letters (or, with none selected, the whole text). */
  const styleSel = (patch: Partial<Record<MarkKey, unknown>>, group?: string) => {
    const el = ref.current;
    const s = (el && document.activeElement === el ? selectionIn(el) : null) ?? sel;
    if (s.to <= s.from) {
      // the whole text: its own style (size: the text size; highlight: a mark over all of it)
      const next: TextStyle = { ...st };
      let marks = clip.marks;
      for (const [k, v] of Object.entries(patch)) {
        if (k === "size") next.size = Math.min(400, Math.max(8, Math.round(st.size * Number(v ?? 1))));
        else if (k === "highlight") marks = applyMark(clip.text, marks, 0, clip.text.length, { highlight: v });
        else if (k === "font") next.font = (v as string) ?? st.font;
        else if (k === "color") next.color = (v as string) ?? st.color;
        else if (k === "bold") next.bold = !!v;
        else (next as Record<string, unknown>)[k] = v || undefined;
      }
      // (letters with a look of their own keep it: "everything blue, that word red")
      onPatch({ style: next, ...(marks !== clip.marks ? { marks } : {}) }, group);
      return;
    }
    const marks = applyMark(clip.text, clip.marks, s.from, s.to, patch);
    onPatch({ marks }, group);
    // (the same letters stay selected)
    requestAnimationFrame(() => {
      const box = ref.current;
      if (!box) return;
      const a = snapToLetter(clip.text, s.from, "down");
      const b = snapToLetter(clip.text, s.to, "up");
      if (document.activeElement === box) select(box, a, b);
    });
  };

  const hasSel = sel.to > sel.from;
  const look = hasSel ? styleAt(clip.text, clip.marks, sel.from, sel.to) : {};
  const shownFont = look.font ?? st.font;
  const shownColor = look.color ?? st.color;
  const bold = look.bold ?? st.bold;
  const italic = look.italic ?? !!st.italic;
  const underline = look.underline ?? !!st.underline;
  const strike = look.strike ?? !!st.strike;
  const sizeShare = hasSel ? (look.size ?? 1) : 1;
  const count = hasSel ? lettersOf(clip.text.slice(sel.from, sel.to)).length : 0;
  const btn = (on: boolean) => `flex size-7 shrink-0 items-center justify-center rounded-md border text-xs ${on ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:text-ink"}`;
  // (toolbar buttons don't take the focus: the selection stays)
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const stepSize = (dir: 1 | -1) => {
    if (hasSel) {
      const steps = [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 4];
      const i = steps.findIndex((x) => x >= sizeShare - 1e-6);
      const next = steps[Math.min(steps.length - 1, Math.max(0, (i < 0 ? steps.length - 1 : i) + dir))];
      styleSel({ size: Math.abs(next - 1) < 1e-6 ? undefined : next }, "text:mark-size");
    } else styleSel({ size: dir > 0 ? 1.1 : 1 / 1.1 }, "text:size");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Text style">
        <div className="min-w-0 flex-[1_1_8rem]">
          <FontPicker value={shownFont} onChange={(f) => styleSel({ font: hasSel && f === st.font ? undefined : f }, "text:mark-font")} brandFonts={brandFonts} label={hasSel ? "Font of the selected letters" : "Font"} size="sm" />
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" className={btn(false)} onMouseDown={keep} onClick={() => stepSize(-1)} aria-label={hasSel ? "Smaller letters" : "Smaller text"} title="Smaller">
            A−
          </button>
          <span className="w-12 text-center font-mono text-2xs text-muted" aria-live="polite">
            {hasSel ? `${Math.round(sizeShare * 100)}%` : `${Math.round(st.size)}px`}
          </span>
          <button type="button" className={btn(false)} onMouseDown={keep} onClick={() => stepSize(1)} aria-label={hasSel ? "Bigger letters" : "Bigger text"} title="Bigger">
            A+
          </button>
        </div>
        <label className="flex items-center" title="Color">
          <span className="sr-only">{hasSel ? "Color of the selected letters" : "Text color"}</span>
          <input type="color" className="swatch" value={shownColor} onChange={(e) => styleSel({ color: hasSel && e.target.value === st.color ? undefined : e.target.value }, "text:mark-color")} />
        </label>
        <button type="button" className={btn(bold)} aria-pressed={bold} onMouseDown={keep} onClick={() => styleSel({ bold: hasSel ? !bold : !st.bold })} aria-label="Bold" title="Bold (⌘B)">
          <b>B</b>
        </button>
        <button type="button" className={btn(italic)} aria-pressed={italic} onMouseDown={keep} onClick={() => styleSel({ italic: !italic })} aria-label="Italic" title="Italic (⌘I)">
          <i className="font-serif">I</i>
        </button>
        <button type="button" className={btn(underline)} aria-pressed={underline} onMouseDown={keep} onClick={() => styleSel({ underline: !underline })} aria-label="Underline" title="Underline (⌘U)">
          <u>U</u>
        </button>
        <button type="button" className={btn(strike)} aria-pressed={strike} onMouseDown={keep} onClick={() => styleSel({ strike: !strike })} aria-label="Strike through" title="Strike through">
          <s>S</s>
        </button>
        <label className={`relative ${btn(!!look.highlight)}`} title="Marker pen (a color behind the letters)">
          <Icon name="marker" className="size-3.5" />
          <span className="sr-only">Marker pen color</span>
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={look.highlight ?? "#fde047"} onChange={(e) => styleSel({ highlight: e.target.value }, "text:mark-highlight")} />
        </label>
        <button
          type="button"
          className={btn(false)}
          onMouseDown={keep}
          onClick={() => {
            if (hasSel) onPatch({ marks: clearMarks(clip.text, clip.marks, sel.from, sel.to) });
            else onPatch({ marks: undefined });
          }}
          aria-label={hasSel ? "Clear the selected letters' style" : "Clear every letter's own style"}
          title="Clear styles"
        >
          <Icon name="eraser" className="size-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-label="Text"
        aria-describedby={describedBy}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        className="field min-h-16 resize-y overflow-auto whitespace-pre-wrap break-words py-1.5 leading-snug"
        style={{ minHeight: `${rows * 1.5 + 0.75}rem`, maxHeight: "14rem", fontFamily: fontStack(st.font), fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? "italic" : "normal", color: st.color, background: surfaceFor(st.color), fontSize: 15 }}
        onInput={() => commit()}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          commit();
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            // (a line break; browsers without that command type a new-line character)
            if (!document.execCommand("insertLineBreak")) document.execCommand("insertText", false, "\n");
            return;
          }
          const mod = e.metaKey || e.ctrlKey;
          if (mod && !e.altKey && ["b", "i", "u"].includes(e.key.toLowerCase())) {
            // (the browser's own bold / italic would add tags this box doesn't keep)
            e.preventDefault();
            const k = e.key.toLowerCase();
            if (k === "b") styleSel({ bold: hasSel ? !bold : !st.bold });
            else if (k === "i") styleSel({ italic: !italic });
            else styleSel({ underline: !underline });
          }
        }}
        onPaste={(e) => {
          // only the words (no styles or pictures from elsewhere)
          e.preventDefault();
          const t = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
          if (t) document.execCommand("insertText", false, t);
        }}
        onDrop={(e) => e.preventDefault()}
      />
      <p className="text-2xs text-muted" aria-live="polite">
        {hasSel ? `Styling the ${count} selected letter${count === 1 ? "" : "s"} only.` : "Select letters or a word to style just them; with nothing selected the buttons change the whole text."}
      </p>
    </div>
  );
}
