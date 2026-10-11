"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";
import { usePointerPosition } from "../usePointerPosition";
import { SiteVideo } from "../media/SiteVideo";
import { SITE_MEDIA } from "../media/manifest";

interface ExplodedLayerSectionProps {
  /** (tests pass a fixed position; on the page it follows the mouse) */
  mousePos?: { x: number; y: number };
}

export function ExplodedLayerSection({ mousePos: given }: ExplodedLayerSectionProps) {
  const live = usePointerPosition();
  const mousePos = given ?? live;
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [activeLayer, setActiveLayer] = useState<string>("video");
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  // Parallax angles - gentle, balanced tilt so it never cuts into the text
  const rotX = isHovered ? 18 - mousePos.y * 7 : 13 - mousePos.y * 4;
  const rotY = isHovered ? -12 + mousePos.x * 8 : -7 + mousePos.x * 5;

  // Track scroll position to auto-expand when scrolled into view
  useEffect(() => {
    if (!sectionRef.current) return;
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            setIsInView(entry.isIntersecting);
          });
        },
        { threshold: 0.2 }
      );

      observer.observe(sectionRef.current);
      return () => observer.disconnect();
    } else if (typeof window !== "undefined") {
      const handleScroll = () => {
        if (!sectionRef.current) return;
        const rect = sectionRef.current.getBoundingClientRect();
        setIsInView(rect.top < window.innerHeight && rect.bottom > 0);
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // Full expansion is active when hovered OR when scrolled into view
  const isExpanded = isHovered || isInView;

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[92vh] w-full flex flex-col lg:flex-row items-center justify-between px-6 sm:px-12 lg:px-16 py-20 select-none overflow-hidden max-w-7xl mx-auto"
    >
      {/* Ambient Purple Backdrop Glow */}
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 size-96 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />

      {/* Left Content Column */}
      <div className="w-full lg:w-5/12 z-20 flex flex-col justify-center space-y-6 lg:pr-8">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-black text-purple-400 tracking-tight">03</span>
          <span className="text-[11px] font-mono tracking-widest text-purple-300 uppercase pt-1">
            FEATURE SHOWCASE
          </span>
        </div>

        <h2 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] ${isLight ? "text-slate-900" : "text-white"}`}>
          More Than <br />
          <span className="bg-gradient-to-r from-cyan-400 via-purple-300 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(124, 108, 250,0.4)]">
            Playback.
          </span>
        </h2>

        <p className={`text-base sm:text-lg font-normal leading-relaxed ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          A powerful video player built for creators, developers and modern video experiences. Every layer operates independently on hardware GPU buffers.
        </p>

        {/* Layer Legend & Descriptions */}
        <div className="space-y-2 pt-2">
          {[
            { id: "video", label: "Video Layer", desc: "4K zero-latency GPU decoding pipeline with HDR color" },
            { id: "overlay", label: "Overlay Layer", desc: "Web avatar transparency & real-time motion tracking HUD" },
            { id: "controls", label: "Controls", desc: "Frame-accurate scrubbing & J/K/L keyboard transport" },
            { id: "timeline", label: "Timeline", desc: "Multi-track timeline with cut points and frame trims" },
            { id: "audio", label: "Audio Waveform", desc: "Smart dialogue ducking & frequency spectrum analysis" },
          ].map((item) => (
            <div
              key={item.id}
              onMouseEnter={() => setActiveLayer(item.id)}
              onClick={() => setActiveLayer(item.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                activeLayer === item.id
                  ? "bg-[#180c38]/90 border-purple-400 shadow-[0_0_25px_rgba(124, 108, 250,0.35)] scale-[1.02]"
                  : "bg-site-surface/60 border-purple-500/10 hover:border-purple-500/25"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${activeLayer === item.id ? "bg-cyan-400 animate-ping" : "bg-purple-600"}`} />
                  {item.label}
                </span>
                <span className="text-xs font-mono text-cyan-300">{activeLayer === item.id ? "Active" : "Inspect"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Exploded 3D Layer Rig - Full Expand on Hover and on Scroll */}
      <div
        className="w-full lg:w-7/12 flex flex-col items-center justify-center perspective-[1500px] mt-12 lg:mt-0 relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Status Pill showing hover / scroll expansion */}
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/30 text-[11px] font-mono text-purple-200 shadow-md backdrop-blur-md">
          <span className={`size-2 rounded-full ${isExpanded ? "bg-cyan-400 animate-pulse" : "bg-purple-500"}`} />
          <span>
            {isHovered
              ? "Full 3D Exploded View (Hover Active)"
              : isInView
              ? "Full 3D Architecture (Scroll Active)"
              : "Hover to Full Expand"}
          </span>
        </div>

        <div
          style={{
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(-2deg)`,
            transformStyle: "preserve-3d",
          }}
          className="relative w-full max-w-lg h-[500px] sm:h-[540px] transition-all duration-700 ease-out flex items-center justify-center cursor-pointer"
        >
          {/* Layer 1: Video Layer (Top Layer) - Most Forward & Highest */}
          <div
            style={{
              transform: `translate3d(0px, ${
                isExpanded
                  ? activeLayer === "video" ? -125 : -105
                  : activeLayer === "video" ? -55 : -40
              }px, ${
                isExpanded
                  ? activeLayer === "video" ? 160 : 135
                  : activeLayer === "video" ? 80 : 60
              }px)`,
              transformStyle: "preserve-3d",
            }}
            onClick={() => setActiveLayer("video")}
            className="absolute inset-x-2 h-44 sm:h-48 rounded-2xl overflow-hidden border-2 border-cyan-400/90 bg-black/95 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_35px_rgba(45, 212, 191,0.4)] transition-all duration-700 ease-out cursor-pointer group z-50 brightness-105"
          >
            <SiteVideo media="cyberIntro" showPlayButton={false} className="w-full h-full object-cover" />
            <div className="absolute top-2.5 left-3 px-2.5 py-1 rounded-md bg-black/85 border border-cyan-400/50 text-xs font-mono text-cyan-300 font-bold flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Live Video Buffer</span>
            </div>
            <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded bg-black/75 text-xs font-mono text-white">
              Hardware Video Surface
            </div>
          </div>

          {/* Layer 2: Overlay Layer - Distinctly separated in depth */}
          <div
            style={{
              transform: `translate3d(0px, ${
                isExpanded
                  ? activeLayer === "overlay" ? -65 : -48
                  : activeLayer === "overlay" ? -30 : -18
              }px, ${
                isExpanded
                  ? activeLayer === "overlay" ? 115 : 95
                  : activeLayer === "overlay" ? 60 : 42
              }px)`,
              transformStyle: "preserve-3d",
            }}
            onClick={() => setActiveLayer("overlay")}
            className="absolute inset-x-2 h-44 sm:h-48 rounded-2xl border-2 border-dashed border-sky-400/80 bg-sky-950/50 backdrop-blur-md transition-all duration-700 ease-out cursor-pointer flex items-center justify-center z-40 shadow-[0_18px_45px_rgba(0,0,0,0.85),0_0_30px_rgba(45, 212, 191,0.3)]"
          >
            {/* Tracking Target Box */}
            <div className="size-22 border-2 border-cyan-300 rounded-xl flex flex-col items-center justify-center text-xs text-cyan-200 font-mono shadow-[0_0_20px_#2dd4bf] bg-cyan-500/15 p-2">
              <span className="font-bold text-[11px]">[ TRACK-01 ]</span>
              <span className="text-xs text-cyan-300">TRACKING</span>
            </div>
            <div className="absolute top-2.5 left-3 px-2.5 py-1 rounded-md bg-sky-950/90 border border-sky-400/50 text-xs font-mono text-sky-300 font-bold flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-sky-400" />
              <span>Overlay Layer (Alpha WebM)</span>
            </div>
            <div className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded bg-black/75 text-xs font-mono text-slate-300">
              HUD & Vector Subtitle Plane
            </div>
          </div>

          {/* Layer 3: Controls Layer - Bright & High Contrast Transport */}
          <div
            style={{
              transform: `translate3d(0px, ${
                isExpanded
                  ? activeLayer === "controls" ? -10 : 8
                  : activeLayer === "controls" ? -5 : 4
              }px, ${
                isExpanded
                  ? activeLayer === "controls" ? 70 : 50
                  : activeLayer === "controls" ? 40 : 24
              }px)`,
              transformStyle: "preserve-3d",
            }}
            onClick={() => setActiveLayer("controls")}
            className="absolute inset-x-2 h-44 sm:h-48 rounded-2xl border-2 border-purple-400/80 bg-site-raised/95 backdrop-blur-xl transition-all duration-700 ease-out cursor-pointer p-3.5 flex flex-col justify-between z-30 shadow-[0_18px_45px_rgba(0,0,0,0.85),0_0_30px_rgba(124, 108, 250,0.3)]"
          >
            <div className="flex items-center justify-between text-white text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-purple-950/90 border border-purple-400/50 font-mono font-bold text-purple-300 flex items-center gap-1.5 text-xs">
                <span className="size-2 rounded-full bg-purple-400" />
                <span>Controls (HUD Transport)</span>
              </span>
              <span className="font-mono text-xs text-purple-300">J / K / L Shuttle</span>
            </div>

            {/* High-Contrast Playback Bar */}
            <div className="bg-black/90 p-2.5 rounded-xl border border-purple-500/30 flex items-center justify-between text-white shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950 shadow-[0_0_10px_#2dd4bf]">
                  <Icon name="play" className="size-3.5 ml-0.5 fill-current" />
                </div>
                <span className="font-mono text-[11px] font-bold text-cyan-300">00:14 / 00:30</span>
              </div>

              {/* Center Scrubber */}
              <div className="flex-1 mx-3 h-1.5 rounded-full bg-white/20 relative overflow-hidden">
                <div className="w-1/2 h-full bg-gradient-to-r from-cyan-400 to-purple-400" />
              </div>

              <div className="flex items-center gap-2.5 text-slate-300">
                <Icon name="settings" className="size-3.5 hover:text-white" />
                <Icon name="fullscreen" className="size-3.5 hover:text-white" />
              </div>
            </div>
          </div>

          {/* Layer 4: Timeline Layer - Clear Colorful Thumbnails */}
          <div
            style={{
              transform: `translate3d(0px, ${
                isExpanded
                  ? activeLayer === "timeline" ? 48 : 64
                  : activeLayer === "timeline" ? 20 : 26
              }px, ${
                isExpanded
                  ? activeLayer === "timeline" ? 25 : 8
                  : activeLayer === "timeline" ? 20 : 6
              }px)`,
              transformStyle: "preserve-3d",
            }}
            onClick={() => setActiveLayer("timeline")}
            className="absolute inset-x-2 h-44 sm:h-48 rounded-2xl border-2 border-indigo-400/80 bg-[#0d0421]/95 transition-all duration-700 ease-out cursor-pointer p-3.5 flex flex-col justify-between z-20 shadow-[0_18px_45px_rgba(0,0,0,0.85),0_0_30px_rgba(124, 108, 250,0.3)]"
          >
            <div className="flex items-center justify-between text-white text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-950/90 border border-indigo-400/50 font-mono font-bold text-indigo-300 flex items-center gap-1.5 text-xs">
                <span className="size-2 rounded-full bg-indigo-400" />
                <span>Timeline Strip (Frame Cache)</span>
              </span>
              <span className="font-mono text-xs text-slate-400">120 FPS Sub-frame</span>
            </div>

            {/* Thumbnail Filmstrip */}
            <div className="h-14 rounded-xl bg-black border border-indigo-500/30 flex items-center p-1 gap-1.5 overflow-hidden">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex-1 h-full rounded-lg overflow-hidden border border-white/20 relative">
                  <img loading="lazy" decoding="async"
                    src={SITE_MEDIA.cyberIntro.poster}
                    alt=""
                    style={{ objectPosition: `${(i - 1) * 14}% 50%` }}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-1 text-[7px] font-mono text-white bg-black/80 px-0.5 rounded">
                    F{i * 12}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Layer 5: Neon Audio Waveform (Base Layer) - Vivid Equalizer Bloom */}
          <div
            style={{
              transform: `translate3d(0px, ${
                isExpanded
                  ? activeLayer === "audio" ? 104 : 120
                  : activeLayer === "audio" ? 45 : 48
              }px, ${
                isExpanded
                  ? activeLayer === "audio" ? -20 : -35
                  : activeLayer === "audio" ? 0 : -12
              }px)`,
              transformStyle: "preserve-3d",
            }}
            onClick={() => setActiveLayer("audio")}
            className="absolute inset-x-2 h-44 sm:h-48 rounded-2xl border-2 border-fuchsia-400/80 bg-[#070114] shadow-[0_0_50px_rgba(189, 124, 247,0.35)] transition-all duration-700 ease-out cursor-pointer p-4 flex flex-col justify-between z-10"
          >
            <div className="flex items-center justify-between text-white text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-fuchsia-950/90 border border-fuchsia-400/50 font-mono font-bold text-fuchsia-300 flex items-center gap-1.5 text-xs">
                <span className="size-2 rounded-full bg-fuchsia-400 animate-pulse" />
                <span>Audio Waveform (Smart Ducking)</span>
              </span>
              <span className="font-mono text-xs text-cyan-300">48kHz Lossless Float32</span>
            </div>

            {/* Glowing Audio Spectrum Bars */}
            <div className="flex items-end justify-center gap-1.5 h-16 mb-1">
              {[35, 60, 85, 45, 95, 30, 75, 100, 85, 45, 70, 90, 60, 35, 80, 55, 90, 75, 40, 65, 85, 50, 95, 30, 80].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="flex-1 rounded-full bg-gradient-to-t from-fuchsia-500 via-purple-400 to-cyan-400 shadow-[0_0_10px_#d946ef]"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
