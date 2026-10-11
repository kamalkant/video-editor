import { describe, expect, it } from "vitest";
import {
  trackingAt,
  type TrackingPoint,
  type TrackingKeyframe,
  DEFAULT_TRACKING_SETTINGS,
} from "@/lib/tracking/types";
import { trackingBlurFilters } from "@/lib/tracking/render";

function makePoint(id: string, keyframes: TrackingKeyframe[] = []): TrackingPoint {
  return {
    id,
    name: id,
    status: "completed",
    type: "area",
    color: "#38bdf8",
    initial: {
      t: 0,
      x: 0.5,
      y: 0.5,
      box: { w: 0.2, h: 0.2 },
    },
    keyframes,
    settings: { ...DEFAULT_TRACKING_SETTINGS },
    attachments: [
      {
        id: "att-blur",
        type: "blur",
        mode: "blur",
        shape: "ellipse",
        intensity: 25,
        padding: 10,
        feather: 8,
        offset: { x: 0, y: 0 },
        size: { w: 0.12, h: 0.12 },
      },
    ],
  };
}

describe("Duration & Range-Bounded Video Motion Tracking", () => {
  it("returns initial position when no keyframes exist (setup / preview mode)", () => {
    const pt = makePoint("pt1", []);
    const pos = trackingAt(pt, 5.0);
    expect(pos).not.toBeNull();
    expect(pos?.x).toBe(0.5);
    expect(pos?.y).toBe(0.5);
    expect(pos?.box?.w).toBe(0.2);
  });

  it("returns interpolated position inside tracked keyframe span", () => {
    const kfs: TrackingKeyframe[] = [
      { t: 2.0, x: 0.2, y: 0.3, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 3.0, x: 0.4, y: 0.5, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 4.0, x: 0.6, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];
    const pt = makePoint("pt1", kfs);

    // Midpoint at t=2.5s
    const mid = trackingAt(pt, 2.5);
    expect(mid).not.toBeNull();
    expect(mid?.x).toBeGreaterThan(0.2);
    expect(mid?.x).toBeLessThan(0.4);

    // Exact keyframe at t=3.0s
    const at3 = trackingAt(pt, 3.0);
    expect(at3).not.toBeNull();
    expect(at3?.x).toBeCloseTo(0.4, 2);
    expect(at3?.y).toBeCloseTo(0.5, 2);
  });

  it("returns null outside the tracked keyframe duration (hiding blur before start & after end)", () => {
    const kfs: TrackingKeyframe[] = [
      { t: 2.0, x: 0.2, y: 0.3, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 4.0, x: 0.6, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];
    const pt = makePoint("pt1", kfs);

    // Before tracked start (t = 1.0s < 2.0s - 0.05s)
    expect(trackingAt(pt, 1.0)).toBeNull();
    expect(trackingAt(pt, 1.9)).toBeNull();

    // After tracked end (t = 5.0s > 4.0s + 0.05s)
    expect(trackingAt(pt, 4.2)).toBeNull();
    expect(trackingAt(pt, 6.0)).toBeNull();
  });

  it("returns null during untracked interior gaps between separate duration segments", () => {
    // Segment 1: 2s to 4s (keyframes spaced <= 1.25s)
    // Gap: 4s to 8s (4-second gap > 1.25s)
    // Segment 2: 8s to 10s (keyframes spaced <= 1.25s)
    const kfs: TrackingKeyframe[] = [
      { t: 2.0, x: 0.1, y: 0.1, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 3.0, x: 0.2, y: 0.2, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 4.0, x: 0.3, y: 0.3, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      // Untracked gap of 4 seconds
      { t: 8.0, x: 0.7, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 9.0, x: 0.8, y: 0.8, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 10.0, x: 0.9, y: 0.9, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];
    const pt = makePoint("pt1", kfs);

    // Active in Segment 1 (t = 3.0s)
    expect(trackingAt(pt, 3.0)).not.toBeNull();

    // In untracked gap (t = 6.0s)
    expect(trackingAt(pt, 6.0)).toBeNull();

    // Active in Segment 2 (t = 9.0s)
    expect(trackingAt(pt, 9.0)).not.toBeNull();
  });

  it("generates FFmpeg overlay enable between expressions matching active keyframe spans", () => {
    const kfs: TrackingKeyframe[] = [
      { t: 2.0, x: 0.2, y: 0.3, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 3.0, x: 0.4, y: 0.5, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 4.0, x: 0.6, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      // Gap > 1.25s
      { t: 8.0, x: 0.7, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 9.0, x: 0.8, y: 0.8, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 10.0, x: 0.9, y: 0.9, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];
    const pt = makePoint("pt1", kfs);

    const addedLines: string[] = [];
    let labelIdx = 0;
    const filter = trackingBlurFilters([pt], "[0:v]", 1920, 1080, {
      label: (p) => `${p}_${++labelIdx}`,
      add: (s) => addedLines.push(s),
    });

    expect(filter).toBeDefined();
    const overlayLine = addedLines.find((l) => l.includes("overlay="));
    expect(overlayLine).toBeDefined();
    // Verify enable expression is present and bounds the active duration
    expect(overlayLine).toContain("enable=");
    expect(overlayLine).toContain("between(t\\,1.96\\,4.04)");
    expect(overlayLine).toContain("between(t\\,7.96\\,10.04)");
  });

  it("handles keyframe retention logic cleanly for multi-run tracking", () => {
    const existingKfs: TrackingKeyframe[] = [
      { t: 1.0, x: 0.1, y: 0.1, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 2.0, x: 0.2, y: 0.2, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 3.0, x: 0.3, y: 0.3, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];

    // Simulate tracking a new 2-second range from 6s to 8s
    const startTime = 6.0;
    const endTime = 8.0;

    const keyframeMap = new Map<number, TrackingKeyframe>();
    for (const k of existingKfs) {
      if (k.t < startTime - 0.04 || k.t > endTime + 0.04) {
        keyframeMap.set(k.t, k);
      }
    }

    // New frames from 6s to 8s
    const newKfs: TrackingKeyframe[] = [
      { t: 6.0, x: 0.6, y: 0.6, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 7.0, x: 0.7, y: 0.7, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
      { t: 8.0, x: 0.8, y: 0.8, scale: 1, rotation: 0, confidence: 1, box: { w: 0.2, h: 0.2 } },
    ];
    for (const k of newKfs) {
      keyframeMap.set(k.t, k);
    }

    const merged = Array.from(keyframeMap.values()).sort((a, b) => a.t - b.t);
    expect(merged).toHaveLength(6);
    expect(merged[0].t).toBe(1.0);
    expect(merged[2].t).toBe(3.0);
    expect(merged[3].t).toBe(6.0);
    expect(merged[5].t).toBe(8.0);
  });
});
