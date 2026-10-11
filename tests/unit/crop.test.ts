import { describe, expect, it } from "vitest";
import { outputGeometry } from "@/lib/edit/geometry";
import { DEFAULT_SPEC, parseSpec, type EditSpec } from "@/lib/edit/spec";
import { padBox, parseBboxLog } from "@/lib/ffmpeg/cropbox";
import { buildEncodeArgs } from "@/lib/ffmpeg/encode";
import { buildFilterGraph } from "@/lib/ffmpeg/graph";

const LOG = `[Parsed_bbox_12 @ 0x1] n:0 pts:0 pts_time:0 x1:300 x2:700 y1:90 y2:630 w:401 h:541 crop=401:541:300:90
[Parsed_bbox_12 @ 0x1] n:1 pts:1 pts_time:0.08 x1:186 x2:600 y1:86 y2:634 w:415 h:549 crop=415:549:186:86
[Parsed_bbox_12 @ 0x1] n:2 pts:2 pts_time:0.16 x1:500 x2:1094 y1:100 y2:600 w:595 h:501 crop=595:501:500:100`;

describe("crop empty area", () => {
  it("unions every frame's box", () => {
    expect(parseBboxLog(LOG)).toEqual({ x1: 186, y1: 86, x2: 1094, y2: 634 });
    expect(parseBboxLog("no boxes here")).toBeNull();
  });

  it("adds padding, stays inside the frame, keeps sizes even", () => {
    const b = padBox({ x1: 186, y1: 86, x2: 1094, y2: 634 }, 10, 1280, 720);
    expect(b).toEqual({ x: 176, y: 76, w: 928, h: 568 });
    const edge = padBox({ x1: 3, y1: 0, x2: 1279, y2: 719 }, 10, 1280, 720);
    expect(edge).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it("the graph gets crop= only when a box is passed", () => {
    expect(buildFilterGraph(DEFAULT_SPEC, "webm")).not.toContain("crop=");
    const g = buildFilterGraph(DEFAULT_SPEC, "webm", { crop: { x: 176, y: 76, w: 928, h: 568 } });
    expect(g).toMatch(/\[k1\]crop=928:568:176:76,scale=out_color_matrix/);
  });

  it("encode args ignore a box while the option is off", () => {
    const info = { width: 1280, height: 720, fps: 24, hasAudio: false };
    const box = { x: 176, y: 76, w: 928, h: 568 };
    expect(buildEncodeArgs("webm", DEFAULT_SPEC, info, "i", "o", { crop: box }).join(" ")).not.toContain("crop=");
    const on = structuredClone(DEFAULT_SPEC) as EditSpec;
    on.output.crop.enabled = true;
    expect(buildEncodeArgs("webm", on, info, "i", "o", { crop: box }).join(" ")).toContain("crop=928:568:176:76");
  });

  it("output size starts from the crop and never upscales", () => {
    const info = { width: 1280, height: 720, fps: 24 };
    const box = { x: 176, y: 76, w: 928, h: 568 };
    expect(outputGeometry(DEFAULT_SPEC.output, info, box)).toMatchObject({ outW: 928, outH: 568, width: undefined });
    expect(outputGeometry({ ...DEFAULT_SPEC.output, resolution: 640 }, info, box)).toMatchObject({ outW: 640, outH: 392 });
    expect(outputGeometry({ ...DEFAULT_SPEC.output, resolution: 960 }, info, box)).toMatchObject({ outW: 928, width: undefined });
  });

  it("old specs without crop still parse; padding is clamped", () => {
    const { crop: _c, ...noCrop } = DEFAULT_SPEC.output;
    void _c;
    expect(parseSpec({ ...DEFAULT_SPEC, output: noCrop }).output.crop).toEqual({ enabled: false, padding: 10 });
    expect(parseSpec({ ...DEFAULT_SPEC, output: { ...DEFAULT_SPEC.output, crop: { enabled: true, padding: 999 } } }).output.crop.padding).toBe(50);
  });
});
