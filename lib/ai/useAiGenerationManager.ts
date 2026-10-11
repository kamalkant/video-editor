"use client";

import { useCallback, useRef, useState } from "react";
import {
  findClip,
  mediaLiteOf,
  type MediaLite,
  type TimelineDoc,
} from "@/lib/edit/doc";
import {
  addGeneratingClip,
  removeGeneratingClip,
  resolveGeneratingClip,
  updateGeneratingClipProgress,
} from "@/lib/edit/docEdit";
import type { VideoMeta } from "@/lib/videos";
import type { ActiveGenerationJob, UniversalAiGenerationRequest } from "./universal";

export type AiGenerationManager = {
  jobs: Record<string, ActiveGenerationJob>;
  activeCount: number;
  startGeneration: (req: UniversalAiGenerationRequest) => Promise<string | null>;
  cancelGeneration: (clipId: string) => void;
  retryGeneration: (clipId: string) => void;
};

export function useAiGenerationManager(options: {
  doc: TimelineDoc;
  setDoc: (fn: (prev: TimelineDoc) => TimelineDoc) => void;
  onMediaResolved?: (media: MediaLite) => void;
  onAssetCreated?: () => void;
}): AiGenerationManager {
  const { doc, setDoc, onMediaResolved, onAssetCreated } = options;
  const [jobs, setJobs] = useState<Record<string, ActiveGenerationJob>>({});
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const intervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const updateJob = useCallback((clipId: string, patch: Partial<ActiveGenerationJob>) => {
    setJobs((prev) => {
      const existing = prev[clipId];
      if (!existing) return prev;
      return { ...prev, [clipId]: { ...existing, ...patch } };
    });
  }, []);

  const removeJob = useCallback((clipId: string) => {
    const timer = intervals.current.get(clipId);
    if (timer) {
      clearInterval(timer);
      intervals.current.delete(clipId);
    }
    const controller = abortControllers.current.get(clipId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(clipId);
    }
    setJobs((prev) => {
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
  }, []);

  const cancelGeneration = useCallback(
    (clipId: string) => {
      const ctrl = abortControllers.current.get(clipId);
      if (ctrl) {
        ctrl.abort();
        abortControllers.current.delete(clipId);
      }
      const timer = intervals.current.get(clipId);
      if (timer) {
        clearInterval(timer);
        intervals.current.delete(clipId);
      }
      removeJob(clipId);
      setDoc((prev) => removeGeneratingClip(prev, clipId));
    },
    [removeJob, setDoc],
  );

  /**
   * A job finished: register the media FIRST, then swap the placeholder for it.
   * Order matters — a host's `onMediaResolved` may replace the whole doc (e.g. from a
   * render-time ref); doing the swap afterwards means it can never be overwritten.
   */
  const finish = useCallback(
    (clipId: string, lite: MediaLite) => {
      const timer = intervals.current.get(clipId);
      if (timer) {
        clearInterval(timer);
        intervals.current.delete(clipId);
      }
      abortControllers.current.delete(clipId);
      onMediaResolved?.(lite);
      setDoc((prev) => resolveGeneratingClip(prev, clipId, lite));
      updateJob(clipId, { progress: 100, status: "ready" });
      onAssetCreated?.();
      setTimeout(() => removeJob(clipId), 1500);
    },
    [onAssetCreated, onMediaResolved, removeJob, setDoc, updateJob],
  );

  const startGeneration = useCallback(
    async (req: UniversalAiGenerationRequest): Promise<string | null> => {
      const prompt = req.prompt.trim();
      if (!prompt) return null;

      const mediaType = req.mediaType;
      const duration = req.options?.duration ?? (mediaType === "video" ? 6 : mediaType === "audio" ? 5 : 3);
      const aspect = req.options?.aspect ?? "16:9";
      const resolution = req.options?.resolution ?? "720p";
      const quality = req.options?.quality ?? "standard";
      const referenceImageId = req.options?.referenceImageId;
      const voice = req.options?.voice ?? "Puck";
      const style = req.options?.style ?? "";

      // 1. Determine clip ID and add generating placeholder to timeline
      let targetClipId = req.target.clipId;
      if (!targetClipId) {
        let insertedId = "";
        setDoc((prev) => {
          const res = addGeneratingClip(prev, {
            mediaType,
            prompt,
            trackId: req.target.trackId,
            at: req.target.at,
            index: req.target.index,
            duration,
            aspect,
            provider: "gemini",
            referenceImageId,
          });
          insertedId = res.clipId;
          return res.doc;
        });
        targetClipId = insertedId;
      } else {
        // Mark existing clip as generating
        setDoc((prev) =>
          updateGeneratingClipProgress(prev, targetClipId!, 0, "generating"),
        );
      }

      if (!targetClipId) return null;

      const clipId = targetClipId;
      const controller = new AbortController();
      abortControllers.current.set(clipId, controller);

      const job: ActiveGenerationJob = {
        clipId,
        mediaType,
        prompt,
        progress: 5,
        status: "generating",
        startedAt: Date.now(),
      };
      setJobs((prev) => ({ ...prev, [clipId]: job }));

      // Smooth progress ticker
      let currentProgress = 5;
      const progressTimer = setInterval(() => {
        if (currentProgress < 90) {
          const step = mediaType === "video" ? 2 : 5;
          currentProgress = Math.min(90, currentProgress + step);
          updateJob(clipId, { progress: currentProgress });
          setDoc((prev) => updateGeneratingClipProgress(prev, clipId, currentProgress, "generating"));
        }
      }, 1000);
      intervals.current.set(clipId, progressTimer);

      try {
        if (mediaType === "video") {
          const apiSeconds = resolution === "1080p" ? 8 : ([4, 6, 8].includes(duration) ? duration : 6);
          const apiResolution = apiSeconds !== 8 ? "720p" : resolution;
          const res = await fetch("/api/ai/video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              aspect,
              seconds: apiSeconds,
              tier: "standard",
              resolution: apiResolution,
              startImageId: referenceImageId || null,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.message || "Failed to start video generation");
          }

          const started = (await res.json()) as { id: string };
          updateJob(clipId, { jobId: started.id });

          // Poll Veo video status
          const checkStatus = async (): Promise<VideoMeta> => {
            while (true) {
              if (controller.signal.aborted) throw new Error("Cancelled");
              await new Promise((r) => setTimeout(r, 2000));
              const pollRes = await fetch(`/api/ai/video/${started.id}`, {
                cache: "no-store",
                signal: controller.signal,
              });
              if (!pollRes.ok) throw new Error("Video status check failed");
              const pollData = (await pollRes.json()) as {
                state: "pending" | "processing" | "done" | "failed";
                error?: string;
                media?: VideoMeta;
              };

              if (pollData.state === "done" && pollData.media) {
                return pollData.media;
              }
              if (pollData.state === "failed") {
                throw new Error(pollData.error || "Video generation failed");
              }
            }
          };

          const media = await checkStatus();
          finish(clipId, mediaLiteOf(media));
          return clipId;
        }

        if (mediaType === "image") {
          const res = await fetch("/api/ai/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              aspect,
              quality,
              purpose: "picture",
              fromId: referenceImageId || null,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.message || "Failed to generate picture");
          }

          const media = (await res.json()) as VideoMeta;
          finish(clipId, mediaLiteOf(media));
          return clipId;
        }

        if (mediaType === "audio") {
          const res = await fetch("/api/ai/audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              voice,
              style,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.message || "Failed to generate audio");
          }

          const media = (await res.json()) as VideoMeta;
          finish(clipId, mediaLiteOf(media));
          return clipId;
        }
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === "AbortError") return null;
        clearInterval(progressTimer);
        intervals.current.delete(clipId);
        const errMsg = err?.message || "Generation error";
        updateJob(clipId, { status: "failed", error: errMsg });
        setDoc((prev) => updateGeneratingClipProgress(prev, clipId, 0, "failed", errMsg));
      }

      return clipId;
    },
    [finish, setDoc, updateJob],
  );

  const retryGeneration = useCallback(
    (clipId: string) => {
      const f = findClip(doc, clipId);
      if (!f) return;
      const clip = f.clip as any;
      const gen = clip.generation;
      if (!gen) return;

      void startGeneration({
        mediaType: gen.mediaType,
        prompt: gen.prompt,
        target: { clipId },
        options: {
          aspect: gen.aspect,
          referenceImageId: gen.referenceImageId,
        },
      });
    },
    [doc, startGeneration],
  );

  return {
    jobs,
    activeCount: Object.values(jobs).filter((j) => j.status === "generating").length,
    startGeneration,
    cancelGeneration,
    retryGeneration,
  };
}
