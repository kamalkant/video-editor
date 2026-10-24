import { describe, expect, it } from "vitest";
import { encodeTimeoutMs } from "@/lib/jobs/queue";

const MIN = 60_000;
const HD = { width: 1920, height: 1080, fps: 30 };

// VP9 at 1080p30 on two threads makes about 0.42 s of video a second: a fixed 30 minutes stopped long exports
describe("how long an export encode may run", () => {
  it("keeps the floor for short videos", () => {
    expect(encodeTimeoutMs(30 * MIN, 60, HD)).toBe(30 * MIN);
    expect(encodeTimeoutMs(15 * MIN, 60, HD)).toBe(15 * MIN);
  });

  it("gives a 10-minute 1080p30 VP9 export (about 24 minutes) room, and a 30-minute one 3 hours", () => {
    expect(encodeTimeoutMs(30 * MIN, 600, HD)).toBe(60 * MIN);
    expect(encodeTimeoutMs(30 * MIN, 1800, HD)).toBe(180 * MIN);
  });

  it("allows more for a bigger frame or a higher frame rate, never less for a smaller one", () => {
    expect(encodeTimeoutMs(30 * MIN, 600, { width: 3840, height: 2160, fps: 30 })).toBe(240 * MIN);
    expect(encodeTimeoutMs(30 * MIN, 600, { width: 1920, height: 1080, fps: 60 })).toBe(120 * MIN);
    expect(encodeTimeoutMs(30 * MIN, 600, { width: 1280, height: 720, fps: 30 })).toBe(60 * MIN);
  });
});
