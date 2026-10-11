import type { TimelineDoc } from "../edit/doc";

export type TemplateCategory =
  | "All"
  | "News & Broadcast"
  | "Breaking News"
  | "News Presenter"
  | "Virtual Studio"
  | "Newsroom"
  | "Business News"
  | "World News"
  | "Technology News"
  | "Sports News"
  | "Weather News"
  | "Finance News"
  | "Entertainment News"
  | "Crime News"
  | "Politics / Current Affairs"
  | "Interview"
  | "Panel Discussion"
  | "Podcast"
  | "Social News"
  | "YouTube News"
  | "Shorts / Reels"
  // your own templates, and the starter templates' groups (lib/templates/hubTemplates)
  | "My Templates"
  | "YouTube"
  | "Social Media"
  | "Business"
  | "Educational"
  | "Festival"
  | "Gaming";

export const ALL_TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "All",
  "News & Broadcast",
  "Breaking News",
  "News Presenter",
  "Virtual Studio",
  "Newsroom",
  "Business News",
  "World News",
  "Technology News",
  "Sports News",
  "Weather News",
  "Finance News",
  "Entertainment News",
  "Crime News",
  "Politics / Current Affairs",
  "Interview",
  "Panel Discussion",
  "Podcast",
  "Social News",
  "YouTube News",
  "Shorts / Reels",
  // the starter templates' groups ("My Templates" is added first by the Hub when you have your own)
  "YouTube",
  "Social Media",
  "Business",
  "Educational",
  "Festival",
  "Gaming",
];

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type ResolutionBadge = "4K" | "HD";

export interface TemplateSlotDefinition {
  id: string;
  name: string;
  type: "background" | "presenter" | "screenGraphic" | "lowerThird" | "ticker" | "logo" | "audio";
  trackKind: "main" | "overlay" | "audio";
  defaultContent?: {
    text?: string;
    subText?: string;
    mediaUrl?: string;
    backdropSetId?: string;
    elementPresetId?: string;
    color?: string;
    accentColor?: string;
  };
}

export type MotionEngineKind =
  | "globe3d"
  | "newsroomMatrix"
  | "radarSweep"
  | "marketTicker"
  | "breakingPulse"
  | "podcastWave"
  | "sportsArena"
  | "techGrid"
  | "sunriseBriefing"
  | "vipGlamour"
  | "electionDesk"
  | "socialSquare"
  | "verticalReels"
  | "explainerDoc";

export interface BroadcastTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  aspectRatio: AspectRatio;
  resolution: ResolutionBadge;
  duration: number; // in seconds
  tags: string[];
  previewVideoUrl?: string;
  previewCanvasEngine?: MotionEngineKind;
  slots: TemplateSlotDefinition[];
  build: (customizations?: Record<string, any>) => TimelineDoc;
  /** Your own template (Create template): its video and sound, ready in My Assets. */
  custom?: {
    id: string;
    video: { assetId: string; name: string; duration: number; width?: number; height?: number };
    audio?: { assetId: string; name: string; duration: number };
    /** files deleted from My Assets since (the library says so and offers to replace them) */
    missing?: { video?: true; audio?: true };
  };
  /** A picture drawn behind the titles on the card and the preview (your template: its video's frame). */
  previewImageUrl?: string;
  /** Draw the project's own backdrop (studio set / gradient) on the card instead of the motion engine (starter templates). */
  previewBackdrop?: boolean;
}

