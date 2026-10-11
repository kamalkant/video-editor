import { describe, it, expect } from "vitest";
import { BROADCAST_TEMPLATES, BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import { SET_TO_MOTION_ENGINE, MOTION_SETS, drawBackdrop } from "@/lib/backdrops";
import { renderProceduralMotion, type MotionEngineKind } from "@/lib/templates/motionEngine";

function createMockCtx() {
  const dummyFn = () => {};
  const grad = { addColorStop: dummyFn };
  const target: Record<string, any> = {
    canvas: { width: 1920, height: 1080 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 100 }),
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      return dummyFn;
    },
    set(t, prop, val) {
      t[prop as string] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("Broadcast Templates Deep Alignment", () => {
  it("contains all 24 broadcast templates", () => {
    expect(BROADCAST_TEMPLATES.length).toBe(24);
    expect(BROADCAST_TEMPLATES_BY_ID.size).toBe(24);
  });

  it("every template has a valid previewCanvasEngine that matches its build backdrop", () => {
    const validEngines: MotionEngineKind[] = [
      "newsroomMatrix",
      "breakingPulse",
      "globe3d",
      "radarSweep",
      "marketTicker",
      "podcastWave",
      "sportsArena",
      "techGrid",
      "sunriseBriefing",
      "vipGlamour",
      "electionDesk",
      "socialSquare",
      "verticalReels",
      "explainerDoc",
    ];

    for (const template of BROADCAST_TEMPLATES) {
      expect(template.previewCanvasEngine).toBeDefined();
      expect(validEngines).toContain(template.previewCanvasEngine);

      const built = template.build();
      expect(built.canvas.backdrop).toBeDefined();
      const backdrop = built.canvas.backdrop;
      expect(backdrop?.kind).toBe("set");

      if (backdrop && backdrop.kind === "set") {
        const backdropId = backdrop.id;
        expect(MOTION_SETS.has(backdropId)).toBe(true);

        const mappedEngine = SET_TO_MOTION_ENGINE[backdropId];
        expect(mappedEngine).toBe(template.previewCanvasEngine);
      }
    }
  });

  it("executes renderProceduralMotion without errors for all 14 engine kinds", () => {
    const mockCtx = createMockCtx();

    const engines: MotionEngineKind[] = [
      "newsroomMatrix",
      "breakingPulse",
      "globe3d",
      "radarSweep",
      "marketTicker",
      "podcastWave",
      "sportsArena",
      "techGrid",
      "sunriseBriefing",
      "vipGlamour",
      "electionDesk",
      "socialSquare",
      "verticalReels",
      "explainerDoc",
    ];

    for (const engine of engines) {
      expect(() => {
        renderProceduralMotion(engine, mockCtx, 1920, 1080, 1.5);
      }).not.toThrow();
    }
  });

  it("drawBackdrop renders procedural motion for motion sets", () => {
    const mockCtx = createMockCtx();

    for (const setId of MOTION_SETS) {
      const handled = drawBackdrop(mockCtx, { kind: "set", id: setId }, 1920, 1080, 2.0);
      expect(handled).toBe(true);
    }
  });
});
