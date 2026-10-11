"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BroadcastTemplate } from "@/lib/templates/types";
import { renderProceduralMotion } from "@/lib/templates/motionEngine";
import { BroadcastAudioEngine } from "@/lib/templates/broadcastAudioEngine";
import { drawBackdrop } from "@/lib/backdrops";
import { clipLength, type AnyClip, type ElementClip, type TextClip } from "@/lib/edit/doc";
import { drawElement } from "@/lib/elements/draw";
import { elementRect } from "@/lib/elements/geometry";
import { drawText } from "@/lib/text/render";
import { formatTime } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { AUDIO_ACCEPT, precheck, uploadVideo, VIDEO_ACCEPT, VIDEO_FORMATS } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import {
  TEMPLATE_VIDEO_CLIPS,
  TEMPLATE_AUDIO_TRACKS,
  type TemplateVideoClip,
  type TemplateAudioTrack,
} from "@/lib/templates/templateMediaAssets";

export function TemplateDetailPane({
  template,
  similarTemplates,
  onSelectSimilar,
  onUse,
  onCustomize,
  onSaveAsMine,
  onTemplateChanged,
}: {
  template: BroadcastTemplate;
  similarTemplates: BroadcastTemplate[];
  onSelectSimilar: (t: BroadcastTemplate) => void;
  onUse: (customizations?: Record<string, any>) => void;
  onCustomize: (tab: "presenter" | "background" | "text" | "branding" | "audio") => void;
  /** "Save as my template": this look with the clip / sound you picked here */
  onSaveAsMine?: (o: { video: VideoMeta | null; audio: VideoMeta | null }) => void;
  /** your template was changed here (a replaced video or sound): the library loads it again */
  onTemplateChanged?: () => void;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  // the address of a video that couldn't play here (said over the preview instead of quietly showing the motion)
  const [videoErrorUrl, setVideoErrorUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<"video" | "audio" | null>(null);
  const replaceVideoRef = useRef<HTMLInputElement>(null);
  const replaceAudioRef = useRef<HTMLInputElement>(null);
  // your template: its own frame shows while its video loads (not the motion background)
  const pictureRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!template.previewImageUrl) {
      pictureRef.current = null;
      return;
    }
    const img = new Image();
    img.src = template.previewImageUrl;
    pictureRef.current = img;
  }, [template.previewImageUrl]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Background and Audio Preview Customization State
  // (your own template starts on its own video)
  const [bgMode, setBgMode] = useState<"procedural" | "video">(template.custom ? "video" : "procedural");

  // your own template: its video and sound (files in My Assets)
  const ownClip = useMemo<TemplateVideoClip | null>(() => {
    const v = template.custom?.video;
    return v ? { id: `asset-${v.assetId}`, assetId: v.assetId, title: v.name.replace(/\.[^/.]+$/, ""), category: "Your template", url: `/api/videos/${v.assetId}/play`, thumbUrl: `/api/videos/${v.assetId}/thumb`, thumbGradient: "from-fuchsia-600 to-indigo-900", isCustom: true } : null;
  }, [template.custom]);
  const ownTrack = useMemo<TemplateAudioTrack | null>(() => {
    const a = template.custom?.audio;
    return a ? { id: `upload-${a.assetId}`, assetId: a.assetId, title: a.name.replace(/\.[^/.]+$/, ""), category: "Your template", mood: "Your sound", url: `/api/videos/${a.assetId}/source`, fileName: a.name, duration: Math.round(a.duration) || 20, isCustom: true } : null;
  }, [template.custom]);

  const defaultVideoClip = useMemo(() => {
    return (
      ownClip ||
      TEMPLATE_VIDEO_CLIPS.find((c) => c.url === template.previewVideoUrl) ||
      TEMPLATE_VIDEO_CLIPS[0]
    );
  }, [template.previewVideoUrl, ownClip]);

  const defaultAudioTrack = useMemo(() => {
    return (
      ownTrack ||
      TEMPLATE_AUDIO_TRACKS.find(
        (a) => a.id === `theme-${template.previewCanvasEngine}`
      ) ||
      TEMPLATE_AUDIO_TRACKS.find((a) =>
        a.category.toLowerCase().includes(template.category.toLowerCase())
      ) ||
      TEMPLATE_AUDIO_TRACKS[0]
    );
  }, [template.previewCanvasEngine, template.category, ownTrack]);

  const [selectedVideoClip, setSelectedVideoClip] = useState<TemplateVideoClip>(defaultVideoClip);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<TemplateAudioTrack>(defaultAudioTrack);

  // Update defaults when template changes
  useEffect(() => {
    setSelectedVideoClip(defaultVideoClip);
    setSelectedAudioTrack(defaultAudioTrack);
  }, [defaultVideoClip, defaultAudioTrack]);

  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const lastUiUpdateRef = useRef<number>(0);

  // Dedicated Web Audio Broadcast Sound Engine
  const audioEngineRef = useRef<BroadcastAudioEngine | null>(null);

  useEffect(() => {
    const engine = new BroadcastAudioEngine();
    audioEngineRef.current = engine;
    return () => {
      engine.stop();
    };
  }, []);

  // Pre-build template doc to render real layer overlays
  const doc = useMemo(() => template.build(), [template]);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Manage background video element when in "video" mode
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (bgMode === "video" && selectedVideoClip?.url) {
      if (!videoElRef.current) {
        const v = document.createElement("video");
        v.loop = true;
        v.muted = true;
        v.playsInline = true;
        // (load the picture even while paused: the preview shows its frame, not the motion)
        v.preload = "auto";
        v.addEventListener("error", () => setVideoErrorUrl(v.getAttribute("src")));
        v.addEventListener("loadeddata", () => setVideoErrorUrl((u) => (u === v.getAttribute("src") ? null : u)));
        videoElRef.current = v;
      }
      const v = videoElRef.current;
      if (v.getAttribute("src") !== selectedVideoClip.url) {
        v.setAttribute("src", selectedVideoClip.url);
        v.load();
      }
      if (isPlayingRef.current) {
        v.play().catch(() => {});
      }
    } else if (videoElRef.current) {
      videoElRef.current.pause();
    }
  }, [bgMode, selectedVideoClip?.url]);

  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (isPlaying && bgMode === "video") {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, bgMode]);

  // Render a single frame onto the preview canvas
  const renderFrame = useCallback(
    (t: number) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      try {
        const engine = template.previewCanvasEngine ?? "newsroomMatrix";

        // Reset transform and clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, cv.width, cv.height);

        // 1. Draw Background: Real MP4 Video Loop or 60fps Procedural Motion
        let videoDrawn = false;
        const v = videoElRef.current;
        // cover the preview like the video covers the canvas (no stretching)
        const cover = (src: CanvasImageSource, sw: number, sh: number) => {
          const k = Math.max(cv.width / sw, cv.height / sh);
          ctx.drawImage(src, (cv.width - sw * k) / 2, (cv.height - sh * k) / 2, sw * k, sh * k);
        };
        if (bgMode === "video" && v && v.readyState >= 2 && v.videoWidth) {
          try {
            cover(v, v.videoWidth, v.videoHeight);
            videoDrawn = true;
          } catch {
            // fallback to procedural
          }
        }
        // your template while its video loads (or can't play): its own frame
        const pic = pictureRef.current;
        if (!videoDrawn && bgMode === "video" && template.custom && pic?.complete && pic.naturalWidth) {
          cover(pic, pic.naturalWidth, pic.naturalHeight);
          videoDrawn = true;
        }

        if (!videoDrawn) {
          renderProceduralMotion(engine, ctx, cv.width, cv.height, t);
        }

        // 2. Draw template layer overlays (text, lower-thirds, badges, tickers)
        const currentDoc = docRef.current;
        if (currentDoc) {
          const W = currentDoc.canvas.width;
          const H = currentDoc.canvas.height;
          ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);

          for (const tr of [...currentDoc.tracks].reverse()) {
            if (tr.kind !== "overlay") continue;
            for (const c of tr.clips as (AnyClip & { start: number })[]) {
              const len = clipLength(c as AnyClip);
              if (t < c.start || t >= c.start + len) continue;

              if (c.type === "text") {
                drawText(ctx, c as TextClip & { start: number }, W, H);
              } else if (c.type === "element") {
                const e = c as ElementClip & { start: number };
                const into = Math.max(0, t - e.start);
                const r = elementRect(e, into, W, H);
                ctx.save();
                ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
                if (r.rot) ctx.rotate((r.rot * Math.PI) / 180);
                ctx.translate(-r.w / 2, -r.h / 2);
                drawElement(ctx, e.el, r.w, r.h, { into, len: e.duration });
                ctx.restore();
              }
            }
          }
        }
      } catch (err) {
        // Recover gracefully without breaking loop
      }
    },
    [template, bgMode]
  );

  // Reset time and play audio on template or audio track switch
  useEffect(() => {
    timeRef.current = 0;
    lastTimeRef.current = 0;
    setCurrentTime(0);

    if (isPlaying && !isMuted) {
      if (selectedAudioTrack?.url) {
        audioEngineRef.current?.playTrack(selectedAudioTrack.url, false);
      } else {
        audioEngineRef.current?.play(template.previewCanvasEngine ?? "newsroomMatrix", false);
      }
    } else {
      audioEngineRef.current?.stop();
    }

    renderFrame(0);
  }, [
    template.id,
    isPlaying,
    isMuted,
    renderFrame,
    selectedAudioTrack?.url,
    template.previewCanvasEngine,
  ]);

  // Handle play/pause audio sync
  useEffect(() => {
    if (isPlaying && !isMuted) {
      if (selectedAudioTrack?.url) {
        audioEngineRef.current?.playTrack(selectedAudioTrack.url, false);
      } else {
        audioEngineRef.current?.play(template.previewCanvasEngine ?? "newsroomMatrix", false);
      }
    } else {
      audioEngineRef.current?.stop();
    }
  }, [isPlaying, isMuted, selectedAudioTrack?.url, template.previewCanvasEngine]);

  // Handle volume change
  useEffect(() => {
    audioEngineRef.current?.setVolume(volume);
  }, [volume]);

  /**
   * "+ Upload Clip" / "+ Upload Audio": an ordinary upload (My Assets; any video kind, a playable
   * copy if needed), then remembered for the template pane so it's here again after a reload.
   */
  const uploadToPane = async (file: File, kind: "video" | "audio"): Promise<VideoMeta | null> => {
    setUploadError(null);
    const bad = precheck(file);
    if (bad) {
      setUploadError(bad === "too_big" ? "This file is too big." : kind === "video" ? `Use a video: ${VIDEO_FORMATS}.` : "Use a sound: MP3, WAV, M4A, AAC, OGG or Opus.");
      return null;
    }
    setIsUploading(true);
    try {
      const meta = await uploadVideo(file, () => undefined);
      if ((meta.kind ?? "video") !== kind) {
        setUploadError(kind === "video" ? "That's not a video." : "That's not a sound file.");
        return null;
      }
      await fetch("/api/templates/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: meta.id, kind }) }).catch(() => undefined);
      return meta;
    } catch (err) {
      setUploadError(err instanceof Error && err.message ? err.message : "The upload stopped. Try again.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  /** Your template's video or sound was deleted from My Assets (or can't play): upload another and keep the template. */
  const replaceFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: "video" | "audio") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !template.custom) return;
    setReplacing(kind);
    try {
      const meta = await uploadToPane(file, kind);
      if (!meta) return;
      const r = await fetch(`/api/templates/custom/${template.custom.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "video" ? { videoId: meta.id } : { audioId: meta.id }) });
      if (!r.ok) {
        setUploadError(((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Couldn't change the template. Try again.");
        return;
      }
      onTemplateChanged?.();
    } finally {
      setReplacing(null);
    }
  };

  // "Save as my template": the clip / sound picked here (only your own files can be saved)
  const mineVideo = bgMode === "video" && selectedVideoClip?.assetId ? selectedVideoClip : null;
  const mineAudio = selectedAudioTrack?.assetId ? selectedAudioTrack : null;
  const canSaveMine = !!onSaveAsMine && !template.custom && (!!mineVideo || !!mineAudio);
  const metaOf = async (id: string | undefined, known: unknown): Promise<VideoMeta | null> => {
    if (!id) return null;
    if (known && typeof known === "object" && "id" in known) return known as VideoMeta;
    try {
      const r = await fetch(`/api/videos/${id}`);
      return r.ok ? ((await r.json()) as VideoMeta) : null;
    } catch {
      return null;
    }
  };
  const saveAsMine = async () => {
    if (!onSaveAsMine) return;
    onSaveAsMine({ video: await metaOf(mineVideo?.assetId, mineVideo?.videoMeta), audio: await metaOf(mineAudio?.assetId, mineAudio?.audioMeta) });
  };

  const handleUse = () => {
    onUse({
      bgType: bgMode,
      selectedVideoClip,
      selectedAudioTrack,
    });
  };

  // Smooth 60fps animation loop decoupled from React state updates
  useEffect(() => {
    let active = true;

    const step = (now: number) => {
      if (!active) return;
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const delta = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      if (isPlayingRef.current) {
        let nextTime = timeRef.current + delta;
        if (nextTime >= template.duration) nextTime = 0;
        timeRef.current = nextTime;

        // Throttle React state update to ~10 times per second for scrubber
        if (now - lastUiUpdateRef.current > 100) {
          lastUiUpdateRef.current = now;
          setCurrentTime(nextTime);
        }
      }

      renderFrame(timeRef.current);
      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [template, renderFrame]);

  // Sync fullscreen state with browser events (e.g. Esc key or browser UI)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFull = !!(
        (containerRef.current && document.fullscreenElement === containerRef.current) ||
        (containerRef.current && (document as any).webkitFullscreenElement === containerRef.current)
      );
      setIsFullscreen(isCurrentlyFull);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Re-render canvas frame whenever entering/exiting fullscreen to match resolution
  useEffect(() => {
    const timer = setTimeout(() => {
      renderFrame(timeRef.current);
    }, 60);
    return () => clearTimeout(timer);
  }, [isFullscreen, renderFrame]);

  const toggleFullscreen = () => {
    const el = containerRef.current as any;
    if (!el) return;
    const isDocFull = !!(
      document.fullscreenElement === el ||
      (document as any).webkitFullscreenElement === el
    );
    if (!isDocFull) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        req.call(el).catch(() => {
          setIsFullscreen(true);
        });
      } else {
        setIsFullscreen(true);
      }
    } else {
      const exit = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).mozCancelFullScreen || (document as any).msExitFullscreen;
      if (exit) {
        exit.call(document).catch(() => {
          setIsFullscreen(false);
        });
      } else {
        setIsFullscreen(false);
      }
    }
  };

  const aspectStyle =
    template.aspectRatio === "9:16" ? "9 / 16" : template.aspectRatio === "1:1" ? "1 / 1" : "16 / 9";

  const canvasWidth = isFullscreen
    ? template.aspectRatio === "9:16"
      ? 1080
      : template.aspectRatio === "1:1"
      ? 1080
      : 1920
    : template.aspectRatio === "9:16"
    ? 360
    : template.aspectRatio === "1:1"
    ? 480
    : 640;

  const canvasHeight = isFullscreen
    ? template.aspectRatio === "9:16"
      ? 1920
      : template.aspectRatio === "1:1"
      ? 1080
      : 1080
    : template.aspectRatio === "9:16"
    ? 640
    : template.aspectRatio === "1:1"
    ? 480
    : 360;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 pb-14 border-l border-line bg-surface/40">
      {/* 1. Preview Player Container */}
      <div
        ref={containerRef}
        className={`relative flex flex-col overflow-hidden bg-black transition-all ${
          isFullscreen
            ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-none"
            : "shrink-0 rounded-xl border border-line shadow-xl"
        }`}
      >
        <div
          className={`relative mx-auto flex w-full items-center justify-center overflow-hidden bg-black transition-all ${
            isFullscreen ? "flex-1 min-h-0 h-full w-full p-4 sm:p-6" : "h-[auto] p-2"
          }`}
        >
          {isFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 z-30 flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-lg hover:bg-black/90 hover:text-white transition-all cursor-pointer"
              title="Exit Fullscreen (Esc)"
            >
              <span>✕</span>
              <span>Exit Fullscreen</span>
            </button>
          )}

          <canvas
            ref={canvasRef}
            data-testid="template-preview-canvas"
            width={canvasWidth}
            height={canvasHeight}
            className={`rounded object-contain transition-all ${
              isFullscreen
                ? "h-full w-auto max-h-full max-w-full shadow-2xl"
                : "max-h-full max-w-full shadow-md"
            }`}
            style={{ aspectRatio: aspectStyle }}
          />

          {/* your template's video is gone (deleted from My Assets) or can't play here: say so, and offer another */}
          {template.custom && (template.custom.missing?.video || (bgMode === "video" && videoErrorUrl && videoErrorUrl === selectedVideoClip?.url)) && (
            <div role="alert" data-testid="template-video-missing" className="absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded bg-black/80 p-4 text-center text-white">
              <Icon name="alert" className="size-6 text-amber-300" />
              <p className="text-sm font-semibold">{template.custom.missing?.video ? "This template's video was deleted from My Assets" : "This video can't play in the browser"}</p>
              <p className="max-w-xs text-xs text-white/75">{template.custom.missing?.video ? "Choose a new video: the template keeps its name, look and sound." : "Choose another file, or upload it again: a playable copy is made for the preview."}</p>
              <button type="button" className="btn btn-primary text-xs" disabled={replacing !== null} onClick={() => replaceVideoRef.current?.click()}>
                <Icon name="upload" className="size-3.5" /> {replacing === "video" ? "Uploading…" : "Replace video"}
              </button>
            </div>
          )}

          {/* Center Play Overlay when paused */}
          {!isPlaying && (
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              className="absolute flex size-14 items-center justify-center rounded-full bg-primary/90 text-white shadow-2xl backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
              aria-label="Play preview"
            >
              <span className="text-xl ml-1">▶</span>
            </button>
          )}
        </div>

        {/* Player Controls Bar */}
        <div
          className={`flex flex-col gap-1.5 border-t border-white/10 bg-black/90 text-white transition-all ${
            isFullscreen ? "shrink-0 px-6 py-4 backdrop-blur-md z-20" : "px-3 py-2"
          }`}
        >
          {/* Progress Scrubber */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={template.duration}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const v = Number(e.target.value);
                timeRef.current = v;
                setCurrentTime(v);
                // paused: the video shows this moment too
                const el = videoElRef.current;
                if (el && !isPlaying && bgMode === "video" && el.duration > 0) el.currentTime = v % el.duration;
                renderFrame(v);
              }}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-primary"
              aria-label="Preview timeline scrubber"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            {/* Play/Pause & Timecode */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/10 text-white transition-colors"
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <span className="font-mono text-[0.6875rem] text-white/80">
                {formatTime(currentTime)} / {formatTime(template.duration)}
              </span>

              {/* Sound Wave Indicator when playing audio */}
              {isPlaying && !isMuted && (
                <span
                  className="flex items-center gap-0.5 h-3 px-1 ml-1"
                  title="Broadcast Audio: ON"
                >
                  <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="w-0.5 h-3.5 bg-sky-400 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-0.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
              )}
            </div>

            {/* Audio & Fullscreen Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white/10 rounded-md px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const nextMuted = !isMuted;
                    setIsMuted(nextMuted);
                    audioEngineRef.current?.setMuted(nextMuted);
                    if (!nextMuted && isPlaying) {
                      // (the sound picked below, not always the look's own)
                      if (selectedAudioTrack?.url) audioEngineRef.current?.playTrack(selectedAudioTrack.url, false);
                      else audioEngineRef.current?.play(template.previewCanvasEngine ?? "newsroomMatrix", false);
                    }
                  }}
                  className="flex size-6 items-center justify-center rounded text-white/80 hover:text-white"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                >
                  {isMuted ? "🔇" : "🔊"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (isMuted && v > 0) setIsMuted(false);
                    audioEngineRef.current?.setVolume(v);
                  }}
                  className="w-14 h-1 cursor-pointer appearance-none rounded bg-white/20 accent-primary"
                  title="Volume"
                  aria-label="Volume slider"
                />
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/10 text-white/80 hover:text-white"
                aria-label={isFullscreen ? "Exit Fullscreen" : "Toggle Fullscreen"}
                title={isFullscreen ? "Exit Fullscreen (Esc)" : "Full screen"}
              >
                {isFullscreen ? "✕" : "⛶"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications & hidden inputs for custom templates */}
      {uploadError && (
        <p role="alert" className="text-xs text-danger px-1">
          {uploadError}
        </p>
      )}
      {isUploading && (
        <p className="text-xs text-muted px-1" aria-live="polite">
          Uploading…
        </p>
      )}
      {template.custom?.missing?.audio && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span>This template&apos;s sound was deleted from My Assets.</span>
          <button type="button" className="font-semibold text-link hover:underline shrink-0" disabled={replacing !== null} onClick={() => replaceAudioRef.current?.click()}>
            {replacing === "audio" ? "Uploading…" : "Replace audio"}
          </button>
        </div>
      )}
      <input ref={replaceVideoRef} type="file" accept={VIDEO_ACCEPT} className="hidden" data-testid="replace-video-input" onChange={(e) => void replaceFile(e, "video")} />
      <input ref={replaceAudioRef} type="file" accept={AUDIO_ACCEPT} className="hidden" data-testid="replace-audio-input" onChange={(e) => void replaceFile(e, "audio")} />

      {/* 3. Title, Description & Metadata */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight text-ink">{template.name}</h2>
          <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
            {template.category}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted">{template.description}</p>

        {/* Technical Badges */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="rounded bg-raised px-2 py-1 text-[0.6875rem] font-medium text-ink border border-line">
            📺 {template.resolution} Ultra HD
          </span>
          <span className="rounded bg-raised px-2 py-1 text-[0.6875rem] font-medium text-ink border border-line">
            ⏱ {formatTime(template.duration)} Duration
          </span>
          <span className="rounded bg-raised px-2 py-1 text-[0.6875rem] font-medium text-ink border border-line">
            📐 {template.aspectRatio} Ratio
          </span>
          <span className="rounded bg-raised px-2 py-1 text-[0.6875rem] font-medium text-ink border border-line">
            🎞 {template.slots.length} Ready Layers
          </span>
        </div>
      </div>

      {/* 4. Primary CTA Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={handleUse}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] hover:shadow-indigo-500/35 active:scale-[0.98]"
        >
          <span className="text-base">✨</span>
          <span>Use This Template</span>
          <span aria-hidden="true">→</span>
        </button>

        {canSaveMine && (
          <button
            type="button"
            onClick={() => void saveAsMine()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary-soft px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-primary"
          >
            <Icon name="plus" className="size-3.5" />
            <span>Save as my template</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-hover hover:border-control active:scale-[0.99]"
        >
          <span>Preview Fullscreen</span>
        </button>
      </div>

      {/* 5. Customize Template Quick Action Grid */}
      <div className="flex flex-col gap-2 pt-2 border-t border-line">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Customize Template</h3>
          <span className="text-[0.625rem] text-muted">Edit before opening</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onCustomize("presenter")}
            className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/70 p-2.5 text-left transition-all hover:border-primary hover:bg-primary-soft hover:shadow-sm"
          >
            <span className="text-base">👤</span>
            <span className="text-xs font-semibold text-ink">Change Presenter</span>
            <span className="text-[0.625rem] text-muted">AI Avatar or Upload</span>
          </button>

          <button
            type="button"
            onClick={() => onCustomize("background")}
            className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/70 p-2.5 text-left transition-all hover:border-primary hover:bg-primary-soft hover:shadow-sm"
          >
            <span className="text-base">🖼️</span>
            <span className="text-xs font-semibold text-ink">Replace Background</span>
            <span className="text-[0.625rem] text-muted">Video Loop or 3D</span>
          </button>

          <button
            type="button"
            onClick={() => onCustomize("audio")}
            className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/70 p-2.5 text-left transition-all hover:border-primary hover:bg-primary-soft hover:shadow-sm"
          >
            <span className="text-base">🎵</span>
            <span className="text-xs font-semibold text-ink">Audio & Music</span>
            <span className="text-[0.625rem] text-muted">Broadcast Soundtracks</span>
          </button>

          <button
            type="button"
            onClick={() => onCustomize("text")}
            className="flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/70 p-2.5 text-left transition-all hover:border-primary hover:bg-primary-soft hover:shadow-sm"
          >
            <span className="text-base">✏️</span>
            <span className="text-xs font-semibold text-ink">Edit Text</span>
            <span className="text-[0.625rem] text-muted">Headlines & Tickers</span>
          </button>

          <button
            type="button"
            onClick={() => onCustomize("branding")}
            className="col-span-2 flex flex-col items-start gap-1 rounded-lg border border-line bg-raised/70 p-2.5 text-left transition-all hover:border-primary hover:bg-primary-soft hover:shadow-sm"
          >
            <span className="text-base">🎨</span>
            <span className="text-xs font-semibold text-ink">Colors & Logo</span>
            <span className="text-[0.625rem] text-muted">Brand Kit & Station Bug</span>
          </button>
        </div>
      </div>

      {/* 5. Similar Templates Carousel */}
      {similarTemplates.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-line">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Similar Templates</h3>
          <div className="grid grid-cols-3 gap-2">
            {similarTemplates.slice(0, 3).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelectSimilar(st)}
                className="group flex flex-col gap-1 rounded-lg border border-line bg-surface p-1.5 text-left transition-all hover:border-primary hover:shadow-sm"
              >
                <div className="aspect-video w-full rounded bg-black/60 flex items-center justify-center text-[0.625rem] font-bold text-muted group-hover:text-primary">
                  {st.resolution}
                </div>
                <span className="truncate text-[0.6875rem] font-medium text-ink group-hover:text-primary">
                  {st.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
