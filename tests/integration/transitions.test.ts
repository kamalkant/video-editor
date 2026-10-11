import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  emptyDoc,
  mainDuration,
  type MediaLite,
  type TimelineDoc,
} from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { mainTransitionAt } from "@/lib/player/transitions";

const tmp = mkdtempSync(join(tmpdir(), "VDO-tr-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const make = (color: string, file: string) =>
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=320x180:r=24:d=2`,
    "-f",
    "lavfi",
    "-i",
    "sine=f=200:d=2",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    join(tmp, file),
  ]);
make("0xff0000", "a.mp4");
make("0xffff00", "b.mp4");
const lite = (id: string): MediaLite => ({
  id,
  kind: "video",
  fileName: id,
  width: 320,
  height: 180,
  fps: 24,
  duration: 2,
  hasAudio: true,
  suggestedKey: null,
  keyKind: null,
});
const media: ComposeMedia = {
  [A]: { path: join(tmp, "a.mp4"), hasAudio: true, width: 320, height: 180 },
  [B]: { path: join(tmp, "b.mp4"), hasAudio: true, width: 320, height: 180 },
};

function two(type: string): TimelineDoc {
  let d: TimelineDoc = {
    ...emptyDoc(),
    canvas: { width: 320, height: 180, fps: 24, background: "#000000" },
  };
  d = addMedia(d, lite(A), { id: "c1", ops: [] }).doc;
  d = addMedia(d, lite(B), { id: "c2", ops: [] }).doc;
  return setClip(d, "c2", { transitionIn: { type, duration: 1 } });
}
const pixel = (f: string, t: number, x: number, y: number) => [
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
    `crop=1:1:${x}:${y},format=rgba`,
    "-f",
    "rawvideo",
    "pipe:1",
  ]),
];
function render(type: string) {
  const out = join(tmp, `${type}.mp4`);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(two(type), media, "mp4", out, { progress: false }),
  );
  return out;
}

describe("transitions (the export follows the preview's curves)", () => {
  it("the clips overlap: two 2 s clips with a 1 s transition make 3 s", () => {
    expect(mainDuration(two("crossfade"))).toBeCloseTo(3, 6);
    const out = render("crossfade");
    const d = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        out,
      ]).toString(),
    );
    expect(d).toBeGreaterThan(2.9);
    expect(d).toBeLessThan(3.15);
  });
  it("crossfade: the middle is a blend of red and yellow", () => {
    const out = render("crossfade");
    expect(pixel(out, 0.4, 160, 90)[1]).toBeLessThan(40); // red
    const [r, g] = pixel(out, 1.5, 160, 90);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(70);
    expect(g).toBeLessThan(180);
    expect(pixel(out, 2.6, 160, 90)[1]).toBeGreaterThan(220); // yellow
  });
  it("slide left: half-way, the yellow clip covers the right half", () => {
    const out = render("slideLeft");
    expect(pixel(out, 1.5, 60, 90)[1]).toBeLessThan(60);
    expect(pixel(out, 1.5, 260, 90)[1]).toBeGreaterThan(200);
  });
  it("dip to black: black in the middle; the preview agrees", () => {
    const out = render("dipBlack");
    const [r, g] = pixel(out, 1.5, 160, 90);
    expect(r + g).toBeLessThan(40);
    const d = two("dipBlack");
    const main = d.tracks.find((t) => t.kind === "main")!;
    const st = mainTransitionAt(main.clips as never, [0, 1], 1.5);
    expect(st.dip?.alpha).toBeCloseTo(1, 5);
  });
});

describe("more transitions: wipes, circles, zoom, spin (the preview's rules)", () => {
  // the transition runs 1 → 2 s; half-way (1.5 s) the smooth curve is at 0.5
  it("wipe left: the yellow clip shows on the right half, the red one on the left", () => {
    const out = render("wipeLeft");
    expect(pixel(out, 1.5, 60, 90)[1]).toBeLessThan(60);
    expect(pixel(out, 1.5, 260, 90)[1]).toBeGreaterThan(200);
    expect(pixel(out, 2.6, 60, 90)[1]).toBeGreaterThan(200); // after it: all yellow
  });
  it("wipe down: yellow at the top half-way", () => {
    const out = render("wipeDown");
    expect(pixel(out, 1.5, 160, 20)[1]).toBeGreaterThan(200);
    expect(pixel(out, 1.5, 160, 160)[1]).toBeLessThan(60);
  });
  it("circle open: yellow in the middle, red in the corners; circle close: the other way round", () => {
    const open = render("circleOpen");
    expect(pixel(open, 1.5, 160, 90)[1]).toBeGreaterThan(200);
    expect(pixel(open, 1.5, 5, 5)[1]).toBeLessThan(60);
    const close = render("circleClose");
    expect(pixel(close, 1.5, 160, 90)[1]).toBeLessThan(60);
    expect(pixel(close, 1.5, 5, 5)[1]).toBeGreaterThan(200);
  });
  it("zoom in / zoom out / spin: made, and the next clip is all there after", () => {
    for (const type of ["zoomIn", "zoomOut", "spin"]) {
      const out = render(type);
      expect(pixel(out, 2.6, 160, 90)[1], type).toBeGreaterThan(200);
      expect(pixel(out, 2.6, 5, 5)[1], type).toBeGreaterThan(200);
    }
    // spin half-way: the yellow clip is smaller and turned: a corner still shows red
    expect(pixel(render("spin"), 1.5, 3, 3)[1]).toBeLessThan(60);
  });
});
