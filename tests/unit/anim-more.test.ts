import { describe, expect, it } from "vitest";
import { animExpr, animState, typedCount, typeSteps } from "@/lib/player/anim";
import { textClipOfStyle, TEXT_STYLES, layoutText } from "@/lib/text/layout";
import { textClipSchema } from "@/lib/edit/doc";

const ev = (e: string) => new Function("t", "clip", "pow", "abs", "cos", "PI", `return ${e.replaceAll("\\,", ",")};`) as (...a: unknown[]) => number;
const fns = [(v: number, a: number, b: number) => Math.min(b, Math.max(a, v)), Math.pow, Math.abs, Math.cos, Math.PI] as const;

describe("more animations: the export follows the preview", () => {
  it("pop and zoom: the size factor", () => {
    for (const kind of ["pop", "zoom"] as const) {
      const e = animExpr({ in: kind, out: kind }, 2, 4, 1920, 1080);
      const f = ev(e.scale!);
      for (const into of [0.05, 0.2, 0.35, 0.49, 1.5, 3.6, 3.9]) expect(f(into, ...fns), `${kind} ${into}`).toBeCloseTo(animState(into, 4, { in: kind, out: kind }).scale, 4);
    }
  });
  it("bounce: the drop (pixels) at the timeline time", () => {
    const e = animExpr({ in: "bounce", out: "none" }, 2, 4, 1920, 1080);
    const f = ev(`0${e.y}`);
    for (const into of [0, 0.1, 0.2, 0.3, 0.45, 1]) expect(f(2 + into, ...fns)).toBeCloseTo(animState(into, 4, { in: "bounce", out: "none" }).dy * 1080, 2);
  });
  it("blur: the sharp copy fades in while the blurred one shows, then goes", () => {
    const s0 = animState(0.1, 4, { in: "blur", out: "none" });
    expect(s0.alpha).toBeCloseTo(0.2, 4);
    expect(s0.blur).toBeCloseTo(0.4 * 0.8, 4);
    expect(animState(1, 4, { in: "blur", out: "none" })).toMatchObject({ alpha: 1, blur: 0 });
    expect(animExpr({ in: "blur", out: "none" }, 0, 4, 1920, 1080).blur!.sigma).toBeCloseTo(0.02 * 1080, 6);
  });
  it("typewriter: letters in steps, all of them at the end", () => {
    expect(typeSteps(12)).toBe(12);
    expect(typeSteps(500)).toBe(60);
    expect(typedCount(0, 12)).toBe(0);
    expect(typedCount(0.5, 12)).toBe(6);
    expect(typedCount(1, 12)).toBe(12);
    const a = animState(0.2, 6, { in: "typewriter", out: "none" }, 20);
    expect(a.typed).toBeGreaterThan(0);
    expect(a.typed).toBeLessThan(1);
    expect(a.alpha).toBe(1);
  });
});

describe("text styles and effects", () => {
  it("every ready-made style makes a valid text clip", () => {
    for (const t of TEXT_STYLES) expect(textClipSchema.safeParse({ id: "t1", ...textClipOfStyle(t.id) }).success, t.id).toBe(true);
  });
  it("letter spacing widens the text; a pill box has round ends", () => {
    const measure = (text: string) => text.length * 10;
    const base = textClipOfStyle("callout");
    const w0 = layoutText(base, 1920, 1080, measure).bounds.w;
    const w1 = layoutText({ ...base, style: { ...base.style, spacing: 0.5 } }, 1920, 1080, measure).bounds.w;
    expect(w1).toBeGreaterThan(w0);
    const box = layoutText(base, 1920, 1080, measure).boxes[0];
    expect(box.radius).toBeCloseTo(box.h / 2, 6);
  });
});
