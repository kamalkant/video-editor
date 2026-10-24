// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// The frame drawing (lib/render/frame) is the same for the preview and the browser export. Here it draws into a
// fake canvas that writes down what it's asked to do; the GPU helpers are stand-ins that record their settings.
const looks = vi.hoisted(() => ({ passes: [] as Record<string, unknown>[] }));
vi.mock("@/lib/player/glLook", () => ({
  GlLook: {
    create: () => ({
      canvas: { width: 10, height: 10, nodeName: "CANVAS" },
      render: (_s: unknown, _w: number, _h: number, p: Record<string, unknown>) => {
        looks.passes.push(p);
        return true;
      },
    }),
  },
}));
vi.mock("@/lib/player/glWarp", () => ({ GlWarp: { create: () => null }, drawWarpMesh: () => undefined }));

import { emptyDoc, findClip, imageClipOf, mainTrack, type ImageClip, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText } from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";
import { createFrameCache, drawFrame, type FrameSources } from "@/lib/render/frame";

type Call = { op: string; args: unknown[]; alpha: number; comp: string };

/** A 2D context that writes down drawImage / fillText calls with the opacity and blend mode in force. */
function recorder(W: number, H: number) {
  const calls: Call[] = [];
  const stack: { alpha: number; comp: string; m: number[] }[] = [];
  let m = [1, 0, 0, 1, 0, 0];
  const ctx = {
    canvas: { width: W, height: H },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    font: "10px sans-serif",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineJoin: "miter",
    textBaseline: "alphabetic",
    textAlign: "left",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    save() {
      stack.push({ alpha: this.globalAlpha, comp: this.globalCompositeOperation, m: [...m] });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        this.globalAlpha = s.alpha;
        this.globalCompositeOperation = s.comp;
        m = s.m;
      }
    },
    translate(x: number, y: number) {
      m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y];
    },
    scale(sx: number, sy: number) {
      m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]];
    },
    rotate() {},
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      m = [a, b, c, d, e, f];
    },
    getTransform() {
      return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
    },
    clearRect() {},
    fillRect(...args: unknown[]) {
      calls.push({ op: "fillRect", args, alpha: this.globalAlpha, comp: this.globalCompositeOperation });
    },
    beginPath() {},
    rect() {},
    arc() {},
    ellipse() {},
    roundRect() {},
    fill() {},
    clip() {
      calls.push({ op: "clip", args: [], alpha: this.globalAlpha, comp: this.globalCompositeOperation });
    },
    measureText(t: string) {
      return { width: t.length * (Number(/(\d+)px/.exec(this.font)?.[1] ?? 10) / 2) };
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ op: "fillText", args: [text, m[4] + m[0] * x, m[5] + m[3] * y], alpha: this.globalAlpha, comp: this.globalCompositeOperation });
    },
    strokeText() {},
    drawImage(src: { nodeName?: string; id?: string }, ...rest: number[]) {
      // (the position on the canvas: the last four numbers, through the current transform)
      const [x, y, w, h] = rest.length >= 8 ? rest.slice(4) : rest;
      calls.push({ op: "drawImage", args: [src.id ?? src.nodeName, m[4] + m[0] * (x ?? 0), m[5] + m[3] * (y ?? 0), m[0] * (w ?? 0), m[3] * (h ?? 0)], alpha: this.globalAlpha, comp: this.globalCompositeOperation });
    },
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const IMG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IMG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lite = (id: string): MediaLite => ({ id, kind: "image", fileName: `${id}.png`, width: 100, height: 100, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null });
const picture = (id: string) => ({ id, nodeName: "IMG", naturalWidth: 100, naturalHeight: 100, complete: true }) as unknown as HTMLImageElement;
const sources = (doc: TimelineDoc): FrameSources => ({ media: { [IMG_A]: lite(IMG_A), [IMG_B]: lite(IMG_B) }, video: () => null, image: (id) => picture(id), live: () => null });

/** Two pictures on Video 1 (2 s each) with a transition into the second. */
function twoPictures(type: "crossfade" | "slideLeft" | "wipeLeft"): TimelineDoc {
  let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 100, height: 100, fps: 30, background: "#000000" } };
  d = addMedia(d, lite(IMG_A), { id: "a" }).doc;
  d = addMedia(d, lite(IMG_B), { id: "b" }).doc;
  const main = mainTrack(d);
  main.clips = [{ ...imageClipOf("a", lite(IMG_A), 2) }, { ...imageClipOf("b", lite(IMG_B), 2), transitionIn: { type, duration: 1 } } as ImageClip];
  return d;
}

describe("one frame, drawn like the preview (and the browser export)", () => {
  it("a crossfade: half way through, the incoming picture is half see-through", () => {
    const d = twoPictures("crossfade");
    // (the second clip starts at 1 s: 2 s − the 1 s overlap)
    const { ctx, calls } = recorder(100, 100);
    drawFrame(ctx, d, 1.5, sources(d), createFrameCache());
    const b = calls.find((c) => c.op === "drawImage" && c.args[0] === IMG_B)!;
    expect(b.alpha).toBeCloseTo(0.5, 2);
    expect(calls.find((c) => c.op === "drawImage" && c.args[0] === IMG_A)!.alpha).toBeCloseTo(1, 5);
  });

  it("a slide: the incoming picture comes from the right", () => {
    const d = twoPictures("slideLeft");
    const { ctx, calls } = recorder(100, 100);
    drawFrame(ctx, d, 1.25, sources(d), createFrameCache());
    const b = calls.find((c) => c.op === "drawImage" && c.args[0] === IMG_B)!;
    expect(b.args[1] as number).toBeGreaterThan(30);
  });

  it("a wipe clips the incoming picture", () => {
    const d = twoPictures("wipeLeft");
    const { ctx, calls } = recorder(100, 100);
    drawFrame(ctx, d, 1.5, sources(d), createFrameCache());
    const i = calls.findIndex((c) => c.op === "drawImage" && c.args[0] === IMG_B);
    expect(calls.slice(0, i).some((c) => c.op === "clip")).toBe(true);
  });

  it("a slide-in text starts to the left and see-through, and is in place after", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" } };
    d = addText(d, { ...textClipOf("title"), anim: { in: "slide", out: "none" } }, 0).doc;
    const at = (t: number) => {
      const { ctx, calls } = recorder(1920, 1080);
      drawFrame(ctx, d, t, sources(d), createFrameCache());
      return calls.find((c) => c.op === "fillText")!;
    };
    const start = at(0.05);
    const later = at(2);
    expect(start.alpha).toBeLessThan(0.5);
    expect(start.args[1] as number).toBeLessThan(later.args[1] as number);
    expect(later.alpha).toBeCloseTo(1, 5);
  });

  it("a typewriter text shows only the first letters", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" } };
    d = addText(d, { ...textClipOf("title"), text: "Hello world", anim: { in: "typewriter", out: "none" } }, 0).doc;
    const { ctx, calls } = recorder(1920, 1080);
    drawFrame(ctx, d, 0.2, sources(d), createFrameCache());
    const drawn = calls.filter((c) => c.op === "fillText").map((c) => c.args[0]).join("");
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan("Hello world".length);
  });

  it("a blend mode on an overlay track is used while that layer is drawn", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 100, height: 100, fps: 30, background: "#000000" } };
    d = addMedia(d, lite(IMG_A), { id: "a" }).doc;
    d = addMedia(d, lite(IMG_B), { id: "b", at: 0, trackId: "v2" } as never).doc;
    const over = d.tracks.find((t) => t.kind === "overlay" && t.clips.length)!;
    (over.clips[0] as ImageClip).blend = "screen";
    const { ctx, calls } = recorder(100, 100);
    drawFrame(ctx, d, 0.5, sources(d), createFrameCache());
    const top = calls.filter((c) => c.op === "drawImage").pop()!;
    expect(top.comp).toBe("screen");
    expect(calls.filter((c) => c.op === "drawImage")[0].comp).toBe("source-over");
  });

  it("the Effects sliders and a star mask reach the GPU look", () => {
    looks.passes.length = 0;
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 100, height: 100, fps: 30, background: "#000000" } };
    d = addMedia(d, lite(IMG_A), { id: "a" }).doc;
    const c = findClip(d, "a")!.clip as ImageClip;
    c.color = { brightness: 0, contrast: 1, saturation: 1, temperature: 0, glow: 0.5, grain: 0.3, pixelate: 0.2 };
    c.mask = { shape: "star", radius: 0, feather: 2 };
    const { ctx } = recorder(100, 100);
    drawFrame(ctx, d, 0.5, sources(d), createFrameCache());
    expect(looks.passes[0]).toMatchObject({ glow: 0.5, grain: 0.3, pixelate: 0.2, mask: { shape: 4 } });
  });
});
