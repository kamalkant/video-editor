import { DEFAULT_TRANSFORM, mainTrack, type TimelineDoc, type Transform, type VideoClip } from "../edit/doc";

/** What the file needs to be copied as it is (from the server's probe). */
export type PassInfo = { width: number; height: number; fps: number; videoCodec: string; audioCodec: string | null; hasAudio: boolean; alpha?: boolean };

/** A timeline that only cuts one file: its parts, in order (seconds into the file). */
export type PassPlan = { mediaId: string; parts: { in: number; out: number }[]; withSound: boolean };

const sameTransform = (t: Transform) =>
  t.x === DEFAULT_TRANSFORM.x &&
  t.y === DEFAULT_TRANSFORM.y &&
  t.scale === DEFAULT_TRANSFORM.scale &&
  !t.crop &&
  !t.rotation &&
  !t.flipX &&
  !t.flipY &&
  !t.skewX &&
  !t.skewY &&
  (t.scaleX ?? 1) === 1 &&
  (t.scaleY ?? 1) === 1 &&
  !t.corners;

/** A clip that shows its file exactly as it is (a cut and nothing else). */
function plain(c: VideoClip): boolean {
  const x = c as VideoClip & Record<string, unknown>;
  return (
    !c.ops.some((o) => o.enabled) &&
    sameTransform(c.transform) &&
    (c.speed ?? 1) === 1 &&
    !c.reversed &&
    !c.loop &&
    !c.stabilize &&
    !c.denoise &&
    !c.loudness &&
    c.volume === 1 &&
    !c.muted &&
    !c.fadeIn &&
    !c.fadeOut &&
    !c.volumeAutomation?.length &&
    !c.detachedAudioId &&
    !x.color &&
    !x.mask &&
    !(x.patches as unknown[] | undefined)?.length &&
    !x.transitionIn &&
    !x.keyframes &&
    !x.opacity &&
    !x.tracking &&
    !x.generation
  );
}

/**
 * Can this MP4 export copy the file's own video and sound instead of drawing every frame again? Only a
 * timeline of plain cuts of one H.264 file, at its own size and frame rate, with nothing on top. Null: no.
 */
export function passthroughPlan(doc: TimelineDoc, info: (mediaId: string) => PassInfo | null): PassPlan | null {
  if (doc.canvas.backdrop || doc.watermark || doc.smartMix?.enabled) return null;
  const o = doc.output;
  if (o.resolution !== "original" || o.fps !== "original" || o.crop.enabled || o.loudness) return null;
  const main = mainTrack(doc);
  if (main.hidden || main.muted || !main.clips.length) return null;
  if (doc.tracks.some((t) => t !== main && t.clips.length)) return null;
  const clips = main.clips as VideoClip[];
  if (clips.some((c) => c.type !== "video")) return null;
  const mediaId = clips[0].mediaId;
  if (clips.some((c) => c.mediaId !== mediaId || !plain(c))) return null;
  const m = info(mediaId);
  if (!m || m.alpha || m.videoCodec !== "h264") return null;
  if (m.width !== doc.canvas.width || m.height !== doc.canvas.height) return null;
  if (Math.abs(m.fps - doc.canvas.fps) > 0.01) return null;
  const withSound = o.audio !== "remove" && m.hasAudio;
  if (withSound && m.audioCodec !== "aac") return null;
  return { mediaId, parts: clips.map((c) => ({ in: c.in, out: c.out })), withSound };
}

/** Stream copy starts a part only on a keyframe: does every part start on one (within half a frame)? */
export function cutsOnKeyframes(parts: { in: number }[], keyframes: number[], fps: number): boolean {
  const tol = 0.5 / Math.max(1, fps);
  return parts.every((p) => keyframes.some((k) => Math.abs(k - p.in) <= tol));
}

/**
 * FFmpeg arguments for one part's picture, copied (no encoder): from its keyframe, exactly its frames.
 * (The sound is made in one pass at the end: copied AAC parts each add a few milliseconds and drift.)
 */
export function partArgs(src: string, part: { in: number; out: number }, fps: number, out: string): string[] {
  const frames = Math.max(1, Math.round((part.out - part.in) * fps));
  return ["-ss", part.in.toFixed(6), "-i", src, "-map", "0:v:0", "-c", "copy", "-frames:v", String(frames), "-avoid_negative_ts", "make_zero", "-an", "-y", out];
}

/** FFmpeg arguments that join the parts listed in `list` (a concat file) into one picture-only file, copied. */
export function joinArgs(list: string, out: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-y", out];
}

/** The final MP4: the joined picture copied, and the parts' sound cut exactly from the file and encoded once (AAC). */
export function muxArgs(video: string, src: string, parts: { in: number; out: number }[], withSound: boolean, out: string): string[] {
  if (!withSound) return ["-i", video, "-map", "0:v:0", "-c", "copy", "-movflags", "+faststart", "-y", out];
  const trims = parts.map((p, i) => `[1:a:0]atrim=start=${p.in.toFixed(6)}:end=${p.out.toFixed(6)},asetpts=PTS-STARTPTS[a${i}]`).join(";");
  const graph = `${trims};${parts.map((_, i) => `[a${i}]`).join("")}concat=n=${parts.length}:v=0:a=1[a]`;
  return ["-i", video, "-i", src, "-filter_complex", graph, "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", "-y", out];
}
