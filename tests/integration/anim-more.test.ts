import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { textClipOf } from "@/lib/text/layout";

const tmp = mkdtempSync(join(tmpdir(), "VDO-anim-"));
const sprite = join(tmp, "sprite.png");
const white = join(tmp, "white.png");
const P = "66666666-6666-4666-8666-666666666666";
const media: ComposeMedia = {
  [P]: { path: white, hasAudio: false, width: 400, height: 300 },
};
const lite: MediaLite = {
  id: P,
  kind: "image",
  fileName: "w.png",
  width: 400,
  height: 300,
  fps: 0,
  duration: 0,
  hasAudio: false,
  suggestedKey: null,
  keyKind: null,
};

beforeAll(() => {
  const ff = (a: string[]) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...a]);
  // 3 steps of a 200×50 text area: nothing, one red square, two red squares
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0:s=200x150,format=rgba",
    "-vf",
    "drawbox=x=0:y=50:w=50:h=50:c=red:t=fill:replace=1,drawbox=x=0:y=100:w=50:h=50:c=red:t=fill:replace=1,drawbox=x=100:y=100:w=50:h=50:c=red:t=fill:replace=1",
    "-frames:v",
    "1",
    sprite,
  ]);
  ff(["-f", "lavfi", "-i", "color=c=white:s=400x300", "-frames:v", "1", white]);
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
const canvas = (): TimelineDoc => ({
  ...emptyDoc(),
  canvas: { width: 400, height: 300, fps: 10, background: "#000000" },
});

describe("more animations in the export", () => {
  it("typewriter: the drawn steps show one after another, in the text's place", () => {
    let d = addText(
      canvas(),
      { ...textClipOf("plain"), text: "ab", duration: 4 },
      0,
      "t1",
    ).doc;
    d = setClip(d, "t1", { anim: { in: "typewriter", out: "none" } });
    const out = join(tmp, "type.mp4");
    // 2 letters: typing takes 0.5 s (half-way: one square)
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, {
        progress: false,
        textOf: () => sprite,
        textSpriteOf: () => ({
          frames: 2,
          chars: 2,
          box: { x: 100, y: 100, w: 200, h: 50 },
        }),
      }),
    );
    const red = (p: number[]) => p[0] > 180 && p[1] < 80;
    expect(red(pixel(out, 0.05, 125, 125))).toBe(false);
    expect(red(pixel(out, 0.3, 125, 125))).toBe(true);
    expect(red(pixel(out, 0.3, 225, 125))).toBe(false);
    expect(red(pixel(out, 1, 225, 125))).toBe(true);
  });
  it("pop: a picture is smaller while it comes in; blur: made (two copies)", () => {
    let d = addMedia(canvas(), lite, { at: 0, id: "p1" }).doc;
    d = setClip(d, "p1", {
      duration: 2,
      transform: { fit: "fit", x: 0, y: 0, scale: 0.5 },
      anim: { in: "pop", out: "none" },
    });
    const out = join(tmp, "pop.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    // 0.5 scale: 200×150 in the middle; at 1 s: its corner area (110, 85) is white; early on it isn't yet
    expect(pixel(out, 1, 110, 85)[0]).toBeGreaterThan(200);
    expect(pixel(out, 0.05, 110, 85)[0]).toBeLessThan(60);
    const blur = setClip(d, "p1", { anim: { in: "blur", out: "none" } });
    const out2 = join(tmp, "blur.mp4");
    const args = buildComposeArgs(blur, media, "mp4", out2, {
      progress: false,
    });
    expect(args.join(" ")).toContain("gblur");
    execFileSync("ffmpeg", args);
    expect(pixel(out2, 1.5, 200, 150)[0]).toBeGreaterThan(220);
  });
});
