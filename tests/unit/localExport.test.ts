import { afterEach, describe, expect, it, vi } from "vitest";
import { audioPlan, canExportLocally, frameWaitMs, isWebCodecsSupported, localExportBlockers, MAX_LOCAL_AUDIO_FILE_BYTES, partLevel } from "@/lib/export/localExport";
import { docDuration, emptyDoc, layersAt, mainStarts, mainTrack, videoClipOf } from "@/lib/edit/doc";

describe("localExport WebCodecs engine", () => {
  it("detects environment capabilities safely", () => {
    // In Node test environment, window/WebCodecs is typically undefined
    const supported = isWebCodecsSupported();
    expect(typeof supported).toBe("boolean");
  });

  it("handles still image formats locally", async () => {
    const pngSupported = await canExportLocally("png", 1920, 1080);
    const jpgSupported = await canExportLocally("jpg", 1920, 1080);
    expect(pngSupported).toBe(true);
    expect(jpgSupported).toBe(true);
  });

  it("handles video formats safely in non-browser environment without crashing", async () => {
    const mp4Supported = await canExportLocally("mp4", 1920, 1080);
    const movAlphaSupported = await canExportLocally("mov-alpha", 1920, 1080);
    expect(typeof mp4Supported).toBe("boolean");
    expect(typeof movAlphaSupported).toBe("boolean");
  });

  it("accurately sequences and composites 60 clips of 10s stitched together", () => {
    const doc = emptyDoc();
    const main = mainTrack(doc);
    const clipCount = 60;
    const clipDuration = 10;

    for (let i = 0; i < clipCount; i++) {
      const mediaId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      main.clips.push(
        videoClipOf(
          `clip-${i}`,
          {
            id: mediaId,
            fileName: `clip-${i}.mp4`,
            kind: "video",
            duration: clipDuration,
            width: 1920,
            height: 1080,
            fps: 30,
            hasAudio: true,
            suggestedKey: null,
            keyKind: null,
          },
          [],
        ),
      );
    }

    // Verify 600s total duration
    const duration = docDuration(doc);
    expect(duration).toBe(600);

    // Verify start times
    const starts = mainStarts(main.clips);
    expect(starts.length).toBe(60);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(10);
    expect(starts[59]).toBe(590);

    // Verify layersAt at various timeline points
    const layerAt5 = layersAt(doc, 5);
    expect(layerAt5.length).toBe(1);
    expect(layerAt5[0].clip.id).toBe("clip-0");

    const layerAt15 = layersAt(doc, 15);
    expect(layerAt15.length).toBe(1);
    expect(layerAt15[0].clip.id).toBe("clip-1");

    const layerAt595 = layersAt(doc, 595);
    expect(layerAt595.length).toBe(1);
    expect(layerAt595[0].clip.id).toBe("clip-59");
  });

  describe("with WebCodecs present", () => {
    const configs: VideoEncoderConfig[] = [];
    const stub = () => {
      configs.length = 0;
      vi.stubGlobal("window", {});
      vi.stubGlobal("VideoEncoder", { isConfigSupported: async (c: VideoEncoderConfig) => (configs.push(c), { supported: true, config: c }) });
      vi.stubGlobal("AudioEncoder", class {});
      vi.stubGlobal("VideoFrame", class {});
      vi.stubGlobal("OfflineAudioContext", class {});
    };
    afterEach(() => vi.unstubAllGlobals());

    it("MP4 asks for a level that holds the size, High first, then Main (a fixed level 4.2 refused 21:9 and 4K)", async () => {
      stub();
      expect(await canExportLocally("mp4", 2560, 1080, 30)).toBe(true);
      expect(configs[0]).toMatchObject({ codec: "avc1.640032", width: 2560, height: 1080, framerate: 30 });
      // a browser without High: Main at the same level
      configs.length = 0;
      vi.stubGlobal("VideoEncoder", { isConfigSupported: async (c: VideoEncoderConfig) => (configs.push(c), { supported: !c.codec.startsWith("avc1.64") }) });
      expect(await canExportLocally("mp4", 3840, 2160, 30)).toBe(true);
      expect(configs.map((c) => c.codec)).toEqual(["avc1.640033", "avc1.4d0033"]);
    });

    it("MOV + alpha is always made by the server (the MP4 muxer can't write HEVC's alpha layer)", async () => {
      stub();
      expect(await canExportLocally("mov-alpha", 1920, 1080)).toBe(false);
      expect(configs).toHaveLength(0);
    });

    it("WebM + alpha asks for a VP9 encoder that keeps the alpha", async () => {
      stub();
      expect(await canExportLocally("webm-alpha", 1920, 1080)).toBe(true);
      expect(configs[0]).toMatchObject({ codec: "vp09.00.10.08", alpha: "keep", hardwareAcceleration: "prefer-software" });
      expect(await canExportLocally("webm", 1920, 1080)).toBe(true);
      expect(configs[1].alpha).toBeUndefined();
    });
  });
});

describe("what the browser export makes, and what goes to the server", () => {
  const V = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const media = {
    [V]: { id: V, kind: "video" as const, fileName: "v.mp4", width: 640, height: 360, fps: 30, duration: 20, hasAudio: true, suggestedKey: null, keyKind: null },
    [A]: { id: A, kind: "audio" as const, fileName: "a.m4a", width: 0, height: 0, fps: 0, duration: 20, hasAudio: true, suggestedKey: null, keyKind: null },
  };
  const docWith = (patch: Record<string, unknown> = {}) => {
    const d = emptyDoc();
    mainTrack(d).clips.push({ ...videoClipOf("v1", media[V], [], 0, 10), ...patch } as never);
    return d;
  };

  it("an ordinary timeline (transitions, animations, looks) is made in the browser", () => {
    expect(localExportBlockers(docWith({ color: { brightness: 0.1, contrast: 1, saturation: 1, temperature: 0, grain: 0.4 } }), media)).toEqual([]);
  });

  it("server-only work goes to the server: AI removal, stabilize, cleaned or levelled sound, a new speed with sound", () => {
    expect(localExportBlockers(docWith({ ops: [{ id: "m", type: "aiMatte", enabled: true, params: { background: "transparent" } }] }), media)).toContain("AI background removal");
    expect(localExportBlockers(docWith({ stabilize: true }), media)).toContain("Stabilize");
    expect(localExportBlockers(docWith({ denoise: "light" }), media)).toContain("Remove background noise");
    expect(localExportBlockers(docWith({ speed: 2 }), media)).toContain("A sped-up or slowed-down clip with sound");
    // (a muted clip's speed doesn't matter: no sound to keep the pitch of)
    expect(localExportBlockers(docWith({ speed: 2, muted: true }), media)).toEqual([]);
    const loud = docWith();
    loud.output = { ...loud.output, loudness: true };
    expect(localExportBlockers(loud, media)).toContain("Even loudness");
  });

  it("a very large file with sound goes to the server (the browser reads a file whole to take its sound)", () => {
    const big = (id: string) => (id === V ? MAX_LOCAL_AUDIO_FILE_BYTES + 1 : undefined);
    expect(localExportBlockers(docWith(), media, big)).toContain("A very large file");
    expect(localExportBlockers(docWith(), media, () => MAX_LOCAL_AUDIO_FILE_BYTES)).toEqual([]);
    // (its sound isn't used: nothing to read)
    expect(localExportBlockers(docWith({ muted: true }), media, big)).toEqual([]);
  });

  it("the sound plan follows the server's rules: mutes, transitions, ducking", () => {
    const d = docWith();
    d.tracks.find((t) => t.kind === "audio")!.clips.push({ id: "m1", type: "audio", mediaId: A, in: 0, out: 8, start: 0, volume: 0.8, duck: true, fadeIn: 0, fadeOut: 0 } as never);
    const has = () => true;
    expect(audioPlan(d, has).map((p) => p.clip.id)).toEqual(["v1", "m1"]);
    // ducking: the music goes quieter where someone speaks
    const music = audioPlan(d, has).find((p) => p.clip.id === "m1")!;
    expect(partLevel(music, 1, [{ start: 0.5, end: 2 }])).toBeCloseTo(0.8 * 0.3, 5);
    expect(partLevel(music, 3, [{ start: 0.5, end: 2 }])).toBeCloseTo(0.8, 5);
    // (the single-video "remove audio" setting, set when the first video was silent, never mutes a timeline's music)
    expect(audioPlan({ ...d, output: { ...d.output, audio: "remove" } }, has).map((p) => p.clip.id)).toEqual(["v1", "m1"]);
    // a muted audio track
    d.tracks.find((t) => t.kind === "audio")!.muted = true;
    expect(audioPlan(d, has).map((p) => p.clip.id)).toEqual(["v1"]);
  });

  it("a crossfade on Video 1 crosses the sound over too", () => {
    const d = emptyDoc();
    mainTrack(d).clips.push(videoClipOf("v1", media[V], [], 0, 4) as never, { ...videoClipOf("v2", media[V], [], 5, 9), transitionIn: { type: "crossfade", duration: 1 } } as never);
    const plan = audioPlan(d, () => true);
    const out = plan.find((p) => p.clip.id === "v1")!;
    const inn = plan.find((p) => p.clip.id === "v2")!;
    // (v2 starts at 3 s; half way through the overlap both are at half)
    expect(partLevel(out, 3.5)).toBeCloseTo(0.5, 5);
    expect(partLevel(inn, 0.5)).toBeCloseTo(0.5, 5);
  });
});

// a seeked frame is drawn after at most a frame's wait: the old 120 ms was paid on nearly every frame
// (Chromium rarely presents a paused, seeked video): a 10-minute export took twice as long
describe("the browser export's wait for a seeked frame", () => {
  it("is one frame, never more than 20 ms", () => {
    expect(frameWaitMs(30)).toBe(20);
    expect(frameWaitMs(60)).toBe(17);
    expect(frameWaitMs(24)).toBe(20);
    expect(frameWaitMs(0)).toBe(20);
  });
});
