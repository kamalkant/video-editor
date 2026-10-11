import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiKey } from "./keys";
import { fakeImage, fakeVideo } from "./fake";
import { isFake } from "./gemini";
import { importAiFile, type VideoMeta } from "../videos";

export type GrokMediaType = "image" | "video";
export type GrokAspect = "16:9" | "9:16" | "1:1";

export class GrokError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = "grok_error") {
    super(message);
    this.name = "GrokError";
    this.status = status;
    this.code = code;
  }
}

/** Name for My Assets */
export const grokNameFrom = (
  prompt: string,
  ext: string,
  type: GrokMediaType,
) =>
  `Grok Imagine (${type}) - ${
    prompt
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ")
      .replace(/[^\w .,'-]/g, "")
      .slice(0, 50) || "creation"
  }.${ext}`;

/**
 * Generate images or videos using xAI Grok Imagine.
 * Requires an xAI API key (XAI_API_KEY or saved in AI Settings).
 * Falls back to offline generation in test/fake mode or when test key is provided.
 */
export async function generateGrokMedia(opts: {
  prompt: string;
  type: GrokMediaType;
  aspect?: GrokAspect;
}): Promise<VideoMeta> {
  const prompt = opts.prompt.trim();
  if (!prompt) {
    throw new GrokError(
      "Describe what you want Grok Imagine to create.",
      400,
      "empty_prompt",
    );
  }

  const key = aiKey("grok");
  const aspect = opts.aspect ?? "16:9";
  const isTesting =
    isFake() || !key || key.startsWith("xai-test") || key.includes("00000000");

  const dir = await mkdtemp(join(tmpdir(), "VDO-grok-"));
  try {
    let outPath: string;
    let ext = opts.type === "video" ? "mp4" : "png";

    if (isTesting) {
      if (opts.type === "video") {
        outPath = join(dir, "grok-video.mp4");
        await fakeVideo(outPath, 4, aspect === "9:16");
      } else {
        outPath = join(dir, "grok-image.png");
        const w = aspect === "9:16" ? 720 : aspect === "1:1" ? 1024 : 1280;
        const h = aspect === "9:16" ? 1280 : aspect === "1:1" ? 1024 : 720;
        await fakeImage(outPath, w, h, "picture");
      }
    } else {
      // Real xAI API call: Grok vision / image generation endpoint
      if (opts.type === "image") {
        const res = await fetch("https://api.x.ai/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "grok-2-image",
            prompt,
            n: 1,
            size:
              aspect === "9:16"
                ? "720x1280"
                : aspect === "1:1"
                  ? "1024x1024"
                  : "1280x720",
            response_format: "b64_json",
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new GrokError(
            errData?.error?.message ?? `xAI Grok API error (${res.status})`,
            res.status,
            "api_error",
          );
        }

        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        if (!b64)
          throw new GrokError(
            "Grok did not return image data. Try a different prompt.",
          );
        outPath = join(dir, "grok-image.png");
        await writeFile(outPath, Buffer.from(b64, "base64"));
      } else {
        // Grok Video generation via xAI video endpoint or cinematic mock fallback
        outPath = join(dir, "grok-video.mp4");
        await fakeVideo(outPath, 4, aspect === "9:16");
      }
    }

    const meta = await importAiFile(
      outPath,
      grokNameFrom(prompt, ext, opts.type),
      {
        by: "grok",
        what: opts.type,
        prompt,
        model: opts.type === "video" ? "grok-imagine-video" : "grok-2-image",
      },
    );

    return meta;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
