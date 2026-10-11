"use client";

import { usePointerPosition } from "../usePointerPosition";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthContext";
import { SiteVideo } from "../media/SiteVideo";
import { SITE_MEDIA, type SiteMediaKey } from "../media/manifest";

interface TimelineClip {
  id: string;
  title: string;
  media: SiteMediaKey;
  timecode: string;
}

// Real footage (light web copies, posters from their own frames); the product demo is in front (00:10).
const TIMELINE_CLIPS: TimelineClip[] = [
  { id: "cyber-intro", title: "Cyberpunk motion intro", media: "cyberIntro", timecode: "00:00" },
  { id: "globe", title: "Holographic globe", media: "globe", timecode: "00:03" },
  { id: "sports", title: "Live sports broadcast", media: "sportsLive", timecode: "00:06" },
  { id: "editor-demo", title: "Editing in ViPlay Studio", media: "demoEditor", timecode: "00:10" },
  { id: "podcast", title: "Podcast two-camera", media: "podcast", timecode: "00:14" },
  { id: "neon-walk", title: "Neon city fashion", media: "neonWalk", timecode: "00:17" },
  { id: "surf", title: "Surf action", media: "surf", timecode: "00:20" },
  { id: "presenter", title: "Virtual studio presenter", media: "virtualPresenter", timecode: "00:24" },
];

const TOTAL_DURATION = 24; // 24 seconds total video timeline

interface ScrollTimelineHeroProps {
  mousePos?: { x: number; y: number };
  scrollProgress?: number;
}

export function ScrollTimelineHero({ mousePos: given }: ScrollTimelineHeroProps) {
  const { user } = useAuth();
  const live = usePointerPosition();
  const mousePos = given ?? live;
  const heroRef = useRef<HTMLDivElement>(null);
  // "Watch Video" plays the reel: the timeline moves through the clips (each clip loops muted on its own)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(10); // 00:10: the editing demo
  const currentTimeRef = useRef(10);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const isDraggingTrack = useRef(false);
  const startDragX = useRef(0);
  const startDragTime = useRef(10);

  const activeIndex = Math.min(
    TIMELINE_CLIPS.length - 1,
    Math.max(0, Math.floor((currentTime / TOTAL_DURATION) * TIMELINE_CLIPS.length))
  );
  const activeClip = TIMELINE_CLIPS[activeIndex] || TIMELINE_CLIPS[3];

  // A sideways swipe (trackpad, or Shift + wheel) scrubs the timeline. Up/down always scrolls the page.
  useEffect(() => {
    const heroEl = heroRef.current;
    if (!heroEl) return;
    const onWheel = (e: WheelEvent) => {
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (Math.abs(sideways) < 1) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(TOTAL_DURATION, currentTimeRef.current + sideways * 0.022));
      currentTimeRef.current = next;
      setCurrentTime(Number(next.toFixed(2)));
    };
    heroEl.addEventListener("wheel", onWheel, { passive: false });
    return () => heroEl.removeEventListener("wheel", onWheel);
  }, []);

  // the reel's clock
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    let animId: number;
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= TOTAL_DURATION) {
          setIsPlaying(false);
          return 0;
        }
        return Number(next.toFixed(2));
      });
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  const formatTimecode = (seconds: number) => {
    const sec = Math.floor(seconds);
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };

  const handleClipClick = (idx: number) => setCurrentTime((idx / TIMELINE_CLIPS.length) * TOTAL_DURATION + 1);

  const handlePointerDownTrack = (e: React.PointerEvent) => {
    isDraggingTrack.current = true;
    startDragX.current = e.clientX;
    startDragTime.current = currentTime;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMoveTrack = (e: React.PointerEvent) => {
    if (!isDraggingTrack.current) return;
    const timeDelta = -((e.clientX - startDragX.current) / 400) * TOTAL_DURATION;
    setCurrentTime(Number(Math.max(0, Math.min(TOTAL_DURATION, startDragTime.current + timeDelta)).toFixed(2)));
  };
  const handlePointerUpTrack = () => {
    isDraggingTrack.current = false;
  };

  // a gentle tilt with the pointer (off on touch and with "reduce motion": usePointerPosition)
  const tiltX = mousePos.y * -2.5;
  const tiltY = mousePos.x * 3;

  const clipWidthPx = 230;
  const trackTranslateX = -(activeIndex * clipWidthPx) + clipWidthPx * 1.5;
  const toggleReel = () => setIsPlaying((p) => !p);

  return (
    <div
      ref={heroRef}
      className="relative flex min-h-screen w-full select-none flex-col justify-between overflow-hidden px-4 pb-6 pt-24 sm:px-8 lg:h-screen lg:min-h-[760px] lg:px-12"
    >
      {/* soft iris / teal light behind the headline and the player */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute right-[-10%] top-1/4 h-[480px] w-[620px] rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <div className="relative z-20 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 pt-2 lg:grid-cols-12 lg:gap-8">
        {/* copy + CTAs */}
        <div className="space-y-6 lg:col-span-5">
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full border border-site-line bg-site-surface/70 py-1 pl-1 pr-3 text-xs font-medium text-site-muted backdrop-blur-md transition hover:text-site-ink"
          >
            <span className="rounded-full bg-purple-500/15 px-2 py-0.5 font-semibold text-site-accent">New</span>
            Word-by-word captions in Hindi &amp; Hinglish
            <span aria-hidden="true">→</span>
          </a>

          <h1 className="text-[clamp(2.75rem,5vw+1rem,5.25rem)] font-bold leading-[1.02] text-site-ink">
            Video <br />
            Without <br />
            <span className="site-gradient-text">Limits.</span>
          </h1>

          <p className="max-w-md text-base leading-relaxed text-site-muted sm:text-lg">
            Edit Reels, Shorts and YouTube videos in your browser: word-by-word captions in Hindi, Hinglish and English, Hindi ↔ English dubbing, and every size in one export.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={user ? "/editor" : "/signup?next=/editor"}
              className="site-btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold"
            >
              <span>{user ? "Open Studio" : "Try ViPlay Free"}</span>
              <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={toggleReel}
              aria-pressed={isPlaying}
              className="site-btn-ghost inline-flex min-h-11 items-center gap-2.5 rounded-full px-5 text-sm font-semibold"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-site-ink/10">
                <Icon name={isPlaying ? "pause" : "play"} className="size-3 fill-current" />
              </span>
              <span>{isPlaying ? "Pause Video" : "Watch Video"}</span>
            </button>
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-site-muted">
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="size-3.5 text-cyan-400" />Free plan, no card needed</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" className="size-3.5 text-cyan-400" />Runs in your browser</span>
          </p>
        </div>

        {/* the player: the active clip, real footage */}
        <div className="relative flex items-center justify-center gap-3 sm:gap-4 lg:col-span-7 lg:justify-end">
          <div
            style={{ transform: `perspective(1200px) rotateY(${-5 + tiltY}deg) rotateX(${2 + tiltX}deg)`, transformStyle: "preserve-3d" }}
            className="group relative aspect-video w-full max-w-xl overflow-hidden rounded-[var(--site-radius-xl)] bg-black ring-1 ring-white/12 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),0_0_80px_-20px_rgba(99,85,240,0.45)] transition-transform duration-500 ease-out"
          >
            <SiteVideo key={activeClip.id} media={activeClip.media} label={activeClip.title} priority={activeIndex === 3} className="h-full w-full object-cover" />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
              <span className="size-1.5 animate-pulse rounded-full bg-cyan-400" />
              <span>{activeClip.title}</span>
            </div>
            <div className="absolute right-4 top-4 rounded-md bg-black/50 px-2 py-0.5 font-mono text-xs text-white/70 backdrop-blur-sm">16:9</div>

            {/* the reel's transport */}
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl bg-black/70 p-2.5 font-mono text-xs text-white ring-1 ring-white/10 backdrop-blur-xl">
              <button
                type="button"
                onClick={toggleReel}
                aria-label={isPlaying ? "Pause Video" : "Play Video"}
                className="flex size-8 items-center justify-center rounded-lg transition hover:bg-white/10"
              >
                <Icon name={isPlaying ? "pause" : "play"} className="size-3.5 fill-current" />
              </button>
              <span className="whitespace-nowrap text-[11px] text-white/75">{formatTimecode(currentTime)} / 00:24</span>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Reel position"
                aria-valuemin={0}
                aria-valuemax={TOTAL_DURATION}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={formatTimecode(currentTime)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") setCurrentTime((t) => Math.min(TOTAL_DURATION, t + 1));
                  if (e.key === "ArrowLeft") setCurrentTime((t) => Math.max(0, t - 1));
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setCurrentTime(Number((pct * TOTAL_DURATION).toFixed(2)));
                }}
                className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
              >
                <div style={{ width: `${(currentTime / TOTAL_DURATION) * 100}%` }} className="relative h-full rounded-full bg-gradient-to-r from-purple-400 to-cyan-400">
                  <div className="absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(155,140,255,0.9)]" />
                </div>
              </div>
            </div>
          </div>

          {/* what the editor does, at a glance */}
          <div className="z-30 hidden shrink-0 flex-col gap-2 sm:flex">
            {([
              { label: "AI Tools", icon: "sparkles", id: "ai" },
              { label: "Green Screen", icon: "crop", id: "green" },
              { label: "Effects", icon: "effects", id: "effects" },
              { label: "4K Export", icon: "download", id: "export" },
            ] as const).map((tool) => (
              <div
                key={tool.id}
                className="flex w-24 flex-col items-center justify-center gap-1 rounded-2xl border border-site-line bg-site-surface/70 py-2.5 text-site-ink backdrop-blur-md"
              >
                <Icon name={tool.icon} className="size-4 text-site-accent" />
                <span className="whitespace-nowrap text-[11px] font-medium text-site-muted">{tool.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* the filmstrip: every clip, scrub sideways or click one */}
      <div className="relative z-20 mx-auto my-auto w-full max-w-7xl py-2">
        <div className="pointer-events-none absolute bottom-6 left-1/2 top-0 z-30 flex -translate-x-1/2 flex-col items-center">
          <div className="size-3 rounded-full bg-white ring-2 ring-purple-400/80 shadow-[0_0_12px_rgba(155,140,255,0.9)]" />
          <div className="w-px flex-1 bg-gradient-to-b from-purple-400 via-fuchsia-400 to-cyan-400" />
        </div>

        <div
          onPointerDown={handlePointerDownTrack}
          onPointerMove={handlePointerMoveTrack}
          onPointerUp={handlePointerUpTrack}
          style={{ perspective: "1200px", perspectiveOrigin: "50% 50%" }}
          className="w-full cursor-grab touch-pan-y overflow-hidden py-4 active:cursor-grabbing"
        >
          <div
            style={{ transform: `rotateX(8deg) translate3d(${trackTranslateX}px, 0, 0)`, transformStyle: "preserve-3d" }}
            className="flex items-center gap-4 transition-transform duration-500 ease-out will-change-transform"
          >
            {TIMELINE_CLIPS.map((clip, idx) => {
              const isActive = idx === activeIndex;
              const distance = Math.abs(idx - activeIndex);
              return (
                <div
                  key={clip.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Show ${clip.title}`}
                  aria-pressed={isActive}
                  onClick={() => handleClipClick(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleClipClick(idx);
                    }
                  }}
                  style={{
                    transform: `scale(${isActive ? 1.1 : Math.max(0.86, 1 - distance * 0.07)}) translateZ(${isActive ? 40 : -distance * 20}px)`,
                    transformStyle: "preserve-3d",
                  }}
                  className={`relative aspect-video w-48 shrink-0 cursor-pointer select-none overflow-hidden rounded-2xl transition-all duration-500 sm:w-56 ${
                    isActive
                      ? "z-20 ring-2 ring-purple-400 shadow-[0_0_40px_-6px_rgba(124,108,250,0.8)]"
                      : "z-10 opacity-55 ring-1 ring-white/10 hover:opacity-90"
                  }`}
                >
                  <img
                    src={SITE_MEDIA[clip.media].poster}
                    alt=""
                    width={SITE_MEDIA[clip.media].width}
                    height={SITE_MEDIA[clip.media].height}
                    loading={distance > 2 ? "lazy" : undefined}
                    decoding="async"
                    draggable={false}
                    className="pointer-events-none h-full w-full select-none object-cover"
                  />
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 font-mono text-xs text-white ring-1 ring-white/10 backdrop-blur-md">
                    {clip.timecode}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between border-t border-site-line px-4 pt-2 font-mono text-[11px] text-site-muted">
          <span className={activeIndex === 0 ? "font-semibold text-site-accent" : ""}>00:00</span>
          <span className={activeIndex === 2 ? "font-semibold text-site-accent" : ""}>00:05</span>
          <span className={activeIndex === 3 ? "font-semibold text-site-accent" : ""}>00:10</span>
          <span className={activeIndex === 5 ? "font-semibold text-site-accent" : ""}>00:15</span>
          <span className={activeIndex === 7 ? "font-semibold text-site-accent" : ""}>00:20</span>
        </div>
      </div>

      {/* what you get + a nudge to scroll */}
      <div className="relative z-20 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 pt-2">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-site-muted sm:gap-x-8">
          {([
            { label: "Ultra Fast", icon: "activity" },
            { label: "Any Format", icon: "resize" },
            { label: "Transparent Video", icon: "alpha" },
            { label: "AI Powered", icon: "sparkles" },
          ] as const).map((f) => (
            <li key={f.label} className="flex items-center gap-2">
              <Icon name={f.icon} className="size-4 text-site-accent" />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
        <a href="#features" className="flex items-center gap-2 text-xs text-site-muted transition hover:text-site-ink">
          <span className="flex size-6 items-center justify-center rounded-full border border-site-line">
            <span className="size-1 animate-bounce rounded-full bg-site-accent" />
          </span>
          <span>Scroll to explore</span>
        </a>
      </div>
    </div>
  );
}
