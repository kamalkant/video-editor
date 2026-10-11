import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// its own storage (never the real one)
const tmp = mkdtempSync(join(tmpdir(), "VDO-speed-"));
process.env.VDO_STORAGE = tmp;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const ID = "88888888-8888-4888-8888-888888888888";
const src = join(tmp, "videos", ID, "source");
// brighter every frame: then "backwards" is easy to see
mkdirSync(join(tmp, "videos", ID), { recursive: true });
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=black:s=160x90:r=24:d=5,format=gray,geq=lum='min(250\\,T*50)'",
  "-f",
  "lavfi",
  "-i",
  "sine=f=300:d=5",
  "-shortest",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-f",
  "mp4",
  src,
]);
const meta = {
  id: ID,
  kind: "video" as const,
  fileName: "ramp.mp4",
  createdAt: 0,
  info: {
    width: 160,
    height: 90,
    fps: 24,
    duration: 5,
    hasAudio: true,
  } as never,
  suggestedKey: null,
  keyKind: null,
};
writeFileSync(join(tmp, "videos", ID, "meta.json"), JSON.stringify(meta));

const lum = (f: string, t: number) =>
  [
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
      "crop=1:1:80:45,format=gray",
      "-f",
      "rawvideo",
      "pipe:1",
    ]),
  ][0];
const frames = (f: string) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      f,
    ]).toString(),
  );

describe("speed and reverse, for real", () => {
  it("a 2× clip is half as long in the export, with sound", async () => {
    const { buildComposeArgs } = await import("@/lib/render/compose");
    const { emptyDoc } = await import("@/lib/edit/doc");
    const { addMedia, setClip } = await import("@/lib/edit/docEdit");
    let d = {
      ...emptyDoc(),
      canvas: { width: 160, height: 90, fps: 24, background: "#000000" },
    };
    d = addMedia(
      d,
      {
        id: ID,
        kind: "video",
        fileName: "r",
        width: 160,
        height: 90,
        fps: 24,
        duration: 5,
        hasAudio: true,
        suggestedKey: null,
        keyKind: null,
      },
      { id: "c1", ops: [] },
    ).doc;
    d = setClip(d, "c1", { in: 0, out: 4, speed: 2 });
    const out = join(tmp, "fast.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(
        d,
        { [ID]: { path: src, hasAudio: true, width: 160, height: 90 } },
        "mp4",
        out,
        { progress: false },
      ),
    );
    expect(frames(out)).toBe(48);
    const dur = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=duration",
        "-of",
        "csv=p=0",
        out,
      ]).toString(),
    );
    expect(dur).toBeGreaterThan(1.9);
    expect(dur).toBeLessThan(2.1);
    // at 1 s of the export we see 2 s of the source (brightness ≈ 100)
    expect(Math.abs(lum(out, 1) - 100)).toBeLessThan(18);
  }, 60_000);

  it("a reversed part plays from its end to its start (made in pieces)", async () => {
    const { ensureReversed } = await import("@/lib/media/reverse");
    const out = await ensureReversed(meta as never, 0.5, 4.5);
    expect(frames(out)).toBeGreaterThanOrEqual(95);
    expect(frames(out)).toBeLessThanOrEqual(97);
    expect(lum(out, 0.05)).toBeGreaterThan(lum(out, 3.5) + 100); // bright first, dark last
  }, 120_000);
});
