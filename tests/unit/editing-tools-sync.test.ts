import { describe, expect, it } from "vitest";
import { getEditingTools } from "@/lib/editor/editingTools";
import type { TimelineDoc } from "@/lib/edit/doc";

function makeDoc(): TimelineDoc {
  return {
    canvas: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        id: "main-track",
        kind: "main",
        clips: [
          { id: "vid-1", type: "video", mediaId: "m-1", in: 0, out: 5 },
          { id: "vid-2", type: "video", mediaId: "m-2", in: 0, out: 5 },
        ],
      },
      {
        id: "overlay-track",
        kind: "overlay",
        clips: [
          { id: "img-1", type: "image", mediaId: "m-img", start: 1, duration: 3 },
          { id: "txt-1", type: "text", text: "Hello", start: 6, duration: 2 },
        ],
      },
    ],
  } as unknown as TimelineDoc;
}

describe("getEditingTools synchronization", () => {
  const media = {
    "m-1": { hasAudio: true, fileName: "clip1.mp4" },
    "m-2": { hasAudio: false, fileName: "clip2.mp4" },
    "m-img": { fileName: "photo.png" },
  };

  it("when no clip is selected, but playhead is over main video clip with clearance", () => {
    const doc = makeDoc();
    // At t=2.0s, on vid-1 (0 to 5s)
    const tools = getEditingTools(doc, null, 2.0, media, 30);

    expect(tools.selected).toBeNull();
    expect(tools.target).not.toBeNull();
    expect(tools.target?.clip.id).toBe("vid-1");

    // Timeline and Edit menubar are synchronized:
    expect(tools.canSplit).toBe(true);
    expect(tools.canTrim).toBe(true);
    expect(tools.canTrimStart).toBe(true);
    expect(tools.canTrimEnd).toBe(true);
    expect(tools.canFreeze).toBe(true);

    // Selection-dependent tools are all disabled on BOTH timeline and edit menu
    expect(tools.canDelete).toBe(false);
    expect(tools.canDuplicate).toBe(false);
    expect(tools.canCrop).toBe(false);
    expect(tools.canSpeed).toBe(false);
    expect(tools.canReverse).toBe(false);
    expect(tools.canMask).toBe(false);
    expect(tools.canSilences).toBe(false);
    expect(tools.canKeyframe).toBe(false);
  });

  it("when no clip is selected and playhead is at empty time", () => {
    const doc = makeDoc();
    // Total duration is 10s. At t=15s, no clip is under playhead
    const tools = getEditingTools(doc, null, 15.0, media, 30);

    expect(tools.selected).toBeNull();
    expect(tools.target).toBeNull();

    expect(tools.canSplit).toBe(false);
    expect(tools.canTrim).toBe(false);
    expect(tools.canTrimStart).toBe(false);
    expect(tools.canTrimEnd).toBe(false);
    expect(tools.canFreeze).toBe(false);
    expect(tools.canDelete).toBe(false);
    expect(tools.canDuplicate).toBe(false);
    expect(tools.canCrop).toBe(false);
    expect(tools.canSpeed).toBe(false);
    expect(tools.canReverse).toBe(false);
    expect(tools.canMask).toBe(false);
    expect(tools.canSilences).toBe(false);
    expect(tools.canKeyframe).toBe(false);
  });

  it("when a video clip is selected and playhead is on it", () => {
    const doc = makeDoc();
    const tools = getEditingTools(doc, "vid-1", 2.0, media, 30);

    expect(tools.selected?.clip.id).toBe("vid-1");
    expect(tools.target?.clip.id).toBe("vid-1");

    expect(tools.canSplit).toBe(true);
    expect(tools.canTrim).toBe(true);
    expect(tools.canTrimStart).toBe(true);
    expect(tools.canTrimEnd).toBe(true);
    expect(tools.canDelete).toBe(true);
    expect(tools.canDuplicate).toBe(true);
    expect(tools.canCrop).toBe(true);
    expect(tools.canSpeed).toBe(true);
    expect(tools.canReverse).toBe(true);
    expect(tools.canFreeze).toBe(true);
    expect(tools.canMask).toBe(true);
    expect(tools.canSilences).toBe(true); // m-1 has audio
    expect(tools.canKeyframe).toBe(true);
  });

  it("when a video clip is selected but playhead is elsewhere (outside clip)", () => {
    const doc = makeDoc();
    // vid-1 is from 0 to 5s. Playhead is at t=8s (over vid-2)
    const tools = getEditingTools(doc, "vid-1", 8.0, media, 30);

    expect(tools.selected?.clip.id).toBe("vid-1");
    // Target defaults to main clip at playhead (vid-2) since selected is not under playhead
    expect(tools.target?.clip.id).toBe("vid-2");

    // Keyframe for selected clip is disabled because playhead is not on vid-1
    expect(tools.canKeyframe).toBe(false);

    // Selected clip operations remain enabled
    expect(tools.canDelete).toBe(true);
    expect(tools.canDuplicate).toBe(true);
    expect(tools.canCrop).toBe(true);
    expect(tools.canSpeed).toBe(true);
    expect(tools.canReverse).toBe(true);
    expect(tools.canMask).toBe(true);
    expect(tools.canSilences).toBe(true);
  });

  it("when selected clip is on a locked track", () => {
    const doc = makeDoc();
    doc.tracks[0].locked = true;
    const tools = getEditingTools(doc, "vid-1", 2.0, media, 30);

    expect(tools.isLocked).toBe(true);
    expect(tools.canSplit).toBe(false);
    expect(tools.canTrim).toBe(false);
    expect(tools.canTrimStart).toBe(false);
    expect(tools.canTrimEnd).toBe(false);
    expect(tools.canDelete).toBe(false);
    expect(tools.canDuplicate).toBe(false);
    expect(tools.canCrop).toBe(false);
    expect(tools.canSpeed).toBe(false);
    expect(tools.canReverse).toBe(false);
    expect(tools.canFreeze).toBe(false);
    expect(tools.canMask).toBe(false);
    expect(tools.canSilences).toBe(false);
    expect(tools.canKeyframe).toBe(false);
  });

  it("when selected clip is an image clip", () => {
    const doc = makeDoc();
    // img-1 is overlay from 1 to 4s. Playhead at 2s
    const tools = getEditingTools(doc, "img-1", 2.0, media, 30);

    expect(tools.selected?.clip.id).toBe("img-1");
    expect(tools.canCrop).toBe(true);
    expect(tools.canMask).toBe(true);
    expect(tools.canKeyframe).toBe(true);

    // Image clips cannot speed, reverse, or have silences detected
    expect(tools.canSpeed).toBe(false);
    expect(tools.canReverse).toBe(false);
    expect(tools.canSilences).toBe(false);
  });

  it("when selected clip is a text clip", () => {
    const doc = makeDoc();
    // txt-1 is overlay from 6 to 8s. Playhead at 7s
    const tools = getEditingTools(doc, "txt-1", 7.0, media, 30);

    expect(tools.selected?.clip.id).toBe("txt-1");
    expect(tools.canCrop).toBe(false);
    expect(tools.canSpeed).toBe(false);
    expect(tools.canReverse).toBe(false);
    expect(tools.canMask).toBe(false);
    expect(tools.canSilences).toBe(false);
    expect(tools.canKeyframe).toBe(true); // text can have motion keyframes
  });
});
