import { describe, expect, it } from "vitest";
import { encoderRoom, ENCODER_STALL_MS } from "@/lib/export/localExport";

/**
 * Safari's encoder (VideoToolbox) keeps a few frames before it gives the first one back. The export waited
 * for the queue to drop to 4 before sending more: the encoder waited for more frames, the export for the
 * encoder, and the MP4 stopped at 0% for good.
 */
describe("encoderRoom", () => {
  it("sends on while the queue is short", () => {
    expect(encoderRoom(0, 0)).toBe("go");
    expect(encoderRoom(4, 0)).toBe("go");
  });
  it("waits a moment for a longer queue to drain", () => {
    expect(encoderRoom(5, 10)).toBe("wait");
  });
  it("sends more when the encoder gives nothing back for a while: it is waiting for frames", () => {
    expect(encoderRoom(5, 150)).toBe("go");
    expect(encoderRoom(20, 150)).toBe("go");
  });
  it("keeps the memory bounded: a very long queue waits", () => {
    expect(encoderRoom(40, 150)).toBe("wait");
  });
  it("calls an encoder that gives nothing back for long stalled", () => {
    expect(encoderRoom(40, ENCODER_STALL_MS + 1)).toBe("stalled");
    expect(encoderRoom(5, ENCODER_STALL_MS + 1)).toBe("stalled");
  });

  it("gives up soon on an encoder that never gave anything back, its queue full", () => {
    expect(encoderRoom(32, 3500, false)).toBe("stalled");
    // (one that did give frames back gets the full time)
    expect(encoderRoom(32, 3500, true)).toBe("go");
    expect(encoderRoom(33, 3500, true)).toBe("wait");
  });
});
