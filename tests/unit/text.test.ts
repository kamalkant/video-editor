import { describe, expect, it } from "vitest";
import { docSchema, emptyDoc, textClipsOf } from "@/lib/edit/doc";
import { addText, splitClip } from "@/lib/edit/docEdit";
import { animExpr, animState } from "@/lib/player/anim";
import { layoutText, textClipOf, TEXT_PRESETS, wrap } from "@/lib/text/layout";

// a fake font: every character is half the font size wide
const measure = (text: string, font: string) => text.length * (Number(/(\d+)px/.exec(font)?.[1] ?? 10) / 2);

describe("text layout", () => {
  it("wraps words to the width and keeps new lines", () => {
    expect(wrap("one two three four", "20px x", 80, measure)).toEqual(["one two", "three", "four"]);
    expect(wrap("a\n\nb", "20px x", 80, measure)).toEqual(["a", "", "b"]);
    expect(wrap("unbreakableword", "20px x", 20, measure)).toEqual(["unbreakableword"]);
  });

  it("a title is centered and scales with the canvas", () => {
    const c = textClipOf("title");
    const a = layoutText(c, 1920, 1080, measure);
    expect(a.lines).toHaveLength(1);
    expect(a.bounds.x + a.bounds.w / 2).toBeCloseTo(960, 0);
    const b = layoutText(c, 1280, 720, measure);
    expect(b.lines[0].size).toBeCloseTo((a.lines[0].size * 720) / 1080, 5);
  });

  it("a lower third has a name bar and a role bar at the bottom left", () => {
    const l = layoutText(textClipOf("lowerThird"), 1920, 1080, measure);
    expect(l.boxes).toHaveLength(2);
    expect(l.lines.map((x) => x.text)).toEqual(["Kamal Kant", "News presenter"]);
    expect(l.boxes[0].x).toBeCloseTo(1920 * 0.06, 5);
    expect(l.bounds.y + l.bounds.h).toBeLessThanOrEqual(1080 * 0.9 + 1);
    expect(l.lines[1].size).toBeLessThan(l.lines[0].size);
  });

  it("breaking news spans the width, in capitals", () => {
    const l = layoutText({ ...textClipOf("breaking"), text: "rain tonight" }, 1920, 1080, measure);
    expect(l.boxes[0]).toMatchObject({ x: 0, w: 1920 });
    expect(l.lines.map((x) => x.text)).toEqual(["BREAKING", "RAIN TONIGHT"]);
  });

  it("moving and resizing change the layout", () => {
    const c = textClipOf("plain");
    const a = layoutText(c, 1000, 1000, measure);
    const b = layoutText({ ...c, transform: { ...c.transform, x: 0.1, scale: 2 } }, 1000, 1000, measure);
    expect(b.bounds.x + b.bounds.w / 2).toBeCloseTo(a.bounds.x + a.bounds.w / 2 + 100, 0);
    expect(b.lines[0].size).toBeCloseTo(a.lines[0].size * 2, 5);
  });

  it("every preset makes a valid clip on the timeline", () => {
    let d = emptyDoc();
    for (const k of Object.keys(TEXT_PRESETS) as (keyof typeof TEXT_PRESETS)[]) d = addText(d, textClipOf(k), 0).doc;
    expect(docSchema.safeParse(d).success).toBe(true);
    expect(textClipsOf(d)).toHaveLength(5);
    // overlapping texts go on separate overlay tracks
    expect(d.tracks.filter((t) => t.kind === "overlay" && t.clips.length).length).toBe(5);
    // a text splits by length
    const id = textClipsOf(d)[0].id;
    const s = splitClip(d, id, 1);
    expect(textClipsOf(s.doc).filter((c) => c.text === textClipsOf(d)[0].text).length).toBeGreaterThan(1);
  });
});

describe("animations", () => {
  it("none: no change", () => {
    expect(animState(0, 4, { in: "none", out: "none" })).toMatchObject({ dx: 0, dy: 0, alpha: 1 });
    expect(animExpr({ in: "none", out: "none" }, 1, 4, 1920, 1080)).toMatchObject({ x: "", y: "", fades: [] });
  });

  it("slide in: starts left and transparent, ends in place", () => {
    const a = { in: "slide", out: "none" } as const;
    expect(animState(0, 4, a)).toMatchObject({ alpha: 0, dx: -0.18 });
    const mid = animState(0.25, 4, a);
    expect(mid.alpha).toBeCloseTo(0.5, 5);
    expect(mid.dx).toBeCloseTo(-0.18 * 0.125, 5);
    expect(animState(0.6, 4, a)).toMatchObject({ dx: 0, dy: 0, alpha: 1 });
    const e = animExpr(a, 1, 4, 1000, 1000);
    expect(e.x).toBe("-pow(1-clip((t-1)/0.5\\,0\\,1)\\,3)*180");
    expect(e.fades).toEqual(["fade=t=in:st=0:d=0.5:alpha=1"]);
  });

  it("rise out: moves up and fades at the end; short clips use half their length", () => {
    const a = { in: "none", out: "rise" } as const;
    const end = animState(3.99, 4, a);
    expect(end.dy).toBeLessThan(-0.07);
    expect(end.alpha).toBeLessThan(0.05);
    expect(animState(0.1, 0.4, { in: "fade", out: "none" }).alpha).toBeCloseTo(0.5, 5);
    expect(animExpr({ in: "fade", out: "fade" }, 0, 0.4, 100, 100).fades).toEqual(["fade=t=in:st=0:d=0.2:alpha=1", "fade=t=out:st=0.2:d=0.2:alpha=1"]);
  });
});
