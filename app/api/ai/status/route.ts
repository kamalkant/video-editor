import { geminiState } from "@/lib/ai/gemini";

export const runtime = "nodejs";

/** Is Gemini set up? ("ready", "no-key", or "fake" in the browser tests). Never says anything about the key itself. */
export function GET() {
  return Response.json({ gemini: geminiState() }, { headers: { "Cache-Control": "no-store" } });
}
