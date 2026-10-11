import { describe, expect, it } from "vitest";
import { emptyDoc, maskSchema } from "@/lib/edit/doc";
import { outputSchema } from "@/lib/edit/spec";
import { addText, closeAllGaps, deleteClips } from "@/lib/edit/docEdit";

describe("Phase 1: Loudness, Multi-select, and Custom Masks", () => {
  it("validates loudness on outputSchema and doc", () => {
    const parsed = outputSchema.parse({
      resolution: 1080,
      fps: 30,
      quality: "balanced",
      audio: "keep",
      master: false,
      loudness: true,
    });
    expect(parsed.loudness).toBe(true);
  });

  it("validates mask shapes including diamond, star, and custom", () => {
    const diamond = maskSchema.parse({
      shape: "diamond",
      radius: 0,
      feather: 2,
    });
    expect(diamond.shape).toBe("diamond");

    const star = maskSchema.parse({
      shape: "star",
      radius: 0,
      feather: 4,
    });
    expect(star.shape).toBe("star");

    const custom = maskSchema.parse({
      shape: "custom",
      radius: 0,
      feather: 1,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
      ],
    });
    expect(custom.shape).toBe("custom");
    expect(custom.points?.length).toBe(3);
  });

  it("deletes multiple clips at once across tracks", () => {
    let doc = emptyDoc();
    const clip1 = {
      type: "text" as const,
      text: "Hello",
      fadeIn: 0,
      fadeOut: 0,
      style: { preset: "title" as const, font: "sans" as const, size: 60, color: "#ffffff", box: "none" as const, align: "center" as const, bold: true, accent: "#ffffff", shadow: false },
      duration: 3,
      transform: { fit: "fit" as const, x: 0, y: 0, scale: 1 },
      anim: { in: "none" as const, out: "none" as const },
    };
    const clip2 = { ...clip1, text: "World" };
    const t1 = addText(doc, clip1, 0);
    const t2 = addText(t1.doc, clip2, 4);

    const overlayTrack = t2.doc.tracks.find((t) => t.kind === "overlay");
    expect(overlayTrack?.clips.length).toBe(2);

    const deleted = deleteClips(t2.doc, [t1.clipId, t2.clipId]);
    const deletedTrack = deleted.tracks.find((t) => t.kind === "overlay");
    expect(deletedTrack?.clips.length).toBe(0);
  });

  it("closes all gaps by rippling overlay clips", () => {
    let doc = emptyDoc();
    const clip1 = {
      type: "text" as const,
      text: "Part 1",
      fadeIn: 0,
      fadeOut: 0,
      style: { preset: "title" as const, font: "sans" as const, size: 60, color: "#ffffff", box: "none" as const, align: "center" as const, bold: true, accent: "#ffffff", shadow: false },
      duration: 2,
      transform: { fit: "fit" as const, x: 0, y: 0, scale: 1 },
      anim: { in: "none" as const, out: "none" as const },
    };
    const clip2 = { ...clip1, text: "Part 2", duration: 3 };
    const t1 = addText(doc, clip1, 1);
    const t2 = addText(t1.doc, clip2, 6);

    // Initial has gaps: start at 1, then at 6
    const gapped = t2.doc;
    const closed = closeAllGaps(gapped);

    // After closing gaps, first starts at 0, second starts at 0 + 2 = 2
    const closedTrack = closed.tracks.find((t) => t.kind === "overlay");
    const c1 = closedTrack?.clips[0] as { start: number };
    const c2 = closedTrack?.clips[1] as { start: number };
    expect(c1.start).toBe(0);
    expect(c2.start).toBe(2);
  });
});
