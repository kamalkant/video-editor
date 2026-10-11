import { clipLength, mainStarts, mainTrack, srcAt, type TimelineDoc } from "./doc";

/**
 * The video frame Video 1 shows at timeline second t: which upload, and the second in it
 * (trim, speed and reverse applied). null when a picture, a blank or nothing is there.
 */
export function mainFrameAt(doc: TimelineDoc, t: number): { mediaId: string; src: number } | null {
  const clips = mainTrack(doc).clips;
  const starts = mainStarts(clips);
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i];
    const s = starts[i];
    if (t < s - 1e-6 || t > s + clipLength(c) + 1e-6) continue;
    if (c.type !== "video") return null;
    return { mediaId: c.mediaId, src: srcAt(c, Math.max(0, Math.min(clipLength(c), t - s))) };
  }
  return null;
}
