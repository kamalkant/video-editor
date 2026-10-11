// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addTrack, setClip } from "@/lib/edit/docEdit";
import { docTransitions, docTransitionsAt } from "@/lib/player/transitions";
import { ContextMenu } from "@/components/ui/ContextMenu";

const A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const lite = (id: string): MediaLite => ({
  id,
  kind: "video",
  fileName: id,
  width: 320,
  height: 180,
  fps: 24,
  duration: 4,
  hasAudio: true,
  suggestedKey: null,
  keyKind: null,
});

describe("overlay track transitions", () => {
  it("computes transitions between adjacent overlapping clips on an overlay track", () => {
    let d: TimelineDoc = emptyDoc();
    d = addTrack(d, "overlay");
    const overlayTrack = d.tracks.find((t) => t.kind === "overlay")!;

    // Place clip 1 at start 0, length 4
    d = addMedia(d, lite(A), { id: "ov1", trackId: overlayTrack.id, at: 0, overlay: true }).doc;
    // Place clip 2 at start 4 (abutting), length 4 - stays on same track
    d = addMedia(d, lite(B), { id: "ov2", trackId: overlayTrack.id, at: 4, overlay: true }).doc;
    // Set transitionIn on clip 2 and shift start to 3.5 (overlapping by 0.5s)
    d = setClip(d, "ov2", { transitionIn: { type: "crossfade", duration: 0.5 }, start: 3.5 });

    const trans = docTransitions(d);
    expect(trans.has("ov2")).toBe(true);
    expect(trans.get("ov2")?.in).toEqual({
      type: "crossfade",
      s: 3.5,
      d: 0.5,
    });
    expect(trans.has("ov1")).toBe(true);
    expect(trans.get("ov1")?.out).toEqual({
      type: "crossfade",
      s: 3.5,
      d: 0.5,
    });

    // Test transition state at t = 3.75 (midpoint of transition)
    const st = docTransitionsAt(d, 3.75);
    expect(st.states.has("ov1")).toBe(true);
    expect(st.states.has("ov2")).toBe(true);

    const outState = st.states.get("ov1")!;
    const inState = st.states.get("ov2")!;
    // In crossfade, incoming clip fades in over outgoing clip
    expect(outState.alpha).toBe(1);
    expect(inState.alpha).toBeCloseTo(0.5, 2);
  });

  it("handles push/slide transitions on overlay tracks", () => {
    let d: TimelineDoc = emptyDoc();
    d = addTrack(d, "overlay");
    const overlayTrack = d.tracks.find((t) => t.kind === "overlay")!;

    d = addMedia(d, lite(A), { id: "ov1", trackId: overlayTrack.id, at: 1, overlay: true }).doc;
    d = addMedia(d, lite(B), { id: "ov2", trackId: overlayTrack.id, at: 5, overlay: true }).doc;
    d = setClip(d, "ov2", { transitionIn: { type: "slideLeft", duration: 1 }, start: 4 });

    // Midpoint at t = 4.5
    const st = docTransitionsAt(d, 4.5);
    expect(st.states.has("ov2")).toBe(true);
    const inState = st.states.get("ov2")!;
    expect(inState.dx).toBeDefined();
    // At 50% slideLeft, incoming clip is halfway in from the right
    expect(inState.dx).toBeCloseTo(0.5, 1);
  });
});

describe("context menu styling", () => {
  it("renders with comfortable desktop dimensions, padding, and font size", () => {
    render(
      <ContextMenu
        x={100}
        y={100}
        label="Test Menu"
        onClose={() => {}}
        items={[
          { label: "Split here", shortcut: "S", onSelect: () => {} },
          "separator",
          { label: "Delete", shortcut: "Del", onSelect: () => {} },
        ]}
      />
    );

    const menu = screen.getByRole("menu", { name: "Test Menu" });
    expect(menu.className).toContain("text-[13px]");
    expect(menu.className).toContain("p-1");

    const buttons = screen.getAllByRole("menuitem");
    expect(buttons.length).toBe(2);
    expect(buttons[0].className).toContain("px-2.5");
    expect(buttons[0].className).toContain("py-1.5");
    expect(buttons[0].className).toContain("gap-2");
    expect(buttons[0].className).toContain("text-[13px]");
  });
});

