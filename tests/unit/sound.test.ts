import { describe, expect, it } from "vitest";
import { soundLevel } from "@/lib/player/sound";
import { assignSlots, type Slot } from "@/lib/player/videoPool";

describe("preview sound", () => {
  it("a clip whose file changes (stabilized / reversed / AI copy) never keeps two elements", () => {
    const slots: Slot[] = [];
    assignSlots(slots, [{ clipId: "a", src: "/source" }, { clipId: "b", src: "/source" }], 0, 6);
    // a's stabilized copy is ready: a moves to the new file
    const m = assignSlots(slots, [{ clipId: "a", src: "/stabilized" }, { clipId: "b", src: "/source" }], 1, 6);
    expect(slots.filter((s) => s.clipId === "a")).toHaveLength(1);
    expect(slots[m.get("a")!].src).toBe("/stabilized");
    // and b keeps its element
    expect(slots.filter((s) => s.clipId === "b")).toHaveLength(1);
  });

  it("volume up to 200%, fades, ducking", () => {
    const c = { volume: 1.5, fadeIn: 1, fadeOut: 1 };
    expect(soundLevel(c, 5, 10)).toBeCloseTo(1.5);
    expect(soundLevel(c, 0.5, 10)).toBeCloseTo(0.75);
    expect(soundLevel(c, 9.5, 10)).toBeCloseTo(0.75);
    expect(soundLevel({ volume: 0, fadeIn: 0, fadeOut: 0 }, 5, 10)).toBe(0);
    expect(soundLevel({ volume: 3, fadeIn: 0, fadeOut: 0 }, 5, 10)).toBe(2);
    expect(soundLevel({ volume: 1, fadeIn: 0, fadeOut: 0 }, 5, 10, { duck: 0.3 })).toBeCloseTo(0.3);
  });

  it("a crossfade: the outgoing clip's sound falls while the incoming one's rises", () => {
    const c = { volume: 1, fadeIn: 0, fadeOut: 0 };
    const tr = { type: "crossfade" as const, s: 4, d: 1 };
    expect(soundLevel(c, 4.5, 5, { t: 4.5, trOut: tr })).toBeCloseTo(0.5);
    expect(soundLevel(c, 0.5, 5, { t: 4.5, trIn: tr })).toBeCloseTo(0.5);
    expect(soundLevel(c, 0, 5, { t: 4, trIn: tr })).toBe(0);
    expect(soundLevel(c, 3, 5, { t: 3, trOut: tr })).toBe(1);
  });
});
