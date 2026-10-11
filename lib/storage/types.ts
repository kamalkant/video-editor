import type { Project, ProjectSummary } from "@/lib/projects/model";
import type { TimelineDoc } from "@/lib/edit/doc";

export type AssetType = "video" | "image" | "audio" | "generated";

export type AccountRecord = {
  accountCode: string;
  userId: string;
  email: string;
  createdAt: number;
  lastUsedAt: number;
  settings?: Record<string, unknown>;
};

export type StoredProject = Project & {
  accountCode: string;
};

export type StoredAsset = {
  id: string;
  accountCode: string;
  projectId?: string | null;
  type: AssetType;
  name: string;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  hash: string;
  storagePath: string; // relative logical path in OPFS, e.g. "assets/videos/{id}.mp4"
  createdAt: number;
  updatedAt: number;
  usedInProjectIds?: string[];
  thumbnailId?: string;
  aiMetadata?: Record<string, unknown>;
};

export type RecoverySnapshot = {
  id: string;
  accountCode: string;
  projectId: string;
  projectName: string;
  doc: TimelineDoc;
  savedAt: number;
};

export type StorageStats = {
  projectsCount: number;
  projectsBytes: number;
  videosBytes: number;
  audioBytes: number;
  imagesBytes: number;
  generatedBytes: number;
  cacheBytes: number;
  totalBytes: number;
  quotaBytes?: number;
};

export interface IAccountWorkspace {
  readonly accountCode: string;
  readonly userId: string;
  readonly email: string;

  // Projects
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<boolean>;

  // Assets
  listAssets(): Promise<StoredAsset[]>;
  getAsset(id: string): Promise<StoredAsset | null>;
  saveAsset(
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
  ): Promise<StoredAsset>;
  getAssetBlob(id: string): Promise<Blob | null>;
  getAssetUrl(id: string): Promise<string | null>;
  deleteAsset(id: string): Promise<boolean>;

  // Thumbnails
  saveThumbnail(thumbId: string, blob: Blob): Promise<void>;
  getThumbnailBlob(thumbId: string): Promise<Blob | null>;
  getThumbnailUrl(thumbId: string): Promise<string | null>;

  // Orphan Asset Management
  findOrphanAssets(): Promise<StoredAsset[]>;
  cleanOrphanAssets(): Promise<number>;

  // Crash Recovery
  getRecovery(projectId: string): Promise<RecoverySnapshot | null>;
  saveRecovery(projectId: string, projectName: string, doc: TimelineDoc): Promise<void>;
  clearRecovery(projectId: string): Promise<void>;

  // Storage Stats
  getStorageStats(): Promise<StorageStats>;

  // Lifecycle
  close(): Promise<void>;
}
