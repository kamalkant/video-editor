// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { Timeline } from "@/components/studio/Timeline";
import { emptyDoc, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia } from "@/lib/edit/docEdit";
import { createClock } from "@/lib/editor/clock";

describe("Mobile Timeline Edit Toolbar", () => {
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

  const clock = createClock();

  function makeDoc(): TimelineDoc {
    return addMedia(emptyDoc(), { duration: 10, fps: 30, hasAudio: true } as any, { id: "v1" }).doc;
  }

  it("renders the mobile quick editing toolbar between preview and timeline tracks", () => {
    const doc = makeDoc();
    render(
      <Timeline
        doc={doc}
        media={{ m1: { duration: 10, fps: 30, hasAudio: true } } as any}
        clock={clock}
        selectedId="v1"
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onSplit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onPaste={null}
        onTrim={vi.fn()}
        onMove={vi.fn()}
        onDropMedia={vi.fn()}
        onDropFile={vi.fn()}
        onSetTrack={vi.fn()}
        onAddTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
      />
    );

    // Editing tools toolbar is present on mobile
    const toolbar = screen.getAllByRole("toolbar", { name: "Editing tools" })[0];
    expect(toolbar).toBeInTheDocument();

    // Verify key edit buttons exist
    expect(screen.getAllByRole("button", { name: "Split" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Duplicate" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Snapping" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Crop" })[0]).toBeInTheDocument();
  });

  it("triggers onSplit when tapping the Split button on mobile", () => {
    const doc = makeDoc();
    clock.set(2);
    const onSplit = vi.fn();
    render(
      <Timeline
        doc={doc}
        media={{ m1: { duration: 10, fps: 30, hasAudio: true } } as any}
        clock={clock}
        selectedId="v1"
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onSplit={onSplit}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onPaste={null}
        onTrim={vi.fn()}
        onMove={vi.fn()}
        onDropMedia={vi.fn()}
        onDropFile={vi.fn()}
        onSetTrack={vi.fn()}
        onAddTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
      />
    );

    const splitBtn = screen.getAllByRole("button", { name: "Split" })[0];
    fireEvent.click(splitBtn);
    expect(onSplit).toHaveBeenCalledWith("v1", 2);
  });
});
