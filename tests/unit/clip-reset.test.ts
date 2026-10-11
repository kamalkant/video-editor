import { describe, expect, it } from "vitest";
import { imageClipOf, videoClipOf, type MediaLite, type VideoClip } from "@/lib/edit/doc";
import { changedAreas, resetAllPatch, resetPatch } from "@/lib/editor/clipReset";
import { stateForVideo } from "@/lib/editor/studioReducer";

const m: MediaLite = { id: "00000000-0000-4000-8000-000000000001", kind: "video", fileName: "a.mp4", width: 1280, height: 720, fps: 30, duration: 10, hasAudio: true, suggestedKey: "#12AF34", keyKind: "green" };
const fresh = () => {
  const s = stateForVideo(null, m.suggestedKey, { width: 1280, fps: 30, duration: 10 }, false);
  return videoClipOf("c1", m, s.spec.ops, 1, 6);
};

describe("clip reset", () => {
  it("a fresh clip has nothing to reset", () => {
    expect(changedAreas(fresh(), m).size).toBe(0);
    expect(changedAreas(imageClipOf("p1", { ...m, kind: "image" })).size).toBe(0);
  });

  it("green removal on → Cutout changed; Reset turns it off and keeps the clip's own key", () => {
    const c = fresh();
    const on: VideoClip = { ...c, ops: c.ops.map((o) => (o.type === "chromaKey" ? { ...o, enabled: true, params: { ...o.params, similarity: 0.9 } } : o)) };
    expect([...changedAreas(on, m)]).toEqual(["background"]);
    const back = { ...on, ...resetPatch(on, "background", m) } as VideoClip;
    expect(back.ops.every((o) => !o.enabled)).toBe(true);
    expect(back.ops.find((o) => o.type === "chromaKey")?.params.keyColor.toUpperCase()).toBe("#12AF34");
    expect(changedAreas(back, m).size).toBe(0);
  });

  it("one tab resets alone; Reset all keeps the trim", () => {
    const c: VideoClip = { ...fresh(), volume: 0.4, speed: 2, color: { brightness: 0.2, contrast: 1, saturation: 1, temperature: 0 }, transform: { fit: "fill", x: 0.1, y: 0, scale: 1.5, rotation: 0 } };
    expect([...changedAreas(c, m)].sort()).toEqual(["audio", "basic", "color", "speed"]);
    const audioOnly = { ...c, ...resetPatch(c, "audio", m) } as VideoClip;
    expect(audioOnly.volume).toBe(1);
    expect(audioOnly.speed).toBe(2);
    const all = { ...c, ...resetAllPatch(c, m) } as VideoClip;
    expect(changedAreas(all, m).size).toBe(0);
    expect([all.in, all.out]).toEqual([1, 6]);
  });

  it("a slider moved back to its start is not a change", () => {
    const c: VideoClip = { ...fresh(), transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0, flipX: false } };
    expect(changedAreas(c, m).size).toBe(0);
  });
});
