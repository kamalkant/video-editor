import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  emptyDoc,
  type Keyframe,
  type MediaLite,
  type TimelineDoc,
} from "@/lib/edit/doc";
import { addMedia, addText, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { textClipOf } from "@/lib/text/layout";

// a red 100×100 square, a red 200×20 bar, a white 400×300 picture; a "text" PNG: a red 40×40 square in the middle of a 400×300 canvas
const tmp = mkdtempSync(join(tmpdir(), "VDO-keys-"));
const sq = join(tmp, "sq.png");
const bar = join(tmp, "bar.png");
const white = join(tmp, "white.png");
const textPng = join(tmp, "text.png");
const S = "55555555-5555-4555-8555-555555555551";
const B = "55555555-5555-4555-8555-555555555552";
const Wh = "55555555-5555-4555-8555-555555555553";
const media: ComposeMedia = {
  [S]: { path: sq, hasAudio: false, width: 100, height: 100 },
  [B]: { path: bar, hasAudio: false, width: 200, height: 20 },
  [Wh]: { path: white, hasAudio: false, width: 400, height: 300 },
};
const lite = (id: string, w: number, h: number): MediaLite => ({
  id,
  kind: "image",
  fileName: "x.png",
  width: w,
  height: h,
  fps: 0,
  duration: 0,
  hasAudio: false,
  suggestedKey: null,
  keyKind: null,
});

beforeAll(() => {
  const ff = (a: string[]) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...a]);
  ff(["-f", "lavfi", "-i", "color=c=red:s=100x100", "-frames:v", "1", sq]);
  ff(["-f", "lavfi", "-i", "color=c=red:s=200x20", "-frames:v", "1", bar]);
  ff(["-f", "lavfi", "-i", "color=c=white:s=400x300", "-frames:v", "1", white]);
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0:s=400x300,format=rgba",
    "-vf",
    "drawbox=x=180:y=130:w=40:h=40:c=red:t=fill:replace=1",
    "-frames:v",
    "1",
    textPng,
  ]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const pixel = (f: string, at: number, x: number, y: number) => [
  ...execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(at),
    "-i",
    f,
    "-frames:v",
    "1",
    "-vf",
    `crop=1:1:${x}:${y},format=rgba`,
    "-f",
    "rawvideo",
    "pipe:1",
  ]),
];
const isRed = (p: number[]) => p[0] > 180 && p[1] < 80 && p[2] < 80;
const isBlack = (p: number[]) => p[0] < 40 && p[1] < 40 && p[2] < 40;
const K = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({
  t,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  ease: "linear",
  ...v,
});

function render(
  m: MediaLite,
  keys: Keyframe[],
  extra: Record<string, unknown> = {},
): { out: string; args: string[] } {
  let d: TimelineDoc = {
    ...emptyDoc(),
    canvas: { width: 400, height: 300, fps: 10, background: "#000000" },
  };
  d = addMedia(d, m, { at: 0, id: "p1" }).doc;
  d = setClip(d, "p1", { duration: 2, keyframes: keys, ...extra });
  const out = join(tmp, `out-${Math.random().toString(36).slice(2)}.mp4`);
  const args = buildComposeArgs(d, media, "mp4", out, { progress: false });
  execFileSync("ffmpeg", args);
  return { out, args };
}

describe("keyframes in the export (the same curves as the preview)", () => {
  // the 100×100 square fits the 400×300 canvas at 300×300 (scale 1)
  it("position: the square moves from the left to the right", () => {
    const { out } = render(lite(S, 100, 100), [
      K(0, { x: -0.25, scale: 0.3 }),
      K(2, { x: 0.25, scale: 0.3 }),
    ]);
    // 0.25 s: its middle at 200 + (−0.25 + 0.5·0.125)·400 = 125; at 1.9 s: ≈ 290
    expect(isRed(pixel(out, 0.2, 125, 150))).toBe(true);
    expect(isBlack(pixel(out, 0.2, 290, 150))).toBe(true);
    expect(isRed(pixel(out, 1.9, 290, 150))).toBe(true);
  });
  it("size: the square grows (0.5 → 1)", () => {
    const { out, args } = render(lite(S, 100, 100), [
      K(0, { scale: 0.5 }),
      K(2, { scale: 1 }),
    ]);
    expect(args.join(" ")).toContain("eval=frame");
    // 75 px from the middle is outside at the start (half-size 75 → edge), inside at the end (half-size 150)
    expect(isBlack(pixel(out, 0.05, 200 + 100, 150))).toBe(true);
    expect(isRed(pixel(out, 1.9, 200 + 100, 150))).toBe(true);
  });
  it("angle: the bar turns from lying to standing (0 → 90°)", () => {
    // the 200×20 bar fits 400 wide (×2): 400×40; at 0.5 scale: 200×20
    const { out, args } = render(lite(B, 200, 20), [
      K(0, { scale: 0.5, rotation: 0 }),
      K(1.5, { scale: 0.5, rotation: 90 }),
    ]);
    expect(args.join(" ")).toMatch(/rotate=a='[^']+':ow=\d+:oh=\d+/);
    expect(isRed(pixel(out, 0.05, 280, 150))).toBe(true);
    expect(isBlack(pixel(out, 0.05, 200, 230))).toBe(true);
    expect(isRed(pixel(out, 1.85, 200, 230))).toBe(true);
    expect(isBlack(pixel(out, 1.85, 280, 150))).toBe(true);
  });
  it("size and angle together", () => {
    const { out } = render(lite(B, 200, 20), [
      K(0, { scale: 0.3, rotation: 0 }),
      K(1.5, { scale: 0.6, rotation: 90 }),
    ]);
    expect(isRed(pixel(out, 1.85, 200, 150 + 100))).toBe(true);
  });
  it("opacity: the white picture fades to half and on to nothing", () => {
    const { out, args } = render(lite(Wh, 400, 300), [
      K(0, { opacity: 1 }),
      K(2, { opacity: 0 }),
    ]);
    expect(args.join(" ")).toContain("blend=c3_mode=multiply");
    expect(pixel(out, 0.05, 200, 150)[0]).toBeGreaterThan(220);
    expect(Math.abs(pixel(out, 1, 200, 150)[0] - 128)).toBeLessThan(25);
    expect(pixel(out, 1.85, 200, 150)[0]).toBeLessThan(40);
  });
  it("a steady opacity (no keyframes)", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 400, height: 300, fps: 10, background: "#000000" },
    };
    d = addMedia(d, lite(Wh, 400, 300), { at: 0, id: "p1" }).doc;
    d = setClip(d, "p1", { duration: 1, opacity: 0.5 });
    const out = join(tmp, "steady.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    expect(Math.abs(pixel(out, 0.5, 200, 150)[0] - 128)).toBeLessThan(20);
  });
  it("text: moves and grows from its anchor (the middle for a title)", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 400, height: 300, fps: 10, background: "#000000" },
    };
    d = addMedia(d, lite(Wh, 400, 300), { at: 0, id: "bg" }).doc;
    d = setClip(d, "bg", { duration: 2, opacity: 0 });
    d = addText(d, { ...textClipOf("title"), duration: 2 }, 0, "t1").doc;
    // drawn at its biggest (2): the 40×40 square is that; at the start it's half as big and 25 % to the right
    d = setClip(d, "t1", {
      anim: { in: "none", out: "none" },
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [K(0, { x: 0.25, scale: 1 }), K(1.5, { x: 0, scale: 2 })],
    });
    const out = join(tmp, "text.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, {
        progress: false,
        textOf: () => textPng,
      }),
    );
    expect(isRed(pixel(out, 0.05, 300, 150))).toBe(true);
    expect(isBlack(pixel(out, 0.05, 200, 150))).toBe(true);
    expect(isRed(pixel(out, 1.85, 200, 150))).toBe(true);
    expect(isRed(pixel(out, 1.85, 216, 150))).toBe(true);
  });
  it("40 keyframes on everything: renders, and the command stays small", () => {
    const keys = Array.from({ length: 40 }, (_, i) =>
      K(i * 0.05, {
        x: i % 2 ? 0.1 : -0.1,
        scale: 0.4 + (i % 3) * 0.1,
        rotation: i * 3,
        opacity: i % 2 ? 0.6 : 1,
        ease: i % 2 ? "linear" : undefined,
      }),
    );
    const { args } = render(lite(S, 100, 100), keys);
    expect(args.join(" ").length).toBeLessThan(64_000);
  });
});
