import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { FILM_COLS, FILM_H, filmCount, filmFrameW } from "@/lib/editor/film";
import { renderFilm } from "@/lib/ffmpeg/preview";
import { probeVideo } from "@/lib/ffmpeg/probe";
import { makeSyntheticClip } from "../fixtures";

const tmp = mkdtempSync(join(tmpdir(), "VDO-film-"));
const green = join(tmp, "green.mp4");
beforeAll(
  () => makeSyntheticClip(green, { duration: 4, audio: false }),
  60_000,
);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** An image file's size and (when it has one) its alpha plane. */
function planes(buf: Buffer, ext: string) {
  const f = join(tmp, `x.${ext}`);
  writeFileSync(f, buf);
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    f,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  const alpha = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      f,
      "-vf",
      "format=rgba,alphaextract",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ],
    { maxBuffer: 64 << 20 },
  );
  return { w, h, alpha: (x: number, y: number) => alpha[y * w + x] };
}

describe("timeline film (real FFmpeg)", () => {
  it("frames in a grid at the video's shape; with Green removal the green is see-through", async () => {
    const info = await probeVideo(green);
    const n = filmCount(info.duration, info.fps);
    const fw = filmFrameW(info.width, info.height);
    const plain = planes(await renderFilm(green, info, null, null), "jpg");
    expect(plain.w).toBe(FILM_COLS * fw);
    expect(plain.h).toBe(Math.ceil(n / FILM_COLS) * FILM_H);
    expect(plain.alpha(3, 3)).toBe(255);
    const keyed = planes(
      await renderFilm(green, info, DEFAULT_SPEC, null),
      "png",
    );
    expect(keyed.w).toBe(plain.w);
    // the green corner of frame 0 and of frame 5 is gone; the corners are background
    expect(keyed.alpha(3, 3)).toBeLessThan(10);
    expect(keyed.alpha(5 * fw + 3, FILM_H - 3)).toBeLessThan(10);
    // the person in the middle stays solid
    expect(
      keyed.alpha(Math.round(fw * 0.55), Math.round(FILM_H / 2)),
    ).toBeGreaterThan(200);
  }, 60_000);
});
