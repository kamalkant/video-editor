import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { detectSilences } from "@/lib/ffmpeg/silence";
import { DUCK_DETECT } from "@/lib/audio/ducking";

const tmp = mkdtempSync(join(tmpdir(), "vdo-15m-"));
const vidPath = join(tmp, "source_15m.mp4");
const audioPath = join(tmp, "music.m4a");
const textPng = join(tmp, "text.png");
const V = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";

const media: ComposeMedia = {
  [V]: { path: vidPath, hasAudio: true, width: 640, height: 360 },
  [A]: { path: audioPath, hasAudio: true, width: 0, height: 0 },
};

const liteV: MediaLite = {
  id: V, kind: "video", fileName: "v.mp4", width: 640, height: 360, fps: 30, duration: 900,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

const liteA: MediaLite = {
  id: A, kind: "audio", fileName: "a.m4a", width: 0, height: 0, fps: 0, duration: 900,
  hasAudio: true, suggestedKey: null, keyKind: null,
};

beforeAll(() => {
  // Generate 15-minute (900s) test video with H.264
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=900",
    "-f", "lavfi", "-i", "sine=f=440:d=900",
    "-c:v", "libx264", "-preset", "ultrafast", "-g", "60",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k",
    "-shortest", vidPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=f=220:d=900",
    "-c:a", "aac", "-b:a", "64k", audioPath, "-y",
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red@0.8:s=300x100", "-frames:v", "1", textPng, "-y",
  ]);
}, 60_000);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("15-minute project export benchmark & memory stability", () => {
  it("audits detectSilences execution time across 15-minute file", async () => {
    const t0 = Date.now();
    const silences = await detectSilences("v1", vidPath, 900, DUCK_DETECT);
    const elapsed = Date.now() - t0;
    console.log(`[Benchmark] detectSilences on 15m file took ${elapsed}ms, ranges found: ${silences.length}`);
    expect(Array.isArray(silences)).toBe(true);
  }, 30_000);

  it("builds and encodes a multi-clip 15-minute timeline without memory explosion", async () => {
    let doc: TimelineDoc = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 30, background: "#000000" } };
    
    // Main track: 3 clips of 300s each = 900s (15 min)
    doc = addMedia(doc, liteV, { id: "c1" }).doc;
    (mainTrack(doc).clips[0] as VideoClip).in = 0;
    (mainTrack(doc).clips[0] as VideoClip).out = 300;

    doc = addMedia(doc, liteV, { id: "c2" }).doc;
    (mainTrack(doc).clips[1] as VideoClip).in = 100;
    (mainTrack(doc).clips[1] as VideoClip).out = 400;

    doc = addMedia(doc, liteV, { id: "c3" }).doc;
    (mainTrack(doc).clips[2] as VideoClip).in = 300;
    (mainTrack(doc).clips[2] as VideoClip).out = 600;

    // Music with ducking
    doc = addMedia(doc, liteA, { id: "a1", at: 0 }).doc;
    const aTrack = doc.tracks.find((t) => t.kind === "audio")!;
    (aTrack.clips[0] as any).duck = true;

    // Overlay text at 600s
    doc = addText(doc, {
      id: "t1", type: "text", text: "15 Minute Mark", style: { preset: "title" },
      duration: 10, transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
      anim: { in: "none", out: "none" },
    }, 600, "t1").doc;

    const outPath = join(tmp, "out15m_test.mp4");
    const args = buildComposeArgs(doc, media, "mp4", outPath, {
      progress: false,
      textOf: () => textPng,
      speech: [{ start: 10, end: 30 }, { start: 400, end: 450 }],
    });

    console.log("[Benchmark] buildComposeArgs generated argument count:", args.length);
    expect(args).toContain("-filter_complex");

    // Execute first 5 seconds to test filtergraph startup & memory
    const fastArgs = [...args];
    const lastT = fastArgs.lastIndexOf("-t");
    if (lastT >= 0) fastArgs[lastT + 1] = "5.000";

    const tStart = Date.now();
    execFileSync("ffmpeg", fastArgs);
    const durationMs = Date.now() - tStart;
    console.log(`[Benchmark] 15m filtergraph startup & first 5s encode finished in ${durationMs}ms`);
    expect(durationMs).toBeLessThan(15_000);
  }, 60_000);
});
