import "server-only";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import { MEME_CATALOG, type MemeClipItem } from "./memeCatalog";
import { dataRoot } from "@/lib/dataRoot";

const CACHE_DIR = join(dataRoot(), "data", "cache", "memes");

const CATEGORY_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  comedy: { bg: "0x1c1917", accent: "0xf59e0b", text: "0xfef08a" },
  savage: { bg: "0x18181b", accent: "0xef4444", text: "0xfecaca" },
  shocked: { bg: "0x1e1b4b", accent: "0xa855f7", text: "0xf3e8ff" },
  dance: { bg: "0x042f2e", accent: "0x14b8a6", text: "0xccfbf1" },
  hollywood: { bg: "0x0f172a", accent: "0x3b82f6", text: "0xdbeafe" },
};

const BUNDLED_DIR = join(process.cwd(), "public", "library", "memes");

export async function ensureMemeVideo(meme: MemeClipItem): Promise<string> {
  const bundledPath = join(BUNDLED_DIR, `${meme.id}.mp4`);
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const cachedPath = join(CACHE_DIR, `${meme.id}.mp4`);

  if (existsSync(cachedPath)) {
    return cachedPath;
  }

  // Generate lightweight high-aesthetic video clip via FFmpeg
  const colors = CATEGORY_COLORS[meme.category] ?? { bg: "0x0f172a", accent: "0x3b82f6", text: "0xffffff" };
  const d = Math.max(1, Math.min(10, meme.duration || 3));

  // Escape special chars for drawtext
  const cleanTitle = meme.title.replace(/[:\\']/g, " ").slice(0, 40);
  const cleanDialogue = meme.dialogue.replace(/[:\\']/g, " ").slice(0, 60);
  const cleanActor = meme.actorOrShow.replace(/[:\\']/g, " ").slice(0, 40);

  const filter = [
    `color=c=${colors.bg}:s=1280x720:d=${d}`,
    `drawbox=x=80:y=80:w=1120:h=560:color=${colors.accent}@0.4:t=4`,
    `drawtext=text='${cleanTitle}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=180:box=1:boxcolor=black@0.6:boxborderw=10`,
    `drawtext=text='\\"${cleanDialogue}\\"':fontsize=54:fontcolor=0x${colors.text.replace("0x", "")}:x=(w-text_w)/2:y=320:box=1:boxcolor=black@0.7:boxborderw=12`,
    `drawtext=text='${cleanActor}':fontsize=32:fontcolor=0x94a3b8:x=(w-text_w)/2:y=460`,
  ].join(",");

  try {
    await runFfmpeg([
      "-f", "lavfi", "-i", filter,
      "-f", "lavfi", "-i", `sine=f=440:b=4:d=${d}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-shortest",
      "-movflags", "+faststart",
      "-y", cachedPath,
    ], { timeoutMs: 30_000 });
  } catch (err) {
    // Fallback without drawtext if font isn't configured
    await runFfmpeg([
      "-f", "lavfi", "-i", `color=c=${colors.bg}:s=1280x720:d=${d}`,
      "-f", "lavfi", "-i", `sine=f=520:d=${d}`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-shortest",
      "-movflags", "+faststart",
      "-y", cachedPath,
    ], { timeoutMs: 30_000 });
  }

  return cachedPath;
}

export function generateMemeSvg(meme: MemeClipItem): string {
  const cat = meme.category;
  const col = CATEGORY_COLORS[cat] ?? { bg: "0x0f172a", accent: "0x3b82f6", text: "0xffffff" };
  const hexBg = col.bg.replace("0x", "#");
  const hexAccent = col.accent.replace("0x", "#");
  const hexText = col.text.replace("0x", "#");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${hexBg}"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${hexAccent}"/>
        <stop offset="100%" stop-color="${hexText}"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <rect x="24" y="24" width="592" height="312" rx="16" fill="none" stroke="${hexAccent}" stroke-width="2" stroke-opacity="0.3"/>
    
    <!-- Category Badge -->
    <rect x="44" y="44" width="90" height="26" rx="6" fill="${hexAccent}" fill-opacity="0.2"/>
    <text x="89" y="61" fill="${hexAccent}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="0.5">${meme.category.toUpperCase()}</text>

    <!-- Duration Badge -->
    <rect x="526" y="44" width="70" height="26" rx="6" fill="#000000" fill-opacity="0.6"/>
    <text x="561" y="61" fill="#ffffff" font-family="system-ui, -apple-system, monospace" font-size="12" font-weight="600" text-anchor="middle">${meme.duration.toFixed(1)}s</text>

    <!-- Dialogue -->
    <text x="320" y="165" fill="${hexText}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" text-anchor="middle" filter="drop-shadow(0px 2px 8px rgba(0,0,0,0.8))">“${meme.dialogue}”</text>

    <!-- Title & Character -->
    <text x="320" y="225" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" text-anchor="middle">${meme.title}</text>
    <text x="320" y="258" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="400" text-anchor="middle">${meme.actorOrShow}</text>
  </svg>`;
}
