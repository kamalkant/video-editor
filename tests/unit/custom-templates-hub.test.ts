import { describe, expect, it } from "vitest";
import { docSchema, mainTrack, type MediaLite } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { customTemplateSchema, ratioOf, type CustomTemplate } from "@/lib/templates/custom";
import { customToBroadcast, legacyToBroadcast } from "@/lib/templates/hubTemplates";
import { BROADCAST_TEMPLATES, BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import { TEMPLATES } from "@/lib/templates";

const V = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const base16 = BROADCAST_TEMPLATES.find((t) => t.aspectRatio === "16:9")!;
const mine = (o: Partial<CustomTemplate> = {}): CustomTemplate =>
  customTemplateSchema.parse({ id: "33333333-3333-4333-8333-333333333333", name: "My show", category: "My Templates", aspectRatio: "16:9", baseId: base16.id, video: { assetId: V, name: "show.mov", duration: 12.4, width: 1920, height: 1080 }, audio: { assetId: A, name: "theme.mp3", duration: 30 }, createdAt: 1, ...o });

describe("your own templates in the library", () => {
  it("the ratio comes from the video", () => {
    expect(ratioOf(1920, 1080)).toBe("16:9");
    expect(ratioOf(1080, 1920)).toBe("9:16");
    expect(ratioOf(1080, 1080)).toBe("1:1");
    expect(ratioOf(1440, 1080)).toBe("16:9");
  });
  it("a saved template is a library card with its base look, its video's frame, and both files", () => {
    const t = customToBroadcast(mine());
    expect(t.id).toBe("custom-33333333-3333-4333-8333-333333333333");
    expect(t.category).toBe("My Templates");
    expect(t.duration).toBe(12);
    expect(t.previewImageUrl).toBe(`/api/videos/${V}/thumb`);
    expect(t.custom).toMatchObject({ video: { assetId: V }, audio: { assetId: A } });
    expect(t.slots.map((s) => s.trackKind)).toContain("audio");
    // the base look's titles and graphics, ready to customize like the base
    const d = t.build({ presenterName: "Asha Rao" });
    expect(docSchema.safeParse(d).success).toBe(true);
    expect(d.canvas.width / d.canvas.height).toBeCloseTo(16 / 9, 2);
    expect(JSON.stringify(d)).toEqual(JSON.stringify(base16.build({ presenterName: "Asha Rao" })));
  });
  it("with no base look: an empty project of the video's shape; using it puts the video first on Video 1 and the sound on an audio track", () => {
    const t = customToBroadcast(mine({ baseId: null, aspectRatio: "9:16", video: { assetId: V, name: "tall.mp4", duration: 5, width: 1080, height: 1920 } }));
    let d = t.build();
    expect(docSchema.safeParse(d).success).toBe(true);
    expect([d.canvas.width, d.canvas.height]).toEqual([1080, 1920]);
    const video: MediaLite = { id: V, kind: "video", fileName: "tall.mp4", width: 1080, height: 1920, fps: 30, duration: 5, hasAudio: false, suggestedKey: null, keyKind: null };
    const sound: MediaLite = { id: A, kind: "audio", fileName: "theme.mp3", width: 0, height: 0, fps: 0, duration: 30, hasAudio: true, suggestedKey: null, keyKind: null };
    // (what Studio's applyBroadcastTemplate does)
    d = addMedia(d, video, { index: 0 }).doc;
    d = addMedia(d, sound, { at: 0 }).doc;
    expect((mainTrack(d).clips[0] as { mediaId: string }).mediaId).toBe(V);
    expect(d.tracks.find((tr) => tr.kind === "audio")!.clips.some((c) => (c as { mediaId?: string }).mediaId === A)).toBe(true);
  });
  it("the starter templates show in the library too (the 24 broadcast ones stay 24)", () => {
    const starters = TEMPLATES.filter((t) => !BROADCAST_TEMPLATES_BY_ID.has(t.id)).map(legacyToBroadcast);
    expect(starters.length).toBeGreaterThanOrEqual(15);
    expect(BROADCAST_TEMPLATES.length).toBe(24);
    const hire = starters.find((t) => t.name === "We're hiring")!;
    expect(hire).toMatchObject({ category: "Business", aspectRatio: "9:16", previewBackdrop: true });
    const countdown = starters.find((t) => t.name === "Countdown intro")!;
    expect(countdown.category).toBe("YouTube");
    expect(new Set(starters.map((t) => t.id)).size).toBe(starters.length);
    for (const s of starters) expect(BROADCAST_TEMPLATES_BY_ID.has(s.id)).toBe(false);
  });
  it("a template's name and files are checked", () => {
    expect(() => mine({ name: "" })).toThrow();
    expect(() => mine({ video: { assetId: "not-an-id", name: "x", duration: 1 } })).toThrow();
  });
});
