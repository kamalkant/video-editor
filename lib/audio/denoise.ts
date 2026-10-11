/**
 * "Remove background noise": FFmpeg's FFT denoiser (afftdn), which learns the
 * noise as it goes. Light is safe for most speech; strong also cuts rumble.
 * "Studio voice" is the one-click fix for phone recordings: rumble and hiss cut, noise
 * removed, the voice compressed and evened out (quiet words come up), a little presence
 * for clarity, and a limiter so it never clips.
 * The export (compose) and the preview's cleaned sound use the same chain.
 */
export type DenoiseLevel = "light" | "strong" | "studio";
export const DENOISE: Record<DenoiseLevel, string> = {
  light: "afftdn=nr=12:nf=-50:tn=1",
  strong: "highpass=f=80,afftdn=nr=24:nf=-42:tn=1",
  studio:
    "highpass=f=80,lowpass=f=14000,afftdn=nr=18:nf=-45:tn=1," +
    "acompressor=threshold=0.1:ratio=3:attack=10:release=200:makeup=2," +
    "equalizer=f=3000:t=q:w=1:g=3,dynaudnorm=f=200:g=15:p=0.9:m=10,alimiter=limit=0.95",
};
export const isDenoiseLevel = (v: unknown): v is DenoiseLevel => v === "light" || v === "strong" || v === "studio";
