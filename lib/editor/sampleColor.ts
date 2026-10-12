/**
 * Client-side color sampling and key detection.
 * Samples exact pixels directly from decoded video / image / canvas elements
 * in the browser without any server requests or video uploads.
 */

export type SampledKeyColor = {
  hex: string;
  looksLikeKey: boolean;
};

/** Is this RGB color a plausible green or blue screen color? (Matches lib/ffmpeg/key.ts) */
export function keyKind([r, g, b]: [number, number, number]): "green" | "blue" | null {
  if (g > r * 1.25 && g > b * 1.15 && g > 60) return "green";
  if (b > r * 1.25 && b > g * 1.1 && b > 60) return "blue";
  return null;
}

/** Does a color look like the key background? (Matches lib/ffmpeg/key.ts) */
export function looksLikeBackground(rgb: [number, number, number], detectedHex: string | null): boolean {
  const kind = keyKind(rgb);
  if (!kind) return false;
  if (!detectedHex) return true;
  const dh = detectedHex.replace(/^#/, "");
  const dr = parseInt(dh.slice(0, 2), 16);
  const dg = parseInt(dh.slice(2, 4), 16);
  const db = parseInt(dh.slice(4, 6), 16);
  return kind === keyKind([dr, dg, db]);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Samples the median color of a 5x5 patch around `point` directly from a client
 * HTMLVideoElement, HTMLImageElement, or HTMLCanvasElement in memory.
 */
export function sampleColorFromSource(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null,
  point: { x: number; y: number },
  box: { width: number; height: number },
  detectedHex: string | null = null,
): SampledKeyColor | null {
  if (!source) return null;
  const sw =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth
        : source.width;
  const sh =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight
        : source.height;
  if (!sw || !sh) return null;

  // Map preview coordinates to source dimensions
  const cx = Math.round((point.x / box.width) * sw);
  const cy = Math.round((point.y / box.height) * sh);

  const radius = 2; // 5x5 patch (radius 2)
  const size = radius * 2 + 1;
  const sx = Math.max(0, Math.min(sw - size, cx - radius));
  const sy = Math.max(0, Math.min(sh - size, cy - radius));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(source, sx, sy, size, size, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    const rVals: number[] = [];
    const gVals: number[] = [];
    const bVals: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      rVals.push(d[i]);
      gVals.push(d[i + 1]);
      bVals.push(d[i + 2]);
    }
    const r = median(rVals);
    const g = median(gVals);
    const b = median(bVals);
    const hex =
      "#" +
      [r, g, b]
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();

    return {
      hex,
      looksLikeKey: looksLikeBackground([r, g, b], detectedHex),
    };
  } catch {
    return null;
  }
}
