import type { OutputSettings } from "./spec";

/** Area kept by "Crop empty area", in source pixels (even width/height). */
export type CropBox = { x: number; y: number; w: number; h: number };

/**
 * Output size and frame rate for export settings (pure: safe in the browser).
 * With a crop box the picture starts from the cropped size; a chosen smaller
 * width only scales down, never up.
 */
export function outputGeometry(s: OutputSettings, info: { width: number; height: number; fps: number }, crop?: CropBox | null) {
  const baseW = crop ? crop.w : info.width;
  const baseH = crop ? crop.h : info.height;
  const chosen = s.resolution === "original" ? undefined : s.resolution;
  const width = chosen !== undefined && chosen < baseW ? chosen : undefined;
  const fps = s.fps === "original" ? undefined : s.fps;
  const outW = width ?? baseW;
  const outH = width ? Math.round((baseH * width) / baseW / 2) * 2 : baseH;
  return { width, fps, outW, outH, outFps: fps ?? info.fps };
}
