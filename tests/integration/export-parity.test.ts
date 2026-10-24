import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { asSingleVideo, emptyDoc, imageClipOf, mainTrack, type BlankClip, type ImageClip, type MediaLite, type TextClip, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { textClipOf } from "@/lib/text/layout";

/**
 * The server export of what the preview draws: transitions on texts and elements, blank scenes with a backdrop,
 * the Effects sliders, star / diamond masks, typewriter cells in a grid, and a timeline's sound (real FFmpeg).
 */
const tmp = mkdtempSync(join(tmpdir(), "VDO-parity-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
const V = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const P = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
ff(["-f", "lavfi", "-i", "color=c=0x2060ff:s=320x180:r=24:d=3", "-f", "lavfi", "-i", "sine=f=300:d=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(tmp, "v.mp4")]);
ff(["-f", "lavfi", "-i", "color=c=0x808080:s=320x180", "-frames:v", "1", join(tmp, "grey.png")]);
// a text picture: a white bar in the middle of a see-through 320×180 canvas (like a drawn title)
ff(["-f", "lavfi", "-i", "color=c=black@0:s=320x180,format=rgba", "-f", "lavfi", "-i", "color=c=white:s=120x20,format=rgba", "-filter_complex", "[0:v][1:v]overlay=100:80:format=auto", "-frames:v", "1", join(tmp, "text.png")]);
// a typewriter picture: 61 cells of 120×40 in a grid of 10 a row (cell r has r white columns of 2 px)
ff(["-f", "lavfi", "-i", "color=c=black@0:s=1200x280,format=rgba", "-frames:v", "1", join(tmp, "cells.png")]);
// a gradient backdrop the browser drew
ff(["-f", "lavfi", "-i", "color=c=0xff00ff:s=320x180", "-frames:v", "1", join(tmp, "scene.png")]);

const liteV: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 320, height: 180, fps: 24, duration: 3, hasAudio: true, suggestedKey: null, keyKind: null };
const liteP: MediaLite = { id: P, kind: "image", fileName: "grey.png", width: 320, height: 180, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null };
const media: ComposeMedia = {
  [V]: { path: join(tmp, "v.mp4"), hasAudio: true, width: 320, height: 180 },
  [P]: { path: join(tmp, "grey.png"), hasAudio: false, width: 320, height: 180, still: true },
};
const canvas = { width: 320, height: 180, fps: 24, background: "#000000" } as const;
const pixel = (f: string, t: number, x: number, y: number) => [...ff(["-ss", String(t), "-i", f, "-frames:v", "1", "-vf", `crop=1:1:${x}:${y},format=rgba`, "-f", "rawvideo", "pipe:1"])];
let n = 0;
const render = (d: TimelineDoc, o: Parameters<typeof buildComposeArgs>[4] = {}, kind: "mp4" | "png" = "mp4") => {
  const out = join(tmp, `out-${++n}.${kind}`);
  execFileSync("ffmpeg", buildComposeArgs(d, media, kind, out, { progress: false, ...o }));
  return out;
};
const hasAudioStream = (f: string) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", f]).toString().trim().length > 0;

describe("the server export draws what the preview draws", () => {
  it("a wipe between two texts reveals the second text's own area", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    d = addMedia(d, liteV, { id: "bg", ops: [] }).doc;
    const ov = d.tracks.find((t) => t.kind === "overlay")!;
    const base = textClipOf("title");
    ov.clips.push({ ...base, id: "t1", start: 0, duration: 2 } as never, { ...base, id: "t2", start: 1, duration: 2, transitionIn: { type: "wipeLeft", duration: 1 } } as never);
    const box = { x: 90, y: 70, w: 140, h: 40 };
    const out = render(d, { textOf: () => join(tmp, "text.png"), textBoxOf: (c: TextClip) => (c.id === "t2" ? box : null) });
    // the text shows (white on the blue picture), and the export of a text in its own area ran with the wipe's mask
    expect(pixel(out, 0.8, 200, 90)[0]).toBeGreaterThan(200);
    const args = buildComposeArgs(d, media, "mp4", join(tmp, "tw2.mp4"), { progress: false, textOf: () => join(tmp, "text.png"), textBoxOf: (c: TextClip) => (c.id === "t2" ? box : null) });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain(`crop=w=${box.w}:h=${box.h}:x=${box.x}:y=${box.y}`);
    expect(graph).toMatch(/geq=r='255':g='255':b='255':a='255\*gte\(X/);
  });

  it("a blank scene with a drawn backdrop shows the backdrop, not its plain color", () => {
    const d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    const blank: BlankClip = { id: "s1", type: "blank", fill: "#000000", duration: 2, fadeIn: 0, fadeOut: 0, backdrop: { kind: "gradient", from: "#ff00ff", to: "#ff00ff", angle: 0 } };
    mainTrack(d).clips.push(blank);
    const out = render(d, { blankBackdropOf: () => join(tmp, "scene.png") });
    const [r, g, b] = pixel(out, 1, 160, 90);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeGreaterThan(200);
  });

  it("the Effects sliders run in FFmpeg (glow, grain, blur, pixelate)", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    d = addMedia(d, liteV, { id: "v1", ops: [] }).doc;
    d = setClip(d, "v1", { color: { brightness: 0, contrast: 1, saturation: 1, temperature: 0, glow: 0.8, grain: 0.5, blur: 0.5, pixelate: 0.3 } });
    const args = buildComposeArgs(d, media, "mp4", join(tmp, "fx.mp4"), { progress: false }).join(" ");
    expect(args).toMatch(/lutrgb=/);
    expect(args).toMatch(/noise=c0s=\d+:c0f=t\+u/);
    expect(args).toMatch(/gblur=sigma=/);
    expect(args).toMatch(/flags=neighbor/);
    const out = render(d);
    expect(pixel(out, 1, 160, 90)[2]).toBeGreaterThan(150);
  });

  it("star and diamond masks cut the picture (the corners go see-through, on black)", () => {
    for (const shape of ["star", "diamond"] as const) {
      let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
      d = addMedia(d, liteV, { id: "v1", ops: [] }).doc;
      d = setClip(d, "v1", { mask: { shape, radius: 0, feather: 1 } });
      const out = render(d);
      // the middle stays blue, a corner is the black canvas
      expect(pixel(out, 1, 160, 90)[2]).toBeGreaterThan(150);
      const [r, g, b] = pixel(out, 1, 4, 4);
      expect(r + g + b).toBeLessThan(40);
    }
  });

  it("typewriter cells in a grid: the export reads the right cell (columns and rows)", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    d = addMedia(d, liteV, { id: "bg", ops: [] }).doc;
    const ov = d.tracks.find((t) => t.kind === "overlay")!;
    ov.clips.push({ ...textClipOf("title"), id: "tw", start: 0, duration: 3, anim: { in: "typewriter", out: "none" } } as never);
    const args = buildComposeArgs(d, media, "mp4", join(tmp, "tw.mp4"), { progress: false, textOf: () => join(tmp, "cells.png"), textSpriteOf: () => ({ frames: 60, chars: 60, box: { x: 100, y: 70, w: 120, h: 40 }, cols: 10 }) });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toMatch(/x='mod\(/);
    expect(graph).toMatch(/y='floor\(/);
    execFileSync("ffmpeg", args);
  });

  it("a timeline keeps its sound even when the single-video setting says remove (set by a silent first video)", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    d = addMedia(d, liteV, { id: "v1", ops: [] }).doc;
    d = { ...d, output: { ...d.output, audio: "remove" } };
    expect(hasAudioStream(render(d))).toBe(true);
  });

  it("a split single video with a transition is not exported as plain cuts", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas, background: "transparent" } };
    d = addMedia(d, liteV, { id: "a", ops: [] }).doc;
    d = addMedia(d, liteV, { id: "b", ops: [] }).doc;
    // (two parts of one video, one after the other)
    d = setClip(setClip(d, "a", { out: 1.5 }), "b", { in: 1.5 });
    expect(asSingleVideo(d)).not.toBeNull();
    d = setClip(d, "b", { transitionIn: { type: "crossfade", duration: 0.5 } });
    expect(asSingleVideo(d)).toBeNull();
  });

  it("an overlay picture with a transition from a picture before it on its track keeps its reveal", () => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { ...canvas } };
    d = addMedia(d, liteV, { id: "bg", ops: [] }).doc;
    const ov = d.tracks.find((t) => t.kind === "overlay")!;
    ov.clips.push({ ...imageClipOf("p1", liteP, 2), start: 0 } as never, { ...imageClipOf("p2", liteP, 2), start: 1, transitionIn: { type: "circleOpen", duration: 1 } } as ImageClip & { start: number } as never);
    const args = buildComposeArgs(d, media, "mp4", join(tmp, "ov.mp4"), { progress: false }).join(" ");
    expect(args).toMatch(/hypot/);
  });
});
