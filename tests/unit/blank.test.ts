import { describe, expect, it } from "vitest";
import { BLANK_FILL, BLANK_SECONDS, coverMediaIdOrNull, docDuration, docSchema, drawnSlot, emptyDoc, findClip, mainStarts, mainTrack, sanitizeDoc, type BlankClip, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addBlank, addMedia, duplicateClip, editClipAt, keyframeOp, moveClip, pasteClip, setClip, splitClip, trimClip } from "@/lib/edit/docEdit";
import { coverMediaId } from "@/lib/projects/model";
import { alphaCheckTime } from "@/lib/render/compose";

const V = "11111111-1111-4111-8111-111111111111";
const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
const media = (id: string) => (id === V ? vid : null);
/** Two 6 s videos on Video 1. */
function twoVideos(): TimelineDoc {
  let d = emptyDoc();
  d = addMedia(d, vid, { id: "v1" }).doc;
  d = addMedia(d, vid, { id: "v2" }).doc;
  return d;
}
const ids = (d: TimelineDoc) => mainTrack(d).clips.map((c) => c.id);
const blank = (d: TimelineDoc, id: string) => findClip(d, id)!.clip as BlankClip;

describe("blank scenes on Video 1", () => {
  it("a new one is black and 3 s, and saving / loading keeps it (the clean-up used to drop clips without an upload)", () => {
    const d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    expect(blank(d, "b1")).toMatchObject({ type: "blank", fill: BLANK_FILL, duration: BLANK_SECONDS, fadeIn: 0, fadeOut: 0 });
    const back = sanitizeDoc(docSchema.parse(JSON.parse(JSON.stringify(d))), media);
    expect(ids(back)).toEqual(["v1", "b1", "v2"]);
    expect(docDuration(back)).toBeCloseTo(15, 6);
  });
  it("goes before or after a clip, at the start or the end; a transition stays with the clip it was on", () => {
    const d = setClip(twoVideos(), "v2", { transitionIn: { type: "crossfade", duration: 0.5 } });
    expect(ids(addBlank(d, 0, { id: "b" }).doc)).toEqual(["b", "v1", "v2"]);
    expect(ids(addBlank(d, 2, { id: "b" }).doc)).toEqual(["v1", "v2", "b"]);
    expect(ids(addBlank(d, 99, { id: "b" }).doc)).toEqual(["v1", "v2", "b"]);
    const mid = addBlank(d, 1, { id: "b" }).doc;
    expect(ids(mid)).toEqual(["v1", "b", "v2"]);
    expect((findClip(mid, "v2")!.clip as { transitionIn?: unknown }).transitionIn).toBeTruthy();
    expect(blank(mid, "b").transitionIn).toBeUndefined();
  });
  it("a transition into a blank is saved, and it overlaps like any Video 1 clip", () => {
    let d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    d = setClip(d, "b1", { transitionIn: { type: "dipBlack", duration: 1 } });
    const back = docSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(blank(back, "b1").transitionIn).toEqual({ type: "dipBlack", duration: 1 });
    // (6 s video, then the blank starts 1 s earlier: they overlap for the transition)
    expect(mainStarts(mainTrack(back).clips)[1]).toBeCloseTo(5, 6);
  });
  it("stays on Video 1: it can't move to an overlay track, but it can move along Video 1", () => {
    const d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    const overlay = d.tracks.find((t) => t.kind === "overlay")!;
    expect(moveClip(d, "b1", { trackId: overlay.id, start: 0 })).toBe(d);
    expect(ids(moveClip(d, "b1", { trackId: mainTrack(d).id, index: 0 }))).toEqual(["b1", "v1", "v2"]);
  });
  it("split, trim, duplicate and paste keep its color", () => {
    let d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    d = setClip(d, "b1", { fill: "#ff00aa" });
    const sp = splitClip(d, "b1", 7);
    expect(blank(sp.doc, "b1").duration).toBeCloseTo(1, 6);
    expect(blank(sp.doc, sp.newId!)).toMatchObject({ fill: "#ff00aa", duration: 2 });
    // longer, like any clip (its end dragged 2 s on)
    const tr = trimClip(d, "b1", "out", 11, media);
    expect(blank(tr, "b1").duration).toBeCloseTo(5, 6);
    const du = duplicateClip(d, "b1");
    expect(blank(du.doc, du.clipId!).fill).toBe("#ff00aa");
    const pa = pasteClip(d, { clip: findClip(d, "b1")!.clip, kind: "main" }, 1);
    expect(findClip(pa.doc, pa.clipId)!.track.kind).toBe("main");
    expect(blank(pa.doc, pa.clipId).fill).toBe("#ff00aa");
  });
  it("has no keyframes or place of its own (it's the whole frame)", () => {
    const d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    expect(editClipAt(d, "b1", 7, { transform: { x: 0.2 } })).toBe(d);
    expect(keyframeOp(d, "b1", 7, { kind: "toggle" })).toBe(d);
  });
  it("the project's picture skips a blank at the start", () => {
    const d = addBlank(twoVideos(), 0, { id: "b1" }).doc;
    expect(coverMediaIdOrNull(d)).toBe(V);
    expect(coverMediaId(d)).toBe(V);
    const only = addBlank(emptyDoc(), 0).doc;
    expect(coverMediaIdOrNull(only)).toBeNull();
    expect(coverMediaId(only)).toBeNull();
  });
  it("text or an element added on a blank goes from its start for 3 s; elsewhere at the playhead", () => {
    // v1 0–6, the blank 6–9, v2 9–15
    const d = addBlank(twoVideos(), 1, { id: "b1" }).doc;
    expect(drawnSlot(d, 7.5)).toEqual({ at: 6, seconds: BLANK_SECONDS });
    expect(drawnSlot(d, 6)).toEqual({ at: 6, seconds: BLANK_SECONDS });
    expect(drawnSlot(d, 2)).toEqual({ at: 2 });
    // (at the very end: from the start)
    expect(drawnSlot(d, 15)).toEqual({ at: 0 });
  });
  it("the see-through check of a transparent export looks away from blanks (they're solid)", () => {
    // the blank 0–3, v1 3–9, v2 9–15: the middle of v1
    const d = addBlank(twoVideos(), 0, { id: "b1" }).doc;
    expect(alphaCheckTime(d, docDuration(d))).toBeCloseTo(6, 6);
    expect(alphaCheckTime(twoVideos(), 12)).toBe(1);
    expect(alphaCheckTime(addBlank(emptyDoc(), 0).doc, 3)).toBeNull();
  });
});
