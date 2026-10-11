import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { applyMat, colorMatrix } from "@/lib/player/look";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";

// a 400×300 picture: red top-left, green top-right, blue bottom-left, white bottom-right
const tmp = mkdtempSync(join(tmpdir(), "VDO-look-"));
const quad = join(tmp, "quad.png");
const Q = "55555555-5555-4555-8555-555555555555";
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

const pixel = (f: string, x: number, y: number, decoder: string[] = []) => [
  ...execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...decoder,
    "-ss",
    "0.5",
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
const near = (px: number[], rgb: [number, number, number], tol = 40) =>
  rgb.every((v, i) => Math.abs(px[i] - v) <= tol);

function render(
  patch: Record<string, unknown>,
  kind: "mp4" | "webm" = "mp4",
  background = "#000000",
): string {
  let d: TimelineDoc = {
    ...emptyDoc(),
    canvas: { width: 400, height: 300, fps: 10, background },
  };
  d = addMedia(d, lite, { at: 0, id: "p1" }).doc;
  d = setClip(d, "p1", { duration: 1, ...patch });
  const out = join(tmp, `out-${Math.random().toString(36).slice(2)}.${kind}`);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(d, media, kind, out, { progress: false }),
  );
  return out;
}
const T = { fit: "fit" as const, x: 0, y: 0, scale: 1 };

describe("the clip look in the export (same numbers as the preview)", () => {
  it("as is: red top-left", () => {
    expect(near(pixel(render({}), 50, 50), [255, 0, 0])).toBe(true);
  });
  it("flip: green top-left", () => {
    expect(
      near(
        pixel(render({ transform: { ...T, flipX: true } }), 50, 50),
        [0, 255, 0],
      ),
    ).toBe(true);
  });
  it("turn 90°: the picture is on its side, red top-right, fitted", () => {
    const f = render({ transform: { ...T, rotation: 90 } });
    // turned 300×400 fits as 225×300, centred: x from 87.5 to 312.5
    expect(near(pixel(f, 250, 40), [255, 0, 0])).toBe(true);
    expect(near(pixel(f, 150, 40), [0, 0, 255])).toBe(true);
    expect(near(pixel(f, 30, 150), [0, 0, 0])).toBe(true); // bar at the side
  });
  it("crop to the red quarter: it fills the canvas", () => {
    const f = render({
      transform: { ...T, crop: { l: 0, t: 0, r: 0.5, b: 0.5 } },
    });
    expect(near(pixel(f, 380, 280), [255, 0, 0])).toBe(true);
  });
  it("color: black & white turns red into its grey (as the matrix says)", () => {
    const color = { brightness: 0, contrast: 1, saturation: 0, temperature: 0 };
    const want = applyMat(colorMatrix(color), [1, 0, 0, 1]).map((v) =>
      Math.round(v * 255),
    );
    const px = pixel(render({ color }), 50, 50);
    expect(near(px, [want[0], want[1], want[2]], 18)).toBe(true);
  });
  it("circle mask with a border: corners see-through, middle solid, the ring at the edge", () => {
    const f = render(
      {
        mask: {
          shape: "circle",
          radius: 0,
          feather: 1,
          border: { color: "#ffff00", width: 8 },
        },
      },
      "webm",
      "transparent",
    );
    const dec = ["-c:v", "libvpx-vp9"];
    expect(pixel(f, 5, 5, dec)[3]).toBeLessThan(10);
    expect(pixel(f, 200, 150, dec)[3]).toBeGreaterThan(240);
    // the circle is 300 across, centred: its left edge is at x = 50; the ring is just inside
    const ring = pixel(f, 54, 150, dec);
    expect(near(ring, [255, 255, 0], 60)).toBe(true);
  });

  it("a backdrop goes under everything (studio set PNG / a picture), and makes the video solid", () => {
    // the drawn backdrop arrives as a PNG: a plain orange one stands in for it
    const bdPng = join(tmp, "bd.png");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0xff8800:s=400x300",
      "-frames:v",
      "1",
      bdPng,
    ]);
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: {
        width: 400,
        height: 300,
        fps: 10,
        background: "#000000",
        backdrop: { kind: "set", id: "newsroom" },
      },
    };
    d = addMedia(d, lite, { at: 0, id: "p1" }).doc;
    d = setClip(d, "p1", { duration: 1, transform: { ...T, scale: 0.5 } });
    const out = join(tmp, "bd.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, {
        progress: false,
        backdropOf: () => bdPng,
      }),
    );
    expect(near(pixel(out, 10, 10), [255, 136, 0])).toBe(true); // the backdrop around
    expect(near(pixel(out, 120, 90), [255, 0, 0])).toBe(true); // the picture on top
    // a picture backdrop (My Assets) fills the canvas
    const d2: TimelineDoc = {
      ...d,
      canvas: { ...d.canvas, backdrop: { kind: "media", mediaId: Q } },
    };
    const out2 = join(tmp, "bd2.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d2, { [Q]: { ...media[Q], still: true } }, "mp4", out2, {
        progress: false,
      }),
    );
    expect(near(pixel(out2, 10, 10), [255, 0, 0])).toBe(true);
  });

  it("export presets: a 16:9 project made at 9:16 is fitted with bars", () => {
    let d: TimelineDoc = {
      ...emptyDoc(),
      canvas: { width: 1080, height: 1920, fps: 10, background: "#000000" },
    };
    d = addMedia(d, lite, { at: 0, id: "p1" }).doc;
    d = setClip(d, "p1", { duration: 1 });
    const out = join(tmp, "tall.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    const dims = execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      out,
    ])
      .toString()
      .trim();
    expect(dims).toBe("1080,1920");
    expect(near(pixel(out, 540, 100), [0, 0, 0])).toBe(true); // bar above
    expect(near(pixel(out, 200, 900), [255, 0, 0])).toBe(true); // the picture in the middle
  });

  it("stabilize: the steadied copy keeps the length and frames", async () => {
    const { derivedArgs } = await import("@/lib/media/derived");
    const shaky = join(tmp, "shaky.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x240:r=24:d=2",
      "-vf",
      "crop=280:200:20+10*sin(n):20+10*cos(n*1.3)",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      shaky,
    ]);
    const out = join(tmp, "stable.mp4");
    const args = derivedArgs("stabilize", shaky, out, {
      width: 280,
      height: 200,
      fps: 24,
      hasAudio: false,
    }).filter((a) => a !== "-progress" && a !== "pipe:1" && a !== "-nostats");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    const frames = execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      out,
    ])
      .toString()
      .trim();
    expect(Number(frames)).toBe(48);
  }, 60_000);

  it("watermark boxes: remove fills from around, blur mixes, cover paints", () => {
    // a white "logo" in the red quarter, then removed: the box becomes red like around it
    const logo = { id: "w1", x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const removed = render({ patches: [{ ...logo, mode: "remove" }] });
    expect(near(pixel(removed, 80, 60), [255, 0, 0], 50)).toBe(true);
    // cover with yellow
    const covered = render({
      patches: [{ ...logo, mode: "cover", color: "#ffff00" }],
    });
    expect(near(pixel(covered, 80, 60), [255, 255, 0], 30)).toBe(true);
    expect(near(pixel(covered, 150, 120), [255, 0, 0], 30)).toBe(true); // outside the box: untouched
    // blur across the red / green edge: a mix in the middle
    const blurred = render({
      patches: [
        {
          id: "w2",
          x: 0.4,
          y: 0.1,
          w: 0.2,
          h: 0.2,
          mode: "blur",
          strength: 20,
        },
      ],
    });
    const [r, g] = pixel(blurred, 200, 60);
    expect(r).toBeGreaterThan(60);
    expect(g).toBeGreaterThan(60);
  });
});
