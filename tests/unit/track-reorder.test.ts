import { describe, expect, it } from "vitest";
import { docFromSpec, mainTrack, type MediaLite, type TimelineDoc, type Track } from "@/lib/edit/doc";
import { addMedia, moveClip, reorderTracks, setTrack } from "@/lib/edit/docEdit";
import { visualLayers } from "@/lib/render/compose";
import { PATHS } from "@/components/ui/Icon";
import { DEFAULT_SPEC } from "@/lib/edit/spec";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const IMG1 = "33333333-3333-4333-8333-333333333331";
const IMG2 = "33333333-3333-4333-8333-333333333332";
const MUS1 = "44444444-4444-4444-8444-444444444441";
const MUS2 = "44444444-4444-4444-8444-444444444442";

const base = { fileName: "x", suggestedKey: "#11AE33", keyKind: "green" as const };
const M: Record<string, MediaLite> = {
  [V1]: { ...base, id: V1, kind: "video", width: 1280, height: 720, fps: 24, duration: 4, hasAudio: true },
  [V2]: { ...base, id: V2, kind: "video", width: 1920, height: 1080, fps: 30, duration: 6, hasAudio: false },
  [IMG1]: { ...base, id: IMG1, kind: "image", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null },
  [IMG2]: { ...base, id: IMG2, kind: "image", width: 800, height: 600, fps: 0, duration: 0, hasAudio: false, suggestedKey: null, keyKind: null },
  [MUS1]: { ...base, id: MUS1, kind: "audio", width: 0, height: 0, fps: 0, duration: 10, hasAudio: true, suggestedKey: null, keyKind: null },
  [MUS2]: { ...base, id: MUS2, kind: "audio", width: 0, height: 0, fps: 0, duration: 15, hasAudio: true, suggestedKey: null, keyKind: null },
};

function setupMultiTrackDoc(): TimelineDoc {
  let d = docFromSpec(DEFAULT_SPEC, M[V1]);
  // Add overlays at the same time so they get put on separate overlay tracks
  d = addMedia(d, M[IMG1], { at: 0 }).doc;
  d = addMedia(d, M[IMG2], { at: 0 }).doc;
  // Add 2 audio tracks
  d = addMedia(d, M[MUS1], { at: 0 }).doc;
  d = addMedia(d, M[MUS2], { at: 0 }).doc;
  return d;
}

describe("Timeline Layer & Track Dragging", () => {
  it("reorders overlay tracks among overlays (before and after)", () => {
    const d = setupMultiTrackDoc();
    const overlays = d.tracks.filter((t) => t.kind === "overlay");
    expect(overlays.length).toBeGreaterThanOrEqual(2);

    const [topOverlay, secondOverlay] = overlays;
    const initialOrder = d.tracks.map((t) => t.id);

    // Reorder: Move topOverlay after secondOverlay
    const reorderedAfter = reorderTracks(d, topOverlay.id, secondOverlay.id, "after");
    const newOverlaysAfter = reorderedAfter.tracks.filter((t) => t.kind === "overlay");
    expect(newOverlaysAfter[0].id).toBe(secondOverlay.id);
    expect(newOverlaysAfter[1].id).toBe(topOverlay.id);

    // Reorder: Move topOverlay before secondOverlay
    const reorderedBefore = reorderTracks(reorderedAfter, topOverlay.id, secondOverlay.id, "before");
    const newOverlaysBefore = reorderedBefore.tracks.filter((t) => t.kind === "overlay");
    expect(newOverlaysBefore[0].id).toBe(topOverlay.id);
    expect(newOverlaysBefore[1].id).toBe(secondOverlay.id);
    expect(reorderedBefore.tracks.map((t) => t.id)).toEqual(initialOrder);
  });

  it("preserves and moves track names along with tracks when reordering", () => {
    const d = setupMultiTrackDoc();
    const overlays = d.tracks.filter((t) => t.kind === "overlay");
    const [topOverlay, secondOverlay] = overlays;

    // Move secondOverlay (Overlay 1) before topOverlay (Overlay 2)
    const reordered = reorderTracks(d, secondOverlay.id, topOverlay.id, "before");
    const reorderedOverlays = reordered.tracks.filter((t) => t.kind === "overlay");
    expect(reorderedOverlays[0].id).toBe(secondOverlay.id);
    expect(reorderedOverlays[0].name).toBe("Overlay 1");
    expect(reorderedOverlays[1].id).toBe(topOverlay.id);
    expect(reorderedOverlays[1].name).toBe("Overlay 2");
  });

  it("reorders audio tracks among audio tracks", () => {
    const d = setupMultiTrackDoc();
    const audios = d.tracks.filter((t) => t.kind === "audio");
    expect(audios.length).toBeGreaterThanOrEqual(2);

    const [firstAudio, secondAudio] = audios;

    // Move secondAudio before firstAudio
    const reordered = reorderTracks(d, secondAudio.id, firstAudio.id, "before");
    const newAudios = reordered.tracks.filter((t) => t.kind === "audio");
    expect(newAudios[0].id).toBe(secondAudio.id);
    expect(newAudios[1].id).toBe(firstAudio.id);
  });

  it("strictly enforces track boundaries: cannot reorder Main track or cross categories", () => {
    const d = setupMultiTrackDoc();
    const main = mainTrack(d);
    const overlay = d.tracks.find((t) => t.kind === "overlay")!;
    const audio = d.tracks.find((t) => t.kind === "audio")!;

    // Cannot move main track
    expect(reorderTracks(d, main.id, overlay.id, "before")).toBe(d);
    expect(reorderTracks(d, main.id, audio.id, "after")).toBe(d);

    // Cannot target main track
    expect(reorderTracks(d, overlay.id, main.id, "before")).toBe(d);

    // Cannot move overlay into audio section or vice versa
    expect(reorderTracks(d, overlay.id, audio.id, "after")).toBe(d);
    expect(reorderTracks(d, audio.id, overlay.id, "before")).toBe(d);
  });

  it("moves clips vertically across layers to auto-created new overlay or audio tracks", () => {
    let d = docFromSpec(DEFAULT_SPEC, M[V1]);
    d = addMedia(d, M[IMG1], { at: 0 }).doc;
    const imgClip = d.tracks.find((t) => t.kind === "overlay")!.clips[0];

    // Drag overlay clip to 'new-overlay'
    const movedOverlay = moveClip(d, imgClip.id, { trackId: "new-overlay", start: 1 });
    const overlays = movedOverlay.tracks.filter((t) => t.kind === "overlay");
    expect(overlays.length).toBe(2);
    // New overlay track is on top (index 0)
    expect(overlays[0].clips.some((c) => c.id === imgClip.id)).toBe(true);

    // Move an audio clip to 'new-audio'
    let withAudio = addMedia(movedOverlay, M[MUS1], { at: 0 }).doc;
    const audioClip = withAudio.tracks.find((t) => t.kind === "audio")!.clips[0];
    const movedAudio = moveClip(withAudio, audioClip.id, { trackId: "new-audio", start: 2 });
    const audios = movedAudio.tracks.filter((t) => t.kind === "audio");
    expect(audios.length).toBe(2);
    // New audio track is at the bottom
    expect(audios[audios.length - 1].clips.some((c) => c.id === audioClip.id)).toBe(true);
  });

  it("moves video clips freely between Main track and Overlay tracks", () => {
    let d = docFromSpec(DEFAULT_SPEC, M[V1]);
    d = addMedia(d, M[V2]).doc;
    const mainClipsBefore = mainTrack(d).clips;
    expect(mainClipsBefore).toHaveLength(2);
    const clipToMove = mainClipsBefore[1];

    // Drag video from Main track to 'new-overlay'
    const movedToOverlay = moveClip(d, clipToMove.id, { trackId: "new-overlay", start: 2 });
    expect(mainTrack(movedToOverlay).clips).toHaveLength(1);
    const topOverlay = movedToOverlay.tracks.find((t) => t.kind === "overlay");
    expect(topOverlay).toBeDefined();
    expect(topOverlay!.clips[0].id).toBe(clipToMove.id);

    // Drag video back from Overlay track to Main track
    const movedBackToMain = moveClip(movedToOverlay, clipToMove.id, { trackId: mainTrack(d).id, index: 0 });
    expect(mainTrack(movedBackToMain).clips).toHaveLength(2);
    expect(mainTrack(movedBackToMain).clips[0].id).toBe(clipToMove.id);
  });

  it("supports hiding both main track (Video 1) and overlay tracks, omitting hidden clips from visual layers", () => {
    let d = setupMultiTrackDoc();
    const main = mainTrack(d);
    const overlay = d.tracks.find((t) => t.kind === "overlay")!;

    // Initial state: all visual layers present
    const initialVisuals = visualLayers(d);
    expect(initialVisuals.some((v) => v.clip.id === main.clips[0].id)).toBe(true);
    expect(initialVisuals.some((v) => v.clip.id === overlay.clips[0].id)).toBe(true);

    // Hide main track (Video 1)
    const hiddenMain = setTrack(d, main.id, { hidden: true });
    expect(mainTrack(hiddenMain).hidden).toBe(true);
    const visualsWithoutMain = visualLayers(hiddenMain);
    expect(visualsWithoutMain.some((v) => v.clip.id === main.clips[0].id)).toBe(false);
    expect(visualsWithoutMain.some((v) => v.clip.id === overlay.clips[0].id)).toBe(true);

    // Hide overlay track
    const hiddenOverlay = setTrack(hiddenMain, overlay.id, { hidden: true });
    const visualsHiddenBoth = visualLayers(hiddenOverlay);
    expect(visualsHiddenBoth.some((v) => v.clip.id === main.clips[0].id)).toBe(false);
    expect(visualsHiddenBoth.some((v) => v.clip.id === overlay.clips[0].id)).toBe(false);

    // Unhide main track
    const unhiddenMain = setTrack(hiddenOverlay, main.id, { hidden: false });
    expect(mainTrack(unhiddenMain).hidden).toBe(false);
    const visualsUnhiddenMain = visualLayers(unhiddenMain);
    expect(visualsUnhiddenMain.some((v) => v.clip.id === main.clips[0].id)).toBe(true);

    // eye and eyeOff icons are defined in PATHS
    expect(PATHS.eye).toBeDefined();
    expect(PATHS.eyeOff).toBeDefined();
    expect(PATHS.eyeOff).toContain("M1 1l22 22");
  });
});

