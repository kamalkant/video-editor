import { describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, videoClipOf, type MediaLite } from "@/lib/edit/doc";
import { exportDocOf } from "@/lib/export/exportDoc";

// what an export of each format makes (the Export dialog's preview shows the same: components/studio/ExportPreview)
const V: MediaLite = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kind: "video", fileName: "v.mp4", width: 640, height: 360, fps: 30, duration: 4, hasAudio: true, suggestedKey: null, keyKind: null };

describe("the timeline an export makes", () => {
  it("a see-through project goes on black in a format without see-through; PNG and alpha formats keep it", () => {
    const d = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 30, background: "transparent" as const } };
    expect(exportDocOf(d, "mp4").canvas.background).toBe("#000000");
    expect(exportDocOf(d, "jpg").canvas.background).toBe("#000000");
    expect(exportDocOf(d, "png").canvas.background).toBe("transparent");
    expect(exportDocOf(d, "webm-alpha").canvas.background).toBe("transparent");
  });

  it("a see-through format of a project that removes a background is see-through; a social size is the project at that size", () => {
    const d = emptyDoc();
    mainTrack(d).clips.push({ ...videoClipOf("v1", V, [{ id: "k", type: "chromaKey", enabled: true, params: { keyColor: "#00ff00", similarity: 0.3, blend: 0.1, despill: true, despillStrength: 0.5 } }] as never) } as never);
    expect(exportDocOf(d, "mov-alpha").canvas.background).toBe("transparent");
    const tall = exportDocOf(d, "mp4", { size: { width: 1080, height: 1920 } });
    expect(tall.canvas).toMatchObject({ width: 1080, height: 1920 });
    // the project itself is untouched
    expect(d.canvas.width).toBe(1920);
    // the same size: the same timeline (no copy)
    expect(exportDocOf(d, "mp4", { size: { width: d.canvas.width, height: d.canvas.height } })).toBe(d);
  });
});
