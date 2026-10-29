import { describe, expect, it } from "vitest";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, setClip } from "@/lib/edit/docEdit";
import { EncoderFailure, LocalExportUnavailable, NeedsPage, pageOnly } from "@/lib/export/localExport";
import { errorOfStop, plainMeta, stopKindOf } from "@/lib/export/worker/protocol";

/** The export's pictures are made in a Worker; the page keeps the sound and the file (lib/export/worker). */
const V = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const vid = (id: string): MediaLite => ({ id, kind: "video", fileName: "v.mp4", width: 1920, height: 1080, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null });
const media = { [V]: vid(V), [B]: vid(B) };
const one = (): TimelineDoc => addMedia({ ...emptyDoc(), canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" } }, vid(V), { id: "v1" }).doc;

describe("what only the page can make", () => {
  it("a plain timeline: the Worker", () => {
    expect(pageOnly(one(), media)).toBe(false);
  });
  it("a reversed clip or a backdrop video seek a <video>: the page", () => {
    expect(pageOnly(setClip(one(), "v1", { reversed: true }), media)).toBe(true);
    expect(pageOnly({ ...one(), canvas: { ...one().canvas, backdrop: { kind: "media", mediaId: B } } } as TimelineDoc, media)).toBe(true);
  });
});

describe("the Worker's messages", () => {
  it("the encoder's metadata travels as plain data (bytes copied, the color space as values)", () => {
    const description = new Uint8Array([1, 100, 0, 40, 255]);
    const colorSpace = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false, toJSON: () => ({}) };
    const m = plainMeta({ decoderConfig: { codec: "avc1.640028", codedWidth: 1920, codedHeight: 1080, description: description.subarray(1, 4), colorSpace: colorSpace as unknown as VideoColorSpaceInit } });
    expect(m?.decoderConfig?.codec).toBe("avc1.640028");
    expect([...new Uint8Array(m!.decoderConfig!.description!)]).toEqual([100, 0, 40]);
    expect(m?.decoderConfig?.colorSpace).toEqual({ primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false });
    // (structured-clone safe: no functions left)
    expect(() => structuredClone(m)).not.toThrow();
    expect(plainMeta(undefined)).toBeUndefined();
    expect(plainMeta({})).toBeUndefined();
  });

  it("a stop comes back as the page's error: encoder → software again, needs-page → the page, canceled stays canceled", () => {
    for (const e of [new NeedsPage("x"), new EncoderFailure("y"), new Error("Export canceled."), new Error("z")]) {
      const back = errorOfStop(stopKindOf(e), e.message);
      expect(back.message).toBe(e.message);
      if (e instanceof EncoderFailure) expect(back).toBeInstanceOf(EncoderFailure);
      else if (e.message === "Export canceled.") expect(back).not.toBeInstanceOf(NeedsPage);
      // anything else in the Worker: made on the page (the Worker is never why an export fails)
      else expect(back).toBeInstanceOf(NeedsPage);
    }
    // (made on the page, not sent to the server)
    expect(new NeedsPage("x")).not.toBeInstanceOf(LocalExportUnavailable);
  });
});

describe("when the Worker makes the pictures", () => {
  it("by default only in parts (one Worker alone was slower than the page); 'on' always; 'off' never", async () => {
    const { usesWorker } = await import("@/lib/export/worker/client");
    expect(usesWorker("auto", 1)).toBe(false);
    expect(usesWorker("auto", 2)).toBe(true);
    expect(usesWorker("on", 1)).toBe(true);
    expect(usesWorker("off", 4)).toBe(false);
  });
});
