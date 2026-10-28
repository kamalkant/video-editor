import { describe, expect, it, vi } from "vitest";
import { assignSlots, MAX_VIDEO_ELEMENTS, type Slot, type Want } from "../../lib/player/videoPool";
import { createClock } from "../../lib/editor/clock";

describe("Hardware-accelerated Media Pooling & Decoder Safety", () => {
  it("enforces safe maximum concurrent video decoder cap", () => {
    expect(MAX_VIDEO_ELEMENTS).toBeLessThanOrEqual(8);
    expect(MAX_VIDEO_ELEMENTS).toBe(6);
  });

  it("reuses video element slots without exceeding hardware decoder cap under load", () => {
    const slots: Slot[] = [];
    const wants: Want[] = Array.from({ length: 20 }, (_, i) => ({
      clipId: `clip-${i}`,
      src: `/media/video-${i % 4}.mp4`,
    }));

    // First assignment
    const assigned = assignSlots(slots, wants, 1000, MAX_VIDEO_ELEMENTS);

    // Number of active slots must never exceed MAX_VIDEO_ELEMENTS
    expect(slots.length).toBeLessThanOrEqual(MAX_VIDEO_ELEMENTS);
    expect(assigned.size).toBe(MAX_VIDEO_ELEMENTS);

    // Repeated playback seek at different timestamp
    const nextWants: Want[] = [
      { clipId: "clip-99", src: "/media/video-0.mp4" },
      { clipId: "clip-0", src: "/media/video-0.mp4" },
    ];
    const reassigned = assignSlots(slots, nextWants, 2000, MAX_VIDEO_ELEMENTS);

    expect(slots.length).toBeLessThanOrEqual(MAX_VIDEO_ELEMENTS);
    expect(reassigned.get("clip-0")).toBeDefined();
  });
});

describe("Timeline 60 FPS Clock Decoupling", () => {
  it("supports decoupled clock sampling without forced component subscription", () => {
    const clock = createClock();
    expect(clock.get()).toBe(0);

    const subscriber = vi.fn();
    const unsub = clock.subscribe(subscriber);

    clock.set(2.5);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(clock.get()).toBe(2.5);

    unsub();
    clock.set(5.0);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(clock.get()).toBe(5.0);
  });
});
