import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// its own storage, the pretend Gemini, and no network at all
const tmp = mkdtempSync(join(tmpdir(), "VDO-gem-"));
process.env.VDO_STORAGE = join(tmp, "storage");
process.env.GEMINI_FAKE = "1";
const fetchSpy = vi.fn(() =>
  Promise.reject(new Error("no network in fake mode")),
);
vi.stubGlobal("fetch", fetchSpy);
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(tmp, { recursive: true, force: true });
});

let videoId = "";
beforeAll(async () => {
  const src = join(tmp, "talk.mp4");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=s=320x240:r=10:d=8",
    "-f",
    "lavfi",
    "-i",
    "sine=f=300:d=8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    src,
  ]);
  const { importFile } = await import("@/lib/videos");
  videoId = (await importFile(src, "talk.mp4")).id;
});

describe("Gemini features, with the pretend Gemini (nothing sent, nothing paid)", () => {
  it("subtitles: timed phrases for a range, made once and then reused", async () => {
    const { makeSubtitles, translateLines } =
      await import("@/lib/ai/subtitles");
    const a = await makeSubtitles(videoId, 1, 7, "auto");
    expect(a.cached).toBe(false);
    expect(a.segments.length).toBeGreaterThan(1);
    expect(
      a.segments.every((s) => s.start >= 0 && s.end <= 6 && s.end > s.start),
    ).toBe(true);
    const b = await makeSubtitles(videoId, 1, 7, "auto");
    expect(b.cached).toBe(true);
    expect(await translateLines(["Hello", "Bye"], "hi")).toEqual([
      "[hi] Hello",
      "[hi] Bye",
    ]);
    await expect(makeSubtitles(videoId, 0, 0.1, "en")).rejects.toThrow(
      /too short/,
    );
  });

  it("a picture and a background land in My Assets as pictures of the project's shape, marked as Gemini's", async () => {
    const { generateImage } = await import("@/lib/ai/image");
    const bg = await generateImage({
      prompt: "a news studio",
      purpose: "background",
      aspect: "9:16",
      quality: "lite",
    });
    expect(bg.kind).toBe("image");
    expect(bg.info.height).toBeGreaterThan(bg.info.width);
    expect(bg.ai).toMatchObject({
      by: "gemini",
      what: "background",
      prompt: "a news studio",
    });
    expect(bg.fileName).toMatch(/^Gemini - a news studio/);
  });

  it("a Gemini voice becomes a sound upload; the same line is made only once", async () => {
    const { geminiSpeak } = await import("@/lib/ai/voice");
    const a = await geminiSpeak(
      "Good evening, here is the news.",
      "Kore",
      "like a news anchor",
    );
    expect(a.kind).toBe("audio");
    expect(a.info.duration).toBeGreaterThan(1);
    const b = await geminiSpeak(
      "Good evening, here is the news.",
      "Kore",
      "like a news anchor",
    );
    expect(b.id).toBe(a.id);
    await expect(geminiSpeak("x", "Nobody", "")).rejects.toThrow(
      /Gemini voices/,
    );
  });

  it("a Veo video: one at a time, then a video with sound in My Assets", async () => {
    const { getVeo, startVeo } = await import("@/lib/ai/veo");
    const job = await startVeo({
      prompt: "a sunset over the sea",
      aspect: "16:9",
      seconds: 4,
      tier: "lite",
      resolution: "720p",
    });
    expect(job.state).toBe("working");
    await expect(
      startVeo({
        prompt: "another",
        aspect: "16:9",
        seconds: 4,
        tier: "lite",
        resolution: "720p",
      }),
    ).rejects.toThrow(/already being made/);
    await expect(
      startVeo({
        prompt: "x",
        aspect: "16:9",
        seconds: 4,
        tier: "lite",
        resolution: "1080p",
      }),
    ).rejects.toThrow(/8 seconds/);
    let j = await getVeo(job.id);
    for (let i = 0; i < 60 && j?.state === "working"; i++) {
      await new Promise((r) => setTimeout(r, 250));
      j = await getVeo(job.id);
    }
    expect(j?.state).toBe("ready");
    const { getVideo } = await import("@/lib/videos");
    const m = await getVideo(j!.mediaId!);
    expect(m?.kind).toBe("video");
    expect(m?.info.hasAudio).toBe(true);
    expect(Math.round(m!.info.duration)).toBe(4);
  });

  it("the 24-hour cleanup keeps what Gemini made (it was paid for) and still removes other old files", async () => {
    const { listVideos } = await import("@/lib/videos");
    const { cleanupOld, storagePath } = await import("@/lib/storage");
    const all = await listVideos();
    const old = Date.now() / 1000 - 3 * 24 * 3600;
    for (const v of all) utimesSync(storagePath("videos", v.id), old, old);
    await cleanupOld();
    const left = await listVideos();
    expect(left.every((v) => v.ai)).toBe(true);
    expect(left.length).toBe(all.filter((v) => v.ai).length);
    expect(all.some((v) => !v.ai)).toBe(true);
  });

  it("never touched the network", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
