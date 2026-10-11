import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { findTexts, interact, isFake, pickModel } from "@/lib/ai/gemini";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ✦ Gemini Prompt Enhancer: turns a simple idea into a rich, detailed,
 * production-ready prompt optimized for image or video generation.
 */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b || typeof b.prompt !== "string" || !b.prompt.trim()) {
    return apiError(400, "empty", "Provide an idea to enhance.");
  }
  const prompt = b.prompt.trim().slice(0, 1000);
  const type = typeof b.type === "string" ? b.type : "image";
  const style = typeof b.style === "string" && b.style.trim() ? b.style.trim() : "";

  if (isFake()) {
    const fakeEnhanced =
      type === "video"
        ? `Cinematic smooth camera motion, ${prompt}, ultra-detailed 8K resolution, dynamic volumetric lighting, award-winning cinematography, photorealistic.`
        : type === "audio"
          ? `Crystal clear audio recording of ${prompt}, high fidelity acoustic sound design, subtle ambient reverb, studio mastered.`
          : `A breathtaking, highly detailed visual of ${prompt}, studio lighting, masterwork composition, crisp 8k textures, natural depth of field${style ? `, styled as ${style}` : ""}.`;
    return Response.json({ enhanced: fakeEnhanced, original: prompt });
  }

  try {
    const model = await pickModel("text");
    const instruction =
      type === "video"
        ? `You are an expert video director creating prompts for Google Veo. Expand this video concept into an evocative, cinematic prompt (1-3 sentences). Specify camera motion, subject action, atmosphere, and lighting. Do not add conversational fluff or quotes. Output ONLY the enhanced prompt.\n\nIdea: ${prompt}${style ? `\nPreferred style: ${style}` : ""}`
        : type === "audio"
          ? `You are an expert sound designer and voice director. Expand this audio or narration concept into an evocative prompt for speech or sound design (1-2 sentences). Do not add conversational fluff or quotes. Output ONLY the enhanced prompt.\n\nIdea: ${prompt}`
          : `You are an expert AI prompt engineer for Google Imagen. Expand this concept into a stunning, detailed visual prompt (1-3 sentences) with precise descriptors of lighting, atmosphere, materials, composition, and mood. Do not add conversational fluff or quotes. Output ONLY the enhanced prompt.\n\nIdea: ${prompt}${style ? `\nPreferred style: ${style}` : ""}`;

    const j = await interact({
      model,
      input: [{ type: "text", text: instruction }],
      generation_config: { temperature: 0.7, max_output_tokens: 300 },
    });

    const texts = findTexts(j);
    const enhanced = texts[0]?.trim() || prompt;
    return Response.json({ enhanced: enhanced.replace(/^["']|["']$/g, "").trim(), original: prompt });
  } catch (err) {
    return aiError(err, "Couldn't enhance the prompt.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("script", "gemini", () => handle(request));
}
