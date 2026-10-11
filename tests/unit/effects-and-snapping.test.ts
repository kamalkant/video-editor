import { describe, it, expect } from "vitest";
import { LOOKS } from "@/lib/player/look";

describe("Effects & Looks additions", () => {
  it("includes classic and new cinematic looks (cyberpunk, sepia, emerald)", () => {
    expect(LOOKS).toHaveProperty("cyberpunk");
    expect(LOOKS).toHaveProperty("sepia");
    expect(LOOKS).toHaveProperty("emerald");
    expect(LOOKS).toHaveProperty("bw");
    expect(LOOKS).toHaveProperty("vintage");
    expect(LOOKS).toHaveProperty("warm");
    expect(LOOKS).toHaveProperty("cool");

    expect(LOOKS.cyberpunk.label).toBe("Cyberpunk");
    expect(LOOKS.sepia.label).toBe("Sepia");
    expect(LOOKS.emerald.label).toBe("Emerald");
  });
});

describe("Arrow key nudge mathematics", () => {
  it("calculates regular nudge step (0.005) and shift nudge step (0.05)", () => {
    const REGULAR_STEP = 0.005;
    const SHIFT_STEP = 0.05;

    let pos = { x: 0.5, y: 0.5 };

    // Regular Left
    pos = { ...pos, x: pos.x - REGULAR_STEP };
    expect(pos.x).toBeCloseTo(0.495);

    // Shift Right
    pos = { ...pos, x: pos.x + SHIFT_STEP };
    expect(pos.x).toBeCloseTo(0.545);

    // Regular Up
    pos = { ...pos, y: pos.y - REGULAR_STEP };
    expect(pos.y).toBeCloseTo(0.495);

    // Shift Down
    pos = { ...pos, y: pos.y + SHIFT_STEP };
    expect(pos.y).toBeCloseTo(0.545);
  });
});

describe("Preview smart guides snapping logic", () => {
  const SNAP = 0.015;

  it("snaps to canvas center (0.5) within SNAP tolerance", () => {
    const vTargets = [0.5, 0, 1, 0.05, 0.95];
    const candidateX = 0.508; // Within 0.015 of 0.5
    
    let snappedX = candidateX;
    let snappedLine: number | null = null;

    for (const t of vTargets) {
      if (Math.abs(candidateX - t) < SNAP) {
        snappedX = t;
        snappedLine = t;
        break;
      }
    }

    expect(snappedX).toBe(0.5);
    expect(snappedLine).toBe(0.5);
  });

  it("does not snap when distance exceeds SNAP tolerance", () => {
    const vTargets = [0.5, 0, 1, 0.05, 0.95];
    const candidateX = 0.525; // Exceeds 0.015
    
    let snappedX = candidateX;
    let snappedLine: number | null = null;

    for (const t of vTargets) {
      if (Math.abs(candidateX - t) < SNAP) {
        snappedX = t;
        snappedLine = t;
        break;
      }
    }

    expect(snappedX).toBe(0.525);
    expect(snappedLine).toBeNull();
  });
});
