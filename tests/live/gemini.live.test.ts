import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Real Gemini calls, on the user's key. They cost money, so they never run
 * by themselves: GEMINI_LIVE=1 runs the cheap ones (under $0.10 together),
 * GEMINI_LIVE_VEO=1 also makes one 4-second Veo Lite clip (about $0.20).
 *   GEMINI_LIVE=1 npx vitest run tests/live
 * The key comes from AI Tools → Settings (or .env.local), never from this file.
 */
const LIVE = process.env.GEMINI_LIVE === "1";
const tmp = mkdtempSync(join(tmpdir(), "VDO-live-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe.skipIf(!LIVE)("Gemini, for real (paid)", () => {
  let videoId = "";
  it("the key works and the models are there", async () => {
    // the key saved in AI Tools → Settings (the editor's real storage), else a GEMINI_API_KEY line in .env.local
    const { existsSync, readFileSync } = await import("node:fs");
    const saved = join(process.cwd(), "storage", "settings", "ai-keys.json");
    const fromSettings = existsSync(saved)
      ? (
          JSON.parse(readFileSync(saved, "utf8")) as {
            gemini?: { key?: string };
          }
        ).gemini?.key
      : undefined;
    const env = join(process.cwd(), ".env.local");
    const fromEnv = existsSync(env)
      ? /^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/m.exec(
          readFileSync(env, "utf8"),
        )?.[1]
      : undefined;
    if (fromSettings || fromEnv)
      process.env.GEMINI_API_KEY = fromSettings ?? fromEnv;
    process.env.VDO_STORAGE = join(tmp, "storage");
    delete process.env.GEMINI_FAKE;
    const g = await import("@/lib/ai/gemini");
    expect(g.geminiState()).toBe("ready");
    const models = await g.listModels();
    console.log("models:", {
      text: await g.pickModel("text"),
      image: await g.pickModel("image-lite"),
      tts: await g.pickModel("tts"),
      video: await g.pickModel("video-lite"),
      count: models.length,
    });
    expect(models.length).toBeGreaterThan(0);
  });

  it("subtitles for a 3-second spoken line (~$0.001)", async () => {
    const aiff = join(tmp, "say.aiff");
    execFileSync("say", [
      "-o",
      aiff,
      "Hello, this is a test of the subtitles.",
    ]);
    const mp4 = join(tmp, "say.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x240:r=10:d=4",
      "-i",
      aiff,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      mp4,
    ]);
    const { importFile } = await import("@/lib/videos");
    videoId = (await importFile(mp4, "say.mp4")).id;
    const { makeSubtitles, translateLines } =
      await import("@/lib/ai/subtitles");
    const r = await makeSubtitles(videoId, 0, 3.5, "en");
    console.log("subtitles:", r);
    expect(
      r.segments
        .map((s) => s.text)
        .join(" ")
        .toLowerCase(),
    ).toContain("test");
    const hi = await translateLines(["Hello, this is a test."], "hi");
    console.log("hindi:", hi);
    expect(hi).toHaveLength(1);
  });

  it("one small picture (~$0.03)", async () => {
    const { generateImage } = await import("@/lib/ai/image");
    const m = await generateImage({
      prompt: "a simple blue sky with one white cloud",
      purpose: "picture",
      aspect: "16:9",
      quality: "lite",
    });
    expect(m.kind).toBe("image");
  });

  it("one short Gemini voice (< $0.01)", async () => {
    const { geminiSpeak } = await import("@/lib/ai/voice");
    const m = await geminiSpeak(
      "Hello from the editor.",
      "Kore",
      "warm and friendly",
    );
    expect(m.kind).toBe("audio");
    expect(m.info.duration).toBeGreaterThan(0.5);
  });

  it.skipIf(process.env.GEMINI_LIVE_VEO !== "1")(
    "one 4-second Veo Lite clip (~$0.20)",
    async () => {
      const { getVeo, startVeo } = await import("@/lib/ai/veo");
      const job = await startVeo({
        prompt: "a calm sea at sunset, gentle waves",
        aspect: "16:9",
        seconds: 4,
        tier: "lite",
        resolution: "720p",
      });
      let j = await getVeo(job.id);
      for (let i = 0; i < 90 && j?.state === "working"; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        j = await getVeo(job.id);
      }
      console.log("veo:", j?.state, j?.error);
      expect(j?.state).toBe("ready");
    },
    8 * 60_000,
  );
});
