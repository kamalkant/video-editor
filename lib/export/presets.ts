/** The see-through website packs in the Export ▾ menu (the dialog lists every format: EXPORT_FORMATS). */
export const EXPORT_PRESETS = [
  { id: "web", label: "Website pack (VP9 + HEVC alpha)", detail: "WebM for Chrome, Edge, Firefox, Android + MOV for Safari, iPhone, iPad + poster", master: false },
  { id: "web-master", label: "Website pack + ProRes master", detail: "Also a large ProRes 4444 file, for video editing", master: true },
] as const;

export type ExportPresetId = (typeof EXPORT_PRESETS)[number]["id"];

/**
 * Video (MP4) sizes for social media. The file is made at that size; the
 * project itself stays as it is (clips are fitted, with bars if the shape differs).
 */
export const VIDEO_PRESETS = [
  { id: "youtube", label: "YouTube 16:9", detail: "1920 × 1080 MP4 · YouTube, websites, TV", width: 1920, height: 1080 },
  { id: "shorts", label: "Shorts / Reels / TikTok 9:16", detail: "1080 × 1920 MP4 · phone, full screen", width: 1080, height: 1920 },
  { id: "square", label: "Square 1:1", detail: "1080 × 1080 MP4 · Instagram, LinkedIn feed", width: 1080, height: 1080 },
  { id: "portrait", label: "Instagram portrait 4:5", detail: "1080 × 1350 MP4 · Instagram feed", width: 1080, height: 1350 },
] as const;
export type VideoPresetId = (typeof VIDEO_PRESETS)[number]["id"];
/** "All 3 sizes": one video for YouTube, Shorts / Reels and square feeds, queued together. */
export const SOCIAL_SET: VideoPresetId[] = ["youtube", "shorts", "square"];
export const videoPreset = (id: string) => VIDEO_PRESETS.find((p) => p.id === id);

/**
 * Every file format the export can make. MP4 (H.264) is the recommended one
 * (plays everywhere). The see-through (alpha) ones are just more formats: they
 * need a transparent project background. Pictures are the frame at the playhead.
 */
export const EXPORT_FORMATS = [
  { id: "mp4", group: "video", label: "MP4 (H.264)", short: "MP4", detail: "Plays everywhere: YouTube, Instagram, WhatsApp, phones, TVs", recommended: true },
  { id: "hevc", group: "video", label: "MP4 (H.265 / HEVC)", short: "HEVC MP4", detail: "Newer codec: iPhone, Mac, newer Android and TVs" },
  { id: "av1", group: "video", label: "MP4 (AV1)", short: "AV1 MP4", detail: "Newest codec. Chrome, Firefox, YouTube. Slower to make" },
  { id: "webm", group: "video", label: "WebM (VP9)", short: "WebM", detail: "For websites: Chrome, Edge, Firefox, Android" },
  { id: "prores", group: "video", label: "MOV (ProRes 422 HQ)", short: "ProRes", detail: "Very large, top quality, for Premiere, Final Cut, DaVinci" },
  { id: "webm-alpha", group: "alpha", label: "WebM (VP9 + alpha)", short: "WebM + alpha", detail: "See-through video for Chrome, Edge, Firefox, Android" },
  { id: "mov-alpha", group: "alpha", label: "MOV (HEVC + alpha)", short: "MOV + alpha", detail: "See-through video for Safari, iPhone, iPad" },
  { id: "pack", group: "alpha", label: "Website pack (VP9 + HEVC alpha)", short: "website pack", detail: "Both files above + a poster + embed code, in one zip" },
  { id: "prores4444", group: "alpha", label: "MOV (ProRes 4444 + alpha)", short: "ProRes 4444", detail: "See-through master for video editing (very large)" },
  { id: "gif", group: "image", label: "GIF (animated)", short: "GIF", detail: "Short loops for chats and slides. No sound, 15 fps, up to 640 px wide" },
  { id: "png", group: "image", label: "PNG picture", short: "PNG", detail: "The frame at the playhead. Keeps see-through parts" },
  { id: "jpg", group: "image", label: "JPG picture", short: "JPG", detail: "The frame at the playhead, a small file" },
  { id: "mp3", group: "audio", label: "MP3", short: "MP3", detail: "Sound only. Podcasts, music players, WhatsApp" },
  { id: "m4a", group: "audio", label: "M4A (AAC)", short: "M4A", detail: "Sound only. Apple devices; small and clear" },
  { id: "wav", group: "audio", label: "WAV", short: "WAV", detail: "Sound only, uncompressed, for audio editing" },
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];
export const FORMAT_IDS = EXPORT_FORMATS.map((f) => f.id) as [ExportFormat, ...ExportFormat[]];
export const DEFAULT_FORMAT: ExportFormat = "mp4";
export const FORMAT_GROUPS = [
  { id: "video", label: "Video" },
  { id: "alpha", label: "See-through video (alpha)" },
  { id: "image", label: "Animation and picture" },
  { id: "audio", label: "Sound only" },
] as const;
export const formatOf = (id: string) => EXPORT_FORMATS.find((f) => f.id === id);
export const isFormat = (v: unknown): v is ExportFormat => typeof v === "string" && FORMAT_IDS.includes(v as ExportFormat);
/** Needs a transparent project background. */
export const needsAlpha = (f: ExportFormat) => formatOf(f)?.group === "alpha";
export const isAudioFormat = (f: ExportFormat) => formatOf(f)?.group === "audio";
/** One picture: the frame at the playhead. */
export const isStillFormat = (f: ExportFormat) => f === "png" || f === "jpg";
/** A GIF gets big fast: short clips only. */
export const MAX_GIF_SECONDS = 30;

/** Why a format can't be made for this project right now (null = it can). */
export function formatBlocked(f: ExportFormat, p: { transparent: boolean; hasSound: boolean; duration: number }): string | null {
  if (needsAlpha(f) && !p.transparent) return "Needs a see-through project: set the background to Transparent (Project, or the Background panel).";
  if (isAudioFormat(f) && !p.hasSound) return "This timeline has no sound.";
  if (f === "gif" && p.duration > MAX_GIF_SECONDS) return `A GIF is for short clips (${MAX_GIF_SECONDS} s at most). This one is ${Math.round(p.duration)} s.`;
  return null;
}
