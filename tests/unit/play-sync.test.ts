import { describe, expect, it } from "vitest";
import { playSync } from "@/lib/player/sync";

/**
 * How a playing <video> is kept at the timeline's time: a small drift is steered (2 % faster or slower), only a
 * big one is seeked. The Export dialog's preview seeked at 0.4 s, and a seek empties the decoder: in Safari
 * the preview jumped and stuttered all the time (the editor's preview steers, and plays smoothly).
 */
describe("playSync", () => {
  it("leaves a video that's in time at its speed", () => {
    expect(playSync(10, 10.05, 1)).toEqual({ rate: 1 });
    expect(playSync(10, 10.05, 2)).toEqual({ rate: 2 });
  });
  it("steers a small drift instead of seeking", () => {
    expect(playSync(10, 10.5, 1)).toEqual({ rate: 1.02 }); // behind: a little faster
    expect(playSync(10.5, 10, 1)).toEqual({ rate: 0.98 }); // ahead: a little slower
  });
  it("seeks only a big drift", () => {
    expect(playSync(10, 12, 1)).toEqual({ rate: 1, seek: 12 });
    // (at double speed a drift counts for less)
    expect(playSync(10, 12, 2)).toEqual({ rate: 2.04 });
  });
});
