// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EmptyPreview } from "@/components/studio/EmptyPreview";

describe("EmptyPreview Mobile Redesign (YouTube Create Style)", () => {
  afterEach(() => {
    cleanup();
  });

  const idleState = { kind: "idle" } as const;

  it("renders mobile hero card with Choose File and quick-action pills when isMobile=true", () => {
    const onChoose = vi.fn();
    const onRecord = vi.fn();
    const onText = vi.fn();
    const onBlank = vi.fn();
    const onElements = vi.fn();

    render(
      <EmptyPreview
        state={idleState}
        onChoose={onChoose}
        onCancel={vi.fn()}
        dragging={false}
        onRecord={onRecord}
        onText={onText}
        onBlank={onBlank}
        onElements={onElements}
        isMobile={true}
      />
    );

    // Primary Choose File button is present
    const chooseBtn = screen.getByRole("button", { name: /Choose file/i });
    expect(chooseBtn).toBeInTheDocument();
    fireEvent.click(chooseBtn);
    expect(onChoose).toHaveBeenCalledTimes(1);

    // Mobile pills are present and clickable
    const cameraBtn = screen.getByRole("button", { name: /Camera/i });
    expect(cameraBtn).toBeInTheDocument();
    fireEvent.click(cameraBtn);
    expect(onRecord).toHaveBeenCalledWith("camera");

    const textBtn = screen.getByRole("button", { name: /Text/i });
    expect(textBtn).toBeInTheDocument();
    fireEvent.click(textBtn);
    expect(onText).toHaveBeenCalledTimes(1);

    const blankBtn = screen.getByRole("button", { name: /Blank/i });
    expect(blankBtn).toBeInTheDocument();
    fireEvent.click(blankBtn);
    expect(onBlank).toHaveBeenCalledTimes(1);

    const elementsBtn = screen.getByRole("button", { name: /Elements/i });
    expect(elementsBtn).toBeInTheDocument();
    fireEvent.click(elementsBtn);
    expect(onElements).toHaveBeenCalledTimes(1);
  });

  it("preserves desktop layout with all original buttons when isMobile=false", () => {
    const onChoose = vi.fn();
    const onRecord = vi.fn();

    render(
      <EmptyPreview
        state={idleState}
        onChoose={onChoose}
        onCancel={vi.fn()}
        dragging={false}
        onRecord={onRecord}
        onText={vi.fn()}
        onBlank={vi.fn()}
        onElements={vi.fn()}
        isMobile={false}
      />
    );

    expect(screen.getByText("No video loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose file/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record camera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record screen/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Elements/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start with a blank/i })).toBeInTheDocument();
  });
});
