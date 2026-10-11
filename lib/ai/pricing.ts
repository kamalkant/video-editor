/**
 * What the Gemini features cost on the user's Google account (paid tier, from
 * ai.google.dev/gemini-api/docs/pricing). Every Gemini button shows its cost
 * before the click. Pure: used by the dialogs and the server.
 */

export const PRICES_CHECKED = "27 Sep 2026";

export type ImageQuality = "lite" | "standard" | "high";
export type VeoTier = "lite" | "fast" | "standard";
export type VeoResolution = "720p" | "1080p";
export type VeoSeconds = 4 | 6 | 8;

export const IMAGE_QUALITY: Record<ImageQuality, { label: string; detail: string; price: number; size: "1K" | "2K" }> = {
  lite: { label: "Quick", detail: "Lite model, 1K", price: 0.034, size: "1K" },
  standard: { label: "Good", detail: "Flash Image, 1K", price: 0.067, size: "1K" },
  high: { label: "Best", detail: "Flash Image, 2K", price: 0.101, size: "2K" },
};

/** Veo 3.1, per second of video (it always comes with sound). */
export const VEO_PRICE: Record<VeoTier, Record<VeoResolution, number>> = {
  lite: { "720p": 0.05, "1080p": 0.08 },
  fast: { "720p": 0.1, "1080p": 0.12 },
  standard: { "720p": 0.4, "1080p": 0.4 },
};
export const VEO_TIERS: { id: VeoTier; label: string; detail: string }[] = [
  { id: "lite", label: "Lite", detail: "Cheapest, a little softer" },
  { id: "fast", label: "Fast", detail: "Good quality, quicker" },
  { id: "standard", label: "Standard", detail: "Best quality" },
];
/** Where the Generate Video dialog starts. A placeholder until the user picks their default. */
export const VEO_DEFAULT: { tier: VeoTier; resolution: VeoResolution; seconds: VeoSeconds } = { tier: "fast", resolution: "720p", seconds: 8 };

/** Speech in: about $0.005 a minute. Text out is tiny. */
const TRANSCRIBE_PER_MIN = 0.005;
/** Voice out: $18 per million audio tokens, about 32 tokens a second of speech, about 15 letters a second. */
const TTS_PER_CHAR = (18 / 1_000_000) * (32 / 15);
/** Translating subtitles: text in and out, well under a cent for a few hundred lines. */
const TRANSLATE_PER_CHAR = (6 / 1_000_000) / 3;

export const costOf = {
  subtitles: (seconds: number) => (Math.max(seconds, 1) / 60) * TRANSCRIBE_PER_MIN,
  translate: (chars: number) => chars * TRANSLATE_PER_CHAR,
  image: (q: ImageQuality) => IMAGE_QUALITY[q].price,
  voice: (chars: number) => chars * TTS_PER_CHAR,
  video: (tier: VeoTier, resolution: VeoResolution, seconds: VeoSeconds) => VEO_PRICE[tier][resolution] * seconds,
};

/** "~$0.80", or "less than 1¢" for the tiny ones. */
export function money(usd: number): string {
  if (usd < 0.01) return "less than 1¢";
  return `~$${usd < 1 ? usd.toFixed(2) : usd.toFixed(2).replace(/\.00$/, "")}`;
}

/** Veo rules: 1080p is 8 seconds only. */
export const veoSecondsFor = (r: VeoResolution): VeoSeconds[] => (r === "1080p" ? [8] : [4, 6, 8]);
