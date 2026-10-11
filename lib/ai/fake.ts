import "server-only";
import { runFfmpeg } from "../ffmpeg/run";
import type { Segment } from "../subtitles/segments";

/**
 * The pretend Gemini for the browser tests (GEMINI_FAKE=1): the same results
 * as the real one, made on this Mac with FFmpeg. Nothing goes to the network
 * and nothing costs money.
 */

const LINES = ["Hello and welcome to the news.", "Today we look at the weather in the city.", "It will be sunny in the morning and rainy in the evening.", "Thank you for watching, see you tomorrow."];

/** A phrase every 2.5 seconds (with a small pause) through the sound that was sent. */
export function fakeSegments(length: number): Segment[] {
  const out: Segment[] = [];
  for (let t = 0.3, i = 0; t + 0.8 < length; t += 2.5, i++) out.push({ start: t, end: Math.min(length, t + 2.1), text: LINES[i % LINES.length] });
  return out;
}

export const fakeTranslate = (lines: string[], to: string) => lines.map((l) => `[${to}] ${l}`);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A drawn picture at that shape (a gradient with a white box, so tests can see it). */
export async function fakeImage(out: string, width: number, height: number, purpose: "picture" | "background") {
  await wait(300);
  const col = purpose === "background" ? "0x1d4ed8" : "0xdb2777";
  await runFfmpeg(["-f", "lavfi", "-i", `color=c=${col}:s=${width}x${height}:d=1`, "-vf", `drawbox=x=iw/3:y=ih/3:w=iw/3:h=ih/3:color=white@1:t=fill`, "-frames:v", "1", "-y", out], { timeoutMs: 30_000 });
}

/** Speech: a soft tone, about as long as reading the text would take. */
export async function fakeSpeech(out: string, text: string) {
  const d = Math.min(30, Math.max(1, text.length / 15));
  await runFfmpeg(["-f", "lavfi", "-i", `sine=f=330:d=${d.toFixed(2)}`, "-af", "volume=0.3", "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", "-y", out], { timeoutMs: 30_000 });
}

/** A Veo clip: a test pattern with sound, at that shape and length. */
export async function fakeVideo(out: string, seconds: number, portrait: boolean) {
  const s = portrait ? "720x1280" : "1280x720";
  await runFfmpeg(["-f", "lavfi", "-i", `testsrc2=s=${s}:r=24:d=${seconds}`, "-f", "lavfi", "-i", `sine=f=440:d=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", "-y", out], { timeoutMs: 60_000 });
}

export type FakeHighlight = {
  id: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  viralityScore: number;
  category: "hook" | "insight" | "story" | "climax" | "reaction" | "qa";
  summary: string;
  quote: string;
  energyLevel: "high" | "medium" | "moderate";
};

/** Realistic highlights mock for tests and offline usage. */
export function fakeHighlights(length: number): FakeHighlight[] {
  const d = Math.max(10, length);
  const h1Len = Math.min(30, Math.max(5, d * 0.2));
  const h2Len = Math.min(45, Math.max(8, d * 0.25));
  const h3Len = Math.min(35, Math.max(6, d * 0.2));

  const start1 = Math.round(d * 0.05 * 10) / 10;
  const start2 = Math.round(d * 0.35 * 10) / 10;
  const start3 = Math.round(d * 0.65 * 10) / 10;

  return [
    {
      id: "hl-1",
      title: "The Core Revelation",
      start: start1,
      end: Math.min(d, Math.round((start1 + h1Len) * 10) / 10),
      duration: Math.round(h1Len * 10) / 10,
      viralityScore: 96,
      category: "hook",
      summary: "High-energy opening hook explaining the biggest mistake and main insight.",
      quote: "Hello and welcome to the news.",
      energyLevel: "high",
    },
    {
      id: "hl-2",
      title: "Key Practical Strategy",
      start: start2,
      end: Math.min(d, Math.round((start2 + h2Len) * 10) / 10),
      duration: Math.round(h2Len * 10) / 10,
      viralityScore: 89,
      category: "insight",
      summary: "Deep dive into actionable principles and unexpected findings.",
      quote: "Today we look at the weather in the city.",
      energyLevel: "medium",
    },
    {
      id: "hl-3",
      title: "Climactic Takeaway",
      start: start3,
      end: Math.min(d, Math.round((start3 + h3Len) * 10) / 10),
      duration: Math.round(h3Len * 10) / 10,
      viralityScore: 92,
      category: "climax",
      summary: "Powerful concluding summary delivering the final takeaway.",
      quote: "Thank you for watching, see you tomorrow.",
      energyLevel: "high",
    },
  ];
}
