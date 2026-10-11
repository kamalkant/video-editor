import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
  TEMPLATE_VIDEO_CLIPS,
  TEMPLATE_AUDIO_TRACKS,
  type TemplateVideoClip,
  type TemplateAudioTrack,
} from "@/lib/templates/templateMediaAssets";
import { listUploads } from "@/lib/templates/custom";

export const runtime = "nodejs";

const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);

/**
 * List all template media and audio assets, combining static catalog assets
 * with any custom files saved in public/templates/media/ and public/templates/audio/.
 */
export async function GET() {
  const mediaDir = join(process.cwd(), "public/templates/media");
  const audioDir = join(process.cwd(), "public/templates/audio");

  const knownVideoFiles = new Set(TEMPLATE_VIDEO_CLIPS.map((c) => basename(c.url)));
  const knownAudioFiles = new Set(TEMPLATE_AUDIO_TRACKS.map((a) => a.fileName));

  const customClips: TemplateVideoClip[] = [];
  const customAudios: TemplateAudioTrack[] = [];

  try {
    const videoFiles = await readdir(mediaDir);
    for (const f of videoFiles) {
      if (f.startsWith(".") || knownVideoFiles.has(f)) continue;
      const ext = extname(f).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) continue;

      const base = basename(f, ext);
      const title = base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      customClips.push({
        id: `template-custom-${base}`,
        title,
        category: "Uploaded",
        url: `/templates/media/${f}`,
        thumbGradient: "from-blue-600 to-indigo-900",
        isCustom: true,
      });
    }
  } catch {
    // media dir may be empty or unreadable
  }

  try {
    const audioFiles = await readdir(audioDir);
    for (const f of audioFiles) {
      if (f.startsWith(".") || knownAudioFiles.has(f)) continue;
      const ext = extname(f).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;

      const base = basename(f, ext);
      const title = base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      customAudios.push({
        // (the same id the Audio library gives this file: lib/library broadcastItems)
        id: `broadcast-user-${createHash("sha1").update(f).digest("hex").slice(0, 10)}`,
        title,
        category: "Uploaded",
        mood: "Custom",
        url: `/templates/audio/${f}`,
        fileName: f,
        duration: 20,
        isCustom: true,
      });
    }
  } catch {
    // audio dir may be empty
  }

  // clips and sounds uploaded in the template pane (My Assets files: they work after a reload too)
  const uploaded = await listUploads().catch(() => []);
  const upClips: TemplateVideoClip[] = uploaded
    .filter((u) => u.upload.kind === "video")
    .map(({ meta }) => ({ id: `asset-${meta.id}`, assetId: meta.id, title: meta.fileName.replace(/\.[^/.]+$/, ""), category: "Uploaded", url: `/api/videos/${meta.id}/play`, thumbUrl: `/api/videos/${meta.id}/thumb`, thumbGradient: "from-blue-600 to-indigo-900", videoMeta: meta, isCustom: true }));
  const upAudios: TemplateAudioTrack[] = uploaded
    .filter((u) => u.upload.kind === "audio")
    .map(({ meta }) => ({ id: `upload-${meta.id}`, assetId: meta.id, title: meta.fileName.replace(/\.[^/.]+$/, ""), category: "Uploaded", mood: "Custom", url: `/api/videos/${meta.id}/play`, fileName: meta.fileName, duration: Math.round(meta.info.duration) || 20, audioMeta: meta, isCustom: true }));

  return Response.json({
    clips: [...upClips, ...customClips, ...TEMPLATE_VIDEO_CLIPS],
    audioTracks: [...upAudios, ...customAudios, ...TEMPLATE_AUDIO_TRACKS],
  });
}
