import { describe, expect, it } from "vitest";
import { clipLength, emptyDoc, findClip, mainTrack, srcAt, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addMedia, removeRangesInClip, setClip, splitClip, trimClip } from "@/lib/edit/docEdit";
import { reversePieces } from "@/lib/media/reverse";
import { atempo } from "@/lib/render/compose";

const V = "77777777-7777-4777-8777-777777777777";
const m: MediaLite = { id: V, kind: "video", fileName: "v", width: 640, height: 360, fps: 24, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null };
const media = () => m;
function doc(patch: Record<string, unknown> = {}): TimelineDoc {
  let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 640, height: 360, fps: 24, background: "#000000" } };
  d = addMedia(d, m, { id: "c1" }).doc;
  return setClip(d, "c1", { in: 2, out: 8, ...patch });
}
const clip = (d: TimelineDoc, id = "c1") => findClip(d, id)!.clip as VideoClip;

describe("speed", () => {
  it("2× halves the clip on the timeline; 0.5× doubles it", () => {
    expect(clipLength(clip(doc({ speed: 2 })))).toBeCloseTo(3, 6);
    expect(clipLength(clip(doc({ speed: 0.5 })))).toBeCloseTo(12, 6);
    expect(srcAt(clip(doc({ speed: 2 })), 1)).toBeCloseTo(4, 6);
  });
  it("split and trim work in timeline seconds", () => {
    const d = splitClip(doc({ speed: 2 }), "c1", 1).doc; // 1 s on the timeline = 2 s of source
    const [a, b] = mainTrack(d).clips as VideoClip[];
    expect([a.in, a.out, b.in, b.out]).toEqual([2, 4, 4, 8]);
    const t = trimClip(doc({ speed: 2 }), "c1", "out", 2, media);
    expect(clip(t).out).toBeCloseTo(6, 6);
  });
  it("sound speed keeps its pitch (atempo steps)", () => {
    expect(atempo(1)).toEqual([]);
    expect(atempo(2)).toEqual(["atempo=2"]);
    expect(atempo(4)).toEqual(["atempo=2", "atempo=2"]);
    expect(atempo(0.25)).toEqual(["atempo=0.5", "atempo=0.5"]);
    expect(atempo(1.5)).toEqual(["atempo=1.5"]);
  });
});

describe("reverse", () => {
  it("reads the source from its end", () => {
    const c = clip(doc({ reversed: true }));
    expect(srcAt(c, 0)).toBe(8);
    expect(srcAt(c, 1.5)).toBe(6.5);
  });
  it("split: the first part is the end of the source range", () => {
    const d = splitClip(doc({ reversed: true }), "c1", 2).doc;
    const [a, b] = mainTrack(d).clips as VideoClip[];
    expect([a.in, a.out]).toEqual([6, 8]);
    expect([b.in, b.out]).toEqual([2, 6]);
  });
  it("trim: the timeline start of a reversed clip is its source end", () => {
    const d = trimClip(doc({ reversed: true }), "c1", "in", 1, media);
    expect([clip(d).in, clip(d).out]).toEqual([2, 7]);
  });
  it("removing a pause keeps the backwards order", () => {
    const d = removeRangesInClip(doc({ reversed: true }), "c1", [{ start: 4, end: 5 }]);
    const parts = mainTrack(d).clips as VideoClip[];
    expect(parts.map((c) => [c.in, c.out])).toEqual([
      [5, 8],
      [2, 4],
    ]);
  });
  it("is made in 2-second pieces, last first", () => {
    expect(reversePieces(1, 6)).toEqual([
      [4, 2],
      [2, 2],
      [1, 1],
    ]);
  });
});
