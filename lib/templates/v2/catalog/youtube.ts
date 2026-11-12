import type { TemplateSpec } from "../spec";
import { at, C, el, frame, grad, set, slot, tall, text } from "./kit";

/** YouTube: a channel intro, an end screen, a vlog opener, a tutorial chapter. */
export const YOUTUBE: TemplateSpec[] = [
  {
    id: "yt-channel-intro",
    name: "Channel intro",
    category: "YouTube",
    tags: ["intro", "channel", "logo", "youtube"],
    summary: "1 video or photo, your channel name",
    music: { id: "upbeat-pulse" },
    scenes: [
      {
        length: 2.5,
        fill: grad("#1e1b4b", "#7c3aed"),
        layers: [
          text("bigTitle", "YOUR CHANNEL", C, { anim: ["zoom", "fade"] }),
          text("chapter", "NEW VIDEOS EVERY WEEK", at("center", "center", 0, 0.16), { from: 0.6, anim: ["rise", "fade"], over: tall(at("center", "center", 0, 0.24)) }),
        ],
      },
      {
        length: 3.5,
        transitionIn: { type: "zoomIn", duration: 0.5 },
        fill: grad("#0f172a", "#312e81", 160),
        layers: [
          slot("Your best moment", "both", ["creator", "studio"]),
          text("handle", "@yourchannel", at("left", "bottom"), { from: 0.4, anim: ["slide", "fade"], over: tall(at("center", "bottom")) }),
          text("subscribe", "SUBSCRIBE", at("right", "bottom"), { from: 1, anim: ["pop", "fade"], over: tall(at("center", "bottom", 0, -0.12)) }),
        ],
      },
    ],
  },
  {
    id: "yt-end-screen",
    name: "Subscribe end screen",
    category: "YouTube",
    tags: ["outro", "end screen", "subscribe", "youtube"],
    summary: "2 videos to watch next, your name",
    music: { id: "happy-bells", volume: 0.8 },
    scenes: [
      {
        length: 8,
        fill: grad("#111827", "#be123c", 120),
        layers: [
          text("title", "Thanks for watching!", at("center", "top"), { size: 96, anim: ["rise", "fade"], over: tall(at("center", "top", 0, -0.08)) }),
          frame("Watch next (video 1)", "video", at("left", "center", 0, 0.05), { keywords: ["vlog"], over: tall(at("center", "center", 0, -0.2)) }),
          frame("Watch next (video 2)", "video", at("right", "center", 0, 0.05), { keywords: ["travel"], over: tall(at("center", "center", 0, 0.22)) }),
          text("subscribe", "SUBSCRIBE", at("center", "bottom"), { from: 0.8, anim: ["pop", "fade"] }),
          el("bell", at("center", "bottom", 0.18, 0), { from: 1.2, over: { "9:16": { hidden: true } } }),
        ],
      },
    ],
  },
  {
    id: "yt-vlog-opener",
    name: "Vlog opener",
    category: "YouTube",
    tags: ["vlog", "travel", "day in my life", "youtube"],
    summary: "3 videos or photos, a title",
    music: { id: "lofi-loop" },
    scenes: [
      { length: 2, fill: grad("#f97316", "#db2777"), layers: [slot("Shot 1", "both", ["city", "morning"]), text("outlineTitle", "A DAY IN MY LIFE", C, { anim: ["typewriter", "fade"] })] },
      { length: 2, transitionIn: { type: "slideLeft", duration: 0.4 }, fill: grad("#0ea5e9", "#6366f1"), layers: [slot("Shot 2", "both", ["coffee"]), text("callout", "episode 01", at("left", "top"), { anim: ["pop", "fade"] })] },
      { length: 2.5, transitionIn: { type: "slideLeft", duration: 0.4 }, fill: grad("#22c55e", "#0f766e"), layers: [slot("Shot 3", "both", ["street", "walk"]), text("handle", "@yourvlog", at("right", "bottom"), { from: 0.3, anim: ["slide", "fade"], over: tall(at("center", "bottom")) })] },
    ],
  },
  {
    id: "yt-tutorial-chapter",
    name: "Tutorial chapter",
    category: "YouTube",
    tags: ["tutorial", "how to", "chapter", "lesson", "youtube"],
    summary: "1 screen recording, a chapter title",
    music: { id: "corporate-light", volume: 0.7 },
    scenes: [
      {
        length: 2.5,
        fill: set("tech-grid"),
        layers: [
          text("chapter", "STEP 1", at("center", "center", 0, -0.1), { anim: ["fade", "fade"] }),
          text("title", "Set up your project", at("center", "center", 0, 0.06), { size: 90, anim: ["rise", "fade"] }),
        ],
      },
      {
        length: 6,
        transitionIn: { type: "wipeLeft", duration: 0.5 },
        fill: grad("#0f172a", "#1e293b", 180),
        layers: [
          slot("Your screen recording", "video", ["laptop", "screen"]),
          text("lowerThird", "Step 1\nSet up your project", at("left", "bottom"), { from: 0.3, length: 4, over: tall(at("center", "bottom")) }),
        ],
      },
    ],
  },
];
