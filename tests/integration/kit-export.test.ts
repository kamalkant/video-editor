import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  emptyDoc,
  watermarkRect,
  type MediaLite,
  type TimelineDoc,
} from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { vignetteGain } from "@/lib/player/look";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";

// a white 400×300 picture (the clip) and a red 100×50 logo
const tmp = mkdtempSync(join(tmpdir(), "VDO-kit-"));
const white = join(tmp, "white.png");
const logo = join(tmp, "logo.png");
const W = "66666666-6666-4666-8666-666666666666";
const L = "77777777-7777-4777-8777-777777777777";
const media: ComposeMedia = {
  [W]: { path: white, hasAudio: false, width: 400, height: 300, still: true },
  [L]: { path: logo, hasAudio: false, width: 100, height: 50, still: true },
};
const lite: MediaLite = {
  id: W,
  kind: "image",
  fileName: "white.png",
  width: 400,
  height: 300,
  fps: 0,
  duration: 0,
  hasAudio: false,
  suggestedKey: null,
  keyKind: null,
};

beforeAll(() => {
  const ff = (args: string[]) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
  ff(["-f", "lavfi", "-i", "color=c=white:s=400x300", "-frames:v", "1", white]);
  ff(["-f", "lavfi", "-i", "color=c=red:s=100x50", "-frames:v", "1", logo]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const pixel = (f: string, x: number, y: number) => [
  ...execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
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

function render(d: TimelineDoc): string {
  const out = join(tmp, `out-${Math.random().toString(36).slice(2)}.mp4`);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(d, media, "mp4", out, { progress: false }),
  );
  return out;
}
function withClip(patch: Record<string, unknown> = {}): TimelineDoc {
  let d: TimelineDoc = {
    ...emptyDoc(),
    canvas: { width: 400, height: 300, fps: 10, background: "#000000" },
  };
  d = addMedia(d, lite, { at: 0, id: "p1" }).doc;
  return setClip(d, "p1", { duration: 1, ...patch });
}

describe("Looks and the Brand Kit in the export (same numbers as the preview)", () => {
  it("vignette: the middle stays white, the corners get as dark as the preview curve says", () => {
    const f = render(
      withClip({
        color: {
          brightness: 0,
          contrast: 1,
          saturation: 1,
          temperature: 0,
          vignette: 1,
        },
      }),
    );
    expect(pixel(f, 200, 150)[0]).toBeGreaterThan(245);
    for (const [x, y] of [
      [10, 10],
      [60, 250],
      [350, 40],
    ]) {
      const want = 255 * vignetteGain(1, x + 0.5, y + 0.5, 400, 300);
      expect(
        Math.abs(pixel(f, x, y)[0] - want),
        `at ${x},${y}`,
      ).toBeLessThanOrEqual(14);
    }
  });

  it("logo: in its corner at its size, see-through as set, nothing elsewhere", () => {
    const wm = {
      mediaId: L,
      corner: "br" as const,
      size: 0.25,
      opacity: 0.5,
      margin: 0.05,
    };
    const d = { ...withClip(), watermark: wm };
    const r = watermarkRect(wm, 400, 300, 100, 50);
    expect(r).toEqual({ x: 280, y: 230, w: 100, h: 50 });
    const f = render(d);
    // half red over white ≈ (255, 128, 128)
    const px = pixel(f, r.x + 50, r.y + 25);
    expect(px[0]).toBeGreaterThan(230);
    expect(Math.abs(px[1] - 128)).toBeLessThanOrEqual(20);
    expect(pixel(f, 100, 100)[1]).toBeGreaterThan(240); // the clip, untouched
  });

  it("logo dragged on the preview: its middle at x/y in the file too", () => {
    const wm = {
      mediaId: L,
      corner: "br" as const,
      size: 0.25,
      opacity: 1,
      margin: 0.05,
      x: 0.3,
      y: 0.4,
    };
    const r = watermarkRect(wm, 400, 300, 100, 50);
    expect(r).toEqual({ x: 70, y: 95, w: 100, h: 50 });
    const f = render({ ...withClip(), watermark: wm });
    expect(pixel(f, 120, 120)[1]).toBeLessThan(40); // red where it was dragged
    expect(pixel(f, 330, 255)[1]).toBeGreaterThan(240); // and not in its old corner
  });
});

describe("logo: a part of the video, and coming in", () => {
  it("shows only from 0.4 s on, fading in", () => {
    const wm = {
      mediaId: L,
      corner: "br" as const,
      size: 0.25,
      opacity: 1,
      margin: 0.05,
      from: 0.4,
      anim: { in: "fade" as const, out: "none" as const },
    };
    const d = setClip({ ...withClip(), watermark: wm }, "p1", { duration: 2 });
    const r = watermarkRect(wm, 400, 300, 100, 50);
    const out = join(tmp, "logo-part.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(d, media, "mp4", out, { progress: false }),
    );
    const at = (s: number) => [
      ...execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        String(s),
        "-i",
        out,
        "-frames:v",
        "1",
        "-vf",
        `crop=1:1:${r.x + 50}:${r.y + 25},format=rgba`,
        "-f",
        "rawvideo",
        "pipe:1",
      ]),
    ];
    expect(at(0.2)[1]).toBeGreaterThan(240); // not yet: white
    expect(at(1.5)[1]).toBeLessThan(40); // red
  });
});
