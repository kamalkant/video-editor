// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MobileStudioLayout } from "@/components/studio/mobile/MobileStudioLayout";
import { MobileBottomSheet } from "@/components/studio/mobile/MobileBottomSheet";
import { MobileBottomToolbar } from "@/components/studio/mobile/MobileBottomToolbar";
import { MobileTopBar } from "@/components/studio/mobile/MobileTopBar";
import { emptyDoc } from "@/lib/edit/doc";
import { createClock } from "@/lib/editor/clock";

describe("Mobile Editor Redesign (Compact Bottom Sheet)", () => {
  afterEach(() => {
    cleanup();
  });

  const clock = createClock();
  const doc = emptyDoc();

  it("renders MobileTopBar with project title, undo, redo, and export CTA", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onExport = vi.fn();
    const onHome = vi.fn();

    render(
      <MobileTopBar
        projectName="Test Project"
        saveState="saved"
        canUndo={true}
        canRedo={false}
        onUndo={onUndo}
        onRedo={onRedo}
        onHome={onHome}
        onExport={onExport}
      />,
    );

    expect(screen.getByText("Test Project")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();

    const undoBtn = screen.getByRole("button", { name: "Undo" });
    expect(undoBtn).toBeEnabled();
    fireEvent.click(undoBtn);
    expect(onUndo).toHaveBeenCalledTimes(1);

    const redoBtn = screen.getByRole("button", { name: "Redo" });
    expect(redoBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("renders MobileBottomToolbar with the 7 primary mobile tool tabs", () => {
    const onSelectTab = vi.fn();
    render(<MobileBottomToolbar activeTab={null} onSelectTab={onSelectTab} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Audio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onSelectTab).toHaveBeenCalledWith("edit");

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(onSelectTab).toHaveBeenCalledWith("text");
  });

  it("renders MobileBottomSheet with compact snap height and supports expansion", () => {
    const onSnapChange = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <MobileBottomSheet
        isOpen={true}
        title="Edit Clip"
        snap="compact"
        onSnapChange={onSnapChange}
        onClose={onClose}
      >
        <div data-testid="sheet-body">Tool Options Content</div>
      </MobileBottomSheet>,
    );

    expect(screen.getByText("Edit Clip")).toBeInTheDocument();
    expect(screen.getByTestId("sheet-body")).toBeInTheDocument();

    // Toggle snap button
    const expandBtn = screen.getByRole("button", { name: "Expand sheet" });
    fireEvent.click(expandBtn);
    expect(onSnapChange).toHaveBeenCalledWith("expanded");

    // Close button
    const closeBtn = screen.getByRole("button", { name: "Close sheet" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Rerender when closed
    rerender(
      <MobileBottomSheet
        isOpen={false}
        title="Edit Clip"
        snap="compact"
        onSnapChange={onSnapChange}
        onClose={onClose}
      >
        <div data-testid="sheet-body">Tool Options Content</div>
      </MobileBottomSheet>,
    );
    expect(screen.queryByTestId("sheet-body")).not.toBeInTheDocument();
  });

  it("renders full MobileStudioLayout and allows opening tool sheets", () => {
    const onSplit = vi.fn();
    const onExport = vi.fn();

    render(
      <MobileStudioLayout
        doc={doc}
        clock={clock}
        selectedId={null}
        onSelectClip={vi.fn()}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onHome={vi.fn()}
        onExport={onExport}
        previewArea={<div data-testid="mock-preview">Preview Area</div>}
        timeline={<div data-testid="mock-timeline">Multi-Track Timeline</div>}
        onSplit={onSplit}
      />,
    );

    // Both preview and timeline must be visible and present
    expect(screen.getByTestId("mock-preview")).toBeInTheDocument();
    expect(screen.getByTestId("mock-timeline")).toBeInTheDocument();

    // Bottom toolbar is present
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    // Tapping Edit opens the Edit sheet
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit Clip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    // Tapping Text switches to Text sheet
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(screen.getByText("Text & Titles")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Font")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
    expect(screen.getByText("Animation")).toBeInTheDocument();

    // Tapping More switches to More Tools & Canvas
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("More Tools & Canvas")).toBeInTheDocument();
    expect(screen.getByText("16:9")).toBeInTheDocument();
    expect(screen.getByText("9:16")).toBeInTheDocument();
    expect(screen.getByText("1:1")).toBeInTheDocument();

    // Tapping More again toggles close
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText("More Tools & Canvas")).not.toBeInTheDocument();
  });
});
