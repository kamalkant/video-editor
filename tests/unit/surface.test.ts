import { afterEach, describe, expect, it, vi } from "vitest";
import { canMakeCanvas, fontSet, makeCanvas, pictureSize } from "@/lib/render/surface";

/** The drawing code makes its canvases here: a <canvas> on the page, an OffscreenCanvas in the export's Worker. */
describe("canvases on the page and in a Worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Node has neither: nothing is drawn (the callers skip)", () => {
    expect(canMakeCanvas()).toBe(false);
  });

  it("a Worker (no document): an OffscreenCanvas of the asked size", () => {
    class FakeOffscreen {
      constructor(
        public width: number,
        public height: number,
      ) {}
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    expect(canMakeCanvas()).toBe(true);
    const c = makeCanvas(64, 32) as unknown as FakeOffscreen;
    expect(c).toBeInstanceOf(FakeOffscreen);
    expect([c.width, c.height]).toEqual([64, 32]);
    // (the same default size as a <canvas>)
    expect([(makeCanvas() as unknown as FakeOffscreen).width, (makeCanvas() as unknown as FakeOffscreen).height]).toEqual([300, 150]);
  });

  it("the page: a <canvas> element", () => {
    const el = { width: 0, height: 0 };
    vi.stubGlobal("document", { createElement: (tag: string) => (tag === "canvas" ? el : null) });
    expect(makeCanvas(10, 20)).toBe(el);
    expect([el.width, el.height]).toEqual([10, 20]);
  });

  it("a picture's size: an <img> by its natural size, an ImageBitmap by its own", () => {
    expect(pictureSize({ naturalWidth: 800, naturalHeight: 600, width: 100, height: 75 } as HTMLImageElement)).toEqual({ w: 800, h: 600 });
    expect(pictureSize({ width: 640, height: 480 } as ImageBitmap)).toEqual({ w: 640, h: 480 });
  });

  it("the fonts: the page's, else the Worker's", () => {
    const workerFonts = { add: () => undefined };
    vi.stubGlobal("fonts", workerFonts);
    expect(fontSet()).toBe(workerFonts);
    const pageFonts = { add: () => undefined };
    vi.stubGlobal("document", { fonts: pageFonts });
    expect(fontSet()).toBe(pageFonts);
  });
});
