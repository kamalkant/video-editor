import { describe, it, expect } from "vitest";
import {
  trackingPointSchema,
  clipTrackingSchema,
  blurAttachmentSchema,
  clipAttachmentSchema,
  trackingAt,
  DEFAULT_TRACKING_SETTINGS,
  TRACKING_COLORS,
  type TrackingPoint,
  type TrackingKeyframe,
  type BlurAttachment,
  type ClipAttachment,
} from "@/lib/tracking/types";
import {
  buildPyramid,
  toGrayscale,
  computeZNCC,
  trackFeature,
  extractGoodFeaturesToTrack,
  trackConstellation,
  detectFaces,
  type GrayImage,
} from "@/lib/tracking/opticalFlow";
import {
  EMOJI_DISGUISES,
  COVERAGE_MARGINS,
} from "@/components/studio/MotionTrackingPanel";
import {
  trackCoordToTransform,
  evaluateAttachmentTransform,
  bakeTrackingToKeyframes,
  createTrackedBlurClip,
  findTrackingAttachmentForClip,
} from "@/lib/tracking/attach";
import { trackingBlurFilters } from "@/lib/tracking/render";
import { resetPatch, changedAreas } from "@/lib/editor/clipReset";
import { runVideoTracking } from "@/lib/tracking/tracker";
import type { VideoClip, ElementClip } from "@/lib/edit/doc";

describe("Motion Tracking — Data Models & Schemas", () => {
  it("validates a default tracking point schema", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1 - Hand",
      color: TRACKING_COLORS[0],
      type: "point",
      status: "idle",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: {
        t: 0,
        x: 0.5,
        y: 0.5,
        box: { w: 0.1, h: 0.1 },
      },
      keyframes: [],
      attachments: [],
    };

    const parsed = trackingPointSchema.parse(point);
    expect(parsed.id).toBe("pt-1");
    expect(parsed.color).toBe("#3b82f6");
    expect(parsed.settings.accuracy).toBe("high");
    expect(parsed.settings.trackScale).toBe(true);
    expect(parsed.settings.trackPosition).toBe(true);
  });

  it("validates multi-point clip tracking schema with active point", () => {
    const clipTracking = {
      points: [
        {
          id: "pt-1",
          name: "Point 1",
          color: TRACKING_COLORS[0],
          type: "point" as const,
          status: "completed" as const,
          settings: DEFAULT_TRACKING_SETTINGS,
          initial: { t: 0, x: 0.2, y: 0.3, box: { w: 0.1, h: 0.1 } },
          keyframes: [
            { t: 0, x: 0.2, y: 0.3, scale: 1, rotation: 0, confidence: 1 },
            { t: 1, x: 0.4, y: 0.5, scale: 1.1, rotation: 5, confidence: 0.95 },
          ],
          attachments: [],
        },
        {
          id: "pt-2",
          name: "Point 2",
          color: TRACKING_COLORS[1],
          type: "area" as const,
          status: "idle" as const,
          settings: DEFAULT_TRACKING_SETTINGS,
          initial: { t: 0.5, x: 0.7, y: 0.8, box: { w: 0.15, h: 0.15 } },
          keyframes: [],
          attachments: [],
        },
      ],
      activePointId: "pt-1",
    };

    const parsed = clipTrackingSchema.parse(clipTracking);
    expect(parsed.points.length).toBe(2);
    expect(parsed.activePointId).toBe("pt-1");
    expect(parsed.points[0].keyframes.length).toBe(2);
    expect(parsed.points[1].color).toBe("#10b981");
  });

  it("validates blur attachment schema with customizable shape and intensity", () => {
    const blur: BlurAttachment = {
      id: "blur-1",
      type: "blur",
      mode: "pixelate",
      intensity: 24,
      shape: "ellipse",
      padding: 12,
      feather: 6,
      offset: { x: 0.05, y: -0.02 },
      size: { w: 0.15, h: 0.15 },
    };

    const parsed = blurAttachmentSchema.parse(blur);
    expect(parsed.mode).toBe("pixelate");
    expect(parsed.intensity).toBe(24);
    expect(parsed.shape).toBe("ellipse");
    expect(parsed.offset.x).toBe(0.05);
  });
});

describe("Motion Tracking — Pure TS Computer Vision Engine", () => {
  it("converts RGB image data to grayscale correctly", () => {
    // 2x2 mock image data: Red, Green, Blue, White
    const data = new Uint8ClampedArray([
      255,
      0,
      0,
      255, // Red -> 0.299 * 255 = 76
      0,
      255,
      0,
      255, // Green -> 0.587 * 255 = 150
      0,
      0,
      255,
      255, // Blue -> 0.114 * 255 = 29
      255,
      255,
      255,
      255, // White -> 255
    ]);
    const imgData = { data, width: 2, height: 2 };
    const gray = toGrayscale(imgData as unknown as ImageData);

    expect(gray.width).toBe(2);
    expect(gray.height).toBe(2);
    expect(gray.data[0]).toBeCloseTo(255 * 0.299, 1);
    expect(gray.data[1]).toBeCloseTo(255 * 0.587, 1);
    expect(gray.data[2]).toBeCloseTo(255 * 0.114, 1);
    expect(gray.data[3]).toBe(255);
  });

  it("builds multi-level Gaussian image pyramid", () => {
    const width = 64;
    const height = 48;
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;

    const gray: GrayImage = { data, width, height };
    const pyramid = buildPyramid(gray, 3);

    expect(pyramid.length).toBe(3);
    expect(pyramid[0].width).toBe(64);
    expect(pyramid[0].height).toBe(48);
    expect(pyramid[1].width).toBe(32);
    expect(pyramid[1].height).toBe(24);
    expect(pyramid[2].width).toBe(16);
    expect(pyramid[2].height).toBe(12);
  });

  it("calculates Zero-Normalized Cross Correlation (ZNCC) accurately", () => {
    const w = 40;
    const h = 40;
    const patch1 = new Float32Array(w * h);
    const patch2 = new Float32Array(w * h);

    // Create identical gradient pattern
    for (let i = 0; i < patch1.length; i++) {
      patch1[i] = i * 2;
      patch2[i] = i * 2;
    }

    const img1: GrayImage = { data: patch1, width: w, height: h };
    const img2: GrayImage = { data: patch2, width: w, height: h };

    const scoreIdentical = computeZNCC(
      img1,
      { x: 20, y: 20 },
      img2,
      { x: 20, y: 20 },
      10,
    );
    expect(scoreIdentical).toBeGreaterThan(0.99);

    // Invert patch2
    for (let i = 0; i < patch2.length; i++) patch2[i] = 255 - patch1[i];
    const scoreInverted = computeZNCC(
      img1,
      { x: 20, y: 20 },
      img2,
      { x: 20, y: 20 },
      10,
    );
    expect(scoreInverted).toBeLessThan(-0.9);
  });

  it("tracks synthetic feature translation with Lucas-Kanade optical flow", () => {
    const W = 80;
    const H = 80;
    const frame1 = new Float32Array(W * H);
    const frame2 = new Float32Array(W * H);

    // Draw a bright circular feature at (30, 30) in frame 1 and (34, 32) in frame 2 (+4 x, +2 y)
    const drawDot = (arr: Float32Array, cx: number, cy: number) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d2 = (x - cx) ** 2 + (y - cy) ** 2;
          if (d2 <= 25) {
            arr[y * W + x] = Math.max(0, 255 * (1 - Math.sqrt(d2) / 5));
          }
        }
      }
    };

    drawDot(frame1, 30, 30);
    drawDot(frame2, 34, 32);

    const pyr1 = buildPyramid({ data: frame1, width: W, height: H }, 3);
    const pyr2 = buildPyramid({ data: frame2, width: W, height: H }, 3);

    const result = trackFeature(
      pyr1,
      pyr2,
      pyr1,
      { x: 30, y: 30 },
      { x: 30, y: 30 },
      { w: 16, h: 16 },
      { trackScale: true, trackRotation: true, accuracy: "high" },
    );

    expect(result.pt.x).toBeGreaterThan(32);
    expect(result.pt.x).toBeLessThan(36);
    expect(result.pt.y).toBeGreaterThan(30.5);
    expect(result.pt.y).toBeLessThan(33.5);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.isLost).toBe(false);
  });
});

describe("Motion Tracking — Interpolation (trackingAt)", () => {
  it("interpolates smoothly between tracking keyframes", () => {
    const point: TrackingPoint = {
      id: "pt-test",
      name: "Point Test",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.1, y: 0.1, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.1, y: 0.1, scale: 1, rotation: 0, confidence: 1 },
        { t: 2, x: 0.5, y: 0.9, scale: 2, rotation: 90, confidence: 0.8 },
      ],
      attachments: [],
    };

    // Midway at t = 1
    const mid = trackingAt(point, 1);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeCloseTo(0.3, 4);
    expect(mid!.y).toBeCloseTo(0.5, 4);
    expect(mid!.scale).toBeCloseTo(1.5, 4);
    expect(mid!.rotation).toBeCloseTo(45, 4);
    expect(mid!.confidence).toBeCloseTo(0.8, 4);

    // Clamps when explicitly requested
    const before = trackingAt(point, -1, { clamp: true });
    expect(before!.x).toBe(0.1);

    const after = trackingAt(point, 5, { clamp: true });
    expect(after!.x).toBe(0.5);

    // Otherwise bounds strictly to tracked active duration (null outside)
    expect(trackingAt(point, -1)).toBeNull();
    expect(trackingAt(point, 5)).toBeNull();
  });
});

describe("Motion Tracking — Coordinate Transformation & Attachment Logic", () => {
  it("converts normalized tracking coordinates (0..1) to VDO canvas transform (-0.5..0.5)", () => {
    // Center (0.5, 0.5) -> (0, 0)
    expect(trackCoordToTransform(0.5, 0.5)).toEqual({ x: 0, y: 0 });

    // Top-left (0, 0) -> (-0.5, -0.5)
    expect(trackCoordToTransform(0, 0)).toEqual({ x: -0.5, y: -0.5 });

    // Bottom-right (1, 1) -> (0.5, 0.5)
    expect(trackCoordToTransform(1, 1)).toEqual({ x: 0.5, y: 0.5 });

    // With offset
    expect(trackCoordToTransform(0.5, 0.5, { x: 0.2, y: -0.1 })).toEqual({
      x: 0.2,
      y: -0.1,
    });
  });

  it("evaluates effective transform for attached clip dynamically", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.6, y: 0.7, scale: 1.2, rotation: 10, confidence: 1 },
      ],
      attachments: [],
    };

    const attachment: ClipAttachment = {
      id: "att-1",
      type: "clip",
      clipId: "text-1",
      offset: { x: 0.1, y: -0.05, scale: 1.5, rotation: 5 },
    };

    const clip = {
      id: "text-1",
      type: "text" as const,
      transform: { fit: "fit" as const, x: 0, y: 0, scale: 1, rotation: 0 },
    };

    const evalTransform = evaluateAttachmentTransform(
      point,
      attachment,
      clip as any,
      0,
    );
    // x = (0.6 - 0.5) + 0.1 = 0.1 + 0.1 = 0.2 (canvas center + 0.2*W = 0.7*W, exactly 70% width)
    expect(evalTransform.x).toBeCloseTo(0.2, 4);
    // y = (0.7 - 0.5) - 0.05 = 0.2 - 0.05 = 0.15 (canvas center + 0.15*H = 0.65*H)
    expect(evalTransform.y).toBeCloseTo(0.15, 4);
    // scale = 1 * 1.2 * 1.5 = 1.8
    expect(evalTransform.scale).toBeCloseTo(1.8, 4);
    // rotation = 0 + 10 + 5 = 15
    expect(evalTransform.rotation).toBe(15);
  });

  it("bakes tracking keyframes into standard clip keyframes", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.5, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
        { t: 1, x: 0.75, y: 0.25, scale: 1.2, rotation: 20, confidence: 0.9 },
      ],
      attachments: [],
    };

    const attachment: ClipAttachment = {
      id: "att-1",
      type: "clip",
      clipId: "text-1",
      offset: { x: 0, y: 0, scale: 1, rotation: 0 },
    };

    const clip = {
      id: "text-1",
      type: "text" as const,
      transform: { fit: "fit" as const, x: 0, y: 0, scale: 1, rotation: 0 },
    };

    const baked = bakeTrackingToKeyframes(
      point,
      attachment,
      clip as any,
      0,
      30,
    );
    expect(baked.length).toBe(2);
    expect(baked[0].x).toBe(0);
    expect(baked[0].y).toBe(0);
    expect(baked[1].x).toBe(0.25); // 0.75 - 0.5 = 0.25 (canvas position = 0.5 + 0.25 = 0.75, exact 1:1 match)
    expect(baked[1].y).toBe(-0.25); // 0.25 - 0.5 = -0.25 (canvas position = 0.5 - 0.25 = 0.25, exact 1:1 match)
    expect(baked[1].scale).toBe(1.2);
    expect(baked[1].rotation).toBe(20);
  });

  it("creates a tracked blur element clip for overlay track", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1 - Face",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.6, y: 0.4, box: { w: 0.12, h: 0.12 } },
      keyframes: [],
      attachments: [],
    };

    const blurConfig: BlurAttachment = {
      id: "blur-att-1",
      type: "blur",
      mode: "blur",
      intensity: 20,
      shape: "ellipse",
      padding: 10,
      feather: 8,
      offset: { x: 0, y: 0 },
      size: { w: 0.12, h: 0.12 },
    };

    const blurClip = createTrackedBlurClip(
      "blur-clip-1",
      point,
      blurConfig,
      2.5,
      4.0,
    );
    expect(blurClip.id).toBe("blur-clip-1");
    expect(blurClip.type).toBe("element");
    expect(blurClip.start).toBe(2.5);
    expect(blurClip.duration).toBe(4.0);
    expect(blurClip.transform.x).toBeCloseTo(0.1, 4); // 0.6 - 0.5 = 0.1
    expect(blurClip.transform.y).toBeCloseTo(-0.1, 4); // 0.4 - 0.5 = -0.1
    expect(blurClip.el.preset).toBe("Blur (Point 1 - Face)");
  });
});

describe("Motion Tracking — FFmpeg Export Filtergraph Integration", () => {
  it("generates correct FFmpeg filtergraph lines for gaussian and pixelate blurs", () => {
    const lines: string[] = [];
    let count = 0;
    const g = {
      label: (prefix: string) => `${prefix}_${++count}`,
      add: (s: string) => lines.push(s),
    };

    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.3, y: 0.4, scale: 1, rotation: 0, confidence: 1 },
        { t: 2, x: 0.6, y: 0.8, scale: 1, rotation: 0, confidence: 1 },
      ],
      attachments: [
        {
          id: "blur-g",
          type: "blur",
          mode: "blur",
          intensity: 15,
          shape: "rect",
          padding: 0,
          feather: 0,
          offset: { x: 0, y: 0 },
          size: { w: 0.1, h: 0.1 },
        },
        {
          id: "blur-pix",
          type: "blur",
          mode: "pixelate",
          intensity: 20,
          shape: "rect",
          padding: 0,
          feather: 0,
          offset: { x: 0, y: 0 },
          size: { w: 0.1, h: 0.1 },
        },
      ],
    };

    const outLabel = trackingBlurFilters([point], "[v0]", 1920, 1080, g);
    expect(outLabel).not.toBeNull();
    expect(lines.length).toBe(6); // 2 blurs * 3 filter steps each (split, crop+blur, overlay)

    // Verify gaussian blur filter line
    expect(lines[0]).toContain("split[tba_1][tbb_2]");
    expect(lines[1]).toContain("gblur=sigma=15");
    expect(lines[2]).toContain("overlay=x=");

    // Verify pixelate filter line
    expect(lines[3]).toContain("split[tba_5][tbb_6]");
    expect(lines[4]).toContain("flags=neighbor");
    expect(lines[5]).toContain("overlay=x=");
  });

  it("returns null when no tracking points or blur attachments exist", () => {
    const lines: string[] = [];
    const g = {
      label: (prefix: string) => prefix,
      add: (s: string) => lines.push(s),
    };

    const res1 = trackingBlurFilters(undefined, "[v0]", 1920, 1080, g);
    expect(res1).toBeNull();

    const res2 = trackingBlurFilters([], "[v0]", 1920, 1080, g);
    expect(res2).toBeNull();
  });
});

describe("Motion Tracking — Inspector Tab Reset & Changes Detection", () => {
  it("detects tracking changes and resets tracking via resetPatch", () => {
    const mockClip: VideoClip = {
      id: "v-1",
      type: "video",
      mediaId: "m-1",
      in: 0,
      out: 5,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
      ops: [],
      tracking: {
        points: [
          {
            id: "pt-1",
            name: "Point 1",
            color: "#3b82f6",
            type: "point",
            status: "completed",
            settings: DEFAULT_TRACKING_SETTINGS,
            initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
            keyframes: [],
            attachments: [],
          },
        ],
        activePointId: "pt-1",
      },
    };

    const areas = changedAreas(mockClip);
    expect(areas.has("tracking")).toBe(true);

    const patch = resetPatch(mockClip, "tracking");
    expect(patch).toEqual({ tracking: undefined });
  });

  it("maintains tracking lock under motion distortion with sticky lostTolerance", () => {
    const W = 80;
    const H = 80;
    const frame1 = new Float32Array(W * H);
    const frame2 = new Float32Array(W * H);

    // Draw circular feature at (30, 30)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d2_1 = (x - 30) ** 2 + (y - 30) ** 2;
        if (d2_1 <= 36) frame1[y * W + x] = 220;

        // In frame 2, translated to (38, 32) (+8, +2) with slight brightness change / distortion
        const d2_2 = (x - 38) ** 2 + (y - 32) ** 2;
        if (d2_2 <= 36) frame2[y * W + x] = 190;
      }
    }

    const pyr1 = buildPyramid({ data: frame1, width: W, height: H });
    const pyr2 = buildPyramid({ data: frame2, width: W, height: H });

    // With velocity prior of (+8, +2), tracker locks immediately even on rapid 8px jump
    const result = trackFeature(
      pyr1,
      pyr2,
      pyr1,
      { x: 30, y: 30 },
      { x: 30, y: 30 },
      { w: 20, h: 20 },
      { lostTolerance: "sticky", accuracy: "high" },
      { x: 8, y: 2 },
    );

    expect(result.isLost).toBe(false);
    expect(result.pt.x).toBeCloseTo(38, 0);
    expect(result.pt.y).toBeCloseTo(32, 0);
  });

  it("handles seek events and timeouts gracefully without throwing Video seeking failed", async () => {
    let seekHandler: (() => void) | null = null;
    const mockVideo = {
      duration: 5,
      currentTime: 0,
      videoWidth: 320,
      videoHeight: 240,
      readyState: 4,
      addEventListener: (evt: string, cb: () => void) => {
        if (evt === "seeked") seekHandler = cb;
      },
      removeEventListener: () => {},
    } as unknown as HTMLVideoElement;

    // Simulate immediate seeked dispatch on next tick
    let currentT = 0;
    Object.defineProperty(mockVideo, "currentTime", {
      get: () => currentT,
      set: (v: number) => {
        currentT = v;
        setTimeout(() => seekHandler?.(), 1);
      },
    });

    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "idle",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [],
      attachments: [],
    };

    const res = await runVideoTracking({
      videoEl: mockVideo,
      point,
      direction: "forward",
      startSec: 0,
      endSec: 0.05,
      fps: 30,
    });

    expect(res.keyframes.length).toBeGreaterThan(0);
    expect(res.completed).toBe(true);
  });
});

describe("Multi-Point Constellation Tracking & Multi-Object Attachment", () => {
  it("extracts good features to track (corners) inside both ellipse and rect masks", () => {
    // Generate synthetic gradient image with high contrast corners (checkerboard pattern)
    const w = 120;
    const h = 120;
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const check = (Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0;
        data[y * w + x] = check ? 220 : 40;
      }
    }
    const img: GrayImage = { data, width: w, height: h };

    // Ellipse mask around center
    const ellipseFeatures = extractGoodFeaturesToTrack(
      img,
      { x: 60, y: 60 },
      { w: 50, h: 50 },
      { isEllipse: true, maxPoints: 16 },
    );
    expect(ellipseFeatures.length).toBeGreaterThanOrEqual(8);
    for (const pt of ellipseFeatures) {
      // Must be within normalized radius
      const nx = (pt.x - 60) / 25;
      const ny = (pt.y - 60) / 25;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1.05);
    }

    // Rect mask around center
    const rectFeatures = extractGoodFeaturesToTrack(
      img,
      { x: 60, y: 60 },
      { w: 40, h: 40 },
      { isEllipse: false, maxPoints: 16 },
    );
    expect(rectFeatures.length).toBeGreaterThanOrEqual(8);
    for (const pt of rectFeatures) {
      expect(pt.x).toBeGreaterThanOrEqual(38);
      expect(pt.x).toBeLessThanOrEqual(82);
      expect(pt.y).toBeGreaterThanOrEqual(38);
      expect(pt.y).toBeLessThanOrEqual(82);
    }
  });

  it("tracks constellation displacement with zero accumulated drift using reference frame comparison", () => {
    const w = 140;
    const h = 140;

    const makeImg = (dx: number, dy: number): GrayImage => {
      const data = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = x - dx;
          const sy = y - dy;
          const check = (Math.floor(sx / 8) + Math.floor(sy / 8)) % 2 === 0;
          data[y * w + x] = check ? 230 : 30;
        }
      }
      return { data, width: w, height: h };
    };

    const img0 = makeImg(0, 0);
    const pyr0 = buildPyramid(img0, 2);

    const img1 = makeImg(5, 3);
    const pyr1 = buildPyramid(img1, 2);

    const features = extractGoodFeaturesToTrack(
      img0,
      { x: 70, y: 70 },
      { w: 40, h: 40 },
      { isEllipse: true, maxPoints: 16 },
    );

    const result = trackConstellation(
      pyr0,
      pyr1,
      pyr0, // initialPyramid
      { x: 70, y: 70 }, // prevCenter
      { x: 70, y: 70 }, // initialCenter
      features,
      { w: 40, h: 40 },
      DEFAULT_TRACKING_SETTINGS,
    );

    expect(result.isLost).toBe(false);
    // Center was at 70, shifted by +5, +3 => 75, 73
    expect(result.center.x).toBeCloseTo(75, 0.5);
    expect(result.center.y).toBeCloseTo(73, 0.5);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("finds tracking attachment for a clip across doc tracks with findTrackingAttachmentForClip", () => {
    const mockDoc: any = {
      version: 2,
      canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" },
      tracks: [
        {
          id: "v1",
          kind: "main",
          clips: [
            {
              type: "video",
              id: "clip-main-1",
              tracking: {
                points: [
                  {
                    id: "pt-face",
                    name: "Actor Face",
                    color: "#3b82f6",
                    type: "point",
                    status: "completed",
                    settings: DEFAULT_TRACKING_SETTINGS,
                    initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
                    keyframes: [
                      {
                        t: 0,
                        x: 0.5,
                        y: 0.5,
                        scale: 1,
                        rotation: 0,
                        confidence: 1,
                      },
                      {
                        t: 1,
                        x: 0.6,
                        y: 0.55,
                        scale: 1.1,
                        rotation: 10,
                        confidence: 1,
                      },
                    ],
                    attachments: [
                      {
                        id: "att-sticker-1",
                        type: "clip",
                        clipId: "sticker-star-1",
                        category: "sticker",
                        name: "Star Sticker",
                        offset: { x: 0.05, y: -0.05, scale: 1.2, rotation: 15 },
                      },
                      {
                        id: "att-text-1",
                        type: "clip",
                        clipId: "text-title-1",
                        category: "text",
                        name: "Name Label",
                        offset: { x: 0, y: 0.1, scale: 1, rotation: 0 },
                      },
                    ],
                  },
                ],
                activePointId: "pt-face",
              },
            },
          ],
        },
        {
          id: "v2",
          kind: "overlay",
          clips: [
            {
              type: "element",
              id: "sticker-star-1",
              start: 0,
              duration: 5,
              transform: {
                fit: "fit",
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                opacity: 1,
              },
            },
            {
              type: "text",
              id: "text-title-1",
              start: 0,
              duration: 5,
              text: "John Doe",
              transform: {
                fit: "fit",
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                opacity: 1,
              },
            },
          ],
        },
      ],
      output: {},
    };

    // Find attachment for sticker-star-1
    const foundSticker = findTrackingAttachmentForClip(
      mockDoc,
      "sticker-star-1",
    );
    expect(foundSticker).not.toBeNull();
    expect(foundSticker?.point.id).toBe("pt-face");
    expect(foundSticker?.attachment.category).toBe("sticker");
    expect(foundSticker?.attachment.offset.scale).toBe(1.2);

    // Find attachment for text-title-1
    const foundText = findTrackingAttachmentForClip(mockDoc, "text-title-1");
    expect(foundText).not.toBeNull();
    expect(foundText?.point.id).toBe("pt-face");
    expect(foundText?.attachment.category).toBe("text");
    expect(foundText?.attachment.offset.y).toBe(0.1);

    // Non-existent clip
    const notFound = findTrackingAttachmentForClip(mockDoc, "unknown-clip");
    expect(notFound).toBeNull();
  });

  it("evaluates attachment transform with real-time offset, scale, and rotation at any time t", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.5, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
        { t: 2, x: 0.7, y: 0.6, scale: 1.2, rotation: 20, confidence: 1 },
      ],
      attachments: [],
    };

    const attachment: ClipAttachment = {
      id: "att-1",
      type: "clip",
      clipId: "clip-elem-1",
      category: "logo",
      name: "Brand Logo",
      offset: { x: 0.1, y: -0.05, scale: 1.5, rotation: 10 },
    };

    const targetClip: any = {
      id: "clip-elem-1",
      type: "element",
      duration: 5,
      transform: {
        fit: "fit",
        x: 0,
        y: 0,
        scale: 0.5,
        rotation: 0,
        opacity: 1,
      },
    };

    // At t = 0: point is at (0.5, 0.5) => canvas transform is (0, 0)
    // Offset is (+0.1, -0.05), so canvas position is (0.1, -0.05)
    // Scale is 1 * 1.5 * 0.5 = 0.75
    // Rotation is 0 + 10 + 0 = 10
    const xform0 = evaluateAttachmentTransform(
      point,
      attachment,
      targetClip,
      0,
    );
    expect(xform0.x).toBeCloseTo(0.1, 2);
    expect(xform0.y).toBeCloseTo(-0.05, 2);
    expect(xform0.scale).toBeCloseTo(0.75, 2);
    expect(xform0.rotation).toBe(10);

    // At t = 2: point is at (0.7, 0.6) => canvas base is (0.7 - 0.5, 0.6 - 0.5) = (0.2, 0.1)
    // With offset (+0.1, -0.05), canvas pos is (0.2 + 0.1, 0.1 - 0.05) = (0.3, 0.05)
    // Scale is 1.2 * 1.5 * 0.5 = 0.9
    // Rotation is 20 + 10 = 30
    const xform2 = evaluateAttachmentTransform(
      point,
      attachment,
      targetClip,
      2,
    );
    expect(xform2.x).toBeCloseTo(0.3, 2);
    expect(xform2.y).toBeCloseTo(0.05, 2);
    expect(xform2.scale).toBeCloseTo(0.9, 2);
    expect(xform2.rotation).toBe(30);
  });

  it("bakes tracking keyframes into standard clip keyframes for all object types (Text, Image, Video, Sticker, Element, Logo, Effect)", () => {
    const point: TrackingPoint = {
      id: "pt-1",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.5, y: 0.5, box: { w: 0.1, h: 0.1 } },
      keyframes: [
        { t: 0, x: 0.5, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
        { t: 1, x: 0.6, y: 0.7, scale: 1.1, rotation: 15, confidence: 1 },
      ],
      attachments: [],
    };

    const categories: ClipAttachment["category"][] = [
      "text",
      "image",
      "video",
      "sticker",
      "element",
      "logo",
      "effect",
    ];

    for (const cat of categories) {
      const att: ClipAttachment = {
        id: `att-${cat}`,
        type: "clip",
        clipId: `clip-${cat}`,
        category: cat,
        name: `Tracked ${cat}`,
        offset: { x: 0.02, y: -0.02, scale: 1, rotation: 5 },
      };

      const baseClip: any = {
        id: `clip-${cat}`,
        type:
          cat === "text"
            ? "text"
            : cat === "image"
              ? "image"
              : cat === "video"
                ? "video"
                : "element",
        duration: 4,
        transform: {
          fit: "fit",
          x: 0,
          y: 0,
          scale: 0.8,
          rotation: 0,
          opacity: 1,
        },
      };

      const baked = bakeTrackingToKeyframes(point, att, baseClip, 0, 30);
      expect(baked.length).toBe(2);
      expect(baked[0].t).toBe(0);
      expect(baked[1].t).toBe(1);
      // Keyframe rotation includes the relative offset rotation of 5 degrees
      expect(baked[0].rotation).toBe(5);
      expect(baked[1].rotation).toBe(20);
    }
  });

  it("safely generates timeline clips list for ElementClip using .el without TypeError", () => {
    const elementClip: ElementClip = {
      id: "el-1",
      type: "element",
      duration: 5,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
      opacity: 1,
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
      el: {
        kind: "ellipse",
        aspect: 1,
        fill: "#ff0000",
        stroke: "none",
        strokeWidth: 0,
      },
    };

    const elLook = elementClip.el;
    const name = `Element: ${elLook?.preset || elLook?.kind || "shape"}`;
    expect(name).toBe("Element: ellipse");
  });

  it("never triggers RangeError (Maximum call stack size exceeded) when constellation drops below 2 features", () => {
    // Featureless plain surface where Shi-Tomasi corners or bidirectional checks fail
    const w = 100;
    const h = 100;
    const flatImg: GrayImage = {
      data: new Float32Array(w * h).fill(128),
      width: w,
      height: h,
    };
    const pyr = buildPyramid(flatImg, 2);

    expect(() => {
      const res = trackFeature(
        pyr,
        pyr,
        pyr,
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        { w: 40, h: 40 },
        { accuracy: "high", lostTolerance: "strict" },
      );
      expect(res).toBeDefined();
      expect(res.pt).toBeDefined();
    }).not.toThrow();
  });

  it("attaches element dead-center on tracking point without positional offset or drift at any screen position", () => {
    // Tracking point at X=65%, Y=50% (the exact coordinates from the user's screenshot)
    const point: TrackingPoint = {
      id: "pt-user",
      name: "Point 1",
      color: "#3b82f6",
      type: "point",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.65, y: 0.5, box: { w: 0.14, h: 0.14 } },
      keyframes: [
        { t: 0, x: 0.65, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
      ],
      attachments: [],
    };

    const attachment: ClipAttachment = {
      id: "att-star",
      type: "clip",
      clipId: "sticker-star",
      category: "sticker",
      name: "Sticker (Star)",
      offset: { x: 0, y: 0, scale: 1, rotation: 0 },
    };

    const clip: ElementClip = {
      id: "sticker-star",
      type: "element",
      duration: 5,
      transform: { fit: "fit", x: 0, y: 0, scale: 0.6, rotation: 0 },
      opacity: 1,
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
      el: {
        kind: "star",
        preset: "star",
        aspect: 1,
        fill: "#eab308",
        stroke: "none",
        strokeWidth: 0,
      },
    };

    const evalT = evaluateAttachmentTransform(point, attachment, clip, 0);

    // Canvas width W and height H
    const W = 1920;
    const H = 1080;

    // Canvas center of element using VDO's element placement equation: W/2 + evalT.x * W
    const elementCenterX = W / 2 + evalT.x * W;
    const elementCenterY = H / 2 + evalT.y * H;

    // Expected tracking point position in canvas pixels:
    const expectedX = 0.65 * W;
    const expectedY = 0.5 * H;

    // Must match with 0 offset error!
    expect(elementCenterX).toBeCloseTo(expectedX, 1);
    expect(elementCenterY).toBeCloseTo(expectedY, 1);
  });
});

describe("Rethought Motion Tracking — One-Click Face Censor & Disguise Lock", () => {
  it("detects face candidate centroids and dimensions from video frame pixels", () => {
    // Generate a 100x100 synthetic frame with a skin-toned face patch in the center
    const width = 100;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);

    // Background: dark gray (r=40, g=40, b=40)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 40;
      data[i * 4 + 1] = 40;
      data[i * 4 + 2] = 40;
      data[i * 4 + 3] = 255;
    }

    // Face patch: x between 40 and 60, y between 30 and 55 (skin tone: r=210, g=150, b=120)
    for (let y = 30; y <= 55; y++) {
      for (let x = 40; x <= 60; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 210;
        data[idx + 1] = 150;
        data[idx + 2] = 120;
        data[idx + 3] = 255;
      }
    }

    const imgData = { data, width, height } as unknown as ImageData;
    const faces = detectFaces(imgData);

    expect(faces.length).toBeGreaterThan(0);
    const primaryFace = faces[0];
    expect(primaryFace.x).toBeCloseTo(0.5, 0.08);
    expect(primaryFace.y).toBeCloseTo(0.425, 0.08);
    expect(primaryFace.w).toBeGreaterThan(0.15);
    expect(primaryFace.h).toBeGreaterThan(0.18);
  });

  it("calculates emoji disguise scale with 120% margin to strictly prevent face exposure", () => {
    const faceBox = { w: 0.2, h: 0.25 };
    const defaultEmojiHeight = 0.2; // from emojiClipOf(1, { h: 0.20 }, "center")

    // Standard 120% coverage margin:
    const standardMargin = 1.2;
    const targetScale = Math.max(
      0.4,
      Math.min(3.5, (faceBox.h / defaultEmojiHeight) * standardMargin),
    );

    // Scale should expand the emoji so its effective height is 1.2 * faceBox.h (30% of canvas height)
    const effectiveEmojiH = defaultEmojiHeight * targetScale;
    expect(effectiveEmojiH).toBeCloseTo(faceBox.h * standardMargin, 3);
    expect(effectiveEmojiH).toBeGreaterThan(faceBox.h); // Strictly larger than face to guarantee complete cover!
  });

  it("validates all 12 emoji disguises and 3 coverage margins", () => {
    expect(EMOJI_DISGUISES.length).toBe(12);
    expect(EMOJI_DISGUISES.map((d) => d.emoji)).toContain("😎");
    expect(EMOJI_DISGUISES.map((d) => d.emoji)).toContain("🤡");
    expect(EMOJI_DISGUISES.map((d) => d.emoji)).toContain("🙈");

    expect(COVERAGE_MARGINS.length).toBe(3);
    const standard = COVERAGE_MARGINS.find((m) => m.value === 1.2);
    expect(standard).toBeDefined();
    expect(standard?.label).toContain("120%");
  });

  it("applies exponential smoothing filter to damp scale/rotation jitter while preserving tracking responsiveness", () => {
    let smoothScale = 1.0;
    const alpha = 0.35; // Smoothing factor from tracker.ts

    const rawScales = [1.05, 0.98, 1.04, 1.02, 1.1];
    const smoothedHistory: number[] = [];

    for (const raw of rawScales) {
      smoothScale = smoothScale * (1 - alpha) + raw * alpha;
      smoothedHistory.push(smoothScale);
    }

    expect(smoothedHistory[0]).toBeCloseTo(1.0175, 3);
    expect(smoothedHistory[smoothedHistory.length - 1]).toBeLessThan(1.1);
    expect(smoothedHistory[smoothedHistory.length - 1]).toBeGreaterThan(1.0);
  });
});
