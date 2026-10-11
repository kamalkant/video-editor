import { describe, expect, it } from "vitest";
import { docFromSpec, mainTrack, type MediaLite, type TimelineDoc, type VideoClip } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { docReducer, type DocState } from "@/lib/editor/docReducer";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { placeClip } from "@/lib/player/look";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const base = { fileName: "test.mp4", suggestedKey: null, keyKind: null };

const M: Record<string, MediaLite> = {
  [V1]: { ...base, id: V1, kind: "video", width: 1920, height: 1080, fps: 30, duration: 10, hasAudio: true },
  [V2]: { ...base, id: V2, kind: "video", width: 1920, height: 1080, fps: 30, duration: 10, hasAudio: true },
};

function setup16x9Doc(): DocState {
  let doc = docFromSpec(DEFAULT_SPEC, M[V1]);
  doc = {
    ...doc,
    canvas: { width: 1920, height: 1080, fps: 30, background: "transparent" },
  };
  return { doc, media: M };
}

describe("Canvas Aspect Ratio & Fit Height (16:9 to 9:16)", () => {
  it("automatically updates Main track clips to fill height when switching from 16:9 to 9:16", () => {
    const s0 = setup16x9Doc();
    const clip0 = mainTrack(s0.doc).clips[0] as VideoClip;
    expect(clip0.transform.fit).toBe("fit");

    // Switch to 9:16 (1080 x 1920)
    const s1 = docReducer(s0, {
      type: "setCanvas",
      patch: { width: 1080, height: 1920 },
    });

    expect(s1.doc.canvas.width).toBe(1080);
    expect(s1.doc.canvas.height).toBe(1920);
    expect(s1.doc.canvas.fit).toBe("fill");

    const clip1 = mainTrack(s1.doc).clips[0] as VideoClip;
    expect(clip1.transform.fit).toBe("fill");
  });

  it("verifies placeClip geometry: fill covers 100% of 9:16 height, whereas fit leaves blank space", () => {
    // 16:9 video (1920 x 1080) on 9:16 canvas (1080 x 1920)
    const fitLayout = placeClip(1920, 1080, 1080, 1920, { fit: "fit", x: 0, y: 0, scale: 1 });
    expect(fitLayout.w).toBe(1080);
    expect(fitLayout.h).toBeCloseTo(607.5, 1); // leaves blank space above and below!

    const fillLayout = placeClip(1920, 1080, 1080, 1920, { fit: "fill", x: 0, y: 0, scale: 1 });
    expect(fillLayout.h).toBe(1920); // Fills 100% of canvas height!
    expect(fillLayout.w).toBeCloseTo(3413.33, 1); // centered horizontally
  });

  it("allows toggling Canvas Fit between 'fit' and 'fill' via Project settings", () => {
    const s0 = setup16x9Doc();
    // Explicitly toggle to fill
    const s1 = docReducer(s0, {
      type: "setCanvas",
      patch: { fit: "fill" },
    });
    expect(s1.doc.canvas.fit).toBe("fill");
    expect((mainTrack(s1.doc).clips[0] as VideoClip).transform.fit).toBe("fill");

    // Toggle back to fit
    const s2 = docReducer(s1, {
      type: "setCanvas",
      patch: { fit: "fit" },
    });
    expect(s2.doc.canvas.fit).toBe("fit");
    expect((mainTrack(s2.doc).clips[0] as VideoClip).transform.fit).toBe("fit");
  });

  it("preserves overlay tracks unless applyToAllTracks is requested", () => {
    let s0 = setup16x9Doc();
    // Add an overlay clip
    s0 = {
      ...s0,
      doc: addMedia(s0.doc, M[V2], { overlay: true, at: 0 }).doc,
    };
    const overlayTrack = s0.doc.tracks.find((t) => t.kind === "overlay")!;
    expect((overlayTrack.clips[0] as VideoClip).transform.fit).toBe("fit");

    // Switch to 9:16 with default (applyToAllTracks = false)
    const s1 = docReducer(s0, {
      type: "setCanvas",
      patch: { width: 1080, height: 1920 },
    });
    const overlayTrack1 = s1.doc.tracks.find((t) => t.kind === "overlay")!;
    // Main track is fill, overlay remains fit
    expect((mainTrack(s1.doc).clips[0] as VideoClip).transform.fit).toBe("fill");
    expect((overlayTrack1.clips[0] as VideoClip).transform.fit).toBe("fit");

    // Now switch with applyToAllTracks = true
    const s2 = docReducer(s1, {
      type: "setCanvas",
      patch: { fit: "fill", applyToAllTracks: true },
    });
    const overlayTrack2 = s2.doc.tracks.find((t) => t.kind === "overlay")!;
    expect((overlayTrack2.clips[0] as VideoClip).transform.fit).toBe("fill");
  });

  it("sets newly added videos to fill when canvas is 9:16 vertical or canvas.fit is fill", () => {
    const s0 = setup16x9Doc();
    const s1 = docReducer(s0, {
      type: "setCanvas",
      patch: { width: 1080, height: 1920, fit: "fill" },
    });

    const withNewVideo = addMedia(s1.doc, M[V2]);
    const addedClip = withNewVideo.doc.tracks
      .find((t) => t.kind === "main")!
      .clips.find((c) => c.id === withNewVideo.clipId) as VideoClip;

    expect(addedClip).toBeDefined();
    expect(addedClip.transform.fit).toBe("fill");
  });
});
