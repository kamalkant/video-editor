import {
  emptyDoc,
  type Canvas,
  type ClipTransition,
  type ElementLook,
  type TextClip,
  type TimelineDoc,
  mainTrack,
} from "../edit/doc";
import { addBlank, addElement, addText, setClip } from "../edit/docEdit";
import { DEFAULT_OUTPUT } from "../edit/spec";
import { elementClipOf, elementPreset } from "../elements/catalog";
import { textClipOf, textClipOfStyle } from "../text/layout";
import type { BroadcastTemplate } from "./types";

const HD_16_9: Canvas = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
};
const TALL_9_16: Canvas = {
  width: 1080,
  height: 1920,
  fps: 30,
  background: "#000000",
};
const SQUARE_1_1: Canvas = {
  width: 1080,
  height: 1080,
  fps: 30,
  background: "#000000",
};

type TextPatch = Partial<Omit<TextClip, "id" | "style">> & {
  style?: Partial<TextClip["style"]>;
};

function text(
  doc: TimelineDoc,
  preset: TextClip["style"]["preset"],
  words: string,
  start: number,
  duration: number,
  patch: TextPatch = {},
): TimelineDoc {
  const base = textClipOf(preset);
  // Default anim: dynamic rise or pop, with fade out!
  const anim = patch.anim ?? base.anim;
  const clip = {
    ...base,
    ...patch,
    anim,
    text: words,
    duration,
    style: { ...base.style, ...(patch.style ?? {}) },
  };
  return addText(doc, clip, start).doc;
}

function styled(
  doc: TimelineDoc,
  styleId: string,
  words: string,
  start: number,
  duration?: number,
  patch: TextPatch = {},
): TimelineDoc {
  const base = textClipOfStyle(styleId);
  const anim = patch.anim ?? base.anim;
  const clip = {
    ...base,
    ...patch,
    anim,
    text: words,
    duration: duration ?? base.duration,
    style: { ...base.style, ...(patch.style ?? {}) },
    transform: { ...base.transform, ...(patch.transform ?? {}) },
  };
  return addText(doc, clip, start).doc;
}

function element(
  doc: TimelineDoc,
  id: string,
  start: number,
  o: {
    duration?: number;
    look?: Partial<ElementLook>;
    x?: number;
    y?: number;
    anim?: TextClip["anim"];
  } = {},
): TimelineDoc {
  const preset = elementPreset(id);
  if (!preset) return doc;
  const c = elementClipOf(preset, doc.canvas);
  const transform = {
    ...c.transform,
    ...(o.x !== undefined ? { x: o.x } : {}),
    ...(o.y !== undefined ? { y: o.y } : {}),
  };
  const anim = o.anim ?? c.anim;
  return addElement(
    doc,
    {
      ...c,
      duration: o.duration ?? c.duration,
      el: { ...c.el, ...(o.look ?? {}) },
      transform,
      anim,
    },
    start,
  ).doc;
}

function start(canvas: Canvas, backdrop: Canvas["backdrop"]): TimelineDoc {
  return emptyDoc(DEFAULT_OUTPUT, { ...canvas, backdrop });
}

function addScene(
  doc: TimelineDoc,
  duration: number,
  fill = "#000000",
  transitionIn?: ClipTransition,
): TimelineDoc {
  const { doc: nextDoc, clipId } = addBlank(doc, mainTrack(doc).clips.length, {
    duration,
    fill,
  });
  if (transitionIn) {
    return setClip(nextDoc, clipId, { transitionIn });
  }
  return nextDoc;
}

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  // 1. Modern News Studio
  {
    id: "modern-news-studio",
    name: "Modern News Studio",
    category: "News & Broadcast",
    description:
      "Curved blue LED newsroom studio with professional lower third, live station bug, and presenter desk slot.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 20,
    tags: ["studio", "broadcast", "anchor", "desk", "blue", "news"],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "newsroomMatrix",
    slots: [
      {
        id: "bg",
        name: "Studio Backdrop",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "newsroom" },
      },
      {
        id: "presenter",
        name: "News Presenter",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "lowerThird",
        name: "Lower Third",
        type: "lowerThird",
        trackKind: "overlay",
        defaultContent: {
          text: "Kamal Kant\nChief News Anchor",
          color: "#1d4ed8",
        },
      },
      {
        id: "ticker",
        name: "News Ticker",
        type: "ticker",
        trackKind: "overlay",
        defaultContent: {
          text: "Global Markets Rally · Tech Summit Announces Major AI Breakthroughs · Weather Alert In Effect",
        },
      },
      {
        id: "logo",
        name: "Channel Logo",
        type: "logo",
        trackKind: "overlay",
        defaultContent: { text: "ViPlay NEWS" },
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "newsroom" });
      d = element(d, "live-pulse", 0, {
        duration: 20,
        x: -0.4,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "location-bug", 0.5, {
        duration: 19.5,
        x: 0.38,
        y: -0.42,
        anim: { in: "slide", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.presenterName ?? "Kamal Kant\nChief News Anchor",
        1,
        19,
        {
          anim: { in: "rise", out: "fade" },
          style: {
            box: custom?.primaryColor ?? "#1d4ed8",
            accent: custom?.accentColor ?? "#38bdf8",
          },
        },
      );
      d = element(d, "ticker", 0, {
        duration: 20,
        anim: { in: "rise", out: "fade" },
        look: {
          text:
            custom?.tickerText ??
            "Global Markets Rally · Tech Summit Announces Major AI Breakthroughs · Weather Alert In Effect",
        },
      });
      return d;
    },
  },

  // 2. Breaking News Special
  {
    id: "breaking-news-special",
    name: "Breaking News Special",
    category: "Breaking News",
    description:
      "Urgent red broadcast alert with pulsing emergency beacons, high-visibility headline banner, and continuous crawl.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: ["breaking", "urgent", "red", "headline", "alert", "flash"],
    previewVideoUrl: "/templates/media/breaking-red.mp4",
    previewCanvasEngine: "breakingPulse",
    slots: [
      {
        id: "bg",
        name: "Emergency Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "breaking-pulse" },
      },
      {
        id: "presenter",
        name: "Anchor Video",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "headline",
        name: "Breaking Headline",
        type: "lowerThird",
        trackKind: "overlay",
        defaultContent: {
          text: "BREAKING NEWS\nMAJOR DEVELOPMENTS REPORTED WORLDWIDE",
        },
      },
      {
        id: "ticker",
        name: "Emergency Ticker",
        type: "ticker",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "breaking-pulse" });
      d = addScene(d, 3.5, "#991b1b");
      d = addScene(d, 21.5, "#0f172a", { type: "wipeLeft", duration: 0.8 });
      d = text(d, "title", "BREAKING NEWS", 0, 3.5, {
        style: { box: "#dc2626", size: 120, color: "#ffffff", bold: true },
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "breaking-lower-third", 3.0, {
        duration: 22.0,
        anim: { in: "rise", out: "fade" },
        look: {
          label: "BREAKING NEWS",
          text:
            custom?.headline ?? "MAJOR DEVELOPMENTS REPORTED IN LIVE BROADCAST",
          subText:
            custom?.subText ??
            "Authorities hold international press briefing · Updates streaming continuously",
        },
      });
      d = element(d, "live", 0, {
        duration: 25,
        x: -0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "ticker", 3.0, {
        duration: 22,
        anim: { in: "rise", out: "fade" },
        look: {
          label: "FLASH",
          labelColor: "#dc2626",
          text:
            custom?.tickerText ??
            "URGENT REPORT: Official statements released · Global response underway",
        },
      });
      return d;
    },
  },

  // 3. 50/50 Dual Split-Screen Interview
  {
    id: "dual-anchor-split",
    name: "50/50 Dual Split-Screen Interview",
    category: "Interview",
    description:
      "Two-way split screen PIP interview between studio host and remote field correspondent with individual nameplates.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 20,
    tags: ["split", "interview", "dual", "pip", "debate", "correspondent"],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "newsroomMatrix",
    slots: [
      {
        id: "bg",
        name: "Studio Matrix",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "newsroom" },
      },
      {
        id: "anchorPIP",
        name: "Studio Anchor (Left)",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "fieldPIP",
        name: "Guest / Field (Right)",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "topic",
        name: "Debate Topic Banner",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "newsroom" });
      d = element(d, "frame", 0, {
        duration: 20,
        x: -0.24,
        y: -0.05,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "frame", 0, {
        duration: 20,
        x: 0.24,
        y: -0.05,
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.hostName ?? "Marcus Vance\nStudio 1A · Washington",
        1,
        19,
        {
          transform: { fit: "fit", x: -0.24, y: 0.32, scale: 0.75 },
          anim: { in: "rise", out: "fade" },
          style: { box: "#1e3a8a", accent: "#60a5fa" },
        },
      );
      d = text(
        d,
        "lowerThird",
        custom?.guestName ?? "Dr. Elena Rostova\nLive via Satellite · London",
        1.5,
        18.5,
        {
          transform: { fit: "fit", x: 0.24, y: 0.32, scale: 0.75 },
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f766e", accent: "#2dd4bf" },
        },
      );
      d = text(
        d,
        "title",
        custom?.topic ?? "SPECIAL REPORT: THE DIPLOMATIC ACCORD",
        0.5,
        19.5,
        {
          transform: { fit: "fit", x: 0, y: -0.42, scale: 0.8 },
          anim: { in: "pop", out: "fade" },
          style: { box: "#0f172a", color: "#f8fafc" },
        },
      );
      d = element(d, "live", 0, {
        duration: 20,
        x: -0.44,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 4. Virtual Screen Wall OTS
  {
    id: "virtual-screen-wall",
    name: "Virtual Screen Wall OTS",
    category: "Virtual Studio",
    description:
      "Anchor on left with over-the-shoulder (OTS) floating media screen for B-roll, charts, or video feeds.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 20,
    tags: ["virtual", "screen", "ots", "broll", "graphics"],
    previewVideoUrl: "/templates/media/tech-grid.mp4",
    previewCanvasEngine: "newsroomMatrix",
    slots: [
      {
        id: "bg",
        name: "Virtual Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "newsroom" },
      },
      {
        id: "otsScreen",
        name: "OTS Video Screen",
        type: "screenGraphic",
        trackKind: "overlay",
      },
      {
        id: "presenter",
        name: "Standing Anchor",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "topic",
        name: "Topic Card",
        type: "screenGraphic",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "newsroom" });
      d = element(d, "frame", 0.5, {
        duration: 19.5,
        x: 0.28,
        y: -0.15,
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "title",
        custom?.topicTitle ?? "GLOBAL CLIMATE SUMMIT",
        1,
        19,
        {
          transform: { fit: "fit", x: 0.28, y: -0.32, scale: 0.65 },
          anim: { in: "pop", out: "fade" },
          style: { size: 56, box: "#0369a1", color: "#ffffff" },
        },
      );
      d = text(
        d,
        "lowerThird",
        custom?.presenterName ?? "David Miller\nEnvironmental Correspondent",
        1.5,
        18.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#0b1220", accent: "#38bdf8" },
        },
      );
      d = element(d, "live-pulse", 0, { duration: 20, x: -0.42, y: -0.42 });
      return d;
    },
  },

  // 5. World News 3D Globe
  {
    id: "world-news-globe",
    name: "World News 3D Globe",
    category: "World News",
    description:
      "International broadcast design featuring rotating 3D world globe, global headline strap, and multi-country bug.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 30,
    tags: ["world", "globe", "international", "global", "earth", "diplomacy"],
    previewVideoUrl: "/templates/media/globe-3d.mp4",
    previewCanvasEngine: "globe3d",
    slots: [
      {
        id: "bg",
        name: "World Globe Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "globe-3d" },
      },
      {
        id: "presenter",
        name: "International Anchor",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "headline",
        name: "World Headline",
        type: "lowerThird",
        trackKind: "overlay",
      },
      {
        id: "ticker",
        name: "World Ticker",
        type: "ticker",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "globe-3d" });
      d = text(d, "title", "WORLD NEWS TONIGHT", 0, 4, {
        style: { box: "#075985", size: 100, accent: "#38bdf8" },
        anim: { in: "rise", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.presenterName ?? "Elena Rostova\nInternational Affairs Desk",
        2,
        28,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#0c4a6e", accent: "#7dd3fc" },
        },
      );
      d = element(d, "location-bug", 0, {
        duration: 30,
        x: 0.38,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "ticker", 0, {
        duration: 30,
        anim: { in: "rise", out: "fade" },
        look: {
          label: "WORLD DESK",
          labelColor: "#0284c7",
          text: "UN General Assembly Convenes · Transatlantic Trade Agreement Finalized · Asia-Pacific Summit Opens",
        },
      });
      return d;
    },
  },

  // 6. Doppler Weather 7-Day Live Forecast
  {
    id: "doppler-weather-radar",
    name: "Doppler Weather 7-Day Live Forecast",
    category: "Weather News",
    description:
      "Doppler radar sweep backdrop with 5-day temperature strap, storm alert badge, and meteorologist position.",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 20,
    tags: ["weather", "radar", "doppler", "forecast", "rain", "temperature"],
    previewVideoUrl: "/templates/media/radar-weather.mp4",
    previewCanvasEngine: "radarSweep",
    slots: [
      {
        id: "bg",
        name: "Doppler Radar",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "radar-sweep" },
      },
      {
        id: "presenter",
        name: "Meteorologist",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "forecast",
        name: "Forecast Strap",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "radar-sweep" });
      d = text(d, "title", "WEATHER CENTER 24/7", 0, 3.5, {
        style: { box: "#0d9488", size: 85, color: "#ffffff" },
        anim: { in: "rise", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.forecastText ??
          "Delhi · 34°C · Severe Thunderstorms Approaching\nWind 45 km/h · Humidity 82% · Barometer Falling",
        1.5,
        18.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#115e59", accent: "#2dd4bf" },
        },
      );
      d = element(d, "live", 0, {
        duration: 20,
        x: -0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "warning", 0.5, {
        duration: 19.5,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 7. Wall Street Financial Markets Hub
  {
    id: "wall-street-financial",
    name: "Wall Street Financial Markets Hub",
    category: "Finance News",
    description:
      "Live market ticker, candlestick visualizers, corporate earnings lower third, and green/red trading bug.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: ["finance", "stocks", "wall street", "trading", "crypto", "business"],
    previewVideoUrl: "/templates/media/finance-ticker.mp4",
    previewCanvasEngine: "marketTicker",
    slots: [
      {
        id: "bg",
        name: "Finance Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "market-ticker" },
      },
      {
        id: "presenter",
        name: "Market Analyst",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "marketTicker",
        name: "Indices Strip",
        type: "ticker",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "market-ticker" });
      d = text(d, "title", "MARKET CLOSING BELL", 0, 4, {
        style: { box: "#14532d", size: 85, color: "#ffffff" },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.analystName ?? "Victoria Sterling\nChief Financial Strategist",
        1.5,
        23.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#064e3b", accent: "#34d399" },
        },
      );
      d = element(d, "market-ticker", 0, {
        duration: 25,
        anim: { in: "rise", out: "fade" },
      });
      d = element(d, "location-bug", 0, {
        duration: 25,
        x: 0.38,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 8. Sports Center Pro Recap
  {
    id: "sports-center-pro",
    name: "Sports Center Pro Recap",
    category: "Sports News",
    description:
      "High-octane sports recap package with match score bug, tournament standings bug, and dynamic lower third.",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 25,
    tags: ["sports", "score", "football", "basketball", "highlights", "action"],
    previewVideoUrl: "/templates/media/sports-arena.mp4",
    previewCanvasEngine: "sportsArena",
    slots: [
      {
        id: "bg",
        name: "Sports Arena",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "sports-arena" },
      },
      {
        id: "presenter",
        name: "Sports Caster",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "scoreBug",
        name: "Score Banner",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "sports-arena" });
      d = addScene(d, 3.0, "#b45309");
      d = addScene(d, 22.0, "#0f172a", { type: "pushLeft", duration: 0.8 });
      d = text(d, "title", "SPORTS CENTER LIVE", 0, 3.0, {
        style: { box: "#ea580c", size: 90, color: "#ffffff", bold: true },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.scoreText ??
          "LIV 2 - 1 MCI · 87:14 2nd Half\nStunning Late Decider Changes Title Race",
        2,
        23,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#9a3412", accent: "#fb923c" },
        },
      );
      d = element(d, "crown", 1.0, {
        duration: 24,
        x: -0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 9. Crime Watch CCTV Bulletin
  {
    id: "crime-cctv-bulletin",
    name: "Crime Watch CCTV Bulletin",
    category: "Crime News",
    description:
      "Surveillance camera aesthetic with HUD night-vision scanlines, timestamp stamp, and case file identification bug.",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 20,
    tags: [
      "crime",
      "cctv",
      "police",
      "investigation",
      "surveillance",
      "tactical",
    ],
    previewVideoUrl: "/templates/media/crime-cctv.mp4",
    previewCanvasEngine: "radarSweep",
    slots: [
      {
        id: "bg",
        name: "Surveillance Feed",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "radar-sweep" },
      },
      {
        id: "cctvHud",
        name: "CCTV Viewfinder HUD",
        type: "screenGraphic",
        trackKind: "overlay",
      },
      {
        id: "caseTag",
        name: "Case File Tag",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "radar-sweep" });
      d = element(d, "camera-viewfinder", 0, { duration: 20 });
      d = text(
        d,
        "lowerThird",
        custom?.caseText ??
          "CASE FILE #84920 · NORTH SECTOR POLICE\nSuspect Sighted on Camera 4 · Citizens Advised Caution",
        1,
        19,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#7f1d1d", accent: "#f87171" },
        },
      );
      d = element(d, "rec", 0, {
        duration: 20,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 10. Silicon Valley Tech Pulse
  {
    id: "tech-silicon-dispatch",
    name: "Silicon Valley Tech Pulse",
    category: "Technology News",
    description:
      "Futuristic neon cyber circuit grid with developer code snippets, AI announcement banner, and holographic lower third.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 20,
    tags: ["tech", "cyber", "ai", "silicon", "matrix", "future"],
    previewVideoUrl: "/templates/media/tech-grid.mp4",
    previewCanvasEngine: "techGrid",
    slots: [
      {
        id: "bg",
        name: "Cyber Matrix",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "tech-grid" },
      },
      {
        id: "presenter",
        name: "Tech Anchor",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "techTag",
        name: "AI Dispatch Tag",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "tech-grid" });
      d = text(d, "title", "TECH PULSE DISPATCH", 0, 3.5, {
        style: { box: "#0e7490", size: 85, color: "#ffffff" },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.headline ??
          "Next-Gen Foundation Models Announced\nBreakthrough Autonomous Logic Validated in Global Benchmarks",
        1.5,
        18.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#155e75", accent: "#22d3ee" },
        },
      );
      d = element(d, "live", 0, { duration: 20, x: -0.42, y: -0.42 });
      d = element(d, "progress", 0, { duration: 20 });
      return d;
    },
  },

  // 11. 3-Way Round Table Debate
  {
    id: "panel-debate-tri-box",
    name: "3-Way Round Table Debate",
    category: "Panel Discussion",
    description:
      "Tri-box multi-PIP layout with host in center and two opposing analysts with live debate timer.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 30,
    tags: ["panel", "debate", "tribox", "roundtable", "politics", "discussion"],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "newsroomMatrix",
    slots: [
      {
        id: "bg",
        name: "Debate Studio",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "newsroom" },
      },
      {
        id: "host",
        name: "Host (Center)",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "panel1",
        name: "Panelist A (Left)",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "panel2",
        name: "Panelist B (Right)",
        type: "presenter",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "newsroom" });
      d = element(d, "frame", 0, {
        duration: 30,
        x: -0.32,
        y: -0.05,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "frame", 0, {
        duration: 30,
        x: 0,
        y: -0.05,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "frame", 0, {
        duration: 30,
        x: 0.32,
        y: -0.05,
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "title",
        custom?.topic ?? "PRIME TIME DEBATE: THE ECONOMIC ROADMAP",
        0,
        30,
        {
          transform: { fit: "fit", x: 0, y: -0.42, scale: 0.8 },
          anim: { in: "pop", out: "fade" },
          style: { box: "#0f172a", color: "#f8fafc" },
        },
      );
      d = text(d, "lowerThird", "Senator Hayes · Yes On Bill", 1, 29, {
        transform: { fit: "fit", x: -0.32, y: 0.28, scale: 0.65 },
        anim: { in: "rise", out: "fade" },
        style: { box: "#1d4ed8" },
      });
      d = text(d, "lowerThird", "Alex Croft · Moderator", 1, 29, {
        transform: { fit: "fit", x: 0, y: 0.28, scale: 0.65 },
        anim: { in: "rise", out: "fade" },
        style: { box: "#334155" },
      });
      d = text(d, "lowerThird", "Gov. Miller · Opposition", 1, 29, {
        transform: { fit: "fit", x: 0.32, y: 0.28, scale: 0.65 },
        anim: { in: "rise", out: "fade" },
        style: { box: "#b91c1c" },
      });
      return d;
    },
  },

  // 12. Podcast Studio Pro
  {
    id: "podcast-studio-neon",
    name: "Podcast Studio Pro",
    category: "Podcast",
    description:
      "Acoustic lounge studio set with ambient neon equalizer visualizers, podcast episode badge, and dual mic plaques.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 30,
    tags: ["podcast", "audio", "neon", "interview", "equalizer", "mic"],
    previewVideoUrl: "/templates/media/podcast-studio.mp4",
    previewCanvasEngine: "podcastWave",
    slots: [
      {
        id: "bg",
        name: "Acoustic Neon Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "podcast-wave" },
      },
      {
        id: "presenter",
        name: "Host & Guest",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "equalizer",
        name: "Live Audio Wave",
        type: "screenGraphic",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "podcast-wave" });
      d = text(
        d,
        "title",
        custom?.episodeTitle ?? "THE DEEP DIVE PODCAST · EP 142",
        0,
        4,
        {
          style: { box: "#6b21a8", size: 80, color: "#ffffff" },
          anim: { in: "pop", out: "fade" },
        },
      );
      d = text(
        d,
        "lowerThird",
        custom?.hostName ??
          "Hosted by Kamal Kant\nFeaturing Special Guest Dr. Sarah Croft",
        1.5,
        28.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#581c87", accent: "#c084fc" },
        },
      );
      d = element(d, "audio-wave", 0, {
        duration: 30,
        x: -0.32,
        y: 0.35,
        anim: { in: "rise", out: "fade" },
      });
      d = element(d, "music", 0, {
        duration: 30,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 13. White House Press Briefing
  {
    id: "press-conference-live",
    name: "White House Press Briefing",
    category: "Politics / Current Affairs",
    description:
      "Official press podium briefing room with government seal, audio wave indicator, and live reporter question captions.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: [
      "press",
      "podium",
      "briefing",
      "politics",
      "white house",
      "official",
    ],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "newsroomMatrix",
    slots: [
      {
        id: "bg",
        name: "Podium Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "newsroom" },
      },
      {
        id: "spokesperson",
        name: "Press Secretary",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "briefingStrap",
        name: "Briefing Lower Third",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "newsroom" });
      d = text(d, "title", "OFFICIAL PRESS BRIEFING · LIVE", 0, 25, {
        transform: { fit: "fit", x: 0, y: -0.42, scale: 0.8 },
        anim: { in: "pop", out: "fade" },
        style: { box: "#1e3a8a", color: "#f8fafc" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.speakerName ??
          "White House Press Secretary\nAddressing National Press Corps in Briefing Room",
        1,
        24,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f172a", accent: "#38bdf8" },
        },
      );
      d = element(d, "live", 0, {
        duration: 25,
        x: -0.44,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "audio-wave", 0.5, { duration: 24.5, x: 0.35, y: -0.42 });
      return d;
    },
  },

  // 14. 9:16 Vertical Reels News Flash
  {
    id: "vertical-reels-flash",
    name: "9:16 Vertical Reels News Flash",
    category: "Shorts / Reels",
    description:
      "High-retention mobile vertical layout with top progress bar, punchy high-contrast hook, and presenter safe zones.",
    aspectRatio: "9:16",
    resolution: "4K",
    duration: 15,
    tags: ["vertical", "9:16", "reels", "shorts", "tiktok", "mobile", "viral"],
    previewVideoUrl: "/templates/media/vertical-reels.mp4",
    previewCanvasEngine: "verticalReels",
    slots: [
      {
        id: "bg",
        name: "Vertical Backdrop",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "vertical-reels" },
      },
      {
        id: "presenter",
        name: "Vertical Anchor",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "hook",
        name: "Punchy Hook Title",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(TALL_9_16, { kind: "set", id: "vertical-reels" });
      d = text(
        d,
        "title",
        custom?.hookTitle ?? "DID THIS JUST CHANGE EVERYTHING?",
        0,
        15,
        {
          transform: { fit: "fit", x: 0, y: -0.32, scale: 0.9 },
          anim: { in: "pop", out: "fade" },
          style: { box: "#facc15", color: "#000000", size: 68, bold: true },
        },
      );
      d = text(
        d,
        "lowerThird",
        custom?.caption ??
          "Swipe up for complete breakdown\nLink in bio for source documents",
        1,
        14,
        {
          transform: { fit: "fit", x: 0, y: 0.36, scale: 0.8 },
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f172a", accent: "#38bdf8" },
        },
      );
      d = element(d, "progress", 0, { duration: 15 });
      d = element(d, "live", 0, {
        duration: 15,
        x: -0.35,
        y: -0.45,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 15. 9:16 Vertical Emergency Alert
  {
    id: "vertical-breaking-alert",
    name: "9:16 Vertical Emergency Alert",
    category: "Shorts / Reels",
    description:
      "Full-height vertical emergency alert with flashing red header, stacked bullet points, and urgent mobile callout.",
    aspectRatio: "9:16",
    resolution: "4K",
    duration: 20,
    tags: ["vertical", "9:16", "alert", "emergency", "flash", "mobile"],
    previewVideoUrl: "/templates/media/vertical-breaking.mp4",
    previewCanvasEngine: "breakingPulse",
    slots: [
      {
        id: "bg",
        name: "Red Emergency Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "breaking-pulse" },
      },
      {
        id: "headline",
        name: "Urgent Vertical Headline",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(TALL_9_16, { kind: "set", id: "breaking-pulse" });
      d = addScene(d, 3.0, "#7f1d1d");
      d = addScene(d, 17.0, "#0f172a", { type: "wipeDown", duration: 0.8 });
      d = text(d, "title", "EMERGENCY ALERT", 0, 3.0, {
        transform: { fit: "fit", x: 0, y: -0.35, scale: 0.95 },
        anim: { in: "pop", out: "fade" },
        style: { box: "#dc2626", size: 76, color: "#ffffff", bold: true },
      });
      d = text(
        d,
        "title",
        custom?.headline ?? "BREAKING: GLOBAL SUMMIT DISCUSSIONS STALL",
        3.0,
        17.0,
        {
          transform: { fit: "fit", x: 0, y: -0.15, scale: 0.85 },
          anim: { in: "pop", out: "fade" },
          style: { box: "#b91c1c", color: "#ffffff", size: 62 },
        },
      );
      d = element(d, "breaking", 3.0, { duration: 17, x: -0.28, y: -0.42 });
      d = element(d, "progress", 0, { duration: 20 });
      return d;
    },
  },

  // 16. 1:1 Square Social News Bulletin
  {
    id: "square-social-bulletin",
    name: "1:1 Square Social News Bulletin",
    category: "Social News",
    description:
      "Balanced square card layout designed for Instagram and LinkedIn feeds with branded frame and verified badge.",
    aspectRatio: "1:1",
    resolution: "HD",
    duration: 15,
    tags: ["square", "1:1", "social", "instagram", "linkedin", "feed"],
    previewVideoUrl: "/templates/media/square-social.mp4",
    previewCanvasEngine: "socialSquare",
    slots: [
      {
        id: "bg",
        name: "Square Backdrop",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "social-square" },
      },
      {
        id: "headline",
        name: "Center Headline",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(SQUARE_1_1, { kind: "set", id: "social-square" });
      d = element(d, "frame", 0, {
        duration: 15,
        x: 0,
        y: 0,
        anim: { in: "pop", out: "fade" },
      });
      d = text(d, "title", "ViPlay GLOBAL REPORT", 0, 15, {
        transform: { fit: "fit", x: 0, y: -0.38, scale: 0.75 },
        anim: { in: "pop", out: "fade" },
        style: { box: "#0284c7", color: "#ffffff", size: 58 },
      });
      d = text(
        d,
        "title",
        custom?.headline ?? "TECH ECOSYSTEM MARKS HISTORIC ADVANCEMENTS",
        1,
        14,
        {
          transform: { fit: "fit", x: 0, y: 0.05, scale: 0.85 },
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f172a", color: "#f8fafc", size: 52 },
        },
      );
      d = element(d, "fact-check", 1.5, {
        duration: 13.5,
        x: 0,
        y: 0.36,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 17. YouTube Longform Explainer
  {
    id: "youtube-news-explainer",
    name: "YouTube Longform Explainer",
    category: "YouTube News",
    description:
      "Documentary-grade video essay layout with chapter progression pill, citation badge, and lower third.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 30,
    tags: [
      "youtube",
      "explainer",
      "documentary",
      "essay",
      "chapters",
      "citations",
    ],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "explainerDoc",
    slots: [
      {
        id: "bg",
        name: "Explainer Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "explainer-doc" },
      },
      {
        id: "chapter",
        name: "Chapter Bug",
        type: "lowerThird",
        trackKind: "overlay",
      },
      {
        id: "citation",
        name: "Source Citation",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "explainer-doc" });
      d = addScene(d, 4.0, "#0f172a");
      d = addScene(d, 26.0, "#1e293b", { type: "wipeRight", duration: 0.8 });
      d = text(
        d,
        "title",
        custom?.chapterTitle ?? "CHAPTER 1: THE TURNING POINT",
        0,
        4.0,
        {
          style: { box: "#3b82f6", size: 85, color: "#ffffff" },
          anim: { in: "pop", out: "fade" },
        },
      );
      d = text(
        d,
        "lowerThird",
        custom?.citationText ??
          "Source: International Economic Institute 2026 Report · Validated Data",
        2,
        28,
        {
          transform: { fit: "fit", x: 0.28, y: 0.38, scale: 0.65 },
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f172a", accent: "#94a3b8" },
        },
      );
      d = element(d, "progress", 0, { duration: 30 });
      return d;
    },
  },

  // 18. Entertainment & Hollywood Tonight
  {
    id: "entertainment-buzz",
    name: "Entertainment & Hollywood Tonight",
    category: "Entertainment News",
    description:
      "Vibrant magenta VIP glamour set with celebrity spotlight frame, red carpet lower third, and trending hashtag.",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 20,
    tags: [
      "entertainment",
      "hollywood",
      "celebrity",
      "vip",
      "glamour",
      "stars",
    ],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "vipGlamour",
    slots: [
      {
        id: "bg",
        name: "Glamour Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "vip-glamour" },
      },
      {
        id: "presenter",
        name: "Entertainment Host",
        type: "presenter",
        trackKind: "overlay",
      },
      {
        id: "headline",
        name: "Celebrity Headline",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "vip-glamour" });
      d = text(d, "title", "HOLLYWOOD BUZZ TONIGHT", 0, 3.5, {
        style: { box: "#be185d", size: 88, color: "#ffffff" },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.headline ??
          "World Premiere Lights Up Red Carpet\nStars Gather For The Year's Most Anticipated Blockbuster",
        1.5,
        18.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#831843", accent: "#f472b6" },
        },
      );
      d = element(d, "gold-star", 0.5, {
        duration: 19.5,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 19. Space Frontier & Science Hub
  {
    id: "space-science-frontier",
    name: "Space Frontier & Science Hub",
    category: "Technology News",
    description:
      "Deep space orbital trajectory grid with mission countdown telemetry bug and cosmic breakthrough title card.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: ["space", "nasa", "orbit", "astronomy", "science", "mission"],
    previewVideoUrl: "/templates/media/globe-3d.mp4",
    previewCanvasEngine: "globe3d",
    slots: [
      {
        id: "bg",
        name: "Space Orbit Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "globe-3d" },
      },
      {
        id: "telemetry",
        name: "Mission Telemetry",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "globe-3d" });
      d = text(d, "title", "SPACE FRONTIER EXPLORATION", 0, 3.5, {
        style: { box: "#1e1b4b", size: 82, color: "#38bdf8" },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.missionText ??
          "LUNAR ARTEMIS EXPEDITION · T-MINUS 00:14:22\nAstronauts Complete Final Pre-Launch Systems Check",
        1.5,
        23.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#0f172a", accent: "#38bdf8" },
        },
      );
      d = element(d, "location-bug", 0, {
        duration: 25,
        x: 0.38,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 20. Live Election Decision Desk
  {
    id: "election-results-hq",
    name: "Live Election Decision Desk",
    category: "Politics / Current Affairs",
    description:
      "Election night headquarters with dual-party electoral vote bar (270 To Win), live polls bug, and projected winner alert.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 30,
    tags: [
      "election",
      "polls",
      "vote",
      "decision desk",
      "democracy",
      "results",
    ],
    previewVideoUrl: "/templates/media/breaking-red.mp4",
    previewCanvasEngine: "electionDesk",
    slots: [
      {
        id: "bg",
        name: "Election Command Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "election-desk" },
      },
      {
        id: "electoralBar",
        name: "Electoral Vote Bar",
        type: "screenGraphic",
        trackKind: "overlay",
      },
      {
        id: "projection",
        name: "State Projection Strap",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "election-desk" });
      d = addScene(d, 3.5, "#1e3a8a");
      d = addScene(d, 26.5, "#0f172a", { type: "circleOpen", duration: 1.0 });
      d = text(d, "title", "ELECTION DECISION DESK", 0, 3.5, {
        style: { box: "#dc2626", size: 85, color: "#ffffff", bold: true },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.projectionText ??
          "PENNSYLVANIA PROJECTED · KEY SWING STATE DECIDED\nElectoral Count: 242 Blue · 238 Red · 270 To Win",
        2,
        28,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#1e3a8a", accent: "#ef4444" },
        },
      );
      d = element(d, "special-report", 0, {
        duration: 30,
        x: -0.38,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "live", 0, { duration: 30, x: 0.42, y: -0.42 });
      return d;
    },
  },

  // 21. Global Climate Crisis Watch
  {
    id: "climate-crisis-watch",
    name: "Global Climate Crisis Watch",
    category: "World News",
    description:
      "Eco-alert emerald & amber set with atmospheric CO2 counter (426.8 PPM), incident monitor, and environmental strap.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: ["climate", "environment", "planet", "co2", "green", "weather"],
    previewVideoUrl: "/templates/media/radar-weather.mp4",
    previewCanvasEngine: "radarSweep",
    slots: [
      {
        id: "bg",
        name: "Climate Radar Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "radar-sweep" },
      },
      {
        id: "climateStrap",
        name: "Climate Metric Strap",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "radar-sweep" });
      d = text(d, "title", "CLIMATE CRISIS WATCH", 0, 3.5, {
        style: { box: "#065f46", size: 85, color: "#a7f3d0" },
        anim: { in: "rise", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.statText ??
          "GLOBAL CO2: 426.8 PPM · PEAK RECORDED THIS DECADE\nInternational Summit Agrees On Immediate Renewable Milestones",
        1.5,
        23.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#064e3b", accent: "#6ee7b7" },
        },
      );
      d = element(d, "warning", 0, {
        duration: 25,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 22. Morning Sunrise Daily Briefing
  {
    id: "morning-coffee-briefing",
    name: "Morning Sunrise Daily Briefing",
    category: "News & Broadcast",
    description:
      "Warm amber/gold sunrise studio set with morning agenda checklist, local commuter traffic bug, and cheerful anchor lower third.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 20,
    tags: ["morning", "sunrise", "briefing", "daily", "coffee", "agenda"],
    previewVideoUrl: "/templates/media/newsroom-modern.mp4",
    previewCanvasEngine: "sunriseBriefing",
    slots: [
      {
        id: "bg",
        name: "Sunrise Studio",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "sunrise-briefing" },
      },
      {
        id: "agenda",
        name: "Today's Agenda",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "sunrise-briefing" });
      d = text(d, "title", "GOOD MORNING TODAY", 0, 3.5, {
        style: { box: "#d97706", size: 88, color: "#ffffff" },
        anim: { in: "rise", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.agendaText ??
          "TODAY'S 3 BIG STORIES YOU NEED TO KNOW\nMarket Openings · Commuter Transit Updates · Weekend Outlook",
        1.5,
        18.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#b45309", accent: "#fde68a" },
        },
      );
      d = element(d, "sun", 0, {
        duration: 20,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 23. Deep Investigative Classified Report
  {
    id: "investigative-deep-dive",
    name: "Deep Investigative Classified Report",
    category: "Crime News",
    description:
      "Noir confidential archive aesthetic with red TOP SECRET // CLASSIFIED stamp and redacted case headline banner.",
    aspectRatio: "16:9",
    resolution: "HD",
    duration: 25,
    tags: [
      "investigative",
      "classified",
      "noir",
      "secret",
      "archive",
      "whistleblower",
    ],
    previewVideoUrl: "/templates/media/crime-cctv.mp4",
    previewCanvasEngine: "radarSweep",
    slots: [
      {
        id: "bg",
        name: "Classified Archive Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "radar-sweep" },
      },
      {
        id: "headline",
        name: "Redacted Investigation",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "radar-sweep" });
      d = element(d, "stamp", 0, {
        duration: 25,
        x: 0.38,
        y: -0.38,
        anim: { in: "pop", out: "fade" },
      });
      d = text(d, "title", "TOP SECRET // CLASSIFIED REPORT", 0, 4.0, {
        style: { box: "#450a0a", size: 82, color: "#ef4444" },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.reportText ??
          "SPECIAL INVESTIGATION: UNSEALED TRANSCRIPTS\nUnprecedented Whistleblower Revelations Spark Congressional Inquiry",
        1.5,
        23.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#1c1917", accent: "#dc2626" },
        },
      );
      d = element(d, "exclusive", 0, {
        duration: 25,
        x: -0.4,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      return d;
    },
  },

  // 24. Esports Arena Championship
  {
    id: "esports-arena-championship",
    name: "Esports Arena Championship",
    category: "Sports News",
    description:
      "Cyber electric stadium with team faceoff bug (SENTINELS vs FNATIC), BO5 score bug, and MVP player stats card.",
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 25,
    tags: ["esports", "gaming", "championship", "tournament", "cyber", "match"],
    previewVideoUrl: "/templates/media/sports-arena.mp4",
    previewCanvasEngine: "sportsArena",
    slots: [
      {
        id: "bg",
        name: "Cyber Arena Set",
        type: "background",
        trackKind: "main",
        defaultContent: { backdropSetId: "sports-arena" },
      },
      {
        id: "matchBug",
        name: "Faceoff Match Bug",
        type: "lowerThird",
        trackKind: "overlay",
      },
    ],
    build: (custom) => {
      let d = start(HD_16_9, { kind: "set", id: "sports-arena" });
      d = text(d, "title", "GRAND FINALS CHAMPIONSHIP", 0, 3.5, {
        style: { box: "#4338ca", size: 88, color: "#ffffff", bold: true },
        anim: { in: "pop", out: "fade" },
      });
      d = text(
        d,
        "lowerThird",
        custom?.matchText ??
          "SENTINELS 2 - 1 FNATIC · MATCH POINT GAME 4\nDeciding Map In Overtime Ahead Of The World Trophy",
        1.5,
        23.5,
        {
          anim: { in: "rise", out: "fade" },
          style: { box: "#312e81", accent: "#818cf8" },
        },
      );
      d = element(d, "bolt", 0, {
        duration: 25,
        x: 0.42,
        y: -0.42,
        anim: { in: "pop", out: "fade" },
      });
      d = element(d, "live", 0, { duration: 25, x: -0.42, y: -0.42 });
      return d;
    },
  },
];

export const BROADCAST_TEMPLATES_BY_ID = new Map(
  BROADCAST_TEMPLATES.map((t) => [t.id, t]),
);
