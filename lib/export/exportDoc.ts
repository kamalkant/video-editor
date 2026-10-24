import type { TimelineDoc, VideoClip } from "../edit/doc";
import type { OutputSettings } from "../edit/spec";
import { needsAlpha, type ExportFormat } from "./presets";

/** Does any video clip remove its background (a key or AI removal)? */
export const anyRemovalIn = (doc: TimelineDoc) => doc.tracks.some((t) => t.clips.some((c) => c.type === "video" && (c as VideoClip).ops.some((o) => o.enabled)));

/**
 * The timeline an export of `format` actually makes (the project itself stays as it is), so the Export dialog's
 * preview shows the file: formats without see-through put a transparent project on black (PNG keeps it); a
 * see-through format of a project that removes a background is made see-through; a social size is the project
 * at that size (clips fitted, lib/player/layout).
 */
export function exportDocOf(doc: TimelineDoc, format: ExportFormat, o: { size?: { width: number; height: number }; output?: Partial<OutputSettings> } = {}): TimelineDoc {
  let d = o.output ? { ...doc, output: { ...doc.output, ...o.output } } : doc;
  if (d.canvas.background === "transparent" && !needsAlpha(format) && format !== "png") d = { ...d, canvas: { ...d.canvas, background: "#000000" } };
  // (see-through formats with background removal: the canvas goes see-through so the server's alpha check passes)
  if (needsAlpha(format) && anyRemovalIn(d) && d.canvas.background !== "transparent" && !d.canvas.backdrop) d = { ...d, canvas: { ...d.canvas, background: "transparent" } };
  if (o.size && (o.size.width !== d.canvas.width || o.size.height !== d.canvas.height)) d = { ...d, canvas: { ...d.canvas, width: o.size.width, height: o.size.height } };
  return d;
}
