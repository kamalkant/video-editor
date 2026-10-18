import { describe, expect, it } from "vitest";
import { buildEncodeArgs, outputGeometry } from "@/lib/ffmpeg/encode";
import { buildFilterGraph } from "@/lib/ffmpeg/graph";
import { videoBitrate } from "@/lib/export/rates";
import { checkProbe, ProbeError } from "@/lib/ffmpeg/probe";
import { keyKind, looksLikeBackground } from "@/lib/ffmpeg/key";
import { computeSeeThrough } from "@/lib/ffmpeg/preview";
import { parseProgressChunk } from "@/lib/ffmpeg/run";
import { parseRange } from "@/lib/http/range";
import { specFromSettings as sp } from "@/lib/edit/spec";
import { activePreset, clampToRange, DEFAULTS, mergeSettings, parseSettings, PRESETS, sanitizeSettings } from "@/lib/settings";

const info = { width: 1280, height: 720, fps: 24, hasAudio: true };

describe("settings", () => {
  it("clamps and snaps numbers", () => {
    expect(clampToRange("similarity", 0.5)).toBe(0.2);
    expect(clampToRange("similarity", -1)).toBe(0.01);
    expect(clampToRange("blend", 0.153)).toBe(0.15);
    expect(clampToRange("feather", 1.3)).toBe(1.5);
    expect(clampToRange("edgeShift", 9)).toBe(2);
    expect(clampToRange("similarity", Number.NaN)).toBe(DEFAULTS.similarity);
  });

  it("rejects bad key colors and injection attempts", () => {
    expect(() => parseSettings({ ...DEFAULTS, keyColor: "12AF34,movie=/etc/passwd" })).toThrow();
    expect(() => parseSettings({ ...DEFAULTS, keyColor: "#12AF3" })).toThrow();
    expect(() => parseSettings({ ...DEFAULTS, similarity: "0.1:0.2" })).toThrow();
    expect(() => parseSettings({ ...DEFAULTS, quality: "ultra" })).toThrow();
    expect(parseSettings({ ...DEFAULTS, keyColor: "12af34" }).keyColor).toBe("#12AF34");
  });

  it("never upscales resolution or frame rate", () => {
    const s = sanitizeSettings({ ...DEFAULTS, resolution: 1920, fps: 30 }, { width: 1280, fps: 24 });
    expect(s.resolution).toBe("original");
    expect(s.fps).toBe("original");
    const t = sanitizeSettings({ ...DEFAULTS, resolution: 960, fps: 12 }, { width: 1280, fps: 24 });
    expect(t.resolution).toBe(960);
    expect(t.fps).toBe(12);
    expect(sanitizeSettings({ ...DEFAULTS, resolution: 1000 }).resolution).toBe("original");
  });

  it("merges untrusted partial settings field by field", () => {
    const s = mergeSettings(DEFAULTS, { similarity: 0.08, blend: "x", junk: 1, keyColor: "bad" });
    expect(s.similarity).toBe(0.08);
    expect(s.blend).toBe(DEFAULTS.blend);
    expect(s.keyColor).toBe(DEFAULTS.keyColor);
    expect(mergeSettings(DEFAULTS, null)).toEqual(DEFAULTS);
  });

  it("detects presets", () => {
    expect(activePreset(DEFAULTS)).toBe("veo");
    expect(activePreset({ ...DEFAULTS, ...PRESETS.soft.values })).toBe("soft");
    expect(activePreset({ ...DEFAULTS, blend: 0.2 })).toBe("custom");
  });
});

describe("filter graph", () => {
  it("builds the tested default graph", () => {
    const g = buildFilterGraph(sp(DEFAULTS), "webm");
    expect(g).toContain("[0:v]chromakey=0x12AF34:0.050:0.15,format=rgba[k0]");
    expect(g).toContain("despill=type=green:green=-1.00");
    expect(g).toContain("lut=y='if(gte(val\\,250)\\,0\\,255)'");
    expect(g).toMatch(/format=yuva420p\[vout\]$/);
    expect(g).not.toContain("erosion");
    expect(g).not.toContain("gblur");
  });

  it("maps glow strength, edge shift and feather", () => {
    const g = buildFilterGraph(sp({ ...DEFAULTS, despillStrength: 40, edgeShift: -2, feather: 1 }), "hevc");
    expect(g).toContain("green=-0.40");
    expect(g).toContain("alphaextract,erosion,erosion,gblur=sigma=1.0");
    expect(g).toMatch(/format=bgra\[vout\]$/);
    expect(buildFilterGraph(sp({ ...DEFAULTS, edgeShift: 1 }), "preview")).toContain("dilation");
  });

  it("skips despill when off and uses blue for blue screens", () => {
    expect(buildFilterGraph(sp({ ...DEFAULTS, despill: false }), "webm")).not.toContain("despill");
    expect(buildFilterGraph(sp({ ...DEFAULTS, keyColor: "#1030C0" }), "webm")).toContain("despill=type=blue:blue=-1.00");
  });

  it("refuses an unvalidated key color", () => {
    expect(() => buildFilterGraph(sp({ ...DEFAULTS, keyColor: "#12AF34,movie=x" }), "webm")).toThrow();
  });

  it("adds fps and scale when asked", () => {
    const g = buildFilterGraph(sp(DEFAULTS), "webm", { width: 961, fps: 12 });
    expect(g).toContain("[0:v]fps=12,chromakey");
    expect(g).toContain("scale=962:-2:flags=lanczos");
  });
});

describe("encode args", () => {
  it("WebM is VP9 + alpha at the bitrate the Export dialog's size shows", () => {
    const a = buildEncodeArgs("webm", sp(DEFAULTS), info, "in", "out.webm");
    const s = a.join(" ");
    expect(s).toContain("-protocol_whitelist file,pipe");
    // 1280×720 at 24 fps, Balanced: lib/export/rates videoBitrate("vp9-alpha")
    expect(s).toContain(`-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v ${Math.round(videoBitrate("vp9-alpha", "balanced", 1280, 720, 24) / 1000)}k`);
    expect(s).toContain("-c:a libopus");
    expect(s).toContain("-colorspace bt709");
  });

  it("MOV is HEVC + alpha via VideoToolbox, not ProRes", () => {
    const s = buildEncodeArgs("mov", sp(DEFAULTS), info, "in", "out.mov").join(" ");
    expect(s).toContain(`-c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.75 -b:v ${Math.round(videoBitrate("hevc-alpha", "balanced", 1280, 720, 24) / 1000)}k`);
    expect(s).not.toContain("prores");
    expect(s).toContain("-c:a aac");
  });

  it("removes audio when asked or absent", () => {
    expect(buildEncodeArgs("webm", sp({ ...DEFAULTS, audio: "remove" }), info, "i", "o")).toContain("-an");
    expect(buildEncodeArgs("mov", sp(DEFAULTS), { ...info, hasAudio: false }, "i", "o")).toContain("-an");
  });

  it("quality presets map to both encoders", () => {
    const s = buildEncodeArgs("webm", sp({ ...DEFAULTS, quality: "small" }), info, "i", "o").join(" ");
    expect(s).toContain(`-b:v ${Math.round(videoBitrate("vp9-alpha", "small", 1280, 720, 24) / 1000)}k`);
    expect(buildEncodeArgs("mov", sp({ ...DEFAULTS, quality: "best" }), info, "i", "o").join(" ")).toContain(`-b:v ${Math.round(videoBitrate("hevc-alpha", "best", 1280, 720, 24) / 1000)}k`);
  });

  it("computes output geometry", () => {
    expect(outputGeometry(sp({ ...DEFAULTS, resolution: 640 }).output, info)).toMatchObject({ outW: 640, outH: 360, outFps: 24 });
    expect(outputGeometry(sp(DEFAULTS).output, info)).toMatchObject({ outW: 1280, outH: 720 });
  });
});

describe("probe gate", () => {
  const good = {
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "8.0" },
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "24/1" },
      { codec_type: "audio", codec_name: "aac" },
    ],
  };
  it("accepts a Veo-like clip", () => {
    expect(checkProbe(good)).toMatchObject({ width: 1280, height: 720, fps: 24, duration: 8, hasAudio: true, container: "mp4" });
  });
  const code = (p: unknown) => {
    try {
      checkProbe(p as never);
      return "ok";
    } catch (e) {
      return (e as ProbeError).code;
    }
  };
  it("rejects bad inputs with specific codes", () => {
    expect(code({ ...good, format: { format_name: "gif", duration: "2" } })).toBe("unsupported_type");
    expect(code({ ...good, format: { ...good.format, duration: "1860" } })).toBe("too_long"); // over 30 minutes
    expect(code({ ...good, streams: [{ ...good.streams[0], width: 7680, height: 4320 }] })).toBe("too_large_resolution");
    expect(code({ ...good, streams: [{ ...good.streams[0], avg_frame_rate: "120/1" }] })).toBe("too_high_fps");
    expect(code({ ...good, streams: [{ ...good.streams[0], color_transfer: "smpte2084" }] })).toBe("hdr_not_supported");
    expect(code({ ...good, streams: [good.streams[1]] })).toBe("no_video");
  });
  it("swaps size for rotated phone videos", () => {
    const r = checkProbe({ ...good, streams: [{ ...good.streams[0], side_data_list: [{ rotation: -90 }] }] });
    expect([r.width, r.height]).toEqual([720, 1280]);
  });
});

describe("helpers", () => {
  it("parses ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=2000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("items=0-1", 1000)).toBeNull();
  });

  it("parses FFmpeg progress", () => {
    expect(parseProgressChunk("frame=10\nout_time_us=1500000\nprogress=continue\n")).toBe(1.5);
    expect(parseProgressChunk("frame=1\n")).toBeNull();
  });

  it("classifies key colors", () => {
    expect(keyKind([18, 175, 52])).toBe("green");
    expect(keyKind([16, 48, 192])).toBe("blue");
    expect(keyKind([240, 240, 240])).toBeNull();
    expect(keyKind([241, 194, 125])).toBeNull();
  });

  it("warns when the eyedropper lands on the person", () => {
    expect(looksLikeBackground([17, 174, 52], "#11AE33")).toBe(true);
    expect(looksLikeBackground([40, 58, 138], "#11AE33")).toBe(false); // blue clothing on a green screen
    expect(looksLikeBackground([240, 240, 240], "#11AE33")).toBe(false);
    expect(looksLikeBackground([60, 120, 60], "#11AE33")).toBe(true);
    expect(looksLikeBackground([16, 48, 192], null)).toBe(true);
  });

  it("measures see-through subjects", () => {
    const w = 40;
    const h = 40;
    const solid = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) solid[y * w + x] = 255;
    expect(computeSeeThrough(solid, w, h).seeThroughPct).toBe(0);
    const ghost = solid.map((v) => (v ? 209 : 0));
    expect(computeSeeThrough(ghost, w, h).seeThroughPct).toBe(100);
    expect(computeSeeThrough(new Uint8Array(w * h), w, h).seeThroughPct).toBeNull();
  });
});

describe("AI Removal op (mask as a second input)", () => {
  it("cleans the mask in FFmpeg and merges it as alpha, on frame-index timestamps", async () => {
    const { aiMatte } = await import("@/lib/ops/aiMatte");
    const { buildFilterGraph: build } = await import("@/lib/ffmpeg/graph");
    const { DEFAULT_SPEC: base, parseSpec: parse } = await import("@/lib/edit/spec");
    const params = { ...aiMatte.defaults, smooth: 1, edgeShift: -2, feather: 1, hardness: 0.5 };
    const spec = parse({ ...base, ops: [{ id: "ai", type: "aiMatte", enabled: true, params }] });
    const graph = build(spec, "webm", { fps: 24, maskInput: "[1:v]" });
    expect(graph).toBe(
      "[1:v]fps=24,setpts=N/FRAME_RATE/TB,format=gray,tpad=start=1:start_mode=clone:stop=1:stop_mode=clone,tmedian=radius=1,lut=y='clip((val-48)*255/159\\,0\\,255)',erosion,erosion,gblur=sigma=1[aim];" +
        "[0:v]fps=24,setpts=N/FRAME_RATE/TB,format=rgba[aic];[aic][aim]alphamerge[ai0];" +
        "[ai0]scale=out_color_matrix=bt709:out_range=tv,format=yuva420p[vout]",
    );
    // without the mask input the graph can't be built
    expect(() => build(spec, "webm")).toThrow("mask");
  });

  it("clamps AI settings and rejects unknown modes", async () => {
    const { parseSpec: parse, DEFAULT_SPEC: base, aiOp } = await import("@/lib/edit/spec");
    const s = parse({ ...base, ops: [{ id: "ai", type: "aiMatte", enabled: true, params: { mode: "hybrid", quality: "balanced", despeckle: true, smooth: 9, edgeShift: -9, feather: 99, hardness: 5 } }] });
    expect(aiOp(s)!.params).toMatchObject({ smooth: 2, edgeShift: -3, feather: 3, hardness: 0.8 });
    expect(() => parse({ ...base, ops: [{ id: "ai", type: "aiMatte", enabled: true, params: { mode: "shell", quality: "balanced", despeckle: true, smooth: 1, edgeShift: 0, feather: 0, hardness: 0 } }] })).toThrow();
  });

  it("the editor switches between Color Key and AI Removal", async () => {
    const { stateForVideo, studioReducer, removalOn, aiParams } = await import("@/lib/editor/studioReducer");
    const { activeAiOp, keyOp } = await import("@/lib/edit/spec");
    let s = stateForVideo(null, null, { width: 1280, fps: 24 }, false);
    expect(removalOn(s)).toBe(false);
    s = studioReducer(s, { type: "setMethod", method: "ai" });
    expect(s.method).toBe("ai");
    expect(activeAiOp(s.spec)).toBeTruthy();
    expect(keyOp(s.spec)!.enabled).toBe(false);
    s = studioReducer(s, { type: "ai", patch: { mode: "person", quality: "accurate" } });
    expect(aiParams(s)).toMatchObject({ mode: "person", quality: "accurate" });
    s = studioReducer(s, { type: "setMethod", method: "color" });
    expect(activeAiOp(s.spec)).toBeUndefined();
    expect(keyOp(s.spec)!.enabled).toBe(true);
  });
});
