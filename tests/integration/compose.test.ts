import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  docFromSpec,
  emptyDoc,
  mainTrack,
  NO_ANIM,
  type ElementClip,
  type ElementLook,
  type MediaLite,
  type TimelineDoc,
} from "@/lib/edit/doc";
import {
  addBlank,
  addElement,
  addMedia,
  addText,
  setClip,
} from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { aiMatte } from "@/lib/ops/aiMatte";
import { makeSyntheticClip } from "../fixtures";

const tmp = mkdtempSync(join(tmpdir(), "VDO-compose-"));
const green = join(tmp, "green.mp4");
const grey = join(tmp, "grey.mp4");
const pic = join(tmp, "pic.png");
const music = join(tmp, "music.m4a");
const textPng = join(tmp, "text.png");
const G = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";
const lite = (
  id: string,
  kind: MediaLite["kind"],
  w: number,
  h: number,
  d: number,
  a: boolean,
): MediaLite => ({
  id,
  kind,
  fileName: id,
  width: w,
  height: h,
  fps: kind === "video" ? 24 : 0,
  duration: d,
  hasAudio: a,
  suggestedKey: "#12AF34",
  keyKind: "green",
});
const M: Record<string, MediaLite> = {
  [G]: lite(G, "video", 1280, 720, 4, true),
  [R]: lite(R, "video", 1280, 720, 2, false),
  [P]: lite(P, "image", 400, 300, 0, false),
  [S]: lite(S, "audio", 0, 0, 5, true),
};
const media: ComposeMedia = {
  [G]: { path: green, hasAudio: true, width: 1280, height: 720 },
  [R]: { path: grey, hasAudio: false, width: 1280, height: 720 },
  [P]: { path: pic, hasAudio: false, width: 400, height: 300 },
  [S]: { path: music, hasAudio: true, width: 0, height: 0 },
};

beforeAll(() => {
  makeSyntheticClip(green, { duration: 4 });
  makeSyntheticClip(grey, { bg: "0x808080", audio: false, duration: 2 });
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0xFF0000:s=400x300",
    "-frames:v",
    "1",
    pic,
  ]);
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=f=220:d=5",
    "-c:a",
    "aac",
    music,
  ]);
  // what the browser draws for a text clip: the canvas size, transparent, a red bar at x 100–300, y 500–600
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0.0:s=1280x720,format=rgba,drawbox=x=100:y=500:w=200:h=100:c=red@1:t=fill:replace=1",
    "-frames:v",
    "1",
    textPng,
  ]);
}, 120_000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** The timeline: green 4 s + grey 2 s on Video 1, a red picture 1–6 s, music from 0 s. */
function timeline(): TimelineDoc {
  let d = docFromSpec(
    {
      ...DEFAULT_SPEC,
      ops: DEFAULT_SPEC.ops.map((o) => ({ ...o, enabled: false })),
    },
    M[G],
  );
  d = addMedia(d, M[R]).doc;
  d = addMedia(d, M[P], { at: 1 }).doc;
  d = addMedia(d, M[S], { at: 0 }).doc;
  return d;
}

const probe = (f: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,nb_read_frames:format=duration",
      "-of",
      "json",
      f,
    ]).toString(),
  ) as {
    streams: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      nb_read_frames: string;
    }[];
    format: { duration: string };
  };
const pixel = (
  f: string,
  t: number,
  x: number,
  y: number,
  decoder: string[] = [],
) => [
  ...execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...decoder,
    "-ss",
    String(t),
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

describe("timeline export (compose)", () => {
  it("MP4: two videos back to back, a picture on top at its time, music mixed in", () => {
    const d = {
      ...timeline(),
      canvas: { width: 1280, height: 720, fps: 24, background: "#203040" },
    };
    const out = join(tmp, "out.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    const p = probe(out);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect(v).toMatchObject({ codec_name: "h264", width: 1280, height: 720 });
    expect(Number(v.nb_read_frames)).toBe(6 * 24);
    expect(
      p.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"),
    ).toBe(true);
    expect(Number(p.format.duration)).toBeGreaterThan(5.9);
    expect(Number(p.format.duration)).toBeLessThan(6.1);
    // the red picture (400×300, centered, 1–6 s) shows at 2 s but not at 0.5 s
    const [r, g] = pixel(out, 2, 640, 360);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(pixel(out, 0.5, 640, 360)[0]).toBeLessThan(200);
    // 5 s is the grey clip
    const grey5 = pixel(out, 5, 30, 30);
    expect(Math.abs(grey5[0] - 128)).toBeLessThan(20);
  });

  it("transparent pack: keyed clips keep their alpha", () => {
    let d = docFromSpec(DEFAULT_SPEC, M[G]); // green removal on
    d = addMedia(d, M[G], { ops: DEFAULT_SPEC.ops }).doc;
    expect(mainTrack(d).clips).toHaveLength(2);
    const out = join(tmp, "out.webm");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "webm", out, { progress: false }),
    );
    const p = probe(out);
    expect(
      Number(p.streams.find((s) => s.codec_type === "video")!.nb_read_frames),
    ).toBe(8 * 24);
    // corner transparent, subject solid (at 1 s the ellipse is around x = 430+250·sin(1.6)+210)
    expect(pixel(out, 5, 20, 20, ["-c:v", "libvpx-vp9"])[3]).toBeLessThan(10);
    expect(pixel(out, 5, 890, 360, ["-c:v", "libvpx-vp9"])[3]).toBeGreaterThan(
      230,
    );
  });

  it("an empty canvas timeline with only a picture works too", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 1080, height: 1920, fps: 30, background: "#ffffff" },
    };
    d = addMedia(d, M[P], { at: 0 }).doc;
    const out = join(tmp, "pic.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    const v = probe(out).streams.find((s) => s.codec_type === "video")!;
    expect(v).toMatchObject({ width: 1080, height: 1920 });
    expect(Number(v.nb_read_frames)).toBe(5 * 30);
  });

  it("text: the drawn picture shows at its time and slides in like the preview", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 1280, height: 720, fps: 24, background: "#000000" },
    };
    const t = {
      ...textClipOf("lowerThird"),
      duration: 3,
      anim: { in: "slide" as const, out: "none" as const },
    };
    d = addText(d, t, 1, "t1").doc;
    const out = join(tmp, "text.mp4");
    const args = buildComposeArgs(d, media, "mp4", out, {
      progress: false,
      textOf: (c) => (c.id === "t1" ? textPng : null),
    });
    execFileSync("ffmpeg", args);
    // before its start: no bar
    expect(pixel(out, 0.5, 200, 550)[0]).toBeLessThan(30);
    // fully in at 2 s: the bar is where it was drawn
    expect(pixel(out, 2, 200, 550)[0]).toBeGreaterThan(200);
    expect(pixel(out, 2, 350, 550)[0]).toBeLessThan(30);
    // 1.125 s (a quarter into the slide): still left of its place and half faded (like animState)
    const [early] = pixel(out, 1.1, 150, 550);
    expect(early).toBeGreaterThan(30);
    expect(early).toBeLessThan(120);
    expect(pixel(out, 1.1, 250, 550)[0]).toBeLessThan(30);
  });

  it("text without a drawn picture is left out", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 1280, height: 720, fps: 24, background: "#000000" },
    };
    d = addText(d, textClipOf("title"), 0, "t1").doc;
    const args = buildComposeArgs(d, media, "mp4", join(tmp, "none.mp4"), {
      progress: false,
    });
    expect(args.join(" ")).not.toContain("-loop");
  });

  it("blur background (AI mask) and denoised sound encode; the background stays solid", () => {
    // a mask like vision-matte makes: white subject in the middle, black around
    const mask = join(tmp, "mask.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=1280x720:r=24:d=4",
      "-vf",
      "drawbox=x=440:y=160:w=400:h=400:c=white:t=fill,format=gray",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "10",
      mask,
    ]);
    const ai = {
      id: "ai",
      type: "aiMatte" as const,
      enabled: true,
      params: { ...aiMatte.defaults, background: "blur" as const, blur: 20 },
    };
    let d = docFromSpec(
      {
        ...DEFAULT_SPEC,
        ops: [...DEFAULT_SPEC.ops.map((o) => ({ ...o, enabled: false })), ai],
      },
      M[G],
    );
    d = {
      ...d,
      canvas: { width: 1280, height: 720, fps: 24, background: "#000000" },
    };
    d = {
      ...d,
      tracks: d.tracks.map((t) =>
        t.kind === "main"
          ? {
              ...t,
              clips: t.clips.map((c) => ({ ...c, denoise: "light" as const })),
            }
          : t,
      ),
    };
    const out = join(tmp, "blur.mp4");
    const args = buildComposeArgs(d, media, "mp4", out, {
      progress: false,
      maskOf: () => mask,
    });
    expect(args.join(" ")).toContain("gblur=sigma=20");
    expect(args.join(" ")).toContain("afftdn");
    execFileSync("ffmpeg", args);
    const p = probe(out);
    expect(
      Number(p.streams.find((s) => s.codec_type === "video")!.nb_read_frames),
    ).toBe(4 * 24);
    // outside the subject: the (blurred) green background, not black
    const [r, g] = pixel(out, 1, 60, 60);
    expect(g).toBeGreaterThan(120);
    expect(r).toBeLessThan(80);
  });
});

describe("elements (drawn by the browser, placed like a picture)", () => {
  const ff = (...a: string[]) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...a]);
  const el = (
    look: Partial<ElementLook> & Pick<ElementLook, "kind" | "aspect">,
    over: Partial<Omit<ElementClip, "id">> = {},
  ): Omit<ElementClip, "id"> => ({
    type: "element",
    el: { fill: "#ff0000", stroke: "none", strokeWidth: 0, ...look },
    duration: 3,
    transform: { fit: "fit", x: 0, y: 0, scale: 1 },
    anim: NO_ANIM,
    fadeIn: 0,
    fadeOut: 0,
    ...over,
  });
  const canvasDoc = (w: number, h: number, bg: string): TimelineDoc => ({
    ...emptyDoc(),
    canvas: { width: w, height: h, fps: 24, background: bg },
  });
  const frame = (f: string, t: number) =>
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(t),
      "-i",
      f,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ]);
  const isRed = (p: number[]) => p[0] > 180 && p[1] < 90 && p[2] < 90;
  const isBlue = (p: number[]) => p[2] > 180 && p[0] < 90;

  it("shows at its time, turned, with clean edges (premultiplied: no dark rim)", () => {
    // what the browser draws: a 200 × 100 red box and a white one
    const red = join(tmp, "el-red.png");
    const white = join(tmp, "el-white.png");
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=200x100,format=rgba",
      "-frames:v",
      "1",
      red,
    );
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=200x100,format=rgba",
      "-frames:v",
      "1",
      white,
    );
    // a white 640 × 360 canvas (aspect 2: 640 × 320 at scale 1, so 0.3125 is 200 × 100);
    // the red box 1–3 s on the left, the white one turned 30° on the right
    let d = canvasDoc(640, 360, "#ffffff");
    d = addElement(
      d,
      el(
        { kind: "rect", aspect: 2 },
        {
          duration: 2,
          transform: { fit: "fit", x: -0.25, y: 0, scale: 0.3125 },
        },
      ),
      1,
      "red",
    ).doc;
    d = addElement(
      d,
      el(
        { kind: "rect", aspect: 2, fill: "#ffffff" },
        {
          transform: { fit: "fit", x: 0.25, y: 0, scale: 0.3125, rotation: 30 },
        },
      ),
      0,
      "white",
    ).doc;
    const out = join(tmp, "elements.mp4");
    const args = buildComposeArgs(d, {}, "mp4", out, {
      progress: false,
      elementOf: (c) => ({ png: c.id === "red" ? red : white, w: 200, h: 100 }),
    });
    expect(args.join(" ")).toContain("premultiply=inplace=1,rotate=");
    execFileSync("ffmpeg", args);
    expect(isRed(pixel(out, 0.5, 160, 180))).toBe(false);
    expect(isRed(pixel(out, 2, 160, 180))).toBe(true);
    // the turned white box on white: nothing darker round its edges
    const f = frame(out, 2);
    let min = 255;
    for (let y = 0; y < 360; y++)
      for (let x = 330; x < 640; x++) min = Math.min(min, f[(y * 640 + x) * 4]);
    expect(min).toBeGreaterThanOrEqual(240);
  });

  it("a progress bar fills over its clip (a window slides over the full and the empty bar)", () => {
    const pair = join(tmp, "el-pair.png");
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=400x20,format=rgba[a];color=c=blue:s=400x20,format=rgba[b];[a][b]hstack=inputs=2[out0]",
      "-frames:v",
      "1",
      pair,
    );
    // aspect 20 on 400 × 100: 400 × 20 at scale 1, in the middle
    let d = canvasDoc(400, 100, "#000000");
    d = addElement(
      d,
      el({ kind: "progress", aspect: 20 }, { duration: 4 }),
      0,
      "bar",
    ).doc;
    const out = join(tmp, "progress.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, {}, "mp4", out, {
        progress: false,
        elementOf: () => ({ png: pair, w: 400, h: 20 }),
      }),
    );
    // a quarter of the way: red up to x 100; three quarters: up to x 300
    expect(isRed(pixel(out, 1, 60, 50))).toBe(true);
    expect(isBlue(pixel(out, 1, 200, 50))).toBe(true);
    expect(isRed(pixel(out, 3, 260, 50))).toBe(true);
    expect(isBlue(pixel(out, 3, 360, 50))).toBe(true);
  });

  it("a ticker's words slide left and loop", () => {
    // a see-through band, and a 400-wide strip of words with a red mark at its start
    const band = join(tmp, "el-band.png");
    const words = join(tmp, "el-words.png");
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=black@0.0:s=300x40,format=rgba",
      "-frames:v",
      "1",
      band,
    );
    ff(
      "-f",
      "lavfi",
      "-i",
      "color=c=black@0.0:s=400x40,format=rgba,drawbox=x=0:y=0:w=20:h=40:c=red@1:t=fill:replace=1",
      "-frames:v",
      "1",
      words,
    );
    let d = canvasDoc(300, 100, "#000000");
    d = addElement(
      d,
      el({ kind: "ticker", aspect: 7.5 }, { duration: 6 }),
      0,
      "tk",
    ).doc;
    const out = join(tmp, "ticker.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, {}, "mp4", out, {
        progress: false,
        elementOf: () => ({
          png: band,
          w: 300,
          h: 40,
          strip: { png: words, w: 400, x: 0, win: 300, speed: 50 },
        }),
      }),
    );
    // at 0 s the mark is on the left; 5 s later (250 px on) its next repeat has come round to x 150–170
    expect(isRed(pixel(out, 0, 10, 50))).toBe(true);
    expect(isRed(pixel(out, 0, 160, 50))).toBe(false);
    expect(isRed(pixel(out, 5, 160, 50))).toBe(true);
    expect(isRed(pixel(out, 5, 10, 50))).toBe(false);
  });
});

describe("blank scenes (a color on Video 1)", () => {
  it("a blank between two clips shows its color at its time, and a crossfade into it blends", () => {
    const blue = join(tmp, "blue.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x0000ff:s=640x360:r=24:d=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      blue,
    ]);
    const B = "55555555-5555-4555-8555-555555555555";
    const lb = lite(B, "video", 640, 360, 4, false);
    const mb: ComposeMedia = {
      [B]: { path: blue, hasAudio: false, width: 640, height: 360 },
    };
    // blue 0–4, a red blank, blue again; a 1 s crossfade into the blank (so it's 3–6, the second blue 6–10)
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 640, height: 360, fps: 24, background: "#000000" },
    };
    d = addMedia(d, lb, { id: "c1" }).doc;
    d = addMedia(d, lb, { id: "c2" }).doc;
    d = addBlank(d, 1, { id: "b1", fill: "#ff0000" }).doc;
    d = setClip(d, "b1", { transitionIn: { type: "crossfade", duration: 1 } });
    const out = join(tmp, "blank.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, mb, "mp4", out, { progress: false }),
    );
    expect(Number(probe(out).format.duration)).toBeGreaterThan(9.9);
    const [r1, , b1] = pixel(out, 1, 320, 180);
    expect(b1).toBeGreaterThan(200);
    expect(r1).toBeLessThan(60);
    // halfway through the crossfade: half blue, half red
    const [r2, , b2] = pixel(out, 3.5, 320, 180);
    expect(r2).toBeGreaterThan(70);
    expect(r2).toBeLessThan(190);
    expect(b2).toBeGreaterThan(70);
    expect(b2).toBeLessThan(190);
    // on the blank: red
    const [r3, g3, b3] = pixel(out, 4.5, 320, 180);
    expect(r3).toBeGreaterThan(200);
    expect(g3).toBeLessThan(60);
    expect(b3).toBeLessThan(60);
    // then the second clip
    expect(pixel(out, 7.5, 320, 180)[2]).toBeGreaterThan(200);
  });
});
