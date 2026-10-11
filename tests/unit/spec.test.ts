import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPEC, keyOp, parseSpec, specFromBody, specFromSettings, type EditSpec } from "@/lib/edit/spec";
import { buildEncodeArgs } from "@/lib/ffmpeg/encode";
import { buildFilterGraph } from "@/lib/ffmpeg/graph";
import { DEFAULTS, parseSettings, type Settings } from "@/lib/settings";

type Golden = Record<string, { settings: Settings; graphs: Record<string, string>; args: Record<string, string[]> }>;
const golden = JSON.parse(readFileSync("tests/unit/golden-graphs.json", "utf8")) as Golden;
const info = { width: 1280, height: 720, fps: 24, hasAudio: true };

describe("ops pipeline produces exactly the tested graphs", () => {
  for (const [name, g] of Object.entries(golden)) {
    it(name, () => {
      const spec = specFromSettings(g.settings);
      for (const [target, graph] of Object.entries(g.graphs)) expect(buildFilterGraph(spec, target as never)).toBe(graph);
      for (const [kind, args] of Object.entries(g.args)) expect(buildEncodeArgs(kind as never, spec, info, "IN", "OUT")).toEqual(args);
    });
  }
});

describe("edit spec", () => {
  it("default spec equals the old defaults", () => {
    expect(specFromSettings(DEFAULTS)).toEqual(DEFAULT_SPEC);
  });

  it("rejects injection and unknown ops", () => {
    const bad = structuredClone(DEFAULT_SPEC) as EditSpec;
    keyOp(bad)!.params.keyColor = "12AF34,movie=/etc/passwd";
    expect(() => parseSpec(bad)).toThrow();
    expect(() => parseSpec({ ...DEFAULT_SPEC, ops: [{ id: "x", type: "shell", enabled: true, params: {} }] })).toThrow();
    expect(() => parseSpec({ ...DEFAULT_SPEC, version: 2 })).toThrow();
  });

  it("clamps params and never upscales", () => {
    const s = structuredClone(DEFAULT_SPEC) as EditSpec;
    keyOp(s)!.params.similarity = 0.9;
    s.output.resolution = 1920;
    const out = parseSpec(s, { width: 1280, fps: 24 });
    expect(keyOp(out)!.params.similarity).toBe(0.2);
    expect(out.output.resolution).toBe("original");
  });

  it("accepts legacy { settings } bodies", () => {
    const legacy = (x: unknown) => parseSettings({ ...DEFAULTS, ...(x as object) });
    const s = specFromBody({ settings: { similarity: 0.08 } }, undefined, legacy);
    expect(keyOp(s)!.params.similarity).toBe(0.08);
    expect(specFromBody({}, undefined, legacy)).toEqual(DEFAULT_SPEC);
  });

  it("a disabled op is skipped", () => {
    const s = structuredClone(DEFAULT_SPEC) as EditSpec;
    s.ops[0].enabled = false;
    expect(buildFilterGraph(s, "webm")).toBe("[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuva420p[vout]");
  });
});

describe("timeline: split, trim, cut", async () => {
  const tl = await import("@/lib/edit/timeline");
  const fps = 24;
  const whole = tl.wholeClip(4);

  it("splits at a frame, never leaving a sliver", () => {
    const s = tl.splitAt(whole, 1.51, fps);
    expect(s.map((g) => [g.in, g.out])).toEqual([[0, 1.5], [1.5, 4]]);
    expect(new Set(s.map((g) => g.id)).size).toBe(2);
    expect(tl.splitAt(whole, 0.02, fps)).toBe(whole); // too close to the start
  });

  it("cutting a part joins the rest; times map both ways", () => {
    let s = tl.splitAt(tl.splitAt(whole, 1, fps), 2, fps);
    s = tl.removeSegment(s, s[1].id);
    expect(s.map((g) => [g.in, g.out])).toEqual([[0, 1], [2, 4]]);
    expect(tl.timelineDuration(s)).toBe(3);
    expect(tl.toSource(s, 1.5)).toBeCloseTo(2.5);
    expect(tl.toTimeline(s, 2.5)).toBeCloseTo(1.5);
    expect(tl.toTimeline(s, 1.5)).toBeNull(); // cut out
    expect(tl.nextKept(s, 1.5)).toBe(2);
    expect(tl.nextKept(s, 4.1)).toBeNull();
    expect(tl.removeSegment([whole[0]], "c1")).toHaveLength(1); // the last part stays
  });

  it("trims without overlapping neighbours", () => {
    const s = tl.splitAt(whole, 2, fps);
    expect(tl.trimSegment(s, s[1].id, "in", 1, 4, fps)[1].in).toBe(2); // can't reach into part 1
    expect(tl.trimSegment(s, s[0].id, "out", 1.25, 4, fps)[0].out).toBe(1.25);
    expect(tl.trimSegment(s, s[0].id, "in", 1.99, 4, fps)[0].in).toBeCloseTo(2 - 2 / fps);
  });

  it("sanitizes untrusted parts and builds the FFmpeg select", () => {
    const s = tl.sanitizeSegments([{ id: "b", in: 3, out: 9 }, { id: "a", in: -1, out: 1 }, { id: "x", in: 0.5, out: 0.51 }], 4, fps);
    expect(s.map((g) => [g.id, g.in, g.out])).toEqual([["a", 0, 1], ["b", 3, 4]]);
    expect(tl.selectExpr(s, fps)).toBe("gte(t\\,-0.0208)*lt(t\\,0.9792)+gte(t\\,2.9792)*lt(t\\,3.9792)");
  });

  it("a cut timeline cuts picture and sound in the export; an uncut one changes nothing", async () => {
    const { buildEncodeArgs } = await import("@/lib/ffmpeg/encode");
    const info = { width: 1280, height: 720, fps, hasAudio: true, duration: 4 };
    const plain = buildEncodeArgs("webm", DEFAULT_SPEC, info, "IN", "OUT");
    expect(buildEncodeArgs("webm", { ...DEFAULT_SPEC, timeline: { clips: whole } }, info, "IN", "OUT")).toEqual(plain);
    const cut = buildEncodeArgs("webm", { ...DEFAULT_SPEC, timeline: { clips: [{ id: "a", in: 0, out: 1 }, { id: "b", in: 2, out: 4 }] } }, info, "IN", "OUT");
    const graph = cut[cut.indexOf("-filter_complex") + 1];
    expect(graph.startsWith("[0:v]select=gte(t\\,-0.0208)*lt(t\\,0.9792)+gte(t\\,1.9792)*lt(t\\,3.9792),setpts=N/FRAME_RATE/TB,")).toBe(true);
    expect(graph).toContain(";[0:a]aselect=gte(t\\,-0.0208)*lt(t\\,0.9792)+gte(t\\,1.9792)*lt(t\\,3.9792),asetpts=N/SR/TB[aout]");
    expect(cut.join(" ")).toContain("-map [aout] -c:a libopus");
  });

  it("the editor splits, trims and cuts, and a new video starts uncut", async () => {
    const { stateForVideo, studioReducer, segmentsOfState } = await import("@/lib/editor/studioReducer");
    let s = stateForVideo(null, "#11AE33", { width: 1280, fps, duration: 4 }, false);
    s = studioReducer(s, { type: "split", at: 1 });
    s = studioReducer(s, { type: "split", at: 2 });
    expect(segmentsOfState(s)).toHaveLength(3);
    s = studioReducer(s, { type: "deleteClip", id: segmentsOfState(s)[1].id });
    s = studioReducer(s, { type: "trimToPlayhead", at: 3.5, edge: "out" });
    expect(segmentsOfState(s).map((g) => [g.in, g.out])).toEqual([[0, 1], [2, 3.5]]);
    expect(stateForVideo(s.spec, "#11AE33", { width: 1280, fps, duration: 4 }, false).spec.timeline).toBeUndefined();
    // back to one whole part: no timeline at all
    s = studioReducer(s, { type: "trimClip", id: segmentsOfState(s)[1].id, edge: "out", to: 4 });
    s = studioReducer(s, { type: "deleteClip", id: segmentsOfState(s)[0].id });
    s = studioReducer(s, { type: "trimClip", id: segmentsOfState(s)[0].id, edge: "in", to: 0 });
    expect(s.spec.timeline).toBeUndefined();
  });
});

describe("Remove silences", async () => {
  const tl = await import("@/lib/edit/timeline");
  const { parseSilences } = await import("@/lib/ffmpeg/silence");

  it("reads FFmpeg silencedetect output, including a pause that runs to the end", () => {
    const log = [
      "[silencedetect @ 0x1] silence_start: 1.0034",
      "[silencedetect @ 0x1] silence_end: 2.0012 | silence_duration: 0.9978",
      "[silencedetect @ 0x1] silence_start: 3.5",
    ].join("\n");
    expect(parseSilences(log, 4)).toEqual([{ start: 1.0034, end: 2.0012 }, { start: 3.5, end: 4 }]);
  });

  it("cuts the pauses out of the kept parts, keeping a short pause", () => {
    const cuts = tl.silenceCuts([{ start: 1, end: 2 }, { start: 2.8, end: 3.6 }, { start: 3.9, end: 3.95 }], 0.125);
    expect(cuts).toEqual([{ start: 1.125, end: 1.875 }, { start: 2.925, end: 3.475 }]);
    const segs = tl.removeRanges(tl.wholeClip(4), cuts, 24);
    // edges land on frames (24 fps): 2.925 → frame 70, 3.475 → frame 83
    expect(segs.map((g) => [g.in, g.out])).toEqual([[0, 1.125], [1.875, 70 / 24], [83 / 24, 4]]);
    expect(new Set(segs.map((g) => g.id)).size).toBe(3);
    expect(tl.cutLength(tl.wholeClip(4), cuts)).toBeCloseTo(1.3);
    // nothing would be left: no change
    const all = tl.wholeClip(1);
    expect(tl.removeRanges(all, [{ start: 0, end: 1 }], 24)).toBe(all);
  });
});
