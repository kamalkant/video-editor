import { describe, expect, it } from "vitest";
import {
  ASPECT_PRESETS,
  EXPORT_FORMATS,
  VIDEO_PRESETS,
  type AspectPresetId,
  type ExportFormat,
} from "@/lib/export/presets";

describe("Export & Share Redesign Unit Tests", () => {
  it("defines standard aspect ratio presets with accurate mathematical ratios", () => {
    const p169 = ASPECT_PRESETS.find((a) => a.id === "16:9")!;
    const p916 = ASPECT_PRESETS.find((a) => a.id === "9:16")!;
    const p11 = ASPECT_PRESETS.find((a) => a.id === "1:1")!;
    const p45 = ASPECT_PRESETS.find((a) => a.id === "4:5")!;
    const custom = ASPECT_PRESETS.find((a) => a.id === "custom")!;

    expect(p169.ratio).toBeCloseTo(16 / 9, 4);
    expect(p916.ratio).toBeCloseTo(9 / 16, 4);
    expect(p11.ratio).toBe(1);
    expect(p45.ratio).toBeCloseTo(4 / 5, 4);
    expect(custom.ratio).toBeNull();
  });

  it("calculates bi-directional proportional dimensions when aspect ratio is locked", () => {
    const calcHeightFromWidth = (width: number, ratio: number) =>
      Math.max(16, Math.min(4320, Math.round(width / ratio)));
    const calcWidthFromHeight = (height: number, ratio: number) =>
      Math.max(16, Math.min(7680, Math.round(height * ratio)));

    // 16:9 Widescreen
    expect(calcHeightFromWidth(1920, 16 / 9)).toBe(1080);
    expect(calcWidthFromHeight(1080, 16 / 9)).toBe(1920);

    // 9:16 Vertical
    expect(calcHeightFromWidth(1080, 9 / 16)).toBe(1920);
    expect(calcWidthFromHeight(1920, 9 / 16)).toBe(1080);

    // 1:1 Square
    expect(calcHeightFromWidth(1080, 1)).toBe(1080);
    expect(calcWidthFromHeight(1080, 1)).toBe(1080);

    // 4:5 Instagram Portrait
    expect(calcHeightFromWidth(1080, 4 / 5)).toBe(1350);
    expect(calcWidthFromHeight(1350, 4 / 5)).toBe(1080);
  });

  it("verifies format metadata contains custom document badges and color accents", () => {
    const mp4 = EXPORT_FORMATS.find((f) => f.id === "mp4")!;
    const hevc = EXPORT_FORMATS.find((f) => f.id === "hevc")!;
    const av1 = EXPORT_FORMATS.find((f) => f.id === "av1")!;
    const webm = EXPORT_FORMATS.find((f) => f.id === "webm")!;
    const webmAlpha = EXPORT_FORMATS.find((f) => f.id === "webm-alpha")!;

    expect(mp4.badge).toBe("MP4");
    expect(mp4.color).toBe("blue");
    expect(mp4.recommended).toBe(true);

    expect(hevc.badge).toBe("HEVC");
    expect(hevc.color).toBe("purple");

    expect(av1.badge).toBe("AV1");
    expect(av1.color).toBe("amber");

    expect(webm.badge).toBe("WEBM");
    expect(webm.color).toBe("emerald");

    expect(webmAlpha.badge).toBe("ALPHA");
    expect(webmAlpha.color).toBe("pink");
  });

  it("categorizes formats correctly for Video, Image, and Audio tabs", () => {
    const videoFormats = EXPORT_FORMATS.filter(
      (f) => f.group === "video" || f.id === "webm-alpha" || f.id === "mov-alpha",
    );
    const imageFormats = EXPORT_FORMATS.filter((f) => f.group === "image");
    const audioFormats = EXPORT_FORMATS.filter((f) => f.group === "audio");

    expect(videoFormats.map((f) => f.id)).toContain("mp4");
    expect(videoFormats.map((f) => f.id)).toContain("hevc");
    expect(videoFormats.map((f) => f.id)).toContain("av1");
    expect(videoFormats.map((f) => f.id)).toContain("webm");
    expect(videoFormats.map((f) => f.id)).toContain("webm-alpha");
    expect(videoFormats.map((f) => f.id)).toContain("mov-alpha");

    expect(imageFormats.map((f) => f.id)).toEqual(["gif", "png", "jpg"]);
    expect(audioFormats.map((f) => f.id)).toEqual(["mp3", "m4a", "wav"]);
  });

  it("matches Quick Presets to standard social platform dimensions", () => {
    const yt = VIDEO_PRESETS.find((p) => p.id === "youtube")!;
    const shorts = VIDEO_PRESETS.find((p) => p.id === "shorts")!;
    const portrait = VIDEO_PRESETS.find((p) => p.id === "portrait")!;
    const square = VIDEO_PRESETS.find((p) => p.id === "square")!;

    expect(yt.width).toBe(1920);
    expect(yt.height).toBe(1080);

    expect(shorts.width).toBe(1080);
    expect(shorts.height).toBe(1920);

    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1350);

    expect(square.width).toBe(1080);
    expect(square.height).toBe(1080);
  });

  it("calculates job progress smoothly from active encoding step instead of fictitious progress property", () => {
    const calcProgress = (job: any, starting: boolean, exporting: boolean) => {
      if (job?.state === "done" && !exporting) return 100;
      if (!job || !job.steps || job.steps.length === 0) {
        return 0;
      }
      const runningStep = job.steps.find((s: any) => s.state === "running");
      if (runningStep && typeof runningStep.percent === "number") {
        return Math.min(100, Math.max(0, runningStep.percent));
      }
      const total = job.steps.reduce((acc: number, s: any) => acc + (s.state === "done" ? 100 : (s.percent ?? 0)), 0);
      return Math.min(100, Math.max(0, Math.round(total / job.steps.length)));
    };

    // Starting state starts at 0%
    expect(calcProgress(null, true, true)).toBe(0);

    // Active local export step with 0% rendered
    const job0 = {
      state: "running",
      steps: [
        { kind: "derive", state: "done", percent: 100 },
        { kind: "mp4", state: "running", percent: 0 },
        { kind: "poster", state: "pending", percent: 0 },
      ],
    };
    expect(calcProgress(job0, false, true)).toBe(0);

    // 1% active export matches header 1% exactly
    const job1 = {
      state: "running",
      steps: [
        { kind: "derive", state: "done", percent: 100 },
        { kind: "mp4", state: "running", percent: 1 },
        { kind: "poster", state: "pending", percent: 0 },
      ],
    };
    expect(calcProgress(job1, false, true)).toBe(1);

    // Halfway through frames (50%) matches header 50%
    const job50 = {
      state: "running",
      steps: [
        { kind: "derive", state: "done", percent: 100 },
        { kind: "mp4", state: "running", percent: 50 },
        { kind: "poster", state: "pending", percent: 0 },
      ],
    };
    expect(calcProgress(job50, false, true)).toBe(50);

    // Finished encoding (100%)
    const jobNearDone = {
      state: "running",
      steps: [
        { kind: "derive", state: "done", percent: 100 },
        { kind: "mp4", state: "running", percent: 100 },
        { kind: "poster", state: "pending", percent: 0 },
      ],
    };
    expect(calcProgress(jobNearDone, false, true)).toBe(100);

    // Done state
    const jobDone = {
      state: "done",
      steps: [
        { kind: "derive", state: "done", percent: 100 },
        { kind: "mp4", state: "done", percent: 100 },
        { kind: "poster", state: "done", percent: 100 },
      ],
    };
    expect(calcProgress(jobDone, false, false)).toBe(100);
  });
});
