/** Picture and video shapes the Gemini models accept, matched to the project. Pure. */

export const IMAGE_ASPECTS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];
export const isImageAspect = (v: unknown): v is ImageAspect => IMAGE_ASPECTS.includes(v as ImageAspect);

const ratio = (a: string) => {
  const [w, h] = a.split(":").map(Number);
  return w / h;
};

/** The supported shape closest to width × height (compared on a log scale, so 9:16 and 16:9 are equally far from 1:1). */
export function nearestImageAspect(width: number, height: number): ImageAspect {
  const r = Math.log(width / Math.max(1, height));
  let best: ImageAspect = "16:9";
  for (const a of IMAGE_ASPECTS) if (Math.abs(Math.log(ratio(a)) - r) < Math.abs(Math.log(ratio(best)) - r)) best = a;
  return best;
}

/** Pixel size of a picture of that shape, the long side `long` pixels (even numbers). */
export function pixelsOf(aspect: ImageAspect, long: number): { width: number; height: number } {
  const r = ratio(aspect);
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return r >= 1 ? { width: even(long), height: even(long / r) } : { width: even(long * r), height: even(long) };
}

/** Veo makes 16:9 or 9:16: tall projects get 9:16, the rest 16:9. */
export const veoAspectFor = (width: number, height: number): "16:9" | "9:16" => (height > width ? "9:16" : "16:9");
