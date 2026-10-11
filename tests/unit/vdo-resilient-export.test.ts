import { describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, videoClipOf } from "@/lib/edit/doc";
import { newProject, type Project } from "@/lib/projects/model";
import { exportVDO, importVDO, readZipArchive } from "@/lib/storage/VDO";
import { localWorkspaceManager } from "@/lib/storage/workspace";

describe("Resilient VDO Export & Re-import", () => {
  it("exports VDO package seamlessly from an in-memory project not previously stored in OPFS", async () => {
    const ws = await localWorkspaceManager.openWorkspace("ACC_RESILIENT_01", "usr-res-1", "user-res1@test.com");
    const doc = emptyDoc();

    // In-memory project
    const proj: Project = newProject({
      id: "77777777-7777-4777-8777-777777777777",
      name: "Ephemeral Project",
      doc,
      now: Date.now(),
      jobId: null,
    });

    // Should successfully export without crashing
    const VDOBlob = await exportVDO(proj, ws, { portable: false });
    expect(VDOBlob).toBeDefined();
    expect(VDOBlob.type).toBe("application/x-vdo");
    expect(VDOBlob.size).toBeGreaterThan(50);

    // Verify internal ZIP structure
    const buf = await VDOBlob.arrayBuffer();
    const entries = await readZipArchive(buf);
    const names = entries.map((e) => e.path);

    expect(names).toContain("project.json");
    expect(names).toContain("timeline.json");
    expect(names).toContain("metadata.json");
  });

  it("exports portable VDO with media, and imports cleanly into a second account workspace", async () => {
    // 1. Account A creates media and project
    const wsA = await localWorkspaceManager.openWorkspace("ACC_EXP_PORT_A", "usr-ea", "usera@test.com");
    const sampleMedia = new Blob(["sample video stream bytes 456"], { type: "video/mp4" });
    const assetA = await wsA.saveAsset(sampleMedia, {
      name: "intro.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    const doc = emptyDoc();
    const projA: Project = newProject({
      id: "88888888-8888-4888-8888-888888888888",
      name: "Portable Show",
      doc,
      now: Date.now(),
      jobId: null,
    });
    await wsA.saveProject(projA);

    // Export portable VDO
    const VDOBlob = await exportVDO(projA, wsA, { portable: true });
    expect(VDOBlob.size).toBeGreaterThan(100);

    // 2. Account B imports the VDO package
    const wsB = await localWorkspaceManager.openWorkspace("ACC_EXP_PORT_B", "usr-eb", "userb@test.com");
    const imported = await importVDO(VDOBlob, wsB);

    expect(imported).toBeDefined();
    expect(imported.name).toBe("Portable Show");
    // Ownership reassignment: Account B receives a brand new project ID
    expect(imported.id).not.toBe(projA.id);

    // Account B workspace lists the imported project
    const listB = await wsB.listProjects();
    expect(listB.some((p) => p.id === imported.id)).toBe(true);

    // Account A workspace lists the original project ID and NOT the imported ID
    const listA = await wsA.listProjects();
    expect(listA.some((p) => p.id === projA.id)).toBe(true);
    expect(listA.some((p) => p.id === imported.id)).toBe(false);
  });

  it("exports portable VDO fetching media from server fallback when not in OPFS, and packages media into zip", async () => {
    const ws = await localWorkspaceManager.openWorkspace("ACC_EXP_SERVER_FALLBACK", "usr-sf", "usersf@test.com");
    const serverMediaId = "e578c73c-bb45-42f8-958f-287714207981";
    const serverMediaBytes = "binary video stream bytes from server storage 12345";

    const doc = emptyDoc();
    mainTrack(doc).clips = [
      videoClipOf(
        "clip-sf-1",
        {
          id: serverMediaId,
          fileName: "interview.mp4",
          kind: "video",
          duration: 5,
          width: 1920,
          height: 1080,
          fps: 30,
          hasAudio: true,
          suggestedKey: null,
          keyKind: null,
        },
        [],
      ),
    ];

    const proj: Project = newProject({
      id: "99999999-9999-4999-8999-999999999999",
      name: "Server Media Project",
      doc,
      now: Date.now(),
      jobId: null,
    });

    // Mock window & fetch simulating server /api/videos endpoints
    const originalWindow = (globalThis as any).window;
    const originalFetch = globalThis.fetch;

    try {
      (globalThis as any).window = {};
      globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        if (urlStr.includes(`/api/videos/${serverMediaId}/source`)) {
          return new Response(new Blob([serverMediaBytes], { type: "video/mp4" }), { status: 200 });
        }
        if (urlStr.includes(`/api/videos/${serverMediaId}/thumb`)) {
          return new Response(new Blob(["mock thumbnail bytes"], { type: "image/jpeg" }), { status: 200 });
        }
        if (urlStr.includes(`/api/videos/${serverMediaId}`)) {
          return new Response(
            JSON.stringify({
              fileName: "interview.mp4",
              kind: "video",
              info: { duration: 5, width: 1920, height: 1080, fps: 30 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not found", { status: 404 });
      };

      // Export portable VDO
      const vdoBlob = await exportVDO(proj, ws, { portable: true });
      expect(vdoBlob).toBeDefined();

      // Read ZIP entries
      const buf = await vdoBlob.arrayBuffer();
      const entries = await readZipArchive(buf);
      const paths = entries.map((e) => e.path);

      // Verify that media is inside the zip!
      expect(paths).toContain(`assets/videos/${serverMediaId}.mp4`);
      expect(paths).toContain("assets/manifest.json");

      // Verify content of the packaged video file
      const mediaEntry = entries.find((e) => e.path === `assets/videos/${serverMediaId}.mp4`);
      expect(mediaEntry).toBeDefined();
      const text = new TextDecoder().decode(mediaEntry!.data);
      expect(text).toBe(serverMediaBytes);

      // Verify manifest contents
      const manifestEntry = entries.find((e) => e.path === "assets/manifest.json");
      expect(manifestEntry).toBeDefined();
      const manifest = JSON.parse(new TextDecoder().decode(manifestEntry!.data));
      expect(manifest).toHaveLength(1);
      expect(manifest[0].id).toBe(serverMediaId);
      expect(manifest[0].name).toBe("interview.mp4");
      expect(manifest[0].mimeType).toBe("video/mp4");
      expect(manifest[0].size).toBe(serverMediaBytes.length);
    } finally {
      (globalThis as any).window = originalWindow;
      globalThis.fetch = originalFetch;
    }
  });

});
