import { describe, expect, it } from "vitest";
import { progressDue, PROGRESS_EVERY_MS } from "@/lib/export/localExport";

/** The browser export says how far it is a few times a second, not every 10 frames: each update re-renders the editor. */
describe("progressDue", () => {
  it("reports at most every PROGRESS_EVERY_MS", () => {
    expect(progressDue(1000, 1000 - PROGRESS_EVERY_MS + 1, false)).toBe(false);
    expect(progressDue(1000, 1000 - PROGRESS_EVERY_MS, false)).toBe(true);
  });
  it("always reports the last frame", () => {
    expect(progressDue(1000, 999, true)).toBe(true);
  });
  it("is about 4 times a second", () => {
    expect(PROGRESS_EVERY_MS).toBeGreaterThanOrEqual(200);
    expect(PROGRESS_EVERY_MS).toBeLessThanOrEqual(500);
  });
});
