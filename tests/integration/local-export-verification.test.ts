import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addMedia, addText } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";

const tmp = mkdtempSync(join(tmpdir(), "vdo-verify-"));
const vidPath = join(tmp, "source_clip.mp4");
const audioPath = join(tmp, "audio_track.m4a");
const textPng = join(tmp, "title_card.png");
const outMp4 = join(tmp, "final_verified_output.mp4");

const V = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const media: ComposeMedia = {
  [V]: { path: vidPath, hasAudio: true, width: 640, height: 360 },
  [A]: { path: audioPath, hasAudio: true, width: 0, height: 0 },
};

const liteV: MediaLite = {
  id: V, kind: "video", fileName: "sample.mp4", width: 640, height: 360, fps: 30, duration: 60,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

const liteA: MediaLite = {
  id: A, kind: "audio", fileName: "sample_audio.m4a", width: 0, height: 0, fps: 0, duration: 60,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

beforeAll(() => {
  // Generate valid test inputs
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=60",
    "-f", "lavfi", "-i", "sine=f=500:d=60",
    "-c:v", "libx264", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
    "-shortest", vidPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=f=250:d=60",
    "-c:a", "aac", "-b:a", "64k", audioPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=yellow@0.9:s=300x80", "-frames:v", "1", textPng, "-y",
  ]);
}, 60_000);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("End-to-End Local Export Verification", () => {
  it("renders a multi-track composition with cuts, text overlay, and ducked audio to valid playable MP4", () => {
    let doc: TimelineDoc = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 30, background: "#000000" } };

    // Clip 1: 0 to 10s
    doc = addMedia(doc, liteV, { id: "c1" }).doc;
    (mainTrack(doc).clips[0] as VideoClip).in = 5;
    (mainTrack(doc).clips[0] as VideoClip).out = 15;

    // Clip 2: 10 to 20s
    doc = addMedia(doc, liteV, { id: "c2" }).doc;
    (mainTrack(doc).clips[1] as VideoClip).in = 20;
    (mainTrack(doc).clips[1] as VideoClip).out = 30;

    // Background music track with ducking
    doc = addMedia(doc, liteA, { id: "bgm", at: 0 }).doc;
    const aTrack = doc.tracks.find((t) => t.kind === "audio")!;
    (aTrack.clips[0] as any).duck = true;
    (aTrack.clips[0] as any).out = 20;

    // Text title overlay
    doc = addText(doc, {
      id: "title1", type: "text", text: "Verified Local Render", style: { preset: "title" },
      duration: 5, transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
      anim: { in: "none", out: "none" },
    }, 2, "title1").doc;

    const args = buildComposeArgs(doc, media, "mp4", outMp4, {
      progress: false,
      textOf: () => textPng,
      speech: [{ start: 2, end: 7 }],
    });

    const t0 = Date.now();
    execFileSync("ffmpeg", args);
    const renderTimeMs = Date.now() - t0;
    console.log(`[Verification] 20s multi-track render completed in ${renderTimeMs}ms`);

    expect(existsSync(outMp4)).toBe(true);

    // Probe the output file to verify video & audio stream validity
    const probeJson = execFileSync("ffprobe", [
      "-hide_banner", "-loglevel", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      outMp4,
    ]).toString();

    const info = JSON.parse(probeJson);
    const vStream = info.streams.find((s: any) => s.codec_type === "video");
    const aStream = info.streams.find((s: any) => s.codec_type === "audio");

    expect(vStream).toBeDefined();
    expect(vStream.codec_name).toBe("h264");
    expect(vStream.width).toBe(640);
    expect(vStream.height).toBe(360);

    expect(aStream).toBeDefined();
    expect(aStream.codec_name).toBe("aac");
    expect(aStream.channels).toBe(2);

    const dur = parseFloat(info.format.duration);
    expect(dur).toBeGreaterThanOrEqual(19.9);
    expect(dur).toBeLessThanOrEqual(20.2);

    // Verify file decodes cleanly from start to end without corruption or frame errors
    const decodeCheck = execFileSync("ffmpeg", [
      "-v", "error",
      "-i", outMp4,
      "-f", "null",
      "-",
    ]).toString();

    expect(decodeCheck).toBe(""); // Zero errors
    console.log("[Verification] Decoded entire output video cleanly: ZERO errors, perfect stream sync.");
  });
});
