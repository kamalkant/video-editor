import { describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addCaptionTrack, addMedia } from "@/lib/edit/docEdit";
import { cleanSegments, fitCaptions, MIN_CAPTION, segmentsToCaptions, splitPhrase, toSeconds, wrapLines } from "@/lib/subtitles/segments";
import { subtitleSources, subtitleTracks } from "@/lib/subtitles/sources";
import { toSrt, toVtt } from "@/lib/subtitles/srt";
import { textClipOf } from "@/lib/text/layout";

describe("subtitles from what Gemini heard", () => {
  it("reads loose times and cleans the list (order, range, overlaps, empty lines)", () => {
    expect(toSeconds(12.5)).toBe(12.5);
    expect(toSeconds("00:12.5")).toBe(12.5);
    expect(toSeconds("0:01:02,250")).toBe(62.25);
    expect(toSeconds("soon")).toBeNull();
    const s = cleanSegments(
      [
        { start: 5, end: 7, text: "second" },
        { start: "00:01", end: "00:06", text: " first  one " },
        { start: 8, end: 50, text: "past the end" },
        { start: 3, end: 4, text: "   " },
        "junk",
      ],
      10,
    );
    expect(s).toEqual([
      { start: 1, end: 5, text: "first one" },
      { start: 5, end: 7, text: "second" },
      { start: 8, end: 10, text: "past the end" },
    ]);
    expect(cleanSegments(null, 10)).toEqual([]);
  });

  it("wraps at 42 characters and splits long phrases into two-line captions, sharing the time by length", () => {
    expect(wrapLines("a ".repeat(30).trim()).every((l) => l.length <= 42)).toBe(true);
    const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen";
    const parts = splitPhrase({ start: 0, end: 10, text: long });
    expect(parts.length).toBe(2);
    expect(parts[0].text.split("\n").length).toBeLessThanOrEqual(2);
    expect(parts[0].start).toBe(0);
    expect(parts[1].end).toBe(10);
    expect(parts[0].end).toBeCloseTo(parts[1].start);
  });

  it("maps the clip's time to the timeline: trim, where the clip starts, speed; reversed clips get none", () => {
    const seg = [{ start: 1, end: 3, text: "hello" }];
    const clip = { type: "video" as const, in: 10, out: 20 };
    expect(segmentsToCaptions(seg, clip, 5)).toEqual([{ start: 6, duration: 2, text: "hello" }]);
    // 2× speed: half the time on the timeline
    expect(segmentsToCaptions(seg, { ...clip, speed: 2 }, 5)).toEqual([{ start: 5.5, duration: 1, text: "hello" }]);
    expect(segmentsToCaptions(seg, { ...clip, reversed: true }, 5)).toEqual([]);
    // cut to the clip's length
    expect(segmentsToCaptions([{ start: 9, end: 12, text: "end" }], clip, 0)).toEqual([{ start: 9, duration: 1, text: "end" }]);
  });

  it("short captions last at least 0.7 s when there is room, and never overlap the next one", () => {
    const c = fitCaptions([
      { start: 0, duration: 0.2, text: "a" },
      { start: 5, duration: 3, text: "b" },
      { start: 6, duration: 1, text: "c" },
    ]);
    expect(c[0].duration).toBe(MIN_CAPTION);
    expect(c[1].duration).toBe(1);
  });

  it("writes .srt and .vtt files", () => {
    const caps = [{ start: 1.5, duration: 2, text: "Hello" }, { start: 3661.25, duration: 1, text: "Two\nlines" }];
    expect(toSrt(caps)).toBe("1\n00:00:01,500 --> 00:00:03,500\nHello\n\n2\n01:01:01,250 --> 01:01:02,250\nTwo\nlines\n");
    expect(toVtt(caps).startsWith("WEBVTT\n\n00:00:01.500 --> 00:00:03.500\nHello\n")).toBe(true);
  });
});

describe("subtitle tracks on the timeline", () => {
  const v: MediaLite = { id: "11111111-1111-4111-8111-111111111111", kind: "video", fileName: "a.mp4", width: 1280, height: 720, fps: 25, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null };
  const silent: MediaLite = { ...v, id: "22222222-2222-4222-8222-222222222222", hasAudio: false };
  const docOf = (): TimelineDoc => {
    let d = addMedia(emptyDoc(), v, { id: "c1" }).doc;
    d = addMedia(d, silent, { id: "c2" }).doc;
    return addMedia(d, v, { id: "c3" }).doc;
  };
  const has = (id: string) => id === v.id;

  it("finds the Video 1 clips with sound, at their timeline starts", () => {
    const s = subtitleSources(docOf(), has, "main", null);
    expect(s.map((x) => [x.clipId, x.start])).toEqual([
      ["c1", 0],
      ["c3", 20],
    ]);
    expect(subtitleSources(docOf(), has, "selected", "c2")).toEqual([]);
    expect(subtitleSources(docOf(), has, "selected", "c3")[0].start).toBe(20);
  });

  it("adds captions on a new named track in one step, hides the original, and splits past 300 lines", () => {
    const { text: _t, duration: _d, ...tpl } = textClipOf("caption");
    void _t;
    void _d;
    let d = addCaptionTrack(docOf(), "Subtitles", [{ start: 1, duration: 2, text: "Hi" }], tpl).doc;
    const first = subtitleTracks(d);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ name: "Subtitles", hidden: false, captions: [{ start: 1, duration: 2, text: "Hi" }] });
    d = addCaptionTrack(d, "Subtitles (Hindi)", [{ start: 1, duration: 2, text: "नमस्ते" }], tpl, [first[0].id]).doc;
    const both = subtitleTracks(d);
    expect(both.map((t) => [t.name, t.hidden])).toEqual([
      ["Subtitles (Hindi)", false],
      ["Subtitles", true],
    ]);
    const many = Array.from({ length: 450 }, (_, i) => ({ start: i, duration: 0.8, text: `line ${i}` }));
    const r = addCaptionTrack(docOf(), "Subtitles", many, tpl);
    expect(r.trackIds).toHaveLength(2);
    expect(subtitleTracks(r.doc).reduce((a, t) => a + t.captions.length, 0)).toBe(450);
    // ids are unique
    const ids = r.doc.tracks.flatMap((t) => t.clips.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
