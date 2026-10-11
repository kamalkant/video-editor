import { describe, expect, it } from "vitest";
import { asSingleVideo, clipLength, docDuration, docFromSpec, docSchema, emptyDoc, mainClipAt, mainStarts, mainTrack, mediaIdsOf, parseDoc, sanitizeDoc, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addMedia, deleteClip, duplicateClip, moveClip, removeRangesInClip, splitClip, trimClip } from "@/lib/edit/docEdit";
import { DEFAULT_SPEC } from "@/lib/edit/spec";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const IMG = "33333333-3333-4333-8333-333333333333";
const MUS = "44444444-4444-4444-8444-444444444444";
const base = { fileName: "x", suggestedKey: "#11AE33", keyKind: "green" as const };
const M: Record<string, MediaLite> = {
  [V1]: { ...base, id: V1, kind: "video", width: 1280, height: 720, fps: 24, duration: 4, hasAudio: true },
  [V2]: { ...base, id: V2, kind: "video", width: 1920, height: 1080, fps: 30, duration: 10, hasAudio: false },
  [IMG]: { ...base, id: IMG, kind: "image", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null },
  [MUS]: { ...base, id: MUS, kind: "audio", width: 0, height: 0, fps: 0, duration: 30, hasAudio: true, suggestedKey: null, keyKind: null },
};
const media = (id: string) => M[id] ?? null;

function twoVideos(): TimelineDoc {
  let d = docFromSpec(DEFAULT_SPEC, M[V1]);
  d = addMedia(d, M[V2]).doc;
  return d;
}

describe("timeline document (v2)", () => {
  it("the old single-video spec becomes a main track with its parts", () => {
    const d = docFromSpec({ ...DEFAULT_SPEC, timeline: { clips: [{ id: "a", in: 0, out: 1 }, { id: "b", in: 2, out: 4 }] } }, M[V1]);
    expect(docSchema.safeParse(d).success).toBe(true);
    expect(d.canvas).toEqual({ width: 1280, height: 720, fps: 24, background: "transparent" });
    expect(mainTrack(d).clips.map((c) => [c.id, clipLength(c)])).toEqual([["a", 1], ["b", 2]]);
    // …and it still counts as that simple single video, so it exports exactly as before
    expect(asSingleVideo(d)?.spec.timeline?.clips).toEqual([{ id: "a", in: 0, out: 1 }, { id: "b", in: 2, out: 4 }]);
    expect(parseDoc(DEFAULT_SPEC, media, M[V1]).version).toBe(2);
  });

  it("the main track is magnetic: clips play back to back", () => {
    const d = twoVideos();
    const main = mainTrack(d).clips;
    expect(mainStarts(main)).toEqual([0, 4]);
    expect(docDuration(d)).toBe(14);
    expect((mainClipAt(d, 5)?.clip as VideoClip).mediaId).toBe(V2);
    expect(asSingleVideo(d)).toBeNull(); // two different videos
  });

  it("pictures and music go on their own tracks at the playhead; overlaps move to a new track", () => {
    let d = twoVideos();
    d = addMedia(d, M[IMG], { at: 2 }).doc;
    d = addMedia(d, M[IMG], { at: 3 }).doc; // overlaps the first picture → a new overlay track
    d = addMedia(d, M[MUS], { at: 0 }).doc;
    const overlays = d.tracks.filter((t) => t.kind === "overlay" && t.clips.length);
    expect(overlays).toHaveLength(2);
    expect(d.tracks.filter((t) => t.kind === "audio")[0].clips[0]).toMatchObject({ start: 0, in: 0, out: 30 });
    expect(docDuration(d)).toBe(30); // the music is longer than the videos
    expect(mediaIdsOf(d).sort()).toEqual([V1, V2, IMG, MUS].sort());
  });

  it("split, trim, reorder, duplicate and delete on the main track", () => {
    let d = twoVideos();
    const [a, b] = mainTrack(d).clips;
    const s = splitClip(d, b.id, 6); // 2 s into the second video
    d = s.doc;
    expect(mainTrack(d).clips.map((c) => (c.type === "video" ? [c.in, c.out] : null))).toEqual([[0, 4], [0, 2], [2, 10]]);
    d = trimClip(d, a.id, "out", 3, media); // first clip now ends at 3 s
    expect(mainStarts(mainTrack(d).clips)).toEqual([0, 3, 5]);
    d = trimClip(d, a.id, "in", 1, media); // …and starts 1 s later in its video; it stays first
    expect(mainTrack(d).clips[0]).toMatchObject({ in: 1, out: 3 });
    d = moveClip(d, a.id, { trackId: mainTrack(d).id, index: 2 }); // reorder: first → last
    expect(mainTrack(d).clips.map((c) => c.id)).toEqual([b.id, s.newId, a.id]);
    const dup = duplicateClip(d, a.id);
    expect(mainTrack(dup.doc).clips.map((c) => c.id)).toEqual([b.id, s.newId, a.id, dup.clipId]);
    d = deleteClip(dup.doc, b.id);
    expect(mainStarts(mainTrack(d).clips)[0]).toBe(0); // the gap closes
    // trims stay inside the video
    d = trimClip(d, a.id, "out", 99, media);
    expect(mainTrack(d).clips.find((c) => c.id === a.id)).toMatchObject({ out: 4 });
    // trimming enforces MIN_TRIM_SECONDS (0.5s floor)
    d = trimClip(d, a.id, "out", 0.1, media);
    expect(clipLength(mainTrack(d).clips.find((c) => c.id === a.id)!)).toBeGreaterThanOrEqual(0.5);
  });

  it("overlay clips keep their end when the left edge is trimmed, and can't run into each other", () => {
    let d = addMedia(twoVideos(), M[IMG], { at: 2 }).doc; // picture 2–7 s
    const pic = d.tracks.find((t) => t.kind === "overlay" && t.clips.length)!.clips[0];
    d = trimClip(d, pic.id, "in", 3, media);
    const after = d.tracks.find((t) => t.kind === "overlay" && t.clips.length)!.clips[0];
    expect(after).toMatchObject({ start: 3, duration: 4 });
    d = moveClip(d, pic.id, { trackId: d.tracks.find((t) => t.kind === "overlay" && t.clips.length)!.id, start: 8 });
    expect(d.tracks.find((t) => t.kind === "overlay" && t.clips.length)!.clips[0]).toMatchObject({ start: 8 });
    // sound can't go on a picture track
    const withMusic = addMedia(d, M[MUS], { at: 0 });
    const music = withMusic.clipId;
    expect(moveClip(withMusic.doc, music, { trackId: d.tracks.find((t) => t.kind === "overlay")!.id, start: 0 })).toBe(withMusic.doc);
  });

  it("cutting pauses out of one clip keeps the pieces back to back", () => {
    const d = docFromSpec(DEFAULT_SPEC, M[V1]);
    const id = mainTrack(d).clips[0].id;
    const cut = removeRangesInClip(d, id, [{ start: 1, end: 2 }, { start: 3, end: 3.5 }]);
    expect(mainTrack(cut).clips.map((c) => (c.type === "video" ? [c.in, c.out] : null))).toEqual([[0, 1], [2, 3], [3.5, 4]]);
    expect(new Set(mainTrack(cut).clips.map((c) => c.id)).size).toBe(3);
  });

  it("untrusted timelines are cleaned: trims inside the media, unknown media dropped", () => {
    const d = emptyDoc();
    mainTrack(d).clips.push({ id: "x", type: "video", mediaId: V1, in: -3, out: 99, ops: DEFAULT_SPEC.ops, transform: { fit: "fit", x: 0, y: 0, scale: 1 }, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 });
    mainTrack(d).clips.push({ id: "y", type: "video", mediaId: "55555555-5555-4555-8555-555555555555", in: 0, out: 1, ops: [], transform: { fit: "fit", x: 0, y: 0, scale: 1 }, volume: 1, muted: false, fadeIn: 0, fadeOut: 0 });
    const clean = sanitizeDoc(d, media);
    expect(mainTrack(clean).clips).toHaveLength(1);
    expect(mainTrack(clean).clips[0]).toMatchObject({ in: 0, out: 4 });
    expect(docSchema.safeParse({ ...d, tracks: d.tracks.filter((t) => t.kind !== "main") }).success).toBe(false); // must have a main track
  });
});

describe("editor state for the timeline", async () => {
  const { docReducer, clipStudioState } = await import("@/lib/editor/docReducer");
  const { keyOp } = await import("@/lib/edit/spec");
  const { keyParams } = await import("@/lib/editor/studioReducer");

  it("background removal settings belong to each clip; export settings to the project", () => {
    let s: import("@/lib/editor/docReducer").DocState = { doc: twoVideos(), media: M };
    const [a, b] = mainTrack(s.doc).clips;
    s = docReducer(s, { type: "clip", clipId: a.id, action: { type: "key", patch: { similarity: 0.1 } } });
    s = docReducer(s, { type: "clip", clipId: b.id, action: { type: "setMethod", method: "black" } });
    const ca = clipStudioState(s, a.id)!;
    const cb = clipStudioState(s, b.id)!;
    expect(keyParams(ca).similarity).toBe(0.1);
    expect(ca.method).toBe("color");
    expect(cb.method).toBe("black");
    expect(keyOp(cb.spec)!.enabled).toBe(false);
    // a clip added without settings starts with nothing removed
    expect(clipStudioState({ doc: addMedia(s.doc, M[V2]).doc, media: M }, mainTrack(addMedia(s.doc, M[V2]).doc).clips[2].id)!.spec.ops.every((o) => !o.enabled)).toBe(true);
    s = docReducer(s, { type: "clip", clipId: a.id, action: { type: "output", patch: { quality: "best" } } });
    expect(s.doc.output.quality).toBe("best");
    expect(clipStudioState(s, b.id)!.spec.output.quality).toBe("best");
  });

  it("adding media remembers it; editing actions go through the timeline functions", () => {
    let s: import("@/lib/editor/docReducer").DocState = { doc: docFromSpec(DEFAULT_SPEC, M[V1]), media: { [V1]: M[V1] } };
    s = docReducer(s, { type: "addMedia", media: M[V2] });
    expect(s.media[V2]).toBeTruthy();
    const [, b] = mainTrack(s.doc).clips;
    s = docReducer(s, { type: "trim", clipId: b.id, edge: "out", to: 6 });
    expect(mainTrack(s.doc).clips[1]).toMatchObject({ in: 0, out: 2 });
    s = docReducer(s, { type: "setCanvas", patch: { width: 1081, height: 1921 } });
    expect(s.doc.canvas).toMatchObject({ width: 1082, height: 1922 });
  });
});
