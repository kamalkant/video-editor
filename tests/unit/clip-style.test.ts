import { describe, expect, it } from "vitest";
import { isDefaultBlankFill, resolveBlankFill, THEME_BLANK_DARK, THEME_BLANK_LIGHT, type VideoClip, type ImageClip, type BlankClip } from "@/lib/edit/doc";
import { extractClipStyle, applyClipStyle } from "@/lib/edit/clipStyle";

describe("Blank Clip Theme Resolution", () => {
  it("resolves default black/white to dark theme black and light theme white", () => {
    expect(isDefaultBlankFill("#000000")).toBe(true);
    expect(isDefaultBlankFill("#ffffff")).toBe(true);
    expect(isDefaultBlankFill(undefined)).toBe(true);
    expect(isDefaultBlankFill("#e11d48")).toBe(false);

    // Dark mode
    expect(resolveBlankFill("#000000", false)).toBe(THEME_BLANK_DARK);
    expect(resolveBlankFill("#ffffff", false)).toBe(THEME_BLANK_DARK);
    expect(resolveBlankFill(undefined, false)).toBe(THEME_BLANK_DARK);

    // Light mode
    expect(resolveBlankFill("#000000", true)).toBe(THEME_BLANK_LIGHT);
    expect(resolveBlankFill("#ffffff", true)).toBe(THEME_BLANK_LIGHT);
    expect(resolveBlankFill(undefined, true)).toBe(THEME_BLANK_LIGHT);

    // Custom user color preserved in both
    expect(resolveBlankFill("#7c3aed", false)).toBe("#7c3aed");
    expect(resolveBlankFill("#7c3aed", true)).toBe("#7c3aed");
  });
});

describe("Clip Style Copy and Paste", () => {
  const sourceVideoClip: VideoClip = {
    id: "clip-src",
    type: "video",
    mediaId: "00000000-0000-4000-8000-000000000001",
    in: 0,
    out: 5,
    ops: [],
    transform: {
      fit: "fit",
      x: 0.25, // custom position that should NOT overwrite target
      y: -0.15,
      scale: 1.4,
      scaleX: 1.1,
      scaleY: 0.9,
      rotation: 45,
      flipX: true,
      flipY: false,
      skewX: 15,
      skewY: -10,
      corners: {
        tl: { x: -0.05, y: -0.05 },
        tr: { x: 0.05, y: -0.02 },
        br: { x: 0.02, y: 0.04 },
        bl: { x: -0.03, y: 0.06 },
      },
      pivot: { x: 0.3, y: 0.7 },
      crop: { l: 0.05, t: 0.05, r: 0.05, b: 0.05 },
    },
    opacity: 0.85,
    blendMode: "screen",
    color: {
      brightness: 0.1,
      contrast: 1.2,
      saturation: 1.4,
      temperature: 0.2,
      vignette: 0.3,
    },
    mask: {
      shape: "rounded",
      radius: 0.2,
      feather: 4,
    },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };

  const targetImageClip: ImageClip = {
    id: "clip-target",
    type: "image",
    mediaId: "00000000-0000-4000-8000-000000000002",
    duration: 3,
    transform: {
      fit: "fill",
      x: -0.5, // target position must remain -0.5
      y: 0.8,  // target position must remain 0.8
      scale: 1,
    },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
  };

  it("extracts transform, skew, perspective, looks, mask and color without x and y position", () => {
    const style = extractClipStyle(sourceVideoClip);

    expect(style.sourceType).toBe("video");
    expect(style.transform).toBeDefined();
    // Verify x and y are not included in copied style
    expect((style.transform as any).x).toBeUndefined();
    expect((style.transform as any).y).toBeUndefined();

    // Verify visual shape & styling are preserved
    expect(style.transform?.scale).toBe(1.4);
    expect(style.transform?.rotation).toBe(45);
    expect(style.transform?.skewX).toBe(15);
    expect(style.transform?.skewY).toBe(-10);
    expect(style.transform?.corners).toEqual(sourceVideoClip.transform.corners);
    expect(style.transform?.pivot).toEqual({ x: 0.3, y: 0.7 });
    expect(style.transform?.flipX).toBe(true);

    // Verify looks, mask, color
    expect(style.opacity).toBe(0.85);
    expect(style.blendMode).toBe("screen");
    expect(style.mask).toEqual(sourceVideoClip.mask);
    expect(style.color).toEqual(sourceVideoClip.color);
  });

  it("applies copied style to target clip while preserving target's x and y coordinates", () => {
    const style = extractClipStyle(sourceVideoClip);
    const patch = applyClipStyle(targetImageClip, style);

    expect(patch.transform).toBeDefined();
    const appliedTransform = patch.transform as any;
    // Critical: target x and y are retained!
    expect(appliedTransform.x).toBe(-0.5);
    expect(appliedTransform.y).toBe(0.8);

    // Visual styles transferred
    expect(appliedTransform.scale).toBe(1.4);
    expect(appliedTransform.rotation).toBe(45);
    expect(appliedTransform.skewX).toBe(15);
    expect(appliedTransform.skewY).toBe(-10);
    expect(appliedTransform.corners).toEqual(sourceVideoClip.transform.corners);
    expect(appliedTransform.pivot).toEqual({ x: 0.3, y: 0.7 });
    expect(appliedTransform.crop).toEqual({ l: 0.05, t: 0.05, r: 0.05, b: 0.05 });

    // Attributes transferred
    expect(patch.opacity).toBe(0.85);
    expect(patch.blendMode).toBe("screen");
    expect(patch.mask).toEqual(sourceVideoClip.mask);
    expect(patch.color).toEqual(sourceVideoClip.color);
  });

  it("pastes blank clip fill style appropriately", () => {
    const blankSrc: BlankClip = {
      id: "b-src",
      type: "blank",
      fill: "#e11d48",
      duration: 3,
      fadeIn: 0,
      fadeOut: 0,
    };
    const blankTarget: BlankClip = {
      id: "b-dst",
      type: "blank",
      fill: "#000000",
      duration: 5,
      fadeIn: 0,
      fadeOut: 0,
    };

    const style = extractClipStyle(blankSrc);
    expect(style.fill).toBe("#e11d48");

    const patch = applyClipStyle(blankTarget, style);
    expect(patch.fill).toBe("#e11d48");
  });
});
