import { describe, it, expect } from "vitest";
import { emptyDoc, type TimelineDoc, type VideoClip, type TextClip, clipLength, mainStarts, docDuration } from "@/lib/edit/doc";
import { deleteClips } from "@/lib/edit/docEdit";
import { fitScale, DEFAULT_FIT_PX_PER_SEC, DEFAULT_EMPTY_TIMELINE_SECONDS } from "@/components/studio/Timeline";

describe("Timeline Controls & Productivity", () => {
  it("fitScale calculates appropriate scale for total project duration and viewport width", () => {
    const viewportWidth = 1200;
    // For short duration, capped at DEFAULT_FIT_PX_PER_SEC (60)
    const scaleShort = fitScale(viewportWidth, 5);
    expect(scaleShort).toBe(DEFAULT_FIT_PX_PER_SEC);

    // For longer duration (e.g. 60 seconds in 1200px viewport), fits timeline
    const scaleLong = fitScale(viewportWidth, 60);
    expect(scaleLong).toBeLessThan(DEFAULT_FIT_PX_PER_SEC);
    expect(scaleLong).toBeGreaterThan(10);
    expect(scaleLong * 60).toBeLessThanOrEqual(viewportWidth + 1);
  });

  it("deleteClips removes multiple selected clips in a single operation", () => {
    const doc: TimelineDoc = {
      ...emptyDoc(),
      tracks: [
        {
          id: "main",
          kind: "main",
          name: "Video 1",
          locked: false,
          clips: [
            { id: "c1", type: "blank", fill: "#000000", duration: 3 },
            { id: "c2", type: "blank", fill: "#ffffff", duration: 4 },
            { id: "c3", type: "blank", fill: "#123456", duration: 5 },
          ],
        },
        {
          id: "tr-overlay",
          kind: "overlay",
          name: "Overlay 1",
          locked: false,
          clips: [
            { id: "ov1", type: "text", text: "Hello", style: { font: "sans", size: 40, color: "#ffffff", preset: "title" }, start: 0, duration: 3, transform: { fit: "fit", x: 0, y: 0 } } as any,
          ],
        },
      ],
    };

    expect(doc.tracks[0].clips).toHaveLength(3);
    expect(doc.tracks[1].clips).toHaveLength(1);

    // Batch delete c1, c3 and ov1
    const updated = deleteClips(doc, ["c1", "c3", "ov1"]);
    expect(updated.tracks[0].clips).toHaveLength(1);
    expect(updated.tracks[0].clips[0].id).toBe("c2");
    expect(updated.tracks[1].clips).toHaveLength(0);
  });

  it("cut point navigation accurately identifies all boundaries across main and overlay tracks", () => {
    const doc: TimelineDoc = {
      ...emptyDoc(),
      tracks: [
        {
          id: "main",
          kind: "main",
          name: "Video 1",
          locked: false,
          muted: false,
          clips: [
            { id: "c1", type: "blank", fill: "#000000", duration: 3, fadeIn: 0, fadeOut: 0 } as any,
            { id: "c2", type: "blank", fill: "#ffffff", duration: 5, fadeIn: 0, fadeOut: 0 } as any,
          ],
        },
        {
          id: "tr-overlay",
          kind: "overlay",
          name: "Overlay 1",
          locked: false,
          hidden: false,
          clips: [
            { id: "ov1", type: "text", text: "Title", style: { font: "sans", size: 40, color: "#ffffff", preset: "title" }, start: 1, duration: 4, transform: { fit: "fit", x: 0, y: 0 } } as any,
          ],
        },
      ],
    };

    // Calculate cut points exactly as in getCutPoints()
    const cuts = new Set<number>([0, Math.max(0, docDuration(doc))]);
    for (const tr of doc.tracks) {
      if (tr.kind === "main") {
        const starts = mainStarts(tr.clips);
        starts.forEach((s, idx) => {
          cuts.add(s);
          cuts.add(s + clipLength(tr.clips[idx]));
        });
      } else {
        for (const c of tr.clips) {
          const s = (c as any).start ?? 0;
          cuts.add(s);
          cuts.add(s + clipLength(c));
        }
      }
    }
    const sortedCuts = Array.from(cuts).sort((a, b) => a - b);

    // Expected cuts: 0 (start), 1 (ov1 start), 3 (c1 end / c2 start), 5 (ov1 end), 8 (c2 end / docDuration)
    expect(sortedCuts).toEqual([0, 1, 3, 5, 8]);

    // Test jump to previous cut from t = 4: should land on 3
    const cur = 4;
    let prevCut = 0;
    for (let i = sortedCuts.length - 1; i >= 0; i--) {
      if (sortedCuts[i] < cur - 0.04) {
        prevCut = sortedCuts[i];
        break;
      }
    }
    expect(prevCut).toBe(3);

    // Test jump to next cut from t = 4: should land on 5
    let nextCut = sortedCuts[sortedCuts.length - 1];
    for (let i = 0; i < sortedCuts.length; i++) {
      if (sortedCuts[i] > cur + 0.04) {
        nextCut = sortedCuts[i];
        break;
      }
    }
    expect(nextCut).toBe(5);
  });
});
