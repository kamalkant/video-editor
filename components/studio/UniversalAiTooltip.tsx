"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { UniversalAiGenerationRequest, UniversalMediaType } from "@/lib/ai/universal";
import { GEMINI_VOICES } from "@/lib/ai/voices";
import { useResolvedTheme, setTheme } from "@/lib/editor/theme";

const INSPIRATION_CHIPS: Record<UniversalMediaType, string[]> = {
  video: [
    "A modern newsroom with a presenter, dynamic camera movement, professional lighting...",
    "Cinematic drone flyover sunset coastline with crashing turquoise waves",
    "Slow-motion macro coffee pour into clear glass with morning sunlight",
    "Futuristic cyberpunk city street at night in heavy rain, neon reflections",
  ],
  image: [
    "Crisp 3D render of a modern cozy studio workstation, octane render 8k",
    "Dramatic cinematic portrait with atmospheric fog and rim lighting",
    "Aerial view of autumn forest canopy with winding mountain river",
  ],
  audio: [
    "Welcome back everyone. Today we dive into the future of video creation.",
    "Breaking news update: major breakthroughs in artificial intelligence today.",
    "A serene and calming meditation guide for deep relaxation and focus.",
  ],
};

export type UniversalAiTooltipProps = {
  isOpen: boolean;
  onClose: () => void;
  anchor?: { x: number; y: number } | null;
  target?: {
    trackId?: string;
    index?: number;
    at?: number;
    clipId?: string;
    targetDescription?: string;
  };
  initialMediaType?: UniversalMediaType;
  initialPrompt?: string;
  projectAssets?: Array<{ id: string; fileName?: string; kind?: string }>;
  onOpenStock?: () => void;
  onOpenPexels?: () => void;
  onGenerate: (req: UniversalAiGenerationRequest) => void;
};

export function UniversalAiTooltip({
  isOpen,
  onClose,
  anchor,
  target,
  initialMediaType = "video",
  initialPrompt = "",
  projectAssets = [],
  onOpenStock,
  onOpenPexels,
  onGenerate,
}: UniversalAiTooltipProps) {
  const openStockAction = onOpenStock || onOpenPexels;
  // (the theme showing: "Match my computer" follows the computer's light or dark)
  const isDark = useResolvedTheme() === "dark";

  const [mediaType, setMediaType] = useState<UniversalMediaType>(initialMediaType);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [videoDuration, setVideoDuration] = useState<4 | 6 | 8 | 10>(6);
  const [videoResolution, setVideoResolution] = useState<"720p" | "1080p">("1080p");
  const [hasAudio, setHasAudio] = useState(true);
  const [imageStyle, setImageStyle] = useState<"Cinematic" | "Realistic" | "Anime" | "3D Render">("Cinematic");
  const [voice, setVoice] = useState("Puck");
  const [audioStyle, setAudioStyle] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);

  // Dropdown open states
  const [activeMenu, setActiveMenu] = useState<
    "mode" | "aspect" | "resolution" | "duration" | "style" | "voice" | "attach" | null
  >(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number; pointerLeft: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMediaType(initialMediaType);
      setPrompt(initialPrompt);
      setActiveMenu(null);
      setShowAssetPicker(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen, initialMediaType, initialPrompt]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setShowAssetPicker(false);
      }
    };
    if (activeMenu) {
      window.addEventListener("mousedown", handleOutside);
      return () => window.removeEventListener("mousedown", handleOutside);
    }
  }, [activeMenu]);

  // Anchor positioning
  useEffect(() => {
    if (!isOpen || !anchor || typeof window === "undefined") {
      setCoords(null);
      return;
    }
    const width = Math.min(540, window.innerWidth - 32);
    let left = anchor.x - width / 2;
    if (left < 16) left = 16;
    if (left + width > window.innerWidth - 16) left = window.innerWidth - width - 16;
    const pointerLeft = Math.max(24, Math.min(width - 24, anchor.x - left));

    // Place popover ABOVE the anchor by default
    if (anchor.y > 340) {
      const bottom = Math.max(16, window.innerHeight - anchor.y + 14);
      setCoords({ left, bottom, pointerLeft });
    } else {
      const top = Math.max(16, anchor.y + 14);
      setCoords({ left, top, pointerLeft });
    }
  }, [isOpen, anchor]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (activeMenu) {
          setActiveMenu(null);
          setShowAssetPicker(false);
        } else {
          onClose();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmitting();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen) return null;

  const handleSubmitting = () => {
    const finalPrompt =
      prompt.trim() ||
      (mediaType === "video"
        ? "A modern newsroom with a presenter, dynamic camera movement, professional lighting..."
        : mediaType === "image"
          ? "Crisp 3D render of a modern cozy studio workstation, octane render 8k"
          : "Welcome back everyone. Today we dive into the future of video creation.");

    let targetTrackId = target?.trackId;
    if (mediaType === "audio" && (!targetTrackId || targetTrackId === "main")) {
      targetTrackId = "audio";
    } else if (mediaType !== "audio" && targetTrackId === "audio") {
      targetTrackId = "main";
    }

    onGenerate({
      mediaType,
      prompt: finalPrompt,
      target: {
        trackId: targetTrackId,
        index: target?.index,
        at: target?.at,
        clipId: target?.clipId,
      },
      options: {
        duration: mediaType === "video" ? videoDuration : mediaType === "audio" ? 5 : 3,
        aspect,
        resolution: videoResolution,
        quality: "hd",
        voice: mediaType === "audio" ? voice : undefined,
        style: mediaType === "audio" && audioStyle ? audioStyle : mediaType === "image" ? imageStyle : undefined,
        hasAudio,
        referenceImageId: referenceAssetId || referenceImage || undefined,
      },
    });

    onClose();
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReferenceImage(reader.result);
        setReferenceAssetId(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const attachableAssets = (projectAssets || []).filter(
    (a) => a.kind === "image" || a.kind === "video"
  );

  const cardWidth = typeof window !== "undefined" ? Math.min(540, window.innerWidth - 32) : 540;

  const cardContent = (
    <div
      ref={menuRef}
      data-testid="universal-ai-card"
      className={`relative w-full rounded-[22px] border p-3.5 sm:p-4 shadow-2xl transition-all select-none font-sans ${
        isDark
          ? "border-line bg-surface text-ink shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
          : "border-line bg-white text-ink shadow-[0_16px_48px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.04)]"
      }`}
      style={{ width: cardWidth }}
    >
      {/* 1. Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Purple 4-point Sparkle */}
          <span className="flex size-5 items-center justify-center text-purple-600">
            <svg className="size-4.5 fill-purple-600" viewBox="0 0 24 24">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </span>

          {/* Provider / Title */}
          <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-85 transition-opacity">
            <h2
              className={`text-[0.9375rem] font-semibold tracking-tight ${
                isDark ? "text-ink" : "text-ink"
              }`}
            >
              Generate with Gemini
            </h2>
            <Icon
              name="chevronDown"
              className={`size-3.5 ${isDark ? "text-muted" : "text-muted"}`}
            />
          </div>

          {target?.targetDescription && (
            <span
              className={`ml-1.5 hidden rounded-md px-2 py-0.5 text-2xs font-medium sm:inline ${
                isDark
                  ? "border border-line bg-raised text-muted"
                  : "bg-raised text-muted"
              }`}
            >
              {target.targetDescription}
            </span>
          )}
        </div>

        {/* Right Header Buttons: Theme Toggle & Close */}
        <div className="flex items-center gap-1">
          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
              isDark
                ? "text-muted hover:bg-hover hover:text-amber-300"
                : "text-muted hover:bg-hover hover:text-ink"
            }`}
          >
            <Icon name={isDark ? "sun" : "moon"} className="size-4" />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
              isDark
                ? "text-muted hover:bg-hover hover:text-ink"
                : "text-muted hover:bg-hover hover:text-muted"
            }`}
            title="Close (Esc)"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      </div>

      {/* 2. Compact Prompt Container with Reference Image Box */}
      <div className="mb-2.5 flex items-stretch gap-2.5">
        {/* Left: Attachment Box with Dropdown Menu */}
        <div className="relative shrink-0">
          <div
            onClick={() => setActiveMenu(activeMenu === "attach" ? null : "attach")}
            className={`relative flex size-[66px] flex-col items-center justify-center rounded-2xl border transition-all cursor-pointer group ${
              isDark
                ? "border-line bg-raised hover:border-line hover:bg-hover"
                : "border-line bg-raised hover:bg-hover"
            }`}
            title={referenceImage ? "Attachment options (Click to change)" : "Attach reference image for Image-to-Video"}
          >
            {referenceImage ? (
              <div className="relative size-full overflow-hidden rounded-2xl">
                <img src={referenceImage} alt="Ref" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReferenceImage(null);
                    setReferenceAssetId(null);
                  }}
                  className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded-full bg-surface/85 text-white hover:bg-hover shadow-xs"
                  title="Remove image"
                >
                  <Icon name="close" className="size-3" />
                </button>
              </div>
            ) : (
              <div className="relative flex items-center justify-center">
                <Icon
                  name="image"
                  className={`size-6 ${isDark ? "text-muted" : "text-ink"}`}
                  strokeWidth={1.8}
                />
                <span
                  className={`absolute -top-1.5 -right-2 text-xs font-bold leading-none ${
                    isDark ? "text-muted" : "text-ink"
                  }`}
                >
                  +
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageFileChange}
              className="hidden"
            />
          </div>

          {/* Attachment Options Popover */}
          {activeMenu === "attach" && (
            <div
              className={`absolute top-full left-0 mt-1.5 z-40 w-64 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 ${
                isDark
                  ? "border-line bg-surface text-ink"
                  : "border-line bg-white text-ink"
              }`}
            >
              {/* Option 1: Upload from computer */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  fileInputRef.current?.click();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  isDark ? "text-ink hover:bg-hover" : "text-ink hover:bg-hover"
                }`}
              >
                <Icon name="upload" className="size-4 text-link" />
                <span>Upload from computer</span>
              </button>

              {/* Option 2: Choose from Project Assets */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssetPicker((prev) => !prev)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    isDark ? "text-ink hover:bg-hover" : "text-ink hover:bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon name="media" className="size-4 text-purple-500" />
                    <span>Choose from Project Assets</span>
                  </span>
                  <Icon
                    name={showAssetPicker ? "chevronDown" : "chevronRight"}
                    className="size-3 text-muted"
                  />
                </button>

                {showAssetPicker && (
                  <div
                    className={`mt-1 max-h-40 overflow-y-auto rounded-lg border p-1.5 ${
                      isDark ? "border-line bg-surface" : "border-line bg-raised"
                    }`}
                  >
                    {attachableAssets.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {attachableAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => {
                              setReferenceImage(`/api/videos/${asset.id}/thumb`);
                              setReferenceAssetId(asset.id);
                              setShowAssetPicker(false);
                              setActiveMenu(null);
                            }}
                            className={`group relative aspect-video overflow-hidden rounded-md border transition-all cursor-pointer ${
                              referenceAssetId === asset.id
                                ? "border-primary ring-2 ring-primary"
                                : isDark
                                  ? "border-line hover:border-line"
                                  : "border-line hover:border-line"
                            }`}
                            title={asset.fileName || "Asset"}
                          >
                            <img
                              src={`/api/videos/${asset.id}/thumb`}
                              alt={asset.fileName || "Asset"}
                              className="size-full object-cover transition-transform group-hover:scale-105"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2 text-center text-2xs text-muted">
                        No project images or videos yet
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Option 3: Stock Images (Pixabay) */}
              {openStockAction && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    openStockAction();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    isDark ? "text-ink hover:bg-hover" : "text-ink hover:bg-hover"
                  }`}
                >
                  <Icon name="search" className="size-4 text-emerald-500" />
                  <span>Stock Images (Pixabay)</span>
                </button>
              )}

              {/* Remove attachment */}
              {referenceImage && (
                <button
                  type="button"
                  onClick={() => {
                    setReferenceImage(null);
                    setReferenceAssetId(null);
                    setActiveMenu(null);
                  }}
                  className={`mt-1 flex w-full items-center gap-2.5 rounded-lg border-t px-3 py-2 text-xs font-medium text-rose-500 transition-colors cursor-pointer ${
                    isDark
                      ? "border-line hover:bg-hover"
                      : "border-line hover:bg-hover"
                  }`}
                >
                  <Icon name="close" className="size-4 text-rose-500" />
                  <span>Remove attachment</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Prompt Textarea with Character Counter */}
        <div
          className={`relative flex min-h-[66px] flex-1 flex-col justify-between rounded-2xl border p-2.5 pb-5.5 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] ${
            isDark
              ? "border-line bg-raised text-ink focus-within:border-primary focus-within:ring-2 focus-within:ring-primary"
              : "border-line bg-white text-ink focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
            rows={2}
            placeholder={
              mediaType === "video"
                ? "A modern newsroom with a presenter, dynamic camera movement, professional lighting..."
                : mediaType === "image"
                  ? "Crisp 3D render of a modern cozy studio workstation, octane render 8k"
                  : "Welcome back everyone. Today we dive into the future of video creation."
            }
            className={`w-full resize-none border-0 bg-transparent p-0 text-xs sm:text-[0.8125rem] placeholder:text-muted focus:outline-none focus:ring-0 leading-relaxed font-normal ${
              isDark ? "text-ink" : "text-ink"
            }`}
          />

          {/* Character counter (72/500 style) */}
          <span className="pointer-events-none absolute bottom-1.5 right-3 text-2xs font-medium text-muted select-none tabular-nums">
            {prompt.length ? `${prompt.length}/500` : "72/500"}
          </span>
        </div>
      </div>

      {/* 3. Compact Bottom Row: Pills on Left, Generate on Right Bottom (Guaranteed Single Row) */}
      <div className="relative flex items-center justify-between gap-1.5 pt-0.5 flex-nowrap">
        {/* Left Pills Group */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap shrink-0">
          {/* Mode Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveMenu(activeMenu === "mode" ? null : "mode")}
              className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                activeMenu === "mode"
                  ? isDark
                    ? "border-primary bg-primary/20 text-link"
                    : "border-blue-300 bg-primary-soft/70 text-link"
                  : isDark
                    ? "border-transparent bg-raised text-ink hover:bg-hover"
                    : "border-transparent bg-raised text-ink hover:bg-hover"
              }`}
            >
              <Icon
                name={mediaType === "video" ? "video" : mediaType === "image" ? "image" : "mic"}
                className={`size-3.5 ${isDark ? "text-muted" : "text-ink"}`}
              />
              <span className="capitalize">{mediaType === "video" ? "Video" : mediaType === "image" ? "Image" : "Audio"}</span>
              <Icon name="chevronDown" className="size-3 text-muted" />
            </button>

            {activeMenu === "mode" && (
              <div
                className={`absolute top-full left-0 mt-1.5 z-30 min-w-[150px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                  isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMediaType("video");
                    setActiveMenu(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    mediaType === "video"
                      ? isDark
                        ? "bg-primary/30 text-link"
                        : "bg-primary-soft text-link"
                      : isDark
                        ? "text-muted hover:bg-hover"
                        : "text-ink hover:bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="video" className="size-3.5" />
                    <span>AI Video</span>
                  </span>
                  {mediaType === "video" && <span className="text-link font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMediaType("image");
                    setActiveMenu(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    mediaType === "image"
                      ? isDark
                        ? "bg-primary/30 text-link"
                        : "bg-primary-soft text-link"
                      : isDark
                        ? "text-muted hover:bg-hover"
                        : "text-ink hover:bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="image" className="size-3.5" />
                    <span>AI Image</span>
                  </span>
                  {mediaType === "image" && <span className="text-link font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMediaType("audio");
                    setActiveMenu(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    mediaType === "audio"
                      ? isDark
                        ? "bg-primary/30 text-link"
                        : "bg-primary-soft text-link"
                      : isDark
                        ? "text-muted hover:bg-hover"
                        : "text-ink hover:bg-hover"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon name="mic" className="size-3.5" />
                    <span>Voice / Speech</span>
                  </span>
                  {mediaType === "audio" && <span className="text-link font-bold">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Aspect Ratio Pill (Video / Image) */}
          {mediaType !== "audio" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === "aspect" ? null : "aspect")}
                className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                  activeMenu === "aspect"
                    ? isDark
                      ? "border-primary bg-primary/20 text-link"
                      : "border-blue-300 bg-primary-soft/70 text-link"
                    : isDark
                      ? "border-transparent bg-raised text-ink hover:bg-hover"
                      : "border-transparent bg-raised text-ink hover:bg-hover"
                }`}
              >
                <span className="size-3.5 rounded-[2px] border border-current flex items-center justify-center text-[7px] font-bold">
                  □
                </span>
                <span>{aspect}</span>
                <Icon name="chevronDown" className="size-3 text-muted" />
              </button>

              {activeMenu === "aspect" && (
                <div
                  className={`absolute top-full left-0 mt-1.5 z-30 min-w-[120px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                  }`}
                >
                  {(["16:9", "9:16", "1:1"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setAspect(r);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        aspect === r
                          ? isDark
                            ? "bg-primary/30 text-link"
                            : "bg-primary-soft text-link"
                          : isDark
                            ? "text-muted hover:bg-hover"
                            : "text-ink hover:bg-hover"
                      }`}
                    >
                      <span>{r}</span>
                      {aspect === r && <span className="text-link font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resolution Pill (Video / Image) */}
          {mediaType !== "audio" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === "resolution" ? null : "resolution")}
                className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                  activeMenu === "resolution"
                    ? isDark
                      ? "border-primary bg-primary/20 text-link"
                      : "border-blue-300 bg-primary-soft/70 text-link"
                    : isDark
                      ? "border-transparent bg-raised text-ink hover:bg-hover"
                      : "border-transparent bg-raised text-ink hover:bg-hover"
                }`}
              >
                <Icon name="monitor" className={`size-3.5 ${isDark ? "text-muted" : "text-ink"}`} />
                <span>{videoResolution}</span>
                <Icon name="chevronDown" className="size-3 text-muted" />
              </button>

              {activeMenu === "resolution" && (
                <div
                  className={`absolute top-full left-0 mt-1.5 z-30 min-w-[120px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                  }`}
                >
                  {(["1080p", "720p"] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => {
                        setVideoResolution(res);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        videoResolution === res
                          ? isDark
                            ? "bg-primary/30 text-link"
                            : "bg-primary-soft text-link"
                          : isDark
                            ? "text-muted hover:bg-hover"
                            : "text-ink hover:bg-hover"
                      }`}
                    >
                      <span>{res}</span>
                      {videoResolution === res && <span className="text-link font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Duration Pill (Video only): Includes 4s, 6s, 8s, 10s */}
          {mediaType === "video" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === "duration" ? null : "duration")}
                className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                  activeMenu === "duration"
                    ? isDark
                      ? "border-primary bg-primary/20 text-link"
                      : "border-blue-300 bg-primary-soft/70 text-link"
                    : isDark
                      ? "border-transparent bg-raised text-ink hover:bg-hover"
                      : "border-transparent bg-raised text-ink hover:bg-hover"
                }`}
              >
                <Icon name="clock" className={`size-3.5 ${isDark ? "text-muted" : "text-ink"}`} />
                <span>{videoDuration}s</span>
                <Icon name="chevronDown" className="size-3 text-muted" />
              </button>

              {activeMenu === "duration" && (
                <div
                  className={`absolute top-full left-0 mt-1.5 z-30 min-w-[110px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                  }`}
                >
                  {([4, 6, 8, 10] as const).map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      onClick={() => {
                        setVideoDuration(secs);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        videoDuration === secs
                          ? isDark
                            ? "bg-primary/30 text-link"
                            : "bg-primary-soft text-link"
                          : isDark
                            ? "text-muted hover:bg-hover"
                            : "text-ink hover:bg-hover"
                      }`}
                    >
                      <span>{secs}s</span>
                      {videoDuration === secs && <span className="text-link font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Style Pill (Image mode) */}
          {mediaType === "image" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === "style" ? null : "style")}
                className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                  activeMenu === "style"
                    ? isDark
                      ? "border-primary bg-primary/20 text-link"
                      : "border-blue-300 bg-primary-soft/70 text-link"
                    : isDark
                      ? "border-transparent bg-raised text-ink hover:bg-hover"
                      : "border-transparent bg-raised text-ink hover:bg-hover"
                }`}
              >
                <span>{imageStyle}</span>
                <Icon name="chevronDown" className="size-3 text-muted" />
              </button>

              {activeMenu === "style" && (
                <div
                  className={`absolute top-full left-0 mt-1.5 z-30 min-w-[130px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                  }`}
                >
                  {(["Cinematic", "Realistic", "Anime", "3D Render"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setImageStyle(st);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        imageStyle === st
                          ? isDark
                            ? "bg-primary/30 text-link"
                            : "bg-primary-soft text-link"
                          : isDark
                            ? "text-muted hover:bg-hover"
                            : "text-ink hover:bg-hover"
                      }`}
                    >
                      <span>{st}</span>
                      {imageStyle === st && <span className="text-link font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Voice Pill (Audio mode) */}
          {mediaType === "audio" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === "voice" ? null : "voice")}
                className={`flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
                  activeMenu === "voice"
                    ? isDark
                      ? "border-primary bg-primary/20 text-link"
                      : "border-blue-300 bg-primary-soft/70 text-link"
                    : isDark
                      ? "border-transparent bg-raised text-ink hover:bg-hover"
                      : "border-transparent bg-raised text-ink hover:bg-hover"
                }`}
              >
                <Icon name="mic" className={`size-3.5 ${isDark ? "text-muted" : "text-ink"}`} />
                <span>Voice: {voice}</span>
                <Icon name="chevronDown" className="size-3 text-muted" />
              </button>

              {activeMenu === "voice" && (
                <div
                  className={`absolute top-full left-0 mt-1.5 z-30 max-h-48 overflow-y-auto min-w-[160px] rounded-xl border p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? "border-line bg-surface text-ink" : "border-line bg-white text-ink"
                  }`}
                >
                  {GEMINI_VOICES.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => {
                        setVoice(v.name);
                        setActiveMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        voice === v.name
                          ? isDark
                            ? "bg-primary/30 text-link"
                            : "bg-primary-soft text-link"
                          : isDark
                            ? "text-muted hover:bg-hover"
                            : "text-ink hover:bg-hover"
                      }`}
                    >
                      <span>
                        {v.name} ({v.character})
                      </span>
                      {voice === v.name && <span className="text-link font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sound ON / OFF Toggles (Video mode) */}
          {mediaType === "video" && (
            <div className="flex items-center gap-0.5 sm:gap-1 ml-0.5">
              {/* Sound ON */}
              <button
                type="button"
                onClick={() => setHasAudio(true)}
                className={`p-1 sm:p-1.5 rounded-lg transition-all cursor-pointer ${
                  hasAudio
                    ? "bg-primary text-white shadow-xs"
                    : isDark
                      ? "bg-raised text-muted hover:bg-hover hover:text-ink"
                      : "bg-raised text-muted hover:bg-hover"
                }`}
                title="Generate with audio"
                aria-label="Sound on"
              >
                <Icon name="volume" className="size-3.5" />
              </button>

              {/* Sound OFF / Mute */}
              <button
                type="button"
                onClick={() => setHasAudio(false)}
                className={`p-1 sm:p-1.5 rounded-lg transition-all cursor-pointer ${
                  !hasAudio
                    ? "bg-primary text-white shadow-xs"
                    : isDark
                      ? "bg-raised text-muted hover:bg-hover hover:text-ink"
                      : "bg-raised text-muted hover:bg-hover"
                }`}
                title="Mute audio"
                aria-label="Sound off"
              >
                <Icon name="mute" className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Compact Generate Button */}
        <button
          type="button"
          aria-label="Generate to Timeline"
          title="Generate to Timeline (⌘↵)"
          onClick={handleSubmitting}
          className="shrink-0 flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] text-white text-xs font-semibold px-3.5 py-1.5 shadow-md shadow-blue-500/25 transition-all cursor-pointer"
        >
          <svg className="size-3.5 fill-white text-white" viewBox="0 0 24 24">
            <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
          </svg>
          <span>Generate</span>
        </button>
      </div>

      {/* Downward Speech Bubble Tail (Triangle pointing to timeline target) */}
      {coords && coords.bottom !== undefined && (
        <svg
          width="24"
          height="12"
          viewBox="0 0 24 12"
          className="pointer-events-none absolute -bottom-[11px] z-20 filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.06)]"
          style={{ left: Math.max(20, Math.min(cardWidth - 44, coords.pointerLeft - 12)) }}
        >
          <path
            d="M0 0 L12 12 L24 0 Z"
            fill={isDark ? "#0f172a" : "#ffffff"}
            stroke={isDark ? "#334155" : "#e2e8f0"}
            strokeWidth="1"
          />
          <rect x="0" y="-1" width="24" height="2" fill={isDark ? "#0f172a" : "#ffffff"} />
        </svg>
      )}

      {/* Upward Tail if popover is placed below target */}
      {coords && coords.top !== undefined && coords.bottom === undefined && (
        <svg
          width="24"
          height="12"
          viewBox="0 0 24 12"
          className="pointer-events-none absolute -top-[11px] z-20 filter drop-shadow-[0_-2px_2px_rgba(0,0,0,0.06)]"
          style={{ left: Math.max(20, Math.min(cardWidth - 44, coords.pointerLeft - 12)) }}
        >
          <path
            d="M0 12 L12 0 L24 12 Z"
            fill={isDark ? "#0f172a" : "#ffffff"}
            stroke={isDark ? "#334155" : "#e2e8f0"}
            strokeWidth="1"
          />
          <rect x="0" y="11" width="24" height="2" fill={isDark ? "#0f172a" : "#ffffff"} />
        </svg>
      )}
    </div>
  );

  if (anchor) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Click-away backdrop */}
        <div
          className="absolute inset-0 bg-black/25 backdrop-blur-[0.5px] animate-in fade-in duration-100"
          onClick={onClose}
        />
        <div
          data-testid="ai-anchored-popover"
          className="absolute z-10 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: coords ? coords.left : Math.max(16, (anchor.x ?? 100) - cardWidth / 2),
            bottom: coords?.bottom,
            top: coords?.top ?? (coords?.bottom === undefined ? Math.max(16, (anchor.y ?? 100) - 440) : undefined),
          }}
        >
          {cardContent}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative">{cardContent}</div>
    </div>
  );
}
