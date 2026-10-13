"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Icon, IconName } from "@/components/ui/Icon";
import { useResolvedTheme } from "@/lib/editor/theme";

export type AccentColor =
  | "cyan"
  | "purple"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "fuchsia"
  | "orange"
  | "indigo"
  | "teal";

export interface ToolFeatureItem {
  id: string;
  name: string;
  oneLiner: string;
  category: "timeline" | "ai" | "audio" | "graphics" | "export" | "platform";
  categoryLabel: string;
  icon: IconName;
  locationOrShortcut: string;
  fullDescription: string;
  specs: string[];
  accent: AccentColor;
}

export interface ColorTheme {
  iconColor: string;
  iconGlow: string;
  cardBgDark: string;
  cardBorderDark: string;
  cardGlowDark: string;
  cardBgLight: string;
  cardBorderLight: string;
  cardGlowLight: string;
  spotlightDark: string;
  spotlightLight: string;
  arrowDark: string;
  arrowLight: string;
  titleHoverDark: string;
  titleHoverLight: string;
  modalGlow: string;
}

export const ACCENT_PALETTES: Record<AccentColor, ColorTheme> = {
  cyan: {
    iconColor: "text-cyan-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(45, 212, 191,0.7)]",
    cardBgDark: "bg-gradient-to-br from-cyan-950/40 via-site-surface/85 to-[#041a29]/50",
    cardBorderDark: "border-cyan-500/25 hover:border-cyan-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(45, 212, 191,0.25)]",
    cardBgLight: "bg-gradient-to-br from-cyan-50/90 via-white/95 to-sky-50/50",
    cardBorderLight: "border-cyan-200/80 hover:border-cyan-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(20, 184, 166,0.08)] hover:shadow-[0_16px_40px_rgba(20, 184, 166,0.22)]",
    spotlightDark: "rgba(45, 212, 191, 0.22)",
    spotlightLight: "rgba(20, 184, 166, 0.16)",
    arrowDark: "group-hover:bg-cyan-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-cyan-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-cyan-300",
    titleHoverLight: "group-hover:text-cyan-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(45, 212, 191,0.3)] border-cyan-500/40",
  },
  purple: {
    iconColor: "text-purple-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(124, 108, 250,0.7)]",
    cardBgDark: "bg-gradient-to-br from-purple-950/40 via-site-surface/85 to-site-raised/50",
    cardBorderDark: "border-purple-500/25 hover:border-purple-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(124, 108, 250,0.25)]",
    cardBgLight: "bg-gradient-to-br from-purple-50/90 via-white/95 to-fuchsia-50/50",
    cardBorderLight: "border-purple-200/80 hover:border-purple-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(124, 108, 250,0.08)] hover:shadow-[0_16px_40px_rgba(124, 108, 250,0.22)]",
    spotlightDark: "rgba(124, 108, 250, 0.22)",
    spotlightLight: "rgba(124, 108, 250, 0.16)",
    arrowDark: "group-hover:bg-purple-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-purple-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-purple-300",
    titleHoverLight: "group-hover:text-purple-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(124, 108, 250,0.3)] border-purple-500/40",
  },
  emerald: {
    iconColor: "text-emerald-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(52,211,153,0.7)]",
    cardBgDark: "bg-gradient-to-br from-emerald-950/40 via-site-surface/85 to-[#03241b]/50",
    cardBorderDark: "border-emerald-500/25 hover:border-emerald-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(52,211,153,0.25)]",
    cardBgLight: "bg-gradient-to-br from-emerald-50/90 via-white/95 to-teal-50/50",
    cardBorderLight: "border-emerald-200/80 hover:border-emerald-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(16,185,129,0.08)] hover:shadow-[0_16px_40px_rgba(16,185,129,0.22)]",
    spotlightDark: "rgba(52, 211, 153, 0.22)",
    spotlightLight: "rgba(16, 185, 129, 0.16)",
    arrowDark: "group-hover:bg-emerald-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-emerald-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-emerald-300",
    titleHoverLight: "group-hover:text-emerald-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(52,211,153,0.3)] border-emerald-500/40",
  },
  amber: {
    iconColor: "text-amber-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(251,191,36,0.7)]",
    cardBgDark: "bg-gradient-to-br from-amber-950/40 via-site-surface/85 to-[#291703]/50",
    cardBorderDark: "border-amber-500/25 hover:border-amber-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(251,191,36,0.25)]",
    cardBgLight: "bg-gradient-to-br from-amber-50/90 via-white/95 to-yellow-50/50",
    cardBorderLight: "border-amber-200/80 hover:border-amber-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(245,158,11,0.08)] hover:shadow-[0_16px_40px_rgba(245,158,11,0.22)]",
    spotlightDark: "rgba(251, 191, 36, 0.22)",
    spotlightLight: "rgba(245, 158, 11, 0.16)",
    arrowDark: "group-hover:bg-amber-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-amber-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-amber-300",
    titleHoverLight: "group-hover:text-amber-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(251,191,36,0.3)] border-amber-500/40",
  },
  rose: {
    iconColor: "text-rose-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(251,113,133,0.7)]",
    cardBgDark: "bg-gradient-to-br from-rose-950/40 via-site-surface/85 to-[#2d0519]/50",
    cardBorderDark: "border-rose-500/25 hover:border-rose-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(251,113,133,0.25)]",
    cardBgLight: "bg-gradient-to-br from-rose-50/90 via-white/95 to-pink-50/50",
    cardBorderLight: "border-rose-200/80 hover:border-rose-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(244,63,94,0.08)] hover:shadow-[0_16px_40px_rgba(244,63,94,0.22)]",
    spotlightDark: "rgba(251, 113, 133, 0.22)",
    spotlightLight: "rgba(244, 63, 94, 0.16)",
    arrowDark: "group-hover:bg-rose-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-rose-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-rose-300",
    titleHoverLight: "group-hover:text-rose-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(244,63,94,0.3)] border-rose-500/40",
  },
  sky: {
    iconColor: "text-sky-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(45, 212, 191,0.7)]",
    cardBgDark: "bg-gradient-to-br from-sky-950/40 via-site-surface/85 to-[#081e3b]/50",
    cardBorderDark: "border-sky-500/25 hover:border-sky-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(45, 212, 191,0.25)]",
    cardBgLight: "bg-gradient-to-br from-sky-50/90 via-white/95 to-blue-50/50",
    cardBorderLight: "border-sky-200/80 hover:border-sky-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(14,165,233,0.08)] hover:shadow-[0_16px_40px_rgba(14,165,233,0.22)]",
    spotlightDark: "rgba(45, 212, 191, 0.22)",
    spotlightLight: "rgba(14, 165, 233, 0.16)",
    arrowDark: "group-hover:bg-sky-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-sky-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-sky-300",
    titleHoverLight: "group-hover:text-sky-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(45, 212, 191,0.3)] border-sky-500/40",
  },
  fuchsia: {
    iconColor: "text-fuchsia-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(232,121,249,0.7)]",
    cardBgDark: "bg-gradient-to-br from-fuchsia-950/40 via-site-surface/85 to-[#2a0537]/50",
    cardBorderDark: "border-fuchsia-500/25 hover:border-fuchsia-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(232,121,249,0.25)]",
    cardBgLight: "bg-gradient-to-br from-fuchsia-50/90 via-white/95 to-purple-50/50",
    cardBorderLight: "border-fuchsia-200/80 hover:border-fuchsia-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(189, 124, 247,0.08)] hover:shadow-[0_16px_40px_rgba(189, 124, 247,0.22)]",
    spotlightDark: "rgba(232, 121, 249, 0.22)",
    spotlightLight: "rgba(189, 124, 247, 0.16)",
    arrowDark: "group-hover:bg-fuchsia-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-fuchsia-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-fuchsia-300",
    titleHoverLight: "group-hover:text-fuchsia-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(189, 124, 247,0.3)] border-fuchsia-500/40",
  },
  orange: {
    iconColor: "text-orange-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(251,146,60,0.7)]",
    cardBgDark: "bg-gradient-to-br from-orange-950/40 via-site-surface/85 to-[#331404]/50",
    cardBorderDark: "border-orange-500/25 hover:border-orange-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(251,146,60,0.25)]",
    cardBgLight: "bg-gradient-to-br from-orange-50/90 via-white/95 to-amber-50/50",
    cardBorderLight: "border-orange-200/80 hover:border-orange-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(249,115,22,0.08)] hover:shadow-[0_16px_40px_rgba(249,115,22,0.22)]",
    spotlightDark: "rgba(251, 146, 60, 0.22)",
    spotlightLight: "rgba(249, 115, 22, 0.16)",
    arrowDark: "group-hover:bg-orange-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-orange-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-orange-300",
    titleHoverLight: "group-hover:text-orange-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(249,115,22,0.3)] border-orange-500/40",
  },
  indigo: {
    iconColor: "text-indigo-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(129,140,248,0.7)]",
    cardBgDark: "bg-gradient-to-br from-indigo-950/40 via-site-surface/85 to-[#12103d]/50",
    cardBorderDark: "border-indigo-500/25 hover:border-indigo-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(129,140,248,0.25)]",
    cardBgLight: "bg-gradient-to-br from-indigo-50/90 via-white/95 to-sky-50/50",
    cardBorderLight: "border-indigo-200/80 hover:border-indigo-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(124, 108, 250,0.08)] hover:shadow-[0_16px_40px_rgba(124, 108, 250,0.22)]",
    spotlightDark: "rgba(129, 140, 248, 0.22)",
    spotlightLight: "rgba(124, 108, 250, 0.16)",
    arrowDark: "group-hover:bg-indigo-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-indigo-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-indigo-300",
    titleHoverLight: "group-hover:text-indigo-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(124, 108, 250,0.3)] border-indigo-500/40",
  },
  teal: {
    iconColor: "text-teal-400",
    iconGlow: "drop-shadow-[0_0_16px_rgba(45,212,191,0.7)]",
    cardBgDark: "bg-gradient-to-br from-teal-950/40 via-site-surface/85 to-[#042b27]/50",
    cardBorderDark: "border-teal-500/25 hover:border-teal-400/70",
    cardGlowDark: "shadow-[0_12px_36px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_48px_rgba(45,212,191,0.25)]",
    cardBgLight: "bg-gradient-to-br from-teal-50/90 via-white/95 to-emerald-50/50",
    cardBorderLight: "border-teal-200/80 hover:border-teal-400",
    cardGlowLight: "shadow-[0_10px_30px_rgba(20,184,166,0.08)] hover:shadow-[0_16px_40px_rgba(20,184,166,0.22)]",
    spotlightDark: "rgba(45, 212, 191, 0.22)",
    spotlightLight: "rgba(20, 184, 166, 0.16)",
    arrowDark: "group-hover:bg-teal-400 group-hover:text-slate-950",
    arrowLight: "group-hover:bg-teal-600 group-hover:text-white",
    titleHoverDark: "group-hover:text-teal-300",
    titleHoverLight: "group-hover:text-teal-700",
    modalGlow: "shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(20,184,166,0.3)] border-teal-500/40",
  },
};

export const TOOLS_AND_FEATURES: ToolFeatureItem[] = [
  {
    id: "audio-library",
    name: "Audio & Music Library",
    oneLiner: "Royalty-free soundtracks and SFX with instant hover waveform preview.",
    category: "audio",
    categoryLabel: "Audio Engineering",
    icon: "waveform",
    locationOrShortcut: "Left Rail / Audio",
    fullDescription: "Built-in royalty-free sound effects and background music library with one-click drag-to-timeline, volume normalization, and instant hover waveform preview directly in your browser without cloud latency.",
    specs: ["48kHz Float32 audio playback", "Waveform envelope zoom", "Sub-frame precision placement"],
    accent: "fuchsia",
  },
  {
    id: "stock-library",
    name: "Stock & Media Library",
    oneLiner: "Curated stock videos, photos, and royalty-free audio tracks with 1-click timeline drop.",
    category: "graphics",
    categoryLabel: "Graphics & Media",
    icon: "library",
    locationOrShortcut: "Left Rail / Library",
    fullDescription: "Curated searchable stock videos, high-resolution photos, and royalty-free audio tracks. One-click timeline drop, drag-and-drop support, and instant canvas overlay.",
    specs: ["HD stock videos & photos", "Pexels & Pixabay integration", "Instant timeline insertion"],
    accent: "orange",
  },
  {
    id: "ai-cutout",
    name: "AI Cutout & Chroma Key",
    oneLiner: "Real-time green-screen removal with pixel-zoom eyedropper magnifier.",
    category: "ai",
    categoryLabel: "AI & Smart Tools",
    icon: "alpha",
    locationOrShortcut: "Inspector / Chroma",
    fullDescription: "Hardware-accelerated WebGL chroma keyer with interactive eyedropper magnifier loupe, RGB/hex readout, similarity threshold, and real-time green spill suppression on GPU shaders.",
    specs: ["WebGL shader keying", "Interactive pixel zoom loupe", "Mathematical spill suppression"],
    accent: "emerald",
  },
  {
    id: "transparent-avatars",
    name: "Transparent Web Avatars",
    oneLiner: "Dual-stream WebM & QuickTime MOV export with 1-click HTML embed.",
    category: "export",
    categoryLabel: "Export & Platform",
    icon: "person",
    locationOrShortcut: "Export Studio",
    fullDescription: "World-first dual-stream simultaneous export: WebM VP9 with alpha for Chrome/Firefox/Android, and QuickTime HEVC MOV with alpha for Safari/iOS, with no dark halo fringing.",
    specs: ["Dual-stream synchronous export", "Copy-paste responsive HTML embed", "Zero halo fringing algorithm"],
    accent: "cyan",
  },
  {
    id: "smart-audio-mix",
    name: "Smart Audio Ducking",
    oneLiner: "Auto-ducks background music when speech begins using FFmpeg.",
    category: "audio",
    categoryLabel: "Audio Engineering",
    icon: "waveform",
    locationOrShortcut: "Inspector / Smart Mix",
    fullDescription: "Intelligent dialogue ducking powered by FFmpeg silence detection. Analyzes speech across tracks and automatically ducks background audio with 3 custom priority modes.",
    specs: ["3 speech priority ducking modes", "Non-destructive keyframes", "Smooth fade ramps"],
    accent: "indigo",
  },
  {
    id: "motion-tracking",
    name: "Computer Vision Tracking",
    oneLiner: "Duration-bounded object tracking with 3D perspective skew warping.",
    category: "ai",
    categoryLabel: "AI & Smart Tools",
    icon: "motionTrack",
    locationOrShortcut: "Left Rail / AI Tools",
    fullDescription: "Duration-bounded motion tracking with optical flow. Sets exact in/out ranges to lock broadcast HUDs, callouts, arrows, and blur masks to moving subjects with 3D perspective skew.",
    specs: ["Duration-bounded range", "3D perspective transformation", "Real-time sub-pixel tracking"],
    accent: "rose",
  },
  {
    id: "precision-timeline",
    name: "Precision Multi-Track NLE",
    oneLiner: "Sub-frame accurate timeline with J/K/L shuttle and magnetic snapping.",
    category: "timeline",
    categoryLabel: "Timeline & Editing",
    icon: "film",
    locationOrShortcut: "Timeline / J-K-L",
    fullDescription: "Desktop-grade non-linear editor timeline with sub-frame accuracy, magnetic clip snapping, high-contrast selection borders, and J/K/L keyboard shuttle transport.",
    specs: ["J/K/L keyboard transport", "Magnetic sub-frame snapping", "120 FPS frame cache"],
    accent: "cyan",
  },
  {
    id: "detach-audio",
    name: "Detach & Attach Audio",
    oneLiner: "1-click extraction of video audio into track with volume memory.",
    category: "timeline",
    categoryLabel: "Timeline & Editing",
    icon: "detachAudio",
    locationOrShortcut: "Timeline / Context Menu",
    fullDescription: "One click detaches video audio into an independent track for precision surgical editing; another click re-attaches it back to the video while preserving all volume automation.",
    specs: ["Bidirectional 1-click toggle", "Preserves volume memory", "Auto-cleans blank tracks"],
    accent: "teal",
  },
  {
    id: "split-clip",
    name: "Split Clip & Ripple Delete",
    oneLiner: "Instant razor blade slicing at playhead with gapless auto-closing.",
    category: "timeline",
    categoryLabel: "Timeline & Editing",
    icon: "split",
    locationOrShortcut: "Shortcut: S / Del",
    fullDescription: "Frame-accurate razor blade slicing at the playhead with the S key. Ripple delete automatically closes blank gaps and moves downstream clips forward seamlessly.",
    specs: ["Instant S blade slicing", "Zero-gap ripple delete", "Downstream clip sync"],
    accent: "rose",
  },
  {
    id: "trim-handles",
    name: "Starting Clip Trimming",
    oneLiner: "Google Vids-style handle drag with live cursor frame stream.",
    category: "timeline",
    categoryLabel: "Timeline & Editing",
    icon: "trim",
    locationOrShortcut: "Clip Border Drag",
    fullDescription: "Google Vids-style left handle trimming that streams real-time thumbnail preview under your cursor and automatically shifts the timeline to 0:00 to prevent blank dead space.",
    specs: ["Live cursor frame stream", "Auto-shift to 0:00 offset", "Bilateral edge trimming"],
    accent: "amber",
  },
  {
    id: "broadcast-graphics",
    name: "Broadcast Lower Thirds",
    oneLiner: "Animated television-grade name banners and speaker badges.",
    category: "graphics",
    categoryLabel: "Graphics & Media",
    icon: "columns",
    locationOrShortcut: "Elements Panel",
    fullDescription: "Television-grade animated lower-third title bars, speaker badges, and social media handles with custom brand color palettes and typography.",
    specs: ["Smooth entrance animations", "Custom brand color palettes", "High-res HTML5 vector canvas"],
    accent: "purple",
  },
  {
    id: "breaking-news",
    name: "Breaking News Ticker",
    oneLiner: "Live scrolling alert banner with speed controls and text editing.",
    category: "graphics",
    categoryLabel: "Graphics & Media",
    icon: "broadcast",
    locationOrShortcut: "Elements Panel",
    fullDescription: "Live-scrolling newsroom ticker with customizable headline text, scroll velocity, live alert badge, and red/gold television styling.",
    specs: ["Configurable ticker velocity", "Live headline text editing", "Broadcast graphics mode"],
    accent: "orange",
  },
  {
    id: "camera-viewfinder",
    name: "4K Camera Viewfinder HUD",
    oneLiner: "Cinema HUD with blinking REC indicator, SMPTE timecode, and grid.",
    category: "graphics",
    categoryLabel: "Graphics & Media",
    icon: "camera",
    locationOrShortcut: "Elements Panel",
    fullDescription: "Cinematic camera HUD overlay with blinking red REC indicator, battery gauge, SMPTE timecode, rule-of-thirds grid, and live audio peak meters.",
    specs: ["Blinking REC indicator", "SMPTE timecode sync", "Audio peak VU meters"],
    accent: "emerald",
  },
  {
    id: "color-grading",
    name: "Cinematic 30+ LUTs",
    oneLiner: "GPU-accelerated color grading presets and film look curves.",
    category: "platform",
    categoryLabel: "Effects & Color",
    icon: "palette",
    locationOrShortcut: "Inspector / Effects",
    fullDescription: "GPU-accelerated GLSL shader color engine with 30+ film looks (Cyberpunk, Teal & Orange, Noir, Warm Sun) plus exposure, saturation, and contrast sliders.",
    specs: ["30+ cinematic film LUTs", "Real-time WebGL shader", "RGB channel balance"],
    accent: "fuchsia",
  },
  {
    id: "voiceover-studio",
    name: "AI Voiceover Studio",
    oneLiner: "Natural multi-voice speech synthesis powered by Google Gemini.",
    category: "ai",
    categoryLabel: "AI & Smart Tools",
    icon: "magic",
    locationOrShortcut: "Left Rail / AI Tools",
    fullDescription: "High-fidelity natural speech synthesis powered by Google Gemini. Multi-voice selection, emotion nuance, speed, pitch, and multilingual narration.",
    specs: ["Google Gemini speech models", "Emotion & cadence tuning", "Instant timeline sync"],
    accent: "sky",
  },
  {
    id: "ai-highlights",
    name: "AI Highlights Generator",
    oneLiner: "Auto-extracts viral 9:16 vertical shorts with animated subtitles.",
    category: "ai",
    categoryLabel: "AI & Smart Tools",
    icon: "sparkles",
    locationOrShortcut: "Left Rail / AI Tools",
    fullDescription: "AI engagement scoring scans long videos to automatically extract viral 9:16 vertical shorts, complete with auto-generated animated captions and speaker centering.",
    specs: ["Viral engagement scoring", "Auto-caption generation", "9:16 vertical re-frame"],
    accent: "amber",
  },
  {
    id: "silence-detection",
    name: "Silence Detection Cut",
    oneLiner: "Scans audio for dead air and applies 1-click jump cuts across tracks.",
    category: "ai",
    categoryLabel: "AI & Smart Tools",
    icon: "cut",
    locationOrShortcut: "Timeline / AI Tools",
    fullDescription: "Scans audio tracks for dead air and awkward pauses using configurable decibel thresholds. One click performs automated jump cuts across all tracks.",
    specs: ["Decibel threshold slider", "One-click jump cuts", "Preserves natural pauses"],
    accent: "rose",
  },
  {
    id: "command-palette",
    name: "Universal Command Palette",
    oneLiner: "Fuzzy search palette to execute any tool or setting with Cmd+K.",
    category: "platform",
    categoryLabel: "Productivity & UI",
    icon: "search",
    locationOrShortcut: "Shortcut: Cmd+K",
    fullDescription: "Lightning-fast fuzzy search palette to execute any tool, insert media assets, jump to timeline markers, or adjust project preferences in milliseconds.",
    specs: ["Fuzzy search navigation", "Keyboard-driven workflow", "Instant asset discovery"],
    accent: "cyan",
  },
  {
    id: "file-system-api",
    name: "Local-First NVMe Storage",
    oneLiner: "100% privacy with zero cloud upload via File System Access API.",
    category: "platform",
    categoryLabel: "Privacy & Storage",
    icon: "storage",
    locationOrShortcut: "Settings / Local Drive",
    fullDescription: "Your source files stay in your own storage: link a folder on your drive (File System Access API) and edit from it. AI features send only what they need, when you click them.",
    specs: ["Source files stay with you", "No upload wait to start editing", "Large 4K files"],
    accent: "emerald",
  },
  {
    id: "videotoolbox-export",
    name: "Apple VideoToolbox Export",
    oneLiner: "Hardware-accelerated 4K 60FPS export on Apple Silicon engines.",
    category: "export",
    categoryLabel: "Export & Platform",
    icon: "export",
    locationOrShortcut: "Export Dialog",
    fullDescription: "On a Mac, HEVC and see-through MOV exports use Apple's hardware encoder (FFmpeg VideoToolbox) for fast, efficient renders.",
    specs: ["Apple Silicon acceleration", "4K 60FPS ultra-fast", "Energy efficient render"],
    accent: "indigo",
  },
  {
    id: "canvas-formats",
    name: "Multi-Format Aspect Ratios",
    oneLiner: "1-click switching between 16:9 Cinema, 9:16 Shorts, and 1:1 Square.",
    category: "export",
    categoryLabel: "Export & Platform",
    icon: "monitor",
    locationOrShortcut: "Canvas Viewport Header",
    fullDescription: "One-click switching between 16:9 Widescreen Cinema, 9:16 Vertical Reels/Shorts/TikTok, 1:1 Square, and 4:5 Social Feed with smart auto-centering.",
    specs: ["16:9, 9:16, 1:1, 4:5", "Auto subject centering", "DCI-P3 color preview"],
    accent: "purple",
  },
  {
    id: "track-locks",
    name: "Track Security & Solo",
    oneLiner: "Independent layer visibility and track locking to protect finished edits.",
    category: "timeline",
    categoryLabel: "Timeline & Editing",
    icon: "eye",
    locationOrShortcut: "Track Header",
    fullDescription: "Independent layer visibility toggling with eye icons to audition edits, combined with track locking to protect finished tracks from accidental edits.",
    specs: ["Solo & mute tracks", "Accidental edit protection", "Visual timeline dimming"],
    accent: "teal",
  },
];

// Interactive 3D Tilt & Spotlight Capsule Card (Hyperplexed + Simey Reference)
// Big Free-Floating Icon + Full Width 1-Liner Title + 1-Liner Text + Vibrant Colors (No Boxy Button, No Badge Collision)
function OrganicFeatureCard({
  tool,
  onClick,
  isLight,
}: {
  tool: ToolFeatureItem;
  onClick: () => void;
  isLight: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const themeColor = ACCENT_PALETTES[tool.accent || "cyan"];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
  };

  // 3D Tilt calculation
  const width = cardRef.current?.offsetWidth || 300;
  const height = cardRef.current?.offsetHeight || 120;
  const rotX = isHovered ? -((mousePos.y / height - 0.5) * 10).toFixed(2) : 0;
  const rotY = isHovered ? ((mousePos.x / width - 0.5) * 10).toFixed(2) : 0;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      style={{
        transform: isHovered
          ? `perspective(700px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.025, 1.025, 1.025)`
          : "perspective(700px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transition: isHovered ? "transform 0.1s ease-out" : "transform 0.35s ease-out",
      }}
      className={`group relative rounded-[26px] p-5 cursor-pointer select-none transition-all duration-300 overflow-hidden border ${
        isLight
          ? `${themeColor.cardBgLight} ${themeColor.cardBorderLight} ${themeColor.cardGlowLight}`
          : `${themeColor.cardBgDark} ${themeColor.cardBorderDark} ${themeColor.cardGlowDark}`
      }`}
    >
      {/* Hyperplexed Dynamic Colored Spotlight following mouse */}
      {isHovered && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300 rounded-[26px]"
          style={{
            background: isLight
              ? `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, ${themeColor.spotlightLight}, transparent 70%)`
              : `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, ${themeColor.spotlightDark}, transparent 70%)`,
          }}
        />
      )}

      {/* Simeydotme Holographic Glare Sheen */}
      {isHovered && (
        <div
          className="absolute inset-0 pointer-events-none opacity-30 mix-blend-color-dodge transition-opacity duration-300 rounded-[26px]"
          style={{
            background: `radial-gradient(260px circle at ${width - mousePos.x}px ${height - mousePos.y}px, rgba(255, 255, 255, 0.3), transparent 60%)`,
          }}
        />
      )}

      {/* Card Content: Free-Floating Big Icon + Full-Width Title (No Badge) + 1-Liner Text */}
      <div className="relative z-10 flex items-center gap-4">
        {/* Big Attractive Free-Floating Icon without Boxy Container */}
        <div className="shrink-0 transition-transform duration-300 group-hover:scale-115 group-hover:-translate-y-0.5">
          <Icon
            name={tool.icon}
            className={`size-11 sm:size-12 ${themeColor.iconColor} ${themeColor.iconGlow} transition-all duration-300`}
          />
        </div>

        {/* 1-Liner Title & 1-Liner Text (Clean, No Overlapping Badge) */}
        <div className="flex-1 min-w-0 pr-1">
          <h3
            className={`text-base sm:text-lg font-bold tracking-tight truncate transition-colors duration-200 ${
              isLight ? `text-slate-900 ${themeColor.titleHoverLight}` : `text-white ${themeColor.titleHoverDark}`
            }`}
          >
            {tool.name}
          </h3>

          <p
            className={`text-xs sm:text-sm truncate mt-0.5 leading-snug transition-colors ${
              isLight ? "text-slate-600 group-hover:text-slate-800" : "text-slate-300 group-hover:text-slate-200"
            }`}
          >
            {tool.oneLiner}
          </p>
        </div>

        {/* Quick View Indicator Pill */}
        <div
          className={`size-8 rounded-full flex items-center justify-center shrink-0 text-xs transition-all duration-300 group-hover:scale-110 ${
            isLight
              ? `bg-slate-100 text-slate-500 ${themeColor.arrowLight}`
              : `bg-white/5 text-slate-400 ${themeColor.arrowDark}`
          }`}
        >
          ↗
        </div>
      </div>
    </div>
  );
}

export function AllToolsFeaturesShowcaseSection() {
  const theme = useResolvedTheme();
  const isLight = theme === "light";
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalTool, setActiveModalTool] = useState<ToolFeatureItem | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveModalTool(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredTools = useMemo(() => {
    return TOOLS_AND_FEATURES.filter((tool) => {
      const matchesCategory = activeCategory === "all" || tool.category === activeCategory;
      const matchesSearch =
        searchQuery === "" ||
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.oneLiner.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.locationOrShortcut.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  const categories = [
    { id: "all", label: "All Tools", count: TOOLS_AND_FEATURES.length },
    { id: "timeline", label: "Timeline", count: TOOLS_AND_FEATURES.filter((t) => t.category === "timeline").length },
    { id: "ai", label: "AI & Smart", count: TOOLS_AND_FEATURES.filter((t) => t.category === "ai").length },
    { id: "audio", label: "Audio", count: TOOLS_AND_FEATURES.filter((t) => t.category === "audio").length },
    { id: "graphics", label: "Graphics", count: TOOLS_AND_FEATURES.filter((t) => t.category === "graphics").length },
    { id: "export", label: "Export", count: TOOLS_AND_FEATURES.filter((t) => t.category === "export").length },
    { id: "platform", label: "Platform", count: TOOLS_AND_FEATURES.filter((t) => t.category === "platform").length },
  ];

  return (
    <div className="w-full select-none">
      {/* Section Header */}
      <div className="text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-xs font-mono uppercase tracking-widest mb-4">
          <span className="size-2 rounded-full bg-purple-400 animate-pulse" />
          The Complete Creator Arsenal
        </div>

        <h2
          className={`text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          Every Tool. Every Feature. <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
            Crafted For Unstoppable Creators.
          </span>
        </h2>

        <p
          className={`text-sm sm:text-base max-w-2xl mx-auto mt-3 leading-relaxed ${
            isLight ? "text-slate-600" : "text-slate-300"
          }`}
        >
          Non-linear editing precision, real-time WebGL chroma keying, and Gemini AI audio ducking. Hover for 3D spotlight or click any tool to inspect full specifications.
        </p>
      </div>

      {/* Filter Pills & Live Search */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono transition-all duration-300 flex items-center gap-1.5 ${
                activeCategory === cat.id
                  ? isLight
                    ? "bg-purple-600 text-white font-bold shadow-md shadow-purple-500/25 scale-105"
                    : "bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold shadow-[0_0_15px_rgba(45, 212, 191,0.35)] scale-105"
                  : isLight
                  ? "bg-white/80 text-slate-600 hover:text-slate-950 border border-purple-200/50"
                  : "bg-[#110926]/80 text-slate-400 hover:text-white border border-white/10"
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-xs opacity-70 bg-black/30 px-1.5 py-0.2 rounded-full">
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Live Search */}
        <div className="w-full md:w-72 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all 22 features..."
            className={`w-full px-4 py-2 pl-9 rounded-full text-xs focus:outline-none transition ${
              isLight
                ? "bg-white border border-purple-200 text-slate-900 placeholder-slate-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-400"
                : "bg-[#0d0722]/90 border border-white/15 text-white placeholder-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            }`}
          />
          <div className="absolute left-3.5 top-2.5 text-slate-400 pointer-events-none">
            <Icon name="search" className="size-3.5" />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-2.5 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Non-Boxy Organic Cards Grid (1 col sm, 2 col md, 3 col xl) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {filteredTools.map((tool) => (
          <OrganicFeatureCard
            key={tool.id}
            tool={tool}
            isLight={isLight}
            onClick={() => setActiveModalTool(tool)}
          />
        ))}
      </div>

      {filteredTools.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-base font-bold">No tools matching {searchQuery} found.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
            className="mt-3 px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-400/40 hover:bg-cyan-500/30 transition"
          >
            Reset Search
          </button>
        </div>
      )}

      {/* Quick-Look Glass Modal (With Technical Specs & Keyboard Shortcuts) */}
      {activeModalTool && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setActiveModalTool(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-xl rounded-[32px] p-6 sm:p-8 border shadow-2xl transition-all ${
              isLight
                ? "bg-white/95 text-slate-900 border-purple-200 shadow-purple-900/15"
                : `bg-site-surface/95 text-white ${ACCENT_PALETTES[activeModalTool.accent || "cyan"].modalGlow}`
            }`}
          >
            {/* Close Button */}
            <button
              onClick={() => setActiveModalTool(null)}
              className="absolute top-5 right-5 size-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center text-sm transition"
              aria-label="Close dialog"
            >
              ✕
            </button>

            {/* Top Modal Header */}
            <div className="flex items-center gap-4 mb-5">
              <div className="shrink-0">
                <Icon
                  name={activeModalTool.icon}
                  className={`size-12 ${ACCENT_PALETTES[activeModalTool.accent || "cyan"].iconColor} ${ACCENT_PALETTES[activeModalTool.accent || "cyan"].iconGlow}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-purple-400 uppercase tracking-widest block">
                  {activeModalTool.categoryLabel}
                </span>
                <h3 className="text-2xl font-black truncate">{activeModalTool.name}</h3>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-xs font-mono text-cyan-300">
                  {activeModalTool.locationOrShortcut}
                </span>
              </div>
            </div>

            {/* Deep Description */}
            <p className="text-sm leading-relaxed text-slate-300 mb-6">
              {activeModalTool.fullDescription}
            </p>

            {/* Specs & Capabilities Grid */}
            <div className="space-y-2 mb-6 p-4 rounded-2xl bg-black/40 border border-white/10">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                Technical Capabilities & Specs
              </div>
              {activeModalTool.specs.map((spec, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-200">
                  <span className="size-1.5 rounded-full bg-cyan-400" />
                  <span>{spec}</span>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={() => setActiveModalTool(null)}
                className="px-4 py-2 rounded-full border border-white/15 text-xs text-slate-400 hover:text-white transition"
              >
                Close (Esc)
              </button>

              <Link
                href="/editor"
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-purple-600 hover:scale-105 text-white font-bold text-xs shadow-lg transition flex items-center gap-2"
              >
                <span>Launch in Studio</span>
                <span>🚀</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
