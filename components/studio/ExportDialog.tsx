"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { formatBytes } from "@/lib/format";
import { useEta } from "@/lib/export/useEta";
import { contentCapBpp, estimateBytes, EXPORT_MAX_SIDE, EXPORT_MIN_SIDE, exportSide, type SizeBasis } from "@/lib/export/size";
import { useExportSize } from "@/lib/editor/useExportSize";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import type { Job } from "@/lib/jobs/queue";
import type { VideoMeta } from "@/lib/videos";
import { coverMediaIdOrNull, type TimelineDoc } from "@/lib/edit/doc";
import { localInfo, localThumb } from "@/lib/media/localMedia";
import { ExportResults, ExportSummary } from "./ExportResults";
import type { PreviewThumbs } from "./ExportPreview";
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

/** A picture that didn't load (e.g. a file the server hasn't got yet): the placeholder, not a broken image. */
const thumbFailed = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.startsWith("data:image/svg")) img.src = FALLBACK_THUMB;
};

interface QuickPresetOption {
  id: string;
  name: string;
  aspect: string;
  ratio: number;
  width?: number;
  height?: number;
  sub: string;
  icon: "project" | "youtube" | "shorts" | "instagram" | "portrait" | "tiktok" | "story" | "twitter" | "4k" | "720p";
}

const QUICK_PRESETS: QuickPresetOption[] = [
  {
    id: "project",
    name: "Project size",
    aspect: "Original",
    ratio: 16 / 9,
    sub: "Match original timeline resolution",
    icon: "project",
  },
  {
    id: "youtube",
    name: "YouTube",
    aspect: "16:9",
    ratio: 16 / 9,
    width: 1920,
    height: 1080,
    sub: "Best quality for YouTube widescreen playback",
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
    id: "portrait",
    name: "Instagram Portrait",
    aspect: "4:5",
    ratio: 4 / 5,
    width: 1080,
    height: 1350,
    sub: "Vertical feed 4:5 aspect ratio",
    icon: "portrait",
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
  {
    id: "4k",
    name: "4K Ultra HD",
    aspect: "16:9",
    ratio: 16 / 9,
    width: 3840,
    height: 2160,
    sub: "Crisp 3840×2160 Ultra HD export",
    icon: "4k",
  },
  {
    id: "720p",
    name: "720p Web HD",
    aspect: "16:9",
    ratio: 16 / 9,
    width: 1280,
    height: 720,
    sub: "Compact 1280×720 fast export",
    icon: "720p",
  },
];

export function ExportDialog(p: {
  open: boolean;
  onClose: () => void;
  /** downloads are named after it ("Goa trip.mp4") */
  projectName?: string | null;
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
  onGenerate: (size: VideoPresetId | null | { width: number; height: number }, at?: number) => void;
  onSwitchSize: (id: VideoPresetId) => void;
  sizeBasis?: SizeBasis | null;
  hasSound?: boolean;
  master?: boolean;
  thumbUrl?: string | null;
  /**
   * The export, played (components/studio/ExportPreview): at the export's size and format; `paused` while it's
   * made. `thumbs`: the quick presets' pictures, the same frame at their sizes.
   */
  renderPreview?: (o: { width: number; height: number; format: ExportFormat; paused: boolean; onTime: (t: number) => void; thumbs: PreviewThumbs }) => ReactNode;
}) {
  const [tab, setTab] = useState<CategoryTab>("video");
  const [again, setAgain] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [recHovered, setRecHovered] = useState(false);

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

  // Reset exporting state when export finishes or fails
  useEffect(() => {
    if (p.job?.state === "done" || p.job?.state === "failed" || p.startError) {
      setExporting(false);
    }
  }, [p.job?.state, p.startError]);

  const f = formatOf(p.format) ?? formatOf("mp4")!;
  const running = exporting || p.starting || p.job?.state === "queued" || p.job?.state === "running";
  const done = !running && p.job?.state === "done" && !again;
  const packOfVideo = !!p.video && p.format === "pack";
  const blocked = pr ? p.blockedOf(p.format) : "Add a video or picture first.";

  const getProgress = (): number => {
    if (p.job?.state === "done") return 100;
    if (!p.job || !p.job.steps || p.job.steps.length === 0) {
      return 0;
    }
    // Check if an encoding/running step is active
    const runningStep = p.job.steps.find((s) => s.state === "running");
    if (runningStep && typeof runningStep.percent === "number") {
      return Math.min(100, Math.max(0, runningStep.percent));
    }
    // Fallback: average of all steps
    const total = p.job.steps.reduce((acc, s) => acc + (s.state === "done" ? 100 : (s.percent ?? 0)), 0);
    const avg = Math.round(total / p.job.steps.length);
    return Math.min(100, Math.max(0, avg));
  };
  // (before any early return: hooks run in the same order every time)
  const eta = useEta(running, getProgress(), p.job?.id ?? null);

  const close = () => {
    setAgain(false);
    setExporting(false);
    p.onClose();
  };

  const handleWidthChange = (val: number) => {
    const w = exportSide(val);
    setCustomW(w);
    if (aspectLocked && customW > 0 && customH > 0) {
      const ratio = customW / customH;
      setCustomH(exportSide(w / ratio));
    } else {
      setAspectId("custom");
    }
    setActivePreset("custom");
  };

  const handleHeightChange = (val: number) => {
    const h = exportSide(val);
    setCustomH(h);
    if (aspectLocked && customW > 0 && customH > 0) {
      const ratio = customW / customH;
      setCustomW(exportSide(h * ratio));
    } else {
      setAspectId("custom");
    }
    setActivePreset("custom");
  };

  const handleAspectSelect = (id: AspectPresetId) => {
    setAspectId(id);
    const preset = ASPECT_PRESETS.find((a) => a.id === id);
    if (preset?.ratio) {
      const newH = exportSide(customW / preset.ratio);
      setCustomH(newH);
    }
    setActivePreset("custom");
  };

  const handleQuickPreset = (rec: QuickPresetOption) => {
    p.onFormat("mp4");
    setTab("video");
    setActivePreset(rec.id);
    if (rec.id === "project" && pr) {
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
    if (rec.id === "4k") {
      setCustomW(3840);
      setCustomH(2160);
      setAspectId("16:9");
      return;
    }
    if (rec.id === "720p") {
      setCustomW(1280);
      setCustomH(720);
      setAspectId("16:9");
      return;
    }
    if (rec.width && rec.height) {
      setCustomW(rec.width);
      setCustomH(rec.height);
      setAspectId(rec.aspect as AspectPresetId);
    }
  };

  // the frame the preview was stopped on (a PNG / JPG is a picture of it; else the editor's playhead)
  const [previewAt, setPreviewAt] = useState<number | undefined>(undefined);
  // each quick preset's picture: that frame as its export would have it (drawn by the preview), by `${w}x${h}`
  const [presetPics, setPresetPics] = useState<Record<string, string>>({});
  const presetSize = (rec: QuickPresetOption) =>
    rec.id === "project" ? { width: pr?.width ?? 1920, height: pr?.height ?? 1080 } : { width: rec.width ?? 1920, height: rec.height ?? 1080 };
  const generate = () => {
    setAgain(false);
    setExporting(true);
    p.onGenerate({ width: customW, height: customH }, previewAt);
  };

  // Size estimation
  const { safariAlpha } = useServerCaps();
  const busy = useExportSize(p.sizeBasis ?? null, p.open && !running && !done && !!pr);
  // the clips' own bitrate: the export is never made heavier (the same cap as lib/export/localExport)
  const capBpp = p.open && p.doc ? contentCapBpp(p.doc, localInfo, { width: customW, height: customH }) : null;
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
      capBpp,
      master: p.master,
      transparent: pr.transparent,
      safariAlpha,
    });
  };
  const activeMediaId = p.video?.id || (p.doc ? coverMediaIdOrNull(p.doc) : null) || null;
  const thumbSrc =
    p.thumbUrl ||
    (activeMediaId ? (localThumb(activeMediaId) ?? `/api/videos/${activeMediaId}/thumb`) : null) ||
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
      <Dialog open={p.open} onClose={close} title="Export & Share" size="md">
        <ExportResults job={p.job} spec={p.spec} onGenerate={generate} onShowFinal={p.onShowFinal} onAgain={() => setAgain(true)} projectName={p.projectName} />
      </Dialog>
    );
  }

  const progressPct = getProgress();

  const primaryLabel = running
    ? p.job?.state === "queued"
      ? "Queued in background..."
      : p.starting && !p.job
        ? (p.startStatus || "Preparing media assets…")
        : `Rendering (${progressPct}%)...`
    : p.format === "mp4"
      ? "Make video (MP4)"
      : p.format === "pack"
        ? "Make transparent video"
        : `Make ${f.short}`;

  return (
    <Dialog open={p.open} onClose={close} size="4xl" title={
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
      {/* Main 2-Column Studio Grid */}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_17.5rem]">
        {/* Left Column */}
        <div inert={running} className={`flex flex-col gap-2.5 ${running ? "opacity-60" : ""}`}>
          {/* Category Tabs Pill Bar with comfortable height inside left column */}
          <div className="flex items-center gap-1 rounded-xl border border-dialog-card-border bg-dialog-card p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setTab("video");
                if (isAudioFormat(p.format) || isStillFormat(p.format)) p.onFormat("mp4");
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs transition-all ${
                tab === "video"
                  ? "bg-primary font-bold text-white shadow-xs"
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs transition-all ${
                tab === "image"
                  ? "bg-primary font-bold text-white shadow-xs"
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs transition-all ${
                tab === "audio"
                  ? "bg-primary font-bold text-white shadow-xs"
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs transition-all ${
                tab === "share"
                  ? "bg-primary font-bold text-white shadow-xs"
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
            /* Dedicated Share Tab inside Left Column */
            <div className="flex flex-col gap-3 py-1">
              <div className="rounded-xl border border-dialog-card-border bg-dialog-card p-3">
                <h3 className="text-xs font-semibold text-ink">Project Link</h3>
                <p className="mt-0.5 text-[0.625rem] text-muted">
                  Share this project link directly with collaborators or clients.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.href : ""}
                    className="flex-1 rounded-lg border border-dialog-card-border bg-canvas px-2.5 py-1.5 text-xs font-mono text-ink select-all"
                  />
                  <button type="button" onClick={handleCopyLink} className="btn btn-secondary text-xs shrink-0 py-1.5 px-2.5">
                    {copiedLink ? "✓ Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={handleWebShare} className="btn btn-primary text-xs shrink-0 py-1.5 px-2.5">
                    Share
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href="https://studio.youtube.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dialog-card-border bg-dialog-card p-3 hover:border-red-500 hover:bg-red-50/10 transition-all text-center"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-red-600 text-white font-bold text-xs">
                    YT
                  </div>
                  <span className="text-xs font-semibold text-ink">YouTube Studio</span>
                  <span className="text-[0.625rem] text-muted">Upload 16:9 or Shorts</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dialog-card-border bg-dialog-card p-3 hover:border-pink-500 hover:bg-pink-50/10 transition-all text-center"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white font-bold text-xs">
                    IG
                  </div>
                  <span className="text-xs font-semibold text-ink">Instagram</span>
                  <span className="text-[0.625rem] text-muted">Reels or Feed Post</span>
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dialog-card-border bg-dialog-card p-3 hover:border-emerald-500 hover:bg-emerald-50/10 transition-all text-center"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-xs">
                    WA
                  </div>
                  <span className="text-xs font-semibold text-ink">WhatsApp</span>
                  <span className="text-[0.625rem] text-muted">Share project link</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    p.onFormat("mp4");
                    setTab("video");
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dialog-card-border bg-dialog-card p-3 hover:border-primary hover:bg-primary/10 transition-all text-center"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-white font-bold text-xs">
                    MP4
                  </div>
                  <span className="text-xs font-semibold text-ink">Quick Export</span>
                  <span className="text-[0.625rem] text-muted">Download local MP4</span>
                </button>
              </div>
            </div>
          ) : (
            <>
            {tab === "video" && (
              /* Quick presets carousel */
              <div
                onMouseEnter={() => setRecHovered(true)}
                onMouseLeave={() => setRecHovered(false)}
                className="rounded-xl border border-dialog-card-border bg-dialog-card p-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <h3 className="text-xs font-semibold text-ink">Quick presets</h3>
                  <span className="text-[0.5625rem] text-muted">Scroll for more →</span>
                </div>
                <div className={`scrollbar-hover-visible ${recHovered ? "scrollbar-active" : ""} flex items-stretch gap-2 overflow-x-auto pt-0.5 pb-2.5 px-0.5`}>
                  {QUICK_PRESETS.map((rec) => {
                    const isRecActive =
                      activePreset === rec.id &&
                      p.format === "mp4";
                    const isProject = rec.id === "project";
                    const { width: itemW, height: itemH } = presetSize(rec);
                    const displayAspect = isProject
                      ? (() => {
                          if (!pr) return "16:9";
                          const r = pr.width / pr.height;
                          if (Math.abs(r - 16 / 9) < 0.05) return "16:9";
                          if (Math.abs(r - 9 / 16) < 0.05) return "9:16";
                          if (Math.abs(r - 1) < 0.05) return "1:1";
                          if (Math.abs(r - 4 / 5) < 0.05) return "4:5";
                          return `${pr.width}×${pr.height}`;
                        })()
                      : rec.aspect;

                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleQuickPreset(rec)}
                        className={`group relative flex w-[6.75rem] sm:w-[7.25rem] shrink-0 flex-col text-left overflow-hidden rounded-xl border p-1.5 transition-all ${
                          isRecActive
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                            : "border-dialog-border bg-dialog-header/50 hover:border-control hover:bg-dialog-card-hover"
                        }`}
                      >
                        <div className="relative mb-1 h-11 sm:h-12 w-full overflow-hidden rounded-lg bg-black/60 flex items-center justify-center">
                          {/* the export at this size (until it's drawn: the video's picture) */}
                          {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn here */}
                          <img
                            src={presetPics[`${itemW}x${itemH}`] ?? thumbSrc}
                            alt=""
                            onError={thumbFailed}
                            style={{ aspectRatio: `${itemW} / ${itemH}` }}
                            className="h-full w-auto max-w-full rounded object-cover shadow-xs ring-1 ring-white/20 transition-transform group-hover:scale-105"
                            data-testid="preset-thumb"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.25 text-[0.5rem] font-bold text-white tabular-nums shadow">
                            {displayAspect}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-[0.6875rem] text-ink">
                          {rec.icon === "project" && (
                            <svg className="size-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                              <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                              <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                            </svg>
                          )}
                          {rec.icon === "youtube" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-red-600 text-[0.38rem] font-bold text-white">▶</span>
                          )}
                          {(rec.icon === "shorts" || rec.icon === "tiktok") && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-black text-[0.38rem] font-bold text-white">📱</span>
                          )}
                          {(rec.icon === "instagram" || rec.icon === "portrait") && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-[0.38rem] font-bold text-white">📷</span>
                          )}
                          {rec.icon === "story" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-emerald-500 text-[0.38rem] font-bold text-white">💬</span>
                          )}
                          {rec.icon === "twitter" && (
                            <span className="flex size-3 shrink-0 items-center justify-center rounded-xs bg-sky-500 text-[0.38rem] font-bold text-white">𝕏</span>
                          )}
                          {rec.icon === "4k" && (
                            <span className="rounded bg-indigo-500/20 px-1 py-0.25 text-[0.45rem] font-bold text-indigo-400">4K</span>
                          )}
                          {rec.icon === "720p" && (
                            <span className="rounded bg-sky-500/20 px-1 py-0.25 text-[0.45rem] font-bold text-sky-400">HD</span>
                          )}
                          <span className="truncate">{rec.name}</span>
                        </div>
                        <p className="mt-0.5 text-[0.5625rem] text-muted leading-tight truncate">
                          {itemW}×{itemH}
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
          </>
        )}
      </div>

      {/* Right Column / Output Sidebar */}
          <div className="flex flex-col gap-2.5 lg:sticky lg:top-0 lg:self-start">
            {/* The export, played: every clip, text, animation, transition and effect, at the export's size */}
            <div className="rounded-xl border border-dialog-card-border bg-dialog-card/80 p-1.5 shadow-xs">
              {p.renderPreview && pr ? (
                p.renderPreview({
                  width: customW,
                  height: customH,
                  format: p.format,
                  paused: running,
                  onTime: setPreviewAt,
                  // (the quick presets make MP4s)
                  thumbs: { sizes: QUICK_PRESETS.map(presetSize), format: "mp4", onPictures: setPresetPics },
                })
              ) : (
                <div className="flex h-36 items-center justify-center sm:h-40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail */}
                  <img src={thumbSrc} alt="" onError={thumbFailed} className="max-h-full max-w-full rounded-lg object-contain" />
                </div>
              )}
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
                    min={EXPORT_MIN_SIDE}
                    max={EXPORT_MAX_SIDE}
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
                    min={EXPORT_MIN_SIDE}
                    max={EXPORT_MAX_SIDE}
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

            {/* Primary Action Button / Progress */}
            <div className="flex flex-col gap-1.5">
              {running ? (
                <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-primary" />
                      </span>
                      <span>{primaryLabel}</span>
                    </span>
                    <span className="tabular-nums font-mono text-primary font-bold text-xs">
                      {progressPct}%
                    </span>
                  </div>
                  <div className="-mt-1 min-h-4 text-[0.6875rem] text-muted" aria-live="polite">
                    {eta}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60">
                    <div
                      className="h-full transition-all duration-200 rounded-full bg-primary"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExporting(false);
                      p.onCancel();
                    }}
                    className="text-center text-[0.6875rem] font-medium text-danger hover:underline pt-0.5"
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
    </Dialog>
  );
}

