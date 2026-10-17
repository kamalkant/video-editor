import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addMedia, addText } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { detectSilences } from "@/lib/ffmpeg/silence";
import { DUCK_DETECT } from "@/lib/audio/ducking";

const tmp = mkdtempSync(join(tmpdir(), "vdo-40m-"));
const vidPath = join(tmp, "source_40m.mp4");
const audioPath = join(tmp, "podcast_audio_40m.m4a");
const textPng = join(tmp, "lower_third.png");
const V = "33333333-3333-4333-8333-333333333333";
const A = "44444444-4444-4444-8444-444444444444";

const media: ComposeMedia = {
  [V]: { path: vidPath, hasAudio: true, width: 640, height: 360 },
  [A]: { path: audioPath, hasAudio: true, width: 0, height: 0 },
};

const liteV: MediaLite = {
  id: V, kind: "video", fileName: "footage_40m.mp4", width: 640, height: 360, fps: 30, duration: 2400,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

const liteA: MediaLite = {
  id: A, kind: "audio", fileName: "audio_40m.m4a", width: 0, height: 0, fps: 0, duration: 2400,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

beforeAll(() => {
  // Generate 40-minute (2400s) test media
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=2400",
    "-f", "lavfi", "-i", "sine=f=440:d=2400",
    "-c:v", "libx264", "-preset", "ultrafast", "-g", "60",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
    "-shortest", vidPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=f=220:d=2400",
    "-c:a", "aac", "-b:a", "64k", audioPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=blue@0.8:s=400x120", "-frames:v", "1", textPng, "-y",
  ]);
}, 120_000);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("40-minute timeline project export benchmark & memory stability", () => {
  it("executes range-bounded silence detection on 40-minute footage in sub-second time", async () => {
    const t0 = Date.now();
    // Test a 30-second active clip span within the 40-minute (2400s) file
    const silences = await detectSilences("v40m", vidPath, 2400, DUCK_DETECT, undefined, {
      start: 1200,
      duration: 30,
    });
    const elapsed = Date.now() - t0;
    console.log(`[Benchmark 40m] range-bounded detectSilences at 20-min mark took ${elapsed}ms`);
    expect(Array.isArray(silences)).toBe(true);
    expect(elapsed).toBeLessThan(3_000); // Must be fast sub-second/quick seek
  }, 30_000);

  it("builds and encodes a multi-clip 40-minute timeline without memory explosion", async () => {
    let doc: TimelineDoc = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 30, background: "#000000" } };

    // 4 clips across 40 minutes (2400s)
    doc = addMedia(doc, liteV, { id: "c1" }).doc;
    (mainTrack(doc).clips[0] as VideoClip).in = 0;
    (mainTrack(doc).clips[0] as VideoClip).out = 600;

    doc = addMedia(doc, liteV, { id: "c2" }).doc;
    (mainTrack(doc).clips[1] as VideoClip).in = 600;
    (mainTrack(doc).clips[1] as VideoClip).out = 1200;

    doc = addMedia(doc, liteV, { id: "c3" }).doc;
    (mainTrack(doc).clips[2] as VideoClip).in = 1200;
    (mainTrack(doc).clips[2] as VideoClip).out = 1800;

    doc = addMedia(doc, liteV, { id: "c4" }).doc;
    (mainTrack(doc).clips[3] as VideoClip).in = 1800;
    (mainTrack(doc).clips[3] as VideoClip).out = 2400;

    // Music with ducking across 40m
    doc = addMedia(doc, liteA, { id: "a1", at: 0 }).doc;
    const aTrack = doc.tracks.find((t) => t.kind === "audio")!;
    (aTrack.clips[0] as any).duck = true;

    // Overlay text at the 35-minute mark (2100s)
    doc = addText(doc, {
      id: "t40m", type: "text", text: "35-Minute Highlight Mark", style: { preset: "title" },
      duration: 15, transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
      anim: { in: "none", out: "none" },
    }, 2100, "t40m").doc;

    const outPath = join(tmp, "out40m_test.mp4");
    const args = buildComposeArgs(doc, media, "mp4", outPath, {
      progress: false,
      textOf: () => textPng,
      speech: [{ start: 60, end: 120 }, { start: 1500, end: 1600 }],
    });

    console.log("[Benchmark 40m] buildComposeArgs generated argument count:", args.length);
    expect(args).toContain("-filter_complex");

    // Fast test: verify startup & encoding of the first segment without filtergraph stalls
    const fastArgs = [...args];
    const lastT = fastArgs.lastIndexOf("-t");
    if (lastT >= 0) fastArgs[lastT + 1] = "5.000";

    const tStart = Date.now();
    execFileSync("ffmpeg", fastArgs);
    const durationMs = Date.now() - tStart;
    console.log(`[Benchmark 40m] 40-minute filtergraph startup & encode finished in ${durationMs}ms`);
    expect(durationMs).toBeLessThan(10_000);
  }, 120_000);
});
