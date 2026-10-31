import { geminiState, isFake, type GeminiState } from "@/lib/ai/gemini";
import { listUserCredentials } from "@/lib/ai/user-keys";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Is Gemini set up? ("ready", "no-key", "off", or "fake" in the browser tests). Never says anything about the key itself.
 * Signed in, your own key decides: switched off in AI settings → "off"; without one, the site's key (paid with credits).
 */
export async function GET() {
  let state: GeminiState = geminiState();
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    const own = listUserCredentials(user.id).find((c) => c.provider === "gemini");
    if (own?.hasKey) state = !own.enabled ? "off" : isFake() ? "fake" : "ready";
  }
  return Response.json({ gemini: state }, { headers: { "Cache-Control": "no-store" } });
}
