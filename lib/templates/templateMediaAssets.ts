/**
 * Catalog of ready-to-use Broadcast Video Loops and Audio Themes
 * for Templates preview, customization, and timeline integration.
 */

export interface TemplateVideoClip {
  id: string;
  title: string;
  category: string;
  url: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  thumbGradient: string;
  thumbUrl?: string;
  isCustom?: boolean;
  assetId?: string;
  videoMeta?: any;
}

export interface TemplateAudioTrack {
  id: string;
  title: string;
  category: string;
  mood: string;
  url: string;
  fileName: string;
  duration: number;
  isCustom?: boolean;
  assetId?: string;
  audioMeta?: any;
}

export const TEMPLATE_VIDEO_CLIPS: TemplateVideoClip[] = [
  {
    id: "newsroom-modern",
    title: "Modern Studio LED",
    category: "Newsroom",
    url: "/templates/media/newsroom-modern.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-blue-900 to-indigo-950",
    thumbUrl: "/templates/thumbs/newsroom-modern.jpg",
  },
  {
    id: "breaking-red",
    title: "Breaking Alert Red",
    category: "Breaking",
    url: "/templates/media/breaking-red.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-red-900 to-rose-950",
    thumbUrl: "/templates/thumbs/breaking-red.jpg",
  },
  {
    id: "globe-3d",
    title: "3D World Globe",
    category: "World News",
    url: "/templates/media/globe-3d.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-sky-950 to-blue-900",
    thumbUrl: "/templates/thumbs/globe-3d.jpg",
  },
  {
    id: "radar-weather",
    title: "Doppler Weather Radar",
    category: "Weather",
    url: "/templates/media/radar-weather.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-emerald-950 to-teal-900",
    thumbUrl: "/templates/thumbs/radar-weather.jpg",
  },
  {
    id: "finance-ticker",
    title: "Wall Street Ticker",
    category: "Finance",
    url: "/templates/media/finance-ticker.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-green-950 to-emerald-900",
    thumbUrl: "/templates/thumbs/finance-ticker.jpg",
  },
  {
    id: "sports-arena",
    title: "Sports Arena Stadium",
    category: "Sports",
    url: "/templates/media/sports-arena.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-amber-950 to-orange-900",
    thumbUrl: "/templates/thumbs/sports-arena.jpg",
  },
  {
    id: "podcast-studio",
    title: "Neon Acoustic Lounge",
    category: "Podcast",
    url: "/templates/media/podcast-studio.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-purple-950 to-fuchsia-900",
    thumbUrl: "/templates/thumbs/podcast-studio.jpg",
  },
  {
    id: "tech-grid",
    title: "Silicon Cyber Matrix",
    category: "Technology",
    url: "/templates/media/tech-grid.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-cyan-950 to-blue-900",
    thumbUrl: "/templates/thumbs/tech-grid.jpg",
  },
  {
    id: "crime-cctv",
    title: "CCTV Surveillance",
    category: "Investigation",
    url: "/templates/media/crime-cctv.mp4",
    aspectRatio: "16:9",
    thumbGradient: "from-stone-900 to-red-950",
    thumbUrl: "/templates/thumbs/crime-cctv.jpg",
  },
  {
    id: "vertical-reels",
    title: "Vertical 9:16 Flash",
    category: "Mobile",
    url: "/templates/media/vertical-reels.mp4",
    aspectRatio: "9:16",
    thumbGradient: "from-violet-950 to-purple-900",
    thumbUrl: "/templates/thumbs/vertical-reels.jpg",
  },
  {
    id: "vertical-breaking",
    title: "Vertical Emergency",
    category: "Mobile",
    url: "/templates/media/vertical-breaking.mp4",
    aspectRatio: "9:16",
    thumbGradient: "from-red-950 to-orange-950",
    thumbUrl: "/templates/thumbs/vertical-breaking.jpg",
  },
  {
    id: "square-social",
    title: "Square Social Feed",
    category: "Social",
    url: "/templates/media/square-social.mp4",
    aspectRatio: "1:1",
    thumbGradient: "from-sky-950 to-indigo-900",
    thumbUrl: "/templates/thumbs/square-social.jpg",
  },
];

export const TEMPLATE_AUDIO_TRACKS: TemplateAudioTrack[] = [
  {
    id: "theme-newsroom",
    title: "Broadcast Newsroom Fanfare",
    category: "Broadcast News",
    mood: "News",
    url: "/templates/audio/theme-newsroom.mp3",
    fileName: "theme-newsroom.mp3",
    duration: 20,
  },
  {
    id: "theme-breaking",
    title: "Urgent Breaking News Alarm",
    category: "Breaking News",
    mood: "Dramatic",
    url: "/templates/audio/theme-breaking.mp3",
    fileName: "theme-breaking.mp3",
    duration: 20,
  },
  {
    id: "theme-finance",
    title: "Wall Street Market Pulse",
    category: "Financial Markets",
    mood: "Upbeat",
    url: "/templates/audio/theme-finance.mp3",
    fileName: "theme-finance.mp3",
    duration: 20,
  },
  {
    id: "theme-globe",
    title: "World Affairs Orchestral",
    category: "International",
    mood: "Epic",
    url: "/templates/audio/theme-globe.mp3",
    fileName: "theme-globe.mp3",
    duration: 20,
  },
  {
    id: "theme-podcast",
    title: "Lo-Fi Acoustic Podcast Groove",
    category: "Podcast",
    mood: "Chill",
    url: "/templates/audio/theme-podcast.mp3",
    fileName: "theme-podcast.mp3",
    duration: 20,
  },
  {
    id: "theme-sports",
    title: "Sports Stadium Championship",
    category: "Sports",
    mood: "Energetic",
    url: "/templates/audio/theme-sports.mp3",
    fileName: "theme-sports.mp3",
    duration: 20,
  },
  {
    id: "theme-weather",
    title: "Doppler Radar Sonar Sweep",
    category: "Weather",
    mood: "Atmospheric",
    url: "/templates/audio/theme-weather.mp3",
    fileName: "theme-weather.mp3",
    duration: 20,
  },
  {
    id: "theme-crime",
    title: "Classified Noir Investigation",
    category: "Investigation",
    mood: "Suspense",
    url: "/templates/audio/theme-crime.mp3",
    fileName: "theme-crime.mp3",
    duration: 20,
  },
];
