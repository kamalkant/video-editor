import { NextResponse } from "next/server";
import { exchangeGoogleCode, takeOAuthContext, verifyAndClearOAuthState } from "@/lib/auth/google";
import { cleanReferralCode, isAppUrl, safeNextTarget } from "@/lib/auth/redirect";
import { attributeReferral } from "@/lib/referrals/attribution";
import { getOrCreateReferralCode } from "@/lib/referrals/codes";
import { getUserWallet } from "@/lib/referrals/wallet";
import { setSessionCookie } from "@/lib/auth/session";
import { createSession } from "@/lib/db/sessions";
import { createUser, getUserByEmail, getUserByIdentity, linkIdentity, updateLastLogin } from "@/lib/db/users";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

  if (error) {
    console.warn("Google OAuth error from provider:", error);
    return NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/login?error=missing_oauth_params`);
  }

  // where the user was heading and who referred them (saved when the sign-in started)
  const ctx = await takeOAuthContext();
  const next = safeNextTarget(ctx.next, "/");
  const landing = isAppUrl(next) ? next : `${baseUrl}${next}`;
  const referralCode = cleanReferralCode(ctx.ref);

  // 1. Verify CSRF state token
  const isStateValid = await verifyAndClearOAuthState(state);
  if (!isStateValid) {
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_oauth_state`);
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const profile = await exchangeGoogleCode(code, redirectUri);

    // 2. Check if this Google sub is already linked to an account
    let user = getUserByIdentity("google", profile.sub);

    if (user) {
      if (user.status !== "active") {
        return NextResponse.redirect(`${baseUrl}/login?error=account_suspended`);
      }
      updateLastLogin(user.id);
      const session = createSession(user.id);
      await setSessionCookie(session.token);

      logAudit({
        actorId: user.id,
        action: "auth.google_login",
        target: user.id,
      });

      return NextResponse.redirect(landing);
    }

    // 3. Check if an account already exists with this email
    const existingUser = getUserByEmail(profile.email);

    if (existingUser) {
      if (existingUser.status !== "active") {
        return NextResponse.redirect(`${baseUrl}/login?error=account_suspended`);
      }

      // Safe Auto-Linking Rule:
      // Both sides must be verified: Google email is verified AND existing account email is verified
      if (profile.email_verified && existingUser.email_verified > 0) {
        linkIdentity(existingUser.id, "google", profile.sub);
        updateLastLogin(existingUser.id);
        const session = createSession(existingUser.id);
        await setSessionCookie(session.token);

        logAudit({
          actorId: existingUser.id,
          action: "auth.google_link_auto",
          target: existingUser.id,
          details: { provider: "google", email: profile.email },
        });

        return NextResponse.redirect(landing);
      } else {
        // Unverified email: require logging in with password first to confirm account ownership
        return NextResponse.redirect(
          `${baseUrl}/login?error=linking_requires_verification&email=${encodeURIComponent(profile.email)}`
        );
      }
    }

    // 4. Create new user account via Google
    const newUser = createUser({
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
      password: null,
      role: "user",
      status: "active",
      emailVerified: profile.email_verified,
    });

    linkIdentity(newUser.id, "google", profile.sub);

    // same onboarding as email signup: credit the referrer, give the new user their own code and wallet
    if (referralCode) {
      attributeReferral({
        code: referralCode,
        newUserId: newUser.id,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    }
    getOrCreateReferralCode(newUser.id);
    getUserWallet(newUser.id);

    const session = createSession(newUser.id);
    await setSessionCookie(session.token);

    logAudit({
      actorId: newUser.id,
      action: "user.signup_google",
      target: newUser.id,
      details: { email: profile.email, name: profile.name, referred: Boolean(referralCode) },
    });

    return NextResponse.redirect(landing);
  } catch (err: any) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_callback_failed`);
  }
}
