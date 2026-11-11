import type { TemplateSpec } from "../spec";
import { at, C, el, frame, grad, set, slot, tall, text } from "./kit";

const Z = { type: "zoomIn" as const, duration: 0.5 };
const fade = { type: "crossfade" as const, duration: 0.6 };
const L = { type: "slideLeft" as const, duration: 0.4 };

/** Intros and outros. */
export const INTROS: TemplateSpec[] = [
  {
    id: "io-logo-reveal",
    name: "Logo reveal",
    category: "Intros & Outros",
    tags: ["logo", "reveal", "brand", "intro"],
    summary: "Your logo, a name",
    music: { id: "cinematic-rise" },
    scenes: [
      { length: 1.5, fill: grad("#000000", "#111827", 180), layers: [el("sparkle", C)] },
      { length: 3.5, transitionIn: { type: "circleOpen", duration: 0.6 }, fill: grad("#0b1120", "#1d4ed8"), layers: [frame("Your logo", "image", at("center", "center", 0, -0.12), { preset: "circle" }), text("bigTitle", "BRAND NAME", at("center", "center", 0, 0.2), { size: 120, from: 0.4, anim: ["zoom", "fade"] })] },
    ],
  },
  {
    id: "io-glitch-intro",
    name: "Glitch intro",
    category: "Intros & Outros",
    tags: ["glitch", "tech", "intro"],
    summary: "1 video, a title",
    music: { id: "game-drive" },
    scenes: [
      { length: 2, fill: set("tech-grid"), layers: [text("neon", "LOADING…", C, { anim: ["blur", "blur"] })] },
      { length: 3, transitionIn: { type: "spin", duration: 0.4 }, fill: grad("#020617", "#7e22ce"), layers: [slot("Your clip", "video", ["neon", "city night"]), text("outlineTitle", "YOUR TITLE", C, { from: 0.3, anim: ["zoom", "fade"] })] },
    ],
  },
  {
    id: "io-minimal-outro",
    name: "Minimal outro",
    category: "Intros & Outros",
    tags: ["outro", "credits", "minimal", "end"],
    summary: "Your name, a link",
    music: { id: "calm-pad" },
    scenes: [
      { length: 5, fill: grad("#f8fafc", "#e2e8f0", 180), base: "#ffffff", layers: [text("credits", "Thanks for watching\nMade by Your Name", C, { color: "#0f172a", anim: ["rise", "fade"] }), text("handle", "yourwebsite.com", at("center", "bottom"), { from: 1, anim: ["fade", "fade"] })] },
    ],
  },
];

/** Shorts, Reels and TikTok. */
export const SHORTS: TemplateSpec[] = [
  {
    id: "sr-hook-caption",
    name: "Hook + caption",
    category: "Shorts / Reels",
    tags: ["hook", "tiktok", "reels", "shorts", "caption"],
    summary: "1 video, a hook line",
    music: { id: "upbeat-pulse" },
    scenes: [{ length: 6, fill: grad("#18181b", "#3f3f46", 180), layers: [slot("Your video", "video", ["talking", "phone"]), text("callout", "WAIT FOR IT…", at("center", "top"), { anim: ["pop", "fade"], length: 2.5 }), text("caption", "Say what this video is about", at("center", "bottom"), { from: 0.5, anim: ["fade", "fade"] })] }],
  },
  {
    id: "sr-top-3",
    name: "Top 3 list",
    category: "Shorts / Reels",
    tags: ["list", "top 3", "ranking", "reels"],
    summary: "3 videos or photos, 3 names",
    music: { id: "game-drive", volume: 0.8 },
    scenes: [1, 2, 3].map((n, i) => ({
      length: 2.5,
      ...(i ? { transitionIn: L } : {}),
      fill: grad(["#7c3aed", "#db2777", "#f59e0b"][i], "#0f172a", 160),
      layers: [slot(`Number ${4 - n}`, "both" as const), text("bigTitle", `#${4 - n}`, at("left", "top"), { size: 150, anim: ["pop", "fade"] as ["pop", "fade"] }), text("caption", `Name number ${4 - n}`, at("center", "bottom"), { from: 0.3, anim: ["rise", "fade"] as ["rise", "fade"] })],
    })),
  },
  {
    id: "sr-before-after",
    name: "Before / after",
    category: "Shorts / Reels",
    tags: ["before after", "transformation", "glow up"],
    summary: "2 videos or photos",
    music: { id: "party-beat" },
    scenes: [
      { length: 3, fill: grad("#334155", "#0f172a"), layers: [slot("Before", "both"), text("callout", "BEFORE", at("center", "top"), { anim: ["pop", "fade"] })] },
      { length: 3.5, transitionIn: { type: "wipeRight", duration: 0.5 }, fill: grad("#16a34a", "#0f172a"), layers: [slot("After", "both"), text("callout", "AFTER ✨", at("center", "top"), { anim: ["pop", "fade"] })] },
    ],
  },
];

SHORTS.push({
  id: "sr-comment-reply",
  name: "Reply to a comment",
  category: "Shorts / Reels",
  tags: ["comment", "reply", "question", "tiktok"],
  summary: "1 video of your answer, the comment",
  music: { id: "lofi-loop", volume: 0.5 },
  scenes: [{ length: 7, fill: grad("#0f172a", "#1e293b"), layers: [slot("Your answer", "video", ["talking"]), el("speech", at("center", "top")), text("callout", "“How did you start?”", at("center", "top", 0, 0.1), { anim: ["pop", "fade"] }), text("caption", "Here's how…", at("center", "bottom"), { from: 1 })] }],
});

/** Instagram and social posts. */
export const SOCIAL: TemplateSpec[] = [
  {
    id: "so-product-reel",
    name: "Product reel",
    category: "Social Media",
    tags: ["product", "instagram", "shop", "reel"],
    summary: "2 product photos, a price",
    music: { id: "upbeat-pulse" },
    scenes: [
      { length: 2.5, fill: grad("#fde68a", "#f472b6"), layers: [frame("Product photo", "image", C), text("title", "NEW DROP", at("center", "top"), { size: 100, anim: ["zoom", "fade"] })] },
      { length: 3, transitionIn: Z, fill: grad("#f472b6", "#8b5cf6"), layers: [slot("Product in use", "both", ["product", "lifestyle"]), text("callout", "₹999 only", at("right", "bottom"), { anim: ["pop", "fade"], over: tall(at("center", "bottom")) })] },
    ],
  },
  {
    id: "so-story-announce",
    name: "Story announcement",
    category: "Social Media",
    tags: ["story", "announcement", "news", "instagram"],
    summary: "1 photo, an announcement",
    music: { id: "happy-bells" },
    scenes: [{ length: 5, fill: grad("#0ea5e9", "#22d3ee", 200), layers: [slot("Your photo", "image", ["people", "smile"]), el("speech", at("center", "top"), { from: 0.3 }), text("title", "Big news!\nTap to see more", at("center", "bottom"), { size: 80, from: 0.6, anim: ["rise", "fade"] })] }],
  },
  {
    id: "so-carousel",
    name: "Carousel slides",
    category: "Social Media",
    tags: ["carousel", "slides", "tips", "post"],
    summary: "3 photos, 3 short lines",
    music: { id: "lofi-loop" },
    scenes: ["Tip one", "Tip two", "Tip three"].map((w, i) => ({
      length: 2.5,
      ...(i ? { transitionIn: { type: "pushLeft" as const, duration: 0.4 } } : {}),
      fill: grad(["#fef3c7", "#dcfce7", "#e0e7ff"][i], "#ffffff", 180),
      base: "#ffffff",
      layers: [frame(`Photo ${i + 1}`, "image", at("center", "center", 0, -0.08)), text("title", w, at("center", "bottom"), { size: 80, color: "#111827", anim: ["rise", "fade"] as ["rise", "fade"] })],
    })),
  },
];

/** Gaming. */
export const GAMING: TemplateSpec[] = [
  {
    id: "ga-starting-soon",
    name: "Stream starting soon",
    category: "Gaming",
    tags: ["stream", "twitch", "starting soon", "brb"],
    summary: "Your handle",
    music: { id: "game-drive" },
    scenes: [{ length: 10, fill: set("tech-grid"), layers: [text("neon", "STARTING SOON", C, { anim: ["zoom", "fade"] }), el("live-pulse", at("center", "top")), text("handle", "@yourstream", at("center", "bottom"), { from: 0.5, anim: ["slide", "fade"] })] }],
  },
  {
    id: "ga-highlight",
    name: "Highlight montage",
    category: "Gaming",
    tags: ["highlight", "montage", "clutch", "gaming"],
    summary: "3 gameplay clips",
    music: { id: "game-drive" },
    scenes: ["CLUTCH", "ACE", "GG"].map((w, i) => ({
      length: 2.5,
      ...(i ? { transitionIn: { type: "zoomOut" as const, duration: 0.3 } } : {}),
      fill: grad("#111827", ["#dc2626", "#7c3aed", "#059669"][i], 120),
      layers: [slot(`Clip ${i + 1}`, "video" as const, ["gaming"]), text("outlineTitle", w, at("center", "top"), { anim: ["pop", "fade"] as ["pop", "fade"] })],
    })),
  },
  {
    id: "ga-reaction",
    name: "Reaction frame",
    category: "Gaming",
    tags: ["reaction", "facecam", "gaming"],
    summary: "Gameplay and your face cam",
    music: { id: "upbeat-pulse", volume: 0.5 },
    scenes: [{ length: 8, fill: grad("#0f172a", "#1e1b4b"), layers: [slot("Gameplay", "video", ["gaming"]), frame("Face cam", "video", at("right", "bottom"), { preset: "frame", over: tall(at("center", "bottom")) }), el("live", at("left", "top"))] }],
  },
];

/** Business. */
export const BUSINESS: TemplateSpec[] = [
  {
    id: "bu-company-update",
    name: "Company update",
    category: "Business",
    tags: ["company", "update", "corporate", "team"],
    summary: "2 videos or photos, a headline",
    music: { id: "corporate-light" },
    scenes: [
      { length: 3, fill: set("office"), layers: [text("title", "Q3 company update", C, { size: 100, anim: ["rise", "fade"] }), text("chapter", "WHAT'S NEW", at("center", "center", 0, -0.14), { anim: ["fade", "fade"] })] },
      { length: 4, transitionIn: fade, fill: grad("#0f172a", "#334155"), layers: [slot("Team or product", "both", ["office", "team"]), text("lowerThird", "Your Name\nCEO, Company", at("left", "bottom"), { from: 0.5, over: tall(at("center", "bottom")) })] },
    ],
  },
  {
    id: "bu-testimonial",
    name: "Customer testimonial",
    category: "Business",
    tags: ["testimonial", "review", "customer", "quote"],
    summary: "1 video of your customer, their words",
    music: { id: "calm-pad", volume: 0.6 },
    scenes: [{ length: 8, fill: grad("#1e293b", "#0f172a"), layers: [slot("Customer video", "video", ["interview"]), text("quote", "“It changed how we work.”\n— Customer name", at("center", "bottom"), { from: 0.5, anim: ["fade", "fade"] })] }],
  },
  {
    id: "bu-hiring",
    name: "We're hiring",
    category: "Business",
    tags: ["hiring", "jobs", "careers", "recruit"],
    summary: "1 photo of your team, the role",
    music: { id: "upbeat-pulse" },
    scenes: [
      { length: 2.5, fill: grad("#2563eb", "#7c3aed"), layers: [text("bigTitle", "WE'RE HIRING", C, { anim: ["zoom", "fade"] })] },
      { length: 4, transitionIn: Z, fill: grad("#7c3aed", "#0f172a"), layers: [slot("Your team", "both", ["team", "office"]), text("callout", "Product designer", at("center", "top"), { anim: ["pop", "fade"] }), text("handle", "yourcompany.com/jobs", at("center", "bottom"), { from: 0.5, anim: ["fade", "fade"] })] },
    ],
  },
];

/** Sales and ads. */
export const SALES: TemplateSpec[] = [
  {
    id: "sa-sale",
    name: "Big sale",
    category: "Sales & Ads",
    tags: ["sale", "discount", "offer", "promo"],
    summary: "1 product photo, the offer",
    music: { id: "party-beat" },
    scenes: [
      { length: 2.5, fill: grad("#dc2626", "#f59e0b"), layers: [text("bigTitle", "50% OFF", C, { size: 200, anim: ["zoom", "fade"] }), el("sale", at("right", "top"))] },
      { length: 3, transitionIn: { type: "pushLeft", duration: 0.4 }, fill: grad("#f59e0b", "#dc2626"), layers: [frame("Product", "image", C), text("callout", "This weekend only", at("center", "bottom"), { anim: ["pop", "fade"] })] },
    ],
  },
  {
    id: "sa-launch",
    name: "Product launch",
    category: "Sales & Ads",
    tags: ["launch", "new", "product", "reveal"],
    summary: "1 product video, its name",
    music: { id: "cinematic-rise" },
    scenes: [
      { length: 2.5, fill: grad("#000000", "#1f2937", 180), layers: [text("chapter", "INTRODUCING", C, { anim: ["fade", "fade"] })] },
      { length: 4, transitionIn: { type: "dipBlack", duration: 0.6 }, fill: grad("#111827", "#4338ca"), layers: [slot("Product video", "both", ["product"]), text("bigTitle", "PRODUCT NAME", at("center", "bottom"), { size: 110, from: 0.4, anim: ["rise", "fade"] })] },
    ],
  },
  {
    id: "sa-app-promo",
    name: "App promo",
    category: "Sales & Ads",
    tags: ["app", "download", "mobile", "promo"],
    summary: "1 screen recording of your app",
    music: { id: "upbeat-pulse" },
    scenes: [{ length: 6, fill: grad("#06b6d4", "#3b82f6"), layers: [frame("App screen recording", "video", C, { preset: "rounded" }), text("title", "Get it free", at("center", "top"), { size: 90, anim: ["rise", "fade"] }), text("callout", "Download now", at("center", "bottom"), { from: 1, anim: ["pop", "fade"] })] }],
  },
];

/** Slideshows and memories. */
export const SLIDESHOWS: TemplateSpec[] = [
  {
    id: "sl-memories",
    name: "Photo memories",
    category: "Slideshows",
    tags: ["photos", "memories", "slideshow", "family"],
    summary: "4 photos, a title",
    music: { id: "calm-pad" },
    scenes: [0, 1, 2, 3].map((i) => ({
      length: 3,
      ...(i ? { transitionIn: fade } : {}),
      fill: grad("#fef3c7", "#fed7aa", 160),
      layers: [slot(`Photo ${i + 1}`, "image" as const, ["family"]), ...(i === 0 ? [text("title", "Our memories", at("center", "bottom"), { size: 90, anim: ["fade", "fade"] as ["fade", "fade"] })] : [])],
    })),
  },
  {
    id: "sl-travel",
    name: "Travel diary",
    category: "Slideshows",
    tags: ["travel", "trip", "holiday", "places"],
    summary: "3 videos or photos, place names",
    music: { id: "lofi-loop" },
    scenes: ["Goa", "Manali", "Jaipur"].map((p, i) => ({
      length: 3,
      ...(i ? { transitionIn: L } : {}),
      fill: grad("#0ea5e9", "#14b8a6"),
      layers: [slot(`Place ${i + 1}`, "both" as const, ["travel", p.toLowerCase()]), text("outlineTitle", p.toUpperCase(), at("left", "bottom"), { anim: ["slide", "fade"] as ["slide", "fade"], over: tall(at("center", "bottom")) })],
    })),
  },
  {
    id: "sl-property",
    name: "Property tour",
    category: "Slideshows",
    tags: ["real estate", "property", "home", "tour"],
    summary: "3 room photos, the price",
    music: { id: "corporate-light" },
    scenes: ["Living room", "Kitchen", "Bedroom"].map((r, i) => ({
      length: 3,
      ...(i ? { transitionIn: fade } : {}),
      fill: grad("#e5e7eb", "#9ca3af"),
      layers: [slot(r, "both" as const, ["interior", r.toLowerCase()]), text("lowerThird", `${r}\n3 BHK · ₹85 lakh`, at("left", "bottom"), { over: tall(at("center", "bottom")) })],
    })),
  },
];

/** Celebrations. */
export const CELEBRATIONS: TemplateSpec[] = [
  {
    id: "ce-birthday",
    name: "Happy birthday",
    category: "Celebrations",
    tags: ["birthday", "wish", "party"],
    summary: "1 photo, a name",
    music: { id: "party-beat" },
    scenes: [{ length: 6, fill: grad("#f472b6", "#a855f7"), layers: [frame("Birthday photo", "image", at("center", "center", 0, -0.05), { preset: "circle" }), text("bigTitle", "HAPPY BIRTHDAY", at("center", "top"), { size: 120, anim: ["bounce", "fade"] }), text("title", "Name!", at("center", "bottom"), { size: 100, from: 0.6, anim: ["pop", "fade"] }), el("sparkle", at("left", "top"))] }],
  },
  {
    id: "ce-wedding",
    name: "Wedding invite",
    category: "Celebrations",
    tags: ["wedding", "invite", "shaadi", "marriage"],
    summary: "1 photo of the couple, names and date",
    music: { id: "calm-pad" },
    scenes: [
      { length: 3.5, fill: grad("#fff7ed", "#fde68a", 180), base: "#ffffff", layers: [text("title", "Riya & Arjun", C, { size: 110, color: "#92400e", anim: ["fade", "fade"] }), el("heart", at("center", "top"))] },
      { length: 4, transitionIn: fade, fill: grad("#fde68a", "#fb7185"), layers: [slot("Couple photo", "image", ["couple"]), text("caption", "12 December · Udaipur", at("center", "bottom"), { from: 0.5, anim: ["fade", "fade"] })] },
    ],
  },
  {
    id: "ce-diwali",
    name: "Diwali greetings",
    category: "Celebrations",
    tags: ["diwali", "festival", "deepavali", "greeting"],
    summary: "1 photo, your name",
    music: { id: "happy-bells" },
    scenes: [{ length: 6, fill: grad("#7c2d12", "#f59e0b", 160), layers: [slot("Family or shop photo", "image", ["diya", "lights"]), text("hindiTitle", "शुभ दीपावली", at("center", "top"), { anim: ["zoom", "fade"] }), text("handle", "from Your Name", at("center", "bottom"), { from: 0.8, anim: ["fade", "fade"] }), el("sparkle", at("right", "top"))] }],
  },
  {
    id: "ce-eid",
    name: "Eid Mubarak",
    category: "Celebrations",
    tags: ["eid", "festival", "greeting"],
    summary: "1 photo, your name",
    music: { id: "calm-pad" },
    scenes: [{ length: 6, fill: grad("#064e3b", "#10b981", 160), layers: [slot("Your photo", "image"), text("bigTitle", "EID MUBARAK", at("center", "top"), { size: 120, anim: ["rise", "fade"] }), text("handle", "from Your Name", at("center", "bottom"), { from: 0.8, anim: ["fade", "fade"] })] }],
  },
];

/** Education. */
export const EDUCATION: TemplateSpec[] = [
  {
    id: "ed-lesson-intro",
    name: "Lesson intro",
    category: "Educational",
    tags: ["lesson", "class", "teacher", "course"],
    summary: "1 video of you, the lesson name",
    music: { id: "corporate-light" },
    scenes: [
      { length: 2.5, fill: set("classroom"), layers: [text("chapter", "LESSON 4", at("center", "center", 0, -0.12)), text("title", "Fractions made easy", C, { size: 100, anim: ["rise", "fade"] })] },
      { length: 5, transitionIn: fade, fill: grad("#1e3a8a", "#0f172a"), layers: [slot("You, teaching", "video", ["teacher"]), text("lowerThird", "Your Name\nMaths teacher", at("left", "bottom"), { from: 0.5, over: tall(at("center", "bottom")) })] },
    ],
  },
  {
    id: "ed-quiz",
    name: "Quiz time",
    category: "Educational",
    tags: ["quiz", "question", "answer", "test"],
    summary: "A question and its answer",
    music: { id: "tension", volume: 0.7 },
    scenes: [
      { length: 4, fill: grad("#4c1d95", "#1e1b4b"), layers: [text("callout", "QUIZ", at("center", "top"), { anim: ["pop", "fade"] }), text("title", "What is 7 × 8?", C, { size: 110, anim: ["zoom", "fade"] }), el("question", at("right", "top"))] },
      { length: 3, transitionIn: { type: "circleOpen", duration: 0.5 }, fill: grad("#065f46", "#064e3b"), layers: [text("bigTitle", "56", C, { size: 220, anim: ["pop", "fade"] }), el("check", at("center", "top"))] },
    ],
  },
  {
    id: "ed-steps",
    name: "Step by step",
    category: "Educational",
    tags: ["steps", "how to", "guide", "recipe"],
    summary: "3 videos or photos, 3 steps",
    music: { id: "lofi-loop" },
    scenes: ["Step 1", "Step 2", "Step 3"].map((s, i) => ({
      length: 3,
      ...(i ? { transitionIn: L } : {}),
      fill: grad("#0f172a", "#334155"),
      layers: [slot(s, "both" as const), text("callout", s.toUpperCase(), at("left", "top"), { anim: ["pop", "fade"] as ["pop", "fade"], over: tall(at("center", "top")) }), text("caption", "Say what to do here", at("center", "bottom"), { from: 0.3 })],
    })),
  },
];

EDUCATION.push({
  id: "ed-recipe",
  name: "Quick recipe",
  category: "Educational",
  tags: ["recipe", "food", "cooking", "kitchen"],
  summary: "3 cooking clips, the dish name",
  music: { id: "happy-bells", volume: 0.6 },
  scenes: [
    { length: 2.5, fill: grad("#f97316", "#facc15"), layers: [slot("The finished dish", "both", ["food"]), text("bigTitle", "MASALA CHAI", at("center", "bottom"), { size: 120, anim: ["zoom", "fade"] })] },
    ...["Boil water and spices", "Add tea and milk", "Strain and serve"].map((w, i) => ({
      length: 3,
      transitionIn: { type: "slideLeft" as const, duration: 0.4 },
      fill: grad("#fef3c7", "#fdba74"),
      layers: [slot(`Step ${i + 1}`, "both" as const, ["cooking"]), text("caption", `${i + 1}. ${w}`, at("center", "bottom"), { anim: ["rise", "fade"] as ["rise", "fade"] })],
    })),
  ],
});

/** Podcasts, quotes and events. */
export const PODCAST: TemplateSpec[] = [
  {
    id: "po-audiogram",
    name: "Podcast audiogram",
    category: "Podcast",
    tags: ["podcast", "audiogram", "episode", "audio"],
    summary: "Your cover art, episode name",
    music: { id: "calm-pad", volume: 0.4 },
    scenes: [{ length: 10, fill: set("podcast-wave"), layers: [frame("Cover art", "image", at("center", "center", 0, -0.1), { preset: "rounded" }), text("title", "Episode 12: Starting up", at("center", "bottom"), { size: 72, anim: ["fade", "fade"] }), el("audio-wave", at("center", "bottom", 0, -0.12))] }],
  },
  {
    id: "po-episode-promo",
    name: "Episode promo",
    category: "Podcast",
    tags: ["podcast", "promo", "guest", "interview"],
    summary: "1 video of your guest, their name",
    music: { id: "news-bed", volume: 0.6 },
    scenes: [{ length: 7, fill: grad("#18181b", "#7c2d12"), layers: [slot("Guest clip", "video", ["interview", "microphone"]), text("lowerThird", "Guest Name\nFounder, Startup", at("left", "bottom"), { from: 0.4, over: tall(at("center", "bottom")) }), text("callout", "NEW EPISODE", at("left", "top"), { anim: ["pop", "fade"], over: tall(at("center", "top")) })] }],
  },
];

export const QUOTES: TemplateSpec[] = [
  {
    id: "qu-quote-card",
    name: "Quote card",
    category: "Quotes",
    tags: ["quote", "motivation", "words"],
    summary: "A quote and who said it",
    music: { id: "calm-pad" },
    scenes: [{ length: 6, fill: grad("#0f172a", "#334155"), layers: [text("quote", "“Start where you are.\nUse what you have.”\n— Arthur Ashe", C, { anim: ["fade", "fade"] })] }],
  },
  {
    id: "qu-motivation",
    name: "Motivation montage",
    category: "Quotes",
    tags: ["motivation", "gym", "hustle", "inspire"],
    summary: "2 videos, 2 lines",
    music: { id: "cinematic-rise" },
    scenes: ["DON'T STOP", "KEEP GOING"].map((w, i) => ({
      length: 3,
      ...(i ? { transitionIn: { type: "dipBlack" as const, duration: 0.5 } } : {}),
      fill: grad("#000000", "#3f3f46", 180),
      layers: [slot(`Clip ${i + 1}`, "video" as const, ["gym", "running"]), text("outlineTitle", w, C, { anim: ["zoom", "fade"] as ["zoom", "fade"] })],
    })),
  },
];

export const EVENTS: TemplateSpec[] = [
  {
    id: "ev-invite",
    name: "Event invite",
    category: "Events",
    tags: ["event", "invite", "meetup", "launch"],
    summary: "1 photo of the venue, date and place",
    music: { id: "upbeat-pulse" },
    scenes: [
      { length: 3, fill: grad("#1d4ed8", "#9333ea"), layers: [text("chapter", "YOU'RE INVITED", at("center", "center", 0, -0.12), { anim: ["fade", "fade"] }), text("title", "Design Meetup 2026", C, { size: 100, anim: ["rise", "fade"] })] },
      { length: 4, transitionIn: Z, fill: grad("#9333ea", "#0f172a"), layers: [slot("The venue", "both", ["venue", "hall"]), text("lowerThird", "Sat, 20 Dec · 6 PM\nBengaluru", at("left", "bottom"), { over: tall(at("center", "bottom")) })] },
    ],
  },
  {
    id: "ev-countdown",
    name: "Countdown",
    category: "Events",
    tags: ["countdown", "timer", "new year", "launch"],
    summary: "The event's name",
    music: { id: "tension" },
    scenes: [
      ...["3", "2", "1"].map((n, i) => ({ length: 1, ...(i ? { transitionIn: { type: "zoomIn" as const, duration: 0.2 } } : {}), fill: grad("#111827", "#1f2937"), layers: [text("bigTitle", n, C, { size: 300, anim: ["pop", "fade"] as ["pop", "fade"] })] })),
      { length: 3, transitionIn: { type: "dipWhite", duration: 0.4 }, fill: grad("#f59e0b", "#ef4444"), layers: [text("bigTitle", "WE'RE LIVE!", C, { size: 150, anim: ["zoom", "fade"] }), el("sparkle", at("right", "top"))] },
    ],
  },
];
