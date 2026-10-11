import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IMAGE_QUALITY, type ImageQuality } from "./pricing";
import { pixelsOf, type ImageAspect } from "./shapes";
import { fakeImage } from "./fake";
import { findBlobs, GeminiError, interact, isFake, pickModel } from "./gemini";
import {
  getVideo,
  importAiFile,
  kindOf,
  sourcePath,
  type VideoMeta,
} from "../videos";

export type ImagePurpose = "picture" | "background";
export const MAX_PROMPT = 2000;

const BACKGROUND_HINT =
  "A background scene for a video: an empty place with no people and no text or logos, with room in the middle for a presenter standing in front. Photographic, well lit, a little soft in the distance.";

/** A name for My Assets from the first words of the prompt. */
export const nameFrom = (prompt: string, ext: string) =>
  `Gemini - ${
    prompt
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ")
      .replace(/[^\w .,'-]/g, "")
      .slice(0, 60) || "picture"
  }.${ext}`;

/**
 * A picture from a description (or an edited copy of `fromId`, a picture in My
 * Assets). Sends only the words (and that picture) to Google. It lands in My Assets.
 */
export async function generateImage(o: {
  prompt: string;
  purpose: ImagePurpose;
  aspect: ImageAspect;
  quality: ImageQuality;
  fromId?: string | null;
}): Promise<VideoMeta> {
  const prompt = o.prompt.trim().slice(0, MAX_PROMPT);
  if (!prompt)
    throw new GeminiError("Describe the picture first.", 400, "empty");
  const dir = await mkdtemp(join(tmpdir(), "VDO-img-"));
  try {
    const q = IMAGE_QUALITY[o.quality];
    let out: string;
    let model = "fake";
    if (isFake()) {
      out = join(dir, "image.png");
      const px = pixelsOf(o.aspect, q.size === "2K" ? 2048 : 1024);
      await fakeImage(out, px.width, px.height, o.purpose);
    } else {
      model = await pickModel(o.quality === "lite" ? "image-lite" : "image");
      const input: unknown[] = [
        {
          type: "text",
          text:
            o.purpose === "background"
              ? `${BACKGROUND_HINT}\n\nThe scene: ${prompt}`
              : prompt,
        },
      ];
      if (o.fromId) {
        const src = await getVideo(o.fromId);
        if (!src || kindOf(src) !== "image")
          throw new GeminiError("Pick a picture to change.", 400, "bad_source");
        const mime = /\.jpe?g$/i.test(src.fileName)
          ? "image/jpeg"
          : /\.webp$/i.test(src.fileName)
            ? "image/webp"
            : "image/png";
        input.push({
          type: "image",
          mime_type: mime,
          data: (await readFile(sourcePath(src.id))).toString("base64"),
        });
      }
      const j = await interact({
        model,
        input,
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: o.aspect,
          image_size: q.size,
        },
      });
      const img = findBlobs(j, "image/")[0];
      if (!img)
        throw new GeminiError(
          "Gemini didn't send a picture back. Try other words.",
        );
      out = join(
        dir,
        img.mime === "image/jpeg"
          ? "image.jpg"
          : img.mime === "image/webp"
            ? "image.webp"
            : "image.png",
      );
      await writeFile(out, Buffer.from(img.data, "base64"));
    }
    return await importAiFile(
      out,
      nameFrom(prompt, out.split(".").pop() ?? "png"),
      {
        by: "gemini",
        what: o.purpose === "background" ? "background" : "image",
        prompt,
        model,
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
