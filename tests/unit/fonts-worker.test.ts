import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureFont, parseFontFaces } from "@/lib/text/fonts";

/** The export draws in a Worker: no <link> there, so a Google family's stylesheet is read and its faces added. */
const CSS = `/* devanagari */
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/poppins/a.woff2) format('woff2');
  unicode-range: U+0900-097F, U+200C-200D;
}
/* latin */
@font-face {
  font-family: 'Poppins';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/poppins/b.woff2) format('woff2');
}`;

describe("Google fonts in a Worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads each face of the stylesheet: family, file, style, weight, letters", () => {
    expect(parseFontFaces(CSS)).toEqual([
      { family: "Poppins", url: "https://fonts.gstatic.com/s/poppins/a.woff2", style: "normal", weight: "400", unicodeRange: "U+0900-097F, U+200C-200D" },
      { family: "Poppins", url: "https://fonts.gstatic.com/s/poppins/b.woff2", style: "italic", weight: "700" },
    ]);
    expect(parseFontFaces("body { color: red }")).toEqual([]);
  });

  it("adds the faces to the Worker's fonts, then loads the letters the text needs", async () => {
    const added: { family: string; src: string; d: FontFaceDescriptors }[] = [];
    const loads: [string, string][] = [];
    vi.stubGlobal("FontFace", class {
      constructor(family: string, src: string, d: FontFaceDescriptors) {
        added.push({ family, src, d });
      }
    });
    vi.stubGlobal("fonts", { add: () => undefined, load: async (css: string, text: string) => void loads.push([css, text]), ready: Promise.resolve() });
    vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => ({ families: [] }), text: async () => (String(url).includes("fonts.googleapis.com") ? CSS : "") }));
    await ensureFont("gf:Poppins", { bold: false }, "नमस्ते");
    expect(added.map((a) => [a.src, a.d.style, a.d.weight])).toEqual([
      ["url(https://fonts.gstatic.com/s/poppins/a.woff2)", "normal", "400"],
      ["url(https://fonts.gstatic.com/s/poppins/b.woff2)", "italic", "700"],
    ]);
    expect(added[0].d.unicodeRange).toBe("U+0900-097F, U+200C-200D");
    expect(loads).toHaveLength(1);
    expect(loads[0][0]).toContain('"Poppins"');
    expect(loads[0][1]).toBe("नमस्ते");
  });
});
