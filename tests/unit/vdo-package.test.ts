import { describe, expect, it } from "vitest";
import { emptyDoc, mainTrack, videoClipOf } from "@/lib/edit/doc";
import { newProject, type Project } from "@/lib/projects/model";
import {
  createZipArchive,
  readZipArchive,
  sanitizeArchivePath,
  exportVDO,
  importVDO,
  estimateVDOSize,
} from "@/lib/storage/VDO";
import { localWorkspaceManager } from "@/lib/storage/workspace";

describe("VDO Project System & ZIP Container", () => {
  it("sanitizes paths and blocks directory traversal attempts", () => {
    expect(sanitizeArchivePath("project.json")).toBe("project.json");
    expect(sanitizeArchivePath("assets/videos/clip.mp4")).toBe(
      "assets/videos/clip.mp4",
    );
    expect(sanitizeArchivePath("/root/path/file.txt")).toBe(
      "root/path/file.txt",
    );

    // Traversal attempts must throw
    expect(() => sanitizeArchivePath("../escaped.json")).toThrow(/traversal/);
    expect(() => sanitizeArchivePath("assets/../../secret.txt")).toThrow(
      /traversal/,
    );
    expect(() => sanitizeArchivePath("null\0byte.txt")).toThrow(/null byte/);
    expect(() => sanitizeArchivePath("")).toThrow();
  });

  it("creates and extracts valid ZIP archives with CRC32 verification", async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const file1Data = enc.encode("Hello VDO World");
    const file2Data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const archive = await createZipArchive([
      { path: "project.json", data: file1Data },
      { path: "assets/binary.dat", data: file2Data },
    ]);

    expect(archive.byteLength).toBeGreaterThan(50);

    const extracted = await readZipArchive(archive);
    expect(extracted).toHaveLength(2);

    const f1 = extracted.find((e) => e.path === "project.json");
    expect(f1).toBeDefined();
    expect(dec.decode(f1?.data)).toBe("Hello VDO World");

    const f2 = extracted.find((e) => e.path === "assets/binary.dat");
    expect(f2).toBeDefined();
    expect(Array.from(f2?.data || [])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("exports and imports normal VDO project packages", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(
      "ACC_ORIGIN_01",
      "usr-1",
      "user1@VDO.com",
    );
    const doc = emptyDoc();
    const proj: Project = newProject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Original Project",
      doc,
      now: Date.now(),
    });
    await wsA.saveProject(proj);

    // Export VDO
    const VDOBlob = await exportVDO(proj, wsA, { portable: false });
    expect(VDOBlob.type).toBe("application/x-vdo");
    expect(VDOBlob.size).toBeGreaterThan(100);

    // Estimate size
    const est = await estimateVDOSize(proj, wsA, { portable: false });
    expect(est.totalBytes).toBeGreaterThan(0);
    expect(est.portable).toBe(false);

    // Switch to Account B and Import
    const wsB = await localWorkspaceManager.openWorkspace(
      "ACC_TARGET_02",
      "usr-2",
      "user2@VDO.com",
    );
    const imported = await importVDO(VDOBlob, wsB);

    expect(imported).toBeDefined();
    expect(imported.name).toBe("Original Project");
    // Ownership reassignment: ID must be newly generated and saved in wsB
    expect(imported.id).not.toBe(proj.id);

    const bProjects = await wsB.listProjects();
    expect(bProjects.some((p) => p.id === imported.id)).toBe(true);
    // wsA's project list still contains only wsA's original ID
    const aProjects = await wsA.listProjects();
    expect(aProjects.some((p) => p.id === proj.id)).toBe(true);
    expect(aProjects.some((p) => p.id === imported.id)).toBe(false);
  });

  it("exports portable VDO with embedded media and imports into target workspace", async () => {
    const wsA = await localWorkspaceManager.openWorkspace(
      "ACC_PORTABLE_1",
      "usr-p1",
      "portable1@VDO.com",
    );
    const mediaBlob = new Blob(["video binary frame data 999"], {
      type: "video/mp4",
    });
    const asset = await wsA.saveAsset(mediaBlob, {
      name: "sample.mp4",
      type: "video",
      mimeType: "video/mp4",
    });

    const doc = emptyDoc();
    mainTrack(doc).clips = [
      videoClipOf(
        "clip-1",
        {
          id: asset.id,
          fileName: "sample.mp4",
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
      id: "22222222-2222-4222-8222-222222222222",
      name: "Portable Project",
      doc,
      now: Date.now(),
    });
    await wsA.saveProject(proj);

    // Export Portable VDO
    const portableBlob = await exportVDO(proj, wsA, { portable: true });
    expect(portableBlob.size).toBeGreaterThan(mediaBlob.size);

    // Switch to clean Account B
    const wsB = await localWorkspaceManager.openWorkspace(
      "ACC_PORTABLE_2",
      "usr-p2",
      "portable2@VDO.com",
    );
    // Before import, Account B has no assets
    expect(await wsB.getAsset(asset.id)).toBeNull();

    // Import portable project
    const imported = await importVDO(portableBlob, wsB);
    expect(imported).toBeDefined();

    // Verify embedded asset was registered in Account B's storage
    const extractedAsset = await wsB.getAsset(asset.id);
    expect(extractedAsset).not.toBeNull();
    expect(extractedAsset?.name).toBe("sample.mp4");

    const extractedBlob = await wsB.getAssetBlob(asset.id);
    expect(extractedBlob).not.toBeNull();
    expect(await extractedBlob?.text()).toBe("video binary frame data 999");
  });

  it("rejects corrupted packages gracefully without crashing", async () => {
    const ws = await localWorkspaceManager.openWorkspace(
      "ACC_TEST_CORRUPT",
      "usr-c",
      "corrupt@VDO.com",
    );
    const corruptedBlob = new Blob(["not a valid zip package content"], {
      type: "application/x-vdo",
    });

    await expect(importVDO(corruptedBlob, ws)).rejects.toThrow();
  });
});
