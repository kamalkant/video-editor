import { describe, expect, it } from "vitest";
import { previewDraws } from "@/lib/player/previewDraw";

/**
 * The editor's preview draws while it plays, and for a moment after something changes. While an export made
 * in this browser runs it draws nothing: every progress update re-rendered the editor, which kept the preview
 * drawing 60 times a second, and that took ~22 % of the export's computer time.
 */
describe("previewDraws", () => {
  it("draws while playing, and for a while after a change", () => {
    expect(previewDraws({ playing: true, now: 100, awakeUntil: 0, suspended: false })).toBe(true);
    expect(previewDraws({ playing: false, now: 100, awakeUntil: 200, suspended: false })).toBe(true);
    expect(previewDraws({ playing: false, now: 300, awakeUntil: 200, suspended: false })).toBe(false);
  });
  it("draws nothing while an export runs", () => {
    expect(previewDraws({ playing: false, now: 100, awakeUntil: 200, suspended: true })).toBe(false);
    expect(previewDraws({ playing: true, now: 100, awakeUntil: 200, suspended: true })).toBe(false);
  });
});
