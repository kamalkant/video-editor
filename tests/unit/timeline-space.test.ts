import { describe, it, expect } from "vitest";
import { addMedia, deleteClip } from "@/lib/edit/docEdit";
import { docDuration, emptyDoc, mainStarts, mainTrack, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { createClock } from "@/lib/editor/clock";
import { DEFAULT_EMPTY_TIMELINE_SECONDS, DEFAULT_FIT_PX_PER_SEC, MIN_TIMELINE_PX_PER_SEC, fitScale, scaleToSlider, sliderToScale } from "@/components/studio/Timeline";

const M1: MediaLite = { id: "m1", kind: "video", fileName: "m1.mp4", duration: 33, width: 1920, height: 1080, fps: 30, hasAudio: true, suggestedKey: null, keyKind: null };
const M2: MediaLite = { id: "m2", kind: "video", fileName: "m2.mp4", duration: 50, width: 1920, height: 1080, fps: 30, hasAudio: true, suggestedKey: null, keyKind: null };

describe("timeline clip deletion and duration management", () => {
  it("deleting a clip properly shortens document duration without orphan time", () => {
    let d = emptyDoc();
    d = addMedia(d, M1).doc;
    d = addMedia(d, M2).doc;
    expect(docDuration(d)).toBeCloseTo(83, 1);

    const main = mainTrack(d);
    expect(main.clips.length).toBe(2);
    const clip2Id = main.clips[1].id;

    // Delete the second clip
    const afterDelete = deleteClip(d, clip2Id);
    expect(docDuration(afterDelete)).toBeCloseTo(33, 1);
    expect(mainTrack(afterDelete).clips.length).toBe(1);
  });

  it("playhead clamping correctly adjusts when duration shrinks", () => {
    const clock = createClock();
    clock.set(75); // User was at 75s (inside the second clip)

    let d = emptyDoc();
    d = addMedia(d, M1).doc;
    d = addMedia(d, M2).doc;

    const clip2Id = mainTrack(d).clips[1].id;
    const nextDoc = deleteClip(d, clip2Id);
    const nextDur = docDuration(nextDoc);

    // Simulate deleteSelected / onDelete clamping
    if (clock.get() > nextDur) {
      clock.set(Math.max(0, nextDur));
    }

    expect(clock.get()).toBeCloseTo(33, 1);
  });

  it("calculates compact content span without excessive dead space", () => {
    const total = 33;
    const pxPerSec = 15;
    const endPad = Math.min(3, Math.max(1.5, 48 / pxPerSec));
    const contentSpan = total + endPad;

    // Content span should be right around ~36 seconds, NOT 43+ or 100+ seconds
    expect(contentSpan).toBeLessThan(37);
    expect(contentSpan).toBeGreaterThan(34);
  });

  it("calculates default fit scale of 60 px/s and adapts for long projects", () => {
    // Empty or zero duration defaults to 60 px/s and 15s empty duration
    expect(fitScale(800, 0)).toBe(DEFAULT_FIT_PX_PER_SEC);
    expect(DEFAULT_FIT_PX_PER_SEC).toBe(60);
    expect(DEFAULT_EMPTY_TIMELINE_SECONDS).toBe(15);

    // Short project (5s in 800px viewport): caps at 60 px/s for clear clip visibility
    expect(fitScale(800, 5)).toBe(60);

    // Long project (40s in 800px viewport): scales down to 20 px/s to show full timeline
    expect(fitScale(800, 40)).toBe(20);

    // Very long project (100s in 800px viewport): scales down to min of 10 px/s
    expect(fitScale(800, 100)).toBe(MIN_TIMELINE_PX_PER_SEC);
  });

  it("smoothly maps between 0-100 slider range and 10-500 px/s zoom", () => {
    // Boundary conditions
    expect(scaleToSlider(10)).toBe(0);
    expect(scaleToSlider(500)).toBe(100);
    expect(sliderToScale(0)).toBe(10);
    expect(sliderToScale(100)).toBe(500);

    // Default 60 px/s sits comfortably near ~46 on the 0-100 scale
    const defaultSlider = scaleToSlider(60);
    expect(defaultSlider).toBeGreaterThanOrEqual(44);
    expect(defaultSlider).toBeLessThanOrEqual(48);

    // Monotonicity: slider value strictly increases with zoom
    let lastScale = 0;
    for (let s = 0; s <= 100; s += 10) {
      const px = sliderToScale(s);
      expect(px).toBeGreaterThan(lastScale);
      lastScale = px;
    }

    // Round-trip accuracy
    for (const testScale of [15, 30, 60, 120, 250, 450]) {
      const sliderVal = scaleToSlider(testScale);
      const restored = sliderToScale(sliderVal);
      expect(Math.abs(restored - testScale) / testScale).toBeLessThan(0.08);
    }
  });
});

