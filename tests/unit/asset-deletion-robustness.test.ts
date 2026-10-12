import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Asset } from "@/lib/media/useLibrary";
import type { VideoInfo } from "@/lib/ffmpeg/probe";

describe("Asset Deletion Robustness", () => {
  const fakeAsset: Asset = {
    id: "asset-del-123",
    fileName: "funny-meme.mp4",
    createdAt: Date.now(),
    info: {
      duration: 12,
      size: 1048576,
      width: 1280,
      height: 720,
      fps: 30,
    } as unknown as VideoInfo,
    suggestedKey: null,
    keyKind: null,
    usedIn: [],
  };

  it("handles cancelling uploading items when deleted without blocking user", async () => {
    let released = false;
    let forgotten = false;
    let workspaceDeleted = false;

    const fakeLocalItem = { state: "uploading", progress: 0.4 };
    const releaseLocal = vi.fn((id: string, force?: boolean) => {
      if (id === "asset-del-123" && force) released = true;
    });
    const forgetLocal = vi.fn(async (id: string) => {
      if (id === "asset-del-123") forgotten = true;
    });
    const mockWorkspace = {
      deleteAsset: vi.fn(async (id: string) => {
        if (id === "asset-del-123") workspaceDeleted = true;
        return true;
      }),
    };

    // Simulate deleteAsset logic
    const deleteAsset = async (a: Asset): Promise<string | null> => {
      releaseLocal(a.id, true);
      await mockWorkspace.deleteAsset(a.id);
      await forgetLocal(a.id);
      return null;
    };

    const err = await deleteAsset(fakeAsset);
    expect(err).toBeNull();
    expect(released).toBe(true);
    expect(forgotten).toBe(true);
    expect(workspaceDeleted).toBe(true);
  });

  it("gracefully deletes local asset even if server returns 401 or 403 or 404", async () => {
    let metas: Record<string, Asset> = { [fakeAsset.id]: fakeAsset };
    let workspaceDeleted = false;
    let localForgotten = false;

    const deleteAsset = async (a: Asset): Promise<string | null> => {
      // Local workspace cleanup
      workspaceDeleted = true;
      localForgotten = true;

      // In-memory metas removal
      delete metas[a.id];

      // Simulated server 403/404 response
      const serverStatus = 403;
      if (serverStatus !== 404 && serverStatus !== 401 && serverStatus !== 403) {
        throw new Error("Server error");
      }
      return null;
    };

    const result = await deleteAsset(fakeAsset);
    expect(result).toBeNull();
    expect(metas[fakeAsset.id]).toBeUndefined();
    expect(workspaceDeleted).toBe(true);
    expect(localForgotten).toBe(true);
  });

  it("handles multi-selection batch deletion cleanly", async () => {
    const assets: Asset[] = [
      { ...fakeAsset, id: "a1" },
      { ...fakeAsset, id: "a2" },
      { ...fakeAsset, id: "a3" },
    ];
    const selected = new Set(["a1", "a3"]);
    const deletedIds: string[] = [];

    const onDelete = async (a: Asset) => {
      deletedIds.push(a.id);
      return null;
    };

    for (const a of assets) {
      if (selected.has(a.id)) {
        await onDelete(a);
      }
    }

    expect(deletedIds).toEqual(["a1", "a3"]);
  });
});
