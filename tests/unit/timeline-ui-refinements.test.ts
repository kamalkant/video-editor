import { describe, expect, it } from "vitest";
import { FILM_H, FILM_COLS, filmCount, filmFrameW, filmTiles } from "@/lib/editor/film";
import { watermarkSchema } from "@/lib/edit/doc";

describe("Timeline UI Refinements & Productivity", () => {
  it("uses 108px FILM_H for crisp high-density filmstrip frames", () => {
    expect(FILM_H).toBe(108);
    expect(FILM_COLS).toBe(16);

    const frameW = filmFrameW(1920, 1080);
    // 108 * 16 / 9 = 192
    expect(frameW).toBe(192);

    const tiles = filmTiles({
      width: 400,
      from: 0,
      to: 400,
      tileH: 56, // main track tile height
      media: { width: 1920, height: 1080, duration: 10, fps: 30 },
      srcIn: 0,
      srcOut: 10,
      srcPerSec: 40,
    });

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles[0].width).toBeGreaterThan(0);
    expect(tiles[0].bgSize).toContain("px");
  });

  it("supports minimum 2% (0.02) logo size in watermarkSchema", () => {
    const valid = watermarkSchema.safeParse({
      mediaId: "11111111-1111-4111-8111-111111111111",
      corner: "tr",
      size: 0.02, // 2% minimum
      opacity: 1,
      margin: 0.05,
    });
    expect(valid.success).toBe(true);

    const tooSmall = watermarkSchema.safeParse({
      mediaId: "11111111-1111-4111-8111-111111111111",
      corner: "tr",
      size: 0.01, // 1% should fail min(0.02)
      opacity: 1,
      margin: 0.05,
    });
    expect(tooSmall.success).toBe(false);
  });
});
