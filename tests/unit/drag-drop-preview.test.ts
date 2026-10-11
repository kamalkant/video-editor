import { describe, expect, it } from "vitest";
import { ELEMENT_DRAG, elementDrag, setElementDrag, setTextDrag, textDrag, TEXT_DRAG } from "@/lib/editor/mediaDrag";
import { textAnchor, textClipOfStyle, TEXT_STYLES } from "@/lib/text/layout";
import { elementClipOf, elementPreset, emojiClipOf } from "@/lib/elements/catalog";
import { addElement, addText } from "@/lib/edit/docEdit";
import { emptyDoc, mainTrack, type AnyClip } from "@/lib/edit/doc";

describe("Preview Drag and Drop for Elements and Text", () => {
  it("defines standard drag MIME types for text and elements", () => {
    expect(TEXT_DRAG).toBe("application/x-vdo-text");
    expect(ELEMENT_DRAG).toBe("application/x-vdo-element");
  });

  it("tracks active text and element drag state in memory", () => {
    setTextDrag({ styleId: "title", label: "Title" });
    expect(textDrag()).toEqual({ styleId: "title", label: "Title" });
    setTextDrag(null);
    expect(textDrag()).toBeNull();

    setElementDrag({ presetId: "star", label: "Star", aspect: 1 });
    expect(elementDrag()).toEqual({ presetId: "star", label: "Star", aspect: 1 });
    setElementDrag(null);
    expect(elementDrag()).toBeNull();
  });

  it("calculates correct transform offset for dropped text based on preset anchor", () => {
    // Title preset anchor is centered (0.5, 0.5)
    const titleAnchor = textAnchor("title", 1, 1);
    expect(titleAnchor).toEqual({ x: 0.5, y: 0.5 });

    const dropPoint = { x: 0.25, y: 0.75 };
    const nx = Math.round((dropPoint.x - titleAnchor.x) * 1000) / 1000;
    const ny = Math.round((dropPoint.y - titleAnchor.y) * 1000) / 1000;
    expect(nx).toBe(-0.25);
    expect(ny).toBe(0.25);

    // Caption preset anchor is bottom-centered (0.5, 0.86)
    const captionAnchor = textAnchor("caption", 1, 1);
    expect(captionAnchor).toEqual({ x: 0.5, y: 0.86 });
    const capPoint = { x: 0.5, y: 0.43 };
    const capNx = Math.round((capPoint.x - captionAnchor.x) * 1000) / 1000;
    const capNy = Math.round((capPoint.y - captionAnchor.y) * 1000) / 1000;
    expect(capNx).toBe(0);
    expect(capNy).toBe(-0.43);

    // Lower third preset anchor is bottom-left (0.06, 0.9)
    const lowerAnchor = textAnchor("lowerThird", 1, 1);
    expect(lowerAnchor).toEqual({ x: 0.06, y: 0.9 });
    const lowPoint = { x: 0.26, y: 0.6 };
    const lowNx = Math.round((lowPoint.x - lowerAnchor.x) * 1000) / 1000;
    const lowNy = Math.round((lowPoint.y - lowerAnchor.y) * 1000) / 1000;
    expect(lowNx).toBe(0.2);
    expect(lowNy).toBe(-0.3);
  });

  it("calculates correct transform offset for dropped elements centered on cursor", () => {
    const centerPoint = { x: 0.5, y: 0.5 };
    expect(Math.round((centerPoint.x - 0.5) * 10000) / 10000).toBe(0);
    expect(Math.round((centerPoint.y - 0.5) * 10000) / 10000).toBe(0);

    const cornerPoint = { x: 0.8, y: 0.2 };
    expect(Math.round((cornerPoint.x - 0.5) * 10000) / 10000).toBe(0.3);
    expect(Math.round((cornerPoint.y - 0.5) * 10000) / 10000).toBe(-0.3);
  });

  it("adds dropped text clip with custom transform onto timeline", () => {
    const doc = emptyDoc();
    const clip = textClipOfStyle("callout");
    const dropPoint = { x: 0.7, y: 0.3 };
    const anchor = textAnchor(clip.style.preset, 1, 1);
    const tr = {
      ...clip.transform,
      x: Math.round((dropPoint.x - anchor.x) * 1000) / 1000,
      y: Math.round((dropPoint.y - anchor.y) * 1000) / 1000,
    };

    const res = addText(doc, { ...clip, transform: tr }, 0, "t_dropped");
    const textClip = res.doc.tracks.flatMap((t) => t.clips as AnyClip[]).find((c) => c.id === "t_dropped");
    expect(textClip).toBeDefined();
    expect(textClip?.type).toBe("text");
    if (textClip?.type === "text") {
      expect(textClip.transform.x).toBe(0.2);
      expect(textClip.transform.y).toBe(-0.2);
    }
  });

  it("adds dropped element preset and emoji with custom transform onto timeline", () => {
    const doc = emptyDoc();
    const canvas = { width: 1920, height: 1080 };
    const preset = elementPreset("heart")!;
    expect(preset).toBeDefined();

    const elClip = elementClipOf(preset, canvas, 10);
    const dropPoint = { x: 0.35, y: 0.65 };
    const tr = {
      ...elClip.transform,
      x: Math.round((dropPoint.x - 0.5) * 10000) / 10000,
      y: Math.round((dropPoint.y - 0.5) * 10000) / 10000,
    };

    const res1 = addElement(doc, { ...elClip, transform: tr }, 0, "e_heart");
    const heart = res1.doc.tracks.flatMap((t) => t.clips as AnyClip[]).find((c) => c.id === "e_heart");
    expect(heart).toBeDefined();
    expect(heart?.type).toBe("element");
    if (heart?.type === "element") {
      expect(heart.transform.x).toBe(-0.15);
      expect(heart.transform.y).toBe(0.15);
    }

    // Emoji element
    const emojiClip = emojiClipOf("🔥", canvas);
    const emojiTr = {
      ...emojiClip.transform,
      x: Math.round((0.8 - 0.5) * 10000) / 10000,
      y: Math.round((0.2 - 0.5) * 10000) / 10000,
    };
    const res2 = addElement(res1.doc, { ...emojiClip, transform: emojiTr }, 0, "e_emoji");
    const fire = res2.doc.tracks.flatMap((t) => t.clips as AnyClip[]).find((c) => c.id === "e_emoji");
    expect(fire).toBeDefined();
    if (fire?.type === "element") {
      expect(fire.el.kind).toBe("emoji");
      expect(fire.el.emoji).toBe("🔥");
      expect(fire.transform.x).toBe(0.3);
      expect(fire.transform.y).toBe(-0.3);
    }
  });
});
