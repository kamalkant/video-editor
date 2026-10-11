import type { TrackingPoint, BlurAttachment } from "./types";
import { TRACKING_GAP_THRESHOLD_SEC } from "./types";
import { motionExpr } from "@/lib/player/motion";
import type { FullKey } from "@/lib/edit/keyframes";

const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * Builds FFmpeg filtergraph lines for any dynamic blur attachments on tracked points.
 * Applies a moving blurred or pixelated region following the tracked path.
 */
export function trackingBlurFilters(
  points: TrackingPoint[] | undefined,
  head: string,
  W: number,
  H: number,
  g: { label: (p: string) => string; add: (s: string) => void },
): string | null {
  if (!points || !points.length) return null;

  let cur = head;
  let hasAny = false;

  for (const point of points) {
    if (!point.keyframes || !point.keyframes.length) continue;

    const blurAttachments = (point.attachments || []).filter(
      (a): a is BlurAttachment => a.type === "blur",
    );

    for (const blur of blurAttachments) {
      hasAny = true;
      const bw = Math.max(16, Math.round((blur.size?.w ?? 0.12) * W));
      const bh = Math.max(16, Math.round((blur.size?.h ?? 0.12) * H));

      // Build keyframe curve for X and Y in pixels
      const fullKeys: FullKey[] = point.keyframes.map((k) => {
        const offX = blur.offset?.x ?? 0;
        const offY = blur.offset?.y ?? 0;
        const px = Math.max(0, Math.min(W - bw, (k.x + offX) * W - bw / 2));
        const py = Math.max(0, Math.min(H - bh, (k.y + offY) * H - bh / 2));
        return {
          t: k.t,
          x: px,
          y: py,
          scale: 1,
          rotation: 0,
          opacity: 1,
          scaleX: 1,
          scaleY: 1,
          skewX: 0,
          skewY: 0,
          ease: "linear",
        };
      });

      const xExpr = motionExpr(fullKeys, "x", "t");
      const yExpr = motionExpr(fullKeys, "y", "t");

      const [baseSplit, blurCrop, blurred] = [g.label("tba"), g.label("tbb"), g.label("tbc")];
      const out = g.label("tbout");

      g.add(`${cur}split[${baseSplit}][${blurCrop}]`);

      if (blur.mode === "pixelate") {
        const block = Math.max(4, Math.round(blur.intensity / 2));
        const dw = Math.max(2, Math.round(bw / block));
        const dh = Math.max(2, Math.round(bh / block));
        g.add(
          `[${blurCrop}]crop=${bw}:${bh}:${xExpr}:${yExpr},scale=${dw}:${dh}:flags=neighbor,scale=${bw}:${bh}:flags=neighbor[${blurred}]`,
        );
      } else {
        const sigma = Math.max(2, Math.round(blur.intensity));
        g.add(`[${blurCrop}]crop=${bw}:${bh}:${xExpr}:${yExpr},gblur=sigma=${sigma}[${blurred}]`);
      }

      // Determine active duration segments (hiding blur during untracked times/gaps)
      const kfs = point.keyframes;
      const segments: { start: number; end: number }[] = [];
      let curSeg = { start: kfs[0].t, end: kfs[0].t };
      for (let i = 1; i < kfs.length; i++) {
        if (kfs[i].t - kfs[i - 1].t > TRACKING_GAP_THRESHOLD_SEC) {
          segments.push(curSeg);
          curSeg = { start: kfs[i].t, end: kfs[i].t };
        } else {
          curSeg.end = kfs[i].t;
        }
      }
      segments.push(curSeg);

      const enableExpr = segments
        .map((s) => `between(t\\,${n4(Math.max(0, s.start - 0.04))}\\,${n4(s.end + 0.04)})`)
        .join("+");

      g.add(`[${baseSplit}][${blurred}]overlay=x='${xExpr}':y='${yExpr}':enable='${enableExpr}':format=auto[${out}]`);
      cur = `[${out}]`;
    }
  }

  return hasAny ? cur.slice(1, -1) : null;
}
