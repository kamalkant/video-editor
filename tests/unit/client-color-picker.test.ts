// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  keyKind,
  looksLikeBackground,
  sampleColorFromSource,
} from "@/lib/editor/sampleColor";

describe("client-side color sampling and key detection", () => {
  describe("keyKind", () => {
    it("recognizes standard green screen colors", () => {
      expect(keyKind([0, 177, 64])).toBe("green"); // #00B140
      expect(keyKind([0, 255, 0])).toBe("green"); // #00FF00
      expect(keyKind([20, 200, 30])).toBe("green");
    });

    it("recognizes standard blue screen colors", () => {
      expect(keyKind([0, 71, 187])).toBe("blue"); // #0047BB
      expect(keyKind([0, 0, 255])).toBe("blue"); // #0000FF
    });

    it("rejects non-key colors (skin tones, neutral, red, dark)", () => {
      expect(keyKind([255, 200, 180])).toBeNull(); // Caucasian skin tone
      expect(keyKind([180, 120, 80])).toBeNull(); // Tan skin tone
      expect(keyKind([255, 0, 0])).toBeNull(); // Red
      expect(keyKind([255, 255, 255])).toBeNull(); // White
      expect(keyKind([128, 128, 128])).toBeNull(); // Gray
      expect(keyKind([10, 20, 10])).toBeNull(); // Too dark (g <= 60)
    });
  });

  describe("looksLikeBackground", () => {
    it("confirms picked green matches detected green", () => {
      expect(looksLikeBackground([0, 200, 20], "#00B140")).toBe(true);
    });

    it("flags when picked blue doesn't match detected green", () => {
      expect(looksLikeBackground([0, 50, 200], "#00B140")).toBe(false);
    });

    it("accepts plausible key colors when no detected key is set", () => {
      expect(looksLikeBackground([0, 200, 20], null)).toBe(true);
    });

    it("flags non-key colors even when no detected key is set", () => {
      expect(looksLikeBackground([200, 50, 50], null)).toBe(false);
    });
  });

  describe("sampleColorFromSource", () => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    });

    it("returns null if source is null or has zero dimension", () => {
      expect(
        sampleColorFromSource(null, { x: 10, y: 10 }, { width: 100, height: 100 }),
      ).toBeNull();

      const canvas0 = document.createElement("canvas");
      canvas0.width = 0;
      canvas0.height = 0;
      expect(
        sampleColorFromSource(
          canvas0,
          { x: 10, y: 10 },
          { width: 100, height: 100 },
        ),
      ).toBeNull();
    });

    it("samples 5x5 median RGB from a canvas element correctly", () => {
      // Mock 2D context returning green screen pixels (0, 177, 64)
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(
            Array.from({ length: 25 }, () => [0, 177, 64, 255]).flat(),
          ),
          width: 5,
          height: 5,
        }),
      });

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;

      const result = sampleColorFromSource(
        canvas,
        { x: 50, y: 50 },
        { width: 100, height: 100 },
      );

      expect(result).not.toBeNull();
      expect(result?.hex).toBe("#00B140");
      expect(result?.looksLikeKey).toBe(true);
    });

    it("computes median correctly when there is compression noise in the 5x5 patch", () => {
      // 24 pixels are green (0, 200, 50), 1 pixel is an outlier red (255, 0, 0)
      const pixels: number[][] = Array.from({ length: 24 }, () => [0, 200, 50, 255]);
      pixels.push([255, 0, 0, 255]);

      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(pixels.flat()),
          width: 5,
          height: 5,
        }),
      });

      const canvas = document.createElement("canvas");
      canvas.width = 20;
      canvas.height = 20;

      const result = sampleColorFromSource(
        canvas,
        { x: 10, y: 10 },
        { width: 20, height: 20 },
      );

      expect(result).not.toBeNull();
      // Median filtering rejects the single noisy red pixel
      expect(result?.hex).toBe("#00C832"); // rgb(0, 200, 50)
      expect(result?.looksLikeKey).toBe(true);
    });

    it("samples correctly from video element dimensions", () => {
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(
            Array.from({ length: 25 }, () => [0, 180, 50, 255]).flat(),
          ),
          width: 5,
          height: 5,
        }),
      });

      const video = document.createElement("video");
      Object.defineProperty(video, "videoWidth", { value: 1920, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 1080, configurable: true });

      const result = sampleColorFromSource(
        video,
        { x: 960, y: 540 },
        { width: 960, height: 540 },
      );

      expect(result).not.toBeNull();
      expect(result?.hex).toBe("#00B432");
      expect(result?.looksLikeKey).toBe(true);
    });

    it("samples blue screen correctly and flags looksLikeKey as true", () => {
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(
            Array.from({ length: 25 }, () => [0, 71, 187, 255]).flat(),
          ),
          width: 5,
          height: 5,
        }),
      });

      const video = document.createElement("video");
      Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });

      const result = sampleColorFromSource(
        video,
        { x: 640, y: 360 },
        { width: 1280, height: 720 },
      );

      expect(result?.hex).toBe("#0047BB");
      expect(result?.looksLikeKey).toBe(true);
    });

    it("samples non-key red color correctly and flags looksLikeKey as false", () => {
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(
            Array.from({ length: 25 }, () => [220, 20, 20, 255]).flat(),
          ),
          width: 5,
          height: 5,
        }),
      });

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;

      const result = sampleColorFromSource(
        canvas,
        { x: 50, y: 50 },
        { width: 100, height: 100 },
      );

      expect(result?.hex).toBe("#DC1414");
      expect(result?.looksLikeKey).toBe(false);
    });

    it("performs sampling entirely in memory without making any network fetch requests", () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(
            Array.from({ length: 25 }, () => [0, 255, 0, 255]).flat(),
          ),
          width: 5,
          height: 5,
        }),
      });

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;

      const result = sampleColorFromSource(
        canvas,
        { x: 50, y: 50 },
        { width: 100, height: 100 },
      );

      expect(result?.hex).toBe("#00FF00");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
