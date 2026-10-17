// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { emptyDoc, mainTrack, type Backdrop, type AnyClip, type BlankClip } from "@/lib/edit/doc";
import { addBlank } from "@/lib/edit/docEdit";
import { docReducer } from "@/lib/editor/docReducer";
import { notifyAiKeyError } from "@/lib/editor/useGemini";
import { ELEMENT_DRAG, TEXT_DRAG } from "@/lib/editor/mediaDrag";
import { elementPreset, elementClipOf } from "@/lib/elements/catalog";
import { textClipOfStyle } from "@/lib/text/layout";
import { moveClip } from "@/lib/edit/docEdit";

describe("Timeline Brand Kit Logo, Background Layer, Drag & Drop, and AI Alerts", () => {
  it("creates a blank clip with backdrop on the timeline", () => {
    const doc = emptyDoc();
    const gradientBd: Backdrop = {
      kind: "gradient",
      from: "#1e1b4b",
      to: "#0f172a",
      angle: 135,
    };

    const res = addBlank(doc, 0, { duration: 6, backdrop: gradientBd });
    expect(res.clipId).toBeDefined();

    const blank = mainTrack(res.doc).clips[0] as BlankClip;
    expect(blank).toBeDefined();
    expect(blank.type).toBe("blank");
    expect(blank.duration).toBe(6);
    expect(blank.backdrop).toEqual(gradientBd);
  });

  it("handles addBlank with backdrop in docReducer", () => {
    const doc = emptyDoc();
    const setBd: Backdrop = { kind: "set", id: "newsroom" };

    const state = docReducer(
      { doc, media: {} },
      { type: "addBlank", index: 0, duration: 8, backdrop: setBd },
    );

    const blank = mainTrack(state.doc).clips[0] as BlankClip;
    expect(blank).toBeDefined();
    expect(blank.type).toBe("blank");
    expect(blank.duration).toBe(8);
    expect(blank.backdrop).toEqual(setBd);
  });

  it("adds text to a preferred timeline overlay track via docEdit and docReducer", () => {
    const doc = emptyDoc();
    const overlayTrackId = doc.tracks.find((t) => t.kind === "overlay")?.id;
    expect(overlayTrackId).toBeDefined();

    const textClip = textClipOfStyle("title");
    const state = docReducer(
      { doc, media: {} },
      { type: "addText", clip: textClip, at: 2.5, trackId: overlayTrackId },
    );

    const track = state.doc.tracks.find((t) => t.id === overlayTrackId);
    expect(track?.clips.length).toBe(1);
    expect(track?.clips[0].type).toBe("text");
    expect((track?.clips[0] as any).start).toBe(2.5);
  });

  it("adds element to a preferred timeline overlay track via docEdit and docReducer", () => {
    const doc = emptyDoc();
    const overlayTrackId = doc.tracks.find((t) => t.kind === "overlay")?.id;
    const preset = elementPreset("arrow")!;
    const elClip = elementClipOf(preset, doc.canvas, 10);

    const state = docReducer(
      { doc, media: {} },
      { type: "addElement", clip: elClip, at: 1.0, trackId: overlayTrackId },
    );

    const track = state.doc.tracks.find((t) => t.id === overlayTrackId);
    expect(track?.clips.length).toBe(1);
    expect(track?.clips[0].type).toBe("element");
    expect((track?.clips[0] as any).start).toBe(1.0);
  });

  it("lifts cutout main track video to overlay when placing background underneath", () => {
    const doc = emptyDoc();
    // Simulate a video on main track
    const vidId = "v_test";
    const videoClip: AnyClip = {
      id: vidId,
      type: "video",
      mediaId: "m_cutout",
      in: 0,
      out: 10,
      ops: [],
      transform: { fit: "fit", x: 0, y: 0, scale: 1 },
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    };

    const docWithVideo = {
      ...doc,
      tracks: doc.tracks.map((t) =>
        t.kind === "main" ? { ...t, clips: [videoClip] } : t,
      ),
    };

    // Move main clip to new-overlay
    const moved = moveClip(docWithVideo, vidId, {
      trackId: "new-overlay",
      start: 0,
    });
    expect(moved.tracks.find((t) => t.kind === "main")?.clips.length).toBe(0);

    // Place background on main track
    const withBg = addBlank(moved, 0, {
      duration: 10,
      backdrop: { kind: "set", id: "podcast" },
    });
    expect(withBg.doc.tracks.find((t) => t.kind === "main")?.clips.length).toBe(1);
    expect(
      withBg.doc.tracks
        .filter((t) => t.kind === "overlay")
        .some((t) => t.clips.some((c) => c.id === vidId)),
    ).toBe(true);
  });

  it("dispatches VDO:ai-key-error event via notifyAiKeyError", () => {
    const listener = vi.fn();
    window.addEventListener("VDO:ai-key-error", listener);

    notifyAiKeyError("API key expired", "Key Error");

    expect(listener).toHaveBeenCalled();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.message).toBe("API key expired");
    expect(event.detail.title).toBe("Key Error");

    window.removeEventListener("VDO:ai-key-error", listener);
  });

  it("verifies universal drag-and-drop constants are exported", () => {
    expect(ELEMENT_DRAG).toBe("application/x-vdo-element");
    expect(TEXT_DRAG).toBe("application/x-vdo-text");
  });
});
