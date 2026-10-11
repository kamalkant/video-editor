import { coverMediaId, type Project } from "@/lib/projects/model";
import { mediaIdsOf } from "@/lib/edit/doc";
import type { IAccountWorkspace, StoredAsset } from "../types";
import { createZipArchive, type ZipEntry } from "./container";

export type VDOExportOptions = {
  portable?: boolean;
};

export type VDOEstimate = {
  totalBytes: number;
  portable: boolean;
  assetCount: number;
};

/**
 * Calculates estimated export size of an ViPlay package before building.
 */
export async function estimateVDOSize(
  project: Project,
  workspace: IAccountWorkspace,
  options?: VDOExportOptions,
): Promise<VDOEstimate> {
  const enc = new TextEncoder();
  const projJsonLen = enc.encode(JSON.stringify(project, null, 2)).length;
  let totalBytes = projJsonLen + 2048; // Base JSON and overhead

  const mediaIds = new Set<string>(mediaIdsOf(project.doc));
  try {
    const allWsAssets = await workspace.listAssets();
    for (const a of allWsAssets) {
      if (a.projectId === project.id || a.usedInProjectIds?.includes(project.id)) {
        mediaIds.add(a.id);
      }
    }
  } catch {
    // Ignore workspace list error
  }

  let assetCount = 0;

  if (options?.portable) {
    for (const id of mediaIds) {
      const asset = await workspace.getAsset(id);
      if (asset) {
        totalBytes += asset.size;
        assetCount++;
      } else if (typeof window !== "undefined" && typeof fetch !== "undefined") {
        try {
          const res = await fetch(`/api/videos/${id}/source`, { method: "HEAD" });
          const len = res.headers.get("content-length");
          if (len) {
            totalBytes += Number(len);
            assetCount++;
          }
        } catch {
          // Ignore remote check error
        }
      }
    }
  }

  return {
    totalBytes,
    portable: !!options?.portable,
    assetCount,
  };
}

/**
 * Exports a project into a structured .VDO package
 */
export async function exportVDO(
  project: Project,
  workspace: IAccountWorkspace,
  options?: VDOExportOptions,
): Promise<Blob> {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const now = new Date();

  // 1. project.json
  const projectMeta = {
    version: project.version,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    jobId: project.jobId,
  };
  entries.push({
    path: "project.json",
    data: enc.encode(JSON.stringify(projectMeta, null, 2)),
    lastModified: now,
  });

  // 2. timeline.json
  entries.push({
    path: "timeline.json",
    data: enc.encode(JSON.stringify(project.doc, null, 2)),
    lastModified: now,
  });

  // 3. metadata.json
  const mediaIds = new Set<string>(mediaIdsOf(project.doc));
  try {
    const allWsAssets = await workspace.listAssets();
    for (const a of allWsAssets) {
      if (a.projectId === project.id || a.usedInProjectIds?.includes(project.id)) {
        mediaIds.add(a.id);
      }
    }
  } catch {
    // Ignore workspace listing error
  }

  const metadata = {
    format: "VDO",
    schemaVersion: 3,
    generator: "ViPlay Studio",
    exportedAt: Date.now(),
    isPortable: !!options?.portable,
    mediaReferenceCount: mediaIds.size,
    sourceAccountCode: workspace.accountCode,
  };
  entries.push({
    path: "metadata.json",
    data: enc.encode(JSON.stringify(metadata, null, 2)),
    lastModified: now,
  });

  // 4. Thumbnails
  const coverId = coverMediaId(project.doc);
  if (coverId) {
    let thumbBlob = await workspace.getThumbnailBlob(coverId);
    if (!thumbBlob && typeof window !== "undefined" && typeof fetch !== "undefined") {
      try {
        const res = await fetch(`/api/videos/${coverId}/thumb`);
        if (res.ok) thumbBlob = await res.blob();
      } catch {
        // Ignore remote thumbnail fetch error
      }
    }
    if (thumbBlob) {
      const thumbBuf = await thumbBlob.arrayBuffer();
      entries.push({
        path: `thumbnails/${coverId}.jpg`,
        data: new Uint8Array(thumbBuf),
        lastModified: now,
      });
    }
  }

  // 5. Embedded Media (Portable ViPlay mode)
  if (options?.portable) {
    const assetManifest: StoredAsset[] = [];

    for (const id of mediaIds) {
      let asset = await workspace.getAsset(id);
      let blob = await workspace.getAssetBlob(id);

      // Fallback: If not in local workspace, try fetching from server
      if (!blob && typeof window !== "undefined" && typeof fetch !== "undefined") {
        try {
          const res = await fetch(`/api/videos/${id}/source`);
          if (res.ok) {
            blob = await res.blob();
            if (!asset) {
              let name = `${id}.mp4`;
              let type: "video" | "audio" | "image" = "video";
              let duration: number | undefined = undefined;
              let width: number | undefined = undefined;
              let height: number | undefined = undefined;
              let fps: number | undefined = undefined;

              try {
                const metaRes = await fetch(`/api/videos/${id}`);
                if (metaRes.ok) {
                  const meta = await metaRes.json();
                  if (meta?.fileName) name = meta.fileName;
                  if (meta?.kind) type = meta.kind;
                  if (meta?.info) {
                    duration = meta.info.duration;
                    width = meta.info.width;
                    height = meta.info.height;
                    fps = meta.info.fps;
                  }
                }
              } catch {
                // Ignore metadata fetch error
              }

              if (blob.type.startsWith("image/")) type = "image";
              else if (blob.type.startsWith("audio/")) type = "audio";

              asset = {
                id,
                accountCode: workspace.accountCode,
                projectId: project.id,
                type,
                name,
                mimeType: blob.type || (type === "image" ? "image/png" : type === "audio" ? "audio/mpeg" : "video/mp4"),
                size: blob.size,
                hash: "",
                storagePath: `assets/${type}s/${id}`,
                duration,
                width,
                height,
                fps,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };

              // Cache in local workspace if possible
              try {
                await workspace.saveAsset(blob, asset);
              } catch {
                // Ignore caching error
              }
            }
          }
        } catch {
          // Ignore remote media fetch error
        }
      }

      if (!asset || !blob) continue;

      const buf = await blob.arrayBuffer();
      const extMatch = asset.name.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch
        ? extMatch[0].toLowerCase()
        : asset.type === "image"
        ? ".png"
        : asset.type === "audio"
        ? ".mp3"
        : ".mp4";
      const archiveAssetPath = `assets/${asset.type}s/${asset.id}${ext}`;

      entries.push({
        path: archiveAssetPath,
        data: new Uint8Array(buf),
        lastModified: now,
      });

      assetManifest.push(asset);
    }

    entries.push({
      path: "assets/manifest.json",
      data: enc.encode(JSON.stringify(assetManifest, null, 2)),
      lastModified: now,
    });
  }

  // 6. Build ZIP Archive
  const archiveBytes = await createZipArchive(entries);
  return new Blob([archiveBytes as unknown as BlobPart], {
    type: "application/x-vdo",
  });
}
