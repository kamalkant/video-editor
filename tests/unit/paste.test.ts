import { describe, expect, it } from "vitest";
import { clipLength, emptyDoc, findClip, mainStarts, mainTrack, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText, pasteClip, type CopiedClip } from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";

const vid = (id: string, duration: number): MediaLite => ({ id, kind: "video", fileName: `${id}.mp4`, width: 1280, height: 720, fps: 25, duration, hasAudio: true, suggestedKey: null, keyKind: null });
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const copyOf = (d: TimelineDoc, id: string): CopiedClip => {
  const f = findClip(d, id)!;
  return { clip: f.clip, kind: f.track.kind, trackId: f.track.id };
};

describe("copy and paste on the timeline", () => {
  it("a Video 1 clip is pasted right after the clip under the playhead, without its transition", () => {
    let d = addMedia(emptyDoc(), vid(A, 4), { id: "c1" }).doc;
    d = addMedia(d, vid(B, 6), { id: "c2" }).doc;
    d = { ...d, tracks: d.tracks.map((t) => (t.kind === "main" ? { ...t, clips: t.clips.map((c) => (c.id === "c2" ? { ...c, transitionIn: { type: "crossfade" as const, duration: 0.5 } } : c)) } : t)) } as TimelineDoc;
    const cp = copyOf(d, "c2");
    // playhead at 1 s (inside c1): the copy goes between c1 and c2
    const r = pasteClip(d, cp, 1, "p1");
    expect(mainTrack(r.doc).clips.map((c) => c.id)).toEqual(["c1", "p1", "c2"]);
    expect("transitionIn" in findClip(r.doc, "p1")!.clip && (findClip(r.doc, "p1")!.clip as { transitionIn?: unknown }).transitionIn).toBeFalsy();
    // past the end: at the end; at 0: first
    expect(mainTrack(pasteClip(d, cp, 99).doc).clips.at(-1)!.type).toBe("video");
    expect(mainTrack(pasteClip(d, cp, 0, "p0").doc).clips.map((c) => c.id)).toEqual(["c1", "p0", "c2"]);
    // the original is untouched and the total grows by the clip's length
    const before = mainStarts(mainTrack(d).clips).at(-1)! + clipLength(mainTrack(d).clips.at(-1)!);
    const after = mainStarts(mainTrack(r.doc).clips).at(-1)! + clipLength(mainTrack(r.doc).clips.at(-1)!);
    expect(after - before).toBeCloseTo(6 - 0);
  });

  it("text is pasted at the playhead on its track, or on a free one when that is taken", () => {
    let d = addMedia(emptyDoc(), vid(A, 10), { id: "c1" }).doc;
    d = addText(d, { ...textClipOf("title"), duration: 2 }, 0, "t1").doc;
    const cp = copyOf(d, "t1");
    const free = pasteClip(d, cp, 5, "t2");
    const f2 = findClip(free.doc, "t2")!;
    expect(f2.track.id).toBe(findClip(d, "t1")!.track.id);
    expect((f2.clip as { start: number }).start).toBe(5);
    // at 1 s the old track is busy (t1 runs 0–2 s): a new overlay track
    const busy = pasteClip(d, cp, 1, "t3");
    expect(findClip(busy.doc, "t3")!.track.id).not.toBe(findClip(d, "t1")!.track.id);
    // ids stay unique even if the wanted one is taken
    expect(pasteClip(d, cp, 5, "t1").clipId).not.toBe("t1");
  });
});
