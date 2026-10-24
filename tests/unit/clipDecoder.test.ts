import { describe, expect, it } from "vitest";
import { batchEnd, isIsoFile, needsRestart, presentationTimes, SampleIndex, type SampleInfo } from "@/lib/export/clipDecoder";
import { picSize } from "@/lib/render/frame";

// 30 fps, a keyframe every 10 frames, in decode order, shown in order (no B-frames)
const plain = (n: number, sync = 10): SampleInfo[] =>
  Array.from({ length: n }, (_, i) => ({ offset: i * 1000, size: 1000, p: i / 30, dur: 1 / 30, sync: i % sync === 0 }));

describe("the browser export's WebCodecs frames: which sample is on screen", () => {
  it("is the last one shown at or before the time, as a <video> shows it", () => {
    const idx = new SampleIndex(plain(90));
    expect(idx.at(0)).toBe(0);
    expect(idx.at(0.5 / 30)).toBe(0);
    expect(idx.at(1 / 30)).toBe(1);
    expect(idx.at(45.5 / 30)).toBe(45);
    expect(idx.at(-1)).toBe(0); // (before the start: the first)
    expect(idx.at(100)).toBe(89); // (past the end: the last)
  });

  it("repeats a frame when the clip is slowed down, and skips frames for a 60 fps file in a 30 fps export", () => {
    const idx = new SampleIndex(plain(90));
    // half speed: two export frames per source frame
    expect([0, 1, 2, 3].map((i) => idx.at((i + 0.5) / 30 / 2))).toEqual([0, 0, 1, 1]);
    const sixty = new SampleIndex(Array.from({ length: 120 }, (_, i) => ({ offset: i, size: 1, p: i / 60, dur: 1 / 60, sync: i % 20 === 0 })));
    expect([0, 1, 2, 3].map((i) => sixty.at((i + 0.5) / 30))).toEqual([1, 3, 5, 7]);
  });

  it("follows the shown order with B-frames (decode order differs)", () => {
    // decode order I P B B, shown I B B P
    const s: SampleInfo[] = [0, 3, 1, 2].map((f, i) => ({ offset: i, size: 1, p: f / 30, dur: 1 / 30, sync: i === 0 }));
    const idx = new SampleIndex(s);
    expect([0, 1, 2, 3].map((f) => idx.at((f + 0.5) / 30))).toEqual([0, 2, 3, 1]);
  });

  it("finds the keyframe decoding starts from", () => {
    const idx = new SampleIndex(plain(90));
    expect(idx.syncAtOrBefore(0)).toBe(0);
    expect(idx.syncAtOrBefore(9)).toBe(0);
    expect(idx.syncAtOrBefore(10)).toBe(10);
    expect(idx.syncAtOrBefore(57)).toBe(50);
  });
});

describe("when the decoder starts again at a keyframe", () => {
  const idx = new SampleIndex(plain(90));
  it("on the first frame", () => expect(needsRestart(idx, 0, 0, null)).toBe(true));
  it("not while going forward through what was sent", () => expect(needsRestart(idx, 12, 15, 11 / 30)).toBe(false));
  it("not for the next keyframe's own run, which the decoder reaches by going on", () => expect(needsRestart(idx, 22, 20, 18 / 30)).toBe(false));
  it("when the picture goes back (a cut earlier in the file)", () => expect(needsRestart(idx, 5, 30, 25 / 30)).toBe(true));
  it("when a keyframe lies past what was sent (a cut further on)", () => expect(needsRestart(idx, 65, 20, 18 / 30)).toBe(true));
});

describe("presentation times", () => {
  it("apply the edit list: its first media edit starts the picture (B-frames), empty edits delay it", () => {
    const samples = [0, 3, 1, 2].map((f) => ({ cts: 1024 + f * 512, duration: 512 }));
    expect(presentationTimes(samples, 15360, [{ segment_duration: 1000, media_time: 1024 }]).map((x) => +(x.p * 30).toFixed(6))).toEqual([0, 3, 1, 2]);
    // a leading empty edit of 0.5 s (movie timescale 1000)
    const delayed = presentationTimes(samples, 15360, [{ segment_duration: 500, media_time: -1 }, { segment_duration: 1000, media_time: 1024 }], 1000);
    expect(delayed[0].p).toBeCloseTo(0.5, 9);
    expect(delayed[0].dur).toBeCloseTo(1 / 30, 9);
  });

  it("without an edit list, start at the samples' own times", () => {
    expect(presentationTimes([{ cts: 0, duration: 1 }, { cts: 1, duration: 1 }], 30).map((x) => x.p)).toEqual([0, 1 / 30]);
  });
});

describe("reading samples in batches", () => {
  it("takes neighbours up to the size or count limit, gaps (the sound between) included", () => {
    const s = plain(100);
    expect(batchEnd(s, 0)).toBe(60);
    expect(batchEnd(s, 0, 10_000)).toBe(10);
    expect(batchEnd(s, 95)).toBe(100);
    // a sample earlier in the file ends the batch
    const back = [...plain(3), { offset: 0, size: 10, p: 1, dur: 0.1, sync: false }];
    expect(batchEnd(back, 1)).toBe(3);
  });
});

describe("which files the decoder reads", () => {
  const head = (s: string) => new Uint8Array([0, 0, 0, 24, ...[...s].map((c) => c.charCodeAt(0))]);
  it("MP4 and MOV, whatever box comes first", () => {
    for (const box of ["ftyp", "moov", "mdat", "wide", "free"]) expect(isIsoFile(head(box))).toBe(true);
  });
  it("not WebM (it seeks a <video>)", () => {
    expect(isIsoFile(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]))).toBe(false);
    expect(isIsoFile(new Uint8Array([0, 0]))).toBe(false);
  });
});

describe("a video clip's picture size", () => {
  it("is a <video>'s video size, or a canvas' size (a decoded frame)", () => {
    expect(picSize({ videoWidth: 1920, videoHeight: 1080, width: 300, height: 150 } as unknown as HTMLVideoElement)).toEqual({ w: 1920, h: 1080 });
    expect(picSize({ width: 1280, height: 720 } as HTMLCanvasElement)).toEqual({ w: 1280, h: 720 });
  });
});
