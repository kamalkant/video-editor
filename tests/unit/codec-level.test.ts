import { describe, expect, it } from "vitest";
import { avcCodecs, hevcCodec } from "@/lib/export/codecs";

/**
 * The browser export's H.264 / HEVC codec string has a level big enough for the export's size and frame rate.
 * A fixed "avc1.4d002a" (Main, level 4.2) was refused for 21:9 (2560 × 1080) and 4K, so those always went to
 * the server (and a Free plan, which the server holds to 1080p, couldn't make them at all).
 */
describe("avcCodecs", () => {
  it("asks for High, then Main, then Baseline, at one level", () => {
    expect(avcCodecs(1920, 1080, 30)).toEqual(["avc1.640028", "avc1.4d0028", "avc1.420028"]);
  });

  it("picks the smallest level that holds the size and the frame rate", () => {
    expect(avcCodecs(1280, 720, 30)[0]).toBe("avc1.64001f"); // 3.1
    expect(avcCodecs(1920, 1080, 30)[0]).toBe("avc1.640028"); // 4.0
    expect(avcCodecs(1080, 1920, 30)[0]).toBe("avc1.640028"); // 4.0 (tall)
    expect(avcCodecs(1920, 1080, 60)[0]).toBe("avc1.64002a"); // 4.2
    expect(avcCodecs(2560, 1080, 30)[0]).toBe("avc1.640032"); // 5.0: the 21:9 preset
    expect(avcCodecs(3840, 2160, 30)[0]).toBe("avc1.640033"); // 5.1
    expect(avcCodecs(3840, 2160, 60)[0]).toBe("avc1.640034"); // 5.2
    expect(avcCodecs(3840, 3840, 30)[0]).toBe("avc1.64003c"); // 6.0 (the canvas maximum)
  });
});

describe("hevcCodec", () => {
  it("picks the HEVC Main level for the size and frame rate", () => {
    expect(hevcCodec(1920, 1080, 30)).toBe("hvc1.1.6.L120.90"); // 4.0
    expect(hevcCodec(1920, 1080, 60)).toBe("hvc1.1.6.L123.90"); // 4.1
    expect(hevcCodec(3840, 2160, 30)).toBe("hvc1.1.6.L150.90"); // 5.0
    expect(hevcCodec(3840, 2160, 60)).toBe("hvc1.1.6.L153.90"); // 5.1
    expect(hevcCodec(1280, 720, 30)).toBe("hvc1.1.6.L93.90"); // 3.1
  });
});
