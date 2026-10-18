// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { emptyDoc, docSchema, trackSchema, type TimelineDoc, type BlankClip } from "@/lib/edit/doc";
import { addBlank, addMedia, moveClip } from "@/lib/edit/docEdit";
import { RatioMenu } from "@/components/studio/RatioMenu";
import { Popover } from "@/components/ui/Popover";

describe("Blank clips on overlay tracks and Preview Toolbar", () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it("validates that a doc with a blank clip on an overlay track satisfies docSchema and trackSchema", () => {
    let d = emptyDoc();
    d = addBlank(d, 0, { id: "b1", fill: "#336699", duration: 5 }).doc;
    const overlayTrack = d.tracks.find((t) => t.kind === "overlay")!;

    // Move to overlay
    const movedDoc = moveClip(d, "b1", { trackId: overlayTrack.id, start: 2 });
    const clip = movedDoc.tracks.find((t) => t.id === overlayTrack.id)!.clips[0];

    expect(clip).toBeDefined();
    expect(clip.type).toBe("blank");
    expect((clip as any).start).toBe(2);

    // Validate against zod schemas
    expect(() => trackSchema.parse(movedDoc.tracks.find((t) => t.id === overlayTrack.id))).not.toThrow();
    expect(() => docSchema.parse(movedDoc)).not.toThrow();
  });

  it("allows blank clip to move to new-overlay and back to main track seamlessly", () => {
    let d = emptyDoc();
    d = addMedia(d, { id: "v1", duration: 10, fps: 30, hasAudio: true } as any, { id: "v1" }).doc;
    d = addBlank(d, 1, { id: "b1", fill: "#ff0055", duration: 4 }).doc;

    // Move to new-overlay
    const withNewOverlay = moveClip(d, "b1", { trackId: "new-overlay", start: 1.5 });
    const overlayTr = withNewOverlay.tracks.find((t) => t.clips.some((c) => c.id === "b1"))!;
    expect(overlayTr.kind).toBe("overlay");
    expect((overlayTr.clips[0] as any).start).toBe(1.5);

    // Move from overlay back to main track
    const mainTr = withNewOverlay.tracks.find((t) => t.kind === "main")!;
    const backOnMain = moveClip(withNewOverlay, "b1", { trackId: mainTr.id, index: 0 });
    const finalMain = backOnMain.tracks.find((t) => t.kind === "main")!;
    expect(finalMain.clips.map((c) => c.id)).toEqual(["b1", "v1"]);
  });

  it("renders RatioMenu and opens popover options when clicked", () => {
    const onCanvas = vi.fn();
    render(<RatioMenu canvas={{ width: 1900, height: 1080, fps: 30 }} onCanvas={onCanvas} />);

    const button = screen.getByRole("button", { name: /Aspect ratio/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");

    // Click to open popover
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    // Check popover content is visible
    expect(screen.getByText("Aspect ratio (project size)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "16:9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9:16" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1:1" })).toBeInTheDocument();
  });

  it("renders Background popover and opens options when clicked", () => {
    render(
      <Popover
        size="sm"
        label="Preview background"
        button={<span>Background: Checkerboard</span>}
      >
        <div data-testid="bg-options">Background Options Dialog</div>
      </Popover>
    );

    const button = screen.getByRole("button", { name: /Background: Checkerboard/i });
    expect(button).toBeInTheDocument();

    // Click to open
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("bg-options")).toBeInTheDocument();
  });
});
