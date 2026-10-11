// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
import { TemplateCard } from "@/components/studio/templates/TemplateCard";
import { TemplateDetailPane } from "@/components/studio/templates/TemplateDetailPane";
import type { BroadcastTemplate } from "@/lib/templates/types";
import { emptyDoc } from "@/lib/edit/doc";

function mockTemplate(overrides?: Partial<BroadcastTemplate>): BroadcastTemplate {
  return {
    id: "tpl-1",
    name: "Breaking News Live",
    description: "Broadcast template",
    category: "News & Broadcast",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 10,
    tags: ["news", "breaking"],
    slots: [],
    build: () => emptyDoc(),
    ...overrides,
  };
}

describe("TemplateCard Quick Actions & Inline Rename", () => {
  it("does not render three dots or delete icon on standard templates", () => {
    const template = mockTemplate();
    render(
      <TemplateCard
        template={template}
        isSelected={false}
        onSelect={vi.fn()}
        onUse={vi.fn()}
      />
    );

    // Three dots should not exist
    expect(screen.queryByText("⋯")).toBeNull();
    // Delete icon button should not exist
    expect(screen.queryByTitle("Delete template")).toBeNull();
    // Title is rendered
    expect(screen.getByText("Breaking News Live")).toBeDefined();
  });

  it("renders delete icon button on custom templates and triggers onDelete", () => {
    const customTemplate = mockTemplate({
      id: "custom-1",
      name: "My Custom News",
      custom: {
        id: "cust-1",
        video: { assetId: "v1", name: "v.mp4", duration: 10 },
      },
    });

    const onDelete = vi.fn();
    const onSelect = vi.fn();

    render(
      <TemplateCard
        template={customTemplate}
        isSelected={false}
        onSelect={onSelect}
        onUse={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    );

    // Three dots should not exist
    expect(screen.queryByText("⋯")).toBeNull();

    // Direct delete button exists
    const deleteBtn = screen.getByTitle("Delete template");
    expect(deleteBtn).toBeDefined();

    // Clicking delete button calls onDelete without triggering onSelect
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("allows renaming inline on double-click and committing with Enter", () => {
    const customTemplate = mockTemplate({
      id: "custom-1",
      name: "Initial Name",
      custom: {
        id: "cust-1",
        video: { assetId: "v1", name: "v.mp4", duration: 10 },
      },
    });

    const onRename = vi.fn();

    render(
      <TemplateCard
        template={customTemplate}
        isSelected={false}
        onSelect={vi.fn()}
        onUse={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    const titleEl = screen.getByText("Initial Name");
    expect(titleEl).toBeDefined();

    // Double-click to start inline editing
    fireEvent.doubleClick(titleEl);

    const input = screen.getByRole("textbox", { name: "Rename template" }) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("Initial Name");

    // Change input value
    fireEvent.change(input, { target: { value: "Updated Live Broadcast" } });

    // Press Enter to commit
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Updated Live Broadcast");
  });

  it("cancels inline renaming on Escape without calling onRename", () => {
    const customTemplate = mockTemplate({
      id: "custom-1",
      name: "Original Name",
      custom: {
        id: "cust-1",
        video: { assetId: "v1", name: "v.mp4", duration: 10 },
      },
    });

    const onRename = vi.fn();

    render(
      <TemplateCard
        template={customTemplate}
        isSelected={false}
        onSelect={vi.fn()}
        onUse={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    const titleEl = screen.getByText("Original Name");
    fireEvent.doubleClick(titleEl);

    const input = screen.getByRole("textbox", { name: "Rename template" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Something Else" } });

    // Press Escape to cancel
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Original Name")).toBeDefined();
  });
});

describe("TemplateDetailPane Clean Sidebar", () => {
  it("does not render the Active Video Loop tray or media tabs in the sidebar", () => {
    const template = mockTemplate();
    const onUse = vi.fn();
    const onCustomize = vi.fn();

    render(
      <TemplateDetailPane
        template={template}
        similarTemplates={[]}
        onSelectSimilar={vi.fn()}
        onUse={onUse}
        onCustomize={onCustomize}
      />
    );

    // Ensure the old Active Video Loop text and media tray tabs are gone
    expect(screen.queryByText(/Active Video Loop/i)).toBeNull();
    expect(screen.queryByText(/Video Loops/i)).toBeNull();
    expect(screen.queryByText(/Audio Themes/i)).toBeNull();
    expect(screen.queryByText(/\+ Upload Clip/i)).toBeNull();

    // Ensure primary details and CTA exist
    expect(screen.getByText("Breaking News Live")).toBeDefined();
    expect(screen.getByRole("button", { name: /Use This Template/i })).toBeDefined();

    // Clicking Use This Template works
    fireEvent.click(screen.getByRole("button", { name: /Use This Template/i }));
    expect(onUse).toHaveBeenCalledTimes(1);

    // Ensure customize options exist
    expect(screen.getByText("Replace Background")).toBeDefined();
    expect(screen.getByText("Audio & Music")).toBeDefined();
  });
});

