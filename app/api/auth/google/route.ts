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
  // carried through Google in a short-lived cookie; read back by the callback
  await saveOAuthContext({
    next: safeNextPath(searchParams.get("next"), "/"),
    ref: cleanReferralCode(searchParams.get("ref")),
  });

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const state = await createOAuthState();
  const authUrl = getGoogleAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
