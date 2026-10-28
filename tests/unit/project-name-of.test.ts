import { describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, videoClipOf, type MediaLite } from "@/lib/edit/doc";
import { projectNameOf } from "@/lib/projects/model";

/** A new project is named after its first video or picture ("Goa trip"), not "Untitled project" every time. */
describe("projectNameOf", () => {
  const V = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const media: Record<string, MediaLite> = { [V]: { id: V, kind: "video", fileName: "Goa_trip.mp4", width: 640, height: 360, fps: 30, duration: 20, hasAudio: true, suggestedKey: null, keyKind: null } };

  it("is the first video's file name", () => {
    const d = emptyDoc();
    mainTrack(d).clips.push(videoClipOf("v1", media[V], [], 0, 5) as never);
    expect(projectNameOf(d, media)).toBe("Goa trip");
  });
  it("is Untitled project without one", () => {
    expect(projectNameOf(emptyDoc(), media)).toBe("Untitled project");
    const d = emptyDoc();
    mainTrack(d).clips.push(videoClipOf("v1", media[V], [], 0, 5) as never);
    expect(projectNameOf(d, {})).toBe("Untitled project");
  });
});
