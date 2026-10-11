import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_PX_PER_SEC,
  MIN_TIMELINE_PX_PER_SEC,
  MAX_TIMELINE_PX_PER_SEC,
  fitScale,
  scaleToSlider,
  sliderToScale,
} from "@/components/studio/Timeline";
import { trimClip } from "@/lib/edit/docEdit";
import { clipLength, type TimelineDoc } from "@/lib/edit/doc";

function createMockDoc(): TimelineDoc {
  return {
    version: 2,
    canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" },
    output: { format: "mp4", quality: "best" },
    tracks: [
      {
        id: "main",
        kind: "main",
        locked: false,
        muted: false,
        clips: [
          {
            id: "clip-1",
            type: "video",
            mediaId: "med-1",
            in: 0,
            out: 10,
            fadeIn: 0,
            fadeOut: 0,
            transform: { fit: "fit", x: 0, y: 0 } as any,
            volume: 1,
            muted: false,
            start: 0,
            ops: [],
          },
          {
            id: "clip-2",
            type: "video",
            mediaId: "med-2",
            in: 0,
            out: 8,
            fadeIn: 0,
            fadeOut: 0,
            transform: { fit: "fit", x: 0, y: 0 } as any,
            volume: 1,
            muted: false,
            start: 10,
            ops: [],
          },
        ],
      },
    ],
  };
}

describe("Timeline Scaling Mechanism (Google Vids Model)", () => {
  it("maintains invariant pixel width for unaffected clips when trimming", () => {
    const doc = createMockDoc();
    const lockedPxPerSec = 50; // Stable zoom level

    // Initial width of Clip 2 before Clip 1 is trimmed
    const clip2InitialLen = clipLength(doc.tracks[0].clips[1]);
    const clip2InitialPxWidth = clip2InitialLen * lockedPxPerSec;
    expect(clip2InitialPxWidth).toBe(8 * 50); // 400px

    // Trim Clip 1 from 10s down to 4s (trim out edge to 4s)
    const mockMedia = (id: string) => ({
      id,
      duration: 30,
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    });

    const trimmedDoc = trimClip(doc, "clip-1", "out", 4, mockMedia as any);
    const clip1NewLen = clipLength(trimmedDoc.tracks[0].clips[0]);
    const clip2NewLen = clipLength(trimmedDoc.tracks[0].clips[1]);

    expect(clip1NewLen).toBe(4);
    expect(clip2NewLen).toBe(8);

    // In Google Vids model, lockedPxPerSec remains 50 px/s
    const clip1NewPxWidth = clip1NewLen * lockedPxPerSec;
    const clip2NewPxWidth = clip2NewLen * lockedPxPerSec;

    expect(clip1NewPxWidth).toBe(200); // 4s * 50 = 200px
    expect(clip2NewPxWidth).toBe(400); // Clip 2 is STILL exactly 400px, did not stretch or shrink!
  });

  it("calculates initial fitScale accurately without clamping bugs", () => {
    const lanesWidth = 1000;
    const duration = 20;
    const scale = fitScale(lanesWidth, duration);
    // 1000 / 20 = 50 px/sec
    expect(scale).toBe(50);
  });

  it("converts zoom slider values logarithmically within defined min and max bounds", () => {
    const minZoom = MIN_TIMELINE_PX_PER_SEC; // 10
    const maxZoom = MAX_TIMELINE_PX_PER_SEC; // 200

    const sliderMin = scaleToSlider(minZoom, minZoom, maxZoom);
    expect(sliderMin).toBe(0);

    const sliderMax = scaleToSlider(maxZoom, minZoom, maxZoom);
    expect(sliderMax).toBe(100);

    const midScale = sliderToScale(50, minZoom, maxZoom);
    expect(midScale).toBeGreaterThan(minZoom);
    expect(midScale).toBeLessThan(maxZoom);
  });
});
