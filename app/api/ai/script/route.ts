import { aiError, jsonBody } from "@/lib/ai/http";
import { meteredAi } from "@/lib/ai/meter";
import { findTexts, interact, isFake, pickModel } from "@/lib/ai/gemini";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ✦ Gemini Voiceover Script Assistant:
 * Generates natural narration scripts, polishes pacing for teleprompter,
 * and translates voiceover scripts into 20+ languages.
 */
async function handle(request: Request): Promise<Response> {
  const b = await jsonBody(request);
  if (!b) return apiError(400, "bad_request", "Provide script parameters.");

  const action = (typeof b.action === "string" ? b.action : "generate") as "generate" | "polish" | "translate";
  const topic = typeof b.topic === "string" ? b.topic.trim().slice(0, 1000) : "";
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 5000) : "";
  const tone = typeof b.tone === "string" && b.tone.trim() ? b.tone.trim() : "conversational and engaging";
  const targetLanguage = typeof b.targetLanguage === "string" ? b.targetLanguage.trim() : "English";
  const seconds = typeof b.seconds === "number" && b.seconds > 0 ? Math.min(b.seconds, 300) : 15;
  const targetWords = Math.round(seconds * 2.3);

  if (action === "generate" && !topic && !text) {
    return apiError(400, "empty", "Tell Gemini what your voiceover is about.");
  }
  if ((action === "polish" || action === "translate") && !text) {
    return apiError(400, "empty", "Provide the script text first.");
  }

  if (isFake()) {
    if (action === "translate") {
      return Response.json({
        script: `[${targetLanguage} Translation] ${text}`,
        wordCount: text.split(/\s+/).length,
        language: targetLanguage,
      });
    }
    const sampleScript =
      action === "polish"
        ? text.replace(/\s+/g, " ").trim() + " Welcome to our story today."
        : `Welcome to this video! Today, we're diving into ${topic || "an exciting journey"}. Notice the vibrant details and smooth pacing. Stay tuned until the very end for an unforgettable reveal!`;
    return Response.json({
      script: sampleScript,
      wordCount: sampleScript.split(/\s+/).length,
      estimatedDurationSec: Math.round(sampleScript.split(/\s+/).length / 2.3),
    });
  }

  try {
    const model = await pickModel("text");
    let instruction = "";

    if (action === "translate") {
      instruction = `You are a professional voiceover translator and localization expert.
Translate the following voiceover narration into natural, spoken ${targetLanguage}.
Keep the emotional tone intact and ensure phrasing rolls off the tongue naturally when read aloud.
Output ONLY the translated script text with no notes, explanations, or quotes.

Source text:
${text}`;
    } else if (action === "polish") {
      instruction = `You are an elite voiceover coach and script editor.
Polish this narration script for optimal spoken delivery. Improve flow, natural pauses, and cadence for a ${tone} tone.
Keep the core message, but make it sound effortless and compelling when spoken aloud.
Output ONLY the polished script with no markdown headings, explanations, or quotes.

Script to polish:
${text}`;
    } else {
      instruction = `You are an award-winning voiceover scriptwriter for video productions.
Write a crisp, engaging spoken voiceover narration about: "${topic || text}".
Target duration: approximately ${seconds} seconds (aim for about ${targetWords} words).
Tone: ${tone}.
Make it punchy, conversational, and designed specifically for spoken delivery with natural pauses.
Do NOT include stage directions like [Music starts] or (Pause). Output ONLY the spoken voiceover script.`;
    }

    const j = await interact({
      model,
      input: [{ type: "text", text: instruction }],
      generation_config: { temperature: 0.7, max_output_tokens: 800 },
    });

    const texts = findTexts(j);
    const script = texts[0]?.trim() || (action === "polish" ? text : topic);
    const cleanedScript = script.replace(/^["']|["']$/g, "").trim();
    const wordCount = cleanedScript.split(/\s+/).filter(Boolean).length;

    return Response.json({
      script: cleanedScript,
      wordCount,
      estimatedDurationSec: Math.max(1, Math.round(wordCount / 2.3)),
      language: targetLanguage,
    });
  } catch (err) {
    return aiError(err, "Couldn't generate the script.");
  }
}

/** Signed-in users only; costs AI credits unless the user has their own key (lib/ai/meter). */
export async function POST(request: Request) {
  return meteredAi("script", "gemini", () => handle(request));
}
