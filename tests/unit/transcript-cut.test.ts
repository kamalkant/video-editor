import { describe, expect, it } from "vitest";
import { emptyDoc, mainDuration, mainStarts, mainTrack, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addCaptionTrack, addMedia, addText, setClip } from "@/lib/edit/docEdit";
import { cutTimelineRanges, mergeRanges, removeCaptionWords } from "@/lib/edit/transcriptCut";
import { textClipOf } from "@/lib/text/layout";

const V = "11111111-1111-4111-8111-111111111111";
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 60, hasAudio: true, suggestedKey: null, keyKind: null };
const { text: _t, duration: _d, ...captionTemplate } = textClipOf("caption");

/** Two clips on Video 1: A = source 0–10 s; B = source 20–40 s at 2× speed (10 s on the timeline). */
function project(): TimelineDoc {
  let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } };
  d = addMedia(d, vid, { id: "A" }).doc;
  d = setClip(d, "A", { in: 0, out: 10 });
  d = addMedia(d, vid, { id: "B" }).doc;
  d = setClip(d, "B", { in: 20, out: 40, speed: 2 });
  return d;
}
const mainClips = (d: TimelineDoc) => mainTrack(d).clips as VideoClip[];

describe("cutting transcript words from the timeline", () => {
  it("maps the cut to the right source seconds of a trimmed, sped-up clip that isn't first", () => {
    const d = project();
    expect(mainDuration(d)).toBe(20);
    // timeline 14–15 s = 4–5 s into B = source 20 + 4×2 … 20 + 5×2 = 28–30 s
    const out = cutTimelineRanges(d, [{ start: 14, end: 15 }]);
    const clips = mainClips(out);
    expect(clips.map((c) => [c.in, c.out])).toEqual([
      [0, 10],
      [20, 28],
      [30, 40],
    ]);
    expect(mainDuration(out)).toBe(19);
  });

  it("a cut across two clips trims both", () => {
    const out = cutTimelineRanges(project(), [{ start: 9, end: 11 }]);
    expect(mainClips(out).map((c) => [c.in, c.out])).toEqual([
      [0, 9],
      [22, 40],
    ]);
    expect(mainDuration(out)).toBe(18);
  });

  it("several cuts at once: all land in the right place (they are applied from the last one)", () => {
    const out = cutTimelineRanges(project(), [
      { start: 2, end: 3 },
      { start: 14, end: 15 },
    ]);
    expect(mainDuration(out)).toBe(18);
    expect(mainClips(out).map((c) => [c.in, c.out])).toEqual([
      [0, 2],
      [3, 10],
      [20, 28],
      [30, 40],
    ]);
  });

  it("subtitles and graphics ripple with the cut", () => {
    let d = project();
    d = addCaptionTrack(
      d,
      "Subtitles",
      [
        { start: 1, duration: 1, text: "before" },
        { start: 12, duration: 4, text: "um this one spans", wordTimes: [0, 1, 2, 3] },
        { start: 14.2, duration: 0.5, text: "inside" },
        { start: 17, duration: 2, text: "after" },
      ],
      captionTemplate
    ).doc;
    d = addText(d, { ...textClipOf("title"), text: "Logo", duration: 3 }, 16, "title1").doc;
    const out = cutTimelineRanges(d, [{ start: 14, end: 15 }]);
    const subs = out.tracks.find((t) => t.name === "Subtitles")!.clips as Array<{ text: string; start: number; duration: number; wordTimes?: number[] }>;
    expect(subs.map((c) => [c.text, c.start, c.duration])).toEqual([
      ["before", 1, 1],
      ["um this one spans", 12, 3], // across the cut: shorter
      ["after", 16, 2], // after it: moved back
    ]);
    // the shortened caption's timings no longer fit
    expect(subs[1].wordTimes).toBeUndefined();
    const all = out.tracks.flatMap((t) => t.clips as Array<{ id: string; start?: number }>);
    const title = all.find((c) => c.id === "title1") as { start: number };
    expect(title.start).toBe(15);
  });

  it("locked Video 1 or a reversed clip is never cut", () => {
    const locked = { ...project() };
    locked.tracks = locked.tracks.map((t) => (t.kind === "main" ? { ...t, locked: true } : t));
    expect(cutTimelineRanges(locked, [{ start: 1, end: 2 }])).toBe(locked);
    const rev = setClip(project(), "A", { reversed: true });
    expect(mainDuration(cutTimelineRanges(rev, [{ start: 1, end: 2 }]))).toBe(20);
  });

  it("merges touching ranges (cutting the words of a phrase one by one is one cut)", () => {
    expect(mergeRanges([{ start: 2, end: 2.5 }, { start: 1, end: 2 }, { start: 2.505, end: 3 }])).toEqual([{ start: 1, end: 3 }]);
    expect(mainStarts(mainTrack(project()).clips)).toEqual([0, 10]);
  });
});

describe("cut words leave the subtitle text", () => {
  it("removes the words (lines kept), drops their timings, and an emptied caption goes", () => {
    let d = project();
    d = addCaptionTrack(
      d,
      "Subtitles",
      [
        { start: 1, duration: 2, text: "um so this\nis great", wordTimes: [0, 0.3, 0.6, 1, 1.4] },
        { start: 5, duration: 1, text: "uh" },
      ],
      captionTemplate
    ).doc;
    const subs = d.tracks.find((t) => t.name === "Subtitles")!.clips;
    const out = removeCaptionWords(d, [
      { clipId: subs[0].id, index: 0 },
      { clipId: subs[1].id, index: 0 },
    ]);
    const left = out.tracks.find((t) => t.name === "Subtitles")!.clips as Array<{ text: string; wordTimes?: number[] }>;
    expect(left).toHaveLength(1);
    expect(left[0].text).toBe("so this\nis great");
    expect(left[0].wordTimes).toEqual([0.3, 0.6, 1, 1.4]);
  });
});
