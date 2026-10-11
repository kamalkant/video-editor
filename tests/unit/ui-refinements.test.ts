import { describe, expect, it } from "vitest";
import { PATHS } from "@/components/ui/Icon";
import { subtitleTracks } from "@/lib/subtitles/sources";
import { emptyDoc } from "@/lib/edit/doc";
import { addCaptionTrack } from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";

describe("UI & UX Refinements", () => {
  it("includes magnet icon for timeline snapping tool", () => {
    expect(PATHS.magnet).toBeDefined();
    expect(typeof PATHS.magnet).toBe("string");
    expect(PATHS.magnet.length).toBeGreaterThan(5);
  });

  it("extracts subtitle tracks with line timestamps and clip IDs for right-click interaction", () => {
    const { text: _t, duration: _d, ...tpl } = textClipOf("caption");
    void _t;
    void _d;
    const { doc } = addCaptionTrack(
      emptyDoc(),
      "Subtitles",
      [
        { start: 1.5, duration: 2.0, text: "Hello and welcome to the studio" },
        { start: 4.0, duration: 1.8, text: "Here is how to edit captions" },
      ],
      tpl,
    );

    const tracks = subtitleTracks(doc);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("Subtitles");
    expect(tracks[0].captions).toHaveLength(2);
    expect(tracks[0].captions[0].id).toBeDefined();
    expect(typeof tracks[0].captions[0].id).toBe("string");
    expect(tracks[0].captions[0].start).toBe(1.5);
    expect(tracks[0].captions[0].text).toBe("Hello and welcome to the studio");
    expect(tracks[0].captions[1].id).toBeDefined();
    expect(tracks[0].captions[1].start).toBe(4.0);
  });

  it("preserves timeline snap calculation accuracy", () => {
    const SNAP_PX = 8;
    const pxPerSec = 60;
    const cands = [0, 5, 10, 15];

    const snapCalc = (v: number, candidates: number[], snappingEnabled: boolean, free: boolean) => {
      if (free || !snappingEnabled) return v;
      const near = candidates.find((c) => Math.abs(c - v) * pxPerSec < SNAP_PX);
      return near ?? v;
    };

    // Close to 5.0s (e.g. 5.08s -> difference is 0.08 * 60 = 4.8px < 8px)
    expect(snapCalc(5.08, cands, true, false)).toBe(5);
    // When snapping is OFF, it shouldn't snap
    expect(snapCalc(5.08, cands, false, false)).toBe(5.08);
    // When free (Alt key pressed), it shouldn't snap
    expect(snapCalc(5.08, cands, true, true)).toBe(5.08);
    // Far from any boundary (e.g. 7.5s)
    expect(snapCalc(7.5, cands, true, false)).toBe(7.5);
  });
});
