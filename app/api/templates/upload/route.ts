import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { apiError } from "@/lib/http/errors";
import { importFile } from "@/lib/videos";
import { ProbeError } from "@/lib/ffmpeg/probe";
import { VIDEO_EXTS } from "@/lib/api/upload";
import { LIMITS, limitSizeLabel } from "@/lib/settings";
import { rememberUpload } from "@/lib/templates/custom";
import { requireUser } from "@/lib/auth/requireUser";

const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "ogg", "opus"];

export const runtime = "nodejs";

/**
 * Upload an audio track or video clip from Templates:
 * 1. Saves permanently to public/templates/media (for video) or public/templates/audio (for audio).
 * 2. Imports into Studio Assets (storage/videos/<id>) so it has full FFmpeg probe metadata and a real thumbnail.
 * 3. Returns the persistent URL, thumbnail URL, and VideoMeta.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string | null) ?? "video";
    const customTitle = formData.get("title") as string | null;

    if (!file) {
      return apiError(400, "bad_request", "No file uploaded.");
    }
    // only videos (or sounds) of the kinds every upload takes, within the size limit
    const okExt = (type === "audio" ? AUDIO_EXTS : VIDEO_EXTS).includes(
      extname(file.name).slice(1).toLowerCase(),
    );
    if (!okExt)
      return apiError(
        415,
        "unsupported_type",
        type === "audio"
          ? "Use a sound: MP3, WAV, M4A, AAC, OGG or Opus."
          : "Use a video: MP4, MOV, WebM, M4V, MKV or AVI.",
      );
    if (file.size > LIMITS.maxUploadBytes)
      return apiError(
        413,
        "too_big",
        `This file is too big. The limit is ${limitSizeLabel()}.`,
      );

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext =
      extname(file.name).toLowerCase() || (type === "audio" ? ".mp3" : ".mp4");
    const baseClean =
      basename(file.name, ext)
        .replace(/[^\w-]/g, "_")
        .slice(0, 40) || "clip";

    const subDir = type === "audio" ? "audio" : "media";
    const publicDir = join(process.cwd(), "public/templates", subDir);
    await mkdir(publicDir, { recursive: true });

    let uniqueFileName = `${baseClean}${ext}`;
    if (existsSync(join(publicDir, uniqueFileName))) {
      uniqueFileName = `${baseClean}-${Date.now().toString().slice(-4)}${ext}`;
    }

    const permanentFilePath = join(publicDir, uniqueFileName);
    await writeFile(permanentFilePath, buffer);

    // Save a copy to tmp to pass to importFile (which moves it into storage/videos/<id>)
    const tmpDir = join(tmpdir(), `VDO-upload-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmpFilePath = join(tmpDir, uniqueFileName);
    await writeFile(tmpFilePath, buffer);

    const title = customTitle || file.name.replace(/\.[^/.]+$/, "");
    let videoMeta;
    try {
      videoMeta = await importFile(tmpFilePath, `${title}${ext}`);
    } catch (err) {
      // not a usable file: don't leave it in public/
      await rm(permanentFilePath, { force: true });
      await rm(tmpDir, { recursive: true, force: true });
      if (err instanceof ProbeError)
        return apiError(422, err.code, err.message);
      throw err;
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    // remembered (and kept by the clean-up), so it's listed with its file after a reload
    await rememberUpload(
      videoMeta.id,
      type === "audio" ? "audio" : "video",
    ).catch(() => undefined);

    const publicUrl = `/templates/${subDir}/${uniqueFileName}`;
    const thumbUrl = `/api/videos/${videoMeta.id}/thumb`;

    if (type === "audio") {
      const audioId = `broadcast-user-${createHash("sha1").update(uniqueFileName).digest("hex").slice(0, 10)}`;
      return Response.json(
        {
          success: true,
          type: "audio",
          id: audioId,
          assetId: videoMeta.id,
          title,
          category: "Uploaded",
          mood: "Custom",
          url: publicUrl,
          fileName: uniqueFileName,
          duration: Math.round(videoMeta.info?.duration || 20),
          thumbUrl,
          audioMeta: videoMeta,
          isCustom: true,
        },
        { status: 201 },
      );
    }

    return Response.json(
      {
        success: true,
        type: "video",
        id: `template-v-${videoMeta.id}`,
        assetId: videoMeta.id,
        title,
        category: "Uploaded",
        url: publicUrl,
        thumbUrl,
        duration: Math.round(videoMeta.info?.duration || 20),
        aspectRatio:
          (videoMeta.info?.width || 1920) > (videoMeta.info?.height || 1080)
            ? "16:9"
            : (videoMeta.info?.width || 1080) < (videoMeta.info?.height || 1920)
              ? "9:16"
              : "1:1",
        thumbGradient: "from-blue-700 to-indigo-950",
        videoMeta,
        isCustom: true,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Template media upload error:", err);
    return apiError(
      500,
      "server_error",
      "Failed to upload and process template media.",
    );
  }
}
