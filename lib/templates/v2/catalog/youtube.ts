import type { TemplateSpec } from "../spec";

/** YouTube: a channel intro, an end screen, a vlog opener, a tutorial chapter. */
export const YOUTUBE: TemplateSpec[] = [
  {
    id: "yt-channel-intro",
    name: "Channel intro",
    category: "YouTube",
    tags: ["intro", "channel", "logo", "youtube"],
    summary: "1 video, your channel name",
    music: { id: "upbeat-pop" },
    scenes: [
      {
        length: 2.5,
        fill: { kind: "gradient", from: "#1e1b4b", to: "#7c3aed", angle: 135 },
        layers: [
          { kind: "text", style: "bigTitle", words: "YOUR CHANNEL", at: { x: "center", y: "center" }, anim: { in: "zoom", out: "fade" } },
          { kind: "text", style: "chapter", words: "NEW VIDEOS EVERY WEEK", at: { x: "center", y: "center", dy: 0.16 }, from: 0.6, anim: { in: "rise", out: "fade" } },
        ],
      },
      {
        length: 3.5,
        transitionIn: { type: "zoomIn", duration: 0.5 },
        fill: { kind: "gradient", from: "#0f172a", to: "#312e81", angle: 160 },
        layers: [
          { kind: "media", role: "Your best moment", accepts: "both", keywords: ["creator", "studio"], at: { x: "center", y: "center" } },
          { kind: "text", style: "handle", words: "@yourchannel", at: { x: "left", y: "bottom" }, from: 0.4, anim: { in: "slide", out: "fade" }, over: { "9:16": { at: { x: "center", y: "bottom" } } } },
          { kind: "text", style: "subscribe", words: "SUBSCRIBE", at: { x: "right", y: "bottom" }, from: 1, anim: { in: "pop", out: "fade" }, over: { "9:16": { at: { x: "center", y: "bottom", dy: -0.12 } } } },
        ],
      },
    ],
  },
];
