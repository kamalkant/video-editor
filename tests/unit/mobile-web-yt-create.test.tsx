// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MobileStudioLayout } from "@/components/studio/mobile/MobileStudioLayout";
import { MobileBottomToolbar } from "@/components/studio/mobile/MobileBottomToolbar";
import { MobileTopBar } from "@/components/studio/mobile/MobileTopBar";
import { MobileProjectSheet } from "@/components/studio/mobile/sheets/MobileProjectSheet";
import { emptyDoc } from "@/lib/edit/doc";
import { createClock } from "@/lib/editor/clock";

describe("Mobile Web YT Create Polish & Fixes", () => {
  afterEach(() => {
    cleanup();
  });

  const clock = createClock();
  const doc = emptyDoc();

  it("1. Choose file / File input: renders file input and Add Media button triggers onChoose", () => {
    const onChoose = vi.fn();
    const mockFileInput = <input type="file" data-testid="test-mobile-file-input" />;

    render(
      <MobileStudioLayout
        doc={doc}
        clock={clock}
        media={[]}
        selectedId={null}
        activeTab={null}
        previewArea={<div>Preview</div>}
        timeline={<div>Timeline</div>}
        fileInput={mockFileInput}
        onChoose={onChoose}
      />
    );

    // Verify file input is in the DOM
    expect(screen.getByTestId("test-mobile-file-input")).toBeInTheDocument();

    // Verify Add Media button triggers onChoose
    const addMediaBtn = screen.getByRole("button", { name: /Add Media/i });
    expect(addMediaBtn).toBeInTheDocument();
    fireEvent.click(addMediaBtn);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("2. Mobile TopBar & Project Sheet: allows opening project sheet, switching projects, and creating new", () => {
    const onOpenProjects = vi.fn();

    render(
      <MobileTopBar
        projectName="Vlog Project #1"
        saveState="saved"
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onHome={vi.fn()}
        onExport={vi.fn()}
        onOpenProjects={onOpenProjects}
      />
    );

    const projectDropdown = screen.getByRole("button", { name: /Switch project/i });
    expect(projectDropdown).toBeInTheDocument();
    expect(screen.getByText("Vlog Project #1")).toBeInTheDocument();

    fireEvent.click(projectDropdown);
    expect(onOpenProjects).toHaveBeenCalledTimes(1);

    cleanup();

    // Now test MobileProjectSheet directly
    const onOpen = vi.fn();
    const onNew = vi.fn();
    const onNewBlank = vi.fn();
    const onRename = vi.fn();

    const mockProjects = [
      { id: "proj-1", name: "Summer Trip", updatedAt: Date.now() - 60000, duration: 45 },
      { id: "proj-2", name: "Tutorial Video", updatedAt: Date.now() - 3600000, duration: 120 },
    ];

    render(
      <MobileProjectSheet
        isOpen={true}
        onClose={vi.fn()}
        currentId="proj-1"
        currentName="Summer Trip"
        projects={mockProjects as any}
        onOpen={onOpen}
        onNew={onNew}
        onNewBlank={onNewBlank}
        onRename={onRename}
      />
    );

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getAllByText("Summer Trip").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tutorial Video")).toBeInTheDocument();

    // Tap on Tutorial Video to switch
    fireEvent.click(screen.getByText("Tutorial Video"));
    expect(onOpen).toHaveBeenCalledWith("proj-2");

    // Tap New Project
    fireEvent.click(screen.getByRole("button", { name: "New Project" }));
    expect(onNew).toHaveBeenCalled();
  });

  it("3. YouTube Create Dual-Mode Toolbar: switches between Creation Mode and Clip Action Mode", () => {
    const onSelectTab = vi.fn();
    const onDeselectClip = vi.fn();
    const onSplit = vi.fn();
    const onDelete = vi.fn();
    const onCrop = vi.fn();
    const onDuplicate = vi.fn();

    // Mode A: Creation Mode (selectedId == null)
    const { rerender } = render(
      <MobileBottomToolbar
        activeTab={null}
        onSelectTab={onSelectTab}
        selectedId={null}
        onDeselectClip={onDeselectClip}
        onAddMedia={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Add Media/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Audio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

    // Mode B: Clip Selected Mode (selectedId != null)
    rerender(
      <MobileBottomToolbar
        activeTab={null}
        onSelectTab={onSelectTab}
        selectedId="clip-123"
        onDeselectClip={onDeselectClip}
        onAddMedia={vi.fn()}
        onSplit={onSplit}
        onDelete={onDelete}
        onCrop={onCrop}
        onDuplicate={onDuplicate}
      />
    );

    // In clip action mode: Done button, Split, Delete, Crop, Duplicate should be visible
    const doneBtn = screen.getByRole("button", { name: /Done/i });
    expect(doneBtn).toBeInTheDocument();
    fireEvent.click(doneBtn);
    expect(onDeselectClip).toHaveBeenCalledTimes(1);

    const splitBtn = screen.getByRole("button", { name: /Split/i });
    expect(splitBtn).toBeInTheDocument();
    fireEvent.click(splitBtn);
    expect(onSplit).toHaveBeenCalledTimes(1);

    const deleteBtn = screen.getByRole("button", { name: /Delete/i });
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("4. Unselect clip when tapping anywhere outside (preview stage, empty timeline space)", () => {
    const onSelectClip = vi.fn();

    render(
      <MobileStudioLayout
        doc={doc}
        clock={clock}
        media={[]}
        selectedId="clip-1"
        activeTab={null}
        previewArea={<div data-testid="test-preview-stage">Preview Canvas</div>}
        timeline={
          <div data-testid="test-timeline-area">
            <div data-clip="clip-1" data-testid="selected-clip">
              <button type="button">Clip 1</button>
            </div>
            <div data-testid="empty-timeline-space">Empty track area</div>
          </div>
        }
        onSelectClip={onSelectClip}
      />
    );

    // Tapping on empty timeline space should deselect clip
    fireEvent.pointerDown(screen.getByTestId("empty-timeline-space"));
    expect(onSelectClip).toHaveBeenCalledWith(null);

    // Tapping on preview canvas should deselect clip
    fireEvent.pointerDown(screen.getByTestId("test-preview-stage"));
    expect(onSelectClip).toHaveBeenCalledWith(null);
  });
});

