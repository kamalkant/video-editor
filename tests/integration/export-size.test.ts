import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { estimateBytes } from "@/lib/export/size";
import { measureBusyness } from "@/lib/ffmpeg/busyness";
import {
  buildComposeArgs,
  type ComposeKind,
  type ComposeMedia,
} from "@/lib/render/compose";

// a 6-second 640×360 clip with a busy, moving picture and a tone
const tmp = mkdtempSync(join(tmpdir(), "VDO-size-"));
const clip = join(tmp, "clip.mp4");
const V = "99999999-9999-4999-8999-999999999999";
const media: ComposeMedia = {
  [V]: { path: clip, hasAudio: true, width: 640, height: 360 },
};
const lite: MediaLite = {
  id: V,
  kind: "video",
  fileName: "clip.mp4",
  width: 640,
  height: 360,
  fps: 30,
  duration: 6,
  hasAudio: true,
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
    "mandelbrot=s=640x360:rate=30,noise=alls=4:allf=t,format=yuv420p",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=6",
    "-t",
    "6",
    "-c:v",
    "libx264",
    "-crf",
    "12",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-shortest",
    clip,
  ]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const doc: TimelineDoc = addMedia(
  {
    ...emptyDoc(),
    canvas: { width: 640, height: 360, fps: 30, background: "#000000" },
  },
  lite,
  { at: 0, id: "v1" },
).doc;
function realSize(
  kind: ComposeKind,
  name: string,
  quality: "small" | "balanced" | "best" = "balanced",
) {
  const out = join(tmp, name);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(
      { ...doc, output: { ...doc.output, quality } },
      media,
      kind,
      out,
      { progress: false },
    ),
  );
  return statSync(out).size;
}

describe("the export size estimate is close to the real file", () => {
  it("a 2-second test encode measures how busy the picture is", async () => {
    const m = await measureBusyness(V, clip, 6, 2, 640, 360, 30);
    expect(m.bpp).toBeGreaterThan(0.01);
    expect(m.width).toBe(640);
    // the same sample again comes from the cache
    expect((await measureBusyness(V, clip, 6, 2, 640, 360, 30)).bpp).toBe(
      m.bpp,
    );
  });

  it.each([
    ["mp4", "mp4", "a.mp4", "balanced"],
    ["mp4", "mp4", "b.mp4", "small"],
    ["webm", "vp9", "c.webm", "balanced"],
    ["hevc", "hevc", "d.mp4", "balanced"],
  ] as const)("%s (%s, %s)", async (format, kind, name, quality) => {
    const { bpp, width, height } = await measureBusyness(
      V,
      clip,
      6,
      2,
      640,
      360,
      30,
    );
    const est = estimateBytes(format, {
      width: 640,
      height: 360,
      fps: 30,
      duration: 6,
      quality,
      hasSound: true,
      bpp,
      measuredAt: { width, height },
    });
    const real = realSize(kind, name, quality);
    const ratio = est / real;
    expect(ratio, `estimated ${est}, real ${real}`).toBeGreaterThan(0.5);
    expect(ratio, `estimated ${est}, real ${real}`).toBeLessThan(2);
  });
});
