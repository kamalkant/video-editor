import {
  emptyDoc,
  type Canvas,
  type ElementLook,
  type TextClip,
  type TimelineDoc,
} from "./edit/doc";
import { addBlank, addElement, addText } from "./edit/docEdit";
import { DEFAULT_OUTPUT } from "./edit/spec";
import { elementClipOf, elementPreset } from "./elements/catalog";
import { textClipOf, textClipOfStyle } from "./text/layout";

/**
 * Ready-made projects: a canvas, a backdrop (studio set or gradient) and text
 * styles with animations. You add your own video / pictures on top. Built
 * from the same pieces as a normal project, so everything stays editable.
 */

import { BROADCAST_TEMPLATES } from "./templates/newsTemplates";
export * from "./templates/types";
export * from "./templates/newsTemplates";

export type TemplateCategory =
  | "News"
  | "Presenter"
  | "YouTube"
  | "Shorts & Reels"
  | "Social Media"
  | "Business"
  | "Ads"
  | "Educational"
  | "Festival"
  | "Gaming"
  | "Weather"
  | "Custom";
export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  hint: string;
  build: () => TimelineDoc;
};

const HD: Canvas = {
  width: 1920,
  height: 1080,
  fps: 30,
  background: "#000000",
};
const TALL: Canvas = {
  width: 1080,
  height: 1920,
  fps: 30,
  background: "#000000",
};
const SQUARE: Canvas = {
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
  const clip = {
    ...base,
    ...patch,
    text: words,
    duration,
    style: { ...base.style, ...(patch.style ?? {}) },
  };
  return addText(doc, clip, start).doc;
}

/** Text in one of the ready-made styles (Text panel: Big title, Quote, Subscribe button…). */
function styled(
  doc: TimelineDoc,
  styleId: string,
  words: string,
  start: number,
  duration?: number,
  patch: TextPatch = {},
): TimelineDoc {
  const base = textClipOfStyle(styleId);
  const clip = {
    ...base,
    ...patch,
    text: words,
    duration: duration ?? base.duration,
    style: { ...base.style, ...(patch.style ?? {}) },
    transform: { ...base.transform, ...(patch.transform ?? {}) },
  };
  return addText(doc, clip, start).doc;
}

/** A ready-made element (Elements panel), sized for the canvas; its look can be changed (words, colors). */
function element(
  doc: TimelineDoc,
  id: string,
  start: number,
  o: {
    duration?: number;
    look?: Partial<ElementLook>;
    x?: number;
    y?: number;
  } = {},
): TimelineDoc {
  const c = elementClipOf(elementPreset(id)!, doc.canvas);
  const transform = {
    ...c.transform,
    ...(o.x !== undefined ? { x: o.x } : {}),
    ...(o.y !== undefined ? { y: o.y } : {}),
  };
  return addElement(
    doc,
    {
      ...c,
      duration: o.duration ?? c.duration,
      el: { ...c.el, ...(o.look ?? {}) },
      transform,
    },
    start,
  ).doc;
}

/** A blank scene at the end of Video 1 (a title card, a countdown number…). */
function blank(doc: TimelineDoc, fill: string, seconds: number): TimelineDoc {
  return addBlank(doc, Infinity, { fill, duration: seconds }).doc;
}

function start(canvas: Canvas, backdrop: Canvas["backdrop"]): TimelineDoc {
  return emptyDoc(DEFAULT_OUTPUT, { ...canvas, backdrop });
}

export const TEMPLATES: Template[] = [
  ...BROADCAST_TEMPLATES.map((bt) => ({
    id: bt.id,
    name: bt.name,
    category: (bt.category.includes("News")
      ? "News"
      : bt.category.includes("Shorts")
        ? "Shorts & Reels"
        : bt.category.includes("Podcast") || bt.category.includes("Interview")
          ? "Presenter"
          : "News") as TemplateCategory,
    hint: bt.description,
    build: () => bt.build(),
  })),
  {
    id: "news-presenter",
    name: "News presenter",
    category: "News",
    hint: "Add your presenter video: it goes on Video 1 — turn on AI Removal to put them in the studio.",
    build: () => {
      let d = start(HD, { kind: "set", id: "newsroom" });
      d = text(d, "lowerThird", "Your Name\nNews presenter", 1, 6);
      d = text(d, "breaking", "Top story: write your headline here", 7, 8);
      return d;
    },
  },
  {
    id: "breaking-news",
    name: "Breaking news",
    category: "News",
    hint: "Add a clip or a picture of the story on Video 1.",
    build: () => {
      let d = start(HD, { kind: "set", id: "city-night" });
      d = text(d, "title", "BREAKING NEWS", 0, 3, {
        style: { box: "#b91c1c", size: 120 },
        anim: { in: "rise", out: "fade" },
      });
      d = text(d, "breaking", "Write the headline here", 2.5, 8);
      return d;
    },
  },
  {
    id: "weather",
    name: "Weather report",
    category: "Presenter",
    hint: "Add your presenter on Video 1 (AI Removal) and a map picture behind them.",
    build: () => {
      let d = start(HD, { kind: "set", id: "sunset" });
      d = text(d, "title", "Weather today", 0, 3, {
        transform: { fit: "fit", x: 0, y: -0.3, scale: 1 },
      });
      d = text(d, "lowerThird", "Delhi · 32°C · Sunny\nWind 12 km/h", 2, 7, {
        style: { box: "#0369a1", accent: "#facc15" },
      });
      return d;
    },
  },
  {
    id: "explainer",
    name: "Explainer",
    category: "Educational",
    hint: "Record your screen or yourself (Record) and add it on Video 1.",
    build: () => {
      let d = start(HD, { kind: "set", id: "soft" });
      d = text(d, "title", "How it works", 0, 3, {
        style: { color: "#1e1b4b", shadow: false },
      });
      d = text(d, "caption", "Step 1: write your first point here", 3, 4);
      d = text(d, "caption", "Step 2: and the next one here", 7, 4);
      return d;
    },
  },
  {
    id: "product-demo",
    name: "Product demo",
    category: "Ads",
    hint: "Add a video or pictures of your product on Video 1.",
    build: () => {
      let d = start(HD, { kind: "set", id: "tech-grid" });
      d = text(d, "title", "Introducing Product X", 0, 3.5, {
        style: { color: "#67e8f9" },
        anim: { in: "rise", out: "fade" },
      });
      d = text(d, "lowerThird", "Feature one\nWhy people love it", 4, 5, {
        style: { box: "#0e7490", accent: "#67e8f9" },
      });
      return d;
    },
  },
  {
    id: "youtube-intro",
    name: "YouTube intro",
    category: "YouTube",
    hint: "Add your intro clip or channel logo.",
    build: () => {
      let d = start(HD, {
        kind: "gradient",
        from: "#3b0764",
        to: "#db2777",
        angle: 135,
      });
      d = text(d, "title", "Welcome to my channel", 0, 4, {
        anim: { in: "rise", out: "fade" },
      });
      d = text(d, "plain", "Like · Subscribe · Share", 2, 3, {
        transform: { fit: "fit", x: 0, y: 0.25, scale: 0.8 },
        anim: { in: "fade", out: "fade" },
      });
      return d;
    },
  },
  {
    id: "shorts",
    name: "Shorts / Reels",
    category: "Shorts & Reels",
    hint: "A tall 9:16 video. Record yourself or add a clip.",
    build: () => {
      let d = start(TALL, {
        kind: "gradient",
        from: "#0f172a",
        to: "#1d4ed8",
        angle: 160,
      });
      d = text(d, "title", "Watch till the end!", 0, 3, {
        transform: { fit: "fit", x: 0, y: -0.3, scale: 1 },
        anim: { in: "rise", out: "fade" },
      });
      d = text(d, "caption", "Write your caption here", 3, 5, {
        style: { size: 64 },
      });
      return d;
    },
  },
  {
    id: "instagram-post",
    name: "Instagram post",
    category: "Social Media",
    hint: "A square video for the feed.",
    build: () => {
      let d = start(SQUARE, {
        kind: "gradient",
        from: "#7c2d12",
        to: "#f59e0b",
        angle: 135,
      });
      d = text(d, "title", "Big announcement", 0, 5, {
        anim: { in: "rise", out: "fade" },
      });
      return d;
    },
  },
  {
    id: "festival",
    name: "Festival greeting",
    category: "Festival",
    hint: "Add a family picture or your logo.",
    build: () => {
      let d = start(HD, { kind: "set", id: "sunset" });
      d = text(d, "title", "Happy Diwali!", 0, 5, {
        style: { color: "#fde68a", size: 140 },
        anim: { in: "rise", out: "fade" },
      });
      d = text(d, "plain", "With love, from all of us", 2, 3, {
        transform: { fit: "fit", x: 0, y: 0.25, scale: 0.8 },
        style: { color: "#fff7ed" },
      });
      return d;
    },
  },
  // ---------- News ----------
  {
    id: "live-broadcast",
    name: "Live broadcast",
    category: "News",
    hint: "Add your reporter on Video 1 (AI Removal puts them in the newsroom). Change the ticker's words in its settings.",
    build: () => {
      let d = start(HD, { kind: "set", id: "newsroom" });
      d = element(d, "live", 0, { duration: 15 });
      d = text(d, "lowerThird", "Reporter Name\nLive from the city", 1, 6);
      d = element(d, "ticker", 0, {
        duration: 15,
        look: {
          text: "Top story here · Markets are up · Weather: sunny and warm",
        },
      });
      return d;
    },
  },
  {
    id: "headline-card",
    name: "Headline card",
    category: "News",
    hint: "A dark title card, then your story: add the clip after the card on Video 1.",
    build: () => {
      let d = start(HD, { kind: "set", id: "city-night" });
      d = blank(d, "#0b1220", 4);
      d = element(d, "breaking", 0.3, { duration: 3.5 });
      d = styled(d, "bigTitle", "YOUR HEADLINE", 0.5, 3.5);
      d = text(d, "breaking", "Write the story in one line here", 4, 6);
      return d;
    },
  },
  {
    id: "interview",
    name: "Interview",
    category: "News",
    hint: "Add the interview on Video 1. Each name shows when that person speaks: drag them on the timeline.",
    build: () => {
      let d = start(HD, { kind: "set", id: "studio-grey" });
      d = element(d, "exclusive", 0, { duration: 4 });
      d = text(d, "lowerThird", "Guest Name\nWhat they do", 1, 5);
      d = text(d, "lowerThird", "Host Name\nYour show", 7, 5, {
        style: { box: "#0f766e", accent: "#fde047" },
      });
      return d;
    },
  },
  // ---------- YouTube ----------
  {
    id: "countdown-intro",
    name: "Countdown intro",
    category: "YouTube",
    hint: "3, 2, 1 on colored scenes, then your title. Add your video after them on Video 1.",
    build: () => {
      let d = start(HD, {
        kind: "gradient",
        from: "#1e1b4b",
        to: "#7c3aed",
        angle: 135,
      });
      d = blank(d, "#111827", 1);
      d = blank(d, "#1e3a8a", 1);
      d = blank(d, "#7c3aed", 1);
      d = styled(d, "bigTitle", "3", 0, 1, {
        anim: { in: "pop", out: "none" },
      });
      d = styled(d, "bigTitle", "2", 1, 1, {
        anim: { in: "pop", out: "none" },
      });
      d = styled(d, "bigTitle", "1", 2, 1, {
        anim: { in: "pop", out: "none" },
      });
      d = text(d, "title", "Let's begin!", 3, 3, {
        anim: { in: "rise", out: "fade" },
      });
      return d;
    },
  },
  {
    id: "end-screen",
    name: "End screen",
    category: "YouTube",
    hint: "The last seconds of your video: thanks, a Subscribe button and a bell.",
    build: () => {
      let d = start(HD, {
        kind: "gradient",
        from: "#0f172a",
        to: "#b91c1c",
        angle: 135,
      });
      d = text(d, "title", "Thanks for watching!", 0, 8, {
        transform: { fit: "fit", x: 0, y: -0.25, scale: 1 },
        anim: { in: "rise", out: "fade" },
      });
      d = styled(d, "subscribe", "SUBSCRIBE", 1, 7);
      d = element(d, "bell", 1.5, { duration: 6.5, x: 0.2, y: 0.12 });
      d = styled(d, "handle", "@yourchannel", 1, 7);
      return d;
    },
  },
  {
    id: "top-five",
    name: "Top 5 list",
    category: "YouTube",
    hint: "Add a clip for each number on Video 1, then change the words.",
    build: () => {
      let d = start(HD, { kind: "set", id: "tech-grid" });
      d = styled(d, "chapter", "TOP 5", 0, 3);
      [
        "#5 · Write it here",
        "#4 · Write it here",
        "#3 · Write it here",
        "#2 · Write it here",
        "#1 · The best one",
      ].forEach((w, i) => {
        d = text(d, "lowerThird", `${w}\nOne line about it`, 3 + i * 4, 4, {
          style: { box: i === 4 ? "#b45309" : "#1d4ed8", accent: "#facc15" },
        });
      });
      d = element(d, "crown", 19, { duration: 4, x: 0.3, y: -0.2 });
      return d;
    },
  },
  {
    id: "vlog-title",
    name: "Vlog title",
    category: "YouTube",
    hint: "Add your vlog clip on Video 1: the title sits over its first seconds.",
    build: () => {
      let d = start(HD, { kind: "set", id: "sunset" });
      d = styled(d, "outlineTitle", "A day in my life", 0, 4);
      d = element(d, "pin", 0.5, { duration: 3.5, x: -0.3, y: 0.22 });
      d = text(d, "plain", "New Delhi", 0.5, 3.5, {
        transform: { fit: "fit", x: -0.18, y: 0.22, scale: 0.7 },
      });
      return d;
    },
  },
  // ---------- Social ----------
  {
    id: "quote-card",
    name: "Quote card",
    category: "Social Media",
    hint: "A square quote for the feed: change the words and who said it.",
    build: () => {
      let d = start(SQUARE, {
        kind: "gradient",
        from: "#1f2937",
        to: "#0f766e",
        angle: 145,
      });
      d = styled(
        d,
        "quote",
        "“Write a quote here\nthat people will share.”\n— Your Name",
        0,
        8,
      );
      return d;
    },
  },
  {
    id: "story-announcement",
    name: "Story announcement",
    category: "Social Media",
    hint: "A tall 9:16 story: add a photo or clip on Video 1.",
    build: () => {
      let d = start(TALL, {
        kind: "gradient",
        from: "#831843",
        to: "#f97316",
        angle: 170,
      });
      d = element(d, "new", 0.3, { duration: 5.7, y: -0.28 });
      d = styled(d, "bigTitle", "BIG NEWS", 0.5, 5.5);
      d = text(d, "caption", "Swipe up to see more", 2, 4, {
        style: { size: 64 },
      });
      return d;
    },
  },
  {
    id: "sale-offer",
    name: "Sale offer",
    category: "Social Media",
    hint: "A square sale post: add your product picture on Video 1.",
    build: () => {
      let d = start(SQUARE, {
        kind: "gradient",
        from: "#7f1d1d",
        to: "#f59e0b",
        angle: 135,
      });
      d = element(d, "sale", 0, { duration: 6, y: -0.3 });
      d = styled(d, "bigTitle", "50% OFF", 0.4, 5.6);
      d = styled(d, "callout", "This weekend only", 1, 5, {
        transform: { fit: "fit", x: 0, y: 0.3, scale: 1 },
      });
      return d;
    },
  },
  {
    id: "podcast-clip",
    name: "Podcast clip",
    category: "Social Media",
    hint: "A tall podcast clip: add the video, then Subtitles makes the captions.",
    build: () => {
      let d = start(TALL, { kind: "set", id: "studio-grey" });
      d = text(d, "title", "The Podcast Name", 0, 10, {
        transform: { fit: "fit", x: 0, y: -0.38, scale: 0.8 },
      });
      d = element(d, "rec", 0, { duration: 10 });
      d = text(d, "caption", "Your best line goes here", 1, 6, {
        style: { size: 64 },
      });
      return d;
    },
  },
  // ---------- Business ----------
  {
    id: "company-update",
    name: "Company update",
    category: "Business",
    hint: "Record yourself (Record) or add a video on Video 1, then write the points.",
    build: () => {
      let d = start(HD, { kind: "set", id: "office" });
      d = styled(d, "chapter", "COMPANY UPDATE", 0, 3);
      d = text(d, "lowerThird", "Your Name\nChief Executive", 3, 5, {
        style: { box: "#1e3a8a", accent: "#38bdf8" },
      });
      d = text(d, "caption", "1 · What we did this month", 8, 4);
      d = text(d, "caption", "2 · What comes next", 12, 4);
      return d;
    },
  },
  {
    id: "product-launch",
    name: "Product launch",
    category: "Business",
    hint: "Add your product video on Video 1: a dark title card comes first.",
    build: () => {
      let d = start(HD, { kind: "set", id: "tech-grid" });
      d = blank(d, "#020617", 3);
      d = styled(d, "neon", "INTRODUCING", 0.3, 2.7);
      d = text(d, "title", "Product X", 3, 4, {
        style: { color: "#67e8f9" },
        anim: { in: "rise", out: "fade" },
      });
      d = element(d, "ribbon", 3.5, {
        duration: 3.5,
        y: 0.25,
        look: { text: "Available now" },
      });
      return d;
    },
  },
  {
    id: "event-invite",
    name: "Event invite",
    category: "Business",
    hint: "A square invite: change the date and place.",
    build: () => {
      let d = start(SQUARE, {
        kind: "gradient",
        from: "#0c4a6e",
        to: "#6d28d9",
        angle: 135,
      });
      d = styled(d, "chapter", "YOU'RE INVITED", 0, 7, {
        transform: { fit: "fit", x: 0, y: -0.25, scale: 1 },
      });
      d = text(d, "title", "Annual Meetup 2026", 0.5, 6.5);
      d = styled(d, "callout", "12 Oct · 6 pm · Your venue", 1.5, 5.5, {
        transform: { fit: "fit", x: 0, y: 0.25, scale: 1 },
      });
      return d;
    },
  },
  {
    id: "hiring",
    name: "We're hiring",
    category: "Business",
    hint: "A tall hiring post: list the roles and where to apply.",
    build: () => {
      let d = start(TALL, {
        kind: "gradient",
        from: "#064e3b",
        to: "#0ea5e9",
        angle: 160,
      });
      d = styled(d, "bigTitle", "WE'RE HIRING", 0, 8, {
        transform: { fit: "fit", x: 0, y: -0.25, scale: 1 },
      });
      d = text(d, "caption", "Designer · Developer · Sales", 1, 7, {
        style: { size: 64 },
      });
      d = element(d, "check", 1.5, { duration: 6.5, y: 0.1 });
      d = styled(d, "handle", "yourcompany.com/jobs", 2, 6);
      return d;
    },
  },
  // ---------- Gaming ----------
  {
    id: "gaming-streamer",
    name: "Gaming streamer layout",
    category: "Gaming",
    hint: "Full 16:9 gameplay stream layout with facecam box, live alert, and handle overlay.",
    build: () => {
      let d = start(HD, {
        kind: "gradient",
        from: "#0f0c20",
        to: "#2e1065",
        angle: 135,
      });
      d = element(d, "live", 0, { duration: 30, x: -0.4, y: -0.4 });
      d = styled(d, "neon", "GAMEPLAY LIVE", 0, 30, {
        transform: { fit: "fit", x: 0, y: -0.42, scale: 0.8 },
      });
      d = styled(d, "handle", "@yourstreamer", 1, 30, {
        transform: { fit: "fit", x: 0.35, y: 0.42, scale: 0.9 },
      });
      d = element(d, "rec", 0, { duration: 30, x: 0.4, y: -0.4 });
      return d;
    },
  },
  // ---------- Weather ----------
  {
    id: "weather-radar",
    name: "Weather radar forecast",
    category: "Weather",
    hint: "Live Doppler weather radar map with 5-day temperature outlook and storm tracker.",
    build: () => {
      let d = start(HD, { kind: "set", id: "sunset" });
      d = element(d, "breaking", 0, {
        duration: 20,
        look: { text: "RADAR DOPPLER LIVE" },
      });
      d = text(
        d,
        "lowerThird",
        "Storm Tracker · High 28°C / Low 19°C\nScattered Thunderstorms & High Wind Alert",
        1,
        15,
        { style: { box: "#0284c7", accent: "#38bdf8" } },
      );
      d = element(d, "ticker", 0, {
        duration: 20,
        look: {
          text: "LIVE RADAR: Severe weather warning across regional zones · Heavy precipitation expected · Wind speeds 45 km/h",
        },
      });
      return d;
    },
  },
];

export const TEMPLATE_CATEGORIES: ("All" | TemplateCategory)[] = [
  "All",
  ...[...new Set(TEMPLATES.map((t) => t.category))],
];

export type CustomTemplate = {
  id: string;
  name: string;
  category: "Custom";
  hint: string;
  createdAt: number;
  doc: TimelineDoc;
};

const CUSTOM_TEMPLATES_KEY = "VDO:custom-templates";
const memStore = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memStore.get(key) ?? null;
  },
  setItem: (key: string, val: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch {}
    memStore.set(key, val);
  },
};

export function getCustomTemplates(): CustomTemplate[] {
  try {
    const raw = safeStorage.getItem(CUSTOM_TEMPLATES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomTemplate(
  name: string,
  doc: TimelineDoc,
): CustomTemplate {
  const item: CustomTemplate = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "My Template",
    category: "Custom",
    hint: "Custom template saved from project",
    createdAt: Date.now(),
    doc: JSON.parse(JSON.stringify(doc)),
  };
  const list = getCustomTemplates();
  list.unshift(item);
  try {
    safeStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(list));
  } catch {}
  return item;
}

export function deleteCustomTemplate(id: string): void {
  const list = getCustomTemplates().filter((t) => t.id !== id);
  try {
    safeStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(list));
  } catch {}
}
