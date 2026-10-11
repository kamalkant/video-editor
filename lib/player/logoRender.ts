"use client";

import { watermarkPad, watermarkRect, type Watermark } from "../edit/doc";
import { drawLogoBadge } from "./logo";

/**
 * The logo's badge for the export (a box in its color, rounded corners, the
 * logo inside), drawn at its size on a W × H project — the same drawing as the
 * preview (lib/player/logo drawLogoBadge).
 */
export async function renderLogoPng(wm: Watermark, W: number, H: number): Promise<Blob> {
  const img = new Image();
  img.src = `/api/videos/${wm.mediaId}/source`;
  await img.decode();
  const box = watermarkRect(wm, W, H, img.naturalWidth, img.naturalHeight);
  const cv = document.createElement("canvas");
  cv.width = box.w;
  cv.height = box.h;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the logo.");
  drawLogoBadge(ctx, img, img.naturalWidth, img.naturalHeight, wm, { x: 0, y: 0, w: box.w, h: box.h }, watermarkPad(wm, W));
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the logo."))), "image/png"));
}
