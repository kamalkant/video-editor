import { describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText, setClip } from "@/lib/edit/docEdit";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { textClipOf } from "@/lib/text/layout";

/**
 * One plain video filling the frame is made without the canvas under it and the RGBA overlay (a third less
 * FFmpeg time, the same picture); anything on it or done to it makes the full graph.
 */
const V = "11111111-1111-4111-8111-111111111111";
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1920, height: 1080, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
const media = (o: { alpha?: boolean } = {}): ComposeMedia => ({ [V]: { path: "/v.mp4", hasAudio: true, width: 1920, height: 1080, ...o } });
const one = (background = "#000000"): TimelineDoc => addMedia({ ...emptyDoc(), canvas: { width: 1920, height: 1080, fps: 30, background } }, vid, { id: "v1" }).doc;
const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1];

describe("one plain video: no canvas, no overlay", () => {
  it("MP4: the video chain straight into the encoder, the canvas color after its end", () => {
    const g = graph(buildComposeArgs(one("#336699"), media(), "mp4", "/out.mp4", { progress: false }));
    expect(g).toContain("[0:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=bicubic,tpad=stop=-1:color=0x336699,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[vout]");
    expect(g).not.toContain("overlay");
    expect(g).not.toContain("format=rgba");
    // the sound is untouched
    expect(g).toContain("amix=inputs=1");
  });

  it("the other solid video files too (HEVC, AV1, VP9)", () => {
    for (const kind of ["hevc", "av1", "vp9"] as const) expect(graph(buildComposeArgs(one(), media(), kind, "/out", { progress: false }))).not.toContain("overlay");
  });

  it("anything else makes the full graph", () => {
    const full = (doc: TimelineDoc, kind: Parameters<typeof buildComposeArgs>[2] = "mp4", m = media()) => graph(buildComposeArgs(doc, m, kind, "/out", { progress: false, textOf: () => "/t.png" }));
    // a text on it
    expect(full(addText(one(), { ...textClipOf("lowerThird"), text: "Hi" }, 0.5, "t1").doc)).toContain("overlay");
    // the video made smaller
    expect(full(setClip(one(), "v1", { transform: { fit: "fit", x: 0, y: 0, scale: 0.5, rotation: 0 } }))).toContain("overlay");
    // a fade in
    expect(full(setClip(one(), "v1", { fadeIn: 0.5 }))).toContain("overlay");
    // a video with see-through parts (the canvas shows there)
    expect(full(one(), "mp4", media({ alpha: true }))).toContain("overlay");
    // a see-through or alpha file
    expect(full({ ...one(), canvas: { ...one().canvas, background: "transparent" } }, "webm")).toContain("overlay");
    expect(full(one(), "webm")).toContain("overlay");
    // the Free plan's mark
    expect(graph(buildComposeArgs(one(), media(), "mp4", "/out", { progress: false, planMark: "/mark.png" }))).toContain("overlay");
  });
});

describe("encoder speed settings", () => {
  it("H.264 with x264 'faster', VP9 with cpu-used 4 (the see-through WebM keeps 2)", () => {
    expect(buildComposeArgs(one(), media(), "mp4", "/o.mp4", { progress: false }).join(" ")).toContain("-c:v libx264 -preset faster");
    expect(buildComposeArgs(one(), media(), "vp9", "/o.webm", { progress: false }).join(" ")).toContain("-deadline good -cpu-used 4");
    expect(buildComposeArgs(one(), media(), "webm", "/o.webm", { progress: false }).join(" ")).toContain("-deadline good -cpu-used 2");
  });
});
