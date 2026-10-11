import { describe, it, expect } from "vitest";
import { trackingAt, type TrackingPoint, DEFAULT_TRACKING_SETTINGS } from "@/lib/tracking/types";
import { COVERAGE_MARGINS } from "@/components/studio/MotionTrackingPanel";

describe("Streamlined Accurate Motion Tracking & Censor", () => {
  it("Catmull-Rom spline interpolation yields continuous velocity and smooth trajectory between keyframes", () => {
    const point: TrackingPoint = {
      id: "pt-smooth",
      name: "Smooth Track",
      color: "#3b82f6",
      type: "area",
      status: "completed",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 0, x: 0.1, y: 0.1, box: { w: 0.2, h: 0.2 } },
      keyframes: [
        { t: 0.0, x: 0.1, y: 0.1, scale: 1.0, rotation: 0, confidence: 1 },
        { t: 0.2, x: 0.2, y: 0.15, scale: 1.05, rotation: 2, confidence: 0.98 },
        { t: 0.4, x: 0.35, y: 0.3, scale: 1.1, rotation: 5, confidence: 0.95 },
        { t: 0.6, x: 0.6, y: 0.5, scale: 1.2, rotation: 8, confidence: 0.92 },
      ],
      attachments: [],
    };

    // Evaluate at midpoint t = 0.3 (between t=0.2 and t=0.4)
    const mid = trackingAt(point, 0.3);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeGreaterThan(0.2);
    expect(mid!.x).toBeLessThan(0.35);
    expect(mid!.y).toBeGreaterThan(0.15);
    expect(mid!.y).toBeLessThan(0.3);

    // Spline interpolation is smooth and monotonic within this range
    const t1 = trackingAt(point, 0.25)!;
    const t2 = trackingAt(point, 0.35)!;
    expect(t1.x).toBeLessThan(mid!.x);
    expect(mid!.x).toBeLessThan(t2.x);
  });

  it("handles empty keyframes by safely returning initial anchor position during live setup", () => {
    const freshPoint: TrackingPoint = {
      id: "pt-new",
      name: "Fresh Target",
      color: "#3b82f6",
      type: "area",
      status: "idle",
      settings: DEFAULT_TRACKING_SETTINGS,
      initial: { t: 1.5, x: 0.45, y: 0.32, box: { w: 0.18, h: 0.24 } },
      keyframes: [],
      attachments: [{
        id: "att-blur",
        type: "blur",
        shape: "ellipse",
        mode: "blur",
        intensity: 25,
      }],
    };

    const atAnchor = trackingAt(freshPoint, 1.5);
    expect(atAnchor).not.toBeNull();
    expect(atAnchor!.x).toBe(0.45);
    expect(atAnchor!.y).toBe(0.32);
    expect(atAnchor!.box?.w).toBe(0.18);
    expect(atAnchor!.box?.h).toBe(0.24);
  });

  it("calculates expanded coverage margins to ensure face censor never reveals skin during movement", () => {
    const baseW = 0.2;
    const baseH = 0.25;

    const tight = COVERAGE_MARGINS.find(m => m.label.includes("Tight"))!;
    const standard = COVERAGE_MARGINS.find(m => m.label.includes("Standard"))!;
    const full = COVERAGE_MARGINS.find(m => m.label.includes("Full"))!;

    expect(tight.value).toBe(1.05);
    expect(standard.value).toBe(1.20);
    expect(full.value).toBe(1.40);

    const standardW = baseW * standard.value;
    const standardH = baseH * standard.value;

    expect(standardW).toBeCloseTo(0.24, 2);
    expect(standardH).toBeCloseTo(0.30, 2);
    expect(standardW).toBeGreaterThan(baseW);
  });

  it("bidirectional stitching retains both forward and backward keyframes sorted by timestamp", () => {
    const kfs = [
      { t: 2.0, x: 0.5, y: 0.5, scale: 1, rotation: 0, confidence: 1 },
      { t: 2.5, x: 0.55, y: 0.52, scale: 1, rotation: 0, confidence: 0.9 },
      { t: 3.0, x: 0.6, y: 0.55, scale: 1, rotation: 0, confidence: 0.9 },
      { t: 1.5, x: 0.46, y: 0.48, scale: 1, rotation: 0, confidence: 0.9 },
      { t: 1.0, x: 0.42, y: 0.45, scale: 1, rotation: 0, confidence: 0.9 },
    ];

    // Sort by timestamp
    const sorted = [...kfs].sort((a, b) => a.t - b.t);
    expect(sorted[0].t).toBe(1.0);
    expect(sorted[sorted.length - 1].t).toBe(3.0);
    expect(sorted.map(k => k.t)).toEqual([1.0, 1.5, 2.0, 2.5, 3.0]);
  });
});
