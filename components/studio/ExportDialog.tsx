"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import type { EditSpec, OutputSettings as Output } from "@/lib/edit/spec";
import type { CropInfo } from "@/lib/editor/useCropBox";
import {
  ASPECT_PRESETS,
  formatOf,
  isAudioFormat,
  isStillFormat,
  needsAlpha,
  VIDEO_PRESETS,
  type AspectPresetId,
  type ExportFormat,
  type VideoPresetId,
} from "@/lib/export/presets";
import { formatBytes, formatTime } from "@/lib/format";
import { estimateBytes, type SizeBasis } from "@/lib/export/size";
import { useExportSize } from "@/lib/editor/useExportSize";
import type { Job } from "@/lib/jobs/queue";
import type { VideoMeta } from "@/lib/videos";
import { coverMediaIdOrNull, type TimelineDoc } from "@/lib/edit/doc";
import { localSrc, localThumb } from "@/lib/media/localMedia";
import { ExportResults, ExportSummary } from "./ExportResults";
import { FormatPicker } from "./FormatPicker";
import { OutputSettings } from "./OutputSettings";

type CategoryTab = "video" | "image" | "audio" | "share";

const QUALITY_CHOICES = [
  { id: "best", label: "High", sub: "Best quality", note: "Larger size" },
  { id: "balanced", label: "Balanced", sub: "Good quality", note: "Recommended" },
  { id: "small", label: "Small", sub: "Faster export", note: "Smaller size" },
] as const;

const HAS_QUALITY: ExportFormat[] = ["mp4", "hevc", "av1", "webm", "webm-alpha", "mov-alpha", "mp3"];

const FALLBACK_THUMB =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="none">` +
      `<rect width="640" height="360" fill="#0f172a"/>` +
      `<circle cx="320" cy="180" r="44" fill="#3b82f6" fill-opacity="0.2"/>` +
      `<polygon points="312,165 336,180 312,195" fill="#3b82f6"/>` +
      `<text x="320" y="245" text-anchor="middle" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" font-weight="600">ViPlay Video Export</text>` +
    `</svg>`
  );

interface RecommendedPlatform {
  id: string;
  name: string;
  aspect: string;
  ratio: number;
  width: number;
  height: number;
  sub: string;
  icon: "youtube" | "shorts" | "instagram" | "tiktok" | "story" | "twitter";
}

const RECOMMENDED_PLATFORMS: RecommendedPlatform[] = [
  {
    id: "youtube",
    name: "YouTube",
    aspect: "16:9",
    ratio: 16 / 9,
    width: 1920,
    height: 1080,
    sub: "Best quality for YouTube and widescreen playback",
    icon: "youtube",
  },
  {
    id: "shorts",
    name: "Shorts / Reels",
    aspect: "9:16",
    ratio: 9 / 16,
    width: 1080,
    height: 1920,
    sub: "Perfect for TikTok, Instagram Reels and Shorts",
    icon: "shorts",
  },
  {
    id: "instagram",
    name: "Instagram Post",
    aspect: "1:1",
    ratio: 1,
    width: 1080,
    height: 1080,
    sub: "Square format for Instagram feed",
    icon: "instagram",
  },
  {
    id: "tiktok",
    name: "TikTok Video",
    aspect: "9:16",
    ratio: 9 / 16,
    width: 1080,
    height: 1920,
    sub: "Optimized for mobile vertical feed",
    icon: "tiktok",
  },
  {
    id: "story",
    name: "Story / Status",
    aspect: "9:16",
    ratio: 9 / 16,
    width: 1080,
    height: 1920,
    sub: "WhatsApp, Instagram & Facebook stories",
    icon: "story",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    aspect: "16:9",
    ratio: 16 / 9,
    width: 1920,
    height: 1080,
    sub: "High clarity widescreen social clip",
    icon: "twitter",
  },
];

export function ExportDialog(p: {
  open: boolean;
  onClose: () => void;
  video: VideoMeta | null;
  doc?: TimelineDoc | null;
  spec: EditSpec;
  patchOutput: (x: Partial<Output>) => void;
  job: Job | null;
  connection: "ok" | "retrying" | "gone";
  starting: boolean;
  startStatus?: string;
  startError: string | null;
  onCancel: () => void;
  onShowFinal: () => void;
  crop: CropInfo;
  project: { width: number; height: number; duration: number; transparent: boolean; at: number } | null;
  format: ExportFormat;
  onFormat: (f: ExportFormat) => void;
  blockedOf: (f: ExportFormat) => string | null;
  onGenerate: (size: VideoPresetId | null | { width: number; height: number }) => void;
  onSwitchSize: (id: VideoPresetId) => void;
  sizeBasis?: SizeBasis | null;
  hasSound?: boolean;
  master?: boolean;
  thumbUrl?: string | null;
}) {
  const [tab, setTab] = useState<CategoryTab>("video");
  const [again, setAgain] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Sizing and Aspect ratio lock state
  const pr = p.project;
  const initialW = pr?.width ?? 1920;
  const initialH = pr?.height ?? 1080;
  const [customW, setCustomW] = useState<number>(initialW);
  const [customH, setCustomH] = useState<number>(initialH);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [aspectId, setAspectId] = useState<AspectPresetId>("custom");
  const [activePreset, setActivePreset] = useState<string>("project");

  // Keep dimensions in sync when project opens or changes
  useEffect(() => {
    if (pr) {
      setCustomW(pr.width);
      setCustomH(pr.height);
      const r = pr.width / pr.height;
      if (Math.abs(r - 16 / 9) < 0.05) setAspectId("16:9");
      else if (Math.abs(r - 9 / 16) < 0.05) setAspectId("9:16");
      else if (Math.abs(r - 1) < 0.05) setAspectId("1:1");
      else if (Math.abs(r - 4 / 5) < 0.05) setAspectId("4:5");
      else setAspectId("custom");
    }
  }, [pr?.width, pr?.height]);

  const f = formatOf(p.format) ?? formatOf("mp4")!;
  const done = p.job?.state === "done";
  const running = p.starting || p.job?.state === "queued" || p.job?.state === "running";
  const packOfVideo = !!p.video && p.format === "pack";
  const blocked = pr ? p.blockedOf(p.format) : "Add a video or picture first.";

  const close = () => {
    setAgain(false);
    p.onClose();
  };

  const handleWidthChange = (val: number) => {
    const w = Math.max(16, Math.min(7680, Math.round(val)));
    setCustomW(w);
    if (aspectLocked && customW > 0 && customH > 0) {
      const ratio = customW / customH;
      setCustomH(Math.max(16, Math.min(4320, Math.round(w / ratio))));
    } else {
      setAspectId("custom");
    }
    setActivePreset("custom");
  };

  const handleHeightChange = (val: number) => {
    const h = Math.max(16, Math.min(4320, Math.round(val)));
    setCustomH(h);
    if (aspectLocked && customW > 0 && customH > 0) {
      const ratio = customW / customH;
      setCustomW(Math.max(16, Math.min(7680, Math.round(h * ratio))));
    } else {
      setAspectId("custom");
    }
    setActivePreset("custom");
  };

  const handleAspectSelect = (id: AspectPresetId) => {
    setAspectId(id);
    const preset = ASPECT_PRESETS.find((a) => a.id === id);
    if (preset?.ratio) {
      const newH = Math.max(16, Math.min(4320, Math.round(customW / preset.ratio)));
      setCustomH(newH);
    }
    setActivePreset("custom");
  };

  const handleQuickPreset = (presetId: string) => {
    setActivePreset(presetId);
    if (presetId === "project" && pr) {
      setCustomW(pr.width);
      setCustomH(pr.height);
      const r = pr.width / pr.height;
      if (Math.abs(r - 16 / 9) < 0.05) setAspectId("16:9");
      else if (Math.abs(r - 9 / 16) < 0.05) setAspectId("9:16");
      else if (Math.abs(r - 1) < 0.05) setAspectId("1:1");
      else if (Math.abs(r - 4 / 5) < 0.05) setAspectId("4:5");
      else setAspectId("custom");
      return;
    }
    const vp = VIDEO_PRESETS.find((x) => x.id === presetId);
    if (vp) {
      setCustomW(vp.width);
      setCustomH(vp.height);
      const r = vp.width / vp.height;
      if (Math.abs(r - 16 / 9) < 0.05) setAspectId("16:9");
      else if (Math.abs(r - 9 / 16) < 0.05) setAspectId("9:16");
      else if (Math.abs(r - 1) < 0.05) setAspectId("1:1");
      else if (Math.abs(r - 4 / 5) < 0.05) setAspectId("4:5");
      else setAspectId("custom");
    }
  };

  const handleRecommendedCard = (rec: RecommendedPlatform) => {
    p.onFormat("mp4");
    setTab("video");
    setCustomW(rec.width);
    setCustomH(rec.height);
    setAspectId(rec.aspect as AspectPresetId);
    setActivePreset(rec.id);
  };

  const generate = () => {
    setAgain(false);
    p.onGenerate({ width: customW, height: customH });
  };

  // Size estimation
  const busy = useExportSize(p.sizeBasis ?? null, p.open && !running && !done && !!pr);
  const sizeOf = (fmt: ExportFormat): number | null => {
    if (!pr || p.blockedOf(fmt) || (fmt === "pack" && packOfVideo)) return null;
    const s = !isAudioFormat(fmt) ? { width: customW, height: customH } : { width: pr.width, height: pr.height };
    return estimateBytes(fmt, {
      ...s,
      fps: p.sizeBasis?.fps ?? 30,
      duration: pr.duration,
      quality: p.spec.output.quality,
      hasSound: !!p.hasSound,
      bpp: busy.bpp,
      measuredAt: busy.measuredAt,
      master: p.master,
    });
  };
  // Live snapshot and media preview
  const [liveSnapshot, setLiveSnapshot] = useState<string | null>(null);

  useEffect(() => {
    if (!p.open) return;
    // 1. Try capturing live from ProgramPlayer canvas
    try {
      const canvas = document.querySelector('canvas[data-testid="program-canvas"]') as HTMLCanvasElement | null;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        if (dataUrl && dataUrl.length > 200) {
          setLiveSnapshot(dataUrl);
          return;
        }
      }
    } catch {}

    // 2. Try capturing from video element if playing/active
    try {
      const videoEl = document.querySelector("video") as HTMLVideoElement | null;
      if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        const offscreen = document.createElement("canvas");
        offscreen.width = videoEl.videoWidth;
        offscreen.height = videoEl.videoHeight;
        const ctx = offscreen.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0);
          const dataUrl = offscreen.toDataURL("image/jpeg", 0.9);
          if (dataUrl && dataUrl.length > 200) {
            setLiveSnapshot(dataUrl);
            return;
          }
        }
      }
    } catch {}
  }, [p.open]);

  const activeMediaId = p.video?.id || (p.doc ? coverMediaIdOrNull(p.doc) : null) || null;
  const clipThumb = activeMediaId ? (localThumb(activeMediaId) ?? `/api/videos/${activeMediaId}/thumb`) : null;
  const videoPlayUrl = activeMediaId ? (localSrc(activeMediaId) ?? `/api/videos/${activeMediaId}/play`) : null;

  const thumbSrc =
    liveSnapshot ||
    p.thumbUrl ||
    clipThumb ||
    (p.video?.id ? (localThumb(p.video.id) ?? `/api/videos/${p.video.id}/thumb`) : null) ||
    (activeMediaId ? `/api/videos/${activeMediaId}/thumb` : null) ||
    FALLBACK_THUMB;

  // Share handlers
  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      void navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleWebShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "My Video - Viplay Studio",
          text: "Check out this video edited with Viplay Studio!",
          url: window.location.href,
        });
      } catch {
        // user cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  if (done && p.job && !again) {
    return (
      <Dialog open={p.open} onClose={close} title="Export & Share" size="lg">
        <ExportResults job={p.job} spec={p.spec} onGenerate={generate} onShowFinal={p.onShowFinal} onAgain={() => setAgain(true)} />
      </Dialog>
    );
  }

  const primaryLabel = running
    ? p.job?.state === "queued"
      ? "Queued..."
      : `Rendering (${Math.round(((p.job as any)?.progress ?? 0) * 100)}%)...`
    : p.format === "mp4"
      ? "Make video (MP4)"
      : p.format === "pack"
        ? "Make transparent video"
        : `Make ${f.short}`;

  return (
    <Dialog open={p.open} onClose={close} size="xl" title={
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
          <svg className="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-bold leading-tight text-ink sm:text-lg">Export & Share</h2>
          <p className="text-[0.6875rem] font-normal text-muted">Choose the best format and settings for your video</p>
        </div>
      </div>
    }>
      {/* Category Tabs Pill Bar */}
      <div className="mb-3 flex items-center gap-1 rounded-xl border border-dialog-card-border bg-dialog-card p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => {
            setTab("video");
            if (isAudioFormat(p.format) || isStillFormat(p.format)) p.onFormat("mp4");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
            tab === "video"
              ? "bg-primary font-semibold text-white shadow-xs"
              : "text-muted hover:text-ink hover:bg-dialog-card-hover"
          }`}
        >
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Video</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("image");
            if (!isStillFormat(p.format) && p.format !== "gif") p.onFormat("gif");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
            tab === "image"
              ? "bg-primary font-semibold text-white shadow-xs"
              : "text-muted hover:text-ink hover:bg-dialog-card-hover"
          }`}
        >
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>Image / GIF</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("audio");
            if (!isAudioFormat(p.format)) p.onFormat("mp3");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
            tab === "audio"
              ? "bg-primary font-semibold text-white shadow-xs"
              : "text-muted hover:text-ink hover:bg-dialog-card-hover"
          }`}
        >
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span>Audio</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("share")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
            tab === "share"
              ? "bg-primary font-semibold text-white shadow-xs"
              : "text-muted hover:text-ink hover:bg-dialog-card-hover"
          }`}
        >
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Share</span>
        </button>
      </div>

      {tab === "share" ? (
        /* Dedicated Share Tab */
        <div className="flex flex-col gap-6 py-2">
          <div className="rounded-xl border border-line bg-surface-raised/40 p-5">
            <h3 className="text-base font-semibold text-ink">Share Your Project</h3>
            <p className="mt-1 text-xs text-muted">
              Share your timeline project link or export directly to popular video platforms.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? window.location.href : ""}
                className="flex-1 rounded-lg border border-control bg-canvas px-3 py-2 text-xs font-mono text-ink select-all"
              />
              <button type="button" onClick={handleCopyLink} className="btn btn-secondary text-xs shrink-0">
                {copiedLink ? "✓ Copied" : "Copy Link"}
              </button>
              <button type="button" onClick={handleWebShare} className="btn btn-primary text-xs shrink-0">
                Share Sheet
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <a
              href="https://studio.youtube.com"
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 hover:border-red-500 hover:bg-red-50/20 transition-all text-center"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-red-600 text-white font-bold text-xs">
                YT
              </div>
              <span className="text-xs font-semibold text-ink">YouTube Studio</span>
              <span className="text-[0.6875rem] text-muted">Upload 16:9 or Shorts</span>
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 hover:border-pink-500 hover:bg-pink-50/20 transition-all text-center"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white font-bold text-xs">
                IG
              </div>
              <span className="text-xs font-semibold text-ink">Instagram</span>
              <span className="text-[0.6875rem] text-muted">Reels or Feed Post</span>
            </button>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all text-center"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500 text-white font-bold text-xs">
                WA
              </div>
              <span className="text-xs font-semibold text-ink">WhatsApp</span>
              <span className="text-[0.6875rem] text-muted">Share project link</span>
            </a>
            <button
              type="button"
              onClick={generate}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 hover:border-primary hover:bg-primary-soft transition-all text-center"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-white font-bold text-xs">
                MP4
              </div>
              <span className="text-xs font-semibold text-ink">Quick Export</span>
              <span className="text-[0.6875rem] text-muted">Download local MP4</span>
            </button>
          </div>
        </div>
      ) : (
        /* Main 2-Column Studio Grid */
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_19rem]">
          {/* Left Column */}
          <div inert={running} className={`flex flex-col gap-3 ${running ? "opacity-60" : ""}`}>
            {tab === "video" && (
              /* Recommended for you Section - compact width horizontal list */
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-semibold text-ink">Recommended for you</h3>
                  <span className="text-[0.5625rem] text-muted">Scroll for more →</span>
                </div>
                <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {RECOMMENDED_PLATFORMS.map((rec) => {
                    const isRecActive =
                      activePreset === rec.id &&
                      Math.abs(customW / customH - rec.ratio) < 0.05 &&
                      p.format === "mp4";
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleRecommendedCard(rec)}
                        className={`group relative flex w-[6.75rem] sm:w-[7.25rem] shrink-0 flex-col text-left overflow-hidden rounded-xl border p-1.5 transition-all ${
                          isRecActive
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                            : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover"
                        }`}
                      >
                        <div className="relative mb-1 h-11 sm:h-12 w-full overflow-hidden rounded-lg bg-black/60 flex items-center justify-center">
                          <img
                            src={thumbSrc}
                            alt={rec.name}
                            className={
                              rec.aspect === "16:9"
                                ? "size-full object-cover transition-transform group-hover:scale-105"
                                : rec.aspect === "9:16"
                                  ? "h-full w-auto aspect-[9/16] object-cover rounded shadow-xs transition-transform group-hover:scale-105"
                                  : "h-full w-auto aspect-square object-cover rounded shadow-xs transition-transform group-hover:scale-105"
                            }
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.25 text-[0.5rem] font-bold text-white tabular-nums shadow">
                            {rec.aspect}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-[0.6875rem] text-ink">
                          {rec.icon === "youtube" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-red-600 text-[0.38rem] font-bold text-white">▶</span>
                          )}
                          {(rec.icon === "shorts" || rec.icon === "tiktok") && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-black text-[0.38rem] font-bold text-white">📱</span>
                          )}
                          {rec.icon === "instagram" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-[0.38rem] font-bold text-white">📷</span>
                          )}
                          {rec.icon === "story" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-emerald-500 text-[0.38rem] font-bold text-white">💬</span>
                          )}
                          {rec.icon === "twitter" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-sky-500 text-[0.38rem] font-bold text-white">𝕏</span>
                          )}
                          <span className="truncate">{rec.name}</span>
                        </div>
                        <p className="mt-0.5 text-[0.5625rem] text-muted leading-tight truncate">
                          {rec.width}×{rec.height}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Format Card Grid */}
            <FormatPicker
              value={p.format}
              onChange={p.onFormat}
              blockedOf={(x) => (pr ? p.blockedOf(x) : null)}
              category={tab}
              sizeOf={(x) => {
                if (running || done) return null;
                const n = sizeOf(x);
                return n === null ? null : `${formatBytes(n)}`;
              }}
            />

            {/* Quick Presets Bar */}
            {tab === "video" && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-ink">Quick presets</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickPreset("project")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "project"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <svg className="size-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">Project size</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">
                        {pr ? `${pr.width} × ${pr.height}` : "Original"}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPreset("youtube")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "youtube"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-xs bg-red-600 text-[0.45rem] font-bold text-white">
                      ▶
                    </span>
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">YouTube</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">1920 × 1080</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPreset("shorts")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "shorts"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-xs bg-black text-[0.45rem] font-bold text-white">
                      📱
                    </span>
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">Shorts / Reels</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">1080 × 1920</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPreset("portrait")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "portrait"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-xs bg-gradient-to-tr from-amber-500 to-rose-600 text-[0.45rem] font-bold text-white">
                      📷
                    </span>
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">Instagram</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">1080 × 1350</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPreset("square")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "square"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <span className="size-3 shrink-0 rounded-xs border border-current" />
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">Square</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">1080 × 1080</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePreset("custom")}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      activePreset === "custom"
                        ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-card hover:border-control hover:bg-dialog-card-hover text-ink"
                    }`}
                  >
                    <svg className="size-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                    </svg>
                    <div className="min-w-0">
                      <div className="text-[0.6875rem] font-semibold leading-tight truncate">Custom</div>
                      <div className="text-[0.5625rem] text-muted tabular-nums leading-none">Set size</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column / Output Sidebar */}
          <div className="flex flex-col gap-2.5 lg:sticky lg:top-0 lg:self-start">
            {/* Video Preview Box */}
            <div
              className="group relative h-32 sm:h-36 w-full overflow-hidden rounded-xl border border-dialog-card-border bg-black shadow-xs cursor-pointer"
              onClick={() => setPreviewPlaying((v) => !v)}
            >
              {previewPlaying && videoPlayUrl ? (
                <video
                  src={videoPlayUrl}
                  autoPlay
                  loop
                  playsInline
                  className="size-full object-contain bg-black"
                />
              ) : (
                <img
                  src={thumbSrc}
                  alt="Video Preview"
                  className="size-full object-contain bg-black"
                />
              )}
              {/* Play overlay button */}
              <div
                className={`absolute inset-0 flex items-center justify-center transition-all pointer-events-none ${
                  previewPlaying
                    ? "opacity-0 group-hover:opacity-100 bg-black/25 backdrop-blur-[1px]"
                    : "bg-black/20 backdrop-blur-[1px] group-hover:bg-black/35"
                }`}
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-white/30 text-white shadow-md backdrop-blur-md transition-transform group-hover:scale-105">
                  {previewPlaying ? (
                    <svg className="size-4.5 fill-current" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg className="ml-0.5 size-4.5 fill-current" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </div>
              </div>
              {/* Top-left live badge */}
              <span className="absolute top-1.5 left-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white/90 backdrop-blur-xs border border-white/10 pointer-events-none">
                {previewPlaying ? "● Live Preview" : "Preview"}
              </span>
              {/* Duration badge */}
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white tabular-nums shadow pointer-events-none">
                {pr ? formatTime(pr.duration) : "00:00"}
              </span>
            </div>

            {/* Output Size Section */}
            <div inert={running} className={`rounded-xl border border-dialog-card-border bg-dialog-card p-2.5 ${running ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-ink">Output size</span>
                <button
                  type="button"
                  onClick={() => setAspectLocked((l) => !l)}
                  className={`text-xs p-1 rounded hover:bg-dialog-card-hover transition-colors ${
                    aspectLocked ? "text-primary" : "text-muted"
                  }`}
                  title={aspectLocked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </div>

              {/* Numeric Inputs */}
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex-1">
                  <label className="block text-[0.625rem] text-muted mb-0.5 font-medium">Width</label>
                  <input
                    type="number"
                    min={16}
                    max={7680}
                    step={2}
                    value={customW}
                    onChange={(e) => handleWidthChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-dialog-card-border bg-dialog-header px-2 py-1 text-xs font-semibold tabular-nums text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="pt-3.5 text-muted">
                  <button
                    type="button"
                    onClick={() => setAspectLocked((l) => !l)}
                    className="p-1 rounded hover:bg-dialog-card-hover text-xs"
                    title={aspectLocked ? "Lock ratio" : "Unlock ratio"}
                  >
                    {aspectLocked ? "🔒" : "🔓"}
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-[0.625rem] text-muted mb-0.5 font-medium">Height</label>
                  <input
                    type="number"
                    min={16}
                    max={4320}
                    step={2}
                    value={customH}
                    onChange={(e) => handleHeightChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-dialog-card-border bg-dialog-header px-2 py-1 text-xs font-semibold tabular-nums text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Aspect Ratio Pills */}
              <div className="grid grid-cols-5 gap-1">
                {ASPECT_PRESETS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleAspectSelect(a.id)}
                    className={`rounded-md border py-0.5 text-[0.625rem] font-semibold transition-all ${
                      aspectId === a.id
                        ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                        : "border-dialog-card-border bg-dialog-header text-muted hover:border-control hover:text-ink"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Selector */}
            {HAS_QUALITY.includes(p.format) && !packOfVideo && (
              <div inert={running} className={`rounded-xl border border-dialog-card-border bg-dialog-card p-2 ${running ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-semibold text-ink">Quality</span>
                  <span
                    className="inline-flex items-center justify-center size-3.5 rounded-full bg-dialog-header border border-dialog-card-border text-[0.5625rem] text-muted font-normal cursor-help"
                    title="Controls output video encoding bitrate"
                  >
                    ?
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {QUALITY_CHOICES.map((q) => {
                    const isSelected = p.spec.output.quality === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => p.patchOutput({ quality: q.id })}
                        className={`flex flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 font-semibold text-primary shadow-xs ring-1 ring-primary"
                            : "border-dialog-card-border bg-dialog-header text-muted hover:border-control hover:text-ink"
                        }`}
                      >
                        <span className="text-xs font-bold leading-tight">{q.label}</span>
                        <span className="mt-0.5 text-[0.5625rem] text-muted leading-tight">{q.sub}</span>
                        <span className="text-[0.5rem] text-muted/80 leading-tight">{q.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Estimated File Size */}
            <div className="flex items-center gap-2 rounded-xl border border-dialog-card-border bg-dialog-header px-2.5 py-1.5 text-xs text-muted">
              <svg className="size-3.5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <div className="flex-1 text-[0.6875rem]">
                <span className="text-muted mr-1.5">Estimated file size</span>
                <span className="font-bold text-ink">
                  {(() => {
                    const est = sizeOf(p.format);
                    return est !== null
                      ? `~${formatBytes(est)}`
                      : `~${formatBytes(Math.round(customW * customH * 0.003 * Math.max(5, pr?.duration || 9)))}`;
                  })()}
                </span>
                <span className="ml-1 text-muted">for {Math.max(1, Math.round(pr?.duration || 9))} seconds</span>
              </div>
            </div>
              <svg className="size-3.5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <div className="flex-1 text-[0.6875rem]">
                <span className="text-muted mr-1.5">Estimated file size</span>
                <span className="font-bold text-ink">
                  {(() => {
                    const est = sizeOf(p.format);
                    return est !== null
                      ? `~${formatBytes(est)}`
                      : `~${formatBytes(Math.round(customW * customH * 0.003 * Math.max(5, pr?.duration || 9)))}`;
                  })()}
                </span>
                <span className="ml-1 text-muted">for {Math.max(1, Math.round(pr?.duration || 9))} seconds</span>
              </div>
            </div>

            {/* Primary Action Button / Progress */}
            <div className="flex flex-col gap-1.5">
              {running ? (
                <div className="flex flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary-soft/30 p-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span>{primaryLabel}</span>
                    <span className="tabular-nums font-mono text-primary">
                      {Math.round(((p.job as any)?.progress ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.round(((p.job as any)?.progress ?? 0) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={p.onCancel}
                    className="text-center text-[0.6875rem] font-medium text-danger hover:underline"
                  >
                    Cancel export
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={generate}
                  disabled={!!blocked}
                  className="btn btn-primary w-full py-2.5 text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 rounded-xl"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{primaryLabel}</span>
                </button>
              )}

              {/* Share Directly Secondary Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((o) => !o)}
                  className="btn btn-secondary w-full py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 rounded-xl"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <span>Share directly</span>
                  <span className="text-[0.625rem] text-muted">▾</span>
                </button>

                {shareMenuOpen && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 z-50 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setShareMenuOpen(false);
                        handleCopyLink();
                      }}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-canvas flex items-center gap-2"
                    >
                      <span>📋</span>
                      <span>{copiedLink ? "Link copied!" : "Copy project link"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShareMenuOpen(false);
                        void handleWebShare();
                      }}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-canvas flex items-center gap-2"
                    >
                      <span>📱</span>
                      <span>Native share sheet</span>
                    </button>
                    <a
                      href="https://studio.youtube.com"
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setShareMenuOpen(false)}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-ink hover:bg-canvas flex items-center gap-2"
                    >
                      <span>▶️</span>
                      <span>YouTube Studio</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

