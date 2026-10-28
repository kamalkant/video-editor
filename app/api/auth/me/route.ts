import { cookies } from "next/headers";
import { getCurrentUser, setSessionCookie } from "@/lib/auth/session";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/sessionCookie";
import { ssoUrl } from "@/lib/auth/sso";
import { getComputedFeaturesForUser } from "@/lib/db/features";

export const runtime = "nodejs";

/**
 * Other ViPlay apps (photo.viplay.in, …) ask the browser for the signed-in user here: the shared session
 * cookie goes along (same site), and only their https origins may read the answer.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !ssoUrl(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Max-Age": "600" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const features = getComputedFeaturesForUser(user);

  // signed in before single sign-on (a host-only cookie): move the session to the shared cookie, so the
  // other apps see it too, without signing anyone out
  if (user) {
    const store = await cookies();
    const legacy = store.get(LEGACY_SESSION_COOKIE_NAME)?.value;
    if (legacy && !store.get(SESSION_COOKIE_NAME)) await setSessionCookie(legacy);
  }

  return Response.json(
    {
      user,
      features,
    },
    { headers: { ...corsHeaders(request), "Cache-Control": "no-store" } },
  );
}
