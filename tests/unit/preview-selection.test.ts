import { describe, expect, it } from "vitest";

type Point = { x: number; y: number };
type RRect = { x: number; y: number; w: number; h: number; rot: number };

type MockLayer = {
  id: string;
  type: "video" | "element" | "text" | "image";
  rect: RRect;
};

// Replicates the inside point-in-rotated-box test from ProgramPlayer.tsx
function inside(r: RRect | null, pt: Point): boolean {
  if (!r) return false;
  const catchHalf = 0.012 * Math.min(1920, 1080);
  const a = (-r.rot * Math.PI) / 180;
  const dx = pt.x - (r.x + r.w / 2);
  const dy = pt.y - (r.y + r.h / 2);
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= Math.max(r.w / 2, catchHalf) && Math.abs(ly) <= Math.max(r.h / 2, catchHalf);
}

// Current hit testing logic in ProgramPlayer: selects top-most visual layer
function hitTestLayers(visible: MockLayer[], pt: Point): MockLayer | undefined {
  return [...visible].reverse().find((l) => inside(l.rect, pt));
}

// Previous buggy hit testing logic (for regression comparison)
function buggyHitTestLayers(visible: MockLayer[], selLayer: MockLayer | null, pt: Point): MockLayer | undefined {
  const selRect = selLayer ? selLayer.rect : null;
  return inside(selRect, pt) && selLayer ? selLayer : [...visible].reverse().find((l) => inside(l.rect, pt));
}

describe("Preview Canvas Layer Hit-Testing & Selection", () => {
  // Setup: 1 full-frame background video (bottom) + 2 overlay shapes (top)
  const videoLayer: MockLayer = {
    id: "video-1",
    type: "video",
    rect: { x: 0, y: 0, w: 1920, h: 1080, rot: 0 },
  };

  const shapeLayer1: MockLayer = {
    id: "shape-badge",
    type: "element",
    rect: { x: 100, y: 100, w: 300, h: 150, rot: 0 },
  };

  const shapeLayer2: MockLayer = {
    id: "shape-star",
    type: "element",
    rect: { x: 500, y: 300, w: 200, h: 200, rot: 0 },
  };

  // Stacked bottom-to-top: video at bottom, shapes on top
  const visible = [videoLayer, shapeLayer1, shapeLayer2];

  it("selects overlay shape directly even when video behind it is currently selected", () => {
    // Click coordinate right inside shapeLayer1 (x: 200, y: 150)
    const clickOnShape: Point = { x: 200, y: 150 };

    // With previous buggy logic: video was selected, so clicking shape returned the video!
    const buggyHit = buggyHitTestLayers(visible, videoLayer, clickOnShape);
    expect(buggyHit?.id).toBe("video-1"); // Demonstrates the bug

    // With our updated logic: clicking shape correctly selects shapeLayer1!
    const hit = hitTestLayers(visible, clickOnShape);
    expect(hit?.id).toBe("shape-badge");
  });

  it("selects video when clicking in an area where no overlay covers it", () => {
    // Click coordinate outside shapes, but inside video (x: 1000, y: 500)
    const clickOnVideo: Point = { x: 1000, y: 500 };

    const hit = hitTestLayers(visible, clickOnVideo);
    expect(hit?.id).toBe("video-1");
  });

  it("selects the top-most overlay when two overlays overlap", () => {
    const lowerOverlay: MockLayer = {
      id: "lower-box",
      type: "element",
      rect: { x: 400, y: 400, w: 400, h: 400, rot: 0 },
    };
    const higherOverlay: MockLayer = {
      id: "higher-text",
      type: "text",
      rect: { x: 500, y: 500, w: 200, h: 100, rot: 0 },
    };

    const stacked = [videoLayer, lowerOverlay, higherOverlay];

    // Clicking where they overlap selects the higher overlay
    const overlapClick: Point = { x: 550, y: 520 };
    expect(hitTestLayers(stacked, overlapClick)?.id).toBe("higher-text");

    // Clicking where only the lower overlay is visible selects the lower overlay
    const lowerOnlyClick: Point = { x: 420, y: 420 };
    expect(hitTestLayers(stacked, lowerOnlyClick)?.id).toBe("lower-box");
  });

  it("returns undefined when clicking outside all visible clips", () => {
    const partialVideo: MockLayer = {
      id: "video-small",
      type: "video",
      rect: { x: 200, y: 200, w: 800, h: 600, rot: 0 },
    };

    const pointOutside: Point = { x: 50, y: 50 };
    expect(hitTestLayers([partialVideo], pointOutside)).toBeUndefined();
  });
});
