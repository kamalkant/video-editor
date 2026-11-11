import { emptyDoc, mainStarts, mainTrack, type Canvas, type ElementLook, type TimelineDoc } from "../../edit/doc";
import { addBlank, addElement, addText, setClip } from "../../edit/docEdit";
import { DEFAULT_OUTPUT } from "../../edit/spec";
import { elementClipOf, elementPreset } from "../../elements/catalog";
import { textClipOfStyle } from "../../text/layout";
import { CANVAS, offsetOf, textScale } from "./layout";
import type { Layer, LayerOverride, Ratio, TemplateSpec } from "./spec";

/** A layer with its changes for this shape applied. */
function forRatio<L extends Layer>(l: L, r: Ratio): (L & LayerOverride) | null {
  const o = l.over?.[r];
  if (o?.hidden) return null;
  return { ...l, ...(o ?? {}), at: o?.at ?? l.at };
}

/**
 * A template as a normal project in one shape: Video 1 holds one blank scene per scene (its backdrop shows until
 * a slot is filled), text and graphics go on overlay tracks. Everything stays editable.
 */
export function build(spec: TemplateSpec, r: Ratio): TimelineDoc {
  const c = CANVAS[r];
  const canvas: Canvas = { width: c.width, height: c.height, fps: 30, background: "#000000" };
  let doc = emptyDoc(DEFAULT_OUTPUT, canvas);
  // the scenes, in order, on Video 1
  const sceneIds: string[] = [];
  spec.scenes.forEach((sc, i) => {
    const res = addBlank(doc, i, { fill: sc.base ?? "#000000", duration: sc.length, backdrop: sc.fill, id: `${spec.id}-s${i}`.slice(0, 40) });
    doc = res.doc;
    sceneIds.push(res.clipId);
    if (sc.transitionIn && i > 0) doc = setClip(doc, res.clipId, { transitionIn: sc.transitionIn });
    const slot = sc.layers.find((l) => l.kind === "media" && !l.frame);
    if (slot && slot.kind === "media")
      doc = setClip(doc, res.clipId, { placeholder: { role: slot.role, accepts: slot.accepts, ...(slot.keywords ? { keywords: slot.keywords } : {}) } });
  });
  // (with transitions the scenes overlap: their starts come from Video 1 itself)
  const starts = mainStarts(mainTrack(doc).clips);
  const ts = textScale(r);
  spec.scenes.forEach((sc, i) => {
    const at0 = starts[i] ?? 0;
    for (const raw of sc.layers) {
      const l = forRatio(raw, r);
      if (!l) continue;
      const from = at0 + (l.from ?? 0);
      const length = Math.max(0.3, Math.min(l.length ?? sc.length - (l.from ?? 0), sc.length - (l.from ?? 0)));
      const pos = offsetOf(l.at, r);
      if (l.kind === "text") {
        const base = textClipOfStyle(l.style);
        const clip = {
          ...base,
          text: l.words ?? base.text,
          duration: length,
          style: { ...base.style, ...(l.size ? { size: l.size } : {}), ...(l.color ? { color: l.color } : {}) },
          transform: { ...base.transform, x: pos.x, y: pos.y, scale: (base.transform.scale ?? 1) * ts },
          ...(l.anim ? { anim: l.anim } : {}),
        };
        doc = addText(doc, clip, from).doc;
      } else if (l.kind === "element" || (l.kind === "media" && l.frame)) {
        const id = l.kind === "element" ? l.preset : l.frame!;
        const p = elementPreset(id);
        if (!p) continue;
        const e = elementClipOf(p, canvas);
        const look = (l.kind === "element" ? l.look : undefined) as Partial<ElementLook> | undefined;
        const res = addElement(doc, { ...e, duration: length, el: { ...e.el, ...(look ?? {}) }, transform: { ...e.transform, x: pos.x, y: pos.y } }, from);
        doc = res.doc;
        if (l.kind === "media")
          doc = setClip(doc, res.clipId, { placeholder: { role: l.role, accepts: l.accepts, ...(l.keywords ? { keywords: l.keywords } : {}) } });
      }
    }
  });
  return doc;
}

/** The slots a built project still has to fill (for the "Replace media" list). */
export function placeholdersOf(doc: TimelineDoc): { clipId: string; role: string; accepts: "video" | "image" | "both" }[] {
  const out: { clipId: string; role: string; accepts: "video" | "image" | "both" }[] = [];
  for (const t of doc.tracks)
    for (const c of t.clips as { id: string; placeholder?: { role: string; accepts: "video" | "image" | "both" } }[])
      if (c.placeholder) out.push({ clipId: c.id, role: c.placeholder.role, accepts: c.placeholder.accepts });
  return out;
}
