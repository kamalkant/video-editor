"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../api/types";
import type { ProjectSummary } from "../projects/model";
import type { VideoMeta } from "../videos";
import { localWorkspaceManager, type AccountWorkspace } from "../storage/workspace";
import type { StoredAsset } from "../storage/types";

export type Asset = VideoMeta & { usedIn: { id: string; name: string }[] };

/**
 * Converts a device OPFS/IndexedDB StoredAsset to the Asset interface used by MediaPanel.
 */
function toLibraryAsset(stored: StoredAsset): Asset {
  const isImage = stored.type === "image";
  const isAudio = stored.type === "audio";
  const kind = isImage ? "image" : isAudio ? "audio" : "video";

  return {
    id: stored.id,
    kind,
    fileName: stored.name,
    createdAt: stored.createdAt,
    userId: stored.accountCode,
    info: {
      duration: stored.duration || (isImage ? 3 : 0),
      width: stored.width || (isAudio ? 0 : 1920),
      height: stored.height || (isAudio ? 0 : 1080),
      fps: stored.fps || (isImage || isAudio ? 0 : 30),
      videoCodec: isImage ? "png" : "h264",
      audioCodec: "aac",
      container: isImage ? "png" : isAudio ? "mp3" : "mp4",
      hasAudio: !isImage,
      hasVideo: !isAudio,
      rotation: 0,
      pixelFormat: "yuv420p",
    },
    suggestedKey: null,
    keyKind: null,
    usedIn: (stored.usedInProjectIds ?? []).map((id) => ({ id, name: "Project" })),
  };
}

export function useAssets(userId?: string | null, workspace?: AccountWorkspace | null) {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    try {
      let serverVideos: Asset[] = [];
      let fetchError: Error | null = null;

      try {
        const res = await fetch("/api/videos", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          serverVideos = (body as { videos: Asset[] }).videos || [];
        } else if (res.status !== 401) {
          fetchError = await toApiError(res);
        }
      } catch (err) {
        fetchError = err as Error;
      }

      // Check active local workspace for device storage assets
      const ws = workspace || localWorkspaceManager.getActiveWorkspace();
      let localAssets: Asset[] = [];
      if (ws) {
        try {
          const stored = await ws.listAssets();
          localAssets = stored.map(toLibraryAsset);
        } catch {
          // Ignore local asset read error
        }
      }

      // Merge server videos and local device assets, deduplicating by ID
      const map = new Map<string, Asset>();
      for (const sv of serverVideos) {
        map.set(sv.id, sv);
      }
      for (const la of localAssets) {
        const existing = map.get(la.id);
        if (!existing || la.createdAt >= existing.createdAt) {
          map.set(la.id, la);
        }
      }

      const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);

      if (n === seq.current) {
        if (merged.length === 0 && fetchError && userId) {
          setError(fetchError.message || "Couldn't load media assets.");
        } else {
          setItems(merged);
          setError(null);
        }
      }
    } catch (e) {
      if (n === seq.current) setError((e as Error).message || "Couldn't load media assets.");
    }
  }, [userId, workspace]);

  // Immediately clear previous account assets and refresh when user or workspace changes
  useEffect(() => {
    setItems(null);
    void refresh();
  }, [userId, workspace?.accountCode, refresh]);

  return { items, error, refresh };
}

export function useProjects(userId?: string | null, workspace?: AccountWorkspace | null) {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const n = ++seq.current;
    try {
      let serverProjects: ProjectSummary[] = [];
      let fetchError: Error | null = null;
      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          serverProjects = (body as { projects: ProjectSummary[] }).projects || [];
        } else if (res.status !== 401) {
          fetchError = await toApiError(res);
        }
      } catch (err) {
        fetchError = err as Error;
      }

      // Check active local workspace
      const ws = workspace || localWorkspaceManager.getActiveWorkspace();
      let merged: ProjectSummary[] = [...serverProjects];

      if (ws) {
        try {
          const localProjects = await ws.listProjects();
          const map = new Map<string, ProjectSummary>();
          for (const sp of serverProjects) {
            map.set(sp.id, sp);
          }
          for (const lp of localProjects) {
            const existing = map.get(lp.id);
            if (!existing || lp.updatedAt >= existing.updatedAt) {
              map.set(lp.id, lp);
            }
          }
          merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
        } catch {
          // If local query fails, fallback to server list
        }
      }

      if (n === seq.current) {
        if (merged.length === 0 && fetchError && userId) {
          setError(fetchError.message || "Couldn't load projects.");
        } else {
          setItems(merged);
          setError(null);
        }
      }
    } catch (e) {
      if (n === seq.current) setError((e as Error).message || "Couldn't load projects.");
    }
  }, [userId, workspace]);

  // Immediately clear previous account projects and refresh when user or workspace changes
  useEffect(() => {
    setItems(null);
    void refresh();
  }, [userId, workspace?.accountCode, refresh]);

  return { items, error, refresh };
}
