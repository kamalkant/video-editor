import { describe, expect, it } from "vitest";
import { docSchema, emptyDoc, sanitizeDoc, textClipsOf, type TextClip } from "@/lib/edit/doc";
import { addText, setClip } from "@/lib/edit/docEdit";
import { removeCaptionWords } from "@/lib/edit/transcriptCut";
import { layoutText, textClipOf, textClipOfStyle, TEXT_STYLES } from "@/lib/text/layout";
import { applyMark, clearMarks, letterBounds, lettersOf, normalizeMarks, remapMarks, segmentsOf, styleAt } from "@/lib/text/marks";

// a fake font: every character is half the font size wide (the same as tests/unit/text.test.ts)
const measure = (text: string, font: string) => text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10) / 2);

describe("letters (graphemes)", () => {
  it("a Hindi letter with its matra or a conjunct is one letter", () => {
    expect(lettersOf("क्षि")).toEqual(["क्षि"]);
    expect(lettersOf("नमस्ते")).toHaveLength(3);
    expect(lettersOf("a👍🏽b")).toEqual(["a", "👍🏽", "b"]);
    expect(letterBounds("कि")).toEqual([0, 2]);
  });
});

describe("marks", () => {
  const text = "Hello big world";
  it("styles a range, and only what it changes", () => {
    const m = applyMark(text, undefined, 6, 9, { color: "#ff0000", size: 1.5 });
    expect(m).toEqual([{ from: 6, to: 9, color: "#ff0000", size: 1.5 }]);
    expect(segmentsOf(text, m).map((s) => text.slice(s.from, s.to))).toEqual(["Hello ", "big", " world"]);
    expect(styleAt(text, m, 6, 9)).toEqual({ color: "#ff0000", size: 1.5 });
    // letters with different looks: only what they share
    expect(styleAt(text, m, 4, 9)).toEqual({});
  });

  it("a second mark over part of the first cuts it, and a key set to undefined goes away", () => {
    let m = applyMark(text, undefined, 0, 15, { color: "#ff0000" });
    m = applyMark(text, m, 6, 9, { bold: true });
    expect(m).toEqual([
      { from: 0, to: 6, color: "#ff0000" },
      { from: 6, to: 9, color: "#ff0000", bold: true },
      { from: 9, to: 15, color: "#ff0000" },
    ]);
    m = applyMark(text, m, 6, 9, { bold: undefined });
    expect(m).toEqual([{ from: 0, to: 15, color: "#ff0000" }]);
    expect(clearMarks(text, m, 0, 15)).toBeUndefined();
  });

  it("never cuts a Hindi letter in half", () => {
    const t = "नमस्ते";
    // (position 1 is inside "न" + "म"? no: inside a letter → widened to whole letters)
    const m = applyMark(t, undefined, 3, 4, { color: "#00ff00" });
    expect(m).toHaveLength(1);
    const b = letterBounds(t);
    expect(b).toContain(m![0].from);
    expect(b).toContain(m![0].to);
  });

  it("normalize: clamps, sorts, joins neighbours, drops empty marks", () => {
    expect(normalizeMarks("abc", [{ from: 2, to: 9, bold: true }, { from: 0, to: 2, bold: true }, { from: 1, to: 2 }])).toEqual([{ from: 0, to: 3, bold: true }]);
    expect(normalizeMarks("", [{ from: 0, to: 1, bold: true }])).toBeUndefined();
  });

  it("remap: typing before, inside and after a mark keeps it on the same letters", () => {
    const m = [{ from: 6, to: 9, color: "#ff0000" }];
    expect(remapMarks(text, `Oh ${text}`, m)).toEqual([{ from: 9, to: 12, color: "#ff0000" }]);
    expect(remapMarks(text, `${text}!!`, m)).toEqual(m);
    // "big" → "bigger": the change is at the mark's end, so the mark stays on "big"
    expect(remapMarks(text, "Hello bigger world", m)).toEqual([{ from: 6, to: 9, color: "#ff0000" }]);
    // the marked word deleted: no mark left
    expect(remapMarks(text, "Hello world", m)).toBeUndefined();
  });

  it("setClip keeps marks when the words change, and cleans marks it is given", () => {
    let d = addText(emptyDoc(), { ...textClipOf("plain"), text }, 0).doc;
    const id = textClipsOf(d)[0].id;
    d = setClip(d, id, { marks: [{ from: 6, to: 9, color: "#ff0000" }, { from: 20, to: 30, bold: true }] });
    expect(textClipsOf(d)[0].marks).toEqual([{ from: 6, to: 9, color: "#ff0000" }]);
    d = setClip(d, id, { text: `A ${text}` });
    expect(textClipsOf(d)[0].marks).toEqual([{ from: 8, to: 11, color: "#ff0000" }]);
    expect(docSchema.safeParse(d).success).toBe(true);
  });

  it("cutting caption words keeps the marks on the words that are left", () => {
    let d = addText(emptyDoc(), { ...textClipOf("caption"), text: "one two three" }, 0).doc;
    const id = textClipsOf(d)[0].id;
    d = setClip(d, id, { marks: [{ from: 8, to: 13, color: "#ff0000" }] });
    const cut = removeCaptionWords(d, [{ clipId: id, index: 1 }]);
    const c = textClipsOf(cut)[0];
    expect(c.text).toBe("one three");
    expect(c.marks).toEqual([{ from: 4, to: 9, color: "#ff0000" }]);
  });

  it("the schema takes Google and Brand Kit fonts and rejects others; sanitizeDoc drops marks past the words", () => {
    const base = addText(emptyDoc(), { ...textClipOf("title"), style: { ...textClipOf("title").style, font: "gf:Noto Sans Devanagari" } }, 0).doc;
    expect(docSchema.safeParse(base).success).toBe(true);
    const bad = JSON.parse(JSON.stringify(base));
    bad.tracks.find((t: { kind: string }) => t.kind === "overlay").clips[0].style.font = "gf:Evil<script>";
    expect(docSchema.safeParse(bad).success).toBe(false);
    const withMarks = JSON.parse(JSON.stringify(base));
    const c = withMarks.tracks.find((t: { kind: string }) => t.kind === "overlay").clips[0] as TextClip;
    c.marks = [{ from: 0, to: 4, color: "#ff0000" }, { from: 900, to: 950, bold: true }];
    const clean = sanitizeDoc(docSchema.parse(withMarks), () => null);
    expect(textClipsOf(clean)[0].marks).toEqual([{ from: 0, to: 4, color: "#ff0000" }]);
  });
});

describe("layout with marks", () => {
  const W = 1920;
  const H = 1080;
  it("plain text lays out the same with and without the new engine's pieces", () => {
    const c = textClipOf("title");
    const l = layoutText(c, W, H, measure);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].pieces).toHaveLength(1);
    expect(l.lines[0].pieces[0].text).toBe(c.text);
    expect(l.lines[0].w).toBeCloseTo(measure(c.text, l.lines[0].font), 5);
  });

  it("a bigger word makes its line taller and wider; its piece has its own size and color", () => {
    const c = { ...textClipOf("plain"), text: "small BIG small" };
    const plain = layoutText(c, W, H, measure);
    const big = layoutText({ ...c, marks: [{ from: 6, to: 9, size: 2, color: "#ff0000" }] }, W, H, measure);
    expect(big.lines[0].pieces.map((p) => p.text)).toEqual(["small ", "BIG", " small"]);
    const p = big.lines[0].pieces[1];
    expect(p.size).toBeCloseTo(plain.lines[0].size * 2, 5);
    expect(p.color).toBe("#ff0000");
    expect(p.marked).toBe(true);
    expect(big.lines[0].w).toBeGreaterThan(plain.lines[0].w);
    expect(big.bounds.h).toBeGreaterThan(plain.bounds.h);
    // pieces follow each other on the line
    const [a, b2, c2] = big.lines[0].pieces;
    expect(b2.x).toBeCloseTo(a.x + a.w, 5);
    expect(c2.x).toBeCloseTo(b2.x + b2.w, 5);
  });

  it("words wrap across marks (a styled word is never split from its line)", () => {
    const c = { ...textClipOf("plain"), text: "aaaa bbbb cccc dddd eeee", style: { ...textClipOf("plain").style, size: 200 } };
    const lay = layoutText({ ...c, marks: [{ from: 5, to: 7, color: "#ff0000" }] }, 1000, 1000, measure);
    for (const l of lay.lines) expect(l.w).toBeLessThanOrEqual(1000 * 0.86 + 1e-6);
    expect(lay.lines.map((l) => l.text).join(" ")).toBe("aaaa bbbb cccc dddd eeee");
    // the styled letters are inside the word "bbbb", in one line
    const line = lay.lines.find((l) => l.text.includes("bbbb"))!;
    expect(line.pieces.some((p) => p.text === "bb" && p.color === "#ff0000")).toBe(true);
  });

  it("presets keep their structure: lower third lines, breaking capitals per part", () => {
    const lt = { ...textClipOf("lowerThird"), text: "Kamal Kant\nNews presenter", marks: [{ from: 0, to: 5, color: "#ff0000" }, { from: 11, to: 15, bold: true }] };
    const l = layoutText(lt, W, H, measure);
    expect(l.lines.map((x) => x.text)).toEqual(["Kamal Kant", "News presenter"]);
    expect(l.lines[0].pieces[0]).toMatchObject({ text: "Kamal", color: "#ff0000" });
    expect(l.lines[1].pieces[0].from).toBe(11);
    const br = layoutText({ ...textClipOf("breaking"), text: "rain tonight", marks: [{ from: 5, to: 12, color: "#00ff00" }] }, W, H, measure);
    expect(br.lines.map((x) => x.text)).toEqual(["BREAKING", "RAIN TONIGHT"]);
    expect(br.lines[1].pieces.find((p) => p.text === "TONIGHT")?.color).toBe("#00ff00");
  });

  it("every ready-made style (the Hindi ones too) makes a valid clip", () => {
    let d = emptyDoc();
    for (const t of TEXT_STYLES) d = addText(d, textClipOfStyle(t.id), 0).doc;
    expect(docSchema.safeParse(d).success).toBe(true);
    const hindi = textClipsOf(d).find((c) => c.text === "आज की बड़ी खबर")!;
    expect(hindi.text.slice(hindi.marks![0].from, hindi.marks![0].to)).toBe("बड़ी");
  });
});
