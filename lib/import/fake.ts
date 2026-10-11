import "server-only";
import { runFfmpeg } from "../ffmpeg/run";
import type { ImportItem, ImportSource, SearchPage } from "./types";

/**
 * Pretend libraries for the browser tests (IMPORT_FAKE=1): the same results
 * as the real ones, with pictures and clips made by FFmpeg. No network.
 */

export const isImportFake = () => process.env.IMPORT_FAKE === "1";

const COLORS = ["0x1d4ed8", "0x059669", "0xdb2777", "0xd97706", "0x7c3aed", "0x0891b2"];

export function fakeSearch(source: ImportSource, q: string, page: number): SearchPage {
  const items: ImportItem[] = Array.from({ length: 6 }, (_, i) => {
    const n = (page - 1) * 6 + i + 1;
    return {
      source,
      id: source === "youtube" ? `fakeVid${String(n).padStart(4, "0")}` : String(1000 + n),
      title: `${q || "Clip"} ${n}`,
      thumb: `/api/import/thumb?fake=${COLORS[n % COLORS.length]}`,
      duration: 4 + (n % 3),
      width: 1280,
      height: 720,
      author: `${source} author ${n}`,
      authorUrl: null,
      pageUrl: `https://example.invalid/${source}/${n}`,
      // on YouTube, every second one is Creative Commons
      license: source === "youtube" ? (n % 2 ? "cc" : "youtube") : "free",
    };
  });
  return { items, next: page < 2 ? String(page + 1) : null };
}

export function fakeItem(source: ImportSource, id: string): ImportItem {
  const n = source === "youtube" ? Number(id.replace(/\D/g, "")) : Number(id) - 1000;
  const page = Math.floor((n - 1) / 6) + 1;
  return fakeSearch(source, "", page).items[(n - 1) % 6] ?? fakeSearch(source, "", 1).items[0];
}

/** A small picture of one color (the fake thumbnails). */
export async function fakeThumb(color: string): Promise<Buffer> {
  const c = /^0x[0-9a-f]{6}$/i.test(color) ? color : "0x334155";
  return (await runFfmpeg(["-f", "lavfi", "-i", `color=c=${c}:s=320x180:d=1`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { collectStdout: true, timeoutMs: 20_000 })).stdout;
}

/** The "download": a short test clip with sound. */
export async function fakeClip(out: string, seconds: number) {
  await runFfmpeg(["-f", "lavfi", "-i", `testsrc2=s=1280x720:r=25:d=${seconds}`, "-f", "lavfi", "-i", `sine=f=520:d=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", "-y", out], { timeoutMs: 60_000 });
}
