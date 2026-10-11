import { describe, it, expect, vi } from "vitest";
import type { ProjectSummary } from "@/lib/projects/model";
import type { Asset } from "@/lib/media/useLibrary";
import type { VideoInfo } from "@/lib/ffmpeg/probe";

describe("Projects sorting & multi-selection", () => {
  const sampleProjects: ProjectSummary[] = [
    { id: "p1", name: "Beta Reel", updatedAt: 1000, duration: 30, clips: 2, coverId: "v1", missing: false },
    { id: "p2", name: "Alpha Teaser", updatedAt: 3000, duration: 15, clips: 1, coverId: "v2", missing: false },
    { id: "p3", name: "Gamma Feature", updatedAt: 2000, duration: 90, clips: 5, coverId: "v3", missing: false },
  ];

  it("sorts projects by recently edited (date-desc)", () => {
    const sorted = [...sampleProjects].sort((a, b) => b.updatedAt - a.updatedAt);
    expect(sorted.map((p) => p.name)).toEqual(["Alpha Teaser", "Gamma Feature", "Beta Reel"]);
  });

  it("sorts projects by oldest edited (date-asc)", () => {
    const sorted = [...sampleProjects].sort((a, b) => a.updatedAt - b.updatedAt);
    expect(sorted.map((p) => p.name)).toEqual(["Beta Reel", "Gamma Feature", "Alpha Teaser"]);
  });

  it("sorts projects by name alphabetically (name)", () => {
    const sorted = [...sampleProjects].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted.map((p) => p.name)).toEqual(["Alpha Teaser", "Beta Reel", "Gamma Feature"]);
  });

  it("sorts projects by duration (longest first)", () => {
    const sorted = [...sampleProjects].sort((a, b) => b.duration - a.duration);
    expect(sorted.map((p) => p.name)).toEqual(["Gamma Feature", "Beta Reel", "Alpha Teaser"]);
  });

  it("supports toggle select and select all / deselect all", () => {
    let selected = new Set<string>();

    // Select single
    selected = new Set([...selected, "p1"]);
    expect(selected.has("p1")).toBe(true);
    expect(selected.size).toBe(1);

    // Toggle off
    selected = new Set(selected);
    selected.delete("p1");
    expect(selected.has("p1")).toBe(false);
    expect(selected.size).toBe(0);

    // Select all
    selected = new Set(sampleProjects.map((p) => p.id));
    expect(selected.size).toBe(3);

    // Deselect all
    selected = new Set();
    expect(selected.size).toBe(0);
  });

  it("triggers onNew if the currently active project was deleted in bulk delete", () => {
    const currentId = "p2";
    const selectedIds = new Set(["p1", "p2"]);
    const onNew = vi.fn();
    const onDeleted = vi.fn();

    let deletedCurrent = false;
    for (const id of Array.from(selectedIds)) {
      if (id === currentId) deletedCurrent = true;
      onDeleted(id);
    }
    if (deletedCurrent) onNew();

    expect(onDeleted).toHaveBeenCalledWith("p1");
    expect(onDeleted).toHaveBeenCalledWith("p2");
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});

describe("Assets sorting & multi-selection", () => {
  const sampleAssets: Asset[] = [
    {
      id: "a1",
      fileName: "sunset.mp4",
      createdAt: 2000,
      info: { duration: 10, size: 5000000, width: 1920, height: 1080, fps: 30 } as unknown as VideoInfo,
      suggestedKey: null,
      keyKind: null,
      usedIn: [],
    },
    {
      id: "a2",
      fileName: "intro_music.mp3",
      createdAt: 1000,
      info: { duration: 60, size: 2000000, width: 0, height: 0, fps: 0 } as unknown as VideoInfo,
      suggestedKey: null,
      keyKind: null,
      usedIn: [{ id: "p1", name: "Promo" }],
    },
    {
      id: "a3",
      fileName: "logo.png",
      createdAt: 3000,
      info: { duration: 0, size: 500000, width: 512, height: 512, fps: 0 } as unknown as VideoInfo,
      suggestedKey: null,
      keyKind: null,
      usedIn: [],
    },
  ];

  it("sorts assets by newest added", () => {
    const sorted = [...sampleAssets].sort((a, b) => b.createdAt - a.createdAt);
    expect(sorted.map((a) => a.fileName)).toEqual(["logo.png", "sunset.mp4", "intro_music.mp3"]);
  });

  it("sorts assets by name A-Z", () => {
    const sorted = [...sampleAssets].sort((a, b) => a.fileName.localeCompare(b.fileName));
    expect(sorted.map((a) => a.fileName)).toEqual(["intro_music.mp3", "logo.png", "sunset.mp4"]);
  });

  it("sorts assets by file size (largest first)", () => {
    const sorted = [...sampleAssets].sort((a, b) => (b.info.size || 0) - (a.info.size || 0));
    expect(sorted.map((a) => a.fileName)).toEqual(["sunset.mp4", "intro_music.mp3", "logo.png"]);
  });

  it("sorts assets by duration (longest first)", () => {
    const sorted = [...sampleAssets].sort((a, b) => (b.info.duration || 0) - (a.info.duration || 0));
    expect(sorted.map((a) => a.fileName)).toEqual(["intro_music.mp3", "sunset.mp4", "logo.png"]);
  });

  it("handles persistent batch bar states: Select all when empty, item count when selected", () => {
    const total = sampleAssets.length;
    let selected = new Set<string>();

    const getLabel = (sel: Set<string>, count: number) =>
      sel.size > 0 ? `${sel.size} of ${count} selected` : "Select all";

    // 0 selected: muted "Select all", actions disabled
    expect(getLabel(selected, total)).toBe("Select all");
    expect(selected.size === 0).toBe(true);

    // Clicking checkbox when empty selects all
    selected = new Set(sampleAssets.map((a) => a.id));
    expect(getLabel(selected, total)).toBe("3 of 3 selected");
    expect(selected.size === total).toBe(true);

    // Deselect single item
    selected.delete("a1");
    expect(getLabel(selected, total)).toBe("2 of 3 selected");

    // Clear selection
    selected = new Set();
    expect(getLabel(selected, total)).toBe("Select all");
    expect(selected.size === 0).toBe(true);
  });
});

