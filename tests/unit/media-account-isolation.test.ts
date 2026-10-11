import { describe, expect, it } from "vitest";
import { listVideos } from "@/lib/videos";
import { localWorkspaceManager } from "@/lib/storage/workspace";
import { emptyDoc } from "@/lib/edit/doc";
import { newProject } from "@/lib/projects/model";

describe("Media Assets & Projects Account Personalization", () => {
  const userA = "user-alpha-test";
  const userB = "user-beta-test";
  const accountCodeA = "ACT_ALPHA_001";
  const accountCodeB = "ACT_BETA_002";

  it("strictly filters server videos by userId", async () => {
    // Test listVideos filtering with explicit userId
    const listA = await listVideos({ userId: userA });
    // User A should only see videos where userId === userA
    for (const v of listA) {
      expect(v.userId).toBe(userA);
    }

    const listB = await listVideos({ userId: userB });
    // User B should only see videos where userId === userB
    for (const v of listB) {
      expect(v.userId).toBe(userB);
    }

    // Guest / unauthenticated query returns empty array
    const listGuest = await listVideos({ userId: null });
    expect(listGuest).toEqual([]);
  });

  it("strictly isolates local workspace media assets between Account A and Account B", async () => {
    // 1. Account A saves an asset to local OPFS
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, "alpha@test.com");
    const mediaA = new Blob(["alpha video payload 123"], { type: "video/mp4" });
    const assetA = await wsA.saveAsset(mediaA, {
      name: "alpha_exclusive.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    const assetsA = await wsA.listAssets();
    expect(assetsA.some((a) => a.id === assetA.id)).toBe(true);

    // 2. Account B opens workspace
    const wsB = await localWorkspaceManager.openWorkspace(accountCodeB, userB, "beta@test.com");
    const assetsB = await wsB.listAssets();

    // Asset A must NOT be visible to Account B
    expect(assetsB.some((a) => a.id === assetA.id)).toBe(false);
    expect(await wsB.getAsset(assetA.id)).toBeNull();
    expect(await wsB.getAssetBlob(assetA.id)).toBeNull();

    // 3. Account B saves its own asset
    const mediaB = new Blob(["beta sound payload 456"], { type: "audio/mp3" });
    const assetB = await wsB.saveAsset(mediaB, {
      name: "beta_exclusive.mp3",
      type: "audio",
      mimeType: "audio/mpeg",
    });

    const assetsBAfter = await wsB.listAssets();
    expect(assetsBAfter.some((a) => a.id === assetB.id)).toBe(true);
    expect(assetsBAfter.some((a) => a.id === assetA.id)).toBe(false);

    // 4. Reopen Account A workspace
    const wsAReopen = await localWorkspaceManager.openWorkspace(accountCodeA, userA, "alpha@test.com");
    const assetsAReopen = await wsAReopen.listAssets();
    expect(assetsAReopen.some((a) => a.id === assetA.id)).toBe(true);
    expect(assetsAReopen.some((a) => a.id === assetB.id)).toBe(false);
  });

  it("strictly isolates projects between Account A and Account B", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, "alpha@test.com");
    const projA = newProject({
      id: "aaaa0001-0000-4000-8000-000000000001",
      name: "Alpha Project Secret",
      doc: emptyDoc(),
      now: Date.now(),
    });
    await wsA.saveProject(projA);

    // Switch to B
    const wsB = await localWorkspaceManager.openWorkspace(accountCodeB, userB, "beta@test.com");
    const listB = await wsB.listProjects();
    expect(listB.some((p) => p.id === projA.id)).toBe(false);

    const projB = newProject({
      id: "bbbb0002-0000-4000-8000-000000000002",
      name: "Beta Project Secret",
      doc: emptyDoc(),
      now: Date.now(),
    });
    await wsB.saveProject(projB);

    const listBAfter = await wsB.listProjects();
    expect(listBAfter.some((p) => p.id === projB.id)).toBe(true);
    expect(listBAfter.some((p) => p.id === projA.id)).toBe(false);

    // Reopen A
    const wsAReopen = await localWorkspaceManager.openWorkspace(accountCodeA, userA, "alpha@test.com");
    const listAReopen = await wsAReopen.listProjects();
    expect(listAReopen.some((p) => p.id === projA.id)).toBe(true);
    expect(listAReopen.some((p) => p.id === projB.id)).toBe(false);
  });
});
