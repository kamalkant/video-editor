import { describe, expect, it } from "vitest";
import { transformSchema, type TextClip, type ElementClip, type Keyframe } from "@/lib/edit/doc";
import { baseMotion, motionAt, transformAt } from "@/lib/edit/keyframes";
import { motionRect } from "@/lib/player/layout";
import { rotationOf } from "@/lib/player/look";

const K = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({
  t,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  ...v,
});

describe("Rotate and Skew: Document Schema", () => {
  it("validates transform with rotation, skewX, and skewY", () => {
    const valid = transformSchema.parse({
      fit: "fit",
      scale: 1.5,
      x: 0.1,
      y: -0.2,
      rotation: 45,
      skewX: 15,
      skewY: -20,
      flipX: true,
      flipY: false,
    });
    expect(valid.rotation).toBe(45);
    expect(valid.skewX).toBe(15);
    expect(valid.skewY).toBe(-20);
    expect(valid.flipX).toBe(true);
  });

  it("clamps or rejects out-of-range skew values", () => {
    expect(() => transformSchema.parse({ skewX: 75 })).toThrow();
    expect(() => transformSchema.parse({ skewY: -65 })).toThrow();
    expect(() => transformSchema.parse({ rotation: 200 })).toThrow();
  });
});

describe("Rotate and Skew: Motion & Keyframes", () => {
  it("baseMotion returns rotation for text and element clips", () => {
    const text: TextClip = {
      id: "t1",
      type: "text",
      text: "Rotating Headline",
      style: {
        preset: "title",
        font: "sans",
        size: 72,
        color: "#ffffff",
        box: "none",
        align: "center",
        bold: true,
        accent: "#ffffff",
        shadow: false,
      },
      duration: 5,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 35, skewX: 10, skewY: -5 },
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
    };

    const m = baseMotion(text);
    expect(m.rotation).toBe(35);
  });

  it("interpolates rotation over time for text clips", () => {
    const text: TextClip = {
      id: "t1",
      type: "text",
      text: "Animated Heading",
      style: {
        preset: "title",
        font: "sans",
        size: 48,
        color: "#ffffff",
        box: "none",
        align: "center",
        bold: true,
        accent: "#ffffff",
        shadow: false,
      },
      duration: 4,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0, skewX: 12 },
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [K(0, { rotation: 0 }), K(2, { rotation: 90 })],
    };

    expect(motionAt(text, 0).rotation).toBe(0);
    expect(motionAt(text, 1).rotation).toBeCloseTo(45, 0);
    expect(motionAt(text, 2).rotation).toBe(90);

    const tAt1 = transformAt(text, 1);
    expect(tAt1.skewX).toBe(12);
    expect(tAt1.rotation).toBeGreaterThan(0);
  });

  it("interpolates rotation and preserves skew for element clips", () => {
    const el: ElementClip = {
      id: "e1",
      type: "element",
      el: { kind: "arrow", fill: "#3b82f6", aspect: 1, stroke: "none", strokeWidth: 0, heads: "end", curve: 0 },
      duration: 3,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: -45, skewX: -15, skewY: 25 },
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [K(0, { rotation: -45 }), K(2, { rotation: 45 })],
    };

    expect(motionAt(el, 0).rotation).toBe(-45);
    expect(motionAt(el, 2).rotation).toBe(45);

    const t2 = transformAt(el, 2);
    expect(t2.rotation).toBe(45);
    expect(t2.skewX).toBe(-15);
    expect(t2.skewY).toBe(25);
  });
});

describe("Rotate and Skew: Layout & Motion Rects", () => {
  it("motionRect reports rotation for text clips", () => {
    const text: TextClip = {
      id: "t1",
      type: "text",
      text: "Turned Text",
      style: {
        preset: "title",
        font: "sans",
        size: 60,
        color: "#ffffff",
        box: "none",
        align: "center",
        bold: true,
        accent: "#ffffff",
        shadow: false,
      },
      duration: 4,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 45 },
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
    };

    const rect = motionRect(400, 100, 1920, 1080, text, 0);
    expect(rect.rot).toBe(45);
    expect(rotationOf(text.transform)).toBe(45);
  });

  it("motionRect reports rotation for element clips", () => {
    const el: ElementClip = {
      id: "e1",
      type: "element",
      el: { kind: "rect", fill: "#ef4444", aspect: 1, stroke: "none", strokeWidth: 0, radius: 0.1 },
      duration: 4,
      transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 90 },
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
    };

    const rect = motionRect(300, 300, 1920, 1080, el, 0);
    expect(rect.rot).toBe(90);
    expect(rotationOf(el.transform)).toBe(90);
  });
});
