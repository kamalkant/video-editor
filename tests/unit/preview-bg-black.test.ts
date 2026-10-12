// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { TILES } from "@/components/editor/BackgroundSwatches";

describe("Preview Background Colors", () => {
  it("uses pure black for the black background tile instead of off-black/brown", () => {
    const blackTile = TILES.find((t) => t.value === "black");
    expect(blackTile).toBeDefined();
    expect(blackTile?.tile).toBe("bg-black");
    expect(blackTile?.tile).not.toContain("#1f1f1f");
  });

  it("includes checkerboard, white, and black as options", () => {
    const values = TILES.map((t) => t.value);
    expect(values).toContain("checker");
    expect(values).toContain("white");
    expect(values).toContain("black");
  });
});
