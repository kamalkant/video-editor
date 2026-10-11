import { describe, expect, it } from "vitest";
import { localWorkspaceManager } from "@/lib/storage/workspace";
import { emptyDoc, type TimelineDoc } from "@/lib/edit/doc";
import { newProject, type Project } from "@/lib/projects/model";

function makeDoc(): TimelineDoc {
  return emptyDoc();
}

describe("Account Workspace Isolation", () => {
  const accountCodeA = "A7F29C41X82P";
  const userA = "user-id-a";
  const emailA = "kamal@gmail.com";

  const accountCodeB = "B92KD81LM4QZ";
  const userB = "user-id-b";
  const emailB = "user2@gmail.com";

  it("strictly isolates projects between Account A and Account B", async () => {
    // 1. Open Account A workspace
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);

    // 2. Account A creates Project A
    const projA: Project = newProject({
      id: "44444444-4444-4444-8444-444444444444",
      name: "Breaking News A",
      doc: makeDoc(),
      now: Date.now(),
    });
    await wsA.saveProject(projA);

    const listA = await wsA.listProjects();
    expect(listA.some((p) => p.id === projA.id)).toBe(true);

    // 3. Switch to Account B workspace
    const wsB = await localWorkspaceManager.openWorkspace(accountCodeB, userB, emailB);

    // Project A must NOT appear in Account B
    const listB = await wsB.listProjects();
    expect(listB.some((p) => p.id === projA.id)).toBe(false);
    expect(await wsB.getProject(projA.id)).toBeNull();

    // 4. Account B creates Project B
    const projB: Project = newProject({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Podcast Studio B",
      doc: makeDoc(),
      now: Date.now(),
    });
    await wsB.saveProject(projB);

    const listBAfter = await wsB.listProjects();
    expect(listBAfter.some((p) => p.id === projB.id)).toBe(true);
    expect(listBAfter.some((p) => p.id === projA.id)).toBe(false);

    // 5. Switch back to Account A
    const wsAReopened = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);
    const listAReopened = await wsAReopened.listProjects();

    // Project A is still there, Project B must NOT appear
    expect(listAReopened.some((p) => p.id === projA.id)).toBe(true);
    expect(listAReopened.some((p) => p.id === projB.id)).toBe(false);
    expect(await wsAReopened.getProject(projB.id)).toBeNull();
  });

  it("strictly isolates assets and media between accounts", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);
    const blobA = new Blob(["video data content for A"], { type: "video/mp4" });
    const assetA = await wsA.saveAsset(blobA, {
      name: "intro.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    expect(assetA.id).toBeDefined();

    // Switch to B
    const wsB = await localWorkspaceManager.openWorkspace(accountCodeB, userB, emailB);
    const listB = await wsB.listAssets();
    expect(listB.some((a) => a.id === assetA.id)).toBe(false);
    expect(await wsB.getAsset(assetA.id)).toBeNull();
    expect(await wsB.getAssetBlob(assetA.id)).toBeNull();
  });

  it("deduplicates identical media content within the same account", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);
    const blob1 = new Blob(["identical unique test media payload 12345"], { type: "image/png" });
    const blob2 = new Blob(["identical unique test media payload 12345"], { type: "image/png" });

    const asset1 = await wsA.saveAsset(blob1, {
      name: "logo.png",
      type: "image",
      mimeType: "image/png",
    });

    const asset2 = await wsA.saveAsset(blob2, {
      name: "logo_copy.png",
      type: "image",
      mimeType: "image/png",
    });

    // Content hash matched: should reuse existing stored asset ID
    expect(asset1.id).toBe(asset2.id);
    expect(asset1.hash).toBe(asset2.hash);
  });

  it("isolates crash recovery snapshots between accounts", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);
    const pId = "66666666-6666-4666-8666-666666666666";
    await wsA.saveRecovery(pId, "Crash Project", makeDoc());

    const recA = await wsA.getRecovery(pId);
    expect(recA).not.toBeNull();
    expect(recA?.projectId).toBe(pId);

    // Switch to B
    const wsB = await localWorkspaceManager.openWorkspace(accountCodeB, userB, emailB);
    const recB = await wsB.getRecovery(pId);
    expect(recB).toBeNull();
  });

  it("calculates storage breakdown and detects orphan unused assets", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(accountCodeA, userA, emailA);
    const testDoc = makeDoc();

    // 1. Save an asset that IS NOT used in any project
    const orphanBlob = new Blob(["orphan media content 1234567890"], { type: "video/mp4" });
    const orphanAsset = await wsA.saveAsset(orphanBlob, {
      name: "orphan-clip.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    // 2. Save a project that doesn't reference this orphan asset
    const projA: Project = newProject({
      id: "77777777-7777-4777-8777-777777777777",
      name: "Clean Project",
      doc: testDoc,
      now: Date.now(),
    });
    await wsA.saveProject(projA);

    // 3. Inspect storage stats
    const stats = await wsA.getStorageStats();
    expect(stats.projectsCount).toBeGreaterThanOrEqual(1);
    expect(stats.videosBytes).toBeGreaterThan(0);
    expect(stats.totalBytes).toBeGreaterThan(0);

    // 4. Inspect unused orphan assets
    const orphans = await wsA.findOrphanAssets();
    expect(orphans.some((u) => u.id === orphanAsset.id)).toBe(true);

    // 5. Clean orphan assets
    const cleanedCount = await wsA.cleanOrphanAssets();
    expect(cleanedCount).toBeGreaterThanOrEqual(1);

    const orphansAfter = await wsA.findOrphanAssets();
    expect(orphansAfter.some((u) => u.id === orphanAsset.id)).toBe(false);

    // 6. Delete the project
    await wsA.deleteProject(projA.id);
    expect(await wsA.getProject(projA.id)).toBeNull();
  });
});

