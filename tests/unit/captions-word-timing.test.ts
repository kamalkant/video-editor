import { describe, expect, it } from "vitest";
import { captionWords, cleanSegments, segmentsToCaptions, splitPhrase } from "@/lib/subtitles/segments";
import { captionProgress, usableWordTimes, wordProgress } from "@/lib/text/render";
import { emojiBoost, emojiFor } from "@/lib/subtitles/emoji";
import { addCaptionTrack } from "@/lib/edit/docEdit";
import { emptyDoc } from "@/lib/edit/doc";
import { textClipOf } from "@/lib/text/layout";

describe("word timings from the transcriber", () => {
  it("are kept when there is exactly one per word, clamped and in order", () => {
    const [seg] = cleanSegments(
      [{ start: 1, end: 3, text: "hello there friends", words: [{ w: "hello", s: 0.8 }, { w: "there", s: 1.6 }, { w: "friends", s: 1.5 }] }],
      10
    );
    // 0.8 is before the phrase → clamped to 1; "friends" said before "there" → moved after it
    expect(seg.words?.map((w) => w.start)).toEqual([1, 1.6, 1.6]);
  });

  it("are dropped when they don't line up with the words (the highlight must never point at the wrong word)", () => {
    const [seg] = cleanSegments([{ start: 0, end: 2, text: "one two three", words: [{ w: "one", s: 0 }, { w: "two", s: 1 }] }], 10);
    expect(seg.words).toBeUndefined();
  });

  it("a long phrase split into two captions: each starts when its first word is said", () => {
    const words = "this is a long sentence that will not fit in one caption line because it keeps going on and on for quite a while";
    const list = captionWords(words);
    const seg = { start: 0, end: 10, text: words, words: list.map((w, i) => ({ text: w, start: i * 0.4 })) };
    const parts = splitPhrase(seg);
    expect(parts.length).toBeGreaterThan(1);
    const firstWordsOfSecond = captionWords(parts[0].text).length;
    expect(parts[1].start).toBeCloseTo(firstWordsOfSecond * 0.4, 5);
    expect(parts[0].end).toBe(parts[1].start);
  });

  it("captions carry word times from their own start, in timeline seconds (speed applies)", () => {
    const segs = [{ start: 2, end: 4, text: "go go go", words: [{ text: "go", start: 2 }, { text: "go", start: 2.5 }, { text: "go", start: 3 }] }];
    const [cap] = segmentsToCaptions(segs, { type: "video", in: 0, out: 10, speed: 2 }, 5);
    expect(cap.start).toBe(6); // 5 + 2 / 2
    expect(cap.wordTimes).toEqual([0, 0.25, 0.5]);
  });

  it("subtitle tracks keep the word times on the caption clips", () => {
    const { text: _t, duration: _d, ...template } = textClipOf("caption");
    const { doc } = addCaptionTrack(emptyDoc(), "Subtitles", [{ start: 1, duration: 2, text: "a b c", wordTimes: [0, 0.5, 1] }], template);
    const clip = doc.tracks[0].clips[0];
    expect(clip.type === "text" && clip.wordTimes).toEqual([0, 0.5, 1]);
  });
});

describe("which word is highlighted", () => {
  it("follows the word times", () => {
    const clip = { text: "one two three four", wordTimes: [0, 0.2, 1.0, 1.5] };
    const at = (s: number) => Math.floor(captionProgress(clip, s, 2) * 4);
    expect([at(0), at(0.19), at(0.2), at(0.99), at(1.0), at(1.7)]).toEqual([0, 0, 1, 1, 2, 3]);
  });

  it("an edited caption (word count changed) falls back to even spacing", () => {
    const clip = { text: "one two three four five", wordTimes: [0, 0.2, 1.0, 1.5] };
    expect(usableWordTimes(clip)).toBeNull();
    expect(captionProgress(clip, 1, 2)).toBe(0.5);
  });

  it("wordProgress stays on the right word at the edges", () => {
    expect(Math.floor(wordProgress(-1, 3) * 3)).toBe(0);
    expect(Math.floor(wordProgress(9, 3) * 3)).toBe(2);
  });
});

describe("Add emojis", () => {
  it("adds one emoji after the first matching word (English and Hinglish), keeping word times in step", () => {
    expect(emojiFor("Paisa,")).toBe("💰");
    expect(emojiFor("kamaal!")).toBe("🤩");
    const out = emojiBoost({ text: "kaise kamai karein\nghar se", wordTimes: [0, 0.4, 0.8, 1.2, 1.5] });
    expect(out.text).toBe("kaise kamai 💰 karein\nghar se");
    expect(out.wordTimes).toEqual([0, 0.4, 0.4, 0.8, 1.2, 1.5]);
  });

  it("is idempotent and leaves captions without keywords alone", () => {
    const once = emojiBoost({ text: "this is fire" });
    expect(emojiBoost(once)).toEqual(once);
    expect(emojiBoost({ text: "nothing here" })).toEqual({ text: "nothing here" });
  });
});
