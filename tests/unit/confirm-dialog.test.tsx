// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  beforeEach(() => {
    // Mock HTMLDialogElement methods in jsdom
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders when open is true with title, message and buttons", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete Media File"
        message="Are you sure you want to delete this clip?"
        confirmLabel="Confirm Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Delete Media File")).toBeDefined();
    expect(screen.getByText("Are you sure you want to delete this clip?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Confirm Delete" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete Project"
        message="Delete project now?"
        confirmLabel="Delete"
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel button is clicked", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete Project"
        message="Delete project now?"
        confirmLabel="Delete"
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it("disables buttons and does not trigger onClose when busy", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Delete Project"
        message="Deleting..."
        busy={true}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cancelBtn);
    expect(handleClose).not.toHaveBeenCalled();
  });
});
