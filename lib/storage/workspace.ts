import { newUuid } from "./uuid";
import { mediaIdsOf, type TimelineDoc } from "@/lib/edit/doc";
import { summaryOf, type Project, type ProjectSummary } from "@/lib/projects/model";
import {
  dbClearRecovery,
  dbDeleteAsset,
  dbDeleteProject,
  dbFindAssetByHash,
  dbGetAsset,
  dbGetProject,
  dbGetRecovery,
  dbListAssets,
  dbListProjects,
  dbSaveAccount,
  dbSaveAsset,
  dbSaveProject,
  dbSaveRecovery,
} from "./db";
import { calculateBlobHash } from "./hash";
import { opfsDelete, opfsReadBlob, opfsWriteBlob } from "./opfs";
import { saveDraftToDeviceFolder } from "./deviceFolder";
import type {
  AssetType,
  IAccountWorkspace,
  RecoverySnapshot,
  StorageStats,
  StoredAsset,
  StoredProject,
} from "./types";

const generateId = newUuid;

/**
 * AccountWorkspace enforces strict storage-level account isolation.
 * No data or media can be read, written, or deleted outside the active accountCode.
 */
export class AccountWorkspace implements IAccountWorkspace {
  readonly accountCode: string;
  readonly userId: string;
  readonly email: string;

  // Cache of created object URLs to revoke them when closing workspace
  private activeUrls = new Map<string, string>();

  constructor(accountCode: string, userId: string, email: string) {
    this.accountCode = accountCode;
    this.userId = userId;
    this.email = email;
  }

  // ---------------- Projects ----------------

  async listProjects(): Promise<ProjectSummary[]> {
    const stored = await dbListProjects(this.accountCode);
    const assets = await dbListAssets(this.accountCode);
    const assetIdSet = new Set(assets.map((a) => a.id));

    return stored.map((p) => {
      return summaryOf(p, (id) => assetIdSet.has(id));
    });
  }

  async getProject(id: string): Promise<Project | null> {
    const stored = await dbGetProject(id, this.accountCode);
    if (!stored) return null;
    const { accountCode: _, ...project } = stored;
    return project;
  }

  async saveProject(project: Project): Promise<void> {
    const stored: StoredProject = {
      ...project,
      accountCode: this.accountCode,
      updatedAt: Date.now(),
    };
    await dbSaveProject(stored);

    // Write live draft to custom Mac folder if configured
    void saveDraftToDeviceFolder(this.accountCode, project.id, project.name, project.doc).catch(() => {});

    // Update usedInProjectIds for referenced assets
    const mediaIds = mediaIdsOf(project.doc);
    const assets = await dbListAssets(this.accountCode);
    for (const asset of assets) {
      const isUsed = mediaIds.includes(asset.id);
      const usedIn = new Set(asset.usedInProjectIds ?? []);
      if (isUsed && !usedIn.has(project.id)) {
        usedIn.add(project.id);
        await dbSaveAsset({ ...asset, usedInProjectIds: Array.from(usedIn), updatedAt: Date.now() });
      } else if (!isUsed && usedIn.has(project.id)) {
        usedIn.delete(project.id);
        await dbSaveAsset({ ...asset, usedInProjectIds: Array.from(usedIn), updatedAt: Date.now() });
      }
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    // Also remove from assets usedInProjectIds
    const assets = await dbListAssets(this.accountCode);
    for (const a of assets) {
      if (a.usedInProjectIds?.includes(id)) {
        const nextUsed = a.usedInProjectIds.filter((pId) => pId !== id);
        await dbSaveAsset({ ...a, usedInProjectIds: nextUsed, updatedAt: Date.now() });
      }
    }
    await this.clearRecovery(id);
    return await dbDeleteProject(id, this.accountCode);
  }

  // ---------------- Assets ----------------

  async listAssets(): Promise<StoredAsset[]> {
    return await dbListAssets(this.accountCode);
  }

  async getAsset(id: string): Promise<StoredAsset | null> {
    return await dbGetAsset(id, this.accountCode);
  }

  async saveAsset(
    file: File | Blob,
    meta: {
      id?: string;
      name: string;
      type: AssetType;
      mimeType: string;
      duration?: number;
      width?: number;
      height?: number;
      fps?: number;
      projectId?: string;
      aiMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredAsset> {
    // 1. Content hashing for deduplication
    const hash = await calculateBlobHash(file);
    const existing = await dbFindAssetByHash(hash, this.accountCode);

    if (existing) {
      // Re-use existing asset blob; update project references if provided
      if (meta.projectId && !existing.usedInProjectIds?.includes(meta.projectId)) {
        const nextUsed = [...(existing.usedInProjectIds ?? []), meta.projectId];
        const updated = { ...existing, usedInProjectIds: nextUsed, updatedAt: Date.now() };
        await dbSaveAsset(updated);
        return updated;
      }
      return existing;
    }

    // 2. Generate asset ID and logical storage path
    const id = meta.id || generateId();
    const extMatch = meta.name.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : "";
    const storagePath = `assets/${meta.type}s/${id}${ext}`;

    // 3. Write binary to OPFS (or fallback)
    await opfsWriteBlob(this.accountCode, storagePath, file);

    // 4. Save metadata record
    const now = Date.now();
    const asset: StoredAsset = {
      id,
      accountCode: this.accountCode,
      projectId: meta.projectId ?? null,
      type: meta.type,
      name: meta.name,
      mimeType: meta.mimeType,
      size: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      hash,
      storagePath,
      createdAt: now,
      updatedAt: now,
      usedInProjectIds: meta.projectId ? [meta.projectId] : [],
      aiMetadata: meta.aiMetadata,
    };

    await dbSaveAsset(asset);
    return asset;
  }

  async getAssetBlob(id: string): Promise<Blob | null> {
    const asset = await this.getAsset(id);
    if (!asset) return null;
    return await opfsReadBlob(this.accountCode, asset.storagePath);
  }

  async getAssetUrl(id: string): Promise<string | null> {
    const cached = this.activeUrls.get(id);
    if (cached) return cached;

    const blob = await this.getAssetBlob(id);
    if (!blob) return null;

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(blob);
      this.activeUrls.set(id, url);
      return url;
    }
    return null;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const asset = await this.getAsset(id);
    if (!asset) return false;

    // Revoke cached URL if any
    const cachedUrl = this.activeUrls.get(id);
    if (cachedUrl && typeof URL !== "undefined") {
      URL.revokeObjectURL(cachedUrl);
      this.activeUrls.delete(id);
    }

    await opfsDelete(this.accountCode, asset.storagePath);
    return await dbDeleteAsset(id, this.accountCode);
  }

  // ---------------- Thumbnails ----------------

  async saveThumbnail(thumbId: string, blob: Blob): Promise<void> {
    const path = `thumbnails/${thumbId}.jpg`;
    await opfsWriteBlob(this.accountCode, path, blob);
  }

  async getThumbnailBlob(thumbId: string): Promise<Blob | null> {
    const path = `thumbnails/${thumbId}.jpg`;
    return await opfsReadBlob(this.accountCode, path);
  }

  async getThumbnailUrl(thumbId: string): Promise<string | null> {
    const key = `thumb:${thumbId}`;
    const cached = this.activeUrls.get(key);
    if (cached) return cached;

    const blob = await this.getThumbnailBlob(thumbId);
    if (!blob) return null;

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(blob);
      this.activeUrls.set(key, url);
      return url;
    }
    return null;
  }

  // ---------------- Orphan Assets ----------------

  async findOrphanAssets(): Promise<StoredAsset[]> {
    const projects = await dbListProjects(this.accountCode);
    const referencedMediaIds = new Set<string>();

    for (const p of projects) {
      for (const mId of mediaIdsOf(p.doc)) {
        referencedMediaIds.add(mId);
      }
    }

    const allAssets = await dbListAssets(this.accountCode);
    return allAssets.filter((a) => !referencedMediaIds.has(a.id));
  }

  async cleanOrphanAssets(): Promise<number> {
    const orphans = await this.findOrphanAssets();
    let cleaned = 0;
    for (const a of orphans) {
      const ok = await this.deleteAsset(a.id);
      if (ok) cleaned++;
    }
    return cleaned;
  }

  // ---------------- Crash Recovery ----------------

  async getRecovery(projectId: string): Promise<RecoverySnapshot | null> {
    return await dbGetRecovery(projectId, this.accountCode);
  }

  async saveRecovery(projectId: string, projectName: string, doc: TimelineDoc): Promise<void> {
    const snapshot: RecoverySnapshot = {
      id: `${this.accountCode}:${projectId}`,
      accountCode: this.accountCode,
      projectId,
      projectName,
      doc,
      savedAt: Date.now(),
    };
    await dbSaveRecovery(snapshot);

    // Write live recovery snapshot to custom Mac folder if configured
    void saveDraftToDeviceFolder(this.accountCode, projectId, projectName, doc).catch(() => {});
  }

  async clearRecovery(projectId: string): Promise<void> {
    await dbClearRecovery(projectId, this.accountCode);
  }

  // ---------------- Storage Stats ----------------

  async getStorageStats(): Promise<StorageStats> {
    const projects = await dbListProjects(this.accountCode);
    const assets = await dbListAssets(this.accountCode);

    let projectsBytes = 0;
    for (const p of projects) {
      projectsBytes += JSON.stringify(p).length * 2;
    }

    let videosBytes = 0;
    let audioBytes = 0;
    let imagesBytes = 0;
    let generatedBytes = 0;

    for (const a of assets) {
      switch (a.type) {
        case "video":
          videosBytes += a.size;
          break;
        case "audio":
          audioBytes += a.size;
          break;
        case "image":
          imagesBytes += a.size;
          break;
        case "generated":
          generatedBytes += a.size;
          break;
      }
    }

    const totalBytes = projectsBytes + videosBytes + audioBytes + imagesBytes + generatedBytes;

    let quotaBytes: number | undefined;
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota;
      } catch {
        // Ignore
      }
    }

    return {
      projectsCount: projects.length,
      projectsBytes,
      videosBytes,
      audioBytes,
      imagesBytes,
      generatedBytes,
      cacheBytes: 0,
      totalBytes,
      quotaBytes,
    };
  }

  // ---------------- Lifecycle ----------------

  async close(): Promise<void> {
    // Revoke all active object URLs to prevent browser memory leaks
    if (typeof URL !== "undefined") {
      for (const url of this.activeUrls.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore
        }
      }
    }
    this.activeUrls.clear();
  }
}

/**
 * Local Workspace Manager singleton
 */
class WorkspaceManager {
  private activeWorkspace: AccountWorkspace | null = null;
  private workspaces = new Map<string, AccountWorkspace>();

  async openWorkspace(accountCode: string, userId: string, email: string): Promise<AccountWorkspace> {
    // If switching accounts, close previous workspace to prevent data leaks
    if (this.activeWorkspace && this.activeWorkspace.accountCode !== accountCode) {
      await this.activeWorkspace.close();
      this.activeWorkspace = null;
    }

    let ws = this.workspaces.get(accountCode);
    if (!ws) {
      ws = new AccountWorkspace(accountCode, userId, email);
      this.workspaces.set(accountCode, ws);
    }

    // Record account in registry
    await dbSaveAccount({
      accountCode,
      userId,
      email,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    this.activeWorkspace = ws;
    return ws;
  }

  getActiveWorkspace(): AccountWorkspace | null {
    return this.activeWorkspace;
  }

  async closeActiveWorkspace(): Promise<void> {
    if (this.activeWorkspace) {
      await this.activeWorkspace.close();
      this.activeWorkspace = null;
    }
  }
}

export const localWorkspaceManager = new WorkspaceManager();
