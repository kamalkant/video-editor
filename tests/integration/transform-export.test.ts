import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  emptyDoc,
  type MediaLite,
  type TimelineDoc,
  type Transform,
} from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { motionAt, transformAt } from "@/lib/edit/keyframes";
import { placeClip } from "@/lib/player/look";
import { applyH, boxQuad, squareToQuad, type Pt } from "@/lib/player/quad";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { blendChannel } from "@/lib/render/blend";

// a 400×300 picture: red top-left, green top-right, blue bottom-left, white bottom-right (like tests/integration/look)
const tmp = mkdtempSync(join(tmpdir(), "VDO-tx-"));
const quad = join(tmp, "quad.png");
const Q = "66666666-6666-4666-8666-666666666666";
const media: ComposeMedia = {
  [Q]: { path: quad, hasAudio: false, width: 400, height: 300 },
};
const lite: MediaLite = {
  id: Q,
  kind: "image",
  fileName: "quad.png",
  width: 400,
  height: 300,
  fps: 0,
  duration: 0,
  hasAudio: false,
  suggestedKey: null,
  keyKind: null,
};
const W = 640;
const H = 480;

beforeAll(() => {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=400x300",
    "-vf",
    "drawbox=x=0:y=0:w=200:h=150:c=red:t=fill,drawbox=x=200:y=0:w=200:h=150:c=lime:t=fill,drawbox=x=0:y=150:w=200:h=150:c=blue:t=fill",
    "-frames:v",
    "1",
    quad,
  ]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const pixel = (f: string, p: Pt, t = 0.5) => [
  ...execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(t),
    "-i",
    f,
    "-frames:v",
    "1",
    "-vf",
    `crop=1:1:${Math.round(p.x - 0.5)}:${Math.round(p.y - 0.5)},format=rgba`,
    "-f",
    "rawvideo",
    "pipe:1",
  ]),
];
const near = (px: number[], rgb: [number, number, number], tol = 45) =>
  rgb.every((v, i) => Math.abs(px[i] - v) <= tol);

function render(
  patch: Record<string, unknown>,
  background = "#000000",
  len = 1,
): string {
  let d: TimelineDoc = {
    ...emptyDoc(),
    canvas: { width: W, height: H, fps: 10, background },
  };
  d = addMedia(d, lite, { at: 0, id: "p1" }).doc;
  d = setClip(d, "p1", { duration: len, ...patch });
  const out = join(tmp, `out-${Math.random().toString(36).slice(2)}.mp4`);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(d, media, "mp4", out, { progress: false }),
  );
  return out;
}

/** Where a point of the picture (shares 0–1) lands on the canvas, by the preview's own maths (lib/player/quad). */
function where(t: Transform, u: number, v: number): Pt {
  const p = placeClip(400, 300, W, H, t);
  const q = boxQuad(
    { cx: p.cx, cy: p.cy, w: p.w, h: p.h },
    {
      rotation: t.rotation,
      skewX: t.skewX,
      skewY: t.skewY,
      pivot: t.pivot,
      corners: t.corners,
    },
  );
  return applyH(squareToQuad(q), { x: u, y: v });
}
const QUARTERS: [number, number, [number, number, number]][] = [
  [0.25, 0.25, [255, 0, 0]],
  [0.75, 0.25, [0, 255, 0]],
  [0.25, 0.75, [0, 0, 255]],
  [0.75, 0.75, [255, 255, 255]],
];
const T = { fit: "fit" as const, x: 0, y: 0, scale: 0.6 };

describe("perspective, skew, stretch and pivot in the export land where the preview puts them (real FFmpeg)", () => {
  it("a corner pin with a turn, a stretch and a pivot: each quarter's colour at its predicted place", () => {
    const t: Transform = {
      ...T,
      x: 0.04,
      y: -0.03,
      rotation: 18,
      scaleX: 1.3,
      pivot: { x: 0.2, y: 0.8 },
      corners: {
        tl: { x: 0.08, y: 0.05 },
        tr: { x: -0.06, y: 0.1 },
        br: { x: 0, y: -0.04 },
        bl: { x: 0.05, y: 0 },
      },
    };
    const f = render({ transform: t });
    for (const [u, v, rgb] of QUARTERS)
      expect(near(pixel(f, where(t, u, v)), rgb), `${u},${v}`).toBe(true);
    // outside the shape: the canvas
    expect(near(pixel(f, { x: 6, y: 6 }), [0, 0, 0], 20)).toBe(true);
  });
  it("skew both ways: no dark rim, colours where the preview draws them", () => {
    const t: Transform = { ...T, skewX: 20, skewY: -12 };
    const f = render({ transform: t });
    for (const [u, v, rgb] of QUARTERS)
      expect(near(pixel(f, where(t, u, v)), rgb), `${u},${v}`).toBe(true);
  });
  it("keyframed skew and width: the same at two moments (the warp path)", () => {
    const base: Transform = { ...T };
    const keyframes = [
      {
        t: 0,
        x: 0,
        y: 0,
        scale: 0.6,
        rotation: 0,
        opacity: 1,
        skewX: 0,
        scaleX: 1,
      },
      {
        t: 2,
        x: 0.05,
        y: 0,
        scale: 0.6,
        rotation: 15,
        opacity: 1,
        skewX: 25,
        scaleX: 1.4,
        ease: "linear" as const,
      },
    ];
    const f = render({ transform: base, keyframes }, "#000000", 2);
    const clip = {
      id: "p1",
      type: "image" as const,
      mediaId: Q,
      start: 0,
      duration: 2,
      transform: base,
      keyframes,
      anim: { in: "none" as const, out: "none" as const },
      fadeIn: 0,
      fadeOut: 0,
    };
    for (const at of [0.5, 1.5]) {
      const t = transformAt(clip as never, at);
      void motionAt;
      for (const [u, v, rgb] of QUARTERS)
        expect(
          near(pixel(f, where(t, u, v), at), rgb, 60),
          `${at}: ${u},${v}`,
        ).toBe(true);
    }
  });
});

describe("a blend mode in the export (real FFmpeg)", () => {
  it("multiply over a grey canvas: the W3C formula", () => {
    const f = render(
      { transform: { ...T, scale: 1.2 }, blend: "multiply" },
      "#808080",
    );
    const red = pixel(f, where({ ...T, scale: 1.2 }, 0.25, 0.25));
    const want = [
      blendChannel("multiply", 128 / 255, 1),
      blendChannel("multiply", 128 / 255, 0),
      blendChannel("multiply", 128 / 255, 0),
    ].map((v) => Math.round(v * 255)) as [number, number, number];
    expect(near(red, want, 12)).toBe(true);
    const white = pixel(f, where({ ...T, scale: 1.2 }, 0.75, 0.75));
    expect(near(white, [128, 128, 128], 12)).toBe(true);
  });
});
