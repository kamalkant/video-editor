import { findBeats } from "@/lib/audio/beats";
import { AbortedError, runFfmpeg, SAFE_INPUT } from "@/lib/ffmpeg/run";
import { apiError } from "@/lib/http/errors";
import { getVideo, sourcePath } from "@/lib/videos";

export const runtime = "nodejs";

const RATE = 22050;
/** The longest piece of sound looked at once (10 minutes is about 53 MB of samples). */
const MAX_SECONDS = 10 * 60;

/** Beats in the clip's sound: { in, out } (source seconds) → { bpm, beats: [source seconds] }. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/beats">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This file is no longer here.");
  if (!video.info.hasAudio) return Response.json({ bpm: 0, beats: [], hasAudio: false });
  let body: { in?: unknown; out?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  const start = typeof body.in === "number" && Number.isFinite(body.in) ? Math.max(0, body.in) : 0;
  const end = typeof body.out === "number" && Number.isFinite(body.out) ? Math.min(video.info.duration || body.out, body.out) : video.info.duration;
  const len = Math.min(MAX_SECONDS, end - start);
  if (!(len > 2)) return apiError(400, "too_short", "The clip is too short to find a beat.");
  try {
    const pcm = (
      await runFfmpeg([...SAFE_INPUT, "-ss", start.toFixed(3), "-t", len.toFixed(3), "-i", sourcePath(id), "-map", "0:a:0", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "pipe:1"], {
        collectStdout: true,
        timeoutMs: 2 * 60_000,
        signal: request.signal,
      })
    ).stdout;
    // (a copy: the decoded bytes may not start on a 4-byte boundary)
    const samples = new Float32Array(new Uint8Array(pcm).buffer.slice(0, Math.floor(pcm.byteLength / 4) * 4));
    const r = findBeats(samples, RATE);
    return Response.json({ bpm: r.bpm, beats: r.beats.map((t) => Math.round((start + t) * 1000) / 1000), hasAudio: true });
  } catch (err) {
    if (err instanceof AbortedError) return apiError(499, "canceled", "Canceled.");
    return apiError(500, "beats_failed", "Couldn't find the beat in this sound.");
  }
}
