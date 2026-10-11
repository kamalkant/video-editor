import { describe, expect, it } from "vitest";
import { docFromSpec, docSchema, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addTrack, setTrack } from "@/lib/edit/docEdit";
import { DEFAULT_SPEC } from "@/lib/edit/spec";
import { audioLayers } from "@/lib/render/compose";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const base = { fileName: "x", suggestedKey: "#11AE33", keyKind: "green" as const, path: "/tmp/fake.mp4" };
const M: Record<string, MediaLite & { path: string }> = {
  [V1]: { ...base, id: V1, kind: "video", width: 1280, height: 720, fps: 24, duration: 4, hasAudio: true },
  [V2]: { ...base, id: V2, kind: "video", width: 1280, height: 720, fps: 24, duration: 6, hasAudio: true },
};

describe("overlay track audio and mute support", () => {
  it("allows setting muted: true on overlay track and validates against schema", () => {
    let d: TimelineDoc = docFromSpec(DEFAULT_SPEC, M[V1]);
    d = addTrack(d, "overlay");
    const overlayTr = d.tracks.find((t) => t.kind === "overlay")!;
    expect(overlayTr).toBeDefined();

    d = setTrack(d, overlayTr.id, { muted: true });
    const updated = d.tracks.find((t) => t.id === overlayTr.id)!;
    expect("muted" in updated && updated.muted).toBe(true);

    const parseRes = docSchema.safeParse(d);
    expect(parseRes.success).toBe(true);
  });

  it("excludes overlay video audio from export audioLayers when overlay track is muted", () => {
    let d: TimelineDoc = docFromSpec(DEFAULT_SPEC, M[V1]);
    // add a video as overlay
    d = addMedia(d, M[V2], { overlay: true }).doc;
    const overlayTr = d.tracks.find((t) => t.kind === "overlay")!;
    expect(overlayTr.clips.length).toBe(1);

    // when not muted: audioLayers includes both main video and overlay video
    let sources = audioLayers(d, M);
    expect(sources.length).toBe(2);

    // when overlay track is muted: audioLayers includes only main video
    d = setTrack(d, overlayTr.id, { muted: true });
    sources = audioLayers(d, M);
    expect(sources.length).toBe(1);
    expect(sources[0]?.clip.mediaId).toBe(V1);
  });
});
