import { useEffect, useRef, useState } from "react";
import type { BroadcastTemplate } from "@/lib/templates/types";
import {
  TEMPLATE_VIDEO_CLIPS,
  TEMPLATE_AUDIO_TRACKS,
  type TemplateVideoClip,
  type TemplateAudioTrack,
} from "@/lib/templates/templateMediaAssets";
import { Skeleton } from "@/components/ui/Skeleton";

/** Capture an instant JPEG thumbnail frame from a local video File using HTML5 Video + Canvas */
function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve("");
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    let done = false;
    const finish = (result: string) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.85));
          return;
        }
      } catch {
        // fallback
      }
      finish("");
    };

    video.onerror = () => finish("");
    setTimeout(() => finish(""), 3500);
  });
}

export function TemplateCustomizerModal({
  template,
  initialTab = "presenter",
  onClose,
  onApplyAndUse,
}: {
  template: BroadcastTemplate;
  initialTab?: "presenter" | "background" | "text" | "branding" | "audio";
  onClose: () => void;
  onApplyAndUse: (customizations: Record<string, any>) => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "presenter" | "background" | "text" | "branding" | "audio"
  >(initialTab);

  // Presenter Settings
  const [presenterSource, setPresenterSource] = useState<
    "ai" | "upload" | "preset"
  >("preset");
  const [autoKeying, setAutoKeying] = useState<boolean>(true);
  const [presenterName, setPresenterName] = useState<string>(
    "Kamal Kant\nChief News Anchor",
  );

  // Background Settings
  const [bgType, setBgType] = useState<"video" | "procedural">("procedural");
  const defaultVideoClip =
    TEMPLATE_VIDEO_CLIPS.find((c) => c.url === template.previewVideoUrl) ||
    TEMPLATE_VIDEO_CLIPS[0];
  const [selectedVideoClip, setSelectedVideoClip] =
    useState<TemplateVideoClip>(defaultVideoClip);
  const [customVideos, setCustomVideos] = useState<TemplateVideoClip[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Audio Settings
  const defaultAudioTrack =
    TEMPLATE_AUDIO_TRACKS.find(
      (a) => a.id === `theme-${template.previewCanvasEngine}`,
    ) || TEMPLATE_AUDIO_TRACKS[0];
  const [selectedAudioTrack, setSelectedAudioTrack] =
    useState<TemplateAudioTrack>(defaultAudioTrack);
  const [customAudios, setCustomAudios] = useState<TemplateAudioTrack[]>([]);
  const [previewingAudioId, setPreviewingAudioId] = useState<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState<boolean>(false);
  // your own clips and sounds are still on their way from the server
  const [mediaLoading, setMediaLoading] = useState(true);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Load persistent custom clips and audio tracks from server
  useEffect(() => {
    let active = true;
    fetch("/api/templates/media")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.clips)) {
          const customClips = data.clips.filter(
            (c: TemplateVideoClip) => c.isCustom,
          );
          if (customClips.length > 0) setCustomVideos(customClips);
        }
        if (Array.isArray(data.audioTracks)) {
          const customTracks = data.audioTracks.filter(
            (a: TemplateAudioTrack) => a.isCustom,
          );
          if (customTracks.length > 0) setCustomAudios(customTracks);
        }
      })
      .catch(() => {})
      .finally(() => active && setMediaLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      audioElRef.current?.pause();
    };
  }, []);

  const togglePreviewAudio = (track: TemplateAudioTrack) => {
    if (previewingAudioId === track.id) {
      audioElRef.current?.pause();
      setPreviewingAudioId(null);
      return;
    }
    if (!audioElRef.current) {
      audioElRef.current = new Audio();
    }
    audioElRef.current.src = track.url;
    audioElRef.current.currentTime = 0;
    audioElRef.current.play().catch(() => {});
    setPreviewingAudioId(track.id);
    setSelectedAudioTrack(track);
    audioElRef.current.onended = () => setPreviewingAudioId(null);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const instantThumb = await captureVideoFrame(file);
    const objectUrl = URL.createObjectURL(file);

    const tempClip: TemplateVideoClip = {
      id: `temp-v-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      category: "Uploaded",
      url: objectUrl,
      thumbUrl: instantThumb || undefined,
      thumbGradient: "from-blue-600 to-indigo-900",
      isCustom: true,
    };

    setCustomVideos((prev) => [tempClip, ...prev]);
    setSelectedVideoClip(tempClip);
    setBgType("video");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "video");

      const res = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const finalizedClip: TemplateVideoClip = {
          id: data.id,
          assetId: data.assetId,
          title: data.title,
          category: "Uploaded",
          url: data.url,
          thumbUrl: instantThumb || data.thumbUrl,
          thumbGradient: "from-blue-600 to-indigo-900",
          videoMeta: data.videoMeta,
          isCustom: true,
        };
        setCustomVideos((prev) =>
          prev.map((c) => (c.id === tempClip.id ? finalizedClip : c)),
        );
        setSelectedVideoClip(finalizedClip);
      }
    } catch (err) {
      console.error("Failed to upload video clip", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const tempTrack: TemplateAudioTrack = {
      id: `temp-a-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      category: "Uploaded",
      mood: "Custom",
      url: objectUrl,
      fileName: file.name,
      duration: 20,
      isCustom: true,
    };

    setCustomAudios((prev) => [tempTrack, ...prev]);
    setSelectedAudioTrack(tempTrack);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "audio");

      const res = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const finalizedTrack: TemplateAudioTrack = {
          id: data.id,
          assetId: data.assetId,
          title: data.title,
          category: "Uploaded",
          mood: "Custom",
          url: data.url,
          fileName: data.fileName,
          duration: data.duration,
          audioMeta: data.audioMeta,
          isCustom: true,
        };
        setCustomAudios((prev) =>
          prev.map((a) => (a.id === tempTrack.id ? finalizedTrack : a)),
        );
        setSelectedAudioTrack(finalizedTrack);
      }
    } catch (err) {
      console.error("Failed to upload audio track", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Text Settings
  const [headline, setHeadline] = useState<string>(
    "MAJOR DEVELOPMENTS REPORTED IN LIVE BROADCAST",
  );
  const [subText, setSubText] = useState<string>(
    "Officials address reporters in live national address",
  );
  const [tickerText, setTickerText] = useState<string>(
    "Global Markets Rally · Tech Summit Announces Major Breakthroughs · Weather Alert In Effect",
  );

  // Branding Settings
  const [primaryColor, setPrimaryColor] = useState<string>("#1d4ed8");
  const [accentColor, setAccentColor] = useState<string>("#38bdf8");
  const [channelLogo, setChannelLogo] = useState<string>("ViPlay NEWS");

  const handleApply = () => {
    audioElRef.current?.pause();
    onApplyAndUse({
      presenterSource,
      autoKeying,
      presenterName,
      bgType,
      selectedVideoClip,
      selectedAudioTrack,
      headline,
      subText,
      tickerText,
      primaryColor,
      accentColor,
      channelLogo,
    });
  };

  const allVideoClips = [...customVideos, ...TEMPLATE_VIDEO_CLIPS];
  const allAudioTracks = [...customAudios, ...TEMPLATE_AUDIO_TRACKS];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customizer-title"
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-5 py-4 bg-raised/40">
          <div>
            <h2 id="customizer-title" className="text-base font-bold text-ink">
              Customize {template.name}
            </h2>
            <p className="text-xs text-muted">
              Tailor template layers, presenter, and graphics before opening.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              audioElRef.current?.pause();
              onClose();
            }}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-hover text-muted hover:text-ink text-lg"
            aria-label="Close customizer"
          >
            ✕
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex border-b border-line bg-raised/20 px-5 gap-4 overflow-x-auto no-scrollbar">
          {[
            { id: "presenter", label: "👤 Presenter" },
            { id: "background", label: "🖼️ Background" },
            { id: "audio", label: "🎵 Audio & Music" },
            { id: "text", label: "✏️ Text & Ticker" },
            { id: "branding", label: "🎨 Station Branding" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "presenter" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  Presenter Source
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    {
                      id: "preset",
                      title: "Standard Studio Anchor",
                      desc: "Built-in presenter position",
                    },
                    {
                      id: "ai",
                      title: "AI Presenter Avatar",
                      desc: "Generate realistic AI avatar",
                    },
                    {
                      id: "upload",
                      title: "Upload Video / WebM",
                      desc: "Transparent or green screen",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPresenterSource(opt.id as any)}
                      className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                        presenterSource === opt.id
                          ? "border-primary bg-primary-soft shadow-sm"
                          : "border-line bg-raised/50 hover:border-control"
                      }`}
                    >
                      <span className="text-xs font-semibold text-ink">
                        {opt.title}
                      </span>
                      <span className="text-[0.625rem] text-muted">
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  Presenter Name & Title
                </label>
                <textarea
                  value={presenterName}
                  onChange={(e) => setPresenterName(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                  placeholder="Presenter Name&#10;Role or Station"
                />
              </div>

              <div className="rounded-xl border border-line bg-raised/40 p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-ink">
                    Smart Auto-Keying / Green Screen
                  </h4>
                  <p className="text-[0.6875rem] text-muted">
                    Automatically removes background on presenter video using AI
                    cut-out.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoKeying}
                  onChange={(e) => setAutoKeying(e.target.checked)}
                  className="size-4 accent-primary cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === "background" && (
            <div className="space-y-4">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleVideoUpload}
              />
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                    Background Mode
                  </label>
                  <p className="text-[0.6875rem] text-muted">
                    Switch between 60fps procedural animations or
                    high-definition broadcast video loops.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  + Upload Video Clip
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBgType("procedural")}
                  className={`flex-1 rounded-xl py-2 px-3 text-xs font-semibold border transition-all ${
                    bgType === "procedural"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-raised/50 border-line text-muted hover:text-ink"
                  }`}
                >
                  ⚡ Procedural 60fps Motion Loop
                </button>
                <button
                  type="button"
                  onClick={() => setBgType("video")}
                  className={`flex-1 rounded-xl py-2 px-3 text-xs font-semibold border transition-all ${
                    bgType === "video"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-raised/50 border-line text-muted hover:text-ink"
                  }`}
                >
                  🎬 Broadcast Video Loop (MP4)
                </button>
              </div>

              {bgType === "procedural" && (
                <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <h4 className="text-xs font-bold text-ink">
                      Active Procedural Backdrop Engine
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    This template renders real-time procedural graphics engine{" "}
                    <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[0.6875rem] text-primary">
                      {template.previewCanvasEngine}
                    </code>{" "}
                    with zero video decoding lag. Select any stock video below
                    to switch to MP4 mode.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  Select Video Loop (MP4)
                </label>
                <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {mediaLoading &&
                    Array.from({ length: 2 }, (_, i) => (
                      <div key={`sk-${i}`} aria-hidden className="flex items-center gap-2.5 rounded-xl border border-line p-2" data-testid="template-media-loading">
                        <Skeleton className="h-12 w-16 shrink-0 rounded-lg" />
                        <span className="flex flex-1 flex-col gap-1.5">
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-2.5 w-1/3" />
                        </span>
                      </div>
                    ))}
                  {allVideoClips.map((clip) => {
                    const isSelected =
                      bgType === "video" && selectedVideoClip.id === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => {
                          setSelectedVideoClip(clip);
                          setBgType("video");
                        }}
                        className={`flex items-center gap-2.5 rounded-xl border p-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary-soft shadow-sm ring-2 ring-primary"
                            : "border-line bg-raised/40 hover:border-control"
                        }`}
                      >
                        <div className="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black text-white shadow-inner font-mono text-[0.625rem] font-bold">
                          {clip.thumbUrl ? (
                            <img
                              src={clip.thumbUrl}
                              alt={clip.title}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div
                              className={`size-full bg-gradient-to-br ${clip.thumbGradient} flex items-center justify-center`}
                            >
                              MP4
                            </div>
                          )}
                          {clip.isCustom && (
                            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-0.5 text-[0.45rem] font-bold text-white tracking-wider">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate text-xs font-semibold text-ink">
                            {clip.title}
                          </span>
                          <span className="text-[0.625rem] text-muted">
                            {clip.category} · 20s
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "audio" && (
            <div className="space-y-4">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleAudioUpload}
              />
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted">
                    Broadcast Theme Music
                  </label>
                  <p className="text-[0.6875rem] text-muted">
                    Synchronized audio fanfare & background cues. Also
                    accessible in Studio left rail "Audio" panel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  + Upload Audio Track
                </button>
              </div>

              <div className="rounded-xl border border-line bg-raised/30 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📻</span>
                  <div className="text-xs">
                    <span className="font-semibold text-ink">
                      Left Rail Integration:{" "}
                    </span>
                    <span className="text-muted">
                      All 8 broadcast audio files are permanently registered
                      under Studio &gt; Audio &gt; News & Themes.
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  Select Theme Track
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                  {allAudioTracks.map((track) => {
                    const isSelected = selectedAudioTrack?.id === track.id;
                    const isPlaying = previewingAudioId === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => setSelectedAudioTrack(track)}
                        className={`flex items-center gap-3 rounded-xl border p-2.5 cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary-soft shadow-sm ring-2 ring-primary"
                            : "border-line bg-raised/40 hover:border-control"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePreviewAudio(track);
                          }}
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-transform ${
                            isPlaying
                              ? "bg-primary text-white scale-105 shadow-md"
                              : "bg-surface hover:bg-hover text-ink border border-line"
                          }`}
                          aria-label={isPlaying ? "Stop" : "Play preview"}
                        >
                          {isPlaying ? "⏸" : "▶"}
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-semibold text-ink">
                            {track.title}
                          </span>
                          <span className="text-[0.625rem] text-muted">
                            {track.category} · Mood: {track.mood} ·{" "}
                            {track.duration}s
                          </span>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[0.625rem] font-bold text-primary">
                            Selected
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "text" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  Main Headline
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  Sub-Headline / Location
                </label>
                <input
                  type="text"
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  News Ticker Crawl
                </label>
                <textarea
                  value={tickerText}
                  onChange={(e) => setTickerText(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === "branding" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
                  Station / Channel Logo Bug
                </label>
                <input
                  type="text"
                  value={channelLogo}
                  onChange={(e) => setChannelLogo(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                  placeholder="Station Name (e.g. ViPlay NEWS)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  Broadcast Color Palette
                </label>
                <div className="flex items-center gap-3">
                  {[
                    { id: "blue", hex: "#1d4ed8", label: "News Blue" },
                    { id: "red", hex: "#dc2626", label: "Breaking Red" },
                    { id: "emerald", hex: "#059669", label: "Finance Green" },
                    { id: "amber", hex: "#d97706", label: "Amber Alert" },
                    { id: "purple", hex: "#7c3aed", label: "Podcast Neon" },
                    { id: "dark", hex: "#0f172a", label: "Dark Carbon" },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPrimaryColor(c.hex)}
                      className={`size-8 rounded-full border-2 transition-transform ${
                        primaryColor === c.hex
                          ? "scale-125 border-white ring-2 ring-primary"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                      aria-label={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-line px-5 py-4 bg-raised/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-raised px-4 py-2 text-xs font-semibold text-ink hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <span>Apply & Open in Editor</span>
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
