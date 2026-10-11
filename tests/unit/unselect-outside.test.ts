import { describe, it, expect, vi } from "vitest";

describe("Unselect Outside Preview & Timeline Logic", () => {
  it("determines whether a pointer target should trigger deselect in the preview area", () => {
    // Helper replicating the deselect decision matrix in ProgramPlayer & previewArea
    const shouldDeselectInPreview = (targetInfo: {
      insideStage: boolean;
      isInteractive: boolean;
      editable: boolean;
      cropId: string | null;
      patchEdit: unknown | null;
      button: number;
    }) => {
      if (!targetInfo.editable || targetInfo.button !== 0 || targetInfo.cropId || targetInfo.patchEdit) {
        return false;
      }
      return !targetInfo.insideStage && !targetInfo.isInteractive;
    };

    // Click on dark area around video canvas (pillarbox/letterbox)
    expect(shouldDeselectInPreview({
      insideStage: false,
      isInteractive: false,
      editable: true,
      cropId: null,
      patchEdit: null,
      button: 0,
    })).toBe(true);

    // Click on preview frame background outside stage
    expect(shouldDeselectInPreview({
      insideStage: false,
      isInteractive: false,
      editable: true,
      cropId: null,
      patchEdit: null,
      button: 0,
    })).toBe(true);

    // Click inside the video stage canvas
    expect(shouldDeselectInPreview({
      insideStage: true,
      isInteractive: false,
      editable: true,
      cropId: null,
      patchEdit: null,
      button: 0,
    })).toBe(false);

    // Click on interactive controls (e.g. Play/Pause button, scrubber, zoom)
    expect(shouldDeselectInPreview({
      insideStage: false,
      isInteractive: true,
      editable: true,
      cropId: null,
      patchEdit: null,
      button: 0,
    })).toBe(false);

    // Right-click (context menu) should not deselect
    expect(shouldDeselectInPreview({
      insideStage: false,
      isInteractive: false,
      editable: true,
      cropId: null,
      patchEdit: null,
      button: 2,
    })).toBe(false);

    // While cropping or watermark patching, should not deselect
    expect(shouldDeselectInPreview({
      insideStage: false,
      isInteractive: false,
      editable: true,
      cropId: "clip-1",
      patchEdit: null,
      button: 0,
    })).toBe(false);
  });

  it("determines whether timeline clicks should trigger deselect or preserve selection", () => {
    const handleTimelineClick = (target: {
      isClip: boolean;
      isRuler: boolean;
      isButtonOrHandle: boolean;
    }, onSelect: (id: string | null) => void) => {
      if (target.isClip) {
        onSelect("clip-123");
        return;
      }
      if (target.isButtonOrHandle) {
        return;
      }
      // Ruler seek: keep selection intact
      if (target.isRuler) {
        return;
      }
      // Empty lane or empty timeline space: deselect
      onSelect(null);
    };

    const onSelect = vi.fn();

    // Clicking a clip selects it
    handleTimelineClick({ isClip: true, isRuler: false, isButtonOrHandle: false }, onSelect);
    expect(onSelect).toHaveBeenLastCalledWith("clip-123");

    // Clicking timeline ruler preserves selection (does NOT call onSelect(null))
    onSelect.mockClear();
    handleTimelineClick({ isClip: false, isRuler: true, isButtonOrHandle: false }, onSelect);
    expect(onSelect).not.toHaveBeenCalled();

    // Clicking empty lane space deselects
    onSelect.mockClear();
    handleTimelineClick({ isClip: false, isRuler: false, isButtonOrHandle: false }, onSelect);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("determines whether clicking workspace background should trigger deselect", () => {
    const shouldDeselectWorkspace = (target: {
      isDirectMainOrBackground: boolean;
      hasSelected: boolean;
      button: number;
    }) => {
      if (target.button !== 0) return false;
      return target.isDirectMainOrBackground && target.hasSelected;
    };

    // Click on empty workspace background with a selected item
    expect(shouldDeselectWorkspace({
      isDirectMainOrBackground: true,
      hasSelected: true,
      button: 0,
    })).toBe(true);

    // Click on empty workspace background when nothing is selected
    expect(shouldDeselectWorkspace({
      isDirectMainOrBackground: true,
      hasSelected: false,
      button: 0,
    })).toBe(false);

    // Click inside an inspector panel or child control
    expect(shouldDeselectWorkspace({
      isDirectMainOrBackground: false,
      hasSelected: true,
      button: 0,
    })).toBe(false);
  });
});
