import { NextResponse } from "next/server";
import { createOAuthState, getGoogleAuthUrl, isGoogleOAuthConfigured, saveOAuthContext } from "@/lib/auth/google";
import { cleanReferralCode, safeNextPath } from "@/lib/auth/redirect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "google_oauth_not_configured",
        message: "Google OAuth is not configured on this server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
  // Google comes back to the site's own address (NEXT_PUBLIC_APP_URL): started on another one (www., 127.0.0.1),
  // the sign-in cookies would stay there and the callback couldn't check them. Start again on the right one.
  // (the browser's address: behind a proxy, the forwarded host; "moved" once at most, never a loop)
  const seenHost = (request.headers.get("x-forwarded-host") ?? host).split(",")[0]!.trim();
  if (new URL(baseUrl).host !== seenHost && !searchParams.has("moved")) {
    const params = new URLSearchParams(searchParams);
    params.set("moved", "1");
    return NextResponse.redirect(`${baseUrl}/api/auth/google?${params}`);
  }
  // carried through Google in a short-lived cookie; read back by the callback
  await saveOAuthContext({
    next: safeNextPath(searchParams.get("next"), "/"),
    ref: cleanReferralCode(searchParams.get("ref")),
  });

  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const state = await createOAuthState();
  const authUrl = getGoogleAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
