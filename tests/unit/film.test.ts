import { describe, expect, it } from "vitest";
import { FILM_COLS, filmCount, filmFrameW, filmIndex, filmOpsParam, filmTiles, parseFilmOps } from "@/lib/editor/film";
import { DEFAULT_SPEC, type OpInstance } from "@/lib/edit/spec";

const hd = { width: 1920, height: 1080, duration: 60, fps: 30 };
const tiles = (o: Partial<Parameters<typeof filmTiles>[0]> = {}) => filmTiles({ width: 600, from: 0, to: 600, tileH: 36, media: hd, srcIn: 0, srcOut: 60, srcPerSec: 10, ...o });

describe("timeline film", () => {
  it("about two frames a second, 12 to 240, never more than the video has", () => {
    expect(filmCount(60, 30)).toBe(120);
    expect(filmCount(2, 30)).toBe(12);
    expect(filmCount(3600, 30)).toBe(240);
    expect(filmCount(0.2, 30)).toBe(6);
    expect(filmFrameW(1920, 1080)).toBe(192);
    expect(filmFrameW(1080, 1920)).toBe(60);
  });
  it("tiles keep the video's shape at any zoom (they don't stretch with the clip)", () => {
    for (const srcPerSec of [2, 10, 120]) {
      const t = tiles({ srcPerSec, width: 60 * srcPerSec, to: 60 * srcPerSec });
      expect(t[0].width / 36).toBeCloseTo(96 / 54, 5);
      expect(t.every((x) => x.width === t[0].width)).toBe(true);
    }
    // a tall video: tall tiles
    const tall = tiles({ media: { ...hd, width: 1080, height: 1920 } });
    expect(tall[0].width / 36).toBeCloseTo(30 / 54, 5);
  });
  it("each tile shows the second under its middle (reversed: from the end)", () => {
    // 64 px tiles at 10 px/s: the first middle is 3.2 s → frame 6 of 120 (2 a second)
    const t = tiles();
    expect(t[0].bgPos).toBe(`${-6 * 64}px 0px`);
    expect(t[0].key).toBe(0);
    expect(t[0].left).toBe(0);

    // frame 17 is on the second row of the grid
    const i = filmIndex(8.5, 60, 120);
    expect(i).toBe(17);

    // media tile 1 covers 6.4s to 12.8s (middle 9.6s -> frame 19)
    expect(t[1].bgPos).toBe(`${-(19 % FILM_COLS) * 64}px ${-Math.floor(19 / FILM_COLS) * 36}px`);
    expect(t[1].key).toBe(1);

    // reversed: the first tile is near the end
    expect(tiles({ reversed: true })[0].bgPos).toBe(`${-(113 % FILM_COLS) * 64}px ${-Math.floor(113 / FILM_COLS) * 36}px`);
  });
  it("when trimming start point (srcIn), left tile slides out to left and right tiles stay anchored", () => {
    const full = tiles();
    // Trim 2 seconds from start: srcIn = 2s, width = 580px
    const trimmed = tiles({ srcIn: 2, width: 580, to: 580 });

    // In trimmed clip: originX = -2 * 10 = -20px. Tile 0 slides left by 20px
    expect(trimmed[0].left).toBe(-20);
    expect(trimmed[0].key).toBe(0);
    expect(trimmed[0].bgPos).toBe(full[0].bgPos);

    // Tile 1 slides by the same -20px relative to clip container: 64 - 20 = 44px
    expect(trimmed[1].left).toBe(44);
    expect(trimmed[1].key).toBe(1);
    expect(trimmed[1].bgPos).toBe(full[1].bgPos);

    // Right-most tile retains its frame index and does not disappear from the right
    const lastFull = full[full.length - 1];
    const lastTrimmed = trimmed[trimmed.length - 1];
    expect(lastTrimmed.key).toBe(lastFull.key);
    expect(lastTrimmed.bgPos).toBe(lastFull.bgPos);
  });
  it("only the tiles in view are drawn (a long clip zoomed in stays light)", () => {
    const all = tiles({ width: 100_000, from: 5000, to: 6000, srcPerSec: 1000 });
    expect(all.length).toBeLessThanOrEqual(18);
    expect(all[0].left).toBeLessThanOrEqual(5000);
    expect(all[all.length - 1].left + all[0].width).toBeGreaterThanOrEqual(6000);
    expect(tiles({ from: 700, to: 900 })).toEqual([]);
  });
  it("the removal settings go in the address and come back checked (switched-off ones left out)", () => {
    const on = DEFAULT_SPEC.ops[0];
    const off: OpInstance = { ...on, id: "k2", enabled: false };
    const param = filmOpsParam([on, off]);
    expect(param).toMatch(/^[\w-]+$/);
    expect(parseFilmOps(param)).toEqual([on]);
    expect(filmOpsParam([off])).toBe("");
    expect(() => parseFilmOps("bm90IGpzb24")).toThrow();
    expect(() => parseFilmOps(filmOpsParam([{ ...on, type: "evil" } as unknown as OpInstance]))).toThrow();
  });
});
