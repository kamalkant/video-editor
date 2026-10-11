import { describe, expect, it } from "vitest";
import { localWorkspaceManager } from "@/lib/storage/workspace";
import { emptyDoc, mainTrack, videoClipOf } from "@/lib/edit/doc";
import { newProject, type Project } from "@/lib/projects/model";

describe("Local Recovery and Orphan Asset Lifecycle", () => {
  const accountCode = "RCVRY0TEST01";
  const userId = "usr-recovery-test";
  const email = "recovery@VDO.test";

  it("saves, retrieves, and clears crash recovery snapshots", async () => {
    const ws = await localWorkspaceManager.openWorkspace(
      accountCode,
      userId,
      email,
    );
    const projectId = "12345678-1234-4234-8234-123456789012";

    // Initially no recovery
    const initial = await ws.getRecovery(projectId);
    expect(initial).toBeNull();

    // Save snapshot
    const doc = emptyDoc();
    await ws.saveRecovery(projectId, "Unsaved Crash Work", doc);

    // Retrieve snapshot
    const saved = await ws.getRecovery(projectId);
    expect(saved).not.toBeNull();
    expect(saved?.projectName).toBe("Unsaved Crash Work");
    expect(saved?.projectId).toBe(projectId);

    // Clear snapshot
    await ws.clearRecovery(projectId);
    const afterClear = await ws.getRecovery(projectId);
    expect(afterClear).toBeNull();
  });

  it("identifies orphan assets and cleans them without affecting referenced assets", async () => {
    const ws = await localWorkspaceManager.openWorkspace(
      accountCode,
      userId,
      email,
    );

    // Asset 1: used in a project
    const blob1 = new Blob(["used asset content"], { type: "video/mp4" });
    const asset1 = await ws.saveAsset(blob1, {
      name: "used.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    // Asset 2: orphan (not referenced anywhere)
    const blob2 = new Blob(["orphan asset content to clean"], {
      type: "image/png",
    });
    const asset2 = await ws.saveAsset(blob2, {
      name: "orphan.png",
      type: "image",
      mimeType: "image/png",
    });

    // Create a project referencing asset1
    const doc = emptyDoc();
    const clip = videoClipOf(
      "clip-1",
      {
        id: asset1.id,
        fileName: "used.mp4",
        kind: "video",
        duration: 5,
        width: 1920,
        height: 1080,
        fps: 30,
        hasAudio: false,
        suggestedKey: null,
        keyKind: null,
      },
      [],
    );
    mainTrack(doc).clips = [clip];

    const proj: Project = newProject({
      id: "99999999-9999-4999-8999-999999999999",
      name: "Project with Used Asset",
      doc,
      now: Date.now(),
    });
    await ws.saveProject(proj);

    // Find orphans
    const orphans = await ws.findOrphanAssets();
    expect(orphans.some((a) => a.id === asset2.id)).toBe(true);
    expect(orphans.some((a) => a.id === asset1.id)).toBe(false);

    // Delete the orphan asset
    await ws.deleteAsset(asset2.id);

    const orphansAfter = await ws.findOrphanAssets();
    expect(orphansAfter.some((a) => a.id === asset2.id)).toBe(false);

    // Ensure asset1 is still present and accessible
    const check1 = await ws.getAsset(asset1.id);
    expect(check1).not.toBeNull();
    expect(check1?.name).toBe("used.mp4");
  });

  it("calculates accurate storage statistics breakdown", async () => {
    const ws = await localWorkspaceManager.openWorkspace(
      accountCode,
      userId,
      email,
    );
    const stats = await ws.getStorageStats();

    expect(stats.totalBytes).toBeGreaterThanOrEqual(0);
    expect(typeof stats.projectsCount).toBe("number");
    expect(typeof stats.videosBytes).toBe("number");
    expect(typeof stats.imagesBytes).toBe("number");
    expect(typeof stats.audioBytes).toBe("number");
    expect(typeof stats.cacheBytes).toBe("number");
  });
});
