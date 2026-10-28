import { describe, expect, it } from "vitest";
import { exportSide } from "@/lib/export/size";

/**
 * A size typed in the Export dialog is one the export can make: even (H.264 and HEVC need even sides, an odd
 * one made the browser refuse and send it to the server) and within the canvas limit (3840; 7680 was allowed
 * and the timeline then failed its check).
 */
describe("exportSide", () => {
  it("rounds to an even number", () => {
    expect(exportSide(1081)).toBe(1082);
    expect(exportSide(1080)).toBe(1080);
    expect(exportSide(719.4)).toBe(720);
    expect(exportSide(1350.6)).toBe(1350);
  });
  it("stays between 64 and 3840", () => {
    expect(exportSide(7680)).toBe(3840);
    expect(exportSide(3841)).toBe(3840);
    expect(exportSide(10)).toBe(64);
    expect(exportSide(Number.NaN)).toBe(64);
  });
});
