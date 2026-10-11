import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { EXPORT_FORMATS, formatBlocked } from "@/lib/export/presets";
import {
  buildComposeArgs,
  type ComposeKind,
  type ComposeMedia,
} from "@/lib/render/compose";

// a 2-second 320×240 test video with a tone, and a white picture
const tmp = mkdtempSync(join(tmpdir(), "VDO-formats-"));
const clip = join(tmp, "clip.mp4");
const V = "88888888-8888-4888-8888-888888888888";
const media: ComposeMedia = {
  [V]: { path: clip, hasAudio: true, width: 320, height: 240 },
};
const lite: MediaLite = {
  id: V,
  kind: "video",
  fileName: "clip.mp4",
  width: 320,
  height: 240,
  fps: 10,
  duration: 2,
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
    "testsrc=s=320x240:r=10:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    clip,
  ]);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const docOf = (background = "#000000"): TimelineDoc =>
  addMedia(
    { ...emptyDoc(), canvas: { width: 320, height: 240, fps: 10, background } },
    lite,
    { at: 0, id: "v1" },
  ).doc;

function probe(f: string) {
  const j = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      f,
    ]).toString(),
  );
  const v = j.streams.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  const a = j.streams.find(
    (s: { codec_type: string }) => s.codec_type === "audio",
  );
  return {
    v: v?.codec_name as string | undefined,
    pix: v?.pix_fmt as string | undefined,
    w: v?.width as number | undefined,
    a: a?.codec_name as string | undefined,
    dur: Number(j.format.duration ?? 0),
    fmt: j.format.format_name as string,
  };
}
function make(kind: ComposeKind, name: string, d = docOf(), at?: number) {
  const out = join(tmp, name);
  execFileSync(
    "ffmpeg",
    buildComposeArgs(d, media, kind, out, { progress: false, at }),
  );
  return probe(out);
}

describe("every export format makes a real file", () => {
  it.each([
    ["hevc", "a.mp4", "hevc", "aac"],
    ["av1", "b.mp4", "av1", "aac"],
    ["vp9", "c.webm", "vp9", "opus"],
    ["prores", "d.mov", "prores", "pcm_s16le"],
  ] as const)("%s video with sound", (kind, name, v, a) => {
    const p = make(kind, name);
    expect(p.v).toBe(v);
    expect(p.a).toBe(a);
    expect(p.w).toBe(320);
    expect(Math.abs(p.dur - 2)).toBeLessThan(0.3);
  });

  it("GIF: animated, no sound", () => {
    const p = make("gif", "e.gif");
    expect(p.v).toBe("gif");
    expect(p.a).toBeUndefined();
    expect(p.dur).toBeGreaterThan(1.5);
  });

  it.each([
    ["mp3", "f.mp3", "mp3"],
    ["m4a", "g.m4a", "aac"],
    ["wav", "h.wav", "pcm_s16le"],
  ] as const)("%s: sound only, no picture", (kind, name, a) => {
    const p = make(kind, name);
    expect(p.v).toBeUndefined();
    expect(p.a).toBe(a);
    expect(Math.abs(p.dur - 2)).toBeLessThan(0.3);
  });

  it("PNG / JPG: the frame at the playhead; PNG keeps a see-through canvas", () => {
    const png = make("png", "i.png", docOf("transparent"), 1.2);
    expect(png.v).toBe("png");
    expect(png.pix).toBe("rgba");
    const jpg = make("jpg", "j.jpg", docOf(), 1.2);
    expect(jpg.v).toBe("mjpeg");
  });

  it("a transparent canvas turns black in formats without alpha", () => {
    const f = join(tmp, "k.mp4");
    execFileSync(
      "ffmpeg",
      buildComposeArgs(docOf("transparent"), media, "hevc", f, {
        progress: false,
      }),
    );
    expect(probe(f).pix).toBe("yuv420p");
  });

  it("formats that can't be made say why", () => {
    expect(
      formatBlocked("webm-alpha", {
        transparent: false,
        hasSound: true,
        duration: 5,
      }),
    ).toMatch(/Transparent/);
    expect(
      formatBlocked("mp3", {
        transparent: false,
        hasSound: false,
        duration: 5,
      }),
    ).toMatch(/no sound/);
    expect(
      formatBlocked("gif", {
        transparent: false,
        hasSound: true,
        duration: 45,
      }),
    ).toMatch(/30 s/);
    expect(
      formatBlocked("mp4", {
        transparent: true,
        hasSound: false,
        duration: 500,
      }),
    ).toBeNull();
    expect(EXPORT_FORMATS[0]).toMatchObject({ id: "mp4", recommended: true });
  });
});
