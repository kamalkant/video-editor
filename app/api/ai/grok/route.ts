import { NextResponse } from "next/server";
import { meteredAi } from "@/lib/ai/meter";
import { generateGrokMedia, GrokError, type GrokAspect, type GrokMediaType } from "@/lib/ai/grok";
import { jsonBody } from "@/lib/ai/http";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/ai/grok
 * Generate an image or video using xAI Grok Imagine.
 * Body: { prompt: string, type: "image" | "video", aspect?: "16:9" | "9:16" | "1:1" }
 */
async function handle(request: Request): Promise<Response> {
  const body = await jsonBody(request);
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return apiError(400, "empty_prompt", "Describe what you want Grok Imagine to create.");
  }

  const type: GrokMediaType = body.type === "video" ? "video" : "image";
  const aspect: GrokAspect = body.aspect === "9:16" || body.aspect === "1:1" ? body.aspect : "16:9";

  try {
    const meta = await generateGrokMedia({
      prompt: body.prompt,
      type,
      aspect,
    });
    return NextResponse.json({ ok: true, media: meta }, { status: 201 });
  } catch (err) {
    if (err instanceof GrokError) {
      return apiError(err.status, err.code, err.message);
    }
    return apiError(500, "grok_failed", (err as Error).message ?? "Grok Imagine generation failed.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("grok", "grok", () => handle(request));
}
